document.addEventListener('DOMContentLoaded', () => {
    let rootDirHandle = null;
    let worksDirHandle = null;
    let jsDirHandle = null;
    let currentFolderHandle = null;
    let currentWorkData = null;

    const btnOpenDir = document.getElementById('btn-open-dir');
    const worksListEl = document.getElementById('works-list');
    const editorEmpty = document.getElementById('editor-empty');
    const editorForm = document.getElementById('editor-form');
    const currentFolderNameEl = document.getElementById('current-folder-name');
    const btnSave = document.getElementById('btn-save');
    const btnSaveOrder = document.getElementById('btn-save-order');
    const btnNewWork = document.getElementById('btn-new-work');
    const btnCopyWork = document.getElementById('btn-copy-work');
    const btnRenameFolder = document.getElementById('btn-rename-folder');
    const btnDeleteFolder = document.getElementById('btn-delete-folder');

    // Form elements
    const inputPublic = document.getElementById('work-public');
    const inputId = document.getElementById('work-id');
    const inputTitle = document.getElementById('work-title');
    const inputSummary = document.getElementById('work-summary');
    const inputDesc = document.getElementById('work-description');
    
    // Tags elements
    const tagsList = document.getElementById('tags-list');
    const tagInput = document.getElementById('tag-input');
    const tagSuggestions = document.getElementById('tag-suggestions');
    
    const linksContainer = document.getElementById('links-container');
    const btnAddLink = document.getElementById('btn-add-link');
    const tplLink = document.getElementById('tpl-link-item');

    const mediaContainer = document.getElementById('media-container');
    const tplMedia = document.getElementById('tpl-media-item');

    // Initialize SortableJS for reordering
    if (typeof Sortable !== 'undefined') {
        new Sortable(linksContainer, {
            handle: '.drag-handle',
            animation: 150,
            ghostClass: 'sortable-ghost'
        });

        new Sortable(mediaContainer, {
            handle: '.drag-handle',
            animation: 150,
            ghostClass: 'sortable-ghost',
            filter: '.new-media-item',
            preventOnFilter: false
        });

        // Initialize SortableJS for Works List
        new Sortable(worksListEl, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: () => {
                btnSaveOrder.disabled = false;
            }
        });
    }

    async function checkExistingSession() {
        if (typeof idbKeyval === 'undefined') {
            btnOpenDir.onclick = openNewSession;
            return;
        }
        try {
            const storedHandle = await idbKeyval.get('rootDirHandle');
            if (storedHandle) {
                const permission = await storedHandle.queryPermission({ mode: 'readwrite' });
                if (permission === 'granted') {
                    await initEditorWithHandle(storedHandle);
                } else {
                    btnOpenDir.textContent = 'Resume Previous Session';
                    btnOpenDir.onclick = async () => {
                        try {
                            const newPerm = await storedHandle.requestPermission({ mode: 'readwrite' });
                            if (newPerm === 'granted') {
                                await initEditorWithHandle(storedHandle);
                            } else {
                                openNewSession();
                            }
                        } catch(e) {
                            openNewSession();
                        }
                    };
                    return;
                }
            }
        } catch (e) {
            console.error('Failed to restore session', e);
        }
        btnOpenDir.onclick = openNewSession;
    }

    async function openNewSession() {
        try {
            const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
            if (typeof idbKeyval !== 'undefined') {
                await idbKeyval.set('rootDirHandle', handle);
            }
            await initEditorWithHandle(handle);
        } catch (err) {
            console.error(err);
            if (err.name !== 'AbortError') {
                alert('フォルダのオープンに失敗しました: ' + err.message + '\n「whatwatbox.github.io」フォルダ（ルートフォルダ）を選択してください。');
            }
        }
    }

    async function initEditorWithHandle(handle) {
        try {
            rootDirHandle = handle;
            const assetsHandle = await rootDirHandle.getDirectoryHandle('assets');
            worksDirHandle = await assetsHandle.getDirectoryHandle('works');
            jsDirHandle = await rootDirHandle.getDirectoryHandle('js');
            
            btnSaveOrder.disabled = false;
            btnNewWork.disabled = false;
            btnCopyWork.disabled = false;
            btnDeleteFolder.disabled = false;
            btnOpenDir.textContent = 'Connected';
            btnOpenDir.classList.remove('primary');
            btnOpenDir.classList.add('outline');
            await loadWorksList();
            
            // Auto-select last opened work
            const lastOpened = localStorage.getItem('lastOpenedWork');
            if (lastOpened) {
                const items = document.querySelectorAll('.work-item');
                for (const item of items) {
                    if (item.dataset.name === lastOpened) {
                        item.click();
                        break;
                    }
                }
            }
        } catch (e) {
            console.error('Init error', e);
            alert('フォルダ構造が正しくありません。ルートフォルダ(whatwatbox.github.io)を選択してください。');
        }
    }

    checkExistingSession();

    async function loadWorksList() {
        worksListEl.innerHTML = '';
        
        // Read works-list.js to get existing order
        let order = [];
        try {
            const fileHandle = await jsDirHandle.getFileHandle('works-list.js');
            const file = await fileHandle.getFile();
            const text = await file.text();
            // Extract array from const worksFolders = [ ... ];
            const match = text.match(/const worksFolders = \[([\s\S]*?)\];/);
            if (match) {
                order = match[1].split(',')
                    .map(s => s.trim().replace(/['"]/g, ''))
                    .filter(s => s);
            }
        } catch (e) {
            console.log('Could not parse works-list.js', e);
        }

        const foldersMap = new Map();
        for await (const entry of worksDirHandle.values()) {
            if (entry.kind === 'directory') {
                foldersMap.set(entry.name, entry);
            }
        }
        
        const sortedFolders = [];
        // Add folders based on works-list.js order
        order.forEach(name => {
            if (foldersMap.has(name)) {
                sortedFolders.push(foldersMap.get(name));
                foldersMap.delete(name);
            }
        });
        
        // Add remaining folders that are not in works-list.js
        const remaining = Array.from(foldersMap.values()).sort((a, b) => a.name.localeCompare(b.name));
        sortedFolders.push(...remaining);

        // Collect global tags from all folders
        const globalTags = new Set();
        for (const folder of sortedFolders) {
            try {
                const fHandle = await folder.getFileHandle('data.json');
                const file = await fHandle.getFile();
                const text = await file.text();
                const data = JSON.parse(text);
                if (data.tags) {
                    data.tags.forEach(t => globalTags.add(t));
                }
            } catch (e) {}
        }
        
        tagSuggestions.innerHTML = '';
        globalTags.forEach(tag => {
            const option = document.createElement('option');
            option.value = tag;
            tagSuggestions.appendChild(option);
        });

        for (const folder of sortedFolders) {
            const div = document.createElement('div');
            div.className = 'work-item';
            div.textContent = folder.name;
            div.dataset.name = folder.name;
            div.addEventListener('click', () => loadWork(folder, div));
            worksListEl.appendChild(div);
        }
    }

    btnSaveOrder.addEventListener('click', async () => {
        if (!jsDirHandle) return;
        
        const items = Array.from(worksListEl.querySelectorAll('.work-item')).map(el => el.dataset.name);
        
        const content = `// 作品フォルダのリスト\n// 新しい作品フォルダを追加した場合は、ここにフォルダ名（ディレクトリ名）を追記してください。\nconst worksFolders = [\n    ${items.map(name => `"${name}"`).join(',\n    ')},\n];\n`;
        
        try {
            const fileHandle = await jsDirHandle.getFileHandle('works-list.js', { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(content);
            await writable.close();
            
            const orig = btnSaveOrder.textContent;
            btnSaveOrder.textContent = 'Saved!';
            setTimeout(() => btnSaveOrder.textContent = orig, 2000);
        } catch (err) {
            console.error(err);
            alert('順序の保存に失敗しました: ' + err.message);
        }
    });

    btnNewWork.addEventListener('click', async () => {
        if (!worksDirHandle) return;
        
        const newFolderName = prompt('新しい作品のフォルダ名を入力してください\n（例: 02_Project）');
        if (!newFolderName || !newFolderName.trim()) return;
        
        try {
            // Check if folder already exists
            try {
                await worksDirHandle.getDirectoryHandle(newFolderName.trim());
                alert('既に同じ名前のフォルダが存在します。');
                return;
            } catch(e) {
                // Folder doesn't exist, which is what we want
            }
            
            // Generate basic empty structure
            let templateData = JSON.stringify({
                id: newFolderName.trim(),
                isPublic: true,
                title: "New Work",
                tags: [],
                summary: "",
                description: "",
                links: [],
                media: []
            }, null, 2);

            // Save choice so it persists across Live Server reloads
            localStorage.setItem('lastOpenedWork', newFolderName.trim());

            // Create new folder
            const newDirHandle = await worksDirHandle.getDirectoryHandle(newFolderName.trim(), { create: true });
            
            // Create data.json in new folder
            const newFileHandle = await newDirHandle.getFileHandle('data.json', { create: true });
            const writable = await newFileHandle.createWritable();
            await writable.write(templateData);
            await writable.close();
            
            // Reload list and select new work
            await loadWorksList();
            
            // Trigger click on the newly created item
            const items = document.querySelectorAll('.work-item');
            for (const item of items) {
                if (item.dataset.name === newFolderName.trim()) {
                    item.click();
                    break;
                }
            }
        } catch(err) {
            console.error(err);
            alert('新しい作品の作成に失敗しました: ' + err.message);
        }
    });

    async function copyDirectory(srcHandle, destHandle) {
        for await (const [name, handle] of srcHandle.entries()) {
            if (handle.kind === 'file') {
                const file = await handle.getFile();
                const newFileHandle = await destHandle.getFileHandle(name, { create: true });
                const writable = await newFileHandle.createWritable();
                await writable.write(file);
                await writable.close();
            } else if (handle.kind === 'directory') {
                const newDestHandle = await destHandle.getDirectoryHandle(name, { create: true });
                await copyDirectory(handle, newDestHandle);
            }
        }
    }

    btnCopyWork.addEventListener('click', async () => {
        if (!currentFolderHandle) {
            alert('コピーする作品を左側のリストから選択してください。');
            return;
        }
        
        const newFolderName = prompt('コピー先の新しいフォルダ名を入力してください', `${currentFolderHandle.name}_copy`);
        if (!newFolderName || !newFolderName.trim() || newFolderName.trim() === currentFolderHandle.name) return;
        
        try {
            try {
                await worksDirHandle.getDirectoryHandle(newFolderName.trim());
                alert('既に同じ名前のフォルダが存在します。');
                return;
            } catch(e) {}
            
            // Save choice so it persists across Live Server reloads
            localStorage.setItem('lastOpenedWork', newFolderName.trim());
            
            const newDirHandle = await worksDirHandle.getDirectoryHandle(newFolderName.trim(), { create: true });
            await copyDirectory(currentFolderHandle, newDirHandle);
            
            await loadWorksList();
            
            const items = document.querySelectorAll('.work-item');
            for (const item of items) {
                if (item.dataset.name === newFolderName.trim()) {
                    item.click();
                    break;
                }
            }
        } catch(err) {
            console.error(err);
            alert('コピーに失敗しました: ' + err.message);
        }
    });

    btnRenameFolder.addEventListener('click', async () => {
        if (!currentFolderHandle) return;
        
        const oldName = currentFolderHandle.name;
        const newName = prompt('新しいフォルダ名を入力してください', oldName);
        if (!newName || !newName.trim() || newName.trim() === oldName) return;
        
        try {
            try {
                await worksDirHandle.getDirectoryHandle(newName.trim());
                alert('既に同じ名前のフォルダが存在します。');
                return;
            } catch(e) {}
            
            // Save choice so it persists across Live Server reloads
            localStorage.setItem('lastOpenedWork', newName.trim());
            
            const newDirHandle = await worksDirHandle.getDirectoryHandle(newName.trim(), { create: true });
            await copyDirectory(currentFolderHandle, newDirHandle);
            await worksDirHandle.removeEntry(oldName, { recursive: true });
            
            // Update works-list.js if present
            try {
                const jsFileHandle = await jsDirHandle.getFileHandle('works-list.js');
                const file = await jsFileHandle.getFile();
                let content = await file.text();
                content = content.replace(`"${oldName}"`, `"${newName.trim()}"`);
                content = content.replace(`'${oldName}'`, `'${newName.trim()}'`);
                const writable = await jsFileHandle.createWritable();
                await writable.write(content);
                await writable.close();
            } catch(e) {
                console.warn('Could not update works-list.js during rename', e);
            }
            
            await loadWorksList();
            
            const items = document.querySelectorAll('.work-item');
            for (const item of items) {
                if (item.dataset.name === newName.trim()) {
                    item.click();
                    break;
                }
            }
        } catch(err) {
            console.error(err);
            alert('フォルダ名の変更に失敗しました: ' + err.message);
        }
    });

    btnDeleteFolder.addEventListener('click', async () => {
        if (!currentFolderHandle) return;
        
        const folderName = currentFolderHandle.name;

        if (!confirm(`本当に作品「${folderName}」を削除しますか？\n※画像ファイルなどもすべて削除され、元に戻せません。`)) {
            return;
        }
        
        try {
            await worksDirHandle.removeEntry(folderName, { recursive: true });
            
            try {
                const jsFileHandle = await jsDirHandle.getFileHandle('works-list.js');
                const file = await jsFileHandle.getFile();
                let content = await file.text();
                const regex = new RegExp(`[ \\t]*["']${folderName}["'],?\\s*`, 'g');
                content = content.replace(regex, '');
                const writable = await jsFileHandle.createWritable();
                await writable.write(content);
                await writable.close();
            } catch(e) {
                console.warn('Could not update works-list.js during delete', e);
            }
            
            localStorage.removeItem('lastOpenedWork');
            currentFolderHandle = null;
            editorForm.classList.add('hidden');
            editorEmpty.classList.remove('hidden');
            
            await loadWorksList();
            alert(`「${folderName}」を削除しました。`);
        } catch (err) {
            console.error(err);
            alert('削除に失敗しました: ' + err.message);
        }
    });

    async function loadWork(folderHandle, element) {
        // Save current work before switching to a different one
        if (currentFolderHandle && currentFolderHandle.name !== folderHandle.name) {
            await saveCurrentWork(true);
        }

        document.querySelectorAll('.work-item').forEach(el => el.classList.remove('active'));
        if (element) element.classList.add('active');

        currentFolderHandle = folderHandle;
        currentFolderNameEl.textContent = folderHandle.name;
        localStorage.setItem('lastOpenedWork', folderHandle.name);

        try {
            const fileHandle = await folderHandle.getFileHandle('data.json');
            const file = await fileHandle.getFile();
            const text = await file.text();
            currentWorkData = JSON.parse(text);
            
            populateForm(currentWorkData);
            
            editorEmpty.classList.add('hidden');
            editorForm.classList.remove('hidden');
        } catch (err) {
            console.error(err);
            alert('data.jsonが見つかりません。新規作成機能は未実装です。');
        }
    }

    function populateForm(data) {
        inputPublic.checked = data.isPublic !== false; // Default to true if undefined
        inputId.value = currentFolderHandle ? currentFolderHandle.name : (data.id || '');
        inputTitle.value = data.title || '';
        inputSummary.value = data.summary || '';
        inputDesc.value = data.description || '';

        // Tags
        tagsList.innerHTML = '';
        if (data.tags) {
            data.tags.forEach(tag => addTagPill(tag));
        }

        // Links
        linksContainer.innerHTML = '';
        if (data.links) {
            data.links.forEach(link => addLinkItem(link.text, link.url));
        }

        // Media
        mediaContainer.innerHTML = '';
        if (data.media) {
            data.media.forEach(m => addMediaItem(m));
        } else if (data.images) { // Fallback for old format
            data.images.forEach(img => addMediaItem({ type: 'image', src: img }));
        }
        addMediaItem(null, true);
    }

    // Tags Logic
    function addTagPill(text) {
        text = text.trim();
        if (!text) return;
        
        // Prevent duplicates
        const existing = Array.from(tagsList.querySelectorAll('.tag-pill')).map(el => el.dataset.tag);
        if (existing.includes(text)) return;
        
        const pill = document.createElement('div');
        pill.className = 'tag-pill';
        pill.dataset.tag = text;
        pill.innerHTML = `<span>${text}</span><span class="remove-tag">×</span>`;
        pill.querySelector('.remove-tag').onclick = () => pill.remove();
        tagsList.appendChild(pill);
    }

    tagInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            if (tagInput.value) {
                tagInput.value.split(',').forEach(t => addTagPill(t));
                tagInput.value = '';
            }
        }
    });

    // Handle datalist selection (fires 'input' event, but we wait for Enter to confirm)
    tagInput.addEventListener('change', () => {
        // change fires when a datalist item is clicked
        if (tagInput.value) {
            tagInput.value.split(',').forEach(t => addTagPill(t));
            tagInput.value = '';
        }
    });

    // Links Logic
    btnAddLink.addEventListener('click', () => addLinkItem());

    function addLinkItem(text = '', url = '') {
        const clone = tplLink.content.cloneNode(true);
        const item = clone.querySelector('.link-item');
        const inputText = clone.querySelector('.link-text');
        const inputUrl = clone.querySelector('.link-url');
        const btnRemove = clone.querySelector('.btn-remove-link');

        inputText.value = text;
        inputUrl.value = url;

        btnRemove.addEventListener('click', () => item.remove());
        linksContainer.appendChild(item);
    }

    // Media Logic
    function addMediaItem(media = null, isNewItem = false) {
        const clone = tplMedia.content.cloneNode(true);
        const item = clone.querySelector('.media-item');
        const selectType = clone.querySelector('.media-type');
        const inputImg = clone.querySelector('.media-val-image');
        const inputYt = clone.querySelector('.media-val-youtube');
        const inputEmbed = clone.querySelector('.media-val-embed');
        const btnRemove = clone.querySelector('.btn-remove-media');
        const previewContainer = clone.querySelector('.media-preview');
        const dragHandle = clone.querySelector('.drag-handle');

        if (isNewItem) {
            item.classList.add('new-media-item');
            dragHandle.style.visibility = 'hidden';
            btnRemove.style.visibility = 'hidden';
        }

        const makeNormal = () => {
            if (item.classList.contains('new-media-item')) {
                item.classList.remove('new-media-item');
                dragHandle.style.visibility = 'visible';
                btnRemove.style.visibility = 'visible';
                addMediaItem(null, true);
            }
        };

        const checkInput = () => {
            const type = selectType.value;
            if (type === 'image' && inputImg.value.trim() !== '') makeNormal();
            if (type === 'youtube' && inputYt.value.trim() !== '') makeNormal();
            if (type === 'embed' && inputEmbed.value.trim() !== '') makeNormal();
        };

        if (media) {
            selectType.value = media.type || 'image';
            if (media.type === 'youtube') inputYt.value = media.id || '';
            else if (media.type === 'embed') inputEmbed.value = media.html || '';
            else inputImg.value = media.src || '';
        }

        const updatePreview = async () => {
            if (!previewContainer) return;
            previewContainer.innerHTML = '';
            const type = selectType.value;
            
            if (type === 'image') {
                const src = inputImg.value.trim();
                if (src && currentFolderHandle) {
                    try {
                        const fileHandle = await currentFolderHandle.getFileHandle(src);
                        const file = await fileHandle.getFile();
                        const url = URL.createObjectURL(file);
                        const img = document.createElement('img');
                        img.src = url;
                        img.style.maxWidth = '100%';
                        img.style.maxHeight = '200px';
                        img.style.objectFit = 'contain';
                        img.onload = () => URL.revokeObjectURL(url);
                        previewContainer.appendChild(img);
                    } catch (e) {
                        previewContainer.textContent = 'Image not found';
                    }
                } else {
                    previewContainer.textContent = 'No image specified';
                }
            } else if (type === 'youtube') {
                const id = inputYt.value.trim();
                if (id) {
                    const iframe = document.createElement('iframe');
                    iframe.width = '320';
                    iframe.height = '180';
                    iframe.src = `https://www.youtube.com/embed/${id}`;
                    iframe.frameBorder = '0';
                    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
                    iframe.allowFullscreen = true;
                    previewContainer.appendChild(iframe);
                } else {
                    previewContainer.textContent = 'No YouTube ID specified';
                }
            } else if (type === 'embed') {
                const html = inputEmbed.value.trim();
                if (html) {
                    previewContainer.innerHTML = html;
                    const iframe = previewContainer.querySelector('iframe');
                    if (iframe) {
                        iframe.style.maxWidth = '100%';
                    }
                } else {
                    previewContainer.textContent = 'No embed HTML specified';
                }
            }
        };

        const updateInputs = () => {
            inputImg.classList.add('hidden');
            inputYt.classList.add('hidden');
            inputEmbed.classList.add('hidden');

            if (selectType.value === 'image') inputImg.classList.remove('hidden');
            else if (selectType.value === 'youtube') inputYt.classList.remove('hidden');
            else if (selectType.value === 'embed') inputEmbed.classList.remove('hidden');
            
            updatePreview();
        };

        selectType.addEventListener('change', updateInputs);
        inputImg.addEventListener('input', () => { updatePreview(); checkInput(); });
        inputYt.addEventListener('input', () => { updatePreview(); checkInput(); });
        inputEmbed.addEventListener('input', () => { updatePreview(); checkInput(); });
        
        updateInputs();

        btnRemove.addEventListener('click', async () => {
            if (selectType.value === 'image') {
                const src = inputImg.value.trim();
                if (src && currentFolderHandle) {
                    if (confirm(`フォルダから画像ファイル「${src}」も削除しますか？\n（※一度削除すると元に戻せません）`)) {
                        try {
                            item.remove();
                            await saveCurrentWork(true);
                            await currentFolderHandle.removeEntry(src);
                        } catch (e) {
                            console.warn('ファイルの削除に失敗したか、ファイルが存在しませんでした', e);
                        }
                        return;
                    }
                }
            }
            item.remove();
        });

        // Drag and Drop Logic
        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            item.classList.add('dragover');
        });
        
        item.addEventListener('dragleave', () => {
            item.classList.remove('dragover');
        });

        item.addEventListener('drop', async (e) => {
            e.preventDefault();
            item.classList.remove('dragover');
            
            if (!currentFolderHandle) return;
            
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const file = e.dataTransfer.files[0];
                if (!file.type.startsWith('image/')) {
                    alert('画像ファイルを選択してください');
                    return;
                }
                
                try {
                    // Update UI first
                    selectType.value = 'image';
                    updateInputs();
                    inputImg.value = file.name;
                    item.style.backgroundColor = 'rgba(74, 144, 226, 0.3)';
                    setTimeout(() => item.style.backgroundColor = '', 1000);

                    // SAVE data.json immediately BEFORE saving the image file
                    await saveCurrentWork(true);
                    
                    // Save file to currentFolderHandle (may trigger Live Server reload)
                    const newFileHandle = await currentFolderHandle.getFileHandle(file.name, { create: true });
                    const writable = await newFileHandle.createWritable();
                    await writable.write(file);
                    await writable.close();
                    
                    updatePreview();
                    makeNormal();
                } catch (err) {
                    console.error(err);
                    alert('画像の保存に失敗しました: ' + err.message);
                }
            }
        });

        item.addEventListener('paste', async (e) => {
            if (!currentFolderHandle) return;
            const clipboardItems = e.clipboardData?.items;
            if (!clipboardItems) return;
            
            let imageFile = null;
            for (let i = 0; i < clipboardItems.length; i++) {
                if (clipboardItems[i].type.startsWith('image/')) {
                    imageFile = clipboardItems[i].getAsFile();
                    break;
                }
            }

            if (imageFile) {
                e.preventDefault();
                try {
                    const ext = imageFile.type.split('/')[1] || 'png';
                    const fileName = `pasted_${Date.now()}.${ext}`;

                    selectType.value = 'image';
                    updateInputs();
                    inputImg.value = fileName;
                    item.style.backgroundColor = 'rgba(74, 144, 226, 0.3)';
                    setTimeout(() => item.style.backgroundColor = '', 1000);

                    await saveCurrentWork(true);
                    
                    const newFileHandle = await currentFolderHandle.getFileHandle(fileName, { create: true });
                    const writable = await newFileHandle.createWritable();
                    await writable.write(imageFile);
                    await writable.close();
                    
                    updatePreview();
                    makeNormal();
                } catch (err) {
                    console.error(err);
                    alert('貼り付けた画像の保存に失敗しました: ' + err.message);
                }
            }
        });

        mediaContainer.appendChild(item);
    }

    // Save Logic
    async function saveCurrentWork(silent = false) {
        if (!currentFolderHandle) return;

        const data = {
            id: currentFolderHandle.name,
            isPublic: inputPublic.checked,
            title: inputTitle.value.trim(),
            tags: Array.from(tagsList.querySelectorAll('.tag-pill')).map(el => el.dataset.tag),
            summary: inputSummary.value.trim(),
            description: inputDesc.value,
            links: [],
            media: []
        };

        document.querySelectorAll('.link-item').forEach(item => {
            const text = item.querySelector('.link-text').value.trim();
            const url = item.querySelector('.link-url').value.trim();
            if (text || url) {
                data.links.push({ text, url });
            }
        });

        document.querySelectorAll('.media-item').forEach(item => {
            const type = item.querySelector('.media-type').value;
            if (type === 'image') {
                const src = item.querySelector('.media-val-image').value.trim();
                if (src) data.media.push({ type, src });
            } else if (type === 'youtube') {
                const id = item.querySelector('.media-val-youtube').value.trim();
                if (id) data.media.push({ type, id });
            } else if (type === 'embed') {
                const html = item.querySelector('.media-val-embed').value.trim();
                if (html) data.media.push({ type, html });
            }
        });

        try {
            const fileHandle = await currentFolderHandle.getFileHandle('data.json', { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(JSON.stringify(data, null, 2));
            await writable.close();
            
            if (!silent) {
                const originalText = btnSave.textContent;
                btnSave.textContent = 'Saved!';
                btnSave.style.backgroundColor = '#4CAF50';
                setTimeout(() => {
                    btnSave.textContent = originalText;
                    btnSave.style.backgroundColor = '';
                }, 2000);
            }
        } catch (err) {
            console.error(err);
            if (!silent) alert('保存に失敗しました: ' + err.message);
        }
    }

    btnSave.addEventListener('click', () => saveCurrentWork(false));

    // Save on browser close or reload
    window.addEventListener('beforeunload', () => {
        if (currentFolderHandle) {
            saveCurrentWork(true);
        }
    });
});
