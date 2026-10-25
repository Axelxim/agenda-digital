<?php

declare(strict_types=1);

namespace App\Database\Migrations;

use CodeIgniter\Database\Forge;
use CodeIgniter\Database\Migration;

final class CrearTablasDatosAgenda extends Migration
{
    private string $tablaUsuarios;

    private readonly array $atributos;

    public function __construct(?Forge $forge = null)
    {
        parent::__construct($forge);

        // Shield conserva sus nombres internos en ingles; nuestras tablas usan español.
        $this->tablaUsuarios = config('Auth')->tables['users'];
        $this->atributos = $this->db->getPlatform() === 'MySQLi' ? ['ENGINE' => 'InnoDB'] : [];
    }

    public function up(): void
    {
        $this->crearPreferenciasUsuario();
        $this->crearRecordatoriosEtiqueta();
        $this->crearRutinas();
        $this->crearHorariosRutina();
        $this->crearElementosAgenda();
        $this->crearSubtareas();
        $this->crearNotasRapidas();
        $this->crearTratamientosMedicamentos();
        $this->crearTomasMedicamentos();
        $this->crearConfiguracionBilletera();
        $this->crearGastosFijos();
        $this->crearMovimientosBilletera();
    }

    public function down(): void
    {
        $this->db->disableForeignKeyChecks();

        foreach ([
            'movimientos_billetera',
            'gastos_fijos',
            'configuracion_billetera',
            'tomas_medicamentos',
            'tratamientos_medicamentos',
            'notas_rapidas',
            'subtareas',
            'elementos_agenda',
            'horarios_rutina',
            'rutinas',
            'recordatorios_etiqueta',
            'preferencias_usuario',
        ] as $tabla) {
            $this->forge->dropTable($tabla, true);
        }

        $this->db->enableForeignKeyChecks();
    }

    private function crearPreferenciasUsuario(): void
    {
        $this->forge->addField([
            'usuario_id'      => $this->campoUsuarioId(),
            'modo_avanzado'   => $this->campoBooleano(false),
            'bienestar_activo'=> $this->campoBooleano(false),
            'creado_en'       => $this->campoFechaHora(),
            'actualizado_en'  => $this->campoFechaHora(),
        ]);
        $this->forge->addPrimaryKey('usuario_id');
        $this->agregarRelacionUsuario();
        $this->crearTabla('preferencias_usuario');
    }

    private function crearRecordatoriosEtiqueta(): void
    {
        $this->forge->addField([
            'id'                   => $this->campoIdGrande(),
            'usuario_id'           => $this->campoUsuarioId(),
            'etiqueta'             => ['type' => 'VARCHAR', 'constraint' => 30],
            'activo'               => $this->campoBooleano(false),
            'minutos_anticipacion' => ['type' => 'JSON', 'null' => true],
            'aviso_al_vencer'      => $this->campoBooleano(true),
            'hora_sin_horario'     => ['type' => 'TIME', 'default' => '09:00:00'],
            'creado_en'            => $this->campoFechaHora(),
            'actualizado_en'       => $this->campoFechaHora(),
        ]);
        $this->forge->addPrimaryKey('id');
        $this->forge->addUniqueKey(['usuario_id', 'etiqueta']);
        $this->forge->addKey('usuario_id');
        $this->agregarRelacionUsuario();
        $this->crearTabla('recordatorios_etiqueta');
    }

    private function crearRutinas(): void
    {
        $this->forge->addField([
            'id'                          => $this->campoUuid(),
            'usuario_id'                  => $this->campoUsuarioId(),
            'id_cliente'                  => $this->campoIdCliente(),
            'nombre'                      => ['type' => 'VARCHAR', 'constraint' => 150],
            'color'                       => ['type' => 'CHAR', 'constraint' => 7, 'default' => '#2563eb'],
            'hora_inicio_predeterminada'  => ['type' => 'TIME'],
            'hora_fin_predeterminada'     => ['type' => 'TIME'],
            'activa'                      => $this->campoBooleano(true),
            'version'                     => $this->campoVersion(),
            'creado_en'                   => $this->campoFechaHora(),
            'actualizado_en'              => $this->campoFechaHora(),
            'eliminado_en'                => $this->campoFechaHora(),
        ]);
        $this->forge->addPrimaryKey('id');
        $this->forge->addUniqueKey(['usuario_id', 'id_cliente']);
        $this->agregarIndicesSincronizacion();
        $this->crearTabla('rutinas');
    }

