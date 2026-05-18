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
        Schema::table('book_placements', function (Blueprint $table) {
            $table->string('rotation_mode', 20)->default('upright')->after('position_index');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('book_placements', function (Blueprint $table) {
            $table->dropColumn('rotation_mode');
        });
    }
};
