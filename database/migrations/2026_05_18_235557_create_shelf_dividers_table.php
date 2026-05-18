<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('shelf_dividers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('shelf_index');
            $table->unsignedInteger('position_index');
            $table->string('style', 20)->default('bookend');
            $table->timestamps();

            $table->index(['user_id', 'shelf_index', 'position_index']);
            $table->unique(['user_id', 'shelf_index', 'position_index']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('shelf_dividers');
    }
};
