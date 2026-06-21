document.addEventListener('DOMContentLoaded', () => {
    // === 1. Supabase Initialization & State ===
    let supabase = null;
    let memories = [];
    let shuffledMemories = []; // shuffled once on load, stays fixed until next page refresh
    let activeFolder = 'Abhijith'; // Default active folder

    // Capture and clear handwritten note text immediately to prevent it from displaying statically on load
    const noteEl = document.querySelector('.handwritten-note');
    const noteText = noteEl ? noteEl.textContent.replace(/\s+/g, ' ').trim() : '';
    if (noteEl) {
        noteEl.innerHTML = '';
    }
    let bgImages = [];
    let handleScroll = () => { };
    let journeyTransitionActive = false;

    // Helper to style background photos with 3D depth and layout spacing for masonry collage
    const set3DPhotoProperties = (img, index, totalCount) => {
        const depth = index / totalCount; // 0 to 1
        const tz = (depth * 140) - 70; // -70px to 70px (subtle 3D depth)
        const rot = (Math.random() * 12) - 6; // subtle random rotation for a warm messy look

        const tx = (Math.random() * 16) - 8;
        const ty = (Math.random() * 16) - 8;

        img.style.setProperty('--tx', `${tx}px`);
        img.style.setProperty('--ty', `${ty}px`);
        img.style.setProperty('--tz', `${tz}px`);
        img.style.setProperty('--rot', `${rot}deg`);

        // Blurred depth-of-field effect: some slightly blurrier than others (but clearer than before)
        const blurVal = 0.5 + (1 - depth) * 1.5; // 0.5px to 2px blur
        const brightVal = 0.70 + (depth * 0.15); // 0.70 to 0.85 brightness
        img.style.setProperty('--blur-amount', `${blurVal}px`);
        img.style.setProperty('--brightness-amount', brightVal);

        // Cache parsed numbers directly on element to avoid parseFloat in hot RAF loop
        img._speedX = (depth * 14) + 6;
        img._speedY = (depth * 14) + 6;
        img._tx = tx;
        img._ty = ty;
        img._tz = tz;
        img._rot = rot;
        img._floatOffset = index * 0.6; // unique phase offset cached once

        // Fade image in after styling (higher opacity for better visibility)
        img.style.opacity = '0.3';
    };

    // Select timeline container
    const timelineContainer = document.getElementById('timeline');
    // Store original HTML cards as fallback
    const fallbackCardsHTML = timelineContainer ? timelineContainer.innerHTML : '';

    // Initialize Supabase Client
    const initSupabase = () => {
        let url = SUPABASE_CONFIG.url;
        let anonKey = SUPABASE_CONFIG.anonKey;

        // Fallback to localStorage if config.js is not set
        if (!url || !anonKey) {
            url = localStorage.getItem('supabase_url');
            anonKey = localStorage.getItem('supabase_anon_key');
        }

        // Clean url just in case
        if (url) {
            url = url.replace(/\/rest\/v1\/?$/, "").trim();
        }

        const statusBtn = document.getElementById('connection-status-btn');

        if (url && anonKey) {
            try {
                const { createClient } = window.supabase;
                supabase = createClient(url, anonKey);

                // Update UI status
                if (statusBtn) {
                    statusBtn.className = 'connection-status-btn status-connected';
                    statusBtn.querySelector('.status-text').innerText = 'Connected to Supabase';
                }
                console.log("Supabase initialized successfully.");
                return true;
            } catch (err) {
                console.error("Failed to initialize Supabase client:", err);
            }
        }

        // Show disconnected state
        if (statusBtn) {
            statusBtn.className = 'connection-status-btn status-disconnected';
            statusBtn.querySelector('.status-text').innerText = 'Configure Supabase';
        }
        return false;
    };

    // === 2. Intersection Observer for Scrapbook Polaroid Card Entry & Video Auto-Play ===
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.25
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const video = entry.target.querySelector('video');

            if (entry.isIntersecting) {
                // Scrapbook Reveal Animation
                const cardInner = entry.target.querySelector('.card-inner');
                if (cardInner && !cardInner.querySelector('.washi-tape')) {
                    const tape = document.createElement('div');
                    tape.className = 'washi-tape';
                    cardInner.appendChild(tape);
                }

                // Get or assign random rotation to card wrapper
                let rotation = entry.target.dataset.rotation;
                if (!rotation) {
                    rotation = (Math.random() * 6 - 3).toFixed(2);
                    entry.target.dataset.rotation = rotation;
                }
                entry.target.style.setProperty('--card-rotation', `${rotation}deg`);

                entry.target.classList.add('reveal-scrapbook');

                if (video) {
                    const playPromise = video.play();
                    if (playPromise !== undefined) {
                        playPromise.catch(error => {
                            console.log("Autoplay prevented:", error);
                        });
                    }
                }
            } else {
                if (video) {
                    video.pause();
                }
            }
        });
    }, observerOptions);

    // === 3. Dynamic Card Rendering & Event Binding ===
    // Helper to filter out raw filenames/timestamps from being displayed as titles
    const cleanTitle = (title) => {
        if (!title) return '';
        const clean = title.trim();
        // Match IMG_xxx, Snapchat-xxx, Sunnapi, with_sura, original sura, and other filename patterns
        const isFilePattern = /^(img[-_]?\d+|snapchat[-_]?\d+|original[-_]?sura|sunnapi|with[-_]?sura)/i.test(clean) || clean.includes('.') || /\d{8}/.test(clean);
        return isFilePattern ? '' : clean;
    };

    // Helper to generate a single card element
    const createCardElement = (item) => {
        const card = document.createElement('div');
        card.className = 'memory-card';

        const cardInner = document.createElement('div');
        cardInner.className = 'card-inner';

        // Apply a random rotation style inline for Ghibli aesthetic
        const degrees = (Math.random() * 6) - 3; // random between -3deg and +3deg
        cardInner.style.transform = `rotate(${degrees}deg)`;

        // Save original rotation for hover animation restoration
        card.dataset.rotation = degrees;

        const mediaContainer = document.createElement('div');
        mediaContainer.className = 'media-container';

        let mediaElement;
        if (item.media_type === 'video') {
            mediaElement = document.createElement('video');
            mediaElement.className = 'memory-video';
            mediaElement.loop = true;
            mediaElement.muted = true;
            mediaElement.playsInline = true;
            mediaElement.setAttribute('data-autoplay', '');
            mediaElement.preload = 'metadata'; // only load metadata initially

            const source = document.createElement('source');
            source.src = item.url;
            source.type = 'video/mp4';
            mediaElement.appendChild(source);
        } else {
            mediaElement = document.createElement('img');
            mediaElement.className = 'memory-image';
            mediaElement.src = item.url;
            mediaElement.alt = item.title || 'Memory';
            mediaElement.decoding = 'async';
            // loading priority set by caller via dataset
            mediaElement.loading = item._eager ? 'eager' : 'lazy';
        }

        mediaContainer.appendChild(mediaElement);

        // Download Button Overlay on hover
        const downloadBtn = document.createElement('div');
        downloadBtn.className = 'card-download-btn';
        downloadBtn.innerHTML = '📥';
        downloadBtn.title = 'Download this file';
        downloadBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent lightbox triggering
            downloadMedia(item.url, item.file_path || `${item.title || 'memory'}.${item.media_type === 'video' ? 'mp4' : 'jpg'}`);
        });

        cardInner.appendChild(mediaContainer);
        cardInner.appendChild(downloadBtn);

        // Delete Button Overlay on hover (only if Supabase is connected)
        if (supabase) {
            const deleteBtn = document.createElement('div');
            deleteBtn.className = 'card-delete-btn';
            deleteBtn.innerHTML = '🗑️';
            deleteBtn.title = 'Delete this memory';
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation(); // Prevent lightbox triggering
                const confirmDelete = confirm("Are you sure you want to permanently delete this memory? 🗑️");
                if (confirmDelete) {
                    await deleteMemory(item, card);
                }
            });
            cardInner.appendChild(deleteBtn);
        }

        // Caption section (only append if we have actual user text)
        const captionText = cleanTitle(item.title);
        const descText = item.description || '';

        if (captionText || descText) {
            const caption = document.createElement('div');
            caption.className = 'caption';

            if (captionText) {
                const h3 = document.createElement('h3');
                h3.innerText = captionText;
                caption.appendChild(h3);
            }

            if (descText) {
                const p = document.createElement('p');
                p.innerText = descText;
                caption.appendChild(p);
            }

            cardInner.appendChild(caption);
        } else {
            // Adjust card-inner bottom padding to look correct for a blank polaroid
            cardInner.style.paddingBottom = '15px';
        }

        card.appendChild(cardInner);

        // Setup hover effect to reset rotation and scale
        card.addEventListener('mouseenter', () => {
            cardInner.style.transform = 'scale(1.1) rotate(0deg)';
        });
        card.addEventListener('mouseleave', () => {
            cardInner.style.transform = `rotate(${degrees}deg)`;
        });

        // Click to Open Lightbox
        card.addEventListener('click', () => {
            openLightbox(item);
        });

        return card;
    };

    // Helper to delete a memory from database and storage
    const deleteMemory = async (item, cardElement) => {
        if (!supabase) return;

        try {
            console.log(`Attempting to delete memory ID: ${item.id}`);

            // 1. Delete from database table memories
            const { error: dbError } = await supabase
                .from('memories')
                .delete()
                .eq('id', item.id);

            if (dbError) throw dbError;

            // 2. Delete from storage bucket memories if file_path exists
            if (item.file_path) {
                const { error: storageError } = await supabase.storage
                    .from('memories')
                    .remove([item.file_path]);

                if (storageError) {
                    console.warn("Storage deletion warning (file might have been already removed):", storageError.message);
                }
            }

            // Remove from local array memories state
            memories = memories.filter(m => m.id !== item.id);

            // Animate card removal in UI
            if (cardElement) {
                cardElement.style.transition = 'all 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)';
                cardElement.style.opacity = '0';
                cardElement.style.transform = 'scale(0.8) translateY(20px)';
                setTimeout(() => {
                    cardElement.remove();
                    // If no memories left, render empty state
                    const remaining = memories.filter(m => (m.folder || 'Abhijith') === activeFolder);
                    if (remaining.length === 0) {
                        renderGallery();
                    }
                }, 500);
            } else {
                // If deleted from lightbox, refresh the gallery directly
                renderGallery();
            }
            console.log("Memory successfully deleted.");

        } catch (err) {
            console.error("Failed to delete memory:", err.message);
            alert(`Delete failed: ${err.message || 'Unknown error'}`);
        }
    };

    // Render active folder gallery (uses pre-shuffled order — only shuffled on page load)
    const renderGallery = () => {
        if (!timelineContainer) return;
        timelineContainer.innerHTML = '';

        // Filter from the fixed shuffled array
        const filtered = shuffledMemories.filter(item => (item.folder || 'Abhijith') === activeFolder);

        if (filtered.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'empty-gallery';
            emptyDiv.innerHTML = `
                <div class="empty-gallery-icon">✨📚✨</div>
                <h3>This folder is empty</h3>
                <p>Upload a photo or video to fill ${activeFolder}'s folder with memories! 💫</p>
            `;
            timelineContainer.appendChild(emptyDiv);
        } else {
            filtered.forEach((item, index) => {
                item._eager = index < 6;
                const card = createCardElement(item);
                timelineContainer.appendChild(card);
                observer.observe(card);
            });
        }
    };

    // Load memories from database (gallery)
    const loadMemories = async () => {
        if (!supabase) {
            console.log("Supabase not configured. Using fallback local HTML cards.");
            return;
        }

        // Show skeleton cards immediately to eliminate blank-screen lag
        showSkeletonCards(8);

        try {
            const { data, error } = await supabase
                .from('memories')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            memories = data || [];

            // Keep original order from Supabase (newest first)
            shuffledMemories = [...memories];

            // Render gallery
            renderGallery();

            console.log(`Successfully loaded ${memories.length} memories from Supabase.`);
        } catch (err) {
            console.error("Error loading memories from Supabase:", err.message);
            console.log("Falling back to local HTML cards.");
            setupLocalFallbackCards();
        }
    };

    // Load background collage separately — fast parallel query, only URLs needed
    const loadBackgroundCollage = async () => {
        const collageGrid = document.querySelector('.bg-photo-wall');
        if (!collageGrid) return;

        let usedSupabase = false;

        if (supabase) {
            try {
                // Fetch only image URLs, randomised via limit — very fast query
                const { data, error } = await supabase
                    .from('memories')
                    .select('url')
                    .eq('media_type', 'image')
                    .limit(120); // fetch up to 120, we will pick 60 randomly

                if (!error && data && data.length > 0) {
                    // Shuffle and pick 60
                    const picked = [...data]
                        .sort(() => Math.random() - 0.5)
                        .slice(0, 60);

                    collageGrid.innerHTML = '';
                    picked.forEach((item, index) => {
                        const img = document.createElement('img');
                        img.src = item.url;
                        img.className = 'bg-collage-img';
                        img.loading = 'lazy';   // defer — these are decorative background visuals
                        img.decoding = 'async';
                        set3DPhotoProperties(img, index, picked.length);
                        collageGrid.appendChild(img);
                    });
                    usedSupabase = true;
                    console.log(`Loaded ${picked.length} background images from Supabase.`);
                }
            } catch (err) {
                console.warn('Background collage load from Supabase failed, falling back to local:', err.message);
            }
        }

        if (!usedSupabase) {
            // Fallback: use existing hardcoded images in HTML
            const existingImages = collageGrid.querySelectorAll('.bg-collage-img');
            if (existingImages.length > 0) {
                existingImages.forEach((img, index) => {
                    set3DPhotoProperties(img, index, existingImages.length);
                });
                console.log(`Loaded ${existingImages.length} fallback background images from HTML.`);
            }
        }

        // Hook up parallax
        bgImages = document.querySelectorAll('.bg-collage-img');
        handleScroll();
    };

    // Show pulsing skeleton placeholder cards while real data loads
    const showSkeletonCards = (count) => {
        if (!timelineContainer) return;
        timelineContainer.innerHTML = '';
        for (let i = 0; i < count; i++) {
            const card = document.createElement('div');
            card.className = 'memory-card visible'; // visible so they show immediately
            card.innerHTML = `
                <div class="card-inner skeleton-card">
                    <div class="skeleton-media"></div>
                </div>
            `;
            timelineContainer.appendChild(card);
        }
    };

    // populateBackgroundCollage — now only used as fallback from memories array
    const populateBackgroundCollage = () => {
        const collageGrid = document.querySelector('.bg-photo-wall');
        if (!collageGrid) return;

        // If there are already images in the HTML (e.g. from update_html.py)
        const existingImages = collageGrid.querySelectorAll('.bg-collage-img');
        if (existingImages.length > 0) {
            existingImages.forEach((img, index) => {
                set3DPhotoProperties(img, index, existingImages.length);
            });
            bgImages = existingImages;
            handleScroll();
            return;
        }

        const bgImagesData = memories.filter(item => item.media_type === 'image');
        if (bgImagesData.length === 0) return;

        // Shuffle and pick 50 for a dense collage wall
        const shuffled = [...bgImagesData]
            .sort(() => Math.random() - 0.5)
            .slice(0, 50);

        collageGrid.innerHTML = '';
        shuffled.forEach((item, index) => {
            const img = document.createElement('img');
            img.src = item.url;
            img.className = 'bg-collage-img';
            img.loading = 'lazy';  // defer — decorative background
            img.decoding = 'async';
            set3DPhotoProperties(img, index, shuffled.length);
            collageGrid.appendChild(img);
        });

        bgImages = document.querySelectorAll('.bg-collage-img');
        handleScroll();
    };

    // Bind event listeners to existing hardcoded cards (as fallback)
    const setupLocalFallbackCards = () => {
        if (activeFolder === 'Abhijith') {
            timelineContainer.innerHTML = fallbackCardsHTML;
            const localCards = document.querySelectorAll('.memory-card');
            localCards.forEach(card => {
                observer.observe(card);

                const cardInner = card.querySelector('.card-inner');
                const video = card.querySelector('video');
                const img = card.querySelector('img');
                const titleElement = card.querySelector('h3');
                const descElement = card.querySelector('p');

                const title = titleElement ? titleElement.innerText : 'memory';
                const desc = descElement ? descElement.innerText : '';
                const sourceUrl = video ? video.querySelector('source').src : (img ? img.src : '');

                // Add download button dynamically if not exists
                if (cardInner && !cardInner.querySelector('.card-download-btn')) {
                    if (sourceUrl) {
                        const downloadBtn = document.createElement('div');
                        downloadBtn.className = 'card-download-btn';
                        downloadBtn.innerHTML = '📥';
                        downloadBtn.title = 'Download this file';
                        downloadBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            const fileName = sourceUrl.split('/').pop() || title;
                            downloadMedia(sourceUrl, fileName);
                        });
                        cardInner.appendChild(downloadBtn);
                    }
                }

                // Clean filename caption text from polaroid view
                const captionDiv = card.querySelector('.caption');
                if (captionDiv) {
                    const cleanT = cleanTitle(title);
                    const cleanD = cleanTitle(desc);

                    if (titleElement) titleElement.innerText = cleanT;
                    if (descElement) descElement.innerText = cleanD;

                    if (!cleanT && !cleanD) {
                        captionDiv.style.display = 'none';
                        if (cardInner) cardInner.style.paddingBottom = '15px';
                    }
                }

                // Click listener for lightbox
                card.addEventListener('click', () => {
                    openLightbox({
                        url: sourceUrl,
                        media_type: video ? 'video' : 'image',
                        title: title,
                        description: desc
                    });
                });
            });
        } else {
            // Show empty state for other folders in fallback mode
            timelineContainer.innerHTML = '';
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'empty-gallery';
            emptyDiv.innerHTML = `
                <div class="empty-gallery-icon">✨📚✨</div>
                <h3>This folder is empty</h3>
                <p>Configure Supabase connection to upload memories under ${activeFolder}! 💫</p>
            `;
            timelineContainer.appendChild(emptyDiv);
        }
    };

    // Setup Folder tab click bindings
    const setupFolderTabs = () => {
        const tabs = document.querySelectorAll('.folder-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                activeFolder = tab.dataset.folder;

                if (supabase) {
                    renderGallery();
                } else {
                    setupLocalFallbackCards();
                }
            });
        });
    };

    // === 4. Premium Download Logic (Blobs) ===
    const downloadMedia = async (url, filename) => {
        try {
            console.log(`Downloading: ${url} -> ${filename}`);
            const response = await fetch(url);

            if (!response.ok) throw new Error("CORS or network error");

            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();

            document.body.removeChild(a);
            window.URL.revokeObjectURL(blobUrl);
        } catch (error) {
            console.warn("Blob download failed, falling back to direct link open:", error);
            const a = document.createElement('a');
            a.href = url;
            a.target = '_blank';
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
    };

    // === 5. Lightbox Logic ===
    const lightbox = document.getElementById('lightbox');
    const lightboxContent = document.querySelector('.lightbox-content');
    const lightboxCaption = document.querySelector('.lightbox-caption');
    const closeBtn = document.querySelector('.close-lightbox');

    // Create controls overlay in lightbox for download and delete buttons
    let lightboxControls = document.querySelector('.lightbox-controls');
    if (!lightboxControls && lightbox) {
        lightboxControls = document.createElement('div');
        lightboxControls.className = 'lightbox-controls';

        const dlBtn = document.createElement('div');
        dlBtn.className = 'lightbox-download-btn';
        dlBtn.innerHTML = '📥';
        dlBtn.title = 'Download File';

        const delBtn = document.createElement('div');
        delBtn.className = 'lightbox-delete-btn';
        delBtn.innerHTML = '🗑️';
        delBtn.title = 'Delete Memory';

        lightboxControls.appendChild(dlBtn);
        lightboxControls.appendChild(delBtn);
        lightbox.appendChild(lightboxControls);
    }

    const openLightbox = (item) => {
        lightboxContent.innerHTML = '';

        let newMedia;
        if (item.media_type === 'video') {
            newMedia = document.createElement('video');
            newMedia.src = item.url;
            newMedia.controls = true;
            newMedia.autoplay = true;
            newMedia.playsInline = true;
        } else {
            newMedia = document.createElement('img');
            newMedia.src = item.url;
        }

        lightboxContent.appendChild(newMedia);

        // Clean title and description of filenames
        const cleanT = cleanTitle(item.title);
        const cleanD = cleanTitle(item.description);

        let captionHTML = '';
        if (cleanT) {
            captionHTML += `<strong>${cleanT}</strong>`;
        }
        if (cleanD) {
            if (cleanT) captionHTML += '<br>';
            captionHTML += cleanD;
        }
        lightboxCaption.innerHTML = captionHTML;

        const dlBtn = lightboxControls.querySelector('.lightbox-download-btn');
        const newDlBtn = dlBtn.cloneNode(true);
        lightboxControls.replaceChild(newDlBtn, dlBtn);

        newDlBtn.addEventListener('click', () => {
            const ext = item.media_type === 'video' ? 'mp4' : 'jpg';
            downloadMedia(item.url, item.file_path || `${item.title || 'memory'}.${ext}`);
        });

        // Setup delete button in lightbox (only if Supabase is initialized)
        const delBtn = lightboxControls.querySelector('.lightbox-delete-btn');
        if (delBtn) {
            if (supabase) {
                delBtn.style.display = 'flex';
                const newDelBtn = delBtn.cloneNode(true);
                lightboxControls.replaceChild(newDelBtn, delBtn);
                newDelBtn.addEventListener('click', async () => {
                    const confirmDelete = confirm("Are you sure you want to permanently delete this memory? 🗑️");
                    if (confirmDelete) {
                        closeLightbox();
                        await deleteMemory(item, null);
                    }
                });
            } else {
                delBtn.style.display = 'none';
            }
        }

        lightbox.classList.add('active');
    };

    const closeLightbox = () => {
        if (lightbox) {
            lightbox.classList.remove('active');
            lightboxContent.innerHTML = '';
        }
    };

    if (closeBtn) closeBtn.addEventListener('click', closeLightbox);

    if (lightbox) {
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) {
                closeLightbox();
            }
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && lightbox && lightbox.classList.contains('active')) {
            closeLightbox();
        }
    });


    // === 6. Upload Modal & Form Logic ===
    const uploadModal = document.getElementById('upload-modal');
    const closeUploadBtn = document.querySelector('.close-upload-modal');
    const uploadForm = document.getElementById('upload-form');
    const fileInput = document.getElementById('upload-file');
    const fileDropzone = document.getElementById('file-dropzone');
    const dropzoneContent = document.getElementById('dropzone-content');
    const dropzonePreview = document.getElementById('dropzone-preview');
    const previewContainer = document.getElementById('preview-media-container');
    const changeFileBtn = document.querySelector('.change-file-btn');

    const uploadProgressContainer = document.getElementById('upload-progress-container');
    const uploadProgressBar = document.getElementById('upload-progress-bar');
    const uploadProgressText = document.getElementById('upload-progress-text');
    const uploadError = document.getElementById('upload-error');

    const openUploadModal = () => {
        if (!supabase) {
            openSetupModal();
            return;
        }
        resetUploadForm();

        // Auto-select folder dropdown in modal based on current folder active tab
        const folderDropdown = document.getElementById('upload-folder');
        if (folderDropdown) {
            folderDropdown.value = activeFolder;
        }

        uploadModal.classList.add('active');
    };

    document.querySelectorAll('.upload-trigger-btn').forEach(btn => {
        btn.addEventListener('click', openUploadModal);
    });

    if (closeUploadBtn) {
        closeUploadBtn.addEventListener('click', () => {
            uploadModal.classList.remove('active');
        });
    }

    window.addEventListener('click', (e) => {
        if (e.target === uploadModal) {
            uploadModal.classList.remove('active');
        }
    });

    const resetUploadForm = () => {
        uploadForm.reset();
        fileInput.value = '';
        previewContainer.innerHTML = '';
        dropzonePreview.style.display = 'none';
        dropzoneContent.style.display = 'block';
        uploadProgressContainer.style.display = 'none';
        uploadProgressBar.style.width = '0%';
        uploadError.style.display = 'none';
    };

    if (fileDropzone) {
        fileDropzone.addEventListener('click', () => fileInput.click());

        ['dragenter', 'dragover'].forEach(eventName => {
            fileDropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                fileDropzone.classList.add('dragover');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            fileDropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                fileDropzone.classList.remove('dragover');
            }, false);
        });

        fileDropzone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files.length > 0) {
                fileInput.files = files;
                handleFileSelect(files[0]);
            }
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFileSelect(e.target.files[0]);
            }
        });
    }

    if (changeFileBtn) {
        changeFileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            fileInput.click();
        });
    }

    const handleFileSelect = (file) => {
        previewContainer.innerHTML = '';
        uploadError.style.display = 'none';

        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
            showUploadError('Invalid file type. Please select an image or video.');
            fileInput.value = '';
            return;
        }

        const isVideo = file.type.startsWith('video/');
        const reader = new FileReader();

        reader.onload = (e) => {
            let previewEl;
            if (isVideo) {
                previewEl = document.createElement('video');
                previewEl.src = e.target.result;
                previewEl.muted = true;
                previewEl.controls = true;
            } else {
                previewEl = document.createElement('img');
                previewEl.src = e.target.result;
            }
            previewContainer.appendChild(previewEl);
            dropzoneContent.style.display = 'none';
            dropzonePreview.style.display = 'flex';

            const titleInput = document.getElementById('upload-title');
            if (titleInput && !titleInput.value) {
                const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
                titleInput.value = nameWithoutExt.replace(/[-_]/g, ' ');
            }
        };

        reader.readAsDataURL(file);
    };

    const showUploadError = (message) => {
        uploadError.innerText = message;
        uploadError.style.display = 'block';
        uploadProgressContainer.style.display = 'none';
    };

    if (uploadForm) {
        uploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!supabase) {
                showUploadError("Supabase client is not connected.");
                return;
            }

            const file = fileInput.files[0];
            if (!file) {
                showUploadError("Please select a file to upload.");
                return;
            }

            const folderSelected = document.getElementById('upload-folder').value;
            const title = document.getElementById('upload-title').value.trim() || file.name;
            const description = document.getElementById('upload-desc').value.trim();
            const isVideo = file.type.startsWith('video/');
            const fileExt = file.name.split('.').pop();
            const sanitizedFileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;

            // Organized storage path: /folderName/medias/filename.ext
            const filePath = `${folderSelected}/${isVideo ? 'videos' : 'images'}/${sanitizedFileName}`;

            uploadProgressContainer.style.display = 'block';
            uploadError.style.display = 'none';
            uploadProgressBar.style.width = '10%';
            uploadProgressText.innerText = 'Uploading file to storage...';

            try {
                let progressInterval = setInterval(() => {
                    let curWidth = parseFloat(uploadProgressBar.style.width);
                    if (curWidth < 80) {
                        uploadProgressBar.style.width = `${curWidth + 10}%`;
                        uploadProgressText.innerText = `Uploading file... ${Math.round(curWidth + 10)}%`;
                    }
                }, 200);

                const { data: storageData, error: storageError } = await supabase.storage
                    .from('memories')
                    .upload(filePath, file, {
                        cacheControl: '3600',
                        upsert: false
                    });

                clearInterval(progressInterval);

                if (storageError) throw storageError;

                uploadProgressBar.style.width = '90%';
                uploadProgressText.innerText = 'Creating database record...';

                const { data: { publicUrl } } = supabase.storage
                    .from('memories')
                    .getPublicUrl(filePath);

                const { data: dbData, error: dbError } = await supabase
                    .from('memories')
                    .insert([
                        {
                            url: publicUrl,
                            file_path: filePath,
                            media_type: isVideo ? 'video' : 'image',
                            title: title,
                            description: description,
                            folder: folderSelected // Save classified folder parameter
                        }
                    ])
                    .select();

                if (dbError) throw dbError;

                uploadProgressBar.style.width = '100%';
                uploadProgressText.innerText = 'Successfully saved!';

                // Update memory array
                if (dbData && dbData[0]) {
                    memories.unshift(dbData[0]);

                    // Switch to folder tab where files were uploaded
                    activeFolder = folderSelected;

                    document.querySelectorAll('.folder-tab').forEach(tab => {
                        if (tab.dataset.folder === activeFolder) {
                            tab.classList.add('active');
                        } else {
                            tab.classList.remove('active');
                        }
                    });

                    renderGallery();

                    // Update background collage wall if uploaded file is an image
                    if (!isVideo) {
                        loadBackgroundCollage();
                    }
                }

                setTimeout(() => {
                    uploadModal.classList.remove('active');
                    resetUploadForm();
                }, 1000);

            } catch (err) {
                console.error("Upload failed:", err);
                showUploadError(`Upload failed: ${err.message || 'Unknown error'}`);
            }
        });
    }


    // === 7. Supabase Setup Modal Logic ===
    const setupModal = document.getElementById('setup-modal');
    const connectionStatusBtn = document.getElementById('connection-status-btn');
    const closeSetupBtn = document.getElementById('close-setup-btn');
    const setupForm = document.getElementById('setup-form');

    const openSetupModal = () => {
        let url = SUPABASE_CONFIG.url || localStorage.getItem('supabase_url') || '';
        let key = SUPABASE_CONFIG.anonKey || localStorage.getItem('supabase_anon_key') || '';

        document.getElementById('setup-url').value = url;
        document.getElementById('setup-key').value = key;

        setupModal.classList.add('active');
    };

    if (connectionStatusBtn) {
        connectionStatusBtn.addEventListener('click', openSetupModal);
    }

    if (closeSetupBtn) {
        closeSetupBtn.addEventListener('click', () => {
            setupModal.classList.remove('active');
        });
    }

    window.addEventListener('click', (e) => {
        if (e.target === setupModal) {
            setupModal.classList.remove('active');
        }
    });

    if (setupForm) {
        setupForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const url = document.getElementById('setup-url').value.trim();
            const key = document.getElementById('setup-key').value.trim();

            localStorage.setItem('supabase_url', url);
            localStorage.setItem('supabase_anon_key', key);

            setupModal.classList.remove('active');

            if (initSupabase()) {
                loadBackgroundCollage();
                loadMemories();
            }
        });
    }



    // === 8. Premium Landing Page Engine: Particles, Parallax, Tilt, Transitions ===

    const root = document.documentElement;
    bgImages = document.querySelectorAll('.bg-collage-img');

    let ticking = false;
    let lastScrollY = 0;
    let targetMouseX = 0;
    let targetMouseY = 0;

    handleScroll = () => {
        lastScrollY = window.scrollY;
        if (!ticking) {
            requestAnimationFrame(() => {
                const maxScroll = 800;
                const scrollFraction = Math.min(lastScrollY / maxScroll, 1);
                const currentBlur = 1.5 + (scrollFraction * 3.5);
                const currentDarken = 0.25 + (scrollFraction * 0.20);
                root.style.setProperty('--scroll-blur', `${currentBlur}px`);
                root.style.setProperty('--scroll-darken', currentDarken);
                ticking = false;
            });
            ticking = true;
        }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    // ─── Mouse Parallax + Card Tilt ─────────────────────────────
    const glassCard = document.querySelector('.glass-note');
    const avatarWrapper = document.querySelector('.hero-avatar-wrapper');

    const lerp = (start, end, factor) => start + (end - start) * factor;

    let currentMX = 0, currentMY = 0;
    let rafPaused = false;

    // Throttle mousemove: only update target at most every 2 frames
    let lastMouseUpdate = 0;
    window.addEventListener('mousemove', (e) => {
        const now = performance.now();
        if (now - lastMouseUpdate < 32) return; // ~30fps cap for mouse
        lastMouseUpdate = now;
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        targetMouseX = (e.clientX - cx) / cx;
        targetMouseY = (e.clientY - cy) / cy;
    }, { passive: true });

    // Pause RAF loop when tab is not visible to save CPU
    document.addEventListener('visibilitychange', () => {
        rafPaused = document.hidden;
    });

    const runMouseRAF = () => {
        if (!rafPaused) {
            currentMX = lerp(currentMX, targetMouseX, 0.06);
            currentMY = lerp(currentMY, targetMouseY, 0.06);

            // Card 3D tilt — very subtle
            if (glassCard) {
                const rotX = currentMY * -4;
                const rotY = currentMX * 5;
                glassCard.style.transform = `perspective(1000px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateY(${Math.sin(Date.now() / 2000) * 3}px)`;
            }

            // Avatar tilt — slightly more pronounced
            if (avatarWrapper) {
                const rotX = currentMY * -6;
                const rotY = currentMX * 8;
                avatarWrapper.style.transform = `perspective(800px) rotateX(${rotX}deg) rotateY(${rotY}deg)`;
            }

            // Background photo parallax — use cached _values to avoid parseFloat in hot loop
            const time = Date.now() * 0.00035;
            const bgLen = bgImages.length;
            for (let idx = 0; idx < bgLen; idx++) {
                const img = bgImages[idx];
                // Fall back gracefully if set3DPhotoProperties wasn't called (e.g. legacy HTML imgs)
                const speedX = img._speedX !== undefined ? img._speedX : 10;
                const speedY = img._speedY !== undefined ? img._speedY : 10;
                const tx = img._tx !== undefined ? img._tx : 0;
                const ty = img._ty !== undefined ? img._ty : 0;
                const tz = img._tz !== undefined ? img._tz : 0;
                const rot = img._rot !== undefined ? img._rot : 0;
                const phase = img._floatOffset !== undefined ? img._floatOffset : idx * 0.6;

                const floatX = Math.sin(time + phase) * 16;
                const floatY = Math.cos(time * 0.75 + phase) * 16;
                const floatRot = Math.sin(time * 0.4 + phase) * 3;

                const px = currentMX * speedX + floatX;
                const py = currentMY * speedY + floatY;
                img.style.transform = `translate3d(calc(${tx}px + ${px}px),calc(${ty}px + ${py}px),${tz}px) rotate(${rot + floatRot}deg)`;
            }
        }
        requestAnimationFrame(runMouseRAF);
    };
    runMouseRAF();

    // ─── Canvas Particle System (Fireflies + Dust + Sparkles) ──────
    const initParticleSystem = () => {
        const canvas = document.getElementById('magical-particles');
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { alpha: true });

        let cw = window.innerWidth, ch = window.innerHeight;
        const resize = () => {
            cw = window.innerWidth;
            ch = window.innerHeight;
            canvas.width = cw;
            canvas.height = ch;
        };
        resize();
        window.addEventListener('resize', resize, { passive: true });

        // Reduced counts: 40 particles, 10 sparkles — still beautiful but far lighter
        const PARTICLE_COUNT = 40;
        const SPARKLE_COUNT = 10;

        const particles = [];
        const sparkles = [];

        // Precompute colour strings once — avoids template literals in hot loop
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const isFirefly = Math.random() < 0.4;
            const hue = isFirefly ? (45 + Math.random() * 30 | 0) : (200 + Math.random() * 60 | 0);
            particles.push({
                x: Math.random() * cw,
                y: Math.random() * ch,
                size: isFirefly ? (Math.random() * 2.5 + 1) : (Math.random() * 1.2 + 0.3),
                speedX: (Math.random() - 0.5) * 0.35,
                speedY: (Math.random() - 0.5) * 0.35 - 0.15,
                opacity: Math.random() * 0.7 + 0.1,
                opacityDir: Math.random() > 0.5 ? 1 : -1,
                opacitySpeed: Math.random() * 0.008 + 0.003,
                isFirefly,
                hue,
                pulsePhase: Math.random() * Math.PI * 2,
                // Pre-build colour string for dust particles (never changes)
                dustColor: `hsla(${hue}, 55%, 80%, `,
            });
        }

        for (let i = 0; i < SPARKLE_COUNT; i++) {
            sparkles.push({
                x: Math.random() * cw,
                y: Math.random() * ch,
                size: Math.random() * 2.5 + 0.8,
                opacity: 0,
                life: 0,
                maxLife: 60 + Math.random() * 80,
                delay: Math.random() * 400,
            });
        }

        let frame = 0;
        const TWO_PI = Math.PI * 2;

        const draw = () => {
            if (document.hidden) { requestAnimationFrame(draw); return; }

            ctx.clearRect(0, 0, cw, ch);
            frame++;

            // ── Dust particles (batched by type for fewer ctx state switches) ──
            // First pass: dust motes (simple circles, no gradient)
            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                p.x += p.speedX + currentMX * 0.4;
                p.y += p.speedY + currentMY * 0.4;

                if (p.x < -10) p.x = cw + 10;
                if (p.x > cw + 10) p.x = -10;
                if (p.y < -10) p.y = ch + 10;
                if (p.y > ch + 10) p.y = -10;

                p.opacity += p.opacitySpeed * p.opacityDir;
                if (p.opacity > 0.85 || p.opacity < 0.05) p.opacityDir *= -1;

                if (!p.isFirefly) {
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size, 0, TWO_PI);
                    ctx.fillStyle = p.dustColor + (p.opacity * 0.55).toFixed(2) + ')';
                    ctx.fill();
                }
            }

            // Second pass: fireflies (radial gradient — kept but count is low)
            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                if (!p.isFirefly) continue;

                const pulseSin = Math.sin(frame * 0.03 + p.pulsePhase);
                const pulseSize = p.size * (1 + pulseSin * 0.4);

                // Outer glow
                const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, pulseSize * 5);
                grad.addColorStop(0, `hsla(${p.hue},90%,75%,${p.opacity.toFixed(2)})`);
                grad.addColorStop(0.4, `hsla(${p.hue},80%,60%,${(p.opacity * 0.4).toFixed(2)})`);
                grad.addColorStop(1, `hsla(${p.hue},70%,50%,0)`);
                ctx.beginPath();
                ctx.arc(p.x, p.y, pulseSize * 5, 0, TWO_PI);
                ctx.fillStyle = grad;
                ctx.fill();
                // Bright centre
                ctx.beginPath();
                ctx.arc(p.x, p.y, pulseSize * 0.7, 0, TWO_PI);
                ctx.fillStyle = `hsla(${p.hue},95%,92%,${p.opacity.toFixed(2)})`;
                ctx.fill();
            }

            // ── Gold sparkles (NO shadowBlur — replaced by second larger circle for glow) ──
            for (let i = 0; i < sparkles.length; i++) {
                const s = sparkles[i];
                if (s.delay > 0) { s.delay--; continue; }

                s.life++;
                const progress = s.life / s.maxLife;
                s.opacity = progress < 0.3 ? progress / 0.3 : (progress > 0.7 ? (1 - progress) / 0.3 : 1);

                ctx.save();
                ctx.translate(s.x, s.y);
                ctx.rotate(frame * 0.02);
                ctx.globalAlpha = s.opacity * 0.85;

                const arm = s.size * 4;
                // Soft halo (cheap glow without shadowBlur)
                ctx.beginPath();
                ctx.arc(0, 0, arm * 0.9, 0, TWO_PI);
                ctx.fillStyle = 'rgba(217,180,91,0.18)';
                ctx.fill();
                // Star shape
                ctx.beginPath();
                for (let j = 0; j < 4; j++) {
                    const angle = (j * Math.PI) / 2;
                    ctx.lineTo(Math.cos(angle) * arm, Math.sin(angle) * arm);
                    ctx.lineTo(Math.cos(angle + Math.PI / 4) * (arm * 0.25), Math.sin(angle + Math.PI / 4) * (arm * 0.25));
                }
                ctx.closePath();
                ctx.fillStyle = '#D9B45B';
                ctx.fill();
                ctx.restore();
                ctx.globalAlpha = 1;

                if (s.life >= s.maxLife) {
                    s.x = Math.random() * cw;
                    s.y = Math.random() * ch;
                    s.life = 0;
                    s.opacity = 0;
                    s.maxLife = 60 + Math.random() * 80;
                    s.delay = Math.random() * 300;
                }
            }

            requestAnimationFrame(draw);
        };
        draw();
    };

    initParticleSystem();

    // ─── Staggered Word Title Reveal (after overlay dissolves) ──────
    const revealHeroWords = () => {
        const words = document.querySelectorAll('.cinematic-title .word');
        words.forEach((word, i) => {
            setTimeout(() => {
                word.classList.add('reveal-active');
            }, i * 280);
        });
    };

    // ─── CTA Journey Transition ──────────────────────────────────
    const initJourneyButton = () => {
        const btn = document.getElementById('cta-journey-btn');
        const memoriesSection = document.querySelector('.memories-section');
        if (!btn || !memoriesSection) return;

        btn.addEventListener('click', () => {
            if (journeyTransitionActive) return;
            journeyTransitionActive = true;

            const overlay = document.querySelector('.overlay');
            const heroEl = document.querySelector('.hero-section');
            const avatarEl = document.querySelector('.hero-avatar-wrapper');
            const cardEl = document.querySelector('.glass-note');
            const bgImgList = document.querySelectorAll('.bg-collage-img');

            // Step 1 — Button fades out text, morphs to glow circle
            btn.style.transition = 'all 0.6s cubic-bezier(0.76, 0, 0.24, 1)';
            btn.style.width = '70px';
            btn.style.height = '70px';
            btn.style.borderRadius = '50%';
            btn.style.padding = '0';
            btn.style.boxShadow = '0 0 30px 8px rgba(217, 180, 91, 0.55), 0 0 80px 20px rgba(217, 180, 91, 0.2)';
            btn.style.background = 'rgba(217, 180, 91, 0.18)';
            btn.querySelectorAll('span').forEach(s => { s.style.opacity = '0'; });

            // Step 2 — Overlay darkens (450ms)
            setTimeout(() => {
                if (overlay) overlay.classList.add('overlay-journey-active');
            }, 450);

            // Step 3 — Profile image enlarges (550ms)
            setTimeout(() => {
                if (avatarEl) avatarEl.classList.add('avatar-journey-active');
            }, 550);

            // Step 4 — Glass card fades back (650ms)
            setTimeout(() => {
                if (cardEl) cardEl.classList.add('card-journey-active');
            }, 650);

            // Step 5 — Photos fly outward (800ms)
            setTimeout(() => {
                bgImgList.forEach(img => img.classList.add('photos-journey-active'));
            }, 800);

            // Step 6 — Gallery fades in, hero section hidden (2200ms)
            setTimeout(() => {
                if (heroEl) heroEl.classList.add('hidden-hero');
                memoriesSection.classList.add('reveal-gallery');
                // Smooth scroll to the gallery
                memoriesSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                journeyTransitionActive = false;
            }, 2200);
        });
    };

    initJourneyButton();




    // === 9.5. Interactive Cake Intro & Typewriter note logic ===
    let micStream = null;
    let audioCtx = null;
    let analyser = null;
    let dataArray = null;
    let source = null;
    let isTransitioning = false; // Prevent double trigger

    const typewriteNote = () => {
        const noteEl = document.querySelector('.handwritten-note');
        if (!noteEl || !noteText) return;

        noteEl.innerHTML = '';
        noteEl.style.opacity = '0.88'; // restore design opacity
        // Split text into words, then words into letters, to prevent weird line wrapping
        const words = noteText.split(' ');
        const letters = [];

        words.forEach((word, wordIndex) => {
            // Create a span for the word to prevent breaking
            const wordSpan = document.createElement('span');
            wordSpan.style.display = 'inline-block';
            wordSpan.style.whiteSpace = 'nowrap';

            // Split word into characters
            word.split('').forEach(char => {
                const span = document.createElement('span');
                span.className = 'letter';
                span.textContent = char;
                wordSpan.appendChild(span);
                letters.push(span);
            });

            noteEl.appendChild(wordSpan);

            // Add space after word if it's not the last one
            if (wordIndex < words.length - 1) {
                const spaceSpan = document.createElement('span');
                spaceSpan.className = 'letter';
                spaceSpan.innerHTML = '&nbsp;';
                noteEl.appendChild(spaceSpan);
                letters.push(spaceSpan);
            }
        });

        let index = 0;
        const delay = 15; // elegant handwriting letter-by-letter speed: increased from 40ms to 15ms for faster loading

        function revealLetter() {
            if (index < letters.length) {
                letters[index].classList.add('revealed');
                index++;
                setTimeout(revealLetter, delay);
            }
        }

        // Start handwritten typing after staggered title animation is complete (approx 1.2s)
        setTimeout(revealLetter, 1200);
    };

    const startMicDetection = async () => {
        const enableMicBtn = document.getElementById('enable-mic-btn');
        const btnText = enableMicBtn ? enableMicBtn.querySelector('.btn-text') : null;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            micStream = stream;

            if (enableMicBtn) {
                enableMicBtn.classList.add('listening');
                if (btnText) btnText.innerText = 'Mic Active! Blow now! 💨';
            }

            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;

            const bufferLength = analyser.frequencyBinCount;
            dataArray = new Uint8Array(bufferLength);

            source = audioCtx.createMediaStreamSource(stream);
            source.connect(analyser);

            const checkVolume = () => {
                if (isTransitioning) return;
                analyser.getByteFrequencyData(dataArray);

                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    sum += dataArray[i];
                }
                const average = sum / dataArray.length;

                // Blowing sound threshold
                if (average > 50) {
                    triggerCakeBlow();
                } else {
                    requestAnimationFrame(checkVolume);
                }
            };

            requestAnimationFrame(checkVolume);

        } catch (err) {
            console.warn("Microphone access not granted:", err);
            if (enableMicBtn) {
                enableMicBtn.style.display = 'none';
            }
            const fallbackTip = document.querySelector('.fallback-tip');
            if (fallbackTip) {
                fallbackTip.innerHTML = '🎤 Mic not allowed. <strong>Click or tap the cake</strong> directly to light candles and cut it! 🎂';
                fallbackTip.style.color = '#f43f5e';
            }
        }
    };

    const triggerCakeBlow = () => {
        if (isTransitioning) return;
        isTransitioning = true;

        stopMicDetection();

        // 1. Light candles one by one (staggered cascade)
        const candles = document.querySelectorAll('.candle');
        candles.forEach((candle, i) => {
            setTimeout(() => candle.classList.add('lit'), i * 130);
        });
        const music = document.getElementById("birthdayMusic");

        if (music) {
            music.currentTime = 0;
            music.play().catch(err => console.log(err));
        }

        // Update mic button label
        const enableMicBtn = document.getElementById('enable-mic-btn');
        if (enableMicBtn) {
            enableMicBtn.className = 'enable-mic-btn';
            const btnText = enableMicBtn.querySelector('.btn-text');
            if (btnText) btnText.innerText = 'Wish Granted! ✨';
        }

        // 2. After candles light, dissolve the whole overlay away
        setTimeout(() => {
            const overlay = document.getElementById('intro-overlay');
            if (overlay) overlay.classList.add('cake-cut');  // triggers CSS dissolve

            // Reveal main content simultaneously
            const contentWrapper = document.querySelector('.content-wrapper');
            if (contentWrapper) contentWrapper.classList.add('reveal-active');

            // 3. Remove overlay from DOM after dissolve completes
            setTimeout(() => {
                if (overlay) {
                    overlay.classList.add('hidden');
                    setTimeout(() => overlay.remove(), 500);
                }
                // Fire staggered title words + handwritten letter reveal
                revealHeroWords();
                typewriteNote();
            }, 1700);
        }, 1100);
    };

    const stopMicDetection = () => {
        if (source) {
            try { source.disconnect(); } catch (e) { }
        }
        if (audioCtx) {
            try { audioCtx.close(); } catch (e) { }
        }
        if (micStream) {
            try {
                micStream.getTracks().forEach(track => track.stop());
            } catch (e) { }
        }
    };

    // (spawnConfettiBurst removed — dissolve transition used instead)

    const initIntroScreen = () => {
        const enableMicBtn = document.getElementById('enable-mic-btn');
        const cakeWrapper = document.getElementById('interactive-cake');

        if (enableMicBtn) {
            enableMicBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                startMicDetection();
            });
        }

        if (cakeWrapper) {
            cakeWrapper.addEventListener('click', () => {
                triggerCakeBlow();
            });
        }
    };


    // === 10. Start Application Flow ===
    const supabaseInitialized = initSupabase();
    initIntroScreen();
    setupFolderTabs();
    loadBackgroundCollage(); // Always load background collage (handles both Supabase and local fallback)

    if (supabaseInitialized) {
        loadMemories();          // full gallery data
    } else {
        console.log("Supabase not configured. Using local fallback cards.");
        setupLocalFallbackCards();
    }
});
