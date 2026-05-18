<?php

namespace Tests\Feature;

use App\Models\Book;
use App\Models\BookPlacement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LibraryApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_home_page_is_available(): void
    {
        $response = $this->get('/');

        $response->assertStatus(200);
        $response->assertSee('My Library');
    }

    public function test_book_crud_and_repositioning_work(): void
    {
        $createResponse = $this->postJson('/api/books', [
            'title' => 'Dune',
            'author' => 'Frank Herbert',
            'shelf_index' => 0,
            'position_index' => 0,
            'spine_color' => '#123456',
        ]);

        $createResponse->assertOk();

        /** @var Book $book */
        $book = Book::query()->firstOrFail();

        $this->assertDatabaseHas('book_placements', [
            'book_id' => $book->id,
            'shelf_index' => 0,
            'position_index' => 0,
        ]);

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
