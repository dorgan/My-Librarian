<!doctype html>
<html lang="en">

<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <meta name="theme-color" content="#9a6d3d">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="default">
    <meta name="apple-mobile-web-app-title" content="My Librarian">
    <link rel="manifest" href="/manifest.webmanifest">
    <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png">
    <link rel="icon" type="image/png" sizes="512x512" href="/icons/icon-512.png">
    <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon-180.png">
    <title>My Librarian</title>
    @if (file_exists(public_path('build/manifest.json')) || file_exists(public_path('hot')))
        @vite(['resources/css/app.css', 'resources/js/app.js'])
    @endif
</head>

<body>
    <div class="app-shell">
        <button type="button" id="toggle-controls" class="floating-btn" aria-expanded="false"
            aria-label="Open library controls">Library controls</button>
        <button type="button" id="toggle-notes" class="floating-btn" aria-expanded="false"
            aria-label="Open want to read notes">Want to read notes</button>

        <div id="overlay-backdrop" class="overlay-backdrop" hidden></div>

        <main class="main-layout">
            <section class="bookcase-panel" aria-label="Bookcase">
                <canvas id="bookcase-canvas" aria-label="Interactive bookcase" role="img"></canvas>
            </section>
        </main>

        <aside id="controls-panel" class="controls-panel" aria-label="Book and preference controls" aria-hidden="true">
            <div class="panel-header">
                <h2>Library controls</h2>
                <button type="button" id="close-controls" class="panel-close"
                    aria-label="Close controls">Close</button>
            </div>

            <section id="install-section" style="display: none;">
                <button type="button" id="install-button" class="primary-btn">Install My Librarian</button>
                <p class="hint">Install this app on your home screen for quick access and offline use.</p>
            </section>

            <section>
                <h2>Search Open Library</h2>
                <form id="book-search-form" class="inline-form inline-form--search">
                    <label class="search-field">Book title or author <input name="query" maxlength="180"
                            placeholder="Search by title or author"></label>
                    <button type="submit">Search</button>
                </form>
                <p id="book-search-feedback" class="hint" aria-live="polite">Search Open Library to select the book
                    you want to add.</p>
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
                        <p class="cover-picker-label">Saved cover choices</p>
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
                <div class="selected-book-orientation">
                    <label for="selected-book-orientation">Orientation</label>
                    <div class="selected-book-orientation-controls">
                        <select id="selected-book-orientation" aria-label="Selected book orientation">
                            <option value="upright">Upright</option>
                            <option value="side">On side</option>
                            <option value="tilt_left">Tilt left</option>
                            <option value="tilt_right">Tilt right</option>
                        </select>
                        <button id="apply-book-orientation" type="button" class="secondary-btn">Apply</button>
                    </div>
                </div>
                <div>
                    <p class="cover-picker-label">Displayed cover</p>
                    <div id="selected-book-cover-picker" class="cover-picker" aria-live="polite"></div>
                </div>
                <button id="remove-book" type="button" class="danger-btn">Remove selected</button>
            </section>

            <section>
                <h2>Metadata refresh</h2>
                <p id="metadata-refresh-feedback" class="hint" aria-live="polite"></p>
                <div id="metadata-refresh-list" aria-live="polite"></div>
                <div class="metadata-refresh-actions">
                    <button id="refresh-selected-books" type="button" disabled>Refresh selected</button>
                    <button id="refresh-all-books" type="button">Refresh all</button>
                </div>
            </section>

            <section>
                <button id="open-bookshelf-preferences" type="button">Open bookshelf preferences</button>
            </section>
        </aside>

        <aside id="notes-panel" class="notes-panel" aria-label="Want to read notes" aria-hidden="true">
            <div class="notes-inner">
                <div class="panel-header">
                    <h2>Want to read notes</h2>
                    <button type="button" id="close-notes" class="panel-close"
                        aria-label="Close notes">Close</button>
                </div>
                <form id="add-note-form" class="stacked-form">
                    <label>Title <input name="title" required maxlength="180"></label>
                    <label>Author <input name="author" maxlength="180"></label>
                    <label>Note
                        <textarea name="note" rows="3" maxlength="800"></textarea>
                    </label>
                    <button type="submit">Add note</button>
                </form>
                <button id="open-notes-preferences" type="button" class="secondary-btn">Notes preferences</button>
                <ul id="notes-list" class="notes-list" aria-live="polite"></ul>
            </div>
        </aside>

        <aside id="bookshelf-preferences-panel" class="controls-panel" aria-label="Bookshelf preferences"
            aria-hidden="true">
            <div class="panel-header">
                <h2>Bookshelf preferences</h2>
                <button type="button" id="close-bookshelf-preferences" class="panel-close"
                    aria-label="Close bookshelf preferences">Close</button>
            </div>
            <form id="bookshelf-preferences-form" class="stacked-form">
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
                <label>Shelves <input name="shelf_count" type="number" min="2" max="8"
                        value="4"></label>
                <button type="submit">Save bookshelf preferences</button>
            </form>
            <form method="POST" action="{{ route('logout') }}" class="panel-signout-form">
                @csrf
                <button type="submit" class="secondary-btn">Sign out</button>
            </form>
        </aside>

        <aside id="notes-preferences-panel" class="notes-panel" aria-label="Notes preferences" aria-hidden="true">
            <div class="notes-inner">
                <div class="panel-header">
                    <h2>Notes preferences</h2>
                    <button type="button" id="close-notes-preferences" class="panel-close"
                        aria-label="Close notes preferences">Close</button>
                </div>
                <form id="notes-preferences-form" class="stacked-form">
                    <label>Notes theme
                        <select name="notes_theme">
                            <option value="paper">Paper</option>
                            <option value="mint">Mint</option>
                            <option value="dark">Dark</option>
                        </select>
                    </label>
                    <button type="submit">Save notes preferences</button>
                </form>
            </div>
        </aside>
    </div>

    <script id="initial-state" type="application/json">@json($initialState)</script>
</body>

</html>
