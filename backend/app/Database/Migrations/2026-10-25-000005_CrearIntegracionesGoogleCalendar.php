<?php

declare(strict_types=1);

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

final class CrearIntegracionesGoogleCalendar extends Migration
{
    public function up(): void
    {
        $this->forge->addField([
            'usuario_id' => ['type' => 'INT', 'constraint' => 11, 'unsigned' => true],
            'token_cifrado' => ['type' => 'TEXT', 'null' => true],
            'estado_hash' => ['type' => 'CHAR', 'constraint' => 64, 'null' => true],
            'estado_expira_en' => ['type' => 'DATETIME', 'null' => true],
            'calendarios_seleccionados' => ['type' => 'JSON', 'null' => true],
            'conectado_en' => ['type' => 'DATETIME', 'null' => true],
            'creado_en' => ['type' => 'DATETIME', 'null' => true],
            'actualizado_en' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addPrimaryKey('usuario_id');
        $this->forge->addUniqueKey('estado_hash');
        $this->forge->addForeignKey('usuario_id', config('Auth')->tables['users'], 'id', 'CASCADE', 'CASCADE');
        $attributes = $this->db->getPlatform() === 'MySQLi' ? ['ENGINE' => 'InnoDB'] : [];
        $this->forge->createTable('integraciones_google_calendar', false, $attributes);
    }

    public function down(): void
    {
        $this->forge->dropTable('integraciones_google_calendar', true);
    }
}
