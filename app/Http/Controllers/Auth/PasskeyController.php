<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\PasskeyCredential;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PasskeyController extends Controller
{
    public function registerOptions(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 403);

        $challenge = $this->base64urlEncode(random_bytes(32));

        $request->session()->put('passkey.register', [
            'challenge' => $challenge,
            'user_id' => $user->id,
            'expires_at' => now()->addMinutes(5)->timestamp,
        ]);

        $excludeCredentials = $user->passkeyCredentials
            ->map(fn (PasskeyCredential $credential): array => [
                'id' => $this->bytesFromBase64url($credential->credential_id),
                'type' => 'public-key',
                'transports' => $credential->transports ?? ['internal'],
            ])
            ->values()
            ->all();

        return response()->json([
            'challenge' => $this->bytesFromBase64url($challenge),
            'rp' => [
                'name' => config('app.name'),
                'id' => parse_url(config('app.url'), PHP_URL_HOST),
            ],
            'user' => [
                'id' => $this->bytesFromBase64url($this->base64urlEncode((string) $user->id)),
                'name' => $user->email,
                'displayName' => $user->name ?: $user->email,
            ],
            'pubKeyCredParams' => [
                ['type' => 'public-key', 'alg' => -7],
                ['type' => 'public-key', 'alg' => -257],
            ],
            'timeout' => 60000,
            'attestation' => 'none',
            'authenticatorSelection' => [
                'residentKey' => 'preferred',
                'userVerification' => 'preferred',
            ],
            'excludeCredentials' => $excludeCredentials,
        ]);
    }

    public function register(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 403);

        $data = $request->validate([
            'id' => ['required', 'string', 'max:2048'],
            'response.clientDataJSON' => ['required', 'string'],
            'response.attestationObject' => ['required', 'string'],
            'response.publicKey' => ['nullable', 'string'],
            'response.transports' => ['nullable', 'array'],
            'name' => ['nullable', 'string', 'max:80'],
        ]);

        $sessionState = $request->session()->get('passkey.register');
        abort_unless(
            is_array($sessionState)
            && (int) ($sessionState['user_id'] ?? 0) === $user->id
            && now()->timestamp <= (int) ($sessionState['expires_at'] ?? 0),
            422,
        );

        $this->assertChallenge($data['response']['clientDataJSON'], (string) $sessionState['challenge'], 'webauthn.create');

        PasskeyCredential::query()->updateOrCreate(
            [
                'credential_id' => $data['id'],
            ],
            [
                'user_id' => $user->id,
                'public_key' => (string) ($data['response']['publicKey'] ?? $data['response']['attestationObject']),
                'sign_count' => 0,
                'transports' => $data['response']['transports'] ?? ['internal'],
                'name' => $data['name'] ?? 'Passkey',
                'last_used_at' => now(),
            ],
        );

        $request->session()->forget('passkey.register');

        return response()->json([
            'success' => true,
            'redirect' => route('library'),
        ]);
    }

    private function assertChallenge(string $encodedClientDataJson, string $expectedChallenge, string $expectedType): void
    {
        $decoded = $this->base64urlDecode($encodedClientDataJson);
        $clientData = json_decode($decoded, true);
        abort_unless(is_array($clientData), 422);

        abort_unless(($clientData['type'] ?? null) === $expectedType, 422);
        abort_unless(($clientData['challenge'] ?? null) === $expectedChallenge, 422);

        $origin = parse_url(config('app.url'), PHP_URL_SCHEME).'://'.parse_url(config('app.url'), PHP_URL_HOST);
        abort_unless(($clientData['origin'] ?? null) === $origin, 422);
    }

    /** @return array<int, int> */
    private function bytesFromBase64url(string $value): array
    {
        return array_values(unpack('C*', $this->base64urlDecode($value)) ?: []);
    }

    private function base64urlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    private function base64urlDecode(string $value): string
    {
        $padding = strlen($value) % 4;
        if ($padding > 0) {
            $value .= str_repeat('=', 4 - $padding);
        }

        return base64_decode(strtr($value, '-_', '+/'), true) ?: '';
    }
}
