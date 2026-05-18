<?php

namespace App\Services;

use App\Mail\MagicLoginLinkMail;
use App\Models\MagicLoginToken;
use App\Models\User;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;

class MagicLoginService
{
    public function send(User $user, string $context = 'login'): void
    {
        $expiresAt = now()->addMinutes(20);
        $plainToken = Str::random(64);

        MagicLoginToken::query()->create([
            'user_id' => $user->id,
            'token_hash' => hash('sha256', $plainToken),
            'expires_at' => $expiresAt,
        ]);

        $url = URL::temporarySignedRoute('auth.magic.consume', $expiresAt, [
            'token' => $plainToken,
            'email' => $user->email,
        ]);

        Mail::to($user->email)->send(new MagicLoginLinkMail($url, $context, $expiresAt));
    }
}
