export type TreatmentStatus = 'active' | 'paused' | 'finished';
export type DoseStatus = 'pending' | 'taken' | 'postponed' | 'skipped' | 'missed';

export interface MedicationSchedule {
  days: number[];
  times: string[];
}

export interface MedicationTreatment {
  id: string;
  treatmentName?: string;
  name: string;
  dose: string;
  instructions?: string;
  startDate: string;
  endDate?: string;
  continuous: boolean;
  schedule: MedicationSchedule;
  color: string;
  strictTracking: boolean;
  stockEnabled: boolean;
  stockQuantity: number;
  doseUnits: number;
  stockUnit: string;
  lowStockThreshold: number;
  status: TreatmentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MedicationDose {
  id: string;
  treatmentId: string;
  scheduledAt: string;
  status: DoseStatus;
  recordedAt?: string;
  note?: string;
}

export interface WellnessSettings {
  enabled: boolean;
}
