<?php

declare(strict_types=1);

namespace App\Database\Migrations;

use CodeIgniter\Database\Forge;
use CodeIgniter\Database\Migration;

final class CreateUserProfiles extends Migration
{
    private string $usersTable;

    public function __construct(?Forge $forge = null)
    {
        parent::__construct($forge);

        $this->usersTable = config('Auth')->tables['users'];
    }

    public function up(): void
    {
        $this->forge->addField([
            'user_id' => [
                'type'       => 'INT',
                'constraint' => 11,
                'unsigned'   => true,
            ],
            'uuid' => [
                'type'       => 'CHAR',
                'constraint' => 36,
            ],
            'display_name' => [
                'type'       => 'VARCHAR',
                'constraint' => 100,
            ],
            'locale' => [
                'type'       => 'VARCHAR',
                'constraint' => 10,
                'default'    => 'es-MX',
            ],
            'timezone' => [
                'type'       => 'VARCHAR',
                'constraint' => 64,
                'default'    => 'America/Mexico_City',
            ],
            'created_at' => [
                'type' => 'DATETIME',
                'null' => true,
            ],
            'updated_at' => [
                'type' => 'DATETIME',
                'null' => true,
            ],
        ]);
        $this->forge->addPrimaryKey('user_id');
        $this->forge->addUniqueKey('uuid');
        $this->forge->addForeignKey('user_id', $this->usersTable, 'id', 'CASCADE', 'CASCADE');

        $attributes = $this->db->getPlatform() === 'MySQLi' ? ['ENGINE' => 'InnoDB'] : [];
        $this->forge->createTable('user_profiles', false, $attributes);
    }

    public function down(): void
    {
        $this->forge->dropTable('user_profiles', true);
    }
}
