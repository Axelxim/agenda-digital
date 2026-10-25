<?php

declare(strict_types=1);

namespace App\Models;

final class TomaMedicamentoModel extends ModeloSincronizable
{
    protected $table = 'tomas_medicamentos';

    protected $allowedFields = [
        'id',
        'usuario_id',
        'tratamiento_id',
        'id_cliente',
        'programada_en',
        'estado',
        'registrada_en',
        'nota',
        'version',
        'eliminado_en',
    ];
}
