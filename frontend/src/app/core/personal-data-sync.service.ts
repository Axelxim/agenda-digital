import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Subscription, debounceTime, firstValueFrom, merge } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { AgendaSyncService } from './agenda-sync.service';
import { QuickNote } from './note.model';
import { NoteService } from './note.service';
import { WalletState } from './wallet.model';
import { WalletService } from './wallet.service';
import { MedicationDose, MedicationTreatment, WellnessSettings } from './wellness.model';
import { WellnessService } from './wellness.service';
import { LabelReminderService } from './label-reminder.service';
import { LabelReminderSettings, TaskLabel } from './task.model';

interface ServerPersonalData {
  preferencias: { modo_avanzado: boolean; bienestar_activo: boolean; actualizado_en?: string | null };
  recordatorios_etiqueta: Array<{ etiqueta: TaskLabel; activo: boolean; minutos_anticipacion: number[]; aviso_al_vencer: boolean; hora_sin_horario: string }>;
  notas: Array<{ id: string; titulo: string; contenido: string; creado_en: string; actualizado_en: string }>;
  bienestar: {
    tratamientos: Array<Record<string, unknown>>;
    tomas: Array<Record<string, unknown>>;
  };
  billetera: {
    configuracion: Record<string, unknown>;
    gastos_fijos: Array<Record<string, unknown>>;
    movimientos: Array<Record<string, unknown>>;
  };
}

interface PersonalSyncSnapshot {
  notes: string[];
  treatments: string[];
  doses: string[];
  fixedExpenses: string[];
  transactions: string[];
}