    private function crearHorariosRutina(): void
    {
        $this->forge->addField([
            'id'             => $this->campoIdGrande(),
            'rutina_id'      => $this->campoUuid(),
            'dia_semana'     => ['type' => 'TINYINT', 'constraint' => 1, 'unsigned' => true],
            'hora_inicio'    => ['type' => 'TIME'],
            'hora_fin'       => ['type' => 'TIME'],
            'creado_en'      => $this->campoFechaHora(),
            'actualizado_en' => $this->campoFechaHora(),
        ]);
        $this->forge->addPrimaryKey('id');
        $this->forge->addUniqueKey(['rutina_id', 'dia_semana']);
        $this->forge->addForeignKey('rutina_id', 'rutinas', 'id', 'CASCADE', 'CASCADE');
        $this->crearTabla('horarios_rutina');
    }

    private function crearElementosAgenda(): void
    {
        $this->forge->addField([
            'id'                     => $this->campoUuid(),
            'usuario_id'             => $this->campoUsuarioId(),
            'id_cliente'             => $this->campoIdCliente(),
            'titulo'                 => ['type' => 'VARCHAR', 'constraint' => 255],
            'tipo'                   => ['type' => 'VARCHAR', 'constraint' => 20],
            'fecha_programada'       => ['type' => 'DATE', 'null' => true],
            'hora_inicio'            => ['type' => 'TIME', 'null' => true],
            'hora_fin'               => ['type' => 'TIME', 'null' => true],
            'duracion_minutos'       => ['type' => 'INT', 'constraint' => 11, 'unsigned' => true, 'null' => true],
            'color'                  => ['type' => 'CHAR', 'constraint' => 7, 'null' => true],
            'rutina_id'              => ['type' => 'CHAR', 'constraint' => 36, 'null' => true],
            'prioridad'              => ['type' => 'VARCHAR', 'constraint' => 10, 'default' => 'media'],
            'estado'                 => ['type' => 'VARCHAR', 'constraint' => 20, 'default' => 'pendiente'],
            'etiqueta'               => ['type' => 'VARCHAR', 'constraint' => 30, 'null' => true],
            'favorita'               => $this->campoBooleano(false),
            'repeticion'             => ['type' => 'VARCHAR', 'constraint' => 20, 'default' => 'ninguna'],
            'serie_id'               => ['type' => 'VARCHAR', 'constraint' => 100, 'null' => true],
            'fecha_ocurrencia'       => ['type' => 'DATE', 'null' => true],
            'excepciones_repeticion' => ['type' => 'JSON', 'null' => true],
            'padre_id'               => ['type' => 'CHAR', 'constraint' => 36, 'null' => true],
            'version'                => $this->campoVersion(),
            'creado_en'              => $this->campoFechaHora(),
            'actualizado_en'         => $this->campoFechaHora(),
            'eliminado_en'           => $this->campoFechaHora(),
        ]);
        $this->forge->addPrimaryKey('id');
        $this->forge->addUniqueKey(['usuario_id', 'id_cliente']);
        $this->forge->addKey(['usuario_id', 'fecha_programada']);
        $this->forge->addKey(['usuario_id', 'estado']);
        $this->forge->addKey('rutina_id');
        $this->forge->addKey('padre_id');
        $this->forge->addKey(['usuario_id', 'actualizado_en']);
        $this->agregarRelacionUsuario();
        $this->forge->addForeignKey('rutina_id', 'rutinas', 'id', 'CASCADE', 'SET NULL');
        $this->forge->addForeignKey('padre_id', 'elementos_agenda', 'id', 'CASCADE', 'SET NULL');
        $this->crearTabla('elementos_agenda');
    }

