<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>My Library</title>
    @if (file_exists(public_path('build/manifest.json')) || file_exists(public_path('hot')))
        @vite(['resources/css/app.css', 'resources/js/app.js'])
    @endif
</head>
<body>
<div class="app-shell">
    <header class="top-bar">
        <div>
            <h1>My Library</h1>
            <p>Track books you have read and books you want to read.</p>
        </div>
        <button id="toggle-notes" type="button" class="toggle-btn" aria-controls="notes-panel" aria-expanded="false">
            Open notes
        </button>
    </header>

    <main class="main-layout">
        <section class="bookcase-panel" aria-label="Bookcase">
            <canvas id="bookcase-canvas" aria-label="Interactive bookcase" role="img"></canvas>
            <p class="hint">Search Open Library, pick a cover, then tap/click a book on the shelf to swap covers or move it.</p>
        </section>

        <aside class="controls-panel" aria-label="Book and preference controls">
            <section>
                <h2>Search Open Library</h2>
                <form id="book-search-form" class="inline-form inline-form--search">
                    <label class="search-field">Book title or author <input name="query" maxlength="180" placeholder="Search by title or author"></label>
                    <button type="submit">Search</button>
                </form>
                <p id="book-search-feedback" class="hint" aria-live="polite">Search Open Library to preload author, publisher, and cover choices.</p>
                <div id="book-search-results" class="search-results" aria-live="polite"></div>
            </section>

            <section>
                <h2>Add read book</h2>
                <form id="add-book-form" class="stacked-form">
                    <label>Title <input name="title" required maxlength="180"></label>
                    <label>Author <input name="author" maxlength="180"></label>
                    <label>Publisher <input name="publisher" maxlength="180"></label>
                    <label>Accent color <input name="spine_color" type="color" value="#6f4e37"></label>
                    <div>
                        <p class="cover-picker-label">Chosen cover</p>
                        <div id="add-book-cover-picker" class="cover-picker" aria-live="polite"></div>
                    </div>
                    <label>Shelf <input name="shelf_index" type="number" min="0" value="0"></label>
                    <label>Position <input name="position_index" type="number" min="0" value="0"></label>
                    <button type="submit">Add to bookcase</button>
                </form>
            </section>

            <section>
                <h2>Selected book</h2>
                <p id="selected-book-label">No book selected</p>
                <p id="selected-book-meta" class="selected-book-meta"></p>
                <div>
                    <p class="cover-picker-label">Displayed cover</p>
                    <div id="selected-book-cover-picker" class="cover-picker" aria-live="polite"></div>
                </div>
                <form id="move-book-form" class="inline-form">
                    <label>Shelf <input name="shelf_index" type="number" min="0" value="0"></label>
                    <label>Position <input name="position_index" type="number" min="0" value="0"></label>
                    <button type="submit">Move</button>
                </form>
                <button id="remove-book" type="button" class="danger-btn">Remove selected</button>
            </section>

            <section>
                <h2>Preferences</h2>
                <form id="preferences-form" class="stacked-form">
                    <label>Bookcase theme
                        <select name="bookcase_theme">
                            <option value="oak">Oak</option>
                            <option value="walnut">Walnut</option>
                            <option value="midnight">Midnight</option>
                        </select>
                    </label>
                    <label>Bookcase shape
                        <select name="bookcase_shape">
                            <option value="classic">Classic</option>
                            <option value="minimal">Minimal</option>
                            <option value="arched">Arched</option>
                        </select>
                    </label>
                    <label>Notes theme
                        <select name="notes_theme">
                            <option value="paper">Paper</option>
                            <option value="mint">Mint</option>
                            <option value="dark">Dark</option>
                        </select>
                    </label>
                    <label>Shelves <input name="shelf_count" type="number" min="2" max="8" value="4"></label>
                    <button type="submit">Save preferences</button>
                </form>
            </section>
        </aside>

        <section id="notes-panel" class="notes-panel" aria-label="Want to read notes" aria-hidden="true">
            <div class="notes-inner">
                <h2>Want to read notes</h2>
                <form id="add-note-form" class="stacked-form">
                    <label>Title <input name="title" required maxlength="180"></label>
                    <label>Author <input name="author" maxlength="180"></label>
                    <label>Note <textarea name="note" rows="3" maxlength="800"></textarea></label>
                    <button type="submit">Add note</button>
                </form>
                <ul id="notes-list" class="notes-list" aria-live="polite"></ul>
            </div>
        </section>
    </main>
</div>

<script id="initial-state" type="application/json">@json($initialState)</script>
</body>
</html>
