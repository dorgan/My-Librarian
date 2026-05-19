<?php

namespace App\Services;

use App\Models\Book;
use App\Models\ShelfDivider;
use App\Models\ShelfItem;
use App\Models\User;
use App\Models\UserPreference;
use App\Models\WantToReadNote;

class LibraryStateService
{
    public function __construct(private readonly OpenLibraryService $openLibrary) {}

    public function payload(User $user): array
    {
        $shelfItems = ShelfItem::query()
            ->where('user_id', $user->id)
            ->orderBy('shelf_index')
            ->orderBy('position_index')
            ->orderBy('id')
            ->get();

        $bookShelfItems = $shelfItems
            ->where('item_type', ShelfItem::TYPE_BOOK)
            ->keyBy('item_id');

        $dividerShelfItems = $shelfItems
            ->where('item_type', ShelfItem::TYPE_DIVIDER)
            ->keyBy('item_id');

        $books = Book::query()
            ->with('placement')
            ->where('user_id', $user->id)
            ->get()
            ->filter(fn (Book $book): bool => (bool) $book->placement && $bookShelfItems->has($book->id))
            ->sortBy(function (Book $book) use ($bookShelfItems): string {
                $item = $bookShelfItems->get($book->id);

                return sprintf('%03d-%04d-%08d', (int) $item->shelf_index, (int) $item->position_index, $book->id);
            })
            ->values()
            ->map(fn (Book $book): array => $this->serializeBook($book, $bookShelfItems->get($book->id)));

        $notes = WantToReadNote::query()
            ->where('user_id', $user->id)
            ->orderBy('position_index')
            ->orderBy('id')
            ->get()
            ->map(fn (WantToReadNote $note): array => [
                'id' => $note->id,
                'title' => $note->title,
                'author' => $note->author,
                'note' => $note->note,
            ]);

        $shelfDividers = ShelfDivider::query()
            ->where('user_id', $user->id)
            ->orderBy('id')
            ->get()
            ->filter(fn (ShelfDivider $divider): bool => $dividerShelfItems->has($divider->id))
            ->sortBy(function (ShelfDivider $divider) use ($dividerShelfItems): string {
                $item = $dividerShelfItems->get($divider->id);

                return sprintf('%03d-%04d-%08d', (int) $item->shelf_index, (int) $item->position_index, $divider->id);
            })
            ->map(fn (ShelfDivider $divider): array => [
                'id' => $divider->id,
                'shelfIndex' => (int) $dividerShelfItems->get($divider->id)->shelf_index,
                'positionIndex' => (int) $dividerShelfItems->get($divider->id)->position_index,
                'style' => $divider->style,
            ]);

        $preference = UserPreference::query()->firstOrCreate(
            ['user_id' => $user->id],
            [
                'bookcase_theme' => 'oak',
                'bookcase_shape' => 'classic',
                'notes_theme' => 'paper',
                'shelf_count' => 4,
            ],
        );

        return [
            'books' => $books,
            'notes' => $notes,
            'shelfDividers' => $shelfDividers,
            'preferences' => [
                'bookcaseTheme' => $preference->bookcase_theme,
                'bookcaseShape' => $preference->bookcase_shape,
                'notesTheme' => $preference->notes_theme,
                'shelfCount' => $preference->shelf_count,
            ],
        ];
    }

    private function serializeBook(Book $book, ShelfItem $shelfItem): array
    {
        $payload = is_array($book->open_library_payload) ? $book->open_library_payload : [];
        $coverIds = collect($book->open_library_cover_ids ?: $this->openLibrary->coverIdsFromPayload($payload))
            ->map(fn (mixed $coverId): int => (int) $coverId)
            ->filter(fn (int $coverId): bool => $coverId > 0)
            ->values();

        $selectedCoverId = $book->open_library_cover_id;
        if ($selectedCoverId && ! $coverIds->contains($selectedCoverId)) {
            $selectedCoverId = null;
        }

        if (! $selectedCoverId) {
            $selectedCoverId = $coverIds->first();
        }

        return [
            'id' => $book->id,
            'title' => $book->title,
            'author' => $book->author,
            'publisher' => $book->publisher,
            'publishYear' => $this->openLibrary->metadataPublishYear($payload),
            'isbn' => $book->isbn,
            'spineColor' => $book->spine_color,
            'coverId' => $selectedCoverId,
            'coverUrl' => $selectedCoverId ? $this->openLibrary->coverUrl($selectedCoverId, 'M') : null,
            'coverOptions' => $this->openLibrary->coverOptions($coverIds->all()),
            'canRefreshMetadata' => filled($book->open_library_work_key) || filled($book->open_library_edition_key),
            'hasOpenLibraryMetadata' => $payload !== [],
            'shelfIndex' => (int) $shelfItem->shelf_index,
            'positionIndex' => (int) $shelfItem->position_index,
            'rotationMode' => $book->placement->rotation_mode ?: 'upright',
        ];
    }
}
