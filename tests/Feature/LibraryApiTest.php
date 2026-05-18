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

    public function test_open_library_search_uses_authenticated_email_header(): void
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

        Http::assertSent(function (HttpRequest $request): bool {
            return $request->url() === 'https://openlibrary.org/search.json?q=dune&limit=6'
                && $request->hasHeader('From', 'reader@example.com')
                && str_contains($request->header('User-Agent')[0] ?? '', 'reader@example.com');
        });
    }

    public function test_user_cannot_modify_another_users_book(): void
    {
        $owner = User::factory()->create();
        $book = Book::query()->create([
            'user_id' => $owner->id,
            'title' => 'Private Book',
            'spine_color' => '#123456',
        ]);

        $this->signIn('other@example.com');

        $this->deleteJson("/api/books/{$book->id}")->assertNotFound();
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
        $this->assertSame('oak', $state['preferences']['bookcaseTheme']);
        $this->assertNotSame($firstUser->id, $secondUser->id);
    }

    private function signIn(string $email = 'reader@example.com'): User
    {
        $user = User::factory()->create([
            'email' => $email,
            'email_verified_at' => now(),
        ]);

        $this->actingAs($user);

        return $user;
    }
}
