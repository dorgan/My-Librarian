<?php

namespace App\Services;

use App\Models\Book;
use App\Models\User;
use App\Models\UserPreference;
use App\Models\WantToReadNote;

class LibraryStateService
{
    public function __construct(private readonly OpenLibraryService $openLibrary)
    {
    }

    public function payload(User $user): array
    {
        $books = Book::query()
            ->with('placement')
            ->where('user_id', $user->id)
            ->get()
            ->filter(fn (Book $book): bool => (bool) $book->placement)
            ->sortBy(fn (Book $book): string => sprintf('%03d-%04d-%08d', $book->placement->shelf_index, $book->placement->position_index, $book->id))
            ->values()
            ->map(fn (Book $book): array => $this->serializeBook($book));

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
            'preferences' => [
                'bookcaseTheme' => $preference->bookcase_theme,
                'bookcaseShape' => $preference->bookcase_shape,
                'notesTheme' => $preference->notes_theme,
                'shelfCount' => $preference->shelf_count,
            ],
        ];
    }

    private function serializeBook(Book $book): array
    {
        $coverIds = collect($book->open_library_cover_ids ?? [])
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
            'spineColor' => $book->spine_color,
            'coverId' => $selectedCoverId,
            'coverUrl' => $selectedCoverId ? $this->openLibrary->coverUrl($selectedCoverId, 'M') : null,
            'coverOptions' => $coverIds
                ->map(fn (int $coverId): array => [
                    'id' => $coverId,
                    'url' => $this->openLibrary->coverUrl($coverId, 'M'),
                    'thumbnailUrl' => $this->openLibrary->coverUrl($coverId, 'S'),
                ])
                ->all(),
            'shelfIndex' => $book->placement->shelf_index,
            'positionIndex' => $book->placement->position_index,
        ];
    }
}
