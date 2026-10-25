<?php

declare(strict_types=1);

namespace App\Models;

final class NotaRapidaModel extends ModeloSincronizable
{
    protected $table = 'notas_rapidas';

    protected $allowedFields = [
        'id',
        'usuario_id',
        'id_cliente',
        'titulo',
        'contenido',
        'version',
        'eliminado_en',
    ];
}
