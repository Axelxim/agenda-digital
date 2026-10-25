import { TestBed } from '@angular/core/testing';

import { WellnessService } from './wellness.service';

describe('WellnessService', () => {
  let service: WellnessService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(WellnessService);
    service.loadTreatments();
  });

  it('keeps Bienestar disabled until the user enables it', () => {
    expect(service.loadSettings().enabled).toBe(false);
    expect(service.saveSettings({ enabled: true }).enabled).toBe(true);
    expect(service.loadSettings().enabled).toBe(true);
  });

  it('creates and normalizes a medication treatment', () => {
    const treatments = service.saveTreatment({
      treatmentName: 'Tratamiento de la Dra. García',
      name: 'Fluoxetina',
      dose: 'Dosis indicada',
      startDate: '2026-10-24',
      endDate: '2026-11-24',
      continuous: false,
      days: [0, 1, 1, 2, 3, 4, 5, 6],
      times: ['08:00', '20:00', '08:00'],
      color: '#22c55e',
      strictTracking: true,
    });

    expect(treatments).toHaveLength(1);
    expect(treatments[0].treatmentName).toBe('Tratamiento de la Dra. García');
    expect(treatments[0].schedule.days).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(treatments[0].schedule.times).toEqual(['08:00', '20:00']);
    expect(treatments[0].strictTracking).toBe(true);
  });

  it('removes the end date for a continuous treatment', () => {
    const [treatment] = service.saveTreatment({
      name: 'Tratamiento continuo',
      dose: 'Dosis indicada',
      startDate: '2026-10-24',
      endDate: '2026-11-24',
      continuous: true,
      days: [0, 1, 2, 3, 4, 5, 6],
      times: ['09:00'],
      color: '#22c55e',
      strictTracking: false,
    });

    expect(treatment.endDate).toBeUndefined();
  });

  it('generates doses without duplicates and records a taken dose', () => {
    const today = new Date();
    const startDate = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-');
    service.saveTreatment({
      name: 'Medicamento diario',
      dose: 'Dosis indicada',
      startDate,
      continuous: true,
      days: [0, 1, 2, 3, 4, 5, 6],
      times: ['08:00', '20:00'],
      color: '#22c55e',
      strictTracking: false,
    });

    const generated = service.getDoses();
    expect(generated.length).toBeGreaterThan(0);
    expect(service.refreshDoses()).toHaveLength(generated.length);

    const updated = service.setDoseStatus(generated[0].id, 'taken');
    expect(updated.find((dose) => dose.id === generated[0].id)?.status).toBe('taken');
  });

  it('pauses, reactivates and deletes all medicines in a treatment group', () => {
    const today = new Date();
    const startDate = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-');
    service.saveTreatment({
      treatmentName: 'Control de salud',
      name: 'Medicamento A',
      dose: '1 tableta',
      startDate,
      continuous: true,
      days: [0, 1, 2, 3, 4, 5, 6],
      times: ['23:59'],
      color: '#22c55e',
      strictTracking: false,
    });
    service.saveTreatment({
      treatmentName: 'Control de salud',
      name: 'Medicamento B',
      dose: '1 cápsula',
      startDate,
      continuous: true,
      days: [0, 1, 2, 3, 4, 5, 6],
      times: ['23:58'],
      color: '#22c55e',
      strictTracking: false,
    });
    const ids = service.getTreatments().map((item) => item.id);

    expect(service.setTreatmentsStatus(ids, 'paused').every((item) => item.status === 'paused')).toBe(true);
    expect(service.setTreatmentsStatus(ids, 'active').every((item) => item.status === 'active')).toBe(true);
    expect(service.deleteTreatments(ids)).toEqual([]);
    expect(service.getDoses()).toEqual([]);
  });

  it('discounts stock only when a dose is taken and restores it when undone', () => {
    const today = new Date();
    const startDate = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
    const [treatment] = service.saveTreatment({
      name: 'Citalopram',
      dose: '1 tableta',
      startDate,
      continuous: true,
      days: [0, 1, 2, 3, 4, 5, 6],
      times: ['08:00'],
      color: '#22c55e',
      strictTracking: false,
      stockEnabled: true,
      stockQuantity: 10,
      doseUnits: 1,
      stockUnit: 'tabletas',
      lowStockThreshold: 3,
    });
    const dose = service.getDoses().find((item) => item.treatmentId === treatment.id)!;

    service.setDoseStatus(dose.id, 'taken');
    expect(service.getTreatments()[0].stockQuantity).toBe(9);
    service.setDoseStatus(dose.id, 'pending');
    expect(service.getTreatments()[0].stockQuantity).toBe(10);
    service.addStock(treatment.id, 20);
    expect(service.getTreatments()[0].stockQuantity).toBe(30);
  });

  it('closes pending doses as missed when the day changes', () => {
    const today = new Date();
    const startDate = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
    service.saveTreatment({
      name: 'Medicamento diario',
      dose: '1 tableta',
      startDate,
      continuous: true,
      days: [0, 1, 2, 3, 4, 5, 6],
      times: ['08:00'],
      color: '#22c55e',
      strictTracking: false,
    });
    const todayDose = service.getDoses().find((dose) => dose.scheduledAt.startsWith(startDate))!;
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 1, 0, 0);

    const refreshed = service.refreshDoses(tomorrow);

    expect(refreshed.find((dose) => dose.id === todayDose.id)?.status).toBe('missed');
  });
});
