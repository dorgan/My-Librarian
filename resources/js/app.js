const initialStateElement = document.getElementById('initial-state');

if (initialStateElement) {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const state = JSON.parse(initialStateElement.textContent);
    let selectedBookId = null;
    let notesOpen = false;
    let searchResults = [];
    let addBookSelection = null;
    const refreshSelection = new Set();

    const canvas = document.getElementById('bookcase-canvas');
    const ctx = canvas.getContext('2d');
    const toggleNotesButton = document.getElementById('toggle-notes');
    const notesPanel = document.getElementById('notes-panel');
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
    const moveBookForm = document.getElementById('move-book-form');
    const removeBookButton = document.getElementById('remove-book');
    const addNoteForm = document.getElementById('add-note-form');
    const preferencesForm = document.getElementById('preferences-form');

    const animatedBooks = new Map();
    const coverImages = new Map();

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
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
        const padding = 22;
        const shelfSpacing = (canvas.height - (padding * 2)) / shelves;
        const maxPosition = state.books.reduce((largest, book) => Math.max(largest, Number(book.positionIndex) || 0), 0);
        const slotCount = Math.max(5, maxPosition + 1);
        const slotWidth = (canvas.width - (padding * 2)) / slotCount;
        return { shelves, slotCount, padding, shelfSpacing, slotWidth };
    };

    const bookTargetRect = (book) => {
        const { shelves, slotCount, padding, shelfSpacing, slotWidth } = slotLayout();
        const shelf = clamp(book.shelfIndex, 0, shelves - 1);
        const pos = clamp(book.positionIndex, 0, slotCount - 1);
        const h = Math.max(78, shelfSpacing * 0.72);
        const w = Math.max(44, Math.min(slotWidth * 0.84, h * 0.72));
        const x = padding + (slotWidth * pos) + (slotWidth - w) / 2;
        const y = padding + (shelfSpacing * shelf) + (shelfSpacing - h - 8);
        return { x, y, w, h };
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
                });
                continue;
            }
            existing.tx = target.x;
            existing.ty = target.y;
            existing.tw = target.w;
            existing.th = target.h;
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

    const fallbackCover = (book, anim) => {
        const gradient = ctx.createLinearGradient(anim.x, anim.y, anim.x, anim.y + anim.h);
        gradient.addColorStop(0, book.spineColor || '#9a6d3d');
        gradient.addColorStop(1, '#1f2937');
        ctx.fillStyle = gradient;
        roundRect(anim.x, anim.y, anim.w, anim.h, 8);
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillRect(anim.x + anim.w - 6, anim.y + 6, 3, anim.h - 12);
        ctx.fillStyle = '#fefce8';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText((book.title || '').slice(0, 18), anim.x + 8, anim.y + 22, anim.w - 16);
        ctx.font = '10px sans-serif';
        if (book.author) {
            ctx.fillText(book.author.slice(0, 18), anim.x + 8, anim.y + 40, anim.w - 16);
        }
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
                anim.x = anim.tx;
                anim.y = anim.ty;
                anim.w = anim.tw;
                anim.h = anim.th;
            } else {
                anim.x += (anim.tx - anim.x) * 0.2;
                anim.y += (anim.ty - anim.y) * 0.2;
                anim.w += (anim.tw - anim.w) * 0.2;
                anim.h += (anim.th - anim.h) * 0.2;
            }

            ctx.save();
            ctx.shadowColor = 'rgba(17, 24, 39, 0.28)';
            ctx.shadowBlur = 14;
            ctx.shadowOffsetY = 5;
            roundRect(anim.x, anim.y, anim.w, anim.h, 8);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.restore();

            ctx.save();
            roundRect(anim.x, anim.y, anim.w, anim.h, 8);
            ctx.clip();
            const cover = imageRecord(book.coverUrl);
            if (cover && cover.loaded && !cover.failed) {
                ctx.drawImage(cover.image, anim.x, anim.y, anim.w, anim.h);
            } else {
                fallbackCover(book, anim);
            }
            ctx.restore();

            ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
            ctx.fillRect(anim.x + anim.w - 6, anim.y + 4, 3, anim.h - 8);
            ctx.strokeStyle = selectedBookId === book.id ? '#111827' : 'rgba(17, 24, 39, 0.18)';
            ctx.lineWidth = selectedBookId === book.id ? 3 : 1;
            roundRect(anim.x, anim.y, anim.w, anim.h, 8);
            ctx.stroke();
        }

        requestAnimationFrame(drawBookcase);
    };

    const setCanvasSize = () => {
        const bounds = canvas.parentElement.getBoundingClientRect();
        canvas.width = Math.max(320, Math.floor(bounds.width));
        canvas.height = Math.max(340, Math.floor(window.innerHeight * 0.68));
        ensureAnimatedBooks();
    };

    const renderCoverOptions = (container, covers, selectedCoverId, onSelect, emptyMessage) => {
        container.innerHTML = '';

        const validCovers = (covers || []).filter((cover) => safeCoverUrl(cover.thumbnailUrl || cover.url));

        if (!validCovers.length) {
            const empty = document.createElement('p');
            empty.className = 'cover-option-empty';
            empty.textContent = emptyMessage;
            container.appendChild(empty);
            return;
        }

        for (const cover of validCovers) {
            const previewUrl = safeCoverUrl(cover.thumbnailUrl || cover.url);
            if (!previewUrl) {
                continue;
            }

            const button = document.createElement('button');
            button.type = 'button';
            button.className = `cover-option${selectedCoverId === cover.id ? ' selected' : ''}`;
            button.setAttribute('aria-label', `Use cover ${cover.id}`);
            button.addEventListener('click', () => onSelect(cover));

            const image = document.createElement('img');
            image.className = 'cover-option-preview';
            image.alt = '';
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
        moveBookForm.shelf_index.value = selected.shelfIndex;
        moveBookForm.position_index.value = selected.positionIndex;

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

        preferencesForm.bookcase_theme.value = state.preferences.bookcaseTheme;
        preferencesForm.bookcase_shape.value = state.preferences.bookcaseShape;
        preferencesForm.notes_theme.value = state.preferences.notesTheme;
        preferencesForm.shelf_count.value = state.preferences.shelfCount;

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

    canvas.addEventListener('click', (event) => {
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        for (const book of [...state.books].reverse()) {
            const anim = animatedBooks.get(book.id);
            if (!anim) continue;

            const inside = x >= anim.x && x <= anim.x + anim.w && y >= anim.y && y <= anim.y + anim.h;
            if (inside) {
                selectedBookId = book.id;
                renderSelectedBook();
                return;
            }
        }

        selectedBookId = null;
        renderSelectedBook();
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

    moveBookForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!selectedBookId) return;

        const updated = await fetchJson(`/api/books/${selectedBookId}/position`, 'PATCH', {
            shelf_index: Number(moveBookForm.shelf_index.value),
            position_index: Number(moveBookForm.position_index.value),
        });

        applyState(updated);
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

    preferencesForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const updated = await fetchJson('/api/preferences', 'PUT', {
            bookcase_theme: preferencesForm.bookcase_theme.value,
            bookcase_shape: preferencesForm.bookcase_shape.value,
            notes_theme: preferencesForm.notes_theme.value,
            shelf_count: Number(preferencesForm.shelf_count.value),
        });

        applyState(updated);
        setCanvasSize();
    });

    toggleNotesButton.addEventListener('click', () => {
        notesOpen = !notesOpen;
        notesPanel.classList.toggle('open', notesOpen);
        notesPanel.setAttribute('aria-hidden', notesOpen ? 'false' : 'true');
        toggleNotesButton.setAttribute('aria-expanded', notesOpen ? 'true' : 'false');
        toggleNotesButton.textContent = notesOpen ? 'Close notes' : 'Open notes';
    });

    window.addEventListener('resize', setCanvasSize);

    syncAddBookForm();
    applyState(state);
    setCanvasSize();
    requestAnimationFrame(drawBookcase);
}