    private function crearSubtareas(): void
    {
        $this->forge->addField([
            'id'                => $this->campoUuid(),
            'elemento_agenda_id'=> $this->campoUuid(),
            'id_cliente'        => $this->campoIdCliente(),
            'titulo'            => ['type' => 'VARCHAR', 'constraint' => 255],
            'completada'        => $this->campoBooleano(false),
            'posicion'          => ['type' => 'SMALLINT', 'constraint' => 5, 'unsigned' => true, 'default' => 0],
            'version'           => $this->campoVersion(),
            'creado_en'         => $this->campoFechaHora(),
            'actualizado_en'    => $this->campoFechaHora(),
            'eliminado_en'      => $this->campoFechaHora(),
        ]);
        $this->forge->addPrimaryKey('id');
        $this->forge->addUniqueKey(['elemento_agenda_id', 'id_cliente']);
        $this->forge->addKey(['elemento_agenda_id', 'posicion']);
        $this->forge->addForeignKey('elemento_agenda_id', 'elementos_agenda', 'id', 'CASCADE', 'CASCADE');
        $this->crearTabla('subtareas');
    }

    private function crearNotasRapidas(): void
    {
        $this->forge->addField([
            'id'             => $this->campoUuid(),
            'usuario_id'     => $this->campoUsuarioId(),
            'id_cliente'     => $this->campoIdCliente(),
            'titulo'         => ['type' => 'VARCHAR', 'constraint' => 255, 'default' => ''],
            'contenido'      => ['type' => 'TEXT', 'null' => true],
            'version'        => $this->campoVersion(),
            'creado_en'      => $this->campoFechaHora(),
            'actualizado_en' => $this->campoFechaHora(),
            'eliminado_en'   => $this->campoFechaHora(),
        ]);
        $this->forge->addPrimaryKey('id');
        $this->forge->addUniqueKey(['usuario_id', 'id_cliente']);
        $this->agregarIndicesSincronizacion();
        $this->crearTabla('notas_rapidas');
    }

    private function crearTratamientosMedicamentos(): void
    {
        $this->forge->addField([
            'id'                       => $this->campoUuid(),
            'usuario_id'               => $this->campoUsuarioId(),
            'id_cliente'               => $this->campoIdCliente(),
            'nombre_tratamiento'       => ['type' => 'VARCHAR', 'constraint' => 150, 'null' => true],
            'nombre_medicamento'       => ['type' => 'VARCHAR', 'constraint' => 150],
            'dosis'                    => ['type' => 'VARCHAR', 'constraint' => 100],
            'indicaciones'             => ['type' => 'TEXT', 'null' => true],
            'fecha_inicio'             => ['type' => 'DATE'],
            'fecha_fin'                => ['type' => 'DATE', 'null' => true],
            'continuo'                 => $this->campoBooleano(false),
            'dias_programados'         => ['type' => 'JSON'],
            'horas_programadas'        => ['type' => 'JSON'],
            'color'                    => ['type' => 'CHAR', 'constraint' => 7, 'default' => '#22c55e'],
            'seguimiento_estricto'     => $this->campoBooleano(false),
            'inventario_activo'        => $this->campoBooleano(false),
            'cantidad_inventario'      => ['type' => 'DECIMAL', 'constraint' => '12,3', 'default' => 0],
            'unidades_por_toma'        => ['type' => 'DECIMAL', 'constraint' => '12,3', 'default' => 1],
            'unidad_inventario'        => ['type' => 'VARCHAR', 'constraint' => 40, 'default' => 'tabletas'],
            'umbral_inventario_bajo'   => ['type' => 'DECIMAL', 'constraint' => '12,3', 'default' => 5],
            'estado'                   => ['type' => 'VARCHAR', 'constraint' => 20, 'default' => 'activo'],
            'version'                  => $this->campoVersion(),
            'creado_en'                => $this->campoFechaHora(),
            'actualizado_en'           => $this->campoFechaHora(),
            'eliminado_en'             => $this->campoFechaHora(),
        ]);
        $this->forge->addPrimaryKey('id');
        $this->forge->addUniqueKey(['usuario_id', 'id_cliente']);
        $this->forge->addKey(['usuario_id', 'estado']);
        $this->forge->addKey(['usuario_id', 'actualizado_en']);
        $this->agregarRelacionUsuario();
        $this->crearTabla('tratamientos_medicamentos');
    }

