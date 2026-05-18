<?php

use App\Http\Controllers\Api\LibraryController;
use App\Http\Controllers\Auth\LoginController;
use App\Http\Controllers\Auth\MagicLinkController;
use App\Http\Controllers\Auth\OnboardingController;
use App\Http\Controllers\Auth\PasskeyController;
use App\Http\Controllers\Auth\RegisterController;
use App\Http\Controllers\LibraryPageController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;

Route::middleware('guest')->group(function (): void {
    Route::get('/register', [RegisterController::class, 'create'])->name('register');
    Route::post('/register', [RegisterController::class, 'store'])->middleware('throttle:6,1')->name('register.store');

    Route::get('/login', [LoginController::class, 'create'])->name('login');
    Route::post('/login/magic-link', [LoginController::class, 'sendMagicLink'])->middleware('throttle:6,1')->name('login.magic-link');
    Route::post('/login/passkey/options', [LoginController::class, 'passkeyOptions'])->middleware('throttle:20,1')->name('login.passkey.options');
    Route::post('/login/passkey/verify', [LoginController::class, 'passkeyVerify'])->middleware('throttle:20,1')->name('login.passkey.verify');

    Route::get('/auth/magic-link/{token}', [MagicLinkController::class, 'consume'])
        ->middleware(['signed', 'throttle:20,1'])
        ->name('auth.magic.consume');
});

Route::middleware('auth')->group(function (): void {
    Route::post('/logout', function (Request $request) {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect()->route('login');
    })->name('logout');

    Route::get('/onboarding/passkey', OnboardingController::class)->name('onboarding.passkey');
    Route::post('/onboarding/passkey/skip', [OnboardingController::class, 'skip'])->name('onboarding.passkey.skip');

    Route::post('/auth/passkeys/register/options', [PasskeyController::class, 'registerOptions'])
        ->middleware('throttle:20,1')
        ->name('passkeys.register.options');
    Route::post('/auth/passkeys/register', [PasskeyController::class, 'register'])
        ->middleware('throttle:20,1')
        ->name('passkeys.register');

    Route::get('/', LibraryPageController::class)->name('library');

    Route::prefix('api')->group(function (): void {
        Route::get('/library-state', [LibraryController::class, 'state']);
        Route::get('/open-library/search', [LibraryController::class, 'searchOpenLibrary']);
        Route::get('/open-library/selection', [LibraryController::class, 'openLibrarySelection']);
        Route::post('/books', [LibraryController::class, 'storeBook']);
        Route::post('/books/refresh-metadata', [LibraryController::class, 'refreshBookMetadata']);
        Route::patch('/books/{book}/position', [LibraryController::class, 'moveBook']);
        Route::patch('/books/{book}/cover', [LibraryController::class, 'updateBookCover']);
        Route::delete('/books/{book}', [LibraryController::class, 'destroyBook']);
        Route::post('/notes', [LibraryController::class, 'storeNote']);
        Route::patch('/notes/{note}', [LibraryController::class, 'updateNote']);
        Route::delete('/notes/{note}', [LibraryController::class, 'destroyNote']);
        Route::put('/preferences', [LibraryController::class, 'updatePreferences']);
    });
});
