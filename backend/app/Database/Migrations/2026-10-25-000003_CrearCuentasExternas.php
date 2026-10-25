<?php

declare(strict_types=1);

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

final class CrearCuentasExternas extends Migration
{
    public function up(): void
    {
        $this->forge->addField([
            'id' => ['type' => 'BIGINT', 'constraint' => 20, 'unsigned' => true, 'auto_increment' => true],
            'usuario_id' => ['type' => 'INT', 'constraint' => 11, 'unsigned' => true],
            'proveedor' => ['type' => 'VARCHAR', 'constraint' => 30],
            'proveedor_id' => ['type' => 'VARCHAR', 'constraint' => 255],
            'correo' => ['type' => 'VARCHAR', 'constraint' => 254],
            'creado_en' => ['type' => 'DATETIME', 'null' => true],
            'actualizado_en' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addPrimaryKey('id');
        $this->forge->addUniqueKey(['proveedor', 'proveedor_id']);
        $this->forge->addUniqueKey(['usuario_id', 'proveedor']);
        $this->forge->addKey('usuario_id');
        $this->forge->addForeignKey('usuario_id', config('Auth')->tables['users'], 'id', 'CASCADE', 'CASCADE');
        $attributes = $this->db->getPlatform() === 'MySQLi' ? ['ENGINE' => 'InnoDB'] : [];
        $this->forge->createTable('cuentas_externas', false, $attributes);
    }

    public function down(): void
    {
        $this->forge->dropTable('cuentas_externas', true);
    }
}
