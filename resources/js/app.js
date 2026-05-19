// PWA Install Prompt Handler
let deferredPrompt;

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const isAndroid = /Android/.test(navigator.userAgent);

function setupPWAInstall() {
    const installSection = document.getElementById('install-section');
    const installButton = document.getElementById('install-button');
    
    if (!installSection || !installButton) {
        console.log('Install elements not found yet');
        return false;
    }
    
    console.log('Setting up PWA install. isIOS:', isIOS, 'isAndroid:', isAndroid);
    
    // On iOS/Safari, show manual instructions
    if (isIOS) {
        installSection.innerHTML = `
            <p style="font-weight: bold; margin-bottom: 0.5rem;">Add to Home Screen</p>
            <ol style="font-size: 0.875rem; line-height: 1.5; padding-left: 1.25rem;">
                <li>Tap the Share button (arrow in a box)</li>
                <li>Scroll down and tap "Add to Home Screen"</li>
                <li>Tap "Add"</li>
            </ol>
        `;
        installSection.style.display = 'block';
        console.log('iOS install instructions shown');
        return true;
    }
    
    // On Android, use the beforeinstallprompt event
    if (isAndroid && deferredPrompt) {
        installSection.style.display = 'block';
        
        installButton.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                console.log(`User response: ${outcome}`);
                deferredPrompt = null;
                installSection.style.display = 'none';
            }
        });
        console.log('Android install button setup');
        return true;
    }
    
    return false;
}

window.addEventListener('beforeinstallprompt', (event) => {
    if (isAndroid) {
        event.preventDefault();
        deferredPrompt = event;
        setupPWAInstall();
    }
});

window.addEventListener('appinstalled', () => {
    const installSection = document.getElementById('install-section');
    if (installSection) {
        installSection.style.display = 'none';
    }
    console.log('My Librarian was installed');
});

// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {
            console.log('Service worker registration failed');
        });
        
        setupPWAInstall();
    });
}

// Also try to setup immediately in case load event already fired
document.addEventListener('DOMContentLoaded', () => {
    setupPWAInstall();
});

// Fallback - try every 500ms for 3 seconds
let attempts = 0;
const setupInterval = setInterval(() => {
    if (setupPWAInstall()) {
        clearInterval(setupInterval);
    }
    attempts++;
    if (attempts > 6) {
        clearInterval(setupInterval);
    }
}, 500);

const initialStateElement = document.getElementById('initial-state');

