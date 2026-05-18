const initialStateElement = document.getElementById('initial-state');

if (initialStateElement) {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const state = JSON.parse(initialStateElement.textContent);
    let selectedBookId = null;
    let notesOpen = false;
    let controlsOpen = false;
    let bookshelfPreferencesOpen = false;
    let notesPreferencesOpen = false;
    let searchResults = [];
    let addBookSelection = null;
    const refreshSelection = new Set();

    const canvas = document.getElementById('bookcase-canvas');
    const ctx = canvas.getContext('2d');
    const toggleControlsButton = document.getElementById('toggle-controls');
    const toggleNotesButton = document.getElementById('toggle-notes');
    const controlsPanel = document.getElementById('controls-panel');
    const notesPanel = document.getElementById('notes-panel');
    const closeControlsButton = document.getElementById('close-controls');
    const closeNotesButton = document.getElementById('close-notes');
    const overlayBackdrop = document.getElementById('overlay-backdrop');
    const selectedBookLabel = document.getElementById('selected-book-label');
    const selectedBookMeta = document.getElementById('selected-book-meta');
    const selectedBookCoverPicker = document.getElementById('selected-book-cover-picker');
    const notesList = document.getElementById('notes-list');
    const bookSearchForm = document.getElementById('book-search-form');
    const bookSearchFeedback = document.getElementById('book-search-feedback');
    const bookSearchResults = document.getElementById('book-search-results');
    const addBookForm = document.getElementById('add-book-form');
    const addBookCoverPicker = document.getElementById('add-book-cover-picker');
    const metadataRefreshFeedback = document.getElementById('metadata-refresh-feedback');
    const metadataRefreshList = document.getElementById('metadata-refresh-list');
    const refreshSelectedBooksButton = document.getElementById('refresh-selected-books');
    const refreshAllBooksButton = document.getElementById('refresh-all-books');
    const removeBookButton = document.getElementById('remove-book');
    const addNoteForm = document.getElementById('add-note-form');
    const openBookshelfPreferencesButton = document.getElementById('open-bookshelf-preferences');
    const openNotesPreferencesButton = document.getElementById('open-notes-preferences');
    const bookshelfPreferencesPanel = document.getElementById('bookshelf-preferences-panel');
    const notesPreferencesPanel = document.getElementById('notes-preferences-panel');
    const closeBookshelfPreferencesButton = document.getElementById('close-bookshelf-preferences');
    const closeNotesPreferencesButton = document.getElementById('close-notes-preferences');
    const bookshelfPreferencesForm = document.getElementById('bookshelf-preferences-form');
    const notesPreferencesForm = document.getElementById('notes-preferences-form');

    const animatedBooks = new Map();
    const coverImages = new Map();
    const buttonState = {
        controlsOpen: null,
        notesOpen: null,
    };
    let dragState = null;

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const isMobileViewport = () => window.matchMedia('(max-width: 640px)').matches;
    const hexToRgb = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result
            ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
            : { r: 100, g: 60, b: 20 };
    };
    const spineTextColor = (hex) => {
        const { r, g, b } = hexToRgb(hex);
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? '#1f2937' : '#fef9ee';
    };

    // Slot layout constants
    const MIN_SLOT_COUNT = 12;         // minimum slots per shelf to keep spines readable
    const DECORATION_SLOT_BUFFER = 4;  // extra slots reserved at the right end for decoration objects
    // Font size is capped by spine WIDTH: after -90° rotation, the character height maps to the spine's
    // narrow dimension, so we limit by anim.w rather than anim.h.
    const MIN_SPINE_FONT_SIZE = 7;     // px — legible at minimum spine width
    const MAX_SPINE_FONT_SIZE = 10;    // px — cap so rotated characters fit within the narrow spine
    const SPINE_FONT_PADDING = 3;      // px — safety gap between font size and spine width
    const SPINE_FONT_MIN_ADJUSTMENT = 1;
    const SPINE_FONT_MAX_ADJUSTMENT = 2;
    const MAX_DECORATION_ICON_SIZE = 13; // px — maximum icon font size inside decoration objects
    const DRAG_MOVEMENT_THRESHOLD = 6;
    const DEFAULT_ROTATION_MODE = 'upright';

    /** Scroll to an element after a short delay to let the panel animate open */
    const scrollToElementAfterDelay = (elementId, delay = 120) => {
        setTimeout(() => document.getElementById(elementId)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), delay);
    };
    const isDraggingBook = (bookId) => Boolean(dragState && dragState.bookId === bookId);
    const openPanel = (panel) => {
        controlsOpen = panel === 'controls';
        notesOpen = panel === 'notes';
        bookshelfPreferencesOpen = panel === 'bookshelfPreferences';
        notesPreferencesOpen = panel === 'notesPreferences';
        syncPanels();
    };

    /** Return the book (or null) whose spine rect contains (x, y) in canvas coordinates */
    const findBookAtPoint = (x, y) => {
        for (const book of [...state.books].reverse()) {
            const anim = animatedBooks.get(book.id);
            if (anim && x >= anim.x && x <= anim.x + anim.w && y >= anim.y && y <= anim.y + anim.h) {
                return book;
            }
        }
        return null;
    };

    const safeCoverUrl = (value) => {
        if (typeof value !== 'string' || !value) {
            return null;
        }

        try {
            const url = new URL(value, window.location.origin);
            return url.protocol === 'https:' && url.hostname === 'covers.openlibrary.org'
                ? url.toString()
                : null;
        } catch {
            return null;
        }
    };

    const fetchJson = async (url, method = 'GET', payload = null) => {
        const response = await fetch(url, {
            method,
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: payload ? JSON.stringify(payload) : undefined,
        });

        if (!response.ok) {
            throw new Error('Request failed');
        }

        return response.json();
    };

    const themeColors = () => {
        if (state.preferences.bookcaseTheme === 'walnut') {
            return { shelf: '#5d3a1a', frame: '#3f2510', background: '#f0e0d0' };
        }
        if (state.preferences.bookcaseTheme === 'midnight') {
            return { shelf: '#1d253a', frame: '#101723', background: '#d5dbf0' };
        }
        return { shelf: '#9a6d3d', frame: '#6f4e37', background: '#f8efe5' };
    };

    const slotLayout = () => {
        const shelves = clamp(Number(state.preferences.shelfCount) || 4, 2, 8);
        const padding = 28;
        const shelfSpacing = (canvas.height - (padding * 2)) / shelves;
        const maxPosition = state.books.reduce((largest, book) => Math.max(largest, Number(book.positionIndex) || 0), 0);
        // MIN_SLOT_COUNT keeps spines readable; DECORATION_SLOT_BUFFER reserves end slots for objects
        const slotCount = Math.max(MIN_SLOT_COUNT, maxPosition + DECORATION_SLOT_BUFFER);
        const slotWidth = (canvas.width - (padding * 2)) / slotCount;
        return { shelves, slotCount, padding, shelfSpacing, slotWidth };
    };

    const rotationAngle = (mode) => {
        if (mode === 'side') return Math.PI / 2; // 90°
        if (mode === 'tilt_left') return -(Math.PI / 9); // -20°
        if (mode === 'tilt_right') return Math.PI / 9; // 20°
        return 0;
    };

    const bookTargetRect = (book) => {
        const { shelves, slotCount, padding, shelfSpacing, slotWidth } = slotLayout();
        const shelf = clamp(book.shelfIndex, 0, shelves - 1);
        const pos = clamp(book.positionIndex, 0, slotCount - 1);
        const mode = book.rotationMode || DEFAULT_ROTATION_MODE;
        const uprightH = Math.max(72, shelfSpacing * 0.82);
        const uprightW = Math.max(24, Math.min(slotWidth * 0.95, 40));
        const shelfTop = padding + (shelfSpacing * (shelf + 1));
        const angle = rotationAngle(mode);

        if (mode === 'side') {
            const h = Math.max(18, Math.min(shelfSpacing * 0.28, 32));
            const w = Math.max(58, Math.min(slotWidth * 1.9, 86));
            const x = padding + (slotWidth * pos) + (slotWidth - w) / 2;
            const y = shelfTop - h - 7;
            return { x, y, w, h, a: angle };
        }

        const x = padding + (slotWidth * pos) + (slotWidth - uprightW) / 2;
        const y = padding + (shelfSpacing * shelf) + (shelfSpacing - uprightH - 10);
        return { x, y, w: uprightW, h: uprightH, a: angle };
    };

    const ensureAnimatedBooks = () => {
        const seen = new Set();
        for (const book of state.books) {
            seen.add(book.id);
            const target = bookTargetRect(book);
            const existing = animatedBooks.get(book.id);
            if (!existing) {
                animatedBooks.set(book.id, {
                    ...target,
                    tx: target.x,
                    ty: target.y,
                    tw: target.w,
                    th: target.h,
                    a: target.a,
                    ta: target.a,
                });
                continue;
            }
            existing.tx = target.x;
            existing.ty = target.y;
            existing.tw = target.w;
            existing.th = target.h;
            existing.ta = target.a;
        }

        for (const id of [...animatedBooks.keys()]) {
            if (!seen.has(id)) {
                animatedBooks.delete(id);
            }
        }
    };

    const roundRect = (x, y, width, height, radius) => {
        const r = Math.min(radius, width / 2, height / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + width, y, x + width, y + height, r);
        ctx.arcTo(x + width, y + height, x, y + height, r);
        ctx.arcTo(x, y + height, x, y, r);
        ctx.arcTo(x, y, x + width, y, r);
        ctx.closePath();
    };

    const imageRecord = (url) => {
        const safeUrl = safeCoverUrl(url);

        if (!safeUrl) {
            return null;
        }

        const existing = coverImages.get(safeUrl);
        if (existing) {
            return existing;
        }

        const image = new Image();
        const record = { image, loaded: false, failed: false };
        image.onload = () => {
            record.loaded = true;
        };
        image.onerror = () => {
            record.failed = true;
        };
        image.src = safeUrl;
        coverImages.set(safeUrl, record);
        return record;
    };

    // ── Spine drawing with cover texture ──────────────────────
    const drawBookSpine = (book, anim) => {
        const base = book.spineColor || '#6f4e37';
        const cover = imageRecord(book.coverUrl);
        roundRect(anim.x, anim.y, anim.w, anim.h, 3);
        ctx.fillStyle = base;
        ctx.fill();

        if (cover && cover.loaded && !cover.failed) {
            const sourceWidth = Math.max(1, Math.floor(cover.image.width * 0.22));
            const sourceX = Math.floor((cover.image.width - sourceWidth) / 2);
            ctx.save();
            roundRect(anim.x, anim.y, anim.w, anim.h, 3);
            ctx.clip();
            ctx.drawImage(
                cover.image,
                sourceX,
                0,
                sourceWidth,
                cover.image.height,
                anim.x,
                anim.y,
                anim.w,
                anim.h,
            );
            ctx.restore();
        }

        const gradient = ctx.createLinearGradient(anim.x, anim.y, anim.x + anim.w, anim.y);
        gradient.addColorStop(0, 'rgba(0,0,0,0.45)');
        gradient.addColorStop(0.18, 'rgba(0,0,0,0.08)');
        gradient.addColorStop(0.82, 'rgba(0,0,0,0.08)');
        gradient.addColorStop(1, 'rgba(0,0,0,0.3)');
        roundRect(anim.x, anim.y, anim.w, anim.h, 3);
        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.save();
        ctx.translate(anim.x + anim.w / 2, anim.y + anim.h - 7);
        ctx.rotate(-Math.PI / 2);
        const fontSize = Math.max(
            MIN_SPINE_FONT_SIZE + SPINE_FONT_MIN_ADJUSTMENT,
            Math.min(MAX_SPINE_FONT_SIZE + SPINE_FONT_MAX_ADJUSTMENT, anim.w - SPINE_FONT_PADDING),
        );
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.fillStyle = '#f8fafc';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillText((book.title || '').slice(0, 26), 0, 0, anim.h - 18);
        ctx.restore();
    };

    // ── Bookshelf decoration rects (preferences mug, notes notepad, add-book ghost) ──
    const getDecorationRects = () => {
        const { shelves, slotCount, padding, shelfSpacing, slotWidth } = slotLayout();
        const h = Math.max(72, shelfSpacing * 0.82);
        const w = Math.max(20, Math.min(slotWidth * 0.80, 32));
        const slotX = (pos) => padding + slotWidth * pos + (slotWidth - w) / 2;
        const slotY = (shelf) => padding + shelfSpacing * shelf + (shelfSpacing - h - 10);

        return {
            // Preferences mug — last slot, top shelf
            preferences: { x: slotX(slotCount - 1), y: slotY(0),            w, h },
            // Notes notepad — last slot, bottom shelf
            notes:       { x: slotX(slotCount - 1), y: slotY(shelves - 1), w, h },
            // Add-book ghost — second-to-last slot, top shelf
            addBook:     { x: slotX(slotCount - 2), y: slotY(0),            w, h },
        };
    };

    const hitTest = (x, y, rect) =>
        x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;

    const drawMug = (rect) => {
        const { x, y, w, h } = rect;
        const bx = x + 2, by = y + h * 0.28, bw = w - 7, bh = h * 0.58;

        // Mug body
        ctx.fillStyle = '#e8d5b5';
        roundRect(bx, by, bw, bh, 4);
        ctx.fill();
        ctx.strokeStyle = '#c4a97d';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Handle arc
        ctx.strokeStyle = '#e8d5b5';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(bx + bw + 5, by + bh * 0.48, bh * 0.28, -Math.PI * 0.5, Math.PI * 0.5);
        ctx.stroke();

        // Steam wisps
        ctx.strokeStyle = 'rgba(210,210,210,0.7)';
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 2; i++) {
            const sx = bx + bw * (0.28 + i * 0.38);
            ctx.beginPath();
            ctx.moveTo(sx, by - 3);
            ctx.quadraticCurveTo(sx + 4, by - 11, sx, by - 19);
            ctx.stroke();
        }

        // Gear icon — signals "preferences"
        ctx.fillStyle = '#7a5c3a';
        ctx.font = `${Math.min(bw - 2, MAX_DECORATION_ICON_SIZE)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚙', bx + bw / 2, by + bh / 2);
    };

    const drawNotepad = (rect) => {
        const { x, y, w, h } = rect;
        const px = x + 2, py = y + h * 0.08, pw = w - 4, ph = h * 0.78;

        // Notepad body
        ctx.fillStyle = '#fffde6';
        roundRect(px, py, pw, ph, 3);
        ctx.fill();
        ctx.strokeStyle = '#d4c56a';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Ruled lines
        ctx.strokeStyle = '#b0a878';
        ctx.lineWidth = 0.7;
        for (let i = 0; i < 4; i++) {
            const ly = py + ph * (0.22 + i * 0.16);
            ctx.beginPath();
            ctx.moveTo(px + 3, ly);
            ctx.lineTo(px + pw - 3, ly);
            ctx.stroke();
        }

        // Pencil icon — signals "notes"
        ctx.fillStyle = '#6b5a2b';
        ctx.font = `${Math.min(pw - 2, MAX_DECORATION_ICON_SIZE)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✏', px + pw / 2, py + ph / 2);

        // Spiral binding dots at top
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(px + pw * (0.22 + i * 0.28), py + 5, 2.5, 0, Math.PI * 2);
            ctx.stroke();
        }
    };

    const drawGhostBook = (rect) => {
        const { x, y, w, h } = rect;

        // Dashed spine outline
        ctx.save();
        ctx.globalAlpha = 0.5;
        roundRect(x, y, w, h, 3);
        ctx.strokeStyle = '#9ca3af';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // Plus symbol
        ctx.fillStyle = '#9ca3af';
        ctx.font = `bold ${Math.min(w + 6, MAX_DECORATION_ICON_SIZE + 9)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('+', x + w / 2, y + h / 2);
    };

    const drawDecorations = () => {
        const decors = getDecorationRects();
        drawMug(decors.preferences);
        drawNotepad(decors.notes);
        drawGhostBook(decors.addBook);
    };

    const drawBookcase = () => {
        const { shelves, padding, shelfSpacing } = slotLayout();
        const colors = themeColors();

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = colors.background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = colors.frame;
        if (state.preferences.bookcaseShape === 'arched') {
            ctx.beginPath();
            ctx.moveTo(12, canvas.height - 8);
            ctx.lineTo(12, 36);
            ctx.quadraticCurveTo(canvas.width / 2, -18, canvas.width - 12, 36);
            ctx.lineTo(canvas.width - 12, canvas.height - 8);
            ctx.closePath();
            ctx.fill();
        } else {
            ctx.fillRect(8, 8, canvas.width - 16, canvas.height - 16);
        }

        for (let shelf = 0; shelf < shelves; shelf += 1) {
            const y = padding + (shelfSpacing * (shelf + 1));
            ctx.fillStyle = colors.shelf;
            ctx.fillRect(padding, y - (state.preferences.bookcaseShape === 'minimal' ? 4 : 8), canvas.width - (padding * 2), state.preferences.bookcaseShape === 'minimal' ? 4 : 8);
        }

        for (const book of state.books) {
            const anim = animatedBooks.get(book.id);
            if (!anim) continue;

            if (reducedMotion) {
                if (!isDraggingBook(book.id)) {
                    anim.x = anim.tx;
                    anim.y = anim.ty;
                    anim.w = anim.tw;
                    anim.h = anim.th;
                }
                anim.a = anim.ta;
            } else {
                if (!isDraggingBook(book.id)) {
                    anim.x += (anim.tx - anim.x) * 0.2;
                    anim.y += (anim.ty - anim.y) * 0.2;
                    anim.w += (anim.tw - anim.w) * 0.2;
                    anim.h += (anim.th - anim.h) * 0.2;
                }
                anim.a += (anim.ta - anim.a) * 0.25;
            }

            ctx.save();
            ctx.translate(anim.x + anim.w / 2, anim.y + anim.h / 2);
            ctx.rotate(anim.a || 0);
            ctx.shadowColor = 'rgba(0, 0, 0, 0.38)';
            ctx.shadowBlur = 6;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 3;
            roundRect(-anim.w / 2, -anim.h / 2, anim.w, anim.h, 3);
            ctx.fillStyle = book.spineColor || '#6f4e37';
            ctx.fill();
            ctx.restore();

            ctx.save();
            ctx.translate(anim.x + anim.w / 2, anim.y + anim.h / 2);
            ctx.rotate(anim.a || 0);
            drawBookSpine(book, { x: -anim.w / 2, y: -anim.h / 2, w: anim.w, h: anim.h });
            ctx.restore();

            if (selectedBookId === book.id) {
                ctx.save();
                ctx.translate(anim.x + anim.w / 2, anim.y + anim.h / 2);
                ctx.rotate(anim.a || 0);
                ctx.shadowColor = '#fbbf24';
                ctx.shadowBlur = 10;
                roundRect(-anim.w / 2, -anim.h / 2, anim.w, anim.h, 3);
                ctx.strokeStyle = '#fbbf24';
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.restore();
            }
        }

        // Draw shelf decoration objects (preferences, notes, add-book)
        drawDecorations();

        requestAnimationFrame(drawBookcase);
    };

    const setCanvasSize = () => {
        const bounds = canvas.parentElement.getBoundingClientRect();
        canvas.width = Math.max(320, Math.floor(bounds.width));
        canvas.height = Math.max(340, Math.floor(window.innerHeight));
        ensureAnimatedBooks();
    };

    const syncPanels = () => {
        // Both panels are always full-height overlays — no side-by-side mode
        toggleControlsButton.hidden = true;
        toggleNotesButton.hidden = true;

        controlsPanel.classList.toggle('open', controlsOpen);
        notesPanel.classList.toggle('open', notesOpen);
        bookshelfPreferencesPanel.classList.toggle('open', bookshelfPreferencesOpen);
        notesPreferencesPanel.classList.toggle('open', notesPreferencesOpen);
        controlsPanel.setAttribute('aria-hidden', controlsOpen ? 'false' : 'true');
        notesPanel.setAttribute('aria-hidden', notesOpen ? 'false' : 'true');
        bookshelfPreferencesPanel.setAttribute('aria-hidden', bookshelfPreferencesOpen ? 'false' : 'true');
        notesPreferencesPanel.setAttribute('aria-hidden', notesPreferencesOpen ? 'false' : 'true');
        overlayBackdrop.hidden = !(controlsOpen || notesOpen || bookshelfPreferencesOpen || notesPreferencesOpen);

        if (buttonState.controlsOpen !== controlsOpen) {
            toggleControlsButton.setAttribute('aria-expanded', controlsOpen ? 'true' : 'false');
            buttonState.controlsOpen = controlsOpen;
        }

        if (buttonState.notesOpen !== notesOpen) {
            toggleNotesButton.setAttribute('aria-expanded', notesOpen ? 'true' : 'false');
            buttonState.notesOpen = notesOpen;
        }
    };

    const renderCoverOptions = (container, covers, selectedCoverId, onSelect, emptyMessage) => {
        container.innerHTML = '';

        const validCovers = (covers || [])
            .map((cover) => {
                const previewUrl = safeCoverUrl(cover.thumbnailUrl || cover.url);

                return previewUrl ? { ...cover, previewUrl } : null;
            })
            .filter(Boolean);

        if (!validCovers.length) {
            const empty = document.createElement('p');
            empty.className = 'cover-option-empty';
            empty.textContent = emptyMessage;
            container.appendChild(empty);
            return;
        }

        for (const cover of validCovers) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `cover-option${selectedCoverId === cover.id ? ' selected' : ''}`;
            button.setAttribute('aria-label', `Use cover ${cover.id}`);
            button.addEventListener('click', () => onSelect(cover));

            const image = document.createElement('img');
            image.className = 'cover-option-preview';
            image.alt = '';
            const previewUrl = safeCoverUrl(cover.previewUrl);
            if (!previewUrl) {
                continue;
            }
            image.src = previewUrl;
            button.appendChild(image);
            container.appendChild(button);
        }
    };

    const syncAddBookForm = () => {
        addBookForm.title.value = addBookSelection?.title ?? '';
        addBookForm.author.value = addBookSelection?.author ?? '';
        addBookForm.publisher.value = addBookSelection?.publisher ?? '';

        renderCoverOptions(
            addBookCoverPicker,
            addBookSelection?.covers ?? (addBookSelection?.cover ? [addBookSelection.cover] : []),
            addBookSelection?.selectedCoverId ?? null,
            (cover) => {
                addBookSelection = { ...addBookSelection, selectedCoverId: cover.id };
                syncAddBookForm();
            },
            'Cover choices will be saved after you select a search result.',
        );
    };

    const renderSearchResults = () => {
        bookSearchResults.innerHTML = '';

        if (!searchResults.length) {
            return;
        }

        for (const result of searchResults) {
            const card = document.createElement('article');
            card.className = `search-result${addBookSelection?.resultKey === result.resultKey ? ' active' : ''}`;

            const previewUrl = safeCoverUrl(result.cover?.thumbnailUrl || result.cover?.url);
            if (previewUrl) {
                const image = document.createElement('img');
                image.className = 'search-result-cover';
                image.alt = '';
                image.src = previewUrl;
                card.appendChild(image);
            } else {
                const fallback = document.createElement('div');
                fallback.className = 'cover-option-fallback';
                card.appendChild(fallback);
            }

            const copy = document.createElement('div');
            copy.className = 'search-result-copy';

            const title = document.createElement('h3');
            title.textContent = result.title;
            copy.appendChild(title);

            if (result.author) {
                const author = document.createElement('p');
                author.textContent = result.author;
                copy.appendChild(author);
            }

            if (result.publisher || result.publishYear) {
                const publisher = document.createElement('p');
                publisher.textContent = [result.publisher, result.publishYear].filter(Boolean).join(' • ');
                copy.appendChild(publisher);
            }

            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = addBookSelection?.resultKey === result.resultKey ? 'Selected' : 'Use this book';
            button.addEventListener('click', async () => {
                addBookSelection = {
                    ...result,
                    covers: result.cover ? [result.cover] : [],
                    selectedCoverId: result.cover?.id ?? null,
                    payload: null,
                };
                syncAddBookForm();
                renderSearchResults();
                bookSearchFeedback.textContent = 'Loading full Open Library metadata and cover choices…';

                try {
                    const selection = await fetchJson(`/api/open-library/selection?work_key=${encodeURIComponent(result.workKey ?? '')}&edition_key=${encodeURIComponent(result.editionKey ?? '')}`);
                    addBookSelection = {
                        ...addBookSelection,
                        ...selection,
                        resultKey: result.resultKey,
                        selectedCoverId: selection.covers?.[0]?.id ?? addBookSelection.selectedCoverId ?? null,
                    };
                    syncAddBookForm();
                    renderSearchResults();
                    bookSearchFeedback.textContent = 'Selected book metadata will be stored locally when you add it.';
                } catch {
                    bookSearchFeedback.textContent = 'Full metadata could not be loaded right now. You can still add the selected book.';
                }
            });
            copy.appendChild(button);

            card.appendChild(copy);
            bookSearchResults.appendChild(card);
        }
    };

    const renderSelectedBook = () => {
        const selected = state.books.find((book) => book.id === selectedBookId);

        if (!selected) {
            selectedBookLabel.textContent = 'No book selected';
            selectedBookMeta.textContent = '';
            renderCoverOptions(selectedBookCoverPicker, [], null, () => {}, 'Select a book to swap covers.');
            return;
        }

        selectedBookLabel.textContent = `${selected.title}${selected.author ? ` by ${selected.author}` : ''}`;
        selectedBookMeta.textContent = [selected.publisher, selected.publishYear].filter(Boolean).join(' • ') || 'Stored Open Library details unavailable';

        renderCoverOptions(
            selectedBookCoverPicker,
            selected.coverOptions,
            selected.coverId,
            async (cover) => {
                const updated = await fetchJson(`/api/books/${selected.id}/cover`, 'PATCH', { cover_id: cover.id });
                applyState(updated);
            },
            'This book does not have any saved cover options yet.',
        );
    };

    const renderMetadataRefreshList = () => {
        metadataRefreshList.innerHTML = '';
        const refreshableBooks = state.books.filter((book) => book.canRefreshMetadata);

        refreshSelectedBooksButton.disabled = refreshSelection.size === 0;
        refreshAllBooksButton.disabled = refreshableBooks.length === 0;

        if (!refreshableBooks.length) {
            const empty = document.createElement('p');
            empty.className = 'cover-option-empty';
            empty.textContent = 'Add an Open Library book to enable metadata refresh.';
            metadataRefreshList.appendChild(empty);
            return;
        }

        for (const book of refreshableBooks) {
            const item = document.createElement('div');
            item.className = 'metadata-refresh-item';

            const label = document.createElement('label');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = refreshSelection.has(book.id);
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    refreshSelection.add(book.id);
                } else {
                    refreshSelection.delete(book.id);
                }
                refreshSelectedBooksButton.disabled = refreshSelection.size === 0;
            });

            const title = document.createElement('span');
            title.textContent = `${book.title}${book.author ? ` by ${book.author}` : ''}`;
            label.appendChild(checkbox);
            label.appendChild(title);
            item.appendChild(label);

            const meta = document.createElement('small');
            meta.textContent = book.hasOpenLibraryMetadata
                ? 'Cached metadata ready to refresh.'
                : 'This book can fetch metadata on demand.';
            item.appendChild(meta);

            metadataRefreshList.appendChild(item);
        }
    };

    const applyState = (newState) => {
        state.books = newState.books;
        state.notes = newState.notes;
        state.preferences = newState.preferences;

        const currentBookIds = new Set(state.books.map((book) => book.id));
        for (const bookId of [...refreshSelection]) {
            if (!currentBookIds.has(bookId)) {
                refreshSelection.delete(bookId);
            }
        }

        if (selectedBookId && !state.books.some((book) => book.id === selectedBookId)) {
            selectedBookId = null;
        }

        bookshelfPreferencesForm.bookcase_theme.value = state.preferences.bookcaseTheme;
        bookshelfPreferencesForm.bookcase_shape.value = state.preferences.bookcaseShape;
        bookshelfPreferencesForm.shelf_count.value = state.preferences.shelfCount;
        notesPreferencesForm.notes_theme.value = state.preferences.notesTheme;

        renderSelectedBook();
        renderMetadataRefreshList();
        renderNotes();
        ensureAnimatedBooks();
    };

    const renderNotes = () => {
        notesList.innerHTML = '';

        for (const note of state.notes) {
            const li = document.createElement('li');
            li.className = 'note-item';

            const title = document.createElement('h3');
            title.textContent = note.title;
            li.appendChild(title);

            if (note.author) {
                const author = document.createElement('p');
                author.textContent = `Author: ${note.author}`;
                li.appendChild(author);
            }

            if (note.note) {
                const body = document.createElement('p');
                body.textContent = note.note;
                li.appendChild(body);
            }

            const row = document.createElement('div');
            row.className = 'note-actions';

            const editButton = document.createElement('button');
            editButton.type = 'button';
            editButton.textContent = 'Edit';
            editButton.addEventListener('click', async () => {
                const titleValue = window.prompt('Edit title', note.title);
                if (titleValue === null || !titleValue.trim()) return;
                const authorValue = window.prompt('Edit author', note.author ?? '') ?? '';
                const noteValue = window.prompt('Edit note', note.note ?? '') ?? '';
                const updated = await fetchJson(`/api/notes/${note.id}`, 'PATCH', {
                    title: titleValue.trim(),
                    author: authorValue.trim(),
                    note: noteValue.trim(),
                });
                applyState(updated);
            });
            row.appendChild(editButton);

            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'danger-btn';
            deleteButton.textContent = 'Delete';
            deleteButton.addEventListener('click', async () => {
                const updated = await fetchJson(`/api/notes/${note.id}`, 'DELETE');
                applyState(updated);
            });
            row.appendChild(deleteButton);

            li.appendChild(row);
            notesList.appendChild(li);
        }

        notesPanel.dataset.theme = state.preferences.notesTheme;
    };

    const canvasPointFromEvent = (event) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (event.clientX - rect.left) * scaleX,
            y: (event.clientY - rect.top) * scaleY,
        };
    };

    const placementFromPoint = (x, y) => {
        const { shelves, slotCount, padding, shelfSpacing, slotWidth } = slotLayout();
        const maxBookSlot = Math.max(0, slotCount - DECORATION_SLOT_BUFFER - 1);
        const shelfIndex = clamp(Math.floor((y - padding) / shelfSpacing), 0, shelves - 1);
        const positionIndex = clamp(Math.floor((x - padding) / slotWidth), 0, maxBookSlot);
        return { shelf_index: shelfIndex, position_index: positionIndex };
    };

    const handleCanvasTap = (x, y) => {
        const decors = getDecorationRects();

        if (hitTest(x, y, decors.preferences)) {
            openPanel('bookshelfPreferences');
            scrollToElementAfterDelay('bookshelf-preferences-form');
            return;
        }

        if (hitTest(x, y, decors.notes)) {
            openPanel('notes');
            return;
        }

        if (hitTest(x, y, decors.addBook)) {
            openPanel('controls');
            scrollToElementAfterDelay('book-search-form');
            return;
        }

        // Check book spines
        const book = findBookAtPoint(x, y);
        if (book) {
            selectedBookId = book.id;
            renderSelectedBook();
            return;
        }

        // Click on empty shelf — close panels
        selectedBookId = null;
        renderSelectedBook();
        openPanel(null);
    };

    canvas.addEventListener('pointerdown', (event) => {
        const { x, y } = canvasPointFromEvent(event);
        const book = findBookAtPoint(x, y);
        if (!book) {
            dragState = null;
            handleCanvasTap(x, y);
            return;
        }

        const anim = animatedBooks.get(book.id);
        if (!anim) return;

        selectedBookId = book.id;
        renderSelectedBook();

        dragState = {
            pointerId: event.pointerId,
            bookId: book.id,
            startX: x,
            startY: y,
            offsetX: x - anim.x,
            offsetY: y - anim.y,
            moved: false,
        };
        canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener('pointermove', (event) => {
        const { x, y } = canvasPointFromEvent(event);

        if (dragState && dragState.pointerId === event.pointerId) {
            const anim = animatedBooks.get(dragState.bookId);
            if (!anim) {
                dragState = null;
                return;
            }
            dragState.moved = dragState.moved
                || Math.hypot(x - dragState.startX, y - dragState.startY) > DRAG_MOVEMENT_THRESHOLD;
            if (dragState.moved) {
                anim.x = x - dragState.offsetX;
                anim.y = y - dragState.offsetY;
            }
            canvas.style.cursor = 'grabbing';
            return;
        }

        const decors = getDecorationRects();
        const overDecor = hitTest(x, y, decors.preferences) || hitTest(x, y, decors.notes) || hitTest(x, y, decors.addBook);
        canvas.style.cursor = (overDecor || findBookAtPoint(x, y) !== null) ? 'pointer' : 'default';
    });

    canvas.addEventListener('pointerup', async (event) => {
        if (!dragState || dragState.pointerId !== event.pointerId) {
            return;
        }

        const { x, y } = canvasPointFromEvent(event);
        const { bookId, moved } = dragState;
        dragState = null;
        canvas.releasePointerCapture(event.pointerId);

        if (!moved) {
            selectedBookId = bookId;
            renderSelectedBook();
            return;
        }

        const selected = state.books.find((book) => book.id === bookId);
        if (!selected) return;

        const placement = placementFromPoint(x, y);
        const updated = await fetchJson(`/api/books/${bookId}/position`, 'PATCH', {
            ...placement,
            rotation_mode: selected.rotationMode || DEFAULT_ROTATION_MODE,
        });
        applyState(updated);
    });

    bookSearchForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const query = bookSearchForm.query.value.trim();
        if (!query) return;

        bookSearchFeedback.textContent = 'Searching Open Library…';

        try {
            const response = await fetchJson(`/api/open-library/search?query=${encodeURIComponent(query)}`);
            searchResults = (response.results || []).map((result, index) => ({
                ...result,
                resultKey: `${result.workKey || result.editionKey || result.title}-${index}`,
            }));
            renderSearchResults();
            bookSearchFeedback.textContent = searchResults.length
                ? 'Choose a search result to cache metadata and cover choices before saving.'
                : 'No Open Library results found for that search.';
        } catch {
            searchResults = [];
            renderSearchResults();
            bookSearchFeedback.textContent = 'Open Library search is unavailable right now. You can still add a book manually.';
        }
    });

    addBookForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const payload = {
            title: addBookForm.title.value.trim(),
            author: addBookForm.author.value.trim(),
            publisher: addBookForm.publisher.value.trim(),
            spine_color: addBookForm.spine_color.value,
            shelf_index: Number(addBookForm.shelf_index.value),
            position_index: Number(addBookForm.position_index.value),
        };

        if (!payload.title) return;

        if (addBookSelection) {
            payload.open_library_work_key = addBookSelection.workKey;
            payload.open_library_edition_key = addBookSelection.editionKey;
            payload.open_library_cover_id = addBookSelection.selectedCoverId;
            payload.open_library_payload = addBookSelection.payload;
        }

        const updated = await fetchJson('/api/books', 'POST', payload);
        applyState(updated);
        addBookForm.reset();
        addBookForm.spine_color.value = '#6f4e37';
        addBookSelection = null;
        searchResults = [];
        bookSearchResults.innerHTML = '';
        bookSearchFeedback.textContent = 'Search Open Library to select the next book you want to add.';
        syncAddBookForm();
    });

    refreshSelectedBooksButton.addEventListener('click', async () => {
        if (!refreshSelection.size) {
            return;
        }

        metadataRefreshFeedback.textContent = 'Refreshing selected metadata…';
        const updated = await fetchJson('/api/books/refresh-metadata', 'POST', {
            book_ids: [...refreshSelection],
        });
        applyState(updated);
        metadataRefreshFeedback.textContent = 'Selected books were refreshed from Open Library.';
    });

    refreshAllBooksButton.addEventListener('click', async () => {
        const bookIds = state.books.filter((book) => book.canRefreshMetadata).map((book) => book.id);
        if (!bookIds.length) {
            return;
        }

        metadataRefreshFeedback.textContent = 'Refreshing all cached Open Library metadata…';
        const updated = await fetchJson('/api/books/refresh-metadata', 'POST', {
            book_ids: bookIds,
        });
        applyState(updated);
        metadataRefreshFeedback.textContent = 'All Open Library books were refreshed.';
    });

    removeBookButton.addEventListener('click', async () => {
        if (!selectedBookId) return;
        const updated = await fetchJson(`/api/books/${selectedBookId}`, 'DELETE');
        selectedBookId = null;
        applyState(updated);
    });

    addNoteForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const payload = {
            title: addNoteForm.title.value.trim(),
            author: addNoteForm.author.value.trim(),
            note: addNoteForm.note.value.trim(),
        };
        if (!payload.title) return;

        const updated = await fetchJson('/api/notes', 'POST', payload);
        applyState(updated);
        addNoteForm.reset();
    });

    bookshelfPreferencesForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const updated = await fetchJson('/api/preferences', 'PUT', {
            bookcase_theme: bookshelfPreferencesForm.bookcase_theme.value,
            bookcase_shape: bookshelfPreferencesForm.bookcase_shape.value,
            notes_theme: state.preferences.notesTheme,
            shelf_count: Number(bookshelfPreferencesForm.shelf_count.value),
        });

        applyState(updated);
        setCanvasSize();
    });

    notesPreferencesForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const updated = await fetchJson('/api/preferences', 'PUT', {
            bookcase_theme: state.preferences.bookcaseTheme,
            bookcase_shape: state.preferences.bookcaseShape,
            notes_theme: notesPreferencesForm.notes_theme.value,
            shelf_count: Number(state.preferences.shelfCount),
        });

        applyState(updated);
    });

    toggleControlsButton.addEventListener('click', () => {
        const mobile = isMobileViewport();
        controlsOpen = !controlsOpen;

        if (mobile && controlsOpen) {
            notesOpen = false;
        }

        syncPanels();
    });

    toggleNotesButton.addEventListener('click', () => {
        const mobile = isMobileViewport();
        notesOpen = !notesOpen;

        if (mobile && notesOpen) {
            controlsOpen = false;
        }

        syncPanels();
    });

    closeControlsButton.addEventListener('click', () => {
        controlsOpen = false;
        syncPanels();
    });

    closeNotesButton.addEventListener('click', () => {
        notesOpen = false;
        syncPanels();
    });

    openBookshelfPreferencesButton.addEventListener('click', () => {
        openPanel('bookshelfPreferences');
    });

    openNotesPreferencesButton.addEventListener('click', () => {
        openPanel('notesPreferences');
    });

    closeBookshelfPreferencesButton.addEventListener('click', () => {
        bookshelfPreferencesOpen = false;
        syncPanels();
    });

    closeNotesPreferencesButton.addEventListener('click', () => {
        notesPreferencesOpen = false;
        syncPanels();
    });

    overlayBackdrop.addEventListener('click', () => {
        controlsOpen = false;
        notesOpen = false;
        bookshelfPreferencesOpen = false;
        notesPreferencesOpen = false;
        syncPanels();
    });

    window.addEventListener('resize', () => {
        setCanvasSize();
        syncPanels();
    });

    syncAddBookForm();
    applyState(state);
    setCanvasSize();
    syncPanels();
    requestAnimationFrame(drawBookcase);
}
