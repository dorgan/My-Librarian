<?php

namespace Tests\Feature;

use App\Models\Book;
use App\Models\BookPlacement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class LibraryApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_home_page_is_available(): void
    {
        $response = $this->get('/');

        $response->assertStatus(200);
        $response->assertSee('My Librarian');
        $response->assertSee('Search Open Library');
        $response->assertSee('Metadata refresh');
    }

    public function test_book_selection_and_cover_selection_work(): void
    {
        Http::fake([
            'https://openlibrary.org/books/OL456M.json' => Http::response([
                'key' => '/books/OL456M',
                'title' => 'Dune',
                'publishers' => ['Ace'],
                'publish_date' => '1965',
                'covers' => [101, 202],
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
        $this->assertSame('OL123W', $book->open_library_work_key);
        $this->assertSame('OL456M', $book->open_library_edition_key);
        $this->assertSame([101, 202, 303], $book->open_library_cover_ids);
        $this->assertSame('Dune', data_get($book->open_library_payload, 'edition.title'));
        $this->assertSame('Frank Herbert', data_get($book->open_library_payload, 'authors.0.name'));

        $this->assertDatabaseHas('book_placements', [
            'book_id' => $book->id,
            'shelf_index' => 0,
            'position_index' => 0,
            'rotation_mode' => 'upright',
        ]);

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

        $this->deleteJson("/api/books/{$book->id}")
            ->assertOk();

        $this->assertDatabaseMissing('books', ['id' => $book->id]);
        $this->assertDatabaseMissing('book_placements', ['book_id' => $book->id]);
    }

    public function test_open_library_search_uses_contact_email_header(): void
    {
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
            ->assertJsonPath('results.0.title', 'Dune')
            ->assertJsonPath('results.0.author', 'Frank Herbert')
            ->assertJsonPath('results.0.publisher', 'Ace')
            ->assertJsonPath('results.0.workKey', 'OL123W')
            ->assertJsonPath('results.0.editionKey', 'OL456M')
            ->assertJsonPath('results.0.cover.id', 909);

        Http::assertSent(function (HttpRequest $request): bool {
            return $request->url() === 'https://openlibrary.org/search.json?q=dune&limit=6'
                && $request->hasHeader('From', 'demo@my-library.local')
                && str_contains($request->header('User-Agent')[0] ?? '', 'demo@my-library.local');
        });
    }

    public function test_book_rotation_can_be_changed_without_moving_shelf_slot(): void
    {
        $user = User::factory()->create([
            'email' => 'demo@my-library.local',
        ]);

        $book = Book::query()->create([
            'user_id' => $user->id,
            'title' => 'Dune',
            'author' => 'Frank Herbert',
            'publisher' => 'Ace',
            'spine_color' => '#123456',
        ]);

        BookPlacement::query()->create([
            'book_id' => $book->id,
            'user_id' => $user->id,
            'shelf_index' => 1,
            'position_index' => 0,
            'rotation_mode' => 'upright',
        ]);

        $response = $this->patchJson("/api/books/{$book->id}/position", [
            'shelf_index' => 1,
            'position_index' => 0,
            'rotation_mode' => 'side',
        ]);

        $response->assertOk();
        $response->assertJsonPath('books.0.rotationMode', 'side');
        $response->assertJsonPath('books.0.shelfIndex', 1);
        $response->assertJsonPath('books.0.positionIndex', 0);

        $this->assertDatabaseHas('book_placements', [
            'book_id' => $book->id,
            'shelf_index' => 1,
            'position_index' => 0,
            'rotation_mode' => 'side',
        ]);
    }

    public function test_rightmost_book_cannot_remain_tilted_right(): void
    {
        $user = User::factory()->create([
            'email' => 'demo@my-library.local',
        ]);

        $leftBook = Book::query()->create([
            'user_id' => $user->id,
            'title' => 'Left Book',
            'author' => 'Author One',
            'publisher' => 'Pub One',
            'spine_color' => '#123456',
        ]);

        $rightBook = Book::query()->create([
            'user_id' => $user->id,
            'title' => 'Right Book',
            'author' => 'Author Two',
            'publisher' => 'Pub Two',
            'spine_color' => '#654321',
        ]);

        BookPlacement::query()->create([
            'book_id' => $leftBook->id,
            'user_id' => $user->id,
            'shelf_index' => 0,
            'position_index' => 0,
            'rotation_mode' => 'upright',
        ]);

        BookPlacement::query()->create([
            'book_id' => $rightBook->id,
            'user_id' => $user->id,
            'shelf_index' => 0,
            'position_index' => 1,
            'rotation_mode' => 'upright',
        ]);

        $this->patchJson("/api/books/{$leftBook->id}/position", [
            'shelf_index' => 0,
            'position_index' => 0,
            'rotation_mode' => 'tilt_right',
        ])->assertOk();

        $this->assertDatabaseHas('book_placements', [
            'book_id' => $leftBook->id,
            'rotation_mode' => 'tilt_right',
        ]);

        $response = $this->deleteJson("/api/books/{$rightBook->id}")
            ->assertOk();

        $leftBookState = collect($response->json('books'))->firstWhere('id', $leftBook->id);
        $this->assertIsArray($leftBookState);
        $this->assertSame('upright', $leftBookState['rotationMode']);

        $this->assertDatabaseHas('book_placements', [
            'book_id' => $leftBook->id,
            'shelf_index' => 0,
            'position_index' => 0,
            'rotation_mode' => 'upright',
        ]);

        $this->patchJson("/api/books/{$leftBook->id}/position", [
            'shelf_index' => 0,
            'position_index' => 0,
            'rotation_mode' => 'tilt_right',
        ])->assertOk()->assertJsonPath('books.0.rotationMode', 'upright');
    }

    public function test_refresh_metadata_updates_selected_books(): void
    {
        $user = User::query()->create([
            'name' => 'Demo Reader',
            'email' => 'demo@my-library.local',
            'password' => 'secret',
        ]);

        $book = Book::query()->create([
            'user_id' => $user->id,
            'title' => 'Old Title',
            'author' => 'Old Author',
            'publisher' => 'Old Publisher',
            'spine_color' => '#123456',
            'open_library_work_key' => 'OL123W',
            'open_library_edition_key' => 'OL456M',
            'open_library_cover_id' => 202,
            'open_library_cover_ids' => [202],
            'open_library_payload' => ['edition' => ['title' => 'Old Title']],
        ]);

        BookPlacement::query()->create([
            'book_id' => $book->id,
            'user_id' => $user->id,
            'shelf_index' => 0,
            'position_index' => 0,
        ]);

        Http::fake([
            'https://openlibrary.org/books/OL456M.json' => Http::response([
                'key' => '/books/OL456M',
                'title' => 'Dune Messiah',
                'publishers' => ['Putnam'],
                'publish_date' => '1969',
                'covers' => [404, 505],
                'authors' => [
                    ['key' => '/authors/OL1A'],
                ],
            ]),
            'https://openlibrary.org/works/OL123W.json' => Http::response([
                'key' => '/works/OL123W',
                'title' => 'Dune Messiah',
            ]),
            'https://openlibrary.org/authors/OL1A.json' => Http::response([
                'key' => '/authors/OL1A',
                'name' => 'Frank Herbert',
            ]),
        ]);

        $this->postJson('/api/books/refresh-metadata', [
            'book_ids' => [$book->id],
        ])->assertOk()
            ->assertJsonPath('books.0.title', 'Dune Messiah')
            ->assertJsonPath('books.0.author', 'Frank Herbert')
            ->assertJsonPath('books.0.publisher', 'Putnam')
            ->assertJsonPath('books.0.coverId', 404)
            ->assertJsonCount(2, 'books.0.coverOptions');

        $book->refresh();
        $this->assertSame('Dune Messiah', $book->title);
        $this->assertSame('Frank Herbert', $book->author);
        $this->assertSame('Putnam', $book->publisher);
        $this->assertSame([404, 505], $book->open_library_cover_ids);
        $this->assertSame('Dune Messiah', data_get($book->open_library_payload, 'edition.title'));
        $this->assertSame('Frank Herbert', data_get($book->open_library_payload, 'authors.0.name'));
    }

    public function test_notes_and_preferences_persist(): void
    {
        $this->postJson('/api/notes', [
            'title' => 'Foundation',
            'author' => 'Isaac Asimov',
            'note' => 'Read after finishing current sci-fi list.',
        ])->assertOk();

        $this->assertDatabaseHas('want_to_read_notes', [
            'title' => 'Foundation',
            'author' => 'Isaac Asimov',
        ]);

        $this->putJson('/api/preferences', [
            'bookcase_theme' => 'midnight',
            'bookcase_shape' => 'arched',
            'notes_theme' => 'dark',
            'shelf_count' => 6,
        ])->assertOk();

        $this->assertDatabaseHas('user_preferences', [
            'bookcase_theme' => 'midnight',
            'bookcase_shape' => 'arched',
            'notes_theme' => 'dark',
            'shelf_count' => 6,
        ]);
    }
}
