import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class StorageService {
  read(key: string): { value: unknown } | null {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? null : { value: JSON.parse(raw) };
    } catch (cause) {
      throw new Error('No se pudieron leer los datos guardados en este navegador.', { cause });
    }
  }

  write(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (cause) {
      throw new Error('No se pudieron guardar los cambios en este navegador.', { cause });
    }
  }
}
