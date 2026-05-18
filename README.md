# My Librarian

A Laravel + SQLite app for tracking books you have read on an interactive bookcase and maintaining a "want to read" notes list.

## Features

- Responsive UI (desktop/tablet/mobile)
- Canvas-based bookcase rendering with animated book movement
- Open Library-powered book search and selection when adding books to the shelf
- Stored Open Library metadata JSON for each saved book, including cached cover choices
- Settings controls to refresh metadata for one or more saved books
- Add/remove books and reposition them directly on the canvas with drag-and-drop
- Rotate books to upright, side, or tilted placements
- Separate slide-out panels for bookshelf and notes preferences
- Animated open/close notes panel for want-to-read items
- Preferences for bookcase theme/shape and notes appearance
- SQLite-backed persistence

## Requirements

- PHP 8.3+
- Composer
- Node.js 20+

## Setup

```bash
cd /home/runner/work/My-Library/My-Library
cp .env.example .env
php artisan key:generate
mkdir -p database
touch database/database.sqlite
php artisan migrate
composer install
npm install
```

## Run

```bash
cd /home/runner/work/My-Library/My-Library
php artisan serve
npm run dev
```

Then open http://127.0.0.1:8000.

## Test

```bash
cd /home/runner/work/My-Library/My-Library
php artisan test
```

## Build assets

```bash
cd /home/runner/work/My-Library/My-Library
npm run build
```

## Next-step backlog

- Add full authentication and per-account multi-user support
- Add drag-and-drop repositioning directly on canvas
- Add import/export support