    private function crearTomasMedicamentos(): void
    {
        $this->forge->addField([
            'id'             => $this->campoUuid(),
            'usuario_id'     => $this->campoUsuarioId(),
            'tratamiento_id' => $this->campoUuid(),
            'id_cliente'     => $this->campoIdCliente(),
            'programada_en'  => ['type' => 'DATETIME'],
            'estado'         => ['type' => 'VARCHAR', 'constraint' => 20, 'default' => 'pendiente'],
            'registrada_en'  => $this->campoFechaHora(),
            'nota'           => ['type' => 'TEXT', 'null' => true],
            'version'        => $this->campoVersion(),
            'creado_en'      => $this->campoFechaHora(),
            'actualizado_en' => $this->campoFechaHora(),
            'eliminado_en'   => $this->campoFechaHora(),
        ]);
        $this->forge->addPrimaryKey('id');
        $this->forge->addUniqueKey(['usuario_id', 'id_cliente']);
        $this->forge->addUniqueKey(['tratamiento_id', 'programada_en']);
        $this->forge->addKey(['usuario_id', 'programada_en']);
        $this->forge->addKey(['usuario_id', 'actualizado_en']);
        $this->agregarRelacionUsuario();
        $this->forge->addForeignKey('tratamiento_id', 'tratamientos_medicamentos', 'id', 'CASCADE', 'CASCADE');
        $this->crearTabla('tomas_medicamentos');
    }

    private function crearConfiguracionBilletera(): void
    {
        $this->forge->addField([
            'usuario_id'        => $this->campoUsuarioId(),
            'monto_sueldo'      => ['type' => 'DECIMAL', 'constraint' => '12,2', 'default' => 0],
            'periodicidad_pago' => ['type' => 'VARCHAR', 'constraint' => 20, 'default' => 'quincenal'],
            'primera_fecha_pago'=> ['type' => 'DATE'],
            'moneda'            => ['type' => 'CHAR', 'constraint' => 3, 'default' => 'MXN'],
            'version'           => $this->campoVersion(),
            'creado_en'         => $this->campoFechaHora(),
            'actualizado_en'    => $this->campoFechaHora(),
        ]);
        $this->forge->addPrimaryKey('usuario_id');
        $this->agregarRelacionUsuario();
        $this->crearTabla('configuracion_billetera');
    }

    private function crearGastosFijos(): void
    {
        $this->forge->addField([
            'id'                 => $this->campoUuid(),
            'usuario_id'         => $this->campoUsuarioId(),
            'id_cliente'         => $this->campoIdCliente(),
            'nombre'             => ['type' => 'VARCHAR', 'constraint' => 150],
            'monto'              => ['type' => 'DECIMAL', 'constraint' => '12,2'],
            'categoria'          => ['type' => 'VARCHAR', 'constraint' => 80, 'default' => 'Otros'],
            'dia_vencimiento'    => ['type' => 'TINYINT', 'constraint' => 2, 'unsigned' => true],
            'frecuencia_meses'   => ['type' => 'TINYINT', 'constraint' => 1, 'unsigned' => true, 'default' => 1],
            'primer_vencimiento' => ['type' => 'DATE'],
            'inicio_seguimiento' => ['type' => 'DATE'],
            'hora_recordatorio'  => ['type' => 'TIME', 'default' => '09:00:00'],
            'activo'             => $this->campoBooleano(true),
            'version'            => $this->campoVersion(),
            'creado_en'          => $this->campoFechaHora(),
            'actualizado_en'     => $this->campoFechaHora(),
            'eliminado_en'       => $this->campoFechaHora(),
        ]);
        $this->forge->addPrimaryKey('id');
        $this->forge->addUniqueKey(['usuario_id', 'id_cliente']);
        $this->forge->addKey(['usuario_id', 'activo']);
        $this->forge->addKey(['usuario_id', 'actualizado_en']);
        $this->agregarRelacionUsuario();
        $this->crearTabla('gastos_fijos');
    }

