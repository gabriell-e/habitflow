import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class StorageService {
  read(key: string): { value: unknown } | null {
    let raw: string | null;
    try {
      raw = localStorage.getItem(key);
    } catch (cause) {
      throw new Error('No se pudieron leer los datos guardados en este navegador.', { cause });
    }
    if (raw === null) return null;
    try {
      return { value: JSON.parse(raw) };
    } catch (cause) {
      throw new Error('Los datos guardados no contienen un JSON válido.', { cause });
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
