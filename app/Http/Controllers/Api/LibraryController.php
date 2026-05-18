<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Book;
use App\Models\BookPlacement;
use App\Models\User;
use App\Models\UserPreference;
use App\Models\WantToReadNote;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class LibraryController extends Controller
{
    public function state(): JsonResponse
    {
        $user = $this->currentUser();

        return response()->json($this->statePayload($user));
    }

    public function storeBook(Request $request): JsonResponse
    {
        $user = $this->currentUser();

        $data = $request->validate([
            'title' => ['required', 'string', 'max:180'],
            'author' => ['nullable', 'string', 'max:180'],
            'spine_color' => ['nullable', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'shelf_index' => ['nullable', 'integer', 'min:0', 'max:20'],
            'position_index' => ['nullable', 'integer', 'min:0', 'max:250'],
        ]);

        $book = Book::query()->create([
            'user_id' => $user->id,
            'title' => $data['title'],
            'author' => $data['author'] ?? null,
            'spine_color' => $data['spine_color'] ?? '#6f4e37',
        ]);

        $this->placeBook(
            $book,
            (int) ($data['shelf_index'] ?? 0),
            (int) ($data['position_index'] ?? PHP_INT_MAX),
        );

        return response()->json($this->statePayload($user));
    }

    public function moveBook(Request $request, Book $book): JsonResponse
    {
        $user = $this->currentUser();
        $this->assertOwnership($book->user_id === $user->id);

        $data = $request->validate([
            'shelf_index' => ['required', 'integer', 'min:0', 'max:20'],
            'position_index' => ['required', 'integer', 'min:0', 'max:250'],
        ]);

        $this->placeBook($book, (int) $data['shelf_index'], (int) $data['position_index']);

        return response()->json($this->statePayload($user));
    }

    public function destroyBook(Book $book): JsonResponse
    {
        $user = $this->currentUser();
        $this->assertOwnership($book->user_id === $user->id);

        DB::transaction(function () use ($book): void {
            $placement = $book->placement;
            if ($placement) {
                BookPlacement::query()
                    ->where('user_id', $book->user_id)
                    ->where('shelf_index', $placement->shelf_index)
                    ->where('position_index', '>', $placement->position_index)
                    ->decrement('position_index');
            }

            $book->delete();
        });

        return response()->json($this->statePayload($user));
    }

    public function storeNote(Request $request): JsonResponse
    {
        $user = $this->currentUser();

        $data = $request->validate([
            'title' => ['required', 'string', 'max:180'],
            'author' => ['nullable', 'string', 'max:180'],
            'note' => ['nullable', 'string', 'max:800'],
        ]);

        $nextIndex = (int) WantToReadNote::query()
            ->where('user_id', $user->id)
            ->max('position_index');

        WantToReadNote::query()->create([
            'user_id' => $user->id,
            'title' => $data['title'],
            'author' => $data['author'] ?? null,
            'note' => $data['note'] ?? null,
            'position_index' => $nextIndex + 1,
        ]);

        return response()->json($this->statePayload($user));
    }

    public function updateNote(Request $request, WantToReadNote $note): JsonResponse
    {
        $user = $this->currentUser();
        $this->assertOwnership($note->user_id === $user->id);

        $data = $request->validate([
            'title' => ['sometimes', 'required', 'string', 'max:180'],
            'author' => ['sometimes', 'nullable', 'string', 'max:180'],
            'note' => ['sometimes', 'nullable', 'string', 'max:800'],
        ]);

        $note->update($data);

        return response()->json($this->statePayload($user));
    }

    public function destroyNote(WantToReadNote $note): JsonResponse
    {
        $user = $this->currentUser();
        $this->assertOwnership($note->user_id === $user->id);

        DB::transaction(function () use ($note): void {
            WantToReadNote::query()
                ->where('user_id', $note->user_id)
                ->where('position_index', '>', $note->position_index)
                ->decrement('position_index');

            $note->delete();
        });

        return response()->json($this->statePayload($user));
    }

    public function updatePreferences(Request $request): JsonResponse
    {
        $user = $this->currentUser();

        $data = $request->validate([
            'bookcase_theme' => ['required', Rule::in(['oak', 'walnut', 'midnight'])],
            'bookcase_shape' => ['required', Rule::in(['classic', 'minimal', 'arched'])],
            'notes_theme' => ['required', Rule::in(['paper', 'mint', 'dark'])],
            'shelf_count' => ['required', 'integer', 'min:2', 'max:8'],
        ]);

        UserPreference::query()->updateOrCreate(
            ['user_id' => $user->id],
            [
                'bookcase_theme' => $data['bookcase_theme'],
                'bookcase_shape' => $data['bookcase_shape'],
                'notes_theme' => $data['notes_theme'],
                'shelf_count' => $data['shelf_count'],
            ],
        );

        return response()->json($this->statePayload($user));
    }

    private function placeBook(Book $book, int $targetShelf, int $targetPosition): void
    {
        DB::transaction(function () use ($book, $targetShelf, $targetPosition): void {
            $targetShelf = max(0, $targetShelf);
            $currentPlacement = BookPlacement::query()
                ->where('book_id', $book->id)
                ->first();

            if ($currentPlacement) {
                BookPlacement::query()
                    ->where('user_id', $book->user_id)
                    ->where('shelf_index', $currentPlacement->shelf_index)
                    ->where('position_index', '>', $currentPlacement->position_index)
                    ->decrement('position_index');

                if ($currentPlacement->shelf_index === $targetShelf && $targetPosition > $currentPlacement->position_index) {
                    $targetPosition -= 1;
                }

                $currentPlacement->delete();
            }

            $booksOnShelf = (int) BookPlacement::query()
                ->where('user_id', $book->user_id)
                ->where('shelf_index', $targetShelf)
                ->count();

            $targetPosition = max(0, min($targetPosition, $booksOnShelf));

            BookPlacement::query()
                ->where('user_id', $book->user_id)
                ->where('shelf_index', $targetShelf)
                ->where('position_index', '>=', $targetPosition)
                ->increment('position_index');

            BookPlacement::query()->create([
                'book_id' => $book->id,
                'user_id' => $book->user_id,
                'shelf_index' => $targetShelf,
                'position_index' => $targetPosition,
            ]);
        });
    }

    private function statePayload(User $user): array
    {
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

    private function assertOwnership(bool $isOwned): void
    {
        abort_unless($isOwned, 404);
    }
}
