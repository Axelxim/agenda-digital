import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { AgendaStorageService } from './agenda-storage.service';
import {
  FixedExpense,
  FixedExpenseOccurrence,
  WalletSettings,
  WalletState,
  WalletSummary,
  WalletTransaction,
  WalletTransactionKind,
} from './wallet.model';

@Injectable({ providedIn: 'root' })
export class WalletService {
  private readonly storage = inject(AgendaStorageService);
  private readonly storageKey = 'agenda_wallet_v1';
  private state = this.defaultState();
  private readonly changesSubject = new Subject<WalletState>();
  readonly changes$ = this.changesSubject.asObservable();

  readonly categories = ['Hogar', 'Servicios', 'Alimentos', 'Transporte', 'Salud', 'Educación', 'Ocio', 'Otros'];

  load(): WalletState {
    try {
      const value = JSON.parse(localStorage.getItem(this.storageKey) ?? '{}') as Partial<WalletState>;
      this.state = this.normalizeState(value);
    } catch {
      this.state = this.defaultState();
    }
    this.persistLocal();
    return this.getState();
  }

  async initializePersistence(): Promise<WalletState> {
    try {
      this.state = this.normalizeState(await this.storage.initializeWallet(this.state));
      this.persistLocal();
      this.emit();
    } catch (error) {
      console.error('No fue posible inicializar Billetera en SQLite; se conserva el respaldo local.', error);
    }
    return this.getState();
  }

  getState(): WalletState {
    return {
      settings: { ...this.state.settings },
      fixedExpenses: this.state.fixedExpenses.map((item) => ({ ...item })),
      transactions: this.state.transactions.map((item) => ({ ...item })),
    };
  }

  saveSettings(settings: WalletSettings): WalletState {
    this.state.settings = this.normalizeSettings(settings);
    this.persist();
    return this.getState();
  }

