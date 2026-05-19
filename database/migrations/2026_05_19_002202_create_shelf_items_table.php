<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('shelf_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('shelf_index');
            $table->unsignedInteger('position_index');
            $table->string('item_type', 20);
            $table->unsignedBigInteger('item_id');
            $table->timestamps();

            $table->index(['user_id', 'shelf_index', 'position_index']);
            $table->unique(['user_id', 'shelf_index', 'position_index']);
            $table->unique(['user_id', 'item_type', 'item_id']);
        });

        $now = Carbon::now();
        $rowsToInsert = [];

        $bookRows = DB::table('book_placements')
            ->select('user_id', 'shelf_index', 'position_index', 'book_id')
            ->orderBy('user_id')
            ->orderBy('shelf_index')
            ->orderBy('position_index')
            ->orderBy('id')
            ->get();

        $dividerRows = DB::table('shelf_dividers')
            ->select('id', 'user_id', 'shelf_index', 'position_index')
            ->orderBy('user_id')
            ->orderBy('shelf_index')
            ->orderBy('position_index')
            ->orderBy('id')
            ->get();

        $grouped = [];

        foreach ($bookRows as $row) {
            $key = $row->user_id.':'.$row->shelf_index;
            $grouped[$key][] = [
                'user_id' => (int) $row->user_id,
                'shelf_index' => (int) $row->shelf_index,
                'item_type' => 'book',
                'item_id' => (int) $row->book_id,
                'base_position' => (int) $row->position_index,
                'sort_priority' => 0,
            ];
        }

        foreach ($dividerRows as $row) {
            $key = $row->user_id.':'.$row->shelf_index;
            $grouped[$key][] = [
                'user_id' => (int) $row->user_id,
                'shelf_index' => (int) $row->shelf_index,
                'item_type' => 'divider',
                'item_id' => (int) $row->id,
                'base_position' => (int) $row->position_index,
                'sort_priority' => 1,
            ];
        }

        foreach ($grouped as $items) {
            usort($items, function (array $left, array $right): int {
                if ($left['base_position'] !== $right['base_position']) {
                    return $left['base_position'] <=> $right['base_position'];
                }

                if ($left['sort_priority'] !== $right['sort_priority']) {
                    return $left['sort_priority'] <=> $right['sort_priority'];
                }

                return $left['item_id'] <=> $right['item_id'];
            });

            foreach ($items as $index => $item) {
                $rowsToInsert[] = [
                    'user_id' => $item['user_id'],
                    'shelf_index' => $item['shelf_index'],
                    'position_index' => $index,
                    'item_type' => $item['item_type'],
                    'item_id' => $item['item_id'],
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }
        }

        if ($rowsToInsert !== []) {
            DB::table('shelf_items')->insert($rowsToInsert);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('shelf_items');
    }
};
