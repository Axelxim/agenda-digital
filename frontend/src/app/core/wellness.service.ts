import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';

import { AgendaStorageService } from './agenda-storage.service';
import { DoseStatus, MedicationDose, MedicationTreatment, TreatmentStatus, WellnessSettings } from './wellness.model';

export interface MedicationTreatmentDraft {
  treatmentName?: string;
  name: string;
  dose: string;
  instructions?: string;
  startDate: string;
  endDate?: string;
  continuous: boolean;
  days: number[];
  times: string[];
  color: string;
  strictTracking: boolean;
  stockEnabled?: boolean;
  stockQuantity?: number;
  doseUnits?: number;
  stockUnit?: string;
  lowStockThreshold?: number;
}

@Injectable({ providedIn: 'root' })
export class WellnessService {
  private readonly agendaStorage = inject(AgendaStorageService);
  private readonly settingsKey = 'agenda_wellness_settings_v1';
  private readonly treatmentsKey = 'agenda_medication_treatments_v1';
  private readonly dosesKey = 'agenda_medication_doses_v1';
  private treatments: MedicationTreatment[] = [];
  private doses: MedicationDose[] = [];
  private readonly changesSubject = new Subject<{
    treatments: MedicationTreatment[];
    doses: MedicationDose[];
    settings: WellnessSettings;
  }>();
  readonly changes$ = this.changesSubject.asObservable();

  loadSettings(): WellnessSettings {
    try {
      const stored = JSON.parse(localStorage.getItem(this.settingsKey) ?? '{}') as Partial<WellnessSettings>;
      return { enabled: stored.enabled === true };
    } catch {
      return { enabled: false };
    }
  }

  saveSettings(settings: WellnessSettings): WellnessSettings {
    const normalized = { enabled: settings.enabled === true };
    localStorage.setItem(this.settingsKey, JSON.stringify(normalized));
    this.emitChanges(normalized);
    return normalized;
  }

  loadTreatments(): MedicationTreatment[] {
    try {
      const stored = JSON.parse(localStorage.getItem(this.treatmentsKey) ?? '[]') as Partial<MedicationTreatment>[];
      this.treatments = Array.isArray(stored) ? stored.map((item) => this.normalize(item)) : [];
    } catch {
      this.treatments = [];
    }
    return this.getTreatments();
  }

  async initializePersistence(): Promise<MedicationTreatment[]> {
    const stored = await this.agendaStorage.initializeTreatments(this.treatments);
    this.treatments = stored.map((item) => this.normalize(item));
    this.loadDoses();
    const storedDoses = await this.agendaStorage.initializeMedicationDoses(this.doses);
    this.doses = storedDoses.map((item) => this.normalizeDose(item));
    this.generateDoses();
    this.save();
    return this.getTreatments();
  }

  getTreatments(): MedicationTreatment[] {
    return this.treatments.map((item) => ({
      ...item,
      schedule: { days: [...item.schedule.days], times: [...item.schedule.times] },
    }));
  }

  replaceFromSync(
    settings: WellnessSettings,
    treatments: MedicationTreatment[],
    doses: MedicationDose[],
  ): MedicationTreatment[] {
    const normalizedSettings = { enabled: settings.enabled === true };
    this.treatments = treatments.map((item) => this.normalize(item));
    this.doses = doses.map((item) => this.normalizeDose(item));
    localStorage.setItem(this.settingsKey, JSON.stringify(normalizedSettings));
    localStorage.setItem(this.treatmentsKey, JSON.stringify(this.treatments));
    localStorage.setItem(this.dosesKey, JSON.stringify(this.doses));
    void this.agendaStorage.saveTreatments(this.treatments);
    void this.agendaStorage.saveMedicationDoses(this.doses);
    this.emitChanges(normalizedSettings);
    return this.getTreatments();
  }

