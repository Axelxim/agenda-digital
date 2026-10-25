import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { AgendaStorageService } from './agenda-storage.service';
import { QuickNote, QuickNoteDraft } from './note.model';

@Injectable({ providedIn: 'root' })
export class NoteService {
  private readonly agendaStorage = inject(AgendaStorageService);
  private readonly storageKey = 'agenda-quick-notes-v1';
  private notes: QuickNote[] = [];
  private readonly changesSubject = new Subject<QuickNote[]>();
  readonly changes$ = this.changesSubject.asObservable();

  load(): QuickNote[] {
    try {
      const stored = JSON.parse(localStorage.getItem(this.storageKey) ?? '[]') as Partial<QuickNote>[];
      this.notes = Array.isArray(stored) ? stored.map((note) => this.normalize(note)) : [];
    } catch {
      this.notes = [];
    }
    this.persistLocal();
    return this.getAll();
  }

  async initializePersistence(): Promise<QuickNote[]> {
    try {
      const stored = await this.agendaStorage.initializeNotes(this.notes);
      this.notes = stored.map((note) => this.normalize(note));
      this.persistLocal();
    } catch (error) {
      console.error('No fue posible inicializar las notas en SQLite; se conserva el respaldo local.', error);
    }
    return this.getAll();
  }

  getAll(): QuickNote[] {
    return this.sort(this.notes).map((note) => ({ ...note }));
  }

  save(draft: QuickNoteDraft, id?: string): QuickNote[] {
    const title = draft.title.trim();
    const content = draft.content.trim();
    if (!title && !content) return this.getAll();

    const now = new Date().toISOString();
    if (id) {
      this.notes = this.notes.map((note) => note.id === id
        ? { ...note, title, content, updatedAt: now }
        : note);
    } else {
      this.notes.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        title,
        content,
        createdAt: now,
        updatedAt: now,
      });
    }
    this.persist();
    return this.getAll();
  }

  delete(id: string): QuickNote[] {
    this.notes = this.notes.filter((note) => note.id !== id);
    this.persist();
    return this.getAll();
  }

  replaceFromSync(notes: QuickNote[]): QuickNote[] {
    this.notes = notes.map((note) => this.normalize(note));
    this.persistLocal();
    void this.agendaStorage.saveNotes(this.notes);
    this.changesSubject.next(this.getAll());
    return this.getAll();
  }

  private normalize(note: Partial<QuickNote>): QuickNote {
    const now = new Date().toISOString();
    return {
      id: String(note.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`),
      title: String(note.title ?? '').trim(),
      content: String(note.content ?? '').trim(),
      createdAt: String(note.createdAt ?? now),
      updatedAt: String(note.updatedAt ?? note.createdAt ?? now),
    };
  }

  private sort(notes: QuickNote[]): QuickNote[] {
    return [...notes].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  private persist(): void {
    this.persistLocal();
    void this.agendaStorage.saveNotes(this.notes);
    this.changesSubject.next(this.getAll());
  }

  private persistLocal(): void {
    localStorage.setItem(this.storageKey, JSON.stringify(this.notes));
  }
}
