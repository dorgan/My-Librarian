# My Library

A Laravel + SQLite app for tracking books you have read on an interactive bookcase and maintaining a "want to read" notes list.

## Features

- Responsive UI (desktop/tablet/mobile)
- Canvas-based bookcase rendering with animated book movement
- Add, remove, and reposition books by shelf and position
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
- Add import/export and cover image support
