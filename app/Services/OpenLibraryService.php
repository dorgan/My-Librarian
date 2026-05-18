<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class OpenLibraryService
{
    private const MINIMUM_SECONDS_BETWEEN_REQUESTS = 1 / 3;

    public function search(string $query, int $limit = 6): array
    {
        $query = trim($query);

        if ($query === '') {
            return [];
        }

        $response = $this->requestJson('/search.json', [
            'q' => $query,
            'limit' => $limit,
        ]);

        return collect($response['docs'] ?? [])
            ->filter(fn (mixed $doc): bool => is_array($doc) && filled($doc['title'] ?? null))
            ->take($limit)
            ->map(fn (array $doc): ?array => $this->formatSearchResult($doc))
            ->filter()
            ->values()
            ->all();
    }

    public function selection(?string $workKey, ?string $editionKey): array
    {
        $editionKey = $this->normalizeKey($editionKey, '/books/');
        $workKey = $this->normalizeKey($workKey, '/works/');

        $edition = $editionKey ? $this->requestJson("/books/{$editionKey}.json") : [];
        $work = $workKey ? $this->requestJson("/works/{$workKey}.json") : [];

        if ($work === []) {
            $workKey = $this->normalizeKey(data_get($edition, 'works.0.key'), '/works/');
            $work = $workKey ? $this->requestJson("/works/{$workKey}.json") : [];
        }

        if ($edition === []) {
            $editionKey = $this->normalizeKey(data_get($work, 'edition_key.0'), '/books/');
            $edition = $editionKey ? $this->requestJson("/books/{$editionKey}.json") : [];
        }

        $authors = $this->authors($edition, $work);
        $payload = array_filter([
            'edition' => $edition,
            'work' => $work,
            'authors' => $authors,
        ], fn (array $value): bool => $value !== []);
        $coverIds = $this->coverIdsFromPayload($payload);

        return [
            'title' => $this->metadataTitle($payload),
            'author' => $this->metadataAuthor($payload),
            'publisher' => $this->metadataPublisher($payload),
            'publishYear' => $this->metadataPublishYear($payload),
            'isbn' => $this->metadataIsbn($payload),
            'workKey' => $this->normalizeKey(data_get($work, 'key'), '/works/') ?? $workKey,
            'editionKey' => $this->normalizeKey(data_get($edition, 'key'), '/books/') ?? $editionKey,
            'covers' => $this->coverOptions($coverIds),
            'payload' => $payload,
        ];
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<int, int>
     */
    public function coverIdsFromPayload(array $payload): array
    {
        return collect(array_merge(
            data_get($payload, 'edition.covers', []),
            data_get($payload, 'work.covers', []),
        ))
            ->map(fn (mixed $coverId): int => (int) $coverId)
            ->filter(fn (int $coverId): bool => $coverId > 0)
            ->unique()
            ->values()
            ->all();
    }

    /**
     * @param  array<int, int>  $coverIds
     * @return array<int, array<string, mixed>>
     */
    public function coverOptions(array $coverIds): array
    {
        return collect($coverIds)
            ->take(8)
            ->map(fn (int $coverId): array => [
                'id' => $coverId,
                'url' => $this->coverUrl($coverId, 'M'),
                'thumbnailUrl' => $this->coverUrl($coverId, 'S'),
            ])
            ->values()
            ->all();
    }

    public function coverUrl(int $coverId, string $size = 'M'): string
    {
        return sprintf('https://covers.openlibrary.org/b/id/%d-%s.jpg', $coverId, $size);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    public function metadataTitle(array $payload): ?string
    {
        return $this->stringOrNull(data_get($payload, 'edition.title'))
            ?? $this->stringOrNull(data_get($payload, 'work.title'));
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    public function metadataAuthor(array $payload): ?string
    {
        $authors = collect(data_get($payload, 'authors', []))
            ->map(fn (mixed $author): ?string => is_array($author) ? $this->stringOrNull($author['name'] ?? null) : null)
            ->filter()
            ->unique()
            ->values();

        if ($authors->isNotEmpty()) {
            return $authors->implode(', ');
        }

        return $this->stringOrNull(data_get($payload, 'edition.by_statement'));
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    public function metadataPublisher(array $payload): ?string
    {
        return $this->firstString(data_get($payload, 'edition.publishers', []));
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    public function metadataPublishYear(array $payload): ?string
    {
        $publishDate = $this->stringOrNull(data_get($payload, 'edition.publish_date'))
            ?? $this->stringOrNull(data_get($payload, 'work.first_publish_date'));

        if (! $publishDate) {
            return null;
        }

        if (preg_match('/(\d{4})/', $publishDate, $matches) === 1) {
            return $matches[1];
        }

        return $publishDate;
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    public function metadataIsbn(array $payload): ?string
    {
        $isbn13 = data_get($payload, 'edition.isbn_13');
        if (is_array($isbn13)) {
            $isbn13 = $isbn13[0] ?? null;
        }

        if ($isbn13 = $this->stringOrNull($isbn13)) {
            return $isbn13;
        }

        $isbn10 = data_get($payload, 'edition.isbn_10');
        if (is_array($isbn10)) {
            $isbn10 = $isbn10[0] ?? null;
        }

        return $this->stringOrNull($isbn10);
    }

    /**
     * @param  array<string, mixed>  $doc
     * @return array<string, mixed>|null
     */
    private function formatSearchResult(array $doc): ?array
    {
        $title = $this->stringOrNull($doc['title'] ?? null);

        if (! $title) {
            return null;
        }

        $coverId = (int) ($doc['cover_i'] ?? 0);

        return [
            'title' => $title,
            'author' => collect($doc['author_name'] ?? [])->filter()->implode(', ') ?: null,
            'publisher' => $this->firstString($doc['publisher'] ?? []),
            'publishYear' => isset($doc['first_publish_year']) ? (string) $doc['first_publish_year'] : null,
            'workKey' => $this->normalizeKey($doc['key'] ?? null, '/works/'),
            'editionKey' => $this->normalizeKey($doc['edition_key'][0] ?? null, '/books/'),
            'cover' => $coverId > 0 ? [
                'id' => $coverId,
                'url' => $this->coverUrl($coverId, 'M'),
                'thumbnailUrl' => $this->coverUrl($coverId, 'S'),
            ] : null,
        ];
    }

    /**
     * @param  array<string, mixed>  $edition
     * @param  array<string, mixed>  $work
     * @return array<int, array<string, mixed>>
     */
    private function authors(array $edition, array $work): array
    {
        $authorKeys = collect(data_get($edition, 'authors', []))
            ->map(fn (mixed $author): ?string => is_array($author) ? $this->normalizeKey($author['key'] ?? null, '/authors/') : null)
            ->merge(
                collect(data_get($work, 'authors', []))
                    ->map(fn (mixed $author): ?string => is_array($author) ? $this->normalizeKey(data_get($author, 'author.key'), '/authors/') : null),
            )
            ->filter()
            ->unique()
            ->take(5)
            ->values();

        return $authorKeys
            ->map(fn (string $authorKey): array => $this->requestJson("/authors/{$authorKey}.json"))
            ->filter(fn (array $author): bool => $author !== [])
            ->values()
            ->all();
    }

    /**
     * @return array<string, mixed>
     */
    private function requestJson(string $path, array $query = []): array
    {
        $this->throttle();

        $contactEmail = config('app.openlibrary.contact_email');

        $response = Http::baseUrl('https://openlibrary.org')
            ->acceptJson()
            ->timeout(10)
            ->withUserAgent(sprintf('My Librarian/1.0 (%s)', $contactEmail))
            ->withHeaders([
                'From' => $contactEmail,
            ])
            ->get($path, $query);

        if (! $response->successful()) {
            return [];
        }

        $payload = $response->json();

        return is_array($payload) ? $payload : [];
    }

    private function throttle(): void
    {
        if (app()->runningUnitTests()) {
            return;
        }

        Cache::lock('open-library-request-throttle', 5)->block(5, function (): void {
            $lastRequestAt = (float) Cache::get('open-library-last-request-at', 0.0);
            $elapsed = microtime(true) - $lastRequestAt;

            if ($elapsed < self::MINIMUM_SECONDS_BETWEEN_REQUESTS) {
                usleep((int) ((self::MINIMUM_SECONDS_BETWEEN_REQUESTS - $elapsed) * 1_000_000));
            }

            Cache::forever('open-library-last-request-at', microtime(true));
        });
    }

    /**
     * @param  array<int, mixed>|string|null  $value
     */
    private function firstString(array|string|null $value): ?string
    {
        if (is_string($value)) {
            return $this->stringOrNull($value);
        }

        return collect($value)
            ->map(fn (mixed $item): ?string => is_string($item) ? $this->stringOrNull($item) : null)
            ->filter()
            ->first();
    }

    private function normalizeKey(?string $value, string $prefix): ?string
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

    private function stringOrNull(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $value = trim($value);

        return $value !== '' ? $value : null;
    }
}
