document.addEventListener('DOMContentLoaded', async () => {
    // 1. Fade-in animation on scroll
    const fadeElements = document.querySelectorAll('.fade-in');
    
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.15
    };
    
    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);
    
    fadeElements.forEach(el => observer.observe(el));

    // 2. Render Works
    const worksContainer = document.getElementById('works-container');
    const filtersContainer = document.getElementById('works-filters');
    const modal = document.getElementById('work-modal');
    const modalBody = document.getElementById('modal-body');
    const modalClose = document.querySelector('.modal-close');
    
    let slideshowIntervals = {};
    let loadedWorks = [];
    let allTags = new Set();

    if (typeof worksFolders !== 'undefined' && worksContainer) {
        for (let i = 0; i < worksFolders.length; i++) {
            const folderName = worksFolders[i];
            const folderPath = `assets/works/${folderName}`;
            
            try {
                const response = await fetch(`${folderPath}/data.json`);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const work = await response.json();
                
                if (work.media) {
                    work.images = work.media
                        .filter(m => m.type === 'image')
                        .map(m => `${folderPath}/${m.src}`);
                    // プレビュー用にフルパスを設定
                    work.media.forEach(m => {
                        if (m.type === 'image') m.fullSrc = `${folderPath}/${m.src}`;
                    });
                } else if (work.images) {
                    work.images = work.images.map(img => `${folderPath}/${img}`);
                } else {
                    work.images = [];
                }
                work.tags = work.tags || [];
                work.tags.forEach(tag => allTags.add(tag));
                
                const card = createWorkCard(work, folderPath, i);
                loadedWorks.push({ work, card });
            } catch (error) {
                console.error(`Failed to load work data for ${folderName}:`, error);
            }
        }
        
        // Render filter buttons after all works are loaded
        renderFilters(Array.from(allTags));
    }

    function createWorkCard(work, folderPath, index) {
        const card = document.createElement('div');
        card.className = 'work-card fade-in';
        card.dataset.index = index;
        
        const imagesDiv = document.createElement('div');
        imagesDiv.className = 'work-images';
        
        work.images.forEach((imgSrc, imgIndex) => {
            const img = document.createElement('img');
            img.src = imgSrc;
            img.alt = `${work.title} - Image ${imgIndex + 1}`;
            if (imgIndex === 0) img.classList.add('active');
            imagesDiv.appendChild(img);
        });
        
        const infoDiv = document.createElement('div');
        infoDiv.className = 'work-info';
        
        let tagsHtml = '';
        if (work.tags && work.tags.length > 0) {
            tagsHtml = `<div class="work-tags">${work.tags.map(tag => `<span class="work-tag">${tag}</span>`).join('')}</div>`;
        }

        infoDiv.innerHTML = `
            ${tagsHtml}
            <h3 class="work-title">${work.title}</h3>
            <p class="work-summary">${work.summary}</p>
        `;
        
        card.appendChild(imagesDiv);
        card.appendChild(infoDiv);
        
        const allImgs = imagesDiv.querySelectorAll('img');
        if (allImgs.length > 1) {
            card.addEventListener('mouseenter', () => {
                let currentImgIndex = 0;
                slideshowIntervals[work.id] = setInterval(() => {
                    allImgs[currentImgIndex].classList.remove('active');
                    currentImgIndex = (currentImgIndex + 1) % allImgs.length;
                    allImgs[currentImgIndex].classList.add('active');
                }, 1200);
            });
            
            card.addEventListener('mouseleave', () => {
                clearInterval(slideshowIntervals[work.id]);
                allImgs.forEach((img, i) => {
                    if (i === 0) img.classList.add('active');
                    else img.classList.remove('active');
                });
            });
        }
        
        card.addEventListener('click', () => {
            openModal(work);
        });
        
        worksContainer.appendChild(card);
        setTimeout(() => { observer.observe(card); }, 100);
        
        return card;
    }

    function renderFilters(tags) {
        if (!filtersContainer || tags.length === 0) return;
        
        const allBtn = document.createElement('button');
        allBtn.className = 'filter-btn active';
        allBtn.textContent = 'All';
        allBtn.dataset.tag = 'all';
        filtersContainer.appendChild(allBtn);
        
        tags.forEach(tag => {
            const btn = document.createElement('button');
            btn.className = 'filter-btn';
            btn.textContent = tag;
            btn.dataset.tag = tag;
            filtersContainer.appendChild(btn);
        });
        
        filtersContainer.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                filtersContainer.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                
                const selectedTag = e.target.dataset.tag;
                
                loadedWorks.forEach(item => {
                    if (selectedTag === 'all' || item.work.tags.includes(selectedTag)) {
                        item.card.style.display = 'block';
                        setTimeout(() => { item.card.style.opacity = '1'; }, 10);
                    } else {
                        item.card.style.opacity = '0';
                        setTimeout(() => { item.card.style.display = 'none'; }, 300);
                    }
                });
            });
        });
    }

    // 3. Modal Logic
    function openModal(work) {
        let mediaHtml = '';
        if (work.media && work.media.length > 0) {
            mediaHtml = work.media.map(m => {
                if (m.type === 'youtube') {
                    return `
                        <div class="video-container">
                            <iframe src="https://www.youtube.com/embed/${m.id}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
                        </div>
                    `;
                } else if (m.type === 'image') {
                    return `<img src="${m.fullSrc}" alt="${work.title}">`;
                }
                return '';
            }).join('');
        } else {
            if (work.youtubeIds && work.youtubeIds.length > 0) {
                mediaHtml += work.youtubeIds.map(id => `
                    <div class="video-container">
                        <iframe src="https://www.youtube.com/embed/${id}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
                    </div>
                `).join('');
            }
            if (work.images && work.images.length > 0) {
                mediaHtml += work.images.map(src => `<img src="${src}" alt="${work.title}">`).join('');
            }
        }

        let tagsHtml = '';
        if (work.tags && work.tags.length > 0) {
            tagsHtml = `<div class="work-tags" style="margin-bottom: 1rem;">${work.tags.map(tag => `<span class="work-tag">${tag}</span>`).join('')}</div>`;
        }
        
        modalBody.innerHTML = `
            ${tagsHtml}
            <h2 class="modal-title">${work.title}</h2>
            <div class="modal-desc">${work.description}</div>
            <div class="modal-images">
                ${mediaHtml}
            </div>
        `;
        
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        setTimeout(() => {
            modalBody.innerHTML = '';
        }, 400);
    }

    modalClose.addEventListener('click', closeModal);
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.classList.contains('modal-overlay')) {
            closeModal();
        }
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeModal();
        }
    });
});
