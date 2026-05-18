<?php

namespace App\Http\Controllers;

use App\Models\Book;
use App\Models\User;
use App\Models\UserPreference;
use App\Models\WantToReadNote;
use Illuminate\Contracts\View\View;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class LibraryPageController extends Controller
{
    public function __invoke(): View
    {
        $user = $this->currentUser();

        $books = Book::query()
            ->with('placement')
            ->where('user_id', $user->id)
            ->get()
            ->filter(fn (Book $book): bool => (bool) $book->placement)
            ->sortBy(fn (Book $book): string => sprintf('%03d-%04d-%08d', $book->placement->shelf_index, $book->placement->position_index, $book->id))
            ->values()
            ->map(fn (Book $book): array => [
                'id' => $book->id,
                'title' => $book->title,
                'author' => $book->author,
                'spineColor' => $book->spine_color,
                'shelfIndex' => $book->placement->shelf_index,
                'positionIndex' => $book->placement->position_index,
            ]);

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

        return view('library', [
            'initialState' => [
                'books' => $books,
                'notes' => $notes,
                'preferences' => [
                    'bookcaseTheme' => $preference->bookcase_theme,
                    'bookcaseShape' => $preference->bookcase_shape,
                    'notesTheme' => $preference->notes_theme,
                    'shelfCount' => $preference->shelf_count,
                ],
            ],
        ]);
    }

    private function currentUser(): User
    {
        return User::query()->firstOrCreate(
            ['email' => 'demo@my-library.local'],
            [
                'name' => 'Demo Reader',
                'password' => Hash::make(Str::random(40)),
            ],
        );
    }
}
