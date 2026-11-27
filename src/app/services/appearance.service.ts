import { DOCUMENT } from '@angular/common';
import { DestroyRef, Inject, Injectable, signal } from '@angular/core';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';

import { StorageService } from './storage.service';

export type AppearancePreference = 'system' | 'light' | 'dark';

const storageKey = 'habitflow.appearance.v1';

function isAppearancePreference(value: unknown): value is AppearancePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

@Injectable({ providedIn: 'root' })
export class AppearanceService {
  private readonly selected = signal<AppearancePreference>('system');
  private readonly writeFailed = signal(false);
  private readonly system: MediaQueryList | undefined;
  readonly preference = this.selected.asReadonly();
  readonly notSaved = this.writeFailed.asReadonly();

  constructor(
    @Inject(DOCUMENT) private readonly document: Document,
    private readonly storage: StorageService,
    destroyRef: DestroyRef,
  ) {
    this.system = document.defaultView?.matchMedia('(prefers-color-scheme: dark)');
    destroyRef.onDestroy(() => this.system?.removeEventListener('change', this.apply));
  }

  initialize(): void {
    try {
      const value = this.storage.read(storageKey)?.value;
      if (isAppearancePreference(value)) this.selected.set(value);
    } catch {
      // Si el navegador bloquea el almacenamiento, la apariencia sigue al sistema.
    }
    this.apply();
    this.system?.addEventListener('change', this.apply);
  }

  select(value: unknown): void {
    if (!isAppearancePreference(value)) return;
    this.selected.set(value);
    this.apply();
    try {
      this.storage.write(storageKey, value);
      this.writeFailed.set(false);
    } catch {
      this.writeFailed.set(true);
    }
  }

  private readonly apply = () => {
    const preference = this.preference();
    const dark = preference === 'dark' || (preference === 'system' && this.system?.matches === true);
    this.document.documentElement.classList.toggle('ion-palette-dark', dark);
    if (Capacitor.getPlatform() !== 'android') return;

    const window = this.document.defaultView;
    window?.requestAnimationFrame(() => {
      // Si el WebView termina antes de la barra, su fondo y sus iconos siguen el tema de Android.
      const inset = window.getComputedStyle(this.document.documentElement).getPropertyValue('--ion-safe-area-top');
      const style = preference === 'system' || !(parseFloat(inset) > 0) ? SystemBarsStyle.Default
        : dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light;
      void SystemBars.setStyle({ style }).catch((error: unknown) =>
        console.warn('No se pudo aplicar la apariencia a las barras de Android.', error));
    });
  };
}
