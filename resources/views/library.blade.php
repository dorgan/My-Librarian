<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>My Library</title>
    @vite(['resources/css/app.css', 'resources/js/app.js'])
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
            <p class="hint">Tap/click a book spine to select it. Use move controls to reposition shelf and slot.</p>
        </section>

        <aside class="controls-panel" aria-label="Book and preference controls">
            <section>
                <h2>Add read book</h2>
                <form id="add-book-form" class="stacked-form">
                    <label>Title <input name="title" required maxlength="180"></label>
                    <label>Author <input name="author" maxlength="180"></label>
                    <label>Spine color <input name="spine_color" type="color" value="#6f4e37"></label>
                    <label>Shelf <input name="shelf_index" type="number" min="0" value="0"></label>
                    <label>Position <input name="position_index" type="number" min="0" value="0"></label>
                    <button type="submit">Add to bookcase</button>
                </form>
            </section>

            <section>
                <h2>Selected book</h2>
                <p id="selected-book-label">No book selected</p>
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
