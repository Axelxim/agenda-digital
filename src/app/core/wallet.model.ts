export type WalletPaySchedule = 'semi-monthly' | 'biweekly';
export type WalletTransactionKind = 'income' | 'expense';
export type WalletTransactionType = 'extra-income' | 'variable-expense' | 'fixed-expense';
export type FixedExpenseFrequency = 1 | 2;

export interface WalletSettings {
  salaryAmount: number;
  paySchedule: WalletPaySchedule;
  firstPayDate: string;
  currency: 'MXN';
}

export interface FixedExpense {
  id: string;
  name: string;
  amount: number;
  category: string;
  dueDay: number;
  frequencyMonths: FixedExpenseFrequency;
  trackingStartDate: string;
  reminderTime: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WalletTransaction {
  id: string;
  kind: WalletTransactionKind;
  type: WalletTransactionType;
  description: string;
  amount: number;
  category: string;
  date: string;
  fixedExpenseId?: string;
  fixedPeriod?: string;
  createdAt: string;
}

export interface WalletState {
  settings: WalletSettings;
  fixedExpenses: FixedExpense[];
  transactions: WalletTransaction[];
}

export interface FixedExpenseOccurrence {
  id: string;
  expense: FixedExpense;
  period: string;
  dueDate: string;
  paid: boolean;
  paidTransaction?: WalletTransaction;
}

export interface WalletSummary {
  periodStart: string;
  periodEnd: string;
  salary: number;
  extraIncome: number;
  spent: number;
  pendingFixed: number;
  available: number;
  afterCommitments: number;
}
