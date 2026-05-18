<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\MagicLoginToken;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class MagicLinkController extends Controller
{
    public function consume(Request $request, string $token): RedirectResponse
    {
        $request->validate([
            'email' => ['required', 'string', 'email', 'max:180'],
        ]);

        $user = User::query()->where('email', strtolower(trim((string) $request->input('email'))))->first();

        if (! $user) {
            return redirect()->route('login')->withErrors(['email' => 'That magic link is invalid or expired.']);
        }

        $tokenHash = hash('sha256', $token);

        $magicToken = MagicLoginToken::query()
            ->where('user_id', $user->id)
            ->where('token_hash', $tokenHash)
            ->whereNull('used_at')
            ->where('expires_at', '>', now())
            ->latest('id')
            ->first();

        if (! $magicToken) {
            return redirect()->route('login')->withErrors(['email' => 'That magic link is invalid or expired.']);
        }

        DB::transaction(function () use ($magicToken, $user): void {
            $magicToken->update(['used_at' => now()]);

            if (! $user->email_verified_at) {
                $user->forceFill(['email_verified_at' => now()])->save();
            }
        });

        Auth::login($user, true);
        $request->session()->regenerate();

        return redirect()->intended(
            $user->passkeyCredentials()->exists()
                ? route('library')
                : route('onboarding.passkey')
        );
    }
}
