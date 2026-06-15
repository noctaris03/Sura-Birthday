document.addEventListener('DOMContentLoaded', () => {
    // === 1. Supabase Initialization & State ===
    let supabase = null;
    let memories = [];
    let activeFolder = 'Abhijith'; // Default active folder
    let bgImages = [];
    let handleScroll = () => {};

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

    // === 2. Intersection Observer for Video Auto-Play and Card Animation ===
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.25 
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const video = entry.target.querySelector('video');

            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                
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

    // Render active folder gallery (shuffled each time)
    const renderGallery = () => {
        if (!timelineContainer) return;
        timelineContainer.innerHTML = '';
        
        // Filter memories by selected folder
        const filtered = memories.filter(item => (item.folder || 'Abhijith') === activeFolder);
        
        if (filtered.length === 0) {
            // Show a beautiful empty state
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'empty-gallery';
            emptyDiv.innerHTML = `
                <div class="empty-gallery-icon">✨📚✨</div>
                <h3>This folder is empty</h3>
                <p>Upload a photo or video to fill ${activeFolder}'s folder with memories! 💫</p>
            `;
            timelineContainer.appendChild(emptyDiv);
        } else {
            // Shuffle on every render so order is different each page load
            const shuffled = [...filtered].sort(() => Math.random() - 0.5);

            shuffled.forEach((item, index) => {
                // First 6 cards load eagerly for instant above-the-fold display
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
            
            // Replace skeletons with real shuffled gallery
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
        if (!supabase) return;
        try {
            // Fetch only image URLs, randomised via limit — very fast query
            const { data, error } = await supabase
                .from('memories')
                .select('url')
                .eq('media_type', 'image')
                .limit(80); // fetch 80, we'll pick 20 randomly

            if (error || !data || data.length === 0) return;

            // Shuffle and pick 20
            const picked = [...data]
                .sort(() => Math.random() - 0.5)
                .slice(0, 20);

            const collageGrid = document.querySelector('.bg-collage-grid');
            if (!collageGrid) return;

            collageGrid.innerHTML = '';
            picked.forEach(item => {
                const img = document.createElement('img');
                img.src = item.url;
                img.className = 'bg-collage-img';
                img.loading = 'eager';  // load immediately — these are background visuals
                img.decoding = 'async';
                img.dataset.speed = (Math.random() * 0.4) - 0.2;
                collageGrid.appendChild(img);
            });

            // Hook up parallax
            bgImages = document.querySelectorAll('.bg-collage-img');
            handleScroll();

        } catch (err) {
            console.warn('Background collage load failed:', err.message);
        }
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
        const collageGrid = document.querySelector('.bg-collage-grid');
        if (!collageGrid) return;

        const bgImagesData = memories.filter(item => item.media_type === 'image');
        if (bgImagesData.length === 0) return;

        // Shuffle and pick only 20 for speed
        const shuffled = [...bgImagesData]
            .sort(() => Math.random() - 0.5)
            .slice(0, 20);

        collageGrid.innerHTML = '';
        shuffled.forEach(item => {
            const img = document.createElement('img');
            img.src = item.url;
            img.className = 'bg-collage-img';
            img.loading = 'eager';
            img.decoding = 'async';
            img.dataset.speed = (Math.random() * 0.4) - 0.2;
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
                loadMemories();
            }
        });
    }


    // === 8. Floating Fireflies / Dust Particles (Original magic logic) ===
    const createFireflies = () => {
        const body = document.querySelector('body');
        const numFireflies = 50;

        for (let i = 0; i < numFireflies; i++) {
            const firefly = document.createElement('div');
            firefly.classList.add('firefly');
            
            const size = Math.random() * 2 + 1; 
            firefly.style.width = `${size}px`;
            firefly.style.height = `${size}px`;
            firefly.style.left = `${Math.random() * 100}vw`;
            firefly.style.top = `${Math.random() * 200}vh`;
            
            const duration = Math.random() * 5 + 4; 
            
            firefly.style.transition = `transform ${duration}s ease-in-out, opacity ${duration}s ease-in-out`;
            firefly.style.opacity = Math.random() * 0.4 + 0.1;

            body.appendChild(firefly);

            setInterval(() => {
                const moveX = (Math.random() - 0.5) * 80;
                const moveY = (Math.random() - 0.5) * 80;
                firefly.style.transform = `translate(${moveX}px, ${moveY}px)`;
                firefly.style.opacity = Math.random() * 0.5 + 0.1;
            }, duration * 1000);
        }
    };

    createFireflies();


    // === 9. Scroll effect for background collage (Original parallax logic) ===
    const root = document.documentElement;
    bgImages = document.querySelectorAll('.bg-collage-img');
    
    bgImages.forEach(img => {
        if (!img.dataset.speed) {
            img.dataset.speed = (Math.random() * 0.4) - 0.2; 
        }
    });

    handleScroll = () => {
        const scrollY = window.scrollY;
        
        const maxScroll = 800; 
        const scrollFraction = Math.min(scrollY / maxScroll, 1);
        const currentBlur = 3 + (scrollFraction * 12);
        const currentDarken = 0.2 + (scrollFraction * 0.6);
        root.style.setProperty('--scroll-blur', `${currentBlur}px`);
        root.style.setProperty('--scroll-darken', currentDarken);

        bgImages.forEach(img => {
            const speed = parseFloat(img.dataset.speed) || 0;
            const yOffset = scrollY * speed;
            img.style.transform = `translateY(${yOffset}px)`;
        });
    };

    window.addEventListener('scroll', () => handleScroll());
    handleScroll(); 


    // === 10. Start Application Flow ===
    setupFolderTabs();
    if (initSupabase()) {
        // Fire both in parallel — background loads fast, gallery loads separately
        loadBackgroundCollage(); // fast: only fetches 80 image URLs
        loadMemories();          // full gallery data
    } else {
        console.log("Supabase not configured. Using local fallback cards.");
        setupLocalFallbackCards();
    }
});
