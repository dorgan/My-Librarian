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
        Schema::table('books', function (Blueprint $table): void {
            $table->string('publisher')->nullable()->after('author');
            $table->string('open_library_work_key')->nullable()->after('spine_color');
            $table->string('open_library_edition_key')->nullable()->after('open_library_work_key');
            $table->unsignedBigInteger('open_library_cover_id')->nullable()->after('open_library_edition_key');
            $table->json('open_library_cover_ids')->nullable()->after('open_library_cover_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('books', function (Blueprint $table): void {
            $table->dropColumn([
                'publisher',
                'open_library_work_key',
                'open_library_edition_key',
                'open_library_cover_id',
                'open_library_cover_ids',
            ]);
        });
    }
};
