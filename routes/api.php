<?php

use App\Http\Controllers\Api\LibraryController;
use Illuminate\Support\Facades\Route;

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
