export type WalletPaySchedule = 'semi-monthly' | 'biweekly' | 'weekly';
export type WalletTransactionKind = 'income' | 'expense';
export type WalletTransactionType = 'extra-income' | 'variable-expense' | 'fixed-expense' | 'loan-payment' | 'loan-disbursement';
export type FixedExpenseFrequency = 1 | 2;

export interface WalletSettings {
  salaryAmount: number;
  paySchedule: WalletPaySchedule;
  firstPayDate: string;
  weeklyPayDay: number;
  moveWeekendPayToFriday: boolean;
  currency: 'MXN';
}

export interface FixedExpense {
  id: string;
  name: string;
  amount: number;
  category: string;
  dueDay: number;
  frequencyMonths: FixedExpenseFrequency;
  firstDueDate: string;
  trackingStartDate: string;
  reminderTime: string;
  insistentReminder: boolean;
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
  loanId?: string;
  loanPeriod?: string;
  createdAt: string;
}

export interface WalletLoan {
  id: string;
  creditor: string;
  originalAmount: number;
  remainingAmount: number;
  paymentAmount: number;
  paymentSchedule: 'fixed' | 'weekly' | 'tentative';
  dueDay: number;
  dueWeekday: number;
  tentativePaymentDate?: string;
  notes: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WalletState {
  settings: WalletSettings;
  fixedExpenses: FixedExpense[];
  loans: WalletLoan[];
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
  pendingLoans: number;
  totalDebt: number;
  available: number;
  afterCommitments: number;
}
