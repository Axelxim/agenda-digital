<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Models\ConfiguracionBilleteraModel;
use App\Models\ElementoAgendaModel;
use App\Models\GastoFijoModel;
use App\Models\HorarioRutinaModel;
use App\Models\MovimientoBilleteraModel;
use App\Models\NotaRapidaModel;
use App\Models\PreferenciaUsuarioModel;
use App\Models\RecordatorioEtiquetaModel;
use App\Models\RutinaModel;
use App\Models\SubtareaModel;
use App\Models\TomaMedicamentoModel;
use App\Models\TratamientoMedicamentoModel;
use CodeIgniter\Test\CIUnitTestCase;
use ReflectionClass;

final class DataModelsTest extends CIUnitTestCase
{
    public function testModelsPointToExpectedSpanishTables(): void
    {
        $modelos = [
            PreferenciaUsuarioModel::class       => 'preferencias_usuario',
            RecordatorioEtiquetaModel::class     => 'recordatorios_etiqueta',
            RutinaModel::class                   => 'rutinas',
            HorarioRutinaModel::class            => 'horarios_rutina',
            ElementoAgendaModel::class           => 'elementos_agenda',
            SubtareaModel::class                 => 'subtareas',
            NotaRapidaModel::class               => 'notas_rapidas',
            TratamientoMedicamentoModel::class   => 'tratamientos_medicamentos',
            TomaMedicamentoModel::class          => 'tomas_medicamentos',
            ConfiguracionBilleteraModel::class   => 'configuracion_billetera',
            GastoFijoModel::class                => 'gastos_fijos',
            MovimientoBilleteraModel::class      => 'movimientos_billetera',
        ];

        foreach ($modelos as $clase => $tabla) {
            $propiedades = (new ReflectionClass($clase))->getDefaultProperties();
            $this->assertSame($tabla, $propiedades['table'], $clase);
            $this->assertNotEmpty($propiedades['allowedFields'], $clase);
        }
    }
}
