<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\PasskeyCredential;
use App\Models\User;
use App\Support\WebAuthnData;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PasskeyController extends Controller
{
    public function registerOptions(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 403);

        $challenge = WebAuthnData::base64urlEncode(random_bytes(32));

        $request->session()->put('passkey.register', [
            'challenge' => $challenge,
            'user_id' => $user->id,
            'expires_at' => now()->addMinutes(5)->timestamp,
        ]);

        $excludeCredentials = $user->passkeyCredentials
            ->map(fn (PasskeyCredential $credential): array => [
                'id' => WebAuthnData::bytesFromBase64url($credential->credential_id),
                'type' => 'public-key',
                'transports' => $credential->transports ?? ['internal'],
            ])
            ->values()
            ->all();

        return response()->json([
            'challenge' => WebAuthnData::bytesFromBase64url($challenge),
            'rp' => [
                'name' => config('app.name'),
                'id' => parse_url(config('app.url'), PHP_URL_HOST),
            ],
            'user' => [
                'id' => WebAuthnData::bytesFromBase64url(WebAuthnData::base64urlEncode((string) $user->id)),
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

        WebAuthnData::assertClientDataChallenge(
            $data['response']['clientDataJSON'],
            (string) $sessionState['challenge'],
            'webauthn.create',
            $this->expectedOrigin(),
        );

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

    private function expectedOrigin(): string
    {
        return parse_url(config('app.url'), PHP_URL_SCHEME).'://'.parse_url(config('app.url'), PHP_URL_HOST);
    }
}