    private function crearMovimientosBilletera(): void
    {
        $this->forge->addField([
            'id'                => $this->campoUuid(),
            'usuario_id'        => $this->campoUsuarioId(),
            'id_cliente'        => $this->campoIdCliente(),
            'naturaleza'        => ['type' => 'VARCHAR', 'constraint' => 10],
            'tipo'              => ['type' => 'VARCHAR', 'constraint' => 30],
            'descripcion'       => ['type' => 'VARCHAR', 'constraint' => 255],
            'monto'             => ['type' => 'DECIMAL', 'constraint' => '12,2'],
            'categoria'         => ['type' => 'VARCHAR', 'constraint' => 80, 'default' => 'Otros'],
            'fecha'             => ['type' => 'DATE'],
            'gasto_fijo_id'     => ['type' => 'CHAR', 'constraint' => 36, 'null' => true],
            'periodo_gasto_fijo'=> ['type' => 'CHAR', 'constraint' => 7, 'null' => true],
            'version'           => $this->campoVersion(),
            'creado_en'         => $this->campoFechaHora(),
            'actualizado_en'    => $this->campoFechaHora(),
            'eliminado_en'      => $this->campoFechaHora(),
        ]);
        $this->forge->addPrimaryKey('id');
        $this->forge->addUniqueKey(['usuario_id', 'id_cliente']);
        $this->forge->addKey(['usuario_id', 'fecha']);
        $this->forge->addKey(['usuario_id', 'actualizado_en']);
        $this->forge->addKey('gasto_fijo_id');
        $this->agregarRelacionUsuario();
        $this->forge->addForeignKey('gasto_fijo_id', 'gastos_fijos', 'id', 'CASCADE', 'SET NULL');
        $this->crearTabla('movimientos_billetera');
    }

    private function crearTabla(string $nombre): void
    {
        $this->forge->createTable($nombre, false, $this->atributos);
    }

    private function agregarRelacionUsuario(): void
    {
        $this->forge->addForeignKey('usuario_id', $this->tablaUsuarios, 'id', 'CASCADE', 'CASCADE');
    }

    private function agregarIndicesSincronizacion(): void
    {
        $this->forge->addKey('usuario_id');
        $this->forge->addKey(['usuario_id', 'actualizado_en']);
        $this->agregarRelacionUsuario();
    }

    private function campoUsuarioId(): array
    {
        return ['type' => 'INT', 'constraint' => 11, 'unsigned' => true];
    }

    private function campoUuid(): array
    {
        return ['type' => 'CHAR', 'constraint' => 36];
    }

    private function campoIdCliente(): array
    {
        return ['type' => 'VARCHAR', 'constraint' => 100];
    }

    private function campoIdGrande(): array
    {
        return [
            'type'           => 'BIGINT',
            'constraint'     => 20,
            'unsigned'       => true,
            'auto_increment' => true,
        ];
    }

    private function campoBooleano(bool $predeterminado): array
    {
        return [
            'type'       => 'TINYINT',
            'constraint' => 1,
            'default'    => $predeterminado ? 1 : 0,
        ];
    }

    private function campoVersion(): array
    {
        return [
            'type'       => 'INT',
            'constraint' => 11,
            'unsigned'   => true,
            'default'    => 1,
        ];
    }

    private function campoFechaHora(): array
    {
        return ['type' => 'DATETIME', 'null' => true];
    }
}
