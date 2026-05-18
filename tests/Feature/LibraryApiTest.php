<?php

namespace Tests\Feature;

use App\Models\Book;
use App\Models\BookPlacement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class LibraryApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_home_page_is_available(): void
    {
        $response = $this->get('/');

        $response->assertStatus(200);
        $response->assertSee('My Library');
        $response->assertSee('Search Open Library');
    }

    public function test_book_crud_and_cover_selection_work(): void
    {
        $createResponse = $this->postJson('/api/books', [
            'title' => 'Dune',
            'author' => 'Frank Herbert',
            'publisher' => 'Ace',
            'shelf_index' => 0,
            'position_index' => 0,
            'spine_color' => '#123456',
            'open_library_work_key' => 'OL123W',
            'open_library_edition_key' => 'OL456M',
            'open_library_cover_id' => 101,
            'open_library_cover_ids' => [101, 202],
        ]);

        $createResponse->assertOk();
        $createResponse->assertJsonPath('books.0.publisher', 'Ace');
        $createResponse->assertJsonPath('books.0.coverId', 101);
        $createResponse->assertJsonCount(2, 'books.0.coverOptions');

        /** @var Book $book */
        $book = Book::query()->firstOrFail();

        $this->assertDatabaseHas('book_placements', [
            'book_id' => $book->id,
            'shelf_index' => 0,
            'position_index' => 0,
        ]);

        $this->patchJson("/api/books/{$book->id}/cover", [
            'cover_id' => 202,
        ])->assertOk()->assertJsonPath('books.0.coverId', 202);

        $moveResponse = $this->patchJson("/api/books/{$book->id}/position", [
            'shelf_index' => 2,
            'position_index' => 1,
        ]);

        $moveResponse->assertOk();

        /** @var BookPlacement $placement */
        $placement = BookPlacement::query()->where('book_id', $book->id)->firstOrFail();
        $this->assertSame(2, $placement->shelf_index);
        $this->assertSame(0, $placement->position_index);

        $this->deleteJson("/api/books/{$book->id}")
            ->assertOk();

        $this->assertDatabaseMissing('books', ['id' => $book->id]);
        $this->assertDatabaseMissing('book_placements', ['book_id' => $book->id]);
    }

    public function test_open_library_search_returns_cover_choices(): void
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
            'https://openlibrary.org/books/OL456M.json' => Http::response([
                'key' => '/books/OL456M',
                'publishers' => ['Ace'],
                'covers' => [101, 202],
            ]),
            'https://openlibrary.org/works/OL123W.json' => Http::response([
                'key' => '/works/OL123W',
                'covers' => [303],
            ]),
        ]);

        $this->getJson('/api/open-library/search?query=dune')
            ->assertOk()
            ->assertJsonPath('results.0.title', 'Dune')
            ->assertJsonPath('results.0.author', 'Frank Herbert')
            ->assertJsonPath('results.0.publisher', 'Ace')
            ->assertJsonPath('results.0.workKey', 'OL123W')
            ->assertJsonPath('results.0.editionKey', 'OL456M')
            ->assertJsonCount(4, 'results.0.covers');
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
