const initialStateElement = document.getElementById('initial-state');

if (initialStateElement) {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const state = JSON.parse(initialStateElement.textContent);
    let selectedBookId = null;
    let notesOpen = false;

    const canvas = document.getElementById('bookcase-canvas');
    const ctx = canvas.getContext('2d');
    const toggleNotesButton = document.getElementById('toggle-notes');
    const notesPanel = document.getElementById('notes-panel');
    const selectedBookLabel = document.getElementById('selected-book-label');
    const notesList = document.getElementById('notes-list');
    const addBookForm = document.getElementById('add-book-form');
    const moveBookForm = document.getElementById('move-book-form');
    const removeBookButton = document.getElementById('remove-book');
    const addNoteForm = document.getElementById('add-note-form');
    const preferencesForm = document.getElementById('preferences-form');

    const animatedBooks = new Map();

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    const fetchJson = async (url, method = 'GET', payload = null) => {
        const response = await fetch(url, {
            method,
            headers: {
                'Accept': 'application/json',
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
        const slotCount = 10;
        const padding = 22;
        const shelfSpacing = (canvas.height - (padding * 2)) / shelves;
        const slotWidth = (canvas.width - (padding * 2)) / slotCount;
        return { shelves, slotCount, padding, shelfSpacing, slotWidth };
    };

    const bookTargetRect = (book) => {
        const { shelves, slotCount, padding, shelfSpacing, slotWidth } = slotLayout();
        const shelf = clamp(book.shelfIndex, 0, shelves - 1);
        const pos = clamp(book.positionIndex, 0, slotCount - 1);
        const h = Math.max(26, shelfSpacing * 0.78);
        const w = Math.max(16, slotWidth * 0.72);
        const x = padding + (slotWidth * pos) + (slotWidth - w) / 2;
        const y = padding + (shelfSpacing * shelf) + (shelfSpacing - h);
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
            if (state.preferences.bookcaseShape === 'minimal') {
                ctx.fillStyle = colors.shelf;
                ctx.fillRect(padding, y - 4, canvas.width - (padding * 2), 4);
            } else {
                ctx.fillStyle = colors.shelf;
                ctx.fillRect(padding, y - 8, canvas.width - (padding * 2), 8);
            }
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

            ctx.fillStyle = book.spineColor || '#6f4e37';
            ctx.fillRect(anim.x, anim.y, anim.w, anim.h);

            if (selectedBookId === book.id) {
                ctx.strokeStyle = '#111827';
                ctx.lineWidth = 2;
                ctx.strokeRect(anim.x - 2, anim.y - 2, anim.w + 4, anim.h + 4);
            }

            ctx.save();
            ctx.translate(anim.x + (anim.w / 2), anim.y + anim.h - 8);
            ctx.rotate(-Math.PI / 2);
            ctx.fillStyle = '#fefce8';
            ctx.font = '11px sans-serif';
            const shortTitle = (book.title || '').slice(0, 24);
            ctx.fillText(shortTitle, 0, 0);
            ctx.restore();
        }

        requestAnimationFrame(drawBookcase);
    };

    const setCanvasSize = () => {
        const bounds = canvas.parentElement.getBoundingClientRect();
        canvas.width = Math.max(320, Math.floor(bounds.width));
        canvas.height = Math.max(300, Math.floor(window.innerHeight * 0.62));
        ensureAnimatedBooks();
    };

    const applyState = (newState) => {
        state.books = newState.books;
        state.notes = newState.notes;
        state.preferences = newState.preferences;

        if (selectedBookId && !state.books.some((book) => book.id === selectedBookId)) {
            selectedBookId = null;
        }

        const selected = state.books.find((book) => book.id === selectedBookId);
        if (selected) {
            selectedBookLabel.textContent = `${selected.title}${selected.author ? ` by ${selected.author}` : ''}`;
            moveBookForm.shelf_index.value = selected.shelfIndex;
            moveBookForm.position_index.value = selected.positionIndex;
        } else {
            selectedBookLabel.textContent = 'No book selected';
        }

        preferencesForm.bookcase_theme.value = state.preferences.bookcaseTheme;
        preferencesForm.bookcase_shape.value = state.preferences.bookcaseShape;
        preferencesForm.notes_theme.value = state.preferences.notesTheme;
        preferencesForm.shelf_count.value = state.preferences.shelfCount;

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
                selectedBookLabel.textContent = `${book.title}${book.author ? ` by ${book.author}` : ''}`;
                moveBookForm.shelf_index.value = book.shelfIndex;
                moveBookForm.position_index.value = book.positionIndex;
                return;
            }
        }

        selectedBookId = null;
        selectedBookLabel.textContent = 'No book selected';
    });

    addBookForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const payload = {
            title: addBookForm.title.value.trim(),
            author: addBookForm.author.value.trim(),
            spine_color: addBookForm.spine_color.value,
            shelf_index: Number(addBookForm.shelf_index.value),
            position_index: Number(addBookForm.position_index.value),
        };

        if (!payload.title) return;

        const updated = await fetchJson('/api/books', 'POST', payload);
        applyState(updated);
        addBookForm.reset();
        addBookForm.spine_color.value = '#6f4e37';
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

    applyState(state);
    setCanvasSize();
    requestAnimationFrame(drawBookcase);
}
