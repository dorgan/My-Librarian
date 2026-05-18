<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Contracts\View\View;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class OnboardingController extends Controller
{
    public function __invoke(Request $request): View|RedirectResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 403);

        if ($user->passkeyCredentials()->exists()) {
            return redirect()->route('library');
        }

        return view('auth.onboarding-passkey');
    }

    public function skip(): RedirectResponse
    {
        return redirect()->route('library');
    }
}