  saveFixedExpense(
    draft: Omit<FixedExpense, 'id' | 'createdAt' | 'updatedAt' | 'trackingStartDate' | 'firstDueDate'> & { firstDueDate?: string },
    id?: string,
  ): WalletState {
    const current = new Date();
    const now = current.toISOString();
    const existing = id ? this.state.fixedExpenses.find((item) => item.id === id) : undefined;
    const frequencyMonths = draft.frequencyMonths === 2 ? 2 : 1;
    const trackingStartDate = existing?.trackingStartDate || this.payPeriod(current).start;
    const requestedFirstDueDate = this.validDate(draft.firstDueDate)
      ? draft.firstDueDate!
      : existing?.firstDueDate;
    const firstDueDate = requestedFirstDueDate || this.dateWithDay(trackingStartDate, draft.dueDay);
    const expense: FixedExpense = {
      id: existing?.id ?? this.createId(),
      name: draft.name.trim(),
      amount: this.amount(draft.amount),
      category: draft.category || 'Otros',
      dueDay: frequencyMonths === 2
        ? Number(firstDueDate.slice(8, 10))
        : Math.min(31, Math.max(1, Math.round(Number(draft.dueDay) || 1))),
      frequencyMonths,
      firstDueDate,
      trackingStartDate,
      reminderTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(draft.reminderTime) ? draft.reminderTime : '09:00',
      active: draft.active !== false,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    if (!expense.name || expense.amount <= 0) return this.getState();
    this.state.fixedExpenses = existing
      ? this.state.fixedExpenses.map((item) => item.id === id ? expense : item)
      : [...this.state.fixedExpenses, expense];
    this.persist();
    return this.getState();
  }

  deleteFixedExpense(id: string): WalletState {
    this.state.fixedExpenses = this.state.fixedExpenses.filter((item) => item.id !== id);
    this.persist();
    return this.getState();
  }

  addTransaction(draft: {
    kind: WalletTransactionKind;
    description: string;
    amount: number;
    category: string;
    date: string;
  }): WalletState {
    const amount = this.amount(draft.amount);
    const description = draft.description.trim();
    if (!description || amount <= 0 || !draft.date) return this.getState();
    this.state.transactions.push({
      id: this.createId(),
      kind: draft.kind,
      type: draft.kind === 'income' ? 'extra-income' : 'variable-expense',
      description,
      amount,
      category: draft.category || 'Otros',
      date: draft.date,
      createdAt: new Date().toISOString(),
    });
    this.persist();
    return this.getState();
  }

  deleteTransaction(id: string): WalletState {
    this.state.transactions = this.state.transactions.filter((item) => item.id !== id);
    this.persist();
    return this.getState();
  }

  markFixedPaid(
    occurrence: FixedExpenseOccurrence,
    paidDate = occurrence.dueDate,
    paidAmount = occurrence.expense.amount,
  ): WalletState {
    if (occurrence.paid) return this.getState();
    const amount = this.amount(paidAmount);
    if (!paidDate || amount <= 0) return this.getState();
    this.state.transactions.push({
      id: this.createId(),
      kind: 'expense',
      type: 'fixed-expense',
      description: occurrence.expense.name,
      amount,
      category: occurrence.expense.category,
      date: paidDate,
      fixedExpenseId: occurrence.expense.id,
      fixedPeriod: occurrence.period,
      createdAt: new Date().toISOString(),
    });
    this.persist();
    return this.getState();
  }

  occurrences(reference = new Date(), monthsBack = 2, monthsForward = 2): FixedExpenseOccurrence[] {
    const result: FixedExpenseOccurrence[] = [];
    const first = new Date(reference.getFullYear(), reference.getMonth() - monthsBack, 1);
    const count = monthsBack + monthsForward + 1;
    for (let offset = 0; offset < count; offset += 1) {
      const month = new Date(first.getFullYear(), first.getMonth() + offset, 1);
      const period = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
      const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
      for (const expense of this.state.fixedExpenses.filter((item) => item.active)) {
        const recurrenceStartDate = expense.frequencyMonths === 2
          ? expense.firstDueDate
          : expense.trackingStartDate;
        const recurrenceStart = new Date(`${recurrenceStartDate}T12:00:00`);
        const elapsedMonths = (month.getFullYear() - recurrenceStart.getFullYear()) * 12 + month.getMonth() - recurrenceStart.getMonth();
        if (elapsedMonths < 0 || elapsedMonths % expense.frequencyMonths !== 0) continue;
        const dueDate = `${period}-${String(Math.min(expense.dueDay, lastDay)).padStart(2, '0')}`;
        const activeFrom = expense.frequencyMonths === 2 ? expense.firstDueDate : expense.trackingStartDate;
        if (dueDate < activeFrom) continue;
        const paidTransaction = this.state.transactions.find((item) =>
          item.type === 'fixed-expense' && item.fixedExpenseId === expense.id && item.fixedPeriod === period);
        result.push({
          id: `${expense.id}:${period}`,
          expense: { ...expense },
          period,
          dueDate,
          paid: !!paidTransaction,
          paidTransaction: paidTransaction ? { ...paidTransaction } : undefined,
        });
      }
    }
    return result.sort((left, right) => left.dueDate.localeCompare(right.dueDate));
  }

  summary(reference = new Date()): WalletSummary {
    const { start, end } = this.payPeriod(reference);
    const transactions = this.state.transactions.filter((item) => item.date >= start && item.date <= end);
    const extraIncome = transactions.filter((item) => item.kind === 'income').reduce((sum, item) => sum + item.amount, 0);
    const spent = transactions.filter((item) => item.kind === 'expense').reduce((sum, item) => sum + item.amount, 0);
    const pendingFixed = this.occurrences(reference, 1, 1)
      .filter((item) => !item.paid && item.dueDate >= start && item.dueDate <= end)
      .reduce((sum, item) => sum + item.expense.amount, 0);
    const salary = this.state.settings.salaryAmount;
    const available = salary + extraIncome - spent;
    return {
      periodStart: start,
      periodEnd: end,
      salary,
      extraIncome,
      spent,
      pendingFixed,
      available,
      afterCommitments: available - pendingFixed,
    };
  }

  private payPeriod(reference: Date, settings = this.state.settings): { start: string; end: string } {
    if (settings.paySchedule === 'biweekly' && settings.firstPayDate) {
      const anchor = new Date(`${settings.firstPayDate}T12:00:00`);
      const current = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate(), 12);
      const periods = Math.floor((current.getTime() - anchor.getTime()) / (14 * 86400000));
      const startDate = new Date(anchor);
      startDate.setDate(anchor.getDate() + periods * 14);
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 13);
      return { start: this.toISODate(startDate), end: this.toISODate(endDate) };
    }
    const year = reference.getFullYear();
    const month = reference.getMonth();
    const currentDay = reference.getDate();
    const lastDay = new Date(year, month + 1, 0).getDate();
    if (currentDay >= 15 && currentDay < lastDay) {
      return {
        start: this.toISODate(new Date(year, month, 15)),
        end: this.toISODate(new Date(year, month, lastDay - 1)),
      };
    }
    if (currentDay === lastDay) {
      return {
        start: this.toISODate(new Date(year, month, lastDay)),
        end: this.toISODate(new Date(year, month + 1, 14)),
      };
    }
    return {
      start: this.toISODate(new Date(year, month, 0)),
      end: this.toISODate(new Date(year, month, 14)),
    };
  }

  private normalizeState(value: Partial<WalletState>): WalletState {
    const settings = this.normalizeSettings(value.settings);
    return {
      settings,
      fixedExpenses: Array.isArray(value.fixedExpenses)
        ? value.fixedExpenses.map((item) => this.normalizeFixedExpense(item, settings)).filter((item) => item.name && item.amount > 0)
        : [],
      transactions: Array.isArray(value.transactions)
        ? value.transactions.map((item) => this.normalizeTransaction(item)).filter((item) => item.description && item.amount > 0)
        : [],
    };
  }

  private normalizeSettings(value?: Partial<WalletSettings>): WalletSettings {
    return {
      salaryAmount: this.amount(value?.salaryAmount),
      paySchedule: value?.paySchedule === 'biweekly' ? 'biweekly' : 'semi-monthly',
      firstPayDate: value?.firstPayDate || this.toISODate(new Date()),
      currency: 'MXN',
    };
  }

  private normalizeFixedExpense(value: Partial<FixedExpense>, settings: WalletSettings): FixedExpense {
    const now = new Date().toISOString();
    const createdAt = value.createdAt || now;
    const trackingStartDate = value.trackingStartDate || this.payPeriod(new Date(createdAt), settings).start;
    const dueDay = Math.min(31, Math.max(1, Math.round(Number(value.dueDay) || 1)));
    return {
      id: value.id || this.createId(),
      name: value.name?.trim() || '',
      amount: this.amount(value.amount),
      category: value.category || 'Otros',
      dueDay,
      frequencyMonths: value.frequencyMonths === 2 ? 2 : 1,
      firstDueDate: this.validDate(value.firstDueDate)
        ? value.firstDueDate!
        : this.dateWithDay(trackingStartDate, dueDay),
      trackingStartDate,
      reminderTime: value.reminderTime || '09:00',
      active: value.active !== false,
      createdAt,
      updatedAt: value.updatedAt || now,
    };
  }

  private normalizeTransaction(value: Partial<WalletTransaction>): WalletTransaction {
    return {
      id: value.id || this.createId(),
      kind: value.kind === 'income' ? 'income' : 'expense',
      type: value.type === 'extra-income' || value.type === 'fixed-expense' ? value.type : 'variable-expense',
      description: value.description?.trim() || '',
      amount: this.amount(value.amount),
      category: value.category || 'Otros',
      date: value.date || this.toISODate(new Date()),
      fixedExpenseId: value.fixedExpenseId,
      fixedPeriod: value.fixedPeriod,
      createdAt: value.createdAt || new Date().toISOString(),
    };
  }

  private defaultState(): WalletState {
    return { settings: this.normalizeSettings(), fixedExpenses: [], transactions: [] };
  }

  private amount(value?: number): number {
    return Math.round(Math.max(0, Number(value) || 0) * 100) / 100;
  }

  private validDate(value?: string): boolean {
    return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime());
  }

  private dateWithDay(reference: string, dueDay?: number): string {
    const date = new Date(`${reference}T12:00:00`);
    const day = Math.min(
      Math.max(1, Math.round(Number(dueDay) || 1)),
      new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate(),
    );
    return `${reference.slice(0, 8)}${String(day).padStart(2, '0')}`;
  }

  private persist(): void {
    this.persistLocal();
    void this.storage.saveWallet(this.state);
    this.emit();
  }

  private persistLocal(): void {
    localStorage.setItem(this.storageKey, JSON.stringify(this.state));
  }

  private emit(): void {
    this.changesSubject.next(this.getState());
  }

  private createId(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `wallet-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  private toISODate(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
}
