<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('books', function (Blueprint $table): void {
            $table->index(['user_id', 'created_at']);
        });

        Schema::table('book_placements', function (Blueprint $table): void {
            $table->unique('book_id');
        });
    }

    public function down(): void
    {
        Schema::table('books', function (Blueprint $table): void {
            $table->dropIndex(['user_id', 'created_at']);
        });

        Schema::table('book_placements', function (Blueprint $table): void {
            $table->dropUnique(['book_id']);
        });
    }
};
