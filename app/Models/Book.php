<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Book extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'title',
        'author',
        'publisher',
        'spine_color',
        'open_library_work_key',
        'open_library_edition_key',
        'open_library_cover_id',
        'open_library_cover_ids',
        'open_library_payload',
    ];

    protected $casts = [
        'open_library_cover_ids' => 'array',
        'open_library_payload' => 'array',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function placement(): HasOne
    {
        return $this->hasOne(BookPlacement::class);
    }
}
