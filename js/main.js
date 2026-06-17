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
    let currentResizeHandler = null;

    if (typeof worksFolders !== 'undefined' && worksContainer) {
        for (let i = 0; i < worksFolders.length; i++) {
            const folderName = worksFolders[i];
            const folderPath = `assets/works/${folderName}`;
            
            try {
                const response = await fetch(`${folderPath}/data.json`);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const work = await response.json();
                
                if (work.isPublic === false) continue;
                
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
        let mediaCount = 0;
        if (work.media && work.media.length > 0) {
            mediaCount = work.media.length;
            mediaHtml = work.media.map(m => {
                if (m.type === 'youtube') {
                    return `
                        <div class="video-container">
                            <iframe src="https://www.youtube.com/embed/${m.id}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
                        </div>
                    `;
                } else if (m.type === 'image') {
                    return `<img src="${m.fullSrc}" alt="${work.title}">`;
                } else if (m.type === 'embed') {
                    return `
                        <div class="video-container">
                            ${m.html}
                        </div>
                    `;
                }
                return '';
            }).join('');
        } else {
            if (work.youtubeIds && work.youtubeIds.length > 0) {
                mediaCount += work.youtubeIds.length;
                mediaHtml += work.youtubeIds.map(id => `
                    <div class="video-container">
                        <iframe src="https://www.youtube.com/embed/${id}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
                    </div>
                `).join('');
            }
            if (work.images && work.images.length > 0) {
                mediaCount += work.images.length;
                mediaHtml += work.images.map(src => `<img src="${src}" alt="${work.title}">`).join('');
            }
        }

        let paginationHtml = '';
        if (mediaCount > 1) {
            paginationHtml = '<div class="modal-pagination">';
            for (let i = 0; i < mediaCount; i++) {
                paginationHtml += `<button class="modal-pagination-dot ${i === 0 ? 'active' : ''}" aria-label="Slide ${i + 1}"></button>`;
            }
            paginationHtml += '</div>';
        }

        let tagsHtml = '';
        if (work.tags && work.tags.length > 0) {
            tagsHtml = `<div class="work-tags" style="margin-bottom: 1rem;">${work.tags.map(tag => `<span class="work-tag">${tag}</span>`).join('')}</div>`;
        }

        let linksHtml = '';
        if (work.links && work.links.length > 0) {
            linksHtml = `<div class="modal-links">${work.links.map(link => `<a href="${link.url}" target="_blank" rel="noopener noreferrer" class="modal-link-btn">${link.text}</a>`).join('')}</div>`;
        }
        
        let galleryHtml = '';
        if (mediaCount > 1) {
            galleryHtml = `
            <div class="modal-gallery-wrapper">
                <button class="modal-nav-btn prev" aria-label="Previous">
                    <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
                </button>
                <div class="modal-images" id="modal-images-container">
                    ${mediaHtml}
                </div>
                <button class="modal-nav-btn next" aria-label="Next">
                    <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
                </button>
            </div>
            `;
        } else {
            galleryHtml = `
            <div class="modal-images" id="modal-images-container">
                ${mediaHtml}
            </div>
            `;
        }

        modalBody.innerHTML = `
            ${tagsHtml}
            <h2 class="modal-title">${work.title}</h2>
            <div class="modal-desc">${work.description}</div>
            ${linksHtml}
            ${paginationHtml}
            ${galleryHtml}
        `;
        
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';

        const modalImagesContainer = document.getElementById('modal-images-container');

        const updateHeight = () => {
            if (!modalImagesContainer) return;
            const scrollLeft = modalImagesContainer.scrollLeft;
            if (modalImagesContainer.clientWidth === 0) return;
            const index = Math.round(scrollLeft / modalImagesContainer.clientWidth) || 0;
            const currentChild = modalImagesContainer.children[index];
            if (currentChild) {
                modalImagesContainer.style.height = currentChild.offsetHeight + 'px';
            }
        };

        if (mediaCount > 1) {
            const dots = document.querySelectorAll('.modal-pagination-dot');
            const prevBtn = document.querySelector('.modal-nav-btn.prev');
            const nextBtn = document.querySelector('.modal-nav-btn.next');

            const scrollToSlide = (index) => {
                if (index < 0) index = mediaCount - 1;
                else if (index >= mediaCount) index = 0;
                const scrollAmount = modalImagesContainer.clientWidth * index;
                modalImagesContainer.scrollTo({
                    left: scrollAmount,
                    behavior: 'smooth'
                });
            };

            dots.forEach((dot, index) => {
                dot.addEventListener('click', () => scrollToSlide(index));
            });

            if (prevBtn && nextBtn) {
                prevBtn.addEventListener('click', () => {
                    const currentIndex = Math.round(modalImagesContainer.scrollLeft / modalImagesContainer.clientWidth);
                    scrollToSlide(currentIndex - 1);
                });
                nextBtn.addEventListener('click', () => {
                    const currentIndex = Math.round(modalImagesContainer.scrollLeft / modalImagesContainer.clientWidth);
                    scrollToSlide(currentIndex + 1);
                });
            }

            modalImagesContainer.addEventListener('scroll', () => {
                const scrollLeft = modalImagesContainer.scrollLeft;
                if (modalImagesContainer.clientWidth > 0) {
                    const index = Math.round(scrollLeft / modalImagesContainer.clientWidth);
                    dots.forEach((dot, i) => {
                        dot.classList.toggle('active', i === index);
                    });
                }
                updateHeight();
            });

            let isScrolling = false;
            modalImagesContainer.addEventListener('wheel', (e) => {
                if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                    e.preventDefault();
                    if (isScrolling) return;
                    
                    const currentIndex = Math.round(modalImagesContainer.scrollLeft / modalImagesContainer.clientWidth);
                    if (e.deltaY > 0) {
                        scrollToSlide(currentIndex + 1);
                    } else if (e.deltaY < 0) {
                        scrollToSlide(currentIndex - 1);
                    }
                    
                    isScrolling = true;
                    setTimeout(() => { isScrolling = false; }, 500);
                }
            }, { passive: false });
        }

        if (mediaCount > 0) {
            currentResizeHandler = updateHeight;
            window.addEventListener('resize', currentResizeHandler);

            const imgs = modalImagesContainer.querySelectorAll('img');
            imgs.forEach(img => {
                if (img.complete) {
                    updateHeight();
                } else {
                    img.addEventListener('load', updateHeight);
                }
            });

            // モーダル表示アニメーション後に高さを再計算
            setTimeout(updateHeight, 100);
            setTimeout(updateHeight, 400); // アニメーション完了後
        }
    }

    function closeModal() {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        if (currentResizeHandler) {
            window.removeEventListener('resize', currentResizeHandler);
            currentResizeHandler = null;
        }
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
