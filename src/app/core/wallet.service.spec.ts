import { TestBed } from '@angular/core/testing';
import { WalletService } from './wallet.service';

describe('WalletService', () => {
  let service: WalletService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(WalletService);
    service.load();
  });

  it('calculates salary, extra income and expenses for the current fortnight', () => {
    service.saveSettings({ salaryAmount: 5000, paySchedule: 'semi-monthly', firstPayDate: '2026-10-01', currency: 'MXN' });
    service.addTransaction({ kind: 'income', description: 'Venta', amount: 500, category: 'Otros', date: '2026-10-10' });
    service.addTransaction({ kind: 'expense', description: 'Comida', amount: 300, category: 'Alimentos', date: '2026-10-11' });

    const summary = service.summary(new Date('2026-10-12T12:00:00'));

    expect(summary.salary).toBe(5000);
    expect(summary.extraIncome).toBe(500);
    expect(summary.spent).toBe(300);
    expect(summary.available).toBe(5200);
    expect(summary.periodStart).toBe('2026-09-30');
    expect(summary.periodEnd).toBe('2026-10-14');
  });

  it('creates monthly fixed obligations and keeps their payment history', () => {
    const [expense] = service.saveFixedExpense({
      name: 'Internet', amount: 600, category: 'Servicios', dueDay: 25,
      frequencyMonths: 1, reminderTime: '09:00', active: true,
    }).fixedExpenses;
    const occurrence = service.occurrences(new Date(), 0, 1).find((item) => item.expense.id === expense.id)!;

    expect(occurrence.paid).toBe(false);
    service.markFixedPaid(occurrence);

    expect(service.occurrences(new Date(), 0, 1).find((item) => item.id === occurrence.id)?.paid).toBe(true);
    expect(service.getState().transactions[0]).toMatchObject({
      type: 'fixed-expense', fixedExpenseId: expense.id, amount: 600,
    });
  });

  it('does not create occurrences from before the active fortnight', () => {
    service.saveFixedExpense({
      name: 'Renta', amount: 4000, category: 'Hogar', dueDay: 1,
      frequencyMonths: 1, reminderTime: '09:00', active: true,
    });

    const periodStart = service.summary(new Date()).periodStart;
    const previous = service.occurrences(new Date(), 3, 0).filter((item) => item.dueDate < periodStart);
    expect(previous).toEqual([]);
  });

  it('counts a fixed expense from the current fortnight when it is registered late', () => {
    localStorage.setItem('agenda_wallet_v1', JSON.stringify({
      settings: { salaryAmount: 5000, paySchedule: 'semi-monthly', firstPayDate: '2026-10-01', currency: 'MXN' },
      fixedExpenses: [{
        id: 'fuel', name: 'Gasolina', amount: 800, category: 'Transporte', dueDay: 15,
        frequencyMonths: 1, reminderTime: '09:00', active: true,
        createdAt: '2026-10-24T12:00:00.000Z', updatedAt: '2026-10-24T12:00:00.000Z',
      }],
      transactions: [],
    }));
    service.load();

    const summary = service.summary(new Date('2026-10-24T12:00:00'));
    expect(summary.periodStart).toBe('2026-10-15');
    expect(summary.periodEnd).toBe('2026-10-30');
    expect(summary.pendingFixed).toBe(800);
    expect(summary.afterCommitments).toBe(4200);
  });

  it('creates bimonthly obligations and records the amount actually paid', () => {
    const [expense] = service.saveFixedExpense({
      name: 'Luz', amount: 800, category: 'Servicios', dueDay: 20,
      frequencyMonths: 2, reminderTime: '09:00', active: true,
    }).fixedExpenses;
    const occurrences = service.occurrences(new Date(), 0, 4)
      .filter((item) => item.expense.id === expense.id);

    expect(occurrences.length).toBeGreaterThanOrEqual(2);
    const firstMonth = Number(occurrences[0].period.slice(5));
    const secondMonth = Number(occurrences[1].period.slice(5));
    expect((secondMonth - firstMonth + 12) % 12).toBe(2);

    service.markFixedPaid(occurrences[0], occurrences[0].dueDate, 675.5);
    expect(service.getState().transactions[0]).toMatchObject({
      type: 'fixed-expense', amount: 675.5, fixedPeriod: occurrences[0].period,
    });
  });
});
