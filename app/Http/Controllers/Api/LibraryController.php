<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Book;
use App\Models\BookPlacement;
use App\Models\ShelfDivider;
use App\Models\ShelfItem;
use App\Models\User;
use App\Models\UserPreference;
use App\Models\WantToReadNote;
use App\Services\LibraryStateService;
use App\Services\OpenLibraryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class LibraryController extends Controller
{
    private const ROTATION_MODES = ['upright', 'side', 'tilt_left', 'tilt_right'];

    private const DIVIDER_STYLES = ['bookend', 'bookend_left', 'bookend_right', 'plant', 'knick_knack'];

    private const MAX_SHELF_POSITION = 250;

    private const AUTO_TOP_SHELF_CAPACITY = 4;

    private const AUTO_OTHER_SHELF_CAPACITY = 6;

    public function __construct(
        private readonly LibraryStateService $libraryState,
        private readonly OpenLibraryService $openLibrary,
    ) {}

    public function state(Request $request): JsonResponse
    {
        $user = $this->userFromRequest($request);
        $this->ensureShelfItemsForUser($user->id);

        return response()->json($this->libraryState->payload($user));
    }

    public function searchOpenLibrary(Request $request): JsonResponse
    {
        $user = $this->userFromRequest($request);
        $data = $request->validate([
            'query' => ['required', 'string', 'max:180'],
        ]);

        return response()->json([
            'results' => $this->openLibrary->search($data['query']),
        ]);
    }

    public function searchBookshelf(Request $request): JsonResponse
    {
        $user = $this->userFromRequest($request);
        $this->ensureShelfItemsForUser($user->id);
        $data = $request->validate([
            'query' => ['required', 'string', 'max:180'],
        ]);

        $query = trim($data['query']);

        if ($query === '') {
            return response()->json(['results' => []]);
        }

        $books = Book::query()
            ->where('user_id', $user->id)
            ->where('title', 'like', "%{$query}%")
            ->orderBy('title')
            ->limit(20)
            ->get();

        $shelfItems = ShelfItem::query()
            ->where('user_id', $user->id)
            ->where('item_type', ShelfItem::TYPE_BOOK)
            ->whereIn('item_id', $books->pluck('id')->all())
            ->get()
            ->keyBy('item_id');

        $results = $books
            ->filter(fn (Book $book): bool => $shelfItems->has($book->id))
            ->map(function (Book $book) use ($shelfItems): array {
                $item = $shelfItems->get($book->id);

                return [
                    'id' => $book->id,
                    'title' => $book->title,
                    'author' => $book->author,
                    'shelfIndex' => (int) $item->shelf_index,
                    'positionIndex' => (int) $item->position_index,
                ];
            })
            ->values()
            ->all();

        return response()->json(['results' => $results]);
    }

    public function openLibrarySelection(Request $request): JsonResponse
    {
        $user = $this->userFromRequest($request);
        $data = $request->validate([
            'work_key' => ['nullable', 'string', 'max:60'],
            'edition_key' => ['nullable', 'string', 'max:60'],
        ]);

        return response()->json(
            $this->openLibrary->selection($data['work_key'] ?? null, $data['edition_key'] ?? null)
        );
    }

    public function storeBook(Request $request): JsonResponse
    {
        $user = $this->userFromRequest($request);
        $this->ensureShelfItemsForUser($user->id);

        $data = $request->validate([
            'title' => ['required', 'string', 'max:180'],
            'author' => ['nullable', 'string', 'max:180'],
            'publisher' => ['nullable', 'string', 'max:180'],
            'spine_color' => ['nullable', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'isbn' => ['nullable', 'string', 'max:20'],
            'shelf_index' => ['nullable', 'integer', 'min:0', 'max:20'],
            'position_index' => ['nullable', 'integer', 'min:0', 'max:250'],
            'rotation_mode' => ['nullable', Rule::in(self::ROTATION_MODES)],
            'open_library_work_key' => ['nullable', 'string', 'max:60'],
            'open_library_edition_key' => ['nullable', 'string', 'max:60'],
            'open_library_cover_id' => ['nullable', 'integer', 'min:1'],
            'open_library_payload' => ['nullable', 'array'],
        ]);

        $payload = is_array($data['open_library_payload'] ?? null)
            ? $data['open_library_payload']
            : [];

        if (
            $payload === []
            && (filled($data['open_library_work_key'] ?? null) || filled($data['open_library_edition_key'] ?? null))
        ) {
            $selection = $this->openLibrary->selection(
                $data['open_library_work_key'] ?? null,
                $data['open_library_edition_key'] ?? null,
            );
            $payload = is_array($selection['payload'] ?? null) ? $selection['payload'] : [];
        }

        $book = Book::query()->create(array_merge(
            ['user_id' => $user->id],
            $this->bookAttributes($data, $payload),
        ));

        $targetShelf = $data['shelf_index'] ?? null;
        $targetPosition = $data['position_index'] ?? null;

        if (! is_int($targetShelf) && ! is_int($targetPosition)) {
            $placement = $this->nextAutoBookPlacement($user->id);
            $targetShelf = $placement['shelf_index'];
            $targetPosition = $placement['position_index'];
        }

        $this->placeBook(
            $book,
            is_int($targetShelf) ? $targetShelf : 0,
            is_int($targetPosition) ? $targetPosition : PHP_INT_MAX,
            $data['rotation_mode'] ?? null,
        );

        return response()->json($this->libraryState->payload($user));
    }

    public function moveBook(Request $request, Book $book): JsonResponse
    {
        $user = $this->userFromRequest($request);
        $this->assertOwnership($book->user_id === $user->id);
        $this->ensureShelfItemsForUser($user->id);

        $data = $request->validate([
            'shelf_index' => ['required', 'integer', 'min:0', 'max:20'],
            'position_index' => ['required', 'integer', 'min:0', 'max:250'],
            'rotation_mode' => ['nullable', Rule::in(self::ROTATION_MODES)],
        ]);

        $this->placeBook(
            $book,
            (int) $data['shelf_index'],
            (int) $data['position_index'],
            $data['rotation_mode'] ?? null,
        );

        return response()->json($this->libraryState->payload($user));
    }

    public function updateBookCover(Request $request, Book $book): JsonResponse
    {
        $user = $this->userFromRequest($request);
        $this->assertOwnership($book->user_id === $user->id);

        $data = $request->validate([
            'cover_id' => ['required', 'integer', 'min:1'],
        ]);

        $coverIds = $this->availableCoverIds($book);
        abort_unless(in_array((int) $data['cover_id'], $coverIds, true), 422);

        $book->update([
            'open_library_cover_id' => (int) $data['cover_id'],
        ]);

        return response()->json($this->libraryState->payload($user));
    }

    public function refreshBookMetadata(Request $request): JsonResponse
    {
        $user = $this->userFromRequest($request);
        $data = $request->validate([
            'book_ids' => ['required', 'array', 'min:1', 'max:100'],
            'book_ids.*' => ['integer'],
        ]);

        $books = Book::query()
            ->where('user_id', $user->id)
            ->whereIn('id', $data['book_ids'])
            ->get();

        foreach ($books as $book) {
            if (! $book->open_library_work_key && ! $book->open_library_edition_key) {
                continue;
            }

            $selection = $this->openLibrary->selection($book->open_library_work_key, $book->open_library_edition_key);
            $payload = is_array($selection['payload'] ?? null) ? $selection['payload'] : [];

            if ($payload === []) {
                continue;
            }

            $book->update($this->bookAttributes([
                'title' => $book->title,
                'author' => $book->author,
                'publisher' => $book->publisher,
                'spine_color' => $book->spine_color,
                'open_library_work_key' => $book->open_library_work_key,
                'open_library_edition_key' => $book->open_library_edition_key,
                'open_library_cover_id' => $book->open_library_cover_id,
            ], $payload));
        }

        return response()->json($this->libraryState->payload($user));
    }

    public function destroyBook(Request $request, Book $book): JsonResponse
    {
        $user = $this->userFromRequest($request);
        $this->assertOwnership($book->user_id === $user->id);
        $this->ensureShelfItemsForUser($user->id);

        DB::transaction(function () use ($book): void {
            $removedShelf = $this->removeShelfItem($book->user_id, ShelfItem::TYPE_BOOK, $book->id);

            $book->delete([]);
            $this->syncBookPlacementsFromShelfItems($book->user_id);
            $this->syncShelfDividersFromShelfItems($book->user_id);

            if ($removedShelf !== null) {
                $this->normalizeShelfRotationModes($book->user_id, $removedShelf);
            }
        });

        return response()->json($this->libraryState->payload($user));
    }

    public function storeNote(Request $request): JsonResponse
    {
        $user = $this->userFromRequest($request);

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

        return response()->json($this->libraryState->payload($user));
    }

    public function updateNote(Request $request, WantToReadNote $note): JsonResponse
    {
        $user = $this->userFromRequest($request);
        $this->assertOwnership($note->user_id === $user->id);

        $data = $request->validate([
            'title' => ['sometimes', 'required', 'string', 'max:180'],
            'author' => ['sometimes', 'nullable', 'string', 'max:180'],
            'note' => ['sometimes', 'nullable', 'string', 'max:800'],
        ]);

        $note->update($data);

        return response()->json($this->libraryState->payload($user));
    }

    public function destroyNote(Request $request, WantToReadNote $note): JsonResponse
    {
        $user = $this->userFromRequest($request);
        $this->assertOwnership($note->user_id === $user->id);

        DB::transaction(function () use ($note): void {
            WantToReadNote::query()
                ->where('user_id', $note->user_id)
                ->where('position_index', '>', $note->position_index)
                ->decrement('position_index');

            $note->delete([]);
        });

        return response()->json($this->libraryState->payload($user));
    }

    public function storeShelfDivider(Request $request): JsonResponse
    {
        $user = $this->userFromRequest($request);
        $this->ensureShelfItemsForUser($user->id);

        $data = $request->validate([
            'shelf_index' => ['required', 'integer', 'min:0', 'max:20'],
            'style' => ['required', Rule::in(self::DIVIDER_STYLES)],
        ]);

        DB::transaction(function () use ($user, $data): void {
            $shelfIndex = (int) $data['shelf_index'];

            $divider = ShelfDivider::query()->create([
                'user_id' => $user->id,
                'shelf_index' => $shelfIndex,
                'position_index' => $this->nextLegacyDividerPosition($user->id, $shelfIndex),
                'style' => $data['style'],
            ]);

            $this->moveShelfItem(
                $user->id,
                ShelfItem::TYPE_DIVIDER,
                $divider->id,
                $shelfIndex,
                $this->nextShelfTailPosition($user->id, $shelfIndex),
            );

            $this->syncBookPlacementsFromShelfItems($user->id);
            $this->syncShelfDividersFromShelfItems($user->id);
        });

        return response()->json($this->libraryState->payload($user));
    }

    public function updateShelfDivider(Request $request, ShelfDivider $divider): JsonResponse
    {
        $user = $this->userFromRequest($request);
        $this->assertOwnership($divider->user_id === $user->id);
        $this->ensureShelfItemsForUser($user->id);

        $data = $request->validate([
            'shelf_index' => ['required', 'integer', 'min:0', 'max:20'],
            'position_index' => ['required', 'integer', 'min:0', 'max:250'],
            'style' => ['required', Rule::in(self::DIVIDER_STYLES)],
        ]);

        DB::transaction(function () use ($user, $divider, $data): void {
            $this->moveShelfItem(
                $user->id,
                ShelfItem::TYPE_DIVIDER,
                $divider->id,
                (int) $data['shelf_index'],
                (int) $data['position_index'],
            );

            $divider->update([
                'style' => $data['style'],
            ]);

            $this->syncBookPlacementsFromShelfItems($user->id);
            $this->syncShelfDividersFromShelfItems($user->id);
        });

        return response()->json($this->libraryState->payload($user));
    }

    public function destroyShelfDivider(Request $request, ShelfDivider $divider): JsonResponse
    {
        $user = $this->userFromRequest($request);
        $this->assertOwnership($divider->user_id === $user->id);
        $this->ensureShelfItemsForUser($user->id);

        DB::transaction(function () use ($user, $divider): void {
            $this->removeShelfItem($user->id, ShelfItem::TYPE_DIVIDER, $divider->id);
            $divider->delete([]);
            $this->syncBookPlacementsFromShelfItems($user->id);
            $this->syncShelfDividersFromShelfItems($user->id);
        });

        return response()->json($this->libraryState->payload($user));
    }

    public function updatePreferences(Request $request): JsonResponse
    {
        $user = $this->userFromRequest($request);

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

        return response()->json($this->libraryState->payload($user));
    }

    private function placeBook(Book $book, int $targetShelf, int $targetPosition, ?string $rotationMode = null): void
    {
        DB::transaction(function () use ($book, $targetShelf, $targetPosition, $rotationMode): void {
            $targetShelf = max(0, $targetShelf);
            $currentPlacement = BookPlacement::query()->where('book_id', $book->id)->first();
            $existingItem = ShelfItem::query()
                ->where('user_id', $book->user_id)
                ->where('item_type', ShelfItem::TYPE_BOOK)
                ->where('item_id', $book->id)
                ->first();

            $previousShelfIndex = $existingItem?->shelf_index;
            $resolvedRotationMode = $rotationMode ?: ($currentPlacement?->rotation_mode ?: 'upright');

            $movedItem = $this->moveShelfItem(
                $book->user_id,
                ShelfItem::TYPE_BOOK,
                $book->id,
                $targetShelf,
                $targetPosition === PHP_INT_MAX
                    ? $this->nextShelfTailPosition($book->user_id, $targetShelf)
                    : min(
                        max(0, $targetPosition),
                        $this->nextShelfTailPosition($book->user_id, $targetShelf),
                    ),
            );

            BookPlacement::query()->updateOrCreate(
                ['book_id' => $book->id],
                [
                    'user_id' => $book->user_id,
                    'shelf_index' => (int) $movedItem->shelf_index,
                    'position_index' => (int) $movedItem->position_index,
                    'rotation_mode' => $resolvedRotationMode,
                ],
            );

            $this->syncBookPlacementsFromShelfItems($book->user_id);
            $this->syncShelfDividersFromShelfItems($book->user_id);
            $this->normalizeShelfRotationModes($book->user_id, (int) $movedItem->shelf_index);

            if ($previousShelfIndex !== null && (int) $previousShelfIndex !== (int) $movedItem->shelf_index) {
                $this->normalizeShelfRotationModes($book->user_id, (int) $previousShelfIndex);
            }
        });
    }

    private function normalizeShelfRotationModes(int $userId, int $shelfIndex): void
    {
        $lastBookItem = ShelfItem::query()
            ->where('user_id', $userId)
            ->where('shelf_index', $shelfIndex)
            ->where('item_type', ShelfItem::TYPE_BOOK)
            ->orderByDesc('position_index')
            ->first();

        if (! $lastBookItem) {
            return;
        }

        BookPlacement::query()
            ->where('book_id', (int) $lastBookItem->item_id)
            ->where('rotation_mode', 'tilt_right')
            ->update(['rotation_mode' => 'upright']);
    }

    private function moveShelfItem(int $userId, string $itemType, int $itemId, int $targetShelf, int $targetPosition): ShelfItem
    {
        $targetShelf = max(0, $targetShelf);
        $targetPosition = max(0, min($targetPosition, self::MAX_SHELF_POSITION));
        $current = ShelfItem::query()
            ->where('user_id', $userId)
            ->where('item_type', $itemType)
            ->where('item_id', $itemId)
            ->first();

        if (! $current) {
            ShelfItem::query()
                ->where('user_id', $userId)
                ->where('shelf_index', $targetShelf)
                ->where('position_index', '>=', $targetPosition)
                ->increment('position_index');

            return ShelfItem::query()->create([
                'user_id' => $userId,
                'shelf_index' => $targetShelf,
                'position_index' => $targetPosition,
                'item_type' => $itemType,
                'item_id' => $itemId,
            ]);
        }

        $currentShelf = (int) $current->shelf_index;
        $currentPosition = (int) $current->position_index;

        if ($currentShelf === $targetShelf && $currentPosition === $targetPosition) {
            return $current;
        }

        $current->update([
            'position_index' => 1_000_000 + (int) $current->id,
        ]);

        if ($currentShelf !== $targetShelf) {
            ShelfItem::query()
                ->where('user_id', $userId)
                ->where('shelf_index', $currentShelf)
                ->where('position_index', '>', $currentPosition)
                ->decrement('position_index');

            ShelfItem::query()
                ->where('user_id', $userId)
                ->where('shelf_index', $targetShelf)
                ->where('position_index', '>=', $targetPosition)
                ->increment('position_index');
        } elseif ($targetPosition < $currentPosition) {
            ShelfItem::query()
                ->where('user_id', $userId)
                ->where('shelf_index', $targetShelf)
                ->whereBetween('position_index', [$targetPosition, $currentPosition - 1])
                ->increment('position_index');
        } else {
            ShelfItem::query()
                ->where('user_id', $userId)
                ->where('shelf_index', $targetShelf)
                ->whereBetween('position_index', [$currentPosition + 1, $targetPosition])
                ->decrement('position_index');
        }

        $current->update([
            'shelf_index' => $targetShelf,
            'position_index' => $targetPosition,
        ]);

        return $current->refresh();
    }

    private function removeShelfItem(int $userId, string $itemType, int $itemId): ?int
    {
        $item = ShelfItem::query()
            ->where('user_id', $userId)
            ->where('item_type', $itemType)
            ->where('item_id', $itemId)
            ->first();

        if (! $item) {
            return null;
        }

        $shelfIndex = (int) $item->shelf_index;
        $positionIndex = (int) $item->position_index;
        $item->delete([]);

        ShelfItem::query()
            ->where('user_id', $userId)
            ->where('shelf_index', $shelfIndex)
            ->where('position_index', '>', $positionIndex)
            ->decrement('position_index');

        return $shelfIndex;
    }

    private function nextShelfTailPosition(int $userId, int $shelfIndex): int
    {
        $lastPosition = ShelfItem::query()
            ->where('user_id', $userId)
            ->where('shelf_index', $shelfIndex)
            ->max('position_index');

        if (! is_numeric($lastPosition)) {
            return 0;
        }

        return min(((int) $lastPosition) + 1, self::MAX_SHELF_POSITION);
    }

    /**
     * @return array{shelf_index:int, position_index:int}
     */
    private function nextAutoBookPlacement(int $userId): array
    {
        $preferences = UserPreference::query()->firstOrCreate(
            ['user_id' => $userId],
            [
                'bookcase_theme' => 'oak',
                'bookcase_shape' => 'classic',
                'notes_theme' => 'paper',
                'shelf_count' => 4,
            ],
        );

        $shelfCount = max(2, min(8, (int) $preferences->shelf_count));
        $itemCounts = ShelfItem::query()
            ->where('user_id', $userId)
            ->selectRaw('shelf_index, COUNT(*) as total')
            ->groupBy('shelf_index')
            ->pluck('total', 'shelf_index');

        for ($shelfIndex = 0; $shelfIndex < $shelfCount; $shelfIndex++) {
            $countOnShelf = (int) ($itemCounts[$shelfIndex] ?? 0);
            $capacity = $shelfIndex === 0 ? self::AUTO_TOP_SHELF_CAPACITY : self::AUTO_OTHER_SHELF_CAPACITY;

            if ($countOnShelf < $capacity) {
                return [
                    'shelf_index' => $shelfIndex,
                    'position_index' => $this->nextShelfTailPosition($userId, $shelfIndex),
                ];
            }
        }

        $lastShelf = $shelfCount - 1;

        return [
            'shelf_index' => $lastShelf,
            'position_index' => $this->nextShelfTailPosition($userId, $lastShelf),
        ];
    }

    private function nextLegacyDividerPosition(int $userId, int $shelfIndex): int
    {
        $lastDividerPosition = ShelfDivider::query()
            ->where('user_id', $userId)
            ->where('shelf_index', $shelfIndex)
            ->max('position_index');

        if (! is_numeric($lastDividerPosition)) {
            return 0;
        }

        return min(((int) $lastDividerPosition) + 1, self::MAX_SHELF_POSITION);
    }

    private function syncBookPlacementsFromShelfItems(int $userId): void
    {
        $bookItems = ShelfItem::query()
            ->where('user_id', $userId)
            ->where('item_type', ShelfItem::TYPE_BOOK)
            ->get()
            ->keyBy('item_id');

        $placements = BookPlacement::query()->where('user_id', $userId)->get();

        foreach ($placements as $placement) {
            $item = $bookItems->get($placement->book_id);
            if (! $item) {
                continue;
            }

            $placement->update([
                'shelf_index' => (int) $item->shelf_index,
                'position_index' => (int) $item->position_index,
            ]);
        }
    }

    private function syncShelfDividersFromShelfItems(int $userId): void
    {
        $dividerItems = ShelfItem::query()
            ->where('user_id', $userId)
            ->where('item_type', ShelfItem::TYPE_DIVIDER)
            ->get()
            ->keyBy('item_id');

        $dividers = ShelfDivider::query()->where('user_id', $userId)->get();

        foreach ($dividers as $divider) {
            $item = $dividerItems->get($divider->id);
            if (! $item) {
                continue;
            }

            $divider->update([
                'shelf_index' => (int) $item->shelf_index,
                'position_index' => 1_000_000 + (int) $divider->id,
            ]);
        }

        foreach ($dividers as $divider) {
            $item = $dividerItems->get($divider->id);
            if (! $item) {
                continue;
            }

            $divider->update([
                'shelf_index' => (int) $item->shelf_index,
                'position_index' => (int) $item->position_index,
            ]);
        }
    }

    private function ensureShelfItemsForUser(int $userId): void
    {
        $bookIds = BookPlacement::query()
            ->where('user_id', $userId)
            ->pluck('book_id')
            ->map(fn (mixed $id): int => (int) $id)
            ->sort()
            ->values();

        $dividerIds = ShelfDivider::query()
            ->where('user_id', $userId)
            ->pluck('id')
            ->map(fn (mixed $id): int => (int) $id)
            ->sort()
            ->values();

        $bookCount = $bookIds->count();
        $dividerCount = $dividerIds->count();
        $requiredCount = $bookCount + $dividerCount;

        if ($requiredCount === 0) {
            return;
        }

        $itemCount = (int) ShelfItem::query()->where('user_id', $userId)->count();

        $itemBookIds = ShelfItem::query()
            ->where('user_id', $userId)
            ->where('item_type', ShelfItem::TYPE_BOOK)
            ->pluck('item_id')
            ->map(fn (mixed $id): int => (int) $id)
            ->sort()
            ->values();

        $itemDividerIds = ShelfItem::query()
            ->where('user_id', $userId)
            ->where('item_type', ShelfItem::TYPE_DIVIDER)
            ->pluck('item_id')
            ->map(fn (mixed $id): int => (int) $id)
            ->sort()
            ->values();

        $isComplete = $itemCount >= $requiredCount
            && $itemBookIds->all() === $bookIds->all()
            && $itemDividerIds->all() === $dividerIds->all();

        if ($isComplete) {
            return;
        }

        $this->rebuildShelfItemsFromLegacy($userId);
    }

    private function rebuildShelfItemsFromLegacy(int $userId): void
    {
        $bookRows = BookPlacement::query()
            ->where('user_id', $userId)
            ->orderBy('shelf_index')
            ->orderBy('position_index')
            ->orderBy('id')
            ->get(['book_id', 'shelf_index', 'position_index']);

        $dividerRows = ShelfDivider::query()
            ->where('user_id', $userId)
            ->orderBy('shelf_index')
            ->orderBy('position_index')
            ->orderBy('id')
            ->get(['id', 'shelf_index', 'position_index']);

        $grouped = [];

        foreach ($bookRows as $row) {
            $key = $userId.':'.(int) $row->shelf_index;
            $grouped[$key][] = [
                'item_type' => ShelfItem::TYPE_BOOK,
                'item_id' => (int) $row->book_id,
                'shelf_index' => (int) $row->shelf_index,
                'base_position' => (int) $row->position_index,
                'sort_priority' => 0,
            ];
        }

        foreach ($dividerRows as $row) {
            $key = $userId.':'.(int) $row->shelf_index;
            $grouped[$key][] = [
                'item_type' => ShelfItem::TYPE_DIVIDER,
                'item_id' => (int) $row->id,
                'shelf_index' => (int) $row->shelf_index,
                'base_position' => (int) $row->position_index,
                'sort_priority' => 1,
            ];
        }

        ShelfItem::query()->where('user_id', $userId)->delete();

        foreach ($grouped as $items) {
            usort($items, function (array $left, array $right): int {
                if ($left['base_position'] !== $right['base_position']) {
                    return $left['base_position'] <=> $right['base_position'];
                }

                if ($left['sort_priority'] !== $right['sort_priority']) {
                    return $left['sort_priority'] <=> $right['sort_priority'];
                }

                return $left['item_id'] <=> $right['item_id'];
            });

            $occupiedPositions = [];

            foreach ($items as $item) {
                $position = $item['base_position'];
                while (isset($occupiedPositions[$position])) {
                    $position += 1;
                }
                $occupiedPositions[$position] = true;

                ShelfItem::query()->create([
                    'user_id' => $userId,
                    'shelf_index' => $item['shelf_index'],
                    'position_index' => $position,
                    'item_type' => $item['item_type'],
                    'item_id' => $item['item_id'],
                ]);
            }
        }
    }

    private function userFromRequest(Request $request): User
    {
        $user = $request->user();

        abort_unless($user instanceof User, 401);

        return $user;
    }

    private function assertOwnership(bool $isOwned): void
    {
        abort_unless($isOwned, 404);
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function bookAttributes(array $data, array $payload): array
    {
        $coverIds = $this->openLibrary->coverIdsFromPayload($payload);

        return [
            'title' => $this->openLibrary->metadataTitle($payload) ?? $data['title'],
            'author' => $this->openLibrary->metadataAuthor($payload) ?? ($data['author'] ?? null),
            'publisher' => $this->openLibrary->metadataPublisher($payload) ?? ($data['publisher'] ?? null),
            'spine_color' => $data['spine_color'] ?? '#6f4e37',
            'isbn' => $this->openLibrary->metadataIsbn($payload) ?? ($data['isbn'] ?? null),
            'open_library_work_key' => $this->normalizedKey(data_get($payload, 'work.key'), '/works/')
                ?? ($data['open_library_work_key'] ?? null),
            'open_library_edition_key' => $this->normalizedKey(data_get($payload, 'edition.key'), '/books/')
                ?? ($data['open_library_edition_key'] ?? null),
            'open_library_cover_id' => $this->selectedCoverId($data['open_library_cover_id'] ?? null, $coverIds),
            'open_library_cover_ids' => $coverIds,
            'open_library_payload' => $payload !== [] ? $payload : null,
        ];
    }

    /**
     * @return array<int, int>
     */
    private function availableCoverIds(Book $book): array
    {
        return collect($book->open_library_cover_ids ?: $this->openLibrary->coverIdsFromPayload($book->open_library_payload ?? []))
            ->map(fn (mixed $coverId): int => (int) $coverId)
            ->filter(fn (int $coverId): bool => $coverId > 0)
            ->unique()
            ->values()
            ->all();
    }

    /**
     * @param  array<int, int>  $coverIds
     */
    private function selectedCoverId(mixed $coverId, array $coverIds): ?int
    {
        $selectedCoverId = (int) ($coverId ?? 0);

        if ($selectedCoverId > 0 && in_array($selectedCoverId, $coverIds, true)) {
            return $selectedCoverId;
        }

        return $coverIds[0] ?? null;
    }

    private function normalizedKey(mixed $value, string $prefix): ?string
    {
        if (! is_string($value) || trim($value) === '') {
            return null;
        }

        $value = trim($value);

        if (str_starts_with($value, $prefix)) {
            return substr($value, strlen($prefix));
        }

        return ltrim($value, '/');
    }
}
