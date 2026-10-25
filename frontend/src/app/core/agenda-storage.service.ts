import { Injectable } from '@angular/core';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { EventPreset, Task } from './task.model';
import { MedicationDose, MedicationTreatment } from './wellness.model';
import { QuickNote } from './note.model';
import { WalletState } from './wallet.model';

interface AgendaDatabasePlugin {
  initialize(options: { tasksJson: string; presetsJson: string }): Promise<{
    tasksJson: string;
    presetsJson: string;
  }>;
  saveTasks(options: { tasksJson: string }): Promise<void>;
  savePresets(options: { presetsJson: string }): Promise<void>;
  initializeTreatments(options: { treatmentsJson: string }): Promise<{ treatmentsJson: string }>;
  saveTreatments(options: { treatmentsJson: string }): Promise<void>;
  initializeMedicationDoses(options: { dosesJson: string }): Promise<{ dosesJson: string }>;
  saveMedicationDoses(options: { dosesJson: string }): Promise<void>;
  initializeNotes(options: { notesJson: string }): Promise<{ notesJson: string }>;
  saveNotes(options: { notesJson: string }): Promise<void>;
  initializeWallet(options: { walletJson: string }): Promise<{ walletJson: string }>;
  saveWallet(options: { walletJson: string }): Promise<void>;
}

const AgendaDatabase = registerPlugin<AgendaDatabasePlugin>('AgendaDatabase');

@Injectable({ providedIn: 'root' })
export class AgendaStorageService {
  private ready = false;
  private pendingTasks?: Task[];
  private pendingPresets?: EventPreset[];

  get supported(): boolean {
    return Capacitor.getPlatform() === 'android';
  }

  async initialize(tasks: Task[], presets: EventPreset[]): Promise<{
    tasks: Partial<Task>[];
    presets: Partial<EventPreset>[];
  }> {
    if (!this.supported) return { tasks, presets };

    // Discard the compatibility writes produced while LocalStorage bootstraps the UI.
    // Writes arriving after this point are real user changes and must win the race.
    this.pendingTasks = undefined;
    this.pendingPresets = undefined;
    const result = await AgendaDatabase.initialize({
      tasksJson: JSON.stringify(tasks),
      presetsJson: JSON.stringify(presets),
    });
    this.ready = true;

    let storedTasks = this.parseArray<Partial<Task>>(result.tasksJson, tasks);
    let storedPresets = this.parseArray<Partial<EventPreset>>(result.presetsJson, presets);
    const pendingTasks = this.pendingTasks;
    const pendingPresets = this.pendingPresets;
    this.pendingTasks = undefined;
    this.pendingPresets = undefined;

    if (pendingTasks) {
      await this.saveTasks(pendingTasks);
      storedTasks = pendingTasks;
    }
    if (pendingPresets) {
      await this.savePresets(pendingPresets);
      storedPresets = pendingPresets;
    }
    return { tasks: storedTasks, presets: storedPresets };
  }

  async saveTasks(tasks: Task[]): Promise<void> {
    if (!this.supported) return;
    if (!this.ready) {
      this.pendingTasks = tasks.map((task) => ({ ...task }));
      return;
    }
    await AgendaDatabase.saveTasks({ tasksJson: JSON.stringify(tasks) });
  }

  async savePresets(presets: EventPreset[]): Promise<void> {
    if (!this.supported) return;
    if (!this.ready) {
      this.pendingPresets = presets.map((preset) => ({ ...preset }));
      return;
    }
    await AgendaDatabase.savePresets({ presetsJson: JSON.stringify(presets) });
  }

  async initializeTreatments(treatments: MedicationTreatment[]): Promise<Partial<MedicationTreatment>[]> {
    if (!this.supported) return treatments;
    const result = await AgendaDatabase.initializeTreatments({
      treatmentsJson: JSON.stringify(treatments),
    });
    return this.parseArray<Partial<MedicationTreatment>>(result.treatmentsJson, treatments);
  }

  async saveTreatments(treatments: MedicationTreatment[]): Promise<void> {
    if (!this.supported) return;
    await AgendaDatabase.saveTreatments({ treatmentsJson: JSON.stringify(treatments) });
  }

  async initializeMedicationDoses(doses: MedicationDose[]): Promise<Partial<MedicationDose>[]> {
    if (!this.supported) return doses;
    const result = await AgendaDatabase.initializeMedicationDoses({
      dosesJson: JSON.stringify(doses),
    });
    return this.parseArray<Partial<MedicationDose>>(result.dosesJson, doses);
  }

  async saveMedicationDoses(doses: MedicationDose[]): Promise<void> {
    if (!this.supported) return;
    await AgendaDatabase.saveMedicationDoses({ dosesJson: JSON.stringify(doses) });
  }

  async initializeNotes(notes: QuickNote[]): Promise<Partial<QuickNote>[]> {
    if (!this.supported) return notes;
    const result = await AgendaDatabase.initializeNotes({ notesJson: JSON.stringify(notes) });
    return this.parseArray<Partial<QuickNote>>(result.notesJson, notes);
  }

  async saveNotes(notes: QuickNote[]): Promise<void> {
    if (!this.supported) return;
    await AgendaDatabase.saveNotes({ notesJson: JSON.stringify(notes) });
  }

  async initializeWallet(wallet: WalletState): Promise<Partial<WalletState>> {
    if (!this.supported) return wallet;
    const result = await AgendaDatabase.initializeWallet({ walletJson: JSON.stringify(wallet) });
    try {
      return JSON.parse(result.walletJson) as Partial<WalletState>;
    } catch {
      return wallet;
    }
  }

  async saveWallet(wallet: WalletState): Promise<void> {
    if (!this.supported) return;
    await AgendaDatabase.saveWallet({ walletJson: JSON.stringify(wallet) });
  }

  private parseArray<T>(json: string, fallback: T[]): T[] {
    try {
      const value = JSON.parse(json) as unknown;
      return Array.isArray(value) ? value as T[] : fallback;
    } catch {
      return fallback;
    }
  }
}
