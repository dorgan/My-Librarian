<?php

namespace App\Services;

use Illuminate\Http\Client\Pool;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;

class OpenLibraryService
{
    public function search(string $query, int $limit = 6): array
    {
        $query = trim($query);

        if ($query === '') {
            return [];
        }

        $response = Http::acceptJson()
            ->timeout(10)
            ->get('https://openlibrary.org/search.json', [
                'q' => $query,
                'limit' => $limit,
            ]);

        if (! $response->successful()) {
            return [];
        }

        $docs = collect($response->json('docs', []))
            ->filter(fn (mixed $doc): bool => is_array($doc) && filled($doc['title'] ?? null))
            ->take($limit)
            ->values();

        if ($docs->isEmpty()) {
            return [];
        }

        $detailResponses = Http::pool(function (Pool $pool) use ($docs): array {
            $requests = [];

            foreach ($docs as $index => $doc) {
                $editionKey = $this->normalizeKey($doc['edition_key'][0] ?? null, '/books/');
                $workKey = $this->normalizeKey($doc['key'] ?? null, '/works/');

                if ($editionKey) {
                    $requests["edition-{$index}"] = $pool->as("edition-{$index}")
                        ->acceptJson()
                        ->timeout(10)
                        ->get("https://openlibrary.org/books/{$editionKey}.json");
                }

                if ($workKey) {
                    $requests["work-{$index}"] = $pool->as("work-{$index}")
                        ->acceptJson()
                        ->timeout(10)
                        ->get("https://openlibrary.org/works/{$workKey}.json");
                }
            }

            return $requests;
        });

        return $docs
            ->map(function (array $doc, int $index) use ($detailResponses): ?array {
                $edition = $this->jsonPayload($detailResponses["edition-{$index}"] ?? null);
                $work = $this->jsonPayload($detailResponses["work-{$index}"] ?? null);

                return $this->formatSearchResult($doc, $edition, $work);
            })
            ->filter()
            ->values()
            ->all();
    }

    public function coverUrl(int $coverId, string $size = 'M'): string
    {
        return sprintf('https://covers.openlibrary.org/b/id/%d-%s.jpg', $coverId, $size);
    }

    /**
     * @param  array<string, mixed>  $doc
     * @param  array<string, mixed>  $edition
     * @param  array<string, mixed>  $work
     * @return array<string, mixed>|null
     */
    private function formatSearchResult(array $doc, array $edition, array $work): ?array
    {
        $title = trim((string) ($doc['title'] ?? ''));

        if ($title === '') {
            return null;
        }

        $author = collect($doc['author_name'] ?? [])->filter()->implode(', ');
        $publisher = $this->firstString($edition['publishers'] ?? $doc['publisher'] ?? []);
        $covers = $this->coverOptions(array_merge(
            $edition['covers'] ?? [],
            $work['covers'] ?? [],
            array_filter([(int) ($doc['cover_i'] ?? 0)]),
        ));

        return [
            'title' => $title,
            'author' => $author !== '' ? $author : null,
            'publisher' => $publisher,
            'publishYear' => isset($doc['first_publish_year']) ? (int) $doc['first_publish_year'] : null,
            'workKey' => $this->normalizeKey($work['key'] ?? $doc['key'] ?? null, '/works/'),
            'editionKey' => $this->normalizeKey($edition['key'] ?? ($doc['edition_key'][0] ?? null), '/books/'),
            'covers' => $covers,
        ];
    }

    /**
     * @param  array<int, mixed>  $coverIds
     * @return array<int, array<string, mixed>>
     */
    private function coverOptions(array $coverIds): array
    {
        return collect($coverIds)
            ->map(fn (mixed $coverId): int => (int) $coverId)
            ->filter(fn (int $coverId): bool => $coverId > 0)
            ->unique()
            ->take(8)
            ->values()
            ->map(fn (int $coverId): array => [
                'id' => $coverId,
                'url' => $this->coverUrl($coverId, 'M'),
                'thumbnailUrl' => $this->coverUrl($coverId, 'S'),
            ])
            ->all();
    }

    /**
     * @param  array<int, mixed>|string|null  $value
     */
    private function firstString(array|string|null $value): ?string
    {
        if (is_string($value)) {
            $value = trim($value);

            return $value !== '' ? $value : null;
        }

        return collect($value)
            ->filter(fn (mixed $item): bool => is_string($item) && trim($item) !== '')
            ->map(fn (string $item): string => trim($item))
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

    /**
     * @return array<string, mixed>
     */
    private function jsonPayload(?Response $response): array
    {
        if (! $response || ! $response->successful()) {
            return [];
        }

        $payload = $response->json();

        return is_array($payload) ? $payload : [];
    }
}