  saveTreatment(draft: MedicationTreatmentDraft, id?: string): MedicationTreatment[] {
    const now = new Date().toISOString();
    const existing = id ? this.treatments.find((item) => item.id === id) : undefined;
    const treatment = this.normalize({
      ...existing,
      id: existing?.id ?? this.createId(),
      treatmentName: draft.treatmentName?.trim(),
      name: draft.name.trim(),
      dose: draft.dose.trim(),
      instructions: draft.instructions?.trim(),
      startDate: draft.startDate,
      endDate: draft.continuous ? undefined : draft.endDate,
      continuous: draft.continuous,
      schedule: { days: draft.days, times: draft.times },
      color: draft.color,
      strictTracking: draft.strictTracking,
      stockEnabled: draft.stockEnabled,
      stockQuantity: draft.stockQuantity,
      doseUnits: draft.doseUnits,
      stockUnit: draft.stockUnit,
      lowStockThreshold: draft.lowStockThreshold,
      status: existing?.status ?? 'active',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });

    if (existing) {
      const current = new Date();
      const currentMinute = `${this.toISODate(current)}T${String(current.getHours()).padStart(2, '0')}:${String(current.getMinutes()).padStart(2, '0')}`;
      this.doses = this.doses.filter((dose) =>
        dose.treatmentId !== existing.id ||
        dose.status !== 'pending' ||
        dose.scheduledAt.slice(0, 16) < currentMinute,
      );
    }

    this.treatments = existing
      ? this.treatments.map((item) => item.id === existing.id ? treatment : item)
      : [...this.treatments, treatment];
    this.generateDoses();
    this.save();
    return this.getTreatments();
  }

  deleteTreatment(id: string): MedicationTreatment[] {
    return this.deleteTreatments([id]);
  }

  deleteTreatments(ids: string[]): MedicationTreatment[] {
    const selected = new Set(ids);
    this.treatments = this.treatments.filter((item) => !selected.has(item.id));
    this.doses = this.doses.filter((item) => !selected.has(item.treatmentId));
    this.saveDoses();
    this.save();
    return this.getTreatments();
  }

