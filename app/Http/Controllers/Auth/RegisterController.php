<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\MagicLoginService;
use Illuminate\Contracts\View\View;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class RegisterController extends Controller
{
    public function __construct(private readonly MagicLoginService $magicLogin) {}

    public function create(): View
    {
        return view('auth.register');
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'email' => ['required', 'string', 'email', 'max:180'],
        ]);

        $email = Str::lower(trim($data['email']));

        $user = User::query()->firstOrCreate(
            ['email' => $email],
            [
                'name' => Str::title(Str::before($email, '@')),
                'password' => Str::random(64),
            ],
        );

        $this->magicLogin->send($user, 'register');

        return back()->with('status', 'Check your email for your secure magic link.');
    }
}
