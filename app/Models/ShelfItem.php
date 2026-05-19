<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ShelfItem extends Model
{
    use HasFactory;

    public const TYPE_BOOK = 'book';

    public const TYPE_DIVIDER = 'divider';

    protected $fillable = [
        'user_id',
        'shelf_index',
        'position_index',
        'item_type',
        'item_id',
    ];
}