  setTreatmentsStatus(ids: string[], status: TreatmentStatus): MedicationTreatment[] {
    const selected = new Set(ids);
    const now = new Date();
    const updatedAt = now.toISOString();
    const currentMinute = `${this.toISODate(now)}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    this.treatments = this.treatments.map((treatment) => selected.has(treatment.id)
      ? { ...treatment, status, updatedAt }
      : treatment);
    if (status !== 'active') {
      this.doses = this.doses.filter((dose) =>
        !selected.has(dose.treatmentId) ||
        dose.status !== 'pending' ||
        dose.scheduledAt.slice(0, 16) < currentMinute,
      );
      this.saveDoses();
    } else {
      this.generateDoses(now);
    }
    this.save();
    return this.getTreatments();
  }

  private save(): void {
    localStorage.setItem(this.treatmentsKey, JSON.stringify(this.treatments));
    void this.agendaStorage.saveTreatments(this.treatments);
    this.emitChanges();
  }

  loadDoses(): MedicationDose[] {
    try {
      const stored = JSON.parse(localStorage.getItem(this.dosesKey) ?? '[]') as Partial<MedicationDose>[];
      this.doses = Array.isArray(stored) ? stored.map((item) => this.normalizeDose(item)) : [];
    } catch {
      this.doses = [];
    }
    return this.getDoses();
  }

  getDoses(): MedicationDose[] {
    return this.doses.map((item) => ({ ...item }));
  }

  refreshDoses(reference = new Date()): MedicationDose[] {
    this.generateDoses(reference);
    return this.getDoses();
  }

  setDoseStatus(id: string, status: DoseStatus, recordedAt = new Date()): MedicationDose[] {
    const currentDose = this.doses.find((dose) => dose.id === id);
    const wasTaken = currentDose?.status === 'taken';
    const willBeTaken = status === 'taken';
    if (currentDose && wasTaken !== willBeTaken) {
      this.treatments = this.treatments.map((treatment) => {
        if (treatment.id !== currentDose.treatmentId || !treatment.stockEnabled) return treatment;
        const change = willBeTaken ? -treatment.doseUnits : treatment.doseUnits;
        return {
          ...treatment,
          stockQuantity: Math.max(0, treatment.stockQuantity + change),
          updatedAt: recordedAt.toISOString(),
        };
      });
      this.save();
    }
    this.doses = this.doses.map((dose) => dose.id === id
      ? {
          ...dose,
          status,
          recordedAt: status === 'pending' ? undefined : recordedAt.toISOString(),
        }
      : dose);
    this.saveDoses();
    return this.getDoses();
  }

  addStock(treatmentId: string, quantity: number): MedicationTreatment[] {
    if (!Number.isFinite(quantity) || quantity <= 0) return this.getTreatments();
    const updatedAt = new Date().toISOString();
    this.treatments = this.treatments.map((treatment) => treatment.id === treatmentId
      ? { ...treatment, stockQuantity: treatment.stockQuantity + quantity, updatedAt }
      : treatment);
    this.save();
    return this.getTreatments();
  }

  private generateDoses(reference = new Date()): void {
    const today = this.toISODate(reference);
    const rangeStart = this.addDays(today, -30);
    const rangeEnd = this.addDays(today, 60);
    let changed = false;

    this.doses = this.doses.map((dose) => {
      if (dose.status !== 'pending' || dose.scheduledAt.slice(0, 10) >= today) return dose;
      changed = true;
      return { ...dose, status: 'missed' };
    });

    const existing = new Set(this.doses.map((dose) => `${dose.treatmentId}|${dose.scheduledAt}`));

    for (const treatment of this.treatments) {
      if (treatment.status !== 'active') continue;
      const start = treatment.startDate > rangeStart ? treatment.startDate : rangeStart;
      const end = !treatment.continuous && treatment.endDate && treatment.endDate < rangeEnd
        ? treatment.endDate
        : rangeEnd;
      if (end < start) continue;

      for (let date = start; date <= end; date = this.addDays(date, 1)) {
        const dayIndex = (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
        if (!treatment.schedule.days.includes(dayIndex)) continue;
        for (const time of treatment.schedule.times) {
          const scheduledAt = `${date}T${time}:00`;
          const key = `${treatment.id}|${scheduledAt}`;
          if (existing.has(key)) continue;
          existing.add(key);
          this.doses.push({
            id: this.createId(),
            treatmentId: treatment.id,
            scheduledAt,
            status: 'pending',
          });
          changed = true;
        }
      }
    }

    if (changed) this.saveDoses();
  }

  private saveDoses(): void {
    this.doses.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    localStorage.setItem(this.dosesKey, JSON.stringify(this.doses));
    void this.agendaStorage.saveMedicationDoses(this.doses);
    this.emitChanges();
  }

  private emitChanges(settings = this.loadSettings()): void {
    this.changesSubject.next({
      treatments: this.getTreatments(),
      doses: this.getDoses(),
      settings,
    });
  }

  private normalizeDose(item: Partial<MedicationDose>): MedicationDose {
    const allowed: DoseStatus[] = ['pending', 'taken', 'postponed', 'skipped', 'missed'];
    return {
      id: typeof item.id === 'string' && item.id ? item.id : this.createId(),
      treatmentId: typeof item.treatmentId === 'string' ? item.treatmentId : '',
      scheduledAt: typeof item.scheduledAt === 'string' ? item.scheduledAt : new Date().toISOString().slice(0, 19),
      status: allowed.includes(item.status as DoseStatus) ? item.status as DoseStatus : 'pending',
      recordedAt: typeof item.recordedAt === 'string' ? item.recordedAt : undefined,
      note: typeof item.note === 'string' ? item.note : undefined,
    };
  }

  private normalize(item: Partial<MedicationTreatment>): MedicationTreatment {
    const now = new Date().toISOString();
    const days = Array.isArray(item.schedule?.days)
      ? [...new Set(item.schedule.days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort()
      : [];
    const times = Array.isArray(item.schedule?.times)
      ? [...new Set(item.schedule.times.filter((time) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time)))].sort()
      : [];
    return {
      id: typeof item.id === 'string' && item.id ? item.id : this.createId(),
      treatmentName: item.treatmentName?.trim() || undefined,
      name: item.name?.trim() || 'Medicamento',
      dose: item.dose?.trim() || 'Dosis indicada',
      instructions: item.instructions?.trim() || undefined,
      startDate: item.startDate || this.today(),
      endDate: item.continuous ? undefined : item.endDate,
      continuous: item.continuous === true,
      schedule: { days, times },
      color: /^#[0-9a-f]{6}$/i.test(item.color ?? '') ? item.color! : '#22c55e',
      strictTracking: item.strictTracking === true,
      stockEnabled: item.stockEnabled === true,
      stockQuantity: this.nonNegativeNumber(item.stockQuantity, 0),
      doseUnits: this.positiveNumber(item.doseUnits, 1),
      stockUnit: item.stockUnit?.trim() || 'tabletas',
      lowStockThreshold: this.nonNegativeNumber(item.lowStockThreshold, 5),
      status: item.status === 'paused' || item.status === 'finished' ? item.status : 'active',
      createdAt: item.createdAt || now,
      updatedAt: item.updatedAt || now,
    };
  }

  private createId(): string {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `treatment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  private positiveNumber(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private nonNegativeNumber(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }

  private today(): string {
    const date = new Date();
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
  }

  private toISODate(date: Date): string {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
  }

  private addDays(date: string, days: number): string {
    const value = new Date(`${date}T12:00:00`);
    value.setDate(value.getDate() + days);
    return this.toISODate(value);
  }
}
