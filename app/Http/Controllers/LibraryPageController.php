<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\LibraryStateService;
use Illuminate\Contracts\View\View;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class LibraryPageController extends Controller
{
    public function __construct(private readonly LibraryStateService $libraryState)
    {
    }

    public function __invoke(): View
    {
        $user = $this->currentUser();

        return view('library', [
            'initialState' => $this->libraryState->payload($user),
        ]);
    }

    private function currentUser(): User
    {
        return User::query()->firstOrCreate(
            ['email' => 'demo@my-library.local'],
            [
                'name' => 'Demo Reader',
                'password' => Hash::make(Str::random(40)),
            ],
        );
    }
}