@Injectable({ providedIn: 'root' })
export class PersonalDataSyncService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly agendaSync = inject(AgendaSyncService);
  private readonly notes = inject(NoteService);
  private readonly wellness = inject(WellnessService);
  private readonly wallet = inject(WalletService);
  private readonly labelReminders = inject(LabelReminderService);
  private readonly subscriptions = new Subscription();
  private started = false;
  private applyingRemote = false;
  private syncing = false;
  private rerun = false;
  private readonly advancedModeKey = 'agenda-advanced-mode';
  private readonly snapshotPrefix = 'todo-en-orden-personal-sync:';

  start(): Promise<void> {
    if (!this.auth.isAuthenticated() || !this.agendaSync.enabled()) return Promise.resolve();
    if (!this.started) {
      this.started = true;
      this.subscriptions.add(
        merge(this.notes.changes$, this.wellness.changes$, this.wallet.changes$, this.labelReminders.changes$)
          .pipe(debounceTime(1000))
          .subscribe(() => {
            if (!this.applyingRemote) void this.upload();
          }),
      );
      window.addEventListener('online', this.onlineListener);
    }
    return this.initialSync();
  }

  async syncNow(): Promise<void> {
    if (!this.auth.isAuthenticated() || !this.agendaSync.enabled()) return;
    await this.initialSync();
  }

  uploadNow(): void {
    if (this.auth.isAuthenticated() && this.agendaSync.enabled()) void this.upload();
  }

  private async initialSync(): Promise<void> {
    if (this.syncing) {
      this.rerun = true;
      return;
    }
    this.syncing = true;
    try {
      const response = await firstValueFrom(this.http.get<{ data: ServerPersonalData }>(`${environment.apiUrl}/datos-personales`));
      const merged = this.mergeRemote(response.data);
      this.applyingRemote = true;
      this.notes.replaceFromSync(merged.notes);
      this.wellness.replaceFromSync(merged.settings, merged.treatments, merged.doses);
      this.wallet.replaceFromSync(merged.wallet);
      this.labelReminders.replaceFromSync(merged.labelReminders);
      localStorage.setItem(this.advancedModeKey, String(merged.advancedMode));
      this.applyingRemote = false;
      await this.putSnapshot();
    } catch (error) {
      this.applyingRemote = false;
      console.error('No fue posible sincronizar Bienestar, Notas y Billetera.', error);
    } finally {
      this.syncing = false;
      if (this.rerun) {
        this.rerun = false;
        void this.initialSync();
      }
    }
  }

  private async upload(): Promise<void> {
    if (this.syncing || !this.auth.isAuthenticated() || !this.agendaSync.enabled()) {
      this.rerun = true;
      return;
    }
    this.syncing = true;
    try {
      await this.putSnapshot();
    } catch (error) {
      console.error('Los cambios personales quedaron pendientes de sincronizar.', error);
    } finally {
      this.syncing = false;
      if (this.rerun) {
        this.rerun = false;
        void this.upload();
      }
    }
  }

  private async putSnapshot(): Promise<void> {
    const wallet = this.wallet.getState();
    await firstValueFrom(this.http.put(`${environment.apiUrl}/datos-personales`, {
      preferencias: {
        advancedMode: localStorage.getItem(this.advancedModeKey) === 'true',
        wellnessEnabled: this.wellness.loadSettings().enabled,
      },
      recordatorios_etiqueta: Object.values(this.currentLabelReminders()),
      notas: this.notes.getAll(),
      tratamientos: this.wellness.getTreatments(),
      tomas: this.wellness.getDoses(),
      configuracion_billetera: wallet.settings,
      gastos_fijos: wallet.fixedExpenses,
      movimientos: wallet.transactions,
    }));
    this.writeSnapshot({
      notes: this.notes.getAll().map((item) => item.id),
      treatments: this.wellness.getTreatments().map((item) => item.id),
      doses: this.wellness.getDoses().map((item) => this.doseKey(item)),
      fixedExpenses: wallet.fixedExpenses.map((item) => item.id),
      transactions: wallet.transactions.map((item) => item.id),
    });
  }

  private mergeRemote(remote: ServerPersonalData): {
    notes: QuickNote[];
    settings: WellnessSettings;
    treatments: MedicationTreatment[];
    doses: MedicationDose[];
    wallet: WalletState;
    advancedMode: boolean;
    labelReminders: Record<TaskLabel, LabelReminderSettings>;
  } {
    const remoteNotes: QuickNote[] = remote.notas.map((item) => ({
      id: item.id, title: item.titulo, content: item.contenido,
      createdAt: this.iso(item.creado_en), updatedAt: this.iso(item.actualizado_en),
    }));
    const remoteTreatments = remote.bienestar.tratamientos.map((item) => this.treatment(item));
    const remoteDoses = remote.bienestar.tomas.map((item) => this.dose(item));
    const localWallet = this.wallet.getState();
    const snapshot = this.readSnapshot();
    const configuration = remote.billetera.configuracion;
    const remoteWallet: WalletState = {
      settings: configuration['actualizado_en'] ? {
        salaryAmount: Number(configuration['monto_sueldo']) || 0,
        paySchedule: configuration['periodicidad_pago'] === 'catorcenal' ? 'biweekly' : 'semi-monthly',
        firstPayDate: String(configuration['primera_fecha_pago'] ?? ''), currency: 'MXN',
      } : localWallet.settings,
      fixedExpenses: remote.billetera.gastos_fijos.map((item) => ({
        id: String(item['id']), name: String(item['nombre']), amount: Number(item['monto']), category: String(item['categoria']),
        dueDay: Number(item['dia_vencimiento']), frequencyMonths: Number(item['frecuencia_meses']) === 2 ? 2 : 1,
        firstDueDate: String(item['primer_vencimiento']), trackingStartDate: String(item['inicio_seguimiento']),
        reminderTime: String(item['hora_recordatorio']), active: item['activo'] === true,
        createdAt: this.iso(item['creado_en']), updatedAt: this.iso(item['actualizado_en']),
      })),
      transactions: remote.billetera.movimientos.map((item) => ({
        id: String(item['id']), kind: item['naturaleza'] === 'ingreso' ? 'income' : 'expense',
        type: ({ ingreso_extra: 'extra-income', gasto_fijo: 'fixed-expense' } as const)[String(item['tipo'])] ?? 'variable-expense',
        description: String(item['descripcion']), amount: Number(item['monto']), category: String(item['categoria']), date: String(item['fecha']),
        fixedExpenseId: item['gasto_fijo_id'] ? String(item['gasto_fijo_id']) : undefined,
        fixedPeriod: item['periodo_gasto_fijo'] ? String(item['periodo_gasto_fijo']) : undefined,
        createdAt: this.iso(item['creado_en']),
      })),
    };
    return {
      notes: this.reconcile(this.notes.getAll(), remoteNotes, snapshot.notes, (item) => item.id, this.preferUpdated),
      treatments: this.reconcile(this.wellness.getTreatments(), remoteTreatments, snapshot.treatments, (item) => item.id, this.preferUpdated),
      doses: this.reconcile(this.wellness.getDoses(), remoteDoses, snapshot.doses, (item) => this.doseKey(item), this.preferDose),
      settings: remote.preferencias.actualizado_en ? { enabled: remote.preferencias.bienestar_activo } : this.wellness.loadSettings(),
      wallet: {
        settings: remoteWallet.settings,
        fixedExpenses: this.reconcile(localWallet.fixedExpenses, remoteWallet.fixedExpenses, snapshot.fixedExpenses, (item) => item.id, this.preferUpdated),
        transactions: this.reconcile(localWallet.transactions, remoteWallet.transactions, snapshot.transactions, (item) => item.id, (_local, server) => server),
      },
      advancedMode: remote.preferencias.actualizado_en
        ? remote.preferencias.modo_avanzado
        : localStorage.getItem(this.advancedModeKey) === 'true',
      labelReminders: this.remoteLabelReminders(remote.recordatorios_etiqueta),
    };
  }

  private currentLabelReminders(): Record<TaskLabel, LabelReminderSettings> {
    return this.labelReminders.load(['Universidad', 'Trabajo', 'Personal', 'Salud', 'Ocio']);
  }

  private remoteLabelReminders(remote: ServerPersonalData['recordatorios_etiqueta']): Record<TaskLabel, LabelReminderSettings> {
    if (!remote.length) return this.currentLabelReminders();
    const settings = this.currentLabelReminders();
    remote.forEach((item) => {
      settings[item.etiqueta] = {
        label: item.etiqueta,
        enabled: item.activo,
        advanceMinutes: item.minutos_anticipacion as LabelReminderSettings['advanceMinutes'],
        duePromptEnabled: item.aviso_al_vencer,
        dateOnlyTime: item.hora_sin_horario,
      };
    });
    return settings;
  }

  private treatment(item: Record<string, unknown>): MedicationTreatment {
    return {
      id: String(item['id']), treatmentName: item['nombre_tratamiento'] ? String(item['nombre_tratamiento']) : undefined,
      name: String(item['nombre_medicamento']), dose: String(item['dosis']), instructions: item['indicaciones'] ? String(item['indicaciones']) : undefined,
      startDate: String(item['fecha_inicio']), endDate: item['fecha_fin'] ? String(item['fecha_fin']) : undefined,
      continuous: item['continuo'] === true, schedule: { days: item['dias_programados'] as number[], times: item['horas_programadas'] as string[] },
      color: String(item['color']), strictTracking: item['seguimiento_estricto'] === true, stockEnabled: item['inventario_activo'] === true,
      stockQuantity: Number(item['cantidad_inventario']), doseUnits: Number(item['unidades_por_toma']), stockUnit: String(item['unidad_inventario']),
      lowStockThreshold: Number(item['umbral_inventario_bajo']), status: item['estado'] as MedicationTreatment['status'],
      createdAt: this.iso(item['creado_en']), updatedAt: this.iso(item['actualizado_en']),
    };
  }

  private dose(item: Record<string, unknown>): MedicationDose {
    return { id: String(item['id']), treatmentId: String(item['tratamiento_id']), scheduledAt: String(item['programada_en']).slice(0, 19),
      status: item['estado'] as MedicationDose['status'], recordedAt: item['registrada_en'] ? String(item['registrada_en']).slice(0, 19) : undefined,
      note: item['nota'] ? String(item['nota']) : undefined };
  }

  private reconcile<T>(local: T[], remote: T[], knownKeys: string[], key: (item: T) => string, prefer: (local: T, remote: T) => T): T[] {
    const known = new Set(knownKeys);
    const localMap = new Map(local.map((item) => [key(item), item]));
    const remoteMap = new Map(remote.map((item) => [key(item), item]));
    const result: T[] = [];
    for (const itemKey of new Set([...localMap.keys(), ...remoteMap.keys()])) {
      const localItem = localMap.get(itemKey);
      const remoteItem = remoteMap.get(itemKey);
      if (known.has(itemKey) && (!localItem || !remoteItem)) continue;
      if (localItem && remoteItem) result.push(prefer(localItem, remoteItem));
      else if (localItem) result.push(localItem);
      else if (remoteItem) result.push(remoteItem);
    }
    return result;
  }

  private readonly preferUpdated = <T extends { updatedAt: string }>(local: T, remote: T): T =>
    remote.updatedAt >= local.updatedAt ? remote : local;

  private readonly preferDose = (local: MedicationDose, remote: MedicationDose): MedicationDose => {
    const score = (item: MedicationDose) => `${item.recordedAt ?? ''}|${item.status === 'pending' ? 0 : 1}`;
    return score(remote) >= score(local) ? remote : local;
  };

  private doseKey(item: MedicationDose): string {
    return `${item.treatmentId}|${item.scheduledAt.slice(0, 19)}`;
  }

  private readSnapshot(): PersonalSyncSnapshot {
    const empty: PersonalSyncSnapshot = { notes: [], treatments: [], doses: [], fixedExpenses: [], transactions: [] };
    const userId = this.auth.user()?.id;
    if (!userId) return empty;
    try {
      return { ...empty, ...JSON.parse(localStorage.getItem(`${this.snapshotPrefix}${userId}`) ?? '{}') as Partial<PersonalSyncSnapshot> };
    } catch {
      return empty;
    }
  }

  private writeSnapshot(snapshot: PersonalSyncSnapshot): void {
    const userId = this.auth.user()?.id;
    if (userId) localStorage.setItem(`${this.snapshotPrefix}${userId}`, JSON.stringify(snapshot));
  }

  private iso(value: unknown): string {
    const text = String(value ?? '');
    return text ? text.replace(' ', 'T') : new Date(0).toISOString();
  }

  private readonly onlineListener = () => void this.syncNow();
}
