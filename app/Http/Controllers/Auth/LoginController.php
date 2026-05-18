<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\PasskeyCredential;
use App\Models\User;
use App\Services\MagicLoginService;
use App\Support\WebAuthnData;
use Illuminate\Contracts\View\View;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;

class LoginController extends Controller
{
    public function __construct(private readonly MagicLoginService $magicLogin) {}

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

        $challenge = WebAuthnData::base64urlEncode(random_bytes(32));

        $request->session()->put('passkey.login', [
            'challenge' => $challenge,
            'user_id' => $user->id,
            'expires_at' => now()->addMinutes(5)->timestamp,
        ]);

        $allowCredentials = $user->passkeyCredentials
            ->map(fn (PasskeyCredential $credential): array => [
                'id' => WebAuthnData::bytesFromBase64url($credential->credential_id),
                'type' => 'public-key',
                'transports' => $credential->transports ?? ['internal'],
            ])
            ->all();

        return response()->json([
            'challenge' => WebAuthnData::bytesFromBase64url($challenge),
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

        WebAuthnData::assertClientDataChallenge(
            $data['response']['clientDataJSON'],
            $sessionState['challenge'],
            'webauthn.get',
            $this->expectedOrigin(),
        );

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

    private function expectedOrigin(): string
    {
        return parse_url(config('app.url'), PHP_URL_SCHEME).'://'.parse_url(config('app.url'), PHP_URL_HOST);
    }
}
