<?php

declare(strict_types=1);

namespace App\Models;

final class ElementoAgendaModel extends ModeloSincronizable
{
    protected $table = 'elementos_agenda';

    protected $allowedFields = [
        'id',
        'usuario_id',
        'id_cliente',
        'titulo',
        'tipo',
        'fecha_programada',
        'hora_inicio',
        'hora_fin',
        'duracion_minutos',
        'color',
        'rutina_id',
        'prioridad',
        'estado',
        'etiqueta',
        'favorita',
        'repeticion',
        'serie_id',
        'fecha_ocurrencia',
        'excepciones_repeticion',
        'padre_id',
        'version',
        'eliminado_en',
    ];
}
