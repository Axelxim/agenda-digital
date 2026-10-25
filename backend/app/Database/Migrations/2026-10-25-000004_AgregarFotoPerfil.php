<?php

declare(strict_types=1);

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

final class AgregarFotoPerfil extends Migration
{
    public function up(): void
    {
        $this->forge->addColumn('user_profiles', [
            'avatar_url' => [
                'type' => 'VARCHAR',
                'constraint' => 500,
                'null' => true,
                'after' => 'display_name',
            ],
        ]);
    }

    public function down(): void
    {
        $this->forge->dropColumn('user_profiles', 'avatar_url');
    }
}
