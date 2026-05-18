<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\PasskeyCredential;
use App\Models\User;
use App\Services\MagicLoginService;
use Illuminate\Contracts\View\View;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;

class LoginController extends Controller
{
    public function __construct(private readonly MagicLoginService $magicLogin)
    {
    }

    public function create(): View
    {
        return view('auth.login');
    }

    public function sendMagicLink(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'email' => ['required', 'string', 'email', 'max:180'],
        ]);

        $email = Str::lower(trim($data['email']));
        $user = User::query()->where('email', $email)->first();

        if ($user) {
            $this->magicLogin->send($user, 'login');
        }

        return back()->with('status', 'If that email exists, a magic link has been sent.');
    }

    public function passkeyOptions(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'string', 'email', 'max:180'],
        ]);

        $user = User::query()
            ->where('email', Str::lower(trim($data['email'])))
            ->whereNotNull('email_verified_at')
            ->first();

        abort_unless($user && $user->passkeyCredentials()->exists(), 422);

        $challenge = $this->base64urlEncode(random_bytes(32));

        $request->session()->put('passkey.login', [
            'challenge' => $challenge,
            'user_id' => $user->id,
            'expires_at' => now()->addMinutes(5)->timestamp,
        ]);

        $allowCredentials = $user->passkeyCredentials
            ->map(fn (PasskeyCredential $credential): array => [
                'id' => $this->bytesFromBase64url($credential->credential_id),
                'type' => 'public-key',
                'transports' => $credential->transports ?? ['internal'],
            ])
            ->all();

        return response()->json([
            'challenge' => $this->bytesFromBase64url($challenge),
            'rpId' => parse_url(config('app.url'), PHP_URL_HOST),
            'allowCredentials' => $allowCredentials,
            'userVerification' => 'preferred',
            'timeout' => 60000,
        ]);
    }

    public function passkeyVerify(Request $request): JsonResponse
    {
        $data = $request->validate([
            'id' => ['required', 'string', 'max:2048'],
            'response.clientDataJSON' => ['required', 'string'],
            'response.authenticatorData' => ['required', 'string'],
            'response.signature' => ['required', 'string'],
        ]);

        $sessionState = $request->session()->get('passkey.login');
        abort_unless(
            is_array($sessionState)
            && now()->timestamp <= (int) ($sessionState['expires_at'] ?? 0),
            422,
        );

        $user = User::query()->find($sessionState['user_id'] ?? 0);
        abort_unless($user instanceof User, 422);

        $credential = PasskeyCredential::query()
            ->where('user_id', $user->id)
            ->where('credential_id', $data['id'])
            ->first();

        abort_unless($credential instanceof PasskeyCredential, 422);

        $this->assertChallenge($data['response']['clientDataJSON'], $sessionState['challenge'], 'webauthn.get');

        Auth::login($user, true);
        $request->session()->regenerate();
        $request->session()->forget('passkey.login');

        $credential->forceFill([
            'last_used_at' => now(),
            'sign_count' => (int) $credential->sign_count + 1,
        ])->save();

        return response()->json([
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
