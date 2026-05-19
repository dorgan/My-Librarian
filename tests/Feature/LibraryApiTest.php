<?php

namespace Tests\Feature;

use App\Models\Book;
use App\Models\BookPlacement;
use App\Models\ShelfDivider;
use App\Models\ShelfItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class LibraryApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_guest_is_redirected_to_login(): void
    {
        $this->get('/')->assertRedirect('/login');
        $this->getJson('/api/library-state')->assertUnauthorized();
    }

    public function test_authenticated_home_page_is_available(): void
    {
        $this->signIn();

        $response = $this->get('/');

        $response->assertOk();
        $response->assertSee('My Librarian');
        $response->assertSee('Search Open Library');
        $response->assertSee('Metadata refresh');
    }

    public function test_book_selection_and_cover_selection_work(): void
    {
        $this->signIn('reader@example.com');

        Http::fake([
            'https://openlibrary.org/books/OL456M.json' => Http::response([
                'key' => '/books/OL456M',
                'title' => 'Dune',
                'publishers' => ['Ace'],
                'publish_date' => '1965',
                'covers' => [101, 202],
                'isbn_13' => ['9780441013593'],
                'authors' => [
                    ['key' => '/authors/OL1A'],
                ],
            ]),
            'https://openlibrary.org/works/OL123W.json' => Http::response([
                'key' => '/works/OL123W',
                'title' => 'Dune',
                'covers' => [303],
            ]),
            'https://openlibrary.org/authors/OL1A.json' => Http::response([
                'key' => '/authors/OL1A',
                'name' => 'Frank Herbert',
            ]),
        ]);

        $selection = $this->getJson('/api/open-library/selection?work_key=OL123W&edition_key=OL456M')
            ->assertOk()
            ->assertJsonPath('title', 'Dune')
            ->assertJsonPath('author', 'Frank Herbert')
            ->assertJsonPath('publisher', 'Ace')
            ->assertJsonPath('publishYear', '1965')
            ->assertJsonPath('isbn', '9780441013593')
            ->assertJsonCount(3, 'covers')
            ->json();

        $createResponse = $this->postJson('/api/books', [
            'title' => 'Temporary Title',
            'author' => 'Temporary Author',
            'publisher' => 'Temporary Publisher',
            'shelf_index' => 0,
            'position_index' => 0,
            'spine_color' => '#123456',
            'open_library_work_key' => 'OL123W',
            'open_library_edition_key' => 'OL456M',
            'open_library_cover_id' => 202,
            'open_library_payload' => $selection['payload'],
        ]);

        $createResponse->assertOk();
        $createResponse->assertJsonPath('books.0.title', 'Dune');
        $createResponse->assertJsonPath('books.0.author', 'Frank Herbert');
        $createResponse->assertJsonPath('books.0.publisher', 'Ace');
        $createResponse->assertJsonPath('books.0.coverId', 202);
        $createResponse->assertJsonPath('books.0.rotationMode', 'upright');
        $createResponse->assertJsonCount(3, 'books.0.coverOptions');

        /** @var Book $book */
        $book = Book::query()->firstOrFail();
        $this->assertSame('Dune', $book->title);
        $this->assertSame('Frank Herbert', $book->author);
        $this->assertSame('Ace', $book->publisher);
        $this->assertSame('9780441013593', $book->isbn);
        $this->assertSame('OL123W', $book->open_library_work_key);
        $this->assertSame('OL456M', $book->open_library_edition_key);
        $this->assertSame([101, 202, 303], $book->open_library_cover_ids);

        $this->patchJson("/api/books/{$book->id}/cover", [
            'cover_id' => 303,
        ])->assertOk()->assertJsonPath('books.0.coverId', 303);

        $moveResponse = $this->patchJson("/api/books/{$book->id}/position", [
            'shelf_index' => 2,
            'position_index' => 1,
            'rotation_mode' => 'tilt_left',
        ]);

        $moveResponse->assertOk();
        $moveResponse->assertJsonPath('books.0.rotationMode', 'tilt_left');

        /** @var BookPlacement $placement */
        $placement = BookPlacement::query()->where('book_id', $book->id)->firstOrFail();
        $this->assertSame(2, $placement->shelf_index);
        $this->assertSame(0, $placement->position_index);
        $this->assertSame('tilt_left', $placement->rotation_mode);

        $this->deleteJson("/api/books/{$book->id}")->assertOk();

        $this->assertDatabaseMissing('books', ['id' => $book->id]);
        $this->assertDatabaseMissing('book_placements', ['book_id' => $book->id]);
    }

    public function test_open_library_search_uses_configured_contact_email_header(): void
    {
        $this->signIn('reader@example.com');

        Http::fake([
            'https://openlibrary.org/search.json*' => Http::response([
                'docs' => [
                    [
                        'title' => 'Dune',
                        'author_name' => ['Frank Herbert'],
                        'publisher' => ['Ace'],
                        'first_publish_year' => 1965,
                        'cover_i' => 909,
                        'edition_key' => ['OL456M'],
                        'key' => '/works/OL123W',
                    ],
                ],
            ]),
        ]);

        $this->getJson('/api/open-library/search?query=dune')
            ->assertOk()
            ->assertJsonPath('results.0.title', 'Dune');

        $contactEmail = config('app.openlibrary.contact_email');

        Http::assertSent(function (HttpRequest $request) use ($contactEmail): bool {
            return $request->url() === 'https://openlibrary.org/search.json?q=dune&limit=6'
                && $request->hasHeader('From', $contactEmail)
                && str_contains($request->header('User-Agent')[0] ?? '', $contactEmail);
        });
    }

    public function test_bookshelf_search_only_returns_matching_books_for_authenticated_user(): void
    {
        $user = $this->signIn('reader@example.com');

        $matchingBook = Book::query()->create([
            'user_id' => $user->id,
            'title' => 'Dune Messiah',
            'author' => 'Frank Herbert',
            'spine_color' => '#6f4e37',
        ]);

        BookPlacement::query()->create([
            'book_id' => $matchingBook->id,
            'user_id' => $user->id,
            'shelf_index' => 2,
            'position_index' => 1,
            'rotation_mode' => 'upright',
        ]);

        $nonMatchingBook = Book::query()->create([
            'user_id' => $user->id,
            'title' => 'The Hobbit',
            'author' => 'J.R.R. Tolkien',
            'spine_color' => '#6f4e37',
        ]);

        BookPlacement::query()->create([
            'book_id' => $nonMatchingBook->id,
            'user_id' => $user->id,
            'shelf_index' => 0,
            'position_index' => 0,
            'rotation_mode' => 'upright',
        ]);

        $otherUser = User::factory()->create();
        $otherUsersBook = Book::query()->create([
            'user_id' => $otherUser->id,
            'title' => 'Dune Encyclopedia',
            'author' => 'Willis E. McNelly',
            'spine_color' => '#6f4e37',
        ]);

        BookPlacement::query()->create([
            'book_id' => $otherUsersBook->id,
            'user_id' => $otherUser->id,
            'shelf_index' => 1,
            'position_index' => 0,
            'rotation_mode' => 'upright',
        ]);

        $this->getJson('/api/bookshelf/search?query=dune')
            ->assertOk()
            ->assertJsonCount(1, 'results')
            ->assertJsonPath('results.0.id', $matchingBook->id)
            ->assertJsonPath('results.0.title', 'Dune Messiah')
            ->assertJsonPath('results.0.shelfIndex', 2)
            ->assertJsonPath('results.0.positionIndex', 1);
    }

    public function test_bookshelf_search_requires_query(): void
    {
        $this->signIn();

        $this->getJson('/api/bookshelf/search')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['query']);
    }

    public function test_user_cannot_modify_another_users_book(): void
    {
        $owner = User::factory()->create();
        $book = Book::query()->create([
            'user_id' => $owner->id,
            'title' => 'Private Book',
            'spine_color' => '#123456',
        ]);

        $rightBook = Book::query()->create([
            'user_id' => $owner->id,
            'title' => 'Right Book',
            'author' => 'Author Two',
            'publisher' => 'Pub Two',
            'spine_color' => '#654321',
        ]);

        $this->signIn('other@example.com');

        $this->deleteJson("/api/books/{$book->id}")->assertNotFound();
    }

    public function test_shelf_divider_can_be_added_and_removed(): void
    {
        $user = $this->signIn('reader@example.com');

        $createResponse = $this->postJson('/api/shelf-dividers', [
            'shelf_index' => 1,
            'style' => 'bookend_right',
        ]);

        $createResponse->assertOk();
        $createResponse->assertJsonCount(1, 'shelfDividers');
        $createResponse->assertJsonPath('shelfDividers.0.shelfIndex', 1);
        $createResponse->assertJsonPath('shelfDividers.0.positionIndex', 0);
        $createResponse->assertJsonPath('shelfDividers.0.style', 'bookend_right');

        $this->assertDatabaseHas('shelf_dividers', [
            'user_id' => $user->id,
            'shelf_index' => 1,
            'position_index' => 0,
            'style' => 'bookend_right',
        ]);

        /** @var ShelfDivider $divider */
        $divider = ShelfDivider::query()->firstOrFail();

        $this->deleteJson("/api/shelf-dividers/{$divider->id}")
            ->assertOk()
            ->assertJsonCount(0, 'shelfDividers');

        $this->assertDatabaseMissing('shelf_dividers', ['id' => $divider->id]);
    }

    public function test_multiple_dividers_can_be_added_to_the_same_shelf(): void
    {
        $this->signIn('reader@example.com');

        $this->postJson('/api/shelf-dividers', [
            'shelf_index' => 1,
            'style' => 'bookend_left',
        ])->assertOk();

        $this->postJson('/api/shelf-dividers', [
            'shelf_index' => 1,
            'style' => 'plant',
        ])->assertOk();

        $this->postJson('/api/shelf-dividers', [
            'shelf_index' => 1,
            'style' => 'knick_knack',
        ])->assertOk();

        $this->assertSame(3, ShelfDivider::query()->where('shelf_index', 1)->count());
    }

    public function test_shelf_dividers_are_auto_placed_at_end_and_can_be_moved_between_books(): void
    {
        $user = $this->signIn('reader@example.com');

        $first = Book::query()->create([
            'user_id' => $user->id,
            'title' => 'First',
            'spine_color' => '#6f4e37',
        ]);

        $second = Book::query()->create([
            'user_id' => $user->id,
            'title' => 'Second',
            'spine_color' => '#6f4e37',
        ]);

        BookPlacement::query()->create([
            'book_id' => $first->id,
            'user_id' => $user->id,
            'shelf_index' => 1,
            'position_index' => 0,
            'rotation_mode' => 'upright',
        ]);

        BookPlacement::query()->create([
            'book_id' => $second->id,
            'user_id' => $user->id,
            'shelf_index' => 1,
            'position_index' => 1,
            'rotation_mode' => 'upright',
        ]);

        $this->postJson('/api/shelf-dividers', [
            'shelf_index' => 1,
            'style' => 'bookend_left',
        ])->assertOk()
            ->assertJsonPath('shelfDividers.0.positionIndex', 2)
            ->assertJsonPath('shelfDividers.0.style', 'bookend_left');

        /** @var ShelfDivider $divider */
        $divider = ShelfDivider::query()->firstOrFail();

        $this->patchJson("/api/shelf-dividers/{$divider->id}", [
            'shelf_index' => 1,
            'position_index' => 1,
            'style' => 'plant',
        ])->assertOk()
            ->assertJsonPath('shelfDividers.0.positionIndex', 1)
            ->assertJsonPath('shelfDividers.0.style', 'plant');

        $this->assertDatabaseHas('shelf_dividers', [
            'user_id' => $user->id,
            'shelf_index' => 1,
            'position_index' => 1,
            'style' => 'plant',
        ]);
    }

    public function test_moving_divider_to_another_dividers_position_reorders_dividers(): void
    {
        $user = $this->signIn('reader@example.com');

        $first = ShelfDivider::query()->create([
            'user_id' => $user->id,
            'shelf_index' => 0,
            'position_index' => 2,
            'style' => 'bookend_left',
        ]);

        $second = ShelfDivider::query()->create([
            'user_id' => $user->id,
            'shelf_index' => 0,
            'position_index' => 3,
            'style' => 'plant',
        ]);

        $this->patchJson("/api/shelf-dividers/{$first->id}", [
            'shelf_index' => 0,
            'position_index' => 3,
            'style' => 'bookend_right',
        ])->assertOk();

        $first->refresh();
        $second->refresh();

        $this->assertSame(3, (int) $first->position_index);
        $this->assertSame(2, (int) $second->position_index);
        $this->assertSame('bookend_right', $first->style);
    }

    public function test_user_cannot_delete_another_users_shelf_divider(): void
    {
        $owner = User::factory()->create();

        $divider = ShelfDivider::query()->create([
            'user_id' => $owner->id,
            'shelf_index' => 0,
            'position_index' => 0,
            'style' => 'bookend',
        ]);

        $this->signIn('other@example.com');

        $this->deleteJson("/api/shelf-dividers/{$divider->id}")->assertNotFound();
    }

    public function test_notes_and_preferences_are_scoped_per_user(): void
    {
        $firstUser = $this->signIn('first@example.com');

        $this->postJson('/api/notes', [
            'title' => 'Foundation',
            'author' => 'Isaac Asimov',
            'note' => 'Read next month.',
        ])->assertOk();

        $this->putJson('/api/preferences', [
            'bookcase_theme' => 'midnight',
            'bookcase_shape' => 'arched',
            'notes_theme' => 'dark',
            'shelf_count' => 6,
        ])->assertOk();

        $this->post('/logout');

        $secondUser = $this->signIn('second@example.com');
        $state = $this->getJson('/api/library-state')->assertOk()->json();

        $this->assertSame([], $state['notes']);
        $this->assertSame([], $state['shelfDividers']);
        $this->assertSame('oak', $state['preferences']['bookcaseTheme']);
        $this->assertNotSame($firstUser->id, $secondUser->id);
    }

    public function test_library_state_rebuilds_shelf_items_when_item_mapping_is_inconsistent(): void
    {
        $user = $this->signIn('reader@example.com');

        $book = Book::query()->create([
            'user_id' => $user->id,
            'title' => 'Dune',
            'author' => 'Frank Herbert',
            'spine_color' => '#6f4e37',
        ]);

        BookPlacement::query()->create([
            'book_id' => $book->id,
            'user_id' => $user->id,
            'shelf_index' => 0,
            'position_index' => 0,
            'rotation_mode' => 'upright',
        ]);

        $divider = ShelfDivider::query()->create([
            'user_id' => $user->id,
            'shelf_index' => 0,
            'position_index' => 1,
            'style' => 'bookend_left',
        ]);

        // Simulate stale shelf_items that have the right count but wrong item IDs.
        ShelfItem::query()->create([
            'user_id' => $user->id,
            'shelf_index' => 0,
            'position_index' => 0,
            'item_type' => ShelfItem::TYPE_BOOK,
            'item_id' => $book->id + 1000,
        ]);

        ShelfItem::query()->create([
            'user_id' => $user->id,
            'shelf_index' => 0,
            'position_index' => 1,
            'item_type' => ShelfItem::TYPE_DIVIDER,
            'item_id' => $divider->id + 1000,
        ]);

        $response = $this->getJson('/api/library-state')->assertOk();

        $response->assertJsonCount(1, 'books');
        $response->assertJsonPath('books.0.id', $book->id);
        $response->assertJsonCount(1, 'shelfDividers');
        $response->assertJsonPath('shelfDividers.0.id', $divider->id);

        $this->assertDatabaseHas('shelf_items', [
            'user_id' => $user->id,
            'item_type' => ShelfItem::TYPE_BOOK,
            'item_id' => $book->id,
            'shelf_index' => 0,
            'position_index' => 0,
        ]);

        $this->assertDatabaseHas('shelf_items', [
            'user_id' => $user->id,
            'item_type' => ShelfItem::TYPE_DIVIDER,
            'item_id' => $divider->id,
            'shelf_index' => 0,
            'position_index' => 1,
        ]);
    }

    private function signIn(string $email = 'reader@example.com'): User
    {
        /** @var User $user */
        $user = User::factory()->create([
            'email' => $email,
            'email_verified_at' => now(),
        ]);

        $this->actingAs($user);

        return $user;
    }
}