if (initialStateElement) {
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const state = JSON.parse(initialStateElement.textContent);
    const normalizeCollection = (value) => {
        if (Array.isArray(value)) {
            return value;
        }

        if (value && typeof value === 'object') {
            return Object.values(value);
        }

        return [];
    };

    state.books = normalizeCollection(state.books);
    state.notes = normalizeCollection(state.notes);
    state.shelfDividers = normalizeCollection(state.shelfDividers);
    let selectedBookId = null;
    let notesOpen = false;
    let controlsOpen = false;
    let searchOpen = false;
    let bookshelfPreferencesOpen = false;
    let notesPreferencesOpen = false;
    let searchResults = [];
    let bookshelfSearchResults = [];
    let addBookSelection = null;
    const refreshSelection = new Set();
    let selectedDividerId = null;

    const canvas = document.getElementById('bookcase-canvas');
    const ctx = canvas.getContext('2d');
    const toggleControlsButton = document.getElementById('toggle-controls');
    const toggleNotesButton = document.getElementById('toggle-notes');
    const toggleSearchButton = document.getElementById('toggle-search');
    const controlsPanel = document.getElementById('controls-panel');
    const notesPanel = document.getElementById('notes-panel');
    const searchPanel = document.getElementById('search-panel');
    const closeControlsButton = document.getElementById('close-controls');
    const closeNotesButton = document.getElementById('close-notes');
    const closeSearchButton = document.getElementById('close-search');
    const overlayBackdrop = document.getElementById('overlay-backdrop');
    const selectedBookLabel = document.getElementById('selected-book-label');
    const selectedBookMeta = document.getElementById('selected-book-meta');
    const selectedBookCoverPicker = document.getElementById('selected-book-cover-picker');
    const selectedBookSection = document.getElementById('selected-book-section');
    const notesList = document.getElementById('notes-list');
    const bookshelfSearchForm = document.getElementById('bookshelf-search-form');
    const bookshelfSearchFeedback = document.getElementById('bookshelf-search-feedback');
    const bookshelfSearchResultsContainer = document.getElementById('bookshelf-search-results');
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
    const selectedBookOrientation = document.getElementById('selected-book-orientation');
    const applyBookOrientationButton = document.getElementById('apply-book-orientation');
    const addShelfDividerForm = document.getElementById('add-shelf-divider-form');
    const shelfDividerFeedback = document.getElementById('shelf-divider-feedback');
    const selectedDividerControls = document.getElementById('selected-divider-controls');
    const selectedDividerLabel = document.getElementById('selected-divider-label');
    const selectedDividerStyle = document.getElementById('selected-divider-style');
    const selectedDividerPosition = document.getElementById('selected-divider-position');
    const updateDividerButton = document.getElementById('update-divider');
    const removeDividerButton = document.getElementById('remove-divider');
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
    let dividerDragState = null;
    let lastBookTap = null;
    let lastDividerTap = null;

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
    const getMinSlotCount = () => isMobileViewport() ? 6 : 12;
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
    const DOUBLE_ACTIVATION_MAX_MS = 350;
    const DOUBLE_ACTIVATION_MAX_DISTANCE = 24;
    const BOOK_TOUCH_GAP = 1;
    const BOOK_LEFT_INSET = 2;
    const BOOK_TO_BOOK_GAP = 1;
    const BOOK_TO_DIVIDER_GAP = 5;
    const DIVIDER_TO_DIVIDER_GAP = 6;

    /** Scroll to an element after a short delay to let the panel animate open */
    const scrollToElementAfterDelay = (elementId, delay = 120) => {
        setTimeout(() => document.getElementById(elementId)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), delay);
    };

    const focusElementAfterDelay = (elementId, delay = 150) => {
        setTimeout(() => {
            const element = document.getElementById(elementId);
            if (!element) {
                return;
            }

            const focusTarget = element.matches('input, select, textarea, button')
                ? element
                : element.querySelector('input, select, textarea, button');

            focusTarget?.focus();
        }, delay);
    };

    const isDraggingBook = (bookId) => Boolean(dragState && dragState.bookId === bookId);
    const openPanel = (panel) => {
        controlsOpen = panel === 'controls';
        notesOpen = panel === 'notes';
        searchOpen = panel === 'search';
        bookshelfPreferencesOpen = panel === 'bookshelfPreferences';
        notesPreferencesOpen = panel === 'notesPreferences';
        syncPanels();
    };

    const pointInAnimatedBookRect = (x, y, anim) => {
        const centerX = anim.x + (anim.w / 2);
        const centerY = anim.y + (anim.h / 2);
        const angle = anim.a || 0;

        if (angle === 0) {
            return x >= anim.x && x <= anim.x + anim.w && y >= anim.y && y <= anim.y + anim.h;
        }

        const dx = x - centerX;
        const dy = y - centerY;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const localX = (dx * cos) + (dy * sin);
        const localY = (-dx * sin) + (dy * cos);

        return Math.abs(localX) <= anim.w / 2 && Math.abs(localY) <= anim.h / 2;
    };

    /** Return the book (or null) whose rendered rect contains (x, y) in canvas coordinates */
    const findBookAtPoint = (x, y) => {
        for (const book of [...state.books].reverse()) {
            const anim = animatedBooks.get(book.id);
            if (anim && pointInAnimatedBookRect(x, y, anim)) {
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
                ...(csrfToken ? { 'X-CSRF-TOKEN': csrfToken } : {}),
            },
            credentials: 'same-origin',
            body: payload ? JSON.stringify(payload) : undefined,
        });

        if (response.status === 401 || response.status === 419) {
            window.location.assign('/login');
            throw new Error('Authentication required');
        }

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
        const maxBookPosition = state.books.reduce((largest, book) => Math.max(largest, Number(book.positionIndex) || 0), 0);
        const maxDividerPosition = (state.shelfDividers || []).reduce(
            (largest, divider) => Math.max(largest, Number(divider.positionIndex) || 0),
            0,
        );
        const maxPosition = Math.max(maxBookPosition, maxDividerPosition);
        // getMinSlotCount() adapts to narrow screens; DECORATION_SLOT_BUFFER reserves end slots for objects
        const slotCount = Math.max(getMinSlotCount(), maxPosition + DECORATION_SLOT_BUFFER);
        const slotWidth = (canvas.width - (padding * 2)) / slotCount;
        return { shelves, slotCount, padding, shelfSpacing, slotWidth };
    };

    const rotationAngle = (mode) => {
        if (mode === 'side') return Math.PI / 2; // 90°
        if (mode === 'tilt_left') return -(Math.PI / 9); // -20°
        if (mode === 'tilt_right') return Math.PI / 9; // 20°
        return 0;
    };

    const rotationProfile = (width, height, angle) => {
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        const corners = [
            { name: 'topLeft', x: -halfWidth, y: -halfHeight },
            { name: 'topRight', x: halfWidth, y: -halfHeight },
            { name: 'bottomLeft', x: -halfWidth, y: halfHeight },
            { name: 'bottomRight', x: halfWidth, y: halfHeight },
        ];
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        const rotatedCorners = corners.map((corner) => ({
            name: corner.name,
            x: (corner.x * cos) - (corner.y * sin),
            y: (corner.x * sin) + (corner.y * cos),
        }));

        const minX = Math.min(...rotatedCorners.map((corner) => corner.x));
        const maxX = Math.max(...rotatedCorners.map((corner) => corner.x));
        const topLeft = rotatedCorners.find((corner) => corner.name === 'topLeft');

        return {
            minX,
            width: maxX - minX,
            topLeftX: topLeft ? topLeft.x : minX,
        };
    };

    const sortedShelfBooks = (shelfIndex, excludeBookId = null) => state.books
        .filter((book) => book.shelfIndex === shelfIndex && book.id !== excludeBookId)
        .sort((a, b) => a.positionIndex - b.positionIndex || a.id - b.id);

    const sortedShelfDividers = (shelfIndex) => (state.shelfDividers || [])
        .filter((divider) => divider.shelfIndex === shelfIndex)
        .sort((a, b) => a.positionIndex - b.positionIndex || a.id - b.id);

    const shelfRenderLayout = (shelfIndex, options = {}) => {
        const {
            excludeBookId = null,
            excludeDividerId = null,
        } = options;
        const { shelves, padding, shelfSpacing, slotWidth } = slotLayout();
        const shelf = clamp(shelfIndex, 0, shelves - 1);
        const uprightH = Math.max(72, shelfSpacing * 0.82);
        const baseBookW = Math.max(24, Math.min(slotWidth * 0.95, 40));
        const baseDividerW = clamp(baseBookW * 2, 44, Math.min(Math.max(baseBookW * 2, 56), 78));

        const items = [
            ...state.books
                .filter((book) => book.shelfIndex === shelf && book.id !== excludeBookId)
                .map((book) => ({
                    id: book.id,
                    type: 'book',
                    positionIndex: Number(book.positionIndex) || 0,
                    rotationMode: book.rotationMode || DEFAULT_ROTATION_MODE,
                })),
            ...(state.shelfDividers || [])
                .filter((divider) => divider.shelfIndex === shelf && divider.id !== excludeDividerId)
                .map((divider) => ({
                    id: divider.id,
                    type: 'divider',
                    positionIndex: Number(divider.positionIndex) || 0,
                })),
        ].sort((a, b) => {
            if (a.positionIndex !== b.positionIndex) {
                return a.positionIndex - b.positionIndex;
            }

            if (a.type !== b.type) {
                return a.type === 'book' ? -1 : 1;
            }

            return a.id - b.id;
        });

        const positions = new Map();
        let cursorX = padding + BOOK_LEFT_INSET;
        let previousType = null;

        for (const item of items) {
            if (previousType !== null) {
                if (previousType === 'book' && item.type === 'book') {
                    cursorX += BOOK_TO_BOOK_GAP;
                } else if (previousType === 'divider' && item.type === 'divider') {
                    cursorX += DIVIDER_TO_DIVIDER_GAP;
                } else {
                    cursorX += BOOK_TO_DIVIDER_GAP;
                }
            }

            if (item.type === 'book') {
                const angle = rotationAngle(item.rotationMode);
                const profile = rotationProfile(baseBookW, uprightH, angle);
                const contactX = item.rotationMode === 'tilt_left' ? profile.topLeftX : profile.minX;
                const x = cursorX - ((baseBookW / 2) + contactX);

                positions.set(`book:${item.id}`, {
                    x,
                    w: baseBookW,
                    h: uprightH,
                    a: angle,
                });

                cursorX += profile.width;
            } else {
                positions.set(`divider:${item.id}`, {
                    x: cursorX,
                    w: baseDividerW,
                    h: uprightH,
                });

                cursorX += baseDividerW;
            }

            previousType = item.type;
        }

        return { positions, uprightH, baseBookW, baseDividerW };
    };

    const selectedDivider = () => (state.shelfDividers || []).find((divider) => divider.id === selectedDividerId) || null;

    const hasRightNeighbor = (book) => sortedShelfBooks(book.shelfIndex, book.id)
        .some((candidate) => candidate.positionIndex > book.positionIndex);

    const syncOrientationControlState = (selectedBook) => {
        if (!selectedBookOrientation) {
            return;
        }

        const tiltRightOption = selectedBookOrientation.querySelector('option[value="tilt_right"]');
        if (!tiltRightOption) {
            return;
        }

        const canTiltRight = Boolean(selectedBook && hasRightNeighbor(selectedBook));
        tiltRightOption.disabled = Boolean(selectedBook) && !canTiltRight;

        if (!canTiltRight && selectedBookOrientation.value === 'tilt_right') {
            selectedBookOrientation.value = DEFAULT_ROTATION_MODE;
        }
    };

    const bookTargetRect = (book) => {
        const { shelves, slotCount, padding, shelfSpacing, slotWidth } = slotLayout();
        const shelf = clamp(book.shelfIndex, 0, shelves - 1);
        const pos = clamp(book.positionIndex, 0, slotCount - 1);
        const mode = book.rotationMode || DEFAULT_ROTATION_MODE;
        const layout = shelfRenderLayout(shelf);
        const placed = layout.positions.get(`book:${book.id}`);
        const uprightH = placed?.h ?? Math.max(72, shelfSpacing * 0.82);
        const uprightW = placed?.w ?? Math.max(24, Math.min(slotWidth * 0.95, 40));
        const shelfTop = padding + (shelfSpacing * (shelf + 1));
        const angle = rotationAngle(mode);
        const fallbackX = padding + (slotWidth * pos) + (slotWidth - uprightW) / 2;
        const targetX = placed?.x ?? fallbackX;

        if (mode === 'side') {
            const w = uprightW;
            const h = uprightH;
            const sideDisplayHeight = uprightW;
            const centerX = targetX + (w / 2);
            const centerY = shelfTop - 7 - (sideDisplayHeight / 2);
            const x = centerX - (w / 2);
            const y = centerY - (h / 2);
            return { x, y, w, h, a: angle };
        }

        const x = targetX;
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
        const mobile = isMobileViewport();
        // Keep decoration objects from becoming tall/narrow on very tall mobile viewports.
        const h = clamp(shelfSpacing * (mobile ? 0.62 : 0.76), mobile ? 74 : 86, mobile ? 136 : 180);
        const preferredWidth = Math.max(slotWidth * (mobile ? 0.90 : 0.90), h * (mobile ? 0.44 : 0.42));
        const maxSlotWidth = Math.max(34, slotWidth - (mobile ? 4 : 2));
        const w = clamp(preferredWidth, mobile ? 44 : 50, Math.min(mobile ? 84 : 108, maxSlotWidth));
        const slotX = (pos) => padding + slotWidth * pos + (slotWidth - w) / 2;
        const slotY = (shelf) => padding + shelfSpacing * shelf + (shelfSpacing - h - 10);

        return {
            // Preferences mug — last slot, top shelf
            preferences: { x: slotX(slotCount - 1), y: slotY(0),            w, h },
            // Notes notepad — last slot, bottom shelf
            notes:       { x: slotX(slotCount - 1), y: slotY(shelves - 1), w, h },
            // Add-book ghost — second-to-last slot, top shelf
            addBook:     { x: slotX(slotCount - 2), y: slotY(0),            w, h },
            // Bookshelf search binoculars — third-to-last slot, top shelf
            bookshelfSearch: { x: slotX(slotCount - 3), y: slotY(0),        w, h },
        };
    };

    const hitTest = (x, y, rect, padding = 0) =>
        x >= rect.x - padding
        && x <= rect.x + rect.w + padding
        && y >= rect.y - padding
        && y <= rect.y + rect.h + padding;

    const decorationHitTest = (x, y, rect) => hitTest(x, y, rect, isMobileViewport() ? 10 : 4);

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

        // Handle arc — scale extension based on available width
        ctx.strokeStyle = '#e8d5b5';
        ctx.lineWidth = 3;
        const handleExtension = Math.max(2, w * 0.12);
        const maxHandleX = bx + bw + handleExtension;
        const handleRadius = bh * 0.28;
        const canvasPadding = 28;
        const strokeMargin = 2;
        const rightEdgePadding = isMobileViewport() ? 4 : 14;
        const clampedHandleX = Math.min(maxHandleX, canvas.width - canvasPadding - rightEdgePadding - strokeMargin);
        ctx.beginPath();
        ctx.arc(clampedHandleX, by + bh * 0.48, handleRadius, -Math.PI * 0.5, Math.PI * 0.5);
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

    const drawSearchIcon = (rect) => {
        const { x, y, w, h } = rect;
        const size = Math.min(w, h);
        const cx = x + w * 0.42;
        const cy = y + h * 0.42;
        const radius = Math.max(4, Math.floor(size * 0.24));
        const lineWidth = Math.max(2, Math.floor(size * 0.1));
        const handleLen = Math.max(4, Math.floor(size * 0.26));
        const angle = Math.PI * 0.25; // 45° = bottom-right

        ctx.strokeStyle = '#111827';
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';

        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();

        const hx = cx + radius * Math.cos(angle);
        const hy = cy + radius * Math.sin(angle);
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx + handleLen * Math.cos(angle), hy + handleLen * Math.sin(angle));
        ctx.stroke();
    };

    const dividerRect = (divider, layout = null) => {
        const { shelves, slotCount, padding, shelfSpacing, slotWidth } = slotLayout();
        const shelf = clamp(Number(divider.shelfIndex) || 0, 0, shelves - 1);
        const pos = clamp(Number(divider.positionIndex) || 0, 0, slotCount - 1);
        const activeLayout = layout ?? shelfRenderLayout(shelf);
        const placed = activeLayout.positions.get(`divider:${divider.id}`);
        const h = placed?.h ?? Math.max(72, shelfSpacing * 0.82);
        const w = placed?.w ?? Math.max(22, Math.min(slotWidth * 0.72, 34));
        const shelfTop = padding + (shelfSpacing * (shelf + 1));
        const fallbackX = padding + (slotWidth * pos) + slotWidth - (w / 2);
        const x = placed?.x ?? fallbackX;
        const y = shelfTop - h - 8;

        return { x, y, w, h };
    };

    const dividerVariant = (divider, count = 3) => {
        const id = Number(divider.id) || 0;
        const shelf = Number(divider.shelfIndex) || 0;
        const position = Number(divider.positionIndex) || 0;
        const seed = (id * 37) + (shelf * 11) + (position * 7);

        return Math.abs(seed) % count;
    };

    const adjacentBookendPair = (divider) => {
        const style = divider.style;
        if (style !== 'bookend_left' && style !== 'bookend_right') {
            return null;
        }

        const siblingStyle = style === 'bookend_left' ? 'bookend_right' : 'bookend_left';
        const shelf = Number(divider.shelfIndex) || 0;
        const position = Number(divider.positionIndex) || 0;
        const dividers = state.shelfDividers || [];

        const candidates = dividers
            .filter((entry) => Number(entry.id) !== Number(divider.id))
            .filter((entry) => entry.style === siblingStyle)
            .filter((entry) => (Number(entry.shelfIndex) || 0) === shelf)
            .filter((entry) => Math.abs((Number(entry.positionIndex) || 0) - position) <= 1)
            .sort((a, b) => {
                const distanceA = Math.abs((Number(a.positionIndex) || 0) - position);
                const distanceB = Math.abs((Number(b.positionIndex) || 0) - position);

                if (distanceA !== distanceB) {
                    return distanceA - distanceB;
                }

                return (Number(a.id) || 0) - (Number(b.id) || 0);
            });

        return candidates[0] || null;
    };

    const pairedBookendVariant = (divider, count = 3) => {
        const pair = adjacentBookendPair(divider);
        if (!pair) {
            return dividerVariant(divider, count);
        }

        const dividerId = Number(divider.id) || 0;
        const pairId = Number(pair.id) || 0;
        const shelf = Number(divider.shelfIndex) || 0;
        const lowerId = Math.min(dividerId, pairId);
        const upperId = Math.max(dividerId, pairId);
        const seed = (lowerId * 53) + (upperId * 19) + (shelf * 11);

        return Math.abs(seed) % count;
    };

    const drawShelfDivider = (divider) => {
        const rect = dividerRect(divider);
        const isSelected = divider.id === selectedDividerId;
        const shelfColor = themeColors().shelf;
        const frameColor = themeColors().frame;
        const variant = (divider.style === 'bookend_left' || divider.style === 'bookend_right')
            ? pairedBookendVariant(divider)
            : dividerVariant(divider);

        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 2;

        if (divider.style === 'plant') {
            // Wooden planter base
            const planterX = rect.x + (rect.w * 0.1);
            const planterY = rect.y + (rect.h * 0.74);
            const planterW = rect.w * 0.8;
            const planterH = rect.h * 0.22;

            const planter = ctx.createLinearGradient(planterX, planterY, planterX, planterY + planterH);
            const planterPalettes = [
                ['#9f6a3d', '#6f4527'],
                ['#8e5d35', '#5b3a23'],
                ['#a7784c', '#6b4328'],
            ];
            const [planterLight, planterDark] = planterPalettes[variant];
            planter.addColorStop(0, planterLight);
            planter.addColorStop(1, planterDark);
            roundRect(planterX, planterY, planterW, planterH, 4);
            ctx.fillStyle = planter;
            ctx.fill();
            ctx.strokeStyle = '#5b371f';
            ctx.lineWidth = 1.1;
            ctx.stroke();

            ctx.fillStyle = '#c08b58';
            ctx.fillRect(planterX + 2, planterY + 2, planterW - 4, Math.max(2, planterH * 0.16));

            // Leaves
            const leafColors = ['#2b7a3c', '#3a914d', '#2f6c37'];
            const leafPresets = [
                [
                    [0.28, 0.56, -0.9],
                    [0.42, 0.46, -0.4],
                    [0.58, 0.45, 0.35],
                    [0.72, 0.56, 0.85],
                    [0.5, 0.36, 0],
                ],
                [
                    [0.24, 0.58, -1.05],
                    [0.38, 0.49, -0.55],
                    [0.52, 0.38, 0.05],
                    [0.65, 0.48, 0.55],
                    [0.76, 0.6, 1],
                ],
                [
                    [0.3, 0.6, -0.75],
                    [0.46, 0.5, -0.2],
                    [0.6, 0.52, 0.35],
                    [0.69, 0.43, 0.68],
                    [0.5, 0.33, 0],
                    [0.38, 0.38, -0.35],
                ],
            ];
            const leafCenters = leafPresets[variant];

            leafCenters.forEach(([cx, cy, rot], index) => {
                ctx.save();
                ctx.translate(rect.x + (rect.w * cx), rect.y + (rect.h * cy));
                ctx.rotate(rot);
                ctx.fillStyle = leafColors[index % leafColors.length];
                ctx.beginPath();
                ctx.ellipse(0, 0, rect.w * 0.1, rect.h * 0.12, 0, 0, Math.PI * 2);
                ctx.fill();

                ctx.strokeStyle = '#1e5a2d';
                ctx.lineWidth = 0.8;
                ctx.beginPath();
                ctx.moveTo(0, -rect.h * 0.08);
                ctx.lineTo(0, rect.h * 0.08);
                ctx.stroke();
                ctx.restore();
            });

            ctx.strokeStyle = '#315f38';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(rect.x + (rect.w * 0.35), rect.y + (rect.h * 0.72));
            ctx.quadraticCurveTo(rect.x + (rect.w * 0.42), rect.y + (rect.h * 0.6), rect.x + (rect.w * 0.47), rect.y + (rect.h * 0.46));
            ctx.moveTo(rect.x + (rect.w * 0.63), rect.y + (rect.h * 0.72));
            ctx.quadraticCurveTo(rect.x + (rect.w * 0.58), rect.y + (rect.h * 0.58), rect.x + (rect.w * 0.54), rect.y + (rect.h * 0.44));
            ctx.stroke();
        } else if (divider.style === 'knick_knack') {
            // Carved figurine on a pedestal
            const pedestalX = rect.x + (rect.w * 0.12);
            const pedestalY = rect.y + (rect.h * 0.8);
            const pedestalW = rect.w * 0.76;
            const pedestalH = rect.h * 0.15;
            const wood = ctx.createLinearGradient(pedestalX, pedestalY, pedestalX + pedestalW, pedestalY + pedestalH);
            wood.addColorStop(0, '#7b4f2d');
            wood.addColorStop(1, '#5b3921');
            roundRect(pedestalX, pedestalY, pedestalW, pedestalH, 3);
            ctx.fillStyle = wood;
            ctx.fill();
            ctx.strokeStyle = '#442b19';
            ctx.lineWidth = 1;
            ctx.stroke();

            const centerX = rect.x + (rect.w / 2);

            if (variant === 0) {
                const bodyTop = rect.y + (rect.h * 0.2);
                const bodyBottom = rect.y + (rect.h * 0.82);

                ctx.fillStyle = '#91603a';
                ctx.beginPath();
                ctx.moveTo(centerX, bodyTop);
                ctx.bezierCurveTo(centerX + (rect.w * 0.18), rect.y + (rect.h * 0.25), centerX + (rect.w * 0.24), rect.y + (rect.h * 0.52), centerX + (rect.w * 0.12), bodyBottom);
                ctx.lineTo(centerX - (rect.w * 0.12), bodyBottom);
                ctx.bezierCurveTo(centerX - (rect.w * 0.24), rect.y + (rect.h * 0.52), centerX - (rect.w * 0.18), rect.y + (rect.h * 0.25), centerX, bodyTop);
                ctx.fill();

                ctx.fillStyle = '#a36f45';
                ctx.beginPath();
                ctx.arc(centerX, rect.y + (rect.h * 0.19), rect.w * 0.11, 0, Math.PI * 2);
                ctx.fill();

                ctx.strokeStyle = '#5b3921';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(centerX, rect.y + (rect.h * 0.31));
                ctx.lineTo(centerX, rect.y + (rect.h * 0.72));
                ctx.moveTo(centerX - (rect.w * 0.09), rect.y + (rect.h * 0.47));
                ctx.quadraticCurveTo(centerX, rect.y + (rect.h * 0.5), centerX + (rect.w * 0.09), rect.y + (rect.h * 0.47));
                ctx.stroke();
            } else if (variant === 1) {
                ctx.fillStyle = '#8d5c36';
                ctx.beginPath();
                ctx.ellipse(centerX, rect.y + (rect.h * 0.48), rect.w * 0.2, rect.h * 0.28, 0, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = '#a87246';
                ctx.beginPath();
                ctx.arc(centerX, rect.y + (rect.h * 0.23), rect.w * 0.1, 0, Math.PI * 2);
                ctx.fill();

                ctx.strokeStyle = '#5b3921';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(centerX - (rect.w * 0.11), rect.y + (rect.h * 0.43));
                ctx.quadraticCurveTo(centerX, rect.y + (rect.h * 0.39), centerX + (rect.w * 0.11), rect.y + (rect.h * 0.43));
                ctx.moveTo(centerX - (rect.w * 0.1), rect.y + (rect.h * 0.62));
                ctx.quadraticCurveTo(centerX, rect.y + (rect.h * 0.68), centerX + (rect.w * 0.1), rect.y + (rect.h * 0.62));
                ctx.stroke();
            } else {
                ctx.fillStyle = '#87542f';
                ctx.beginPath();
                ctx.moveTo(centerX, rect.y + (rect.h * 0.18));
                ctx.lineTo(centerX + (rect.w * 0.17), rect.y + (rect.h * 0.52));
                ctx.lineTo(centerX, rect.y + (rect.h * 0.8));
                ctx.lineTo(centerX - (rect.w * 0.17), rect.y + (rect.h * 0.52));
                ctx.closePath();
                ctx.fill();

                ctx.fillStyle = '#b27f56';
                ctx.beginPath();
                ctx.arc(centerX, rect.y + (rect.h * 0.18), rect.w * 0.08, 0, Math.PI * 2);
                ctx.fill();

                ctx.strokeStyle = '#5b3921';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(centerX, rect.y + (rect.h * 0.3));
                ctx.lineTo(centerX, rect.y + (rect.h * 0.72));
                ctx.moveTo(centerX - (rect.w * 0.08), rect.y + (rect.h * 0.53));
                ctx.lineTo(centerX + (rect.w * 0.08), rect.y + (rect.h * 0.53));
                ctx.stroke();
            }

            ctx.strokeStyle = 'rgba(255, 232, 196, 0.35)';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(pedestalX + 3, pedestalY + pedestalH * 0.4);
            ctx.lineTo(pedestalX + pedestalW - 3, pedestalY + pedestalH * 0.4);
            ctx.stroke();
        } else {
            // Decorative metal bookend with base plate and lattice-like branches.
            const isLeftBookend = divider.style !== 'bookend_right';
            const baseInset = rect.w * 0.06;
            const baseY = rect.y + (rect.h * 0.84);
            const baseW = rect.w * 0.9;
            const baseH = rect.h * 0.12;

            const basePlate = ctx.createLinearGradient(rect.x, baseY, rect.x + baseW, baseY + baseH);
            const metalPalettes = [
                ['#151a22', '#2f3743', '#4b545f', '#2f3743', '#1a1f27'],
                ['#1e2230', '#3a4151', '#636c7a', '#3a4151', '#222734'],
                ['#23292f', '#424b56', '#6e7784', '#424b56', '#2a3138'],
            ];
            const [baseStart, baseEnd, uprightStart, uprightMid, uprightEnd] = metalPalettes[variant];
            basePlate.addColorStop(0, baseStart);
            basePlate.addColorStop(1, baseEnd);

            ctx.fillStyle = basePlate;
            if (isLeftBookend) {
                roundRect(rect.x + baseInset, baseY, baseW, baseH, 2);
            } else {
                roundRect(rect.x + (rect.w * 0.04), baseY, baseW, baseH, 2);
            }
            ctx.fill();

            const uprightW = rect.w * 0.58;
            const uprightH = rect.h * 0.8;
            const uprightX = isLeftBookend ? rect.x + (rect.w * 0.09) : rect.x + (rect.w * 0.33);
            const uprightY = rect.y + (rect.h * 0.04);

            const upright = ctx.createLinearGradient(uprightX, uprightY, uprightX + uprightW, uprightY + uprightH);
            upright.addColorStop(0, uprightStart);
            upright.addColorStop(0.45, uprightMid);
            upright.addColorStop(1, uprightEnd);
            roundRect(uprightX, uprightY, uprightW, uprightH, 3);
            ctx.fillStyle = upright;
            ctx.fill();
            ctx.strokeStyle = '#0f1217';
            ctx.lineWidth = 1.2;
            ctx.stroke();

            // Tree-branch motif (light cutouts + dark branches) inspired by decorative steel bookends.
            ctx.strokeStyle = '#111827';
            ctx.lineWidth = 1.6;
            ctx.lineCap = 'round';

            const branchStartX = isLeftBookend ? uprightX + (uprightW * 0.16) : uprightX + (uprightW * 0.84);
            const direction = isLeftBookend ? 1 : -1;

            ctx.beginPath();
            ctx.moveTo(branchStartX, uprightY + (uprightH * 0.88));
            ctx.lineTo(branchStartX + (uprightW * 0.04 * direction), uprightY + (uprightH * 0.58));
            ctx.lineTo(branchStartX + (uprightW * 0.08 * direction), uprightY + (uprightH * 0.24));
            ctx.stroke();

            const branchLines = [
                variant === 0
                    ? [0.58, 0.46, 0.28]
                    : variant === 1
                        ? [0.54, 0.42, 0.24]
                        : [0.61, 0.48, 0.32],
                variant === 0
                    ? [0.49, 0.32, 0.2]
                    : variant === 1
                        ? [0.44, 0.3, 0.14]
                        : [0.52, 0.29, 0.22],
                variant === 0
                    ? [0.66, 0.64, 0.37]
                    : variant === 1
                        ? [0.69, 0.62, 0.42]
                        : [0.63, 0.66, 0.35],
                variant === 0
                    ? [0.36, 0.55, 0.08]
                    : variant === 1
                        ? [0.38, 0.58, 0.1]
                        : [0.33, 0.53, 0.06],
            ];

            for (const [fromY, toY, tipX] of branchLines) {
                ctx.beginPath();
                ctx.moveTo(branchStartX + (uprightW * 0.05 * direction), uprightY + (uprightH * fromY));
                ctx.lineTo(uprightX + (uprightW * tipX), uprightY + (uprightH * toY));
                ctx.stroke();
            }

            ctx.fillStyle = 'rgba(240, 244, 249, 0.78)';
            const holePresets = [
                [
                    [0.21, 0.2, 0.19, 0.16],
                    [0.48, 0.2, 0.2, 0.17],
                    [0.27, 0.43, 0.2, 0.17],
                    [0.52, 0.49, 0.18, 0.16],
                    [0.2, 0.66, 0.19, 0.17],
                    [0.5, 0.69, 0.2, 0.16],
                ],
                [
                    [0.18, 0.18, 0.22, 0.16],
                    [0.46, 0.24, 0.22, 0.16],
                    [0.28, 0.46, 0.16, 0.18],
                    [0.53, 0.52, 0.2, 0.16],
                    [0.23, 0.71, 0.18, 0.14],
                    [0.49, 0.73, 0.2, 0.14],
                ],
                [
                    [0.25, 0.2, 0.16, 0.17],
                    [0.47, 0.18, 0.24, 0.18],
                    [0.2, 0.44, 0.22, 0.17],
                    [0.5, 0.46, 0.2, 0.18],
                    [0.24, 0.66, 0.16, 0.16],
                    [0.47, 0.69, 0.23, 0.15],
                ],
            ];
            const holes = holePresets[variant];

            holes.forEach(([hx, hy, hw, hh]) => {
                const x = uprightX + (uprightW * (isLeftBookend ? hx : (1 - hx - hw)));
                const y = uprightY + (uprightH * hy);
                roundRect(x, y, uprightW * hw, uprightH * hh, 2);
                ctx.fill();
            });

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
            ctx.lineWidth = 0.9;
            ctx.beginPath();
            ctx.moveTo(uprightX + 2, uprightY + 2);
            ctx.lineTo(uprightX + uprightW - 2, uprightY + 2);
            ctx.stroke();

            // Small grounding shadow where the bookend meets the shelf.
            ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
            ctx.fillRect(rect.x + (rect.w * 0.05), rect.y + (rect.h * 0.95), rect.w * 0.9, rect.h * 0.03);

            // Blend base with shelf tone for depth.
            ctx.strokeStyle = shelfColor;
            ctx.globalAlpha = 0.38;
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(rect.x + (rect.w * 0.1), baseY + baseH - 1);
            ctx.lineTo(rect.x + (rect.w * 0.86), baseY + baseH - 1);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        // Thin ambient keyline so tiny objects still read on dark frame themes.
        ctx.strokeStyle = frameColor === '#1f2937' ? 'rgba(255,255,255,0.18)' : 'rgba(17,24,39,0.2)';
        ctx.lineWidth = 0.6;
        roundRect(rect.x + 0.6, rect.y + 0.6, rect.w - 1.2, rect.h - 1.2, 3);
        ctx.stroke();

        if (isSelected) {
            ctx.shadowColor = 'transparent';
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 2;
            roundRect(rect.x - 2, rect.y - 2, rect.w + 4, rect.h + 4, 4);
            ctx.stroke();
        }

        ctx.restore();
    };

    const findDividerAtPoint = (x, y) => {
        for (const divider of [...(state.shelfDividers || [])].reverse()) {
            const rect = dividerRect(divider);
            if (hitTest(x, y, rect, isMobileViewport() ? 12 : 8)) {
                return divider;
            }
        }

        return null;
    };

    const drawDecorations = () => {
        const decors = getDecorationRects();
        drawMug(decors.preferences);
        drawNotepad(decors.notes);
        drawGhostBook(decors.addBook);
        drawSearchIcon(decors.bookshelfSearch);
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

        for (const divider of state.shelfDividers || []) {
            drawShelfDivider(divider);
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
        searchPanel.classList.toggle('open', searchOpen);
        bookshelfPreferencesPanel.classList.toggle('open', bookshelfPreferencesOpen);
        notesPreferencesPanel.classList.toggle('open', notesPreferencesOpen);
        controlsPanel.setAttribute('aria-hidden', controlsOpen ? 'false' : 'true');
        notesPanel.setAttribute('aria-hidden', notesOpen ? 'false' : 'true');
        searchPanel.setAttribute('aria-hidden', searchOpen ? 'false' : 'true');
        bookshelfPreferencesPanel.setAttribute('aria-hidden', bookshelfPreferencesOpen ? 'false' : 'true');
        notesPreferencesPanel.setAttribute('aria-hidden', notesPreferencesOpen ? 'false' : 'true');
        overlayBackdrop.hidden = !(controlsOpen || notesOpen || searchOpen || bookshelfPreferencesOpen || notesPreferencesOpen);

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

    const renderBookshelfSearchResults = () => {
        bookshelfSearchResultsContainer.innerHTML = '';

        if (!bookshelfSearchResults.length) {
            return;
        }

        for (const result of bookshelfSearchResults) {
            const card = document.createElement('article');
            card.className = `search-result${selectedBookId === result.id ? ' active' : ''}`;

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

            const shelfLocation = document.createElement('p');
            shelfLocation.textContent = `Shelf ${Number(result.shelfIndex) + 1}, position ${Number(result.positionIndex) + 1}`;
            copy.appendChild(shelfLocation);

            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = selectedBookId === result.id ? 'Selected on shelf' : 'Select this book';
            button.addEventListener('click', () => {
                selectedBookId = result.id;
                renderSelectedBook();
                renderBookshelfSearchResults();
                bookshelfSearchFeedback.textContent = `${result.title} selected on your bookshelf.`;
                scrollToElementAfterDelay('selected-book-label');
            });
            copy.appendChild(button);

            card.appendChild(copy);
            bookshelfSearchResultsContainer.appendChild(card);
        }
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
                
                // Clear the search input and results
                bookSearchForm.query.value = '';
                searchResults = [];
                bookSearchResults.innerHTML = '';
                
                syncAddBookForm();
                renderSearchResults();
                bookSearchFeedback.textContent = 'Loading full Open Library metadata and cover choices…';

                // Scroll to the Add read book form to show the "Add to bookcase" button
                scrollToElementAfterDelay('add-book-form', 200);

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

    const renderSelectedDivider = () => {
        const divider = selectedDivider();

        if (!divider) {
            selectedDividerControls.hidden = true;
            selectedDividerControls.style.display = 'none';
            selectedDividerLabel.textContent = 'No divider selected';
            selectedDividerStyle.value = 'bookend_left';
            selectedDividerPosition.value = '0';
            return;
        }

        selectedDividerControls.hidden = false;
        selectedDividerControls.style.display = 'grid';
        const styleLabel = divider.style === 'knick_knack'
            ? 'Knick-knack'
            : divider.style === 'plant'
                ? 'Fake plant'
                : divider.style === 'bookend_left'
                    ? 'Bookend (left)'
                    : divider.style === 'bookend_right'
                        ? 'Bookend (right)'
                        : 'Bookend';
        selectedDividerLabel.textContent = `${styleLabel} on shelf ${Number(divider.shelfIndex) + 1}, position ${Number(divider.positionIndex) + 1}`;
        selectedDividerStyle.value = divider.style;
        selectedDividerPosition.value = String(Number(divider.positionIndex));
    };

    const renderSelectedBook = () => {
        const selected = state.books.find((book) => book.id === selectedBookId);

        if (!selected) {
            selectedBookLabel.textContent = 'No book selected';
            selectedBookMeta.textContent = '';
            if (selectedBookOrientation) {
                selectedBookOrientation.value = DEFAULT_ROTATION_MODE;
                selectedBookOrientation.disabled = true;
            }
            syncOrientationControlState(null);
            if (applyBookOrientationButton) {
                applyBookOrientationButton.disabled = true;
            }
            renderCoverOptions(selectedBookCoverPicker, [], null, () => {}, 'Select a book to swap covers.');
            selectedBookSection.style.display = 'none';
            return;
        }

        selectedBookSection.style.display = 'block';
        selectedBookLabel.textContent = `${selected.title}${selected.author ? ` by ${selected.author}` : ''}`;
        selectedBookMeta.textContent = [selected.publisher, selected.publishYear].filter(Boolean).join(' • ') || 'Stored Open Library details unavailable';
        if (selectedBookOrientation) {
            selectedBookOrientation.value = selected.rotationMode || DEFAULT_ROTATION_MODE;
            selectedBookOrientation.disabled = false;
        }
        syncOrientationControlState(selected);
        if (applyBookOrientationButton) {
            applyBookOrientationButton.disabled = false;
        }

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
        state.books = normalizeCollection(newState.books);
        state.notes = normalizeCollection(newState.notes);
        state.shelfDividers = normalizeCollection(newState.shelfDividers);
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

        if (selectedDividerId && !state.shelfDividers.some((divider) => divider.id === selectedDividerId)) {
            selectedDividerId = null;
        }

        bookshelfSearchResults = bookshelfSearchResults.filter((result) => currentBookIds.has(result.id));

        bookshelfPreferencesForm.bookcase_theme.value = state.preferences.bookcaseTheme;
        bookshelfPreferencesForm.bookcase_shape.value = state.preferences.bookcaseShape;
        bookshelfPreferencesForm.shelf_count.value = state.preferences.shelfCount;
        notesPreferencesForm.notes_theme.value = state.preferences.notesTheme;

        renderSelectedBook();
        renderSelectedDivider();
        renderBookshelfSearchResults();
        renderMetadataRefreshList();
        renderNotes();
        ensureAnimatedBooks();
    };

    const refreshLibraryStateOnLoad = async () => {
        try {
            const latestState = await fetchJson('/api/library-state');
            applyState(latestState);
        } catch (error) {
            window.console.warn('Unable to refresh library state on startup.', error);
        }
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

    const placementFromPoint = (x, y, movingBookId = null) => {
        const { shelves, slotCount, padding, shelfSpacing } = slotLayout();
        const shelfIndex = clamp(Math.floor((y - padding) / shelfSpacing), 0, shelves - 1);
        const layout = shelfRenderLayout(shelfIndex, { excludeBookId: movingBookId });
        const shelfItems = [];

        for (const book of state.books) {
            if (book.id === movingBookId || book.shelfIndex !== shelfIndex) {
                continue;
            }

            const placed = layout.positions.get(`book:${book.id}`);
            const centerX = placed
                ? placed.x + (placed.w / 2)
                : bookTargetRect(book).x + (bookTargetRect(book).w / 2);

            shelfItems.push({
                id: book.id,
                positionIndex: Number(book.positionIndex) || 0,
                centerX,
            });
        }

        for (const divider of state.shelfDividers || []) {
            if (divider.shelfIndex !== shelfIndex) {
                continue;
            }

            const rect = dividerRect(divider, layout);
            shelfItems.push({
                id: divider.id,
                positionIndex: Number(divider.positionIndex) || 0,
                centerX: rect.x + (rect.w / 2),
            });
        }

        shelfItems.sort((a, b) => a.positionIndex - b.positionIndex || a.centerX - b.centerX || a.id - b.id);

        let positionIndex = 0;
        if (shelfItems.length) {
            const lastItem = shelfItems[shelfItems.length - 1];
            positionIndex = (lastItem?.positionIndex ?? 0) + 1;

            for (const item of shelfItems) {
                if (x < item.centerX) {
                    positionIndex = item.positionIndex;
                    break;
                }
            }
        }

        positionIndex = clamp(positionIndex, 0, slotCount - 1);

        return { shelf_index: shelfIndex, position_index: positionIndex };
    };

    const dividerPlacementFromPoint = (x, y, movingDividerId = null) => {
        const { shelves, slotCount, padding, shelfSpacing } = slotLayout();
        const shelfIndex = clamp(Math.floor((y - padding) / shelfSpacing), 0, shelves - 1);
        const layout = shelfRenderLayout(shelfIndex, { excludeDividerId: movingDividerId });

        const shelfItems = [];

        for (const book of state.books) {
            if (book.shelfIndex !== shelfIndex) {
                continue;
            }

            const placed = layout.positions.get(`book:${book.id}`);
            const centerX = placed
                ? placed.x + (placed.w / 2)
                : bookTargetRect(book).x + (bookTargetRect(book).w / 2);

            shelfItems.push({
                positionIndex: Number(book.positionIndex) || 0,
                centerX,
                id: book.id,
            });
        }

        for (const divider of state.shelfDividers || []) {
            if (divider.id === movingDividerId || divider.shelfIndex !== shelfIndex) {
                continue;
            }

            const rect = dividerRect(divider, layout);
            shelfItems.push({
                positionIndex: Number(divider.positionIndex) || 0,
                centerX: rect.x + (rect.w / 2),
                id: divider.id,
            });
        }

        shelfItems.sort((a, b) => a.positionIndex - b.positionIndex || a.centerX - b.centerX || a.id - b.id);

        let positionIndex = 0;
        if (shelfItems.length) {
            const lastItem = shelfItems[shelfItems.length - 1];
            positionIndex = (lastItem?.positionIndex ?? 0) + 1;

            for (const item of shelfItems) {
                if (x < item.centerX) {
                    positionIndex = item.positionIndex;
                    break;
                }
            }
        }

        positionIndex = clamp(positionIndex, 0, slotCount - 1);

        return { shelf_index: shelfIndex, position_index: positionIndex };
    };

    const handleCanvasTap = (x, y) => {
        const decors = getDecorationRects();

        const divider = findDividerAtPoint(x, y);
        if (divider) {
            selectedDividerId = divider.id;
            selectedBookId = null;
            renderSelectedBook();
            renderSelectedDivider();
            lastBookTap = null;
            return;
        }

        const book = findBookAtPoint(x, y);
        if (book) {
            selectedBookId = book.id;
            selectedDividerId = null;
            renderSelectedBook();
            renderSelectedDivider();
            lastBookTap = null;
            return;
        }

        if (decorationHitTest(x, y, decors.preferences)) {
            openPanel('bookshelfPreferences');
            scrollToElementAfterDelay('bookshelf-preferences-form');
            return;
        }

        if (decorationHitTest(x, y, decors.notes)) {
            openPanel('notes');
            return;
        }

        if (decorationHitTest(x, y, decors.addBook)) {
            openPanel('controls');
            scrollToElementAfterDelay('book-search-form');
            focusElementAfterDelay('book-search-form');
            return;
        }

        if (decorationHitTest(x, y, decors.bookshelfSearch)) {
            openPanel('search');
            bookshelfSearchForm.querySelector('input[name="query"]').focus();
            return;
        }

        // Click on empty shelf — close panels
        selectedBookId = null;
        selectedDividerId = null;
        renderSelectedBook();
        renderSelectedDivider();
        lastBookTap = null;
        openPanel(null);
    };

    const openSelectedBookControls = () => {
        openPanel('controls');
        scrollToElementAfterDelay('selected-book-orientation');
    };

    const openSelectedDividerControls = () => {
        openPanel('controls');
        scrollToElementAfterDelay('selected-divider-controls');
        focusElementAfterDelay('selected-divider-style');
    };

    const handleBookTap = (bookId, x, y, pointerType) => {
        selectedBookId = bookId;
        selectedDividerId = null;
        renderSelectedBook();
        renderSelectedDivider();

        const now = Date.now();
        const isDoubleTap =
            lastBookTap
            && lastBookTap.bookId === bookId
            && lastBookTap.pointerType === pointerType
            && (now - lastBookTap.time) <= DOUBLE_ACTIVATION_MAX_MS
            && Math.hypot(x - lastBookTap.x, y - lastBookTap.y) <= DOUBLE_ACTIVATION_MAX_DISTANCE;

        if (isDoubleTap) {
            lastBookTap = null;
            openSelectedBookControls();
            return;
        }

        lastBookTap = { bookId, x, y, time: now, pointerType };
    };

    const handleDividerTap = (dividerId, x, y, pointerType) => {
        selectedDividerId = dividerId;
        selectedBookId = null;
        renderSelectedBook();
        renderSelectedDivider();

        const now = Date.now();
        const isDoubleTap =
            lastDividerTap
            && lastDividerTap.dividerId === dividerId
            && lastDividerTap.pointerType === pointerType
            && (now - lastDividerTap.time) <= DOUBLE_ACTIVATION_MAX_MS
            && Math.hypot(x - lastDividerTap.x, y - lastDividerTap.y) <= DOUBLE_ACTIVATION_MAX_DISTANCE;

        if (isDoubleTap) {
            lastDividerTap = null;
            openSelectedDividerControls();
            return;
        }

        lastDividerTap = { dividerId, x, y, time: now, pointerType };
    };

    canvas.addEventListener('pointerdown', (event) => {
        const { x, y } = canvasPointFromEvent(event);
        const divider = findDividerAtPoint(x, y);
        if (divider) {
            selectedDividerId = divider.id;
            selectedBookId = null;
            renderSelectedBook();
            renderSelectedDivider();
            lastBookTap = null;
            dragState = null;
            dividerDragState = {
                pointerId: event.pointerId,
                dividerId: divider.id,
                startX: x,
                startY: y,
                moved: false,
            };
            canvas.setPointerCapture(event.pointerId);
            return;
        }

        const book = findBookAtPoint(x, y);
        if (!book) {
            dragState = null;
            dividerDragState = null;
            lastBookTap = null;
            lastDividerTap = null;
            handleCanvasTap(x, y);
            return;
        }

        const anim = animatedBooks.get(book.id);
        if (!anim) return;

        selectedBookId = book.id;
        selectedDividerId = null;
        renderSelectedBook();
        renderSelectedDivider();
        lastDividerTap = null;

        dragState = {
            pointerId: event.pointerId,
            bookId: book.id,
            startX: x,
            startY: y,
            offsetX: x - anim.x,
            offsetY: y - anim.y,
            moved: false,
        };
        dividerDragState = null;
        canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener('pointermove', (event) => {
        const { x, y } = canvasPointFromEvent(event);

        if (dividerDragState && dividerDragState.pointerId === event.pointerId) {
            dividerDragState.moved = dividerDragState.moved
                || Math.hypot(x - dividerDragState.startX, y - dividerDragState.startY) > DRAG_MOVEMENT_THRESHOLD;

            if (dividerDragState.moved) {
                const placement = dividerPlacementFromPoint(x, y, dividerDragState.dividerId);
                selectedDividerPosition.value = String(placement.position_index);
            }

            canvas.style.cursor = 'grabbing';
            return;
        }

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
        const overDecor = decorationHitTest(x, y, decors.preferences)
            || decorationHitTest(x, y, decors.notes)
            || decorationHitTest(x, y, decors.addBook)
            || decorationHitTest(x, y, decors.bookshelfSearch);
        canvas.style.cursor = (overDecor || findBookAtPoint(x, y) !== null || findDividerAtPoint(x, y) !== null) ? 'pointer' : 'default';
    });

    canvas.addEventListener('pointerup', async (event) => {
        if (dividerDragState && dividerDragState.pointerId === event.pointerId) {
            const { x, y } = canvasPointFromEvent(event);
            const { dividerId, moved } = dividerDragState;
            canvas.releasePointerCapture(event.pointerId);
            dividerDragState = null;

            if (!moved) {
                handleDividerTap(dividerId, x, y, event.pointerType);
                return;
            }

            const divider = state.shelfDividers.find((entry) => entry.id === dividerId);
            if (!divider) {
                return;
            }

            const placement = dividerPlacementFromPoint(x, y, dividerId);

            try {
                const updated = await fetchJson(`/api/shelf-dividers/${dividerId}`, 'PATCH', {
                    shelf_index: placement.shelf_index,
                    position_index: placement.position_index,
                    style: divider.style,
                });
                applyState(updated);
                shelfDividerFeedback.textContent = 'Shelf divider repositioned.';
                lastDividerTap = null;
            } catch {
                shelfDividerFeedback.textContent = 'Could not reposition divider.';
            }

            return;
        }

        if (!dragState || dragState.pointerId !== event.pointerId) {
            return;
        }

        const { x, y } = canvasPointFromEvent(event);
        const { bookId, moved } = dragState;
        canvas.releasePointerCapture(event.pointerId);

        if (!moved) {
            dragState = null;
            handleBookTap(bookId, x, y, event.pointerType);
            return;
        }

        const selected = state.books.find((book) => book.id === bookId);
        if (!selected) return;
        lastBookTap = null;

        const placement = placementFromPoint(x, y, bookId);
        const anim = animatedBooks.get(bookId);
        if (anim) {
            const dropTarget = bookTargetRect({
                ...selected,
                shelfIndex: placement.shelf_index,
                positionIndex: placement.position_index,
            });
            anim.tx = dropTarget.x;
            anim.ty = dropTarget.y;
            anim.tw = dropTarget.w;
            anim.th = dropTarget.h;
            anim.ta = dropTarget.a;
        }
        dragState = null;

        try {
            const updated = await fetchJson(`/api/books/${bookId}/position`, 'PATCH', {
                ...placement,
                rotation_mode: selected.rotationMode || DEFAULT_ROTATION_MODE,
            });
            applyState(updated);
        } catch (error) {
            window.console.error('Unable to save book position update.', error);
            if (anim) {
                const originalTarget = bookTargetRect(selected);
                anim.tx = originalTarget.x;
                anim.ty = originalTarget.y;
                anim.tw = originalTarget.w;
                anim.th = originalTarget.h;
                anim.ta = originalTarget.a;
            }
        }
    });

    bookshelfSearchForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const query = bookshelfSearchForm.query.value.trim();
        if (!query) {
            bookshelfSearchResults = [];
            renderBookshelfSearchResults();
            bookshelfSearchFeedback.textContent = 'Type a title to search books on your shelves.';
            return;
        }

        bookshelfSearchFeedback.textContent = 'Searching your bookshelf…';

        try {
            const response = await fetchJson(`/api/bookshelf/search?query=${encodeURIComponent(query)}`);
            bookshelfSearchResults = (response.results || []);
            renderBookshelfSearchResults();
            bookshelfSearchFeedback.textContent = bookshelfSearchResults.length
                ? `Found ${bookshelfSearchResults.length} matching bookshelf title${bookshelfSearchResults.length === 1 ? '' : 's'}.`
                : 'No matching title was found on your bookshelf.';
        } catch {
            bookshelfSearchResults = [];
            renderBookshelfSearchResults();
            bookshelfSearchFeedback.textContent = 'Bookshelf search is unavailable right now.';
        }
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
        
        // Close the controls panel so the user can see the newly added book
        controlsOpen = false;
        syncPanels();
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
        
        // Close the controls panel so the user can see the updated bookshelf
        controlsOpen = false;
        syncPanels();
    });

    if (applyBookOrientationButton) {
        applyBookOrientationButton.addEventListener('click', async () => {
            if (!selectedBookId || !selectedBookOrientation) {
                return;
            }

            const selected = state.books.find((book) => book.id === selectedBookId);
            if (!selected) {
                return;
            }

            const updated = await fetchJson(`/api/books/${selected.id}/position`, 'PATCH', {
                shelf_index: selected.shelfIndex,
                position_index: selected.positionIndex,
                rotation_mode: selectedBookOrientation.value || DEFAULT_ROTATION_MODE,
            });

            applyState(updated);
        });
    }

    if (selectedBookOrientation) {
        selectedBookOrientation.addEventListener('change', () => {
            const selected = state.books.find((book) => book.id === selectedBookId);
            if (!selected) {
                return;
            }

            syncOrientationControlState(selected);
        });
    }

    addShelfDividerForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const payload = {
            shelf_index: Number(addShelfDividerForm.shelf_index.value),
            style: addShelfDividerForm.style.value,
        };

        try {
            const updated = await fetchJson('/api/shelf-dividers', 'POST', payload);
            applyState(updated);
            shelfDividerFeedback.textContent = 'Shelf divider added at the shelf end. Tap a divider on the shelf to remove it.';
            selectedDividerId = null;
            renderSelectedDivider();
        } catch {
            shelfDividerFeedback.textContent = 'Divider could not be added right now.';
        }
    });

    updateDividerButton.addEventListener('click', async () => {
        const divider = selectedDivider();
        if (!divider) {
            return;
        }

        const payload = {
            shelf_index: Number(divider.shelfIndex),
            position_index: Number(selectedDividerPosition.value),
            style: selectedDividerStyle.value,
        };

        try {
            const updated = await fetchJson(`/api/shelf-dividers/${divider.id}`, 'PATCH', payload);
            applyState(updated);
            shelfDividerFeedback.textContent = 'Shelf divider updated.';
        } catch {
            shelfDividerFeedback.textContent = 'Divider could not be updated right now.';
        }
    });

    removeDividerButton.addEventListener('click', async () => {
        const divider = selectedDivider();
        if (!divider) {
            return;
        }

        const updated = await fetchJson(`/api/shelf-dividers/${divider.id}`, 'DELETE');
        selectedDividerId = null;
        applyState(updated);
        shelfDividerFeedback.textContent = 'Shelf divider removed.';
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

    toggleSearchButton.addEventListener('click', () => {
        const willOpen = !searchOpen;
        openPanel(willOpen ? 'search' : null);
        if (willOpen) {
            bookshelfSearchForm.querySelector('input[name="query"]').focus();
        }
    });

    closeSearchButton.addEventListener('click', () => {
        openPanel(null);
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
    refreshLibraryStateOnLoad();
}
