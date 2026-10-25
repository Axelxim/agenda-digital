import { TestBed } from '@angular/core/testing';
import { NoteService } from './note.service';

describe('NoteService', () => {
  let service: NoteService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(NoteService);
    service.load();
  });

  it('creates and restores a quick note', () => {
    const notes = service.save({ title: 'Idea', content: 'Preparar la presentación' });

    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe('Idea');
    expect(notes[0].content).toBe('Preparar la presentación');
    expect(service.load()[0].id).toBe(notes[0].id);
  });

  it('updates and deletes a note', () => {
    const note = service.save({ title: 'Pendiente', content: '' })[0];
    const updated = service.save({ title: 'Actualizada', content: 'Texto' }, note.id);

    expect(updated[0].title).toBe('Actualizada');
    expect(service.delete(note.id)).toEqual([]);
  });

  it('does not create an empty note', () => {
    expect(service.save({ title: '  ', content: '\n' })).toEqual([]);
  });
});
