<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\LibraryStateService;
use Illuminate\Contracts\View\View;
use Illuminate\Http\Request;

class LibraryPageController extends Controller
{
    public function __construct(private readonly LibraryStateService $libraryState)
    {
    }

    public function __invoke(Request $request): View
    {
        $user = $request->user();
        abort_unless($user instanceof User, 403);

        return view('library', [
            'initialState' => $this->libraryState->payload($user),
        ]);
    }
}
