import { DOCUMENT } from '@angular/common';
import { DestroyRef, Inject, Injectable, signal } from '@angular/core';

import { localDateKey } from '../models/habit-record.model';

@Injectable({ providedIn: 'root' })
export class LocalCalendarService {
  private readonly date = signal(localDateKey());
  readonly today = this.date.asReadonly();

  constructor(@Inject(DOCUMENT) document: Document, destroyRef: DestroyRef) {
    const window = document.defaultView;
    if (!window) return;

    let timeout = 0;
    const refresh = () => {
      const now = new Date();
      this.date.set(localDateKey(now));
      const tomorrow = new Date(now);
      tomorrow.setHours(24, 0, 0, 0);
      window.clearTimeout(timeout);
      timeout = window.setTimeout(refresh, Math.max(1, tomorrow.getTime() - now.getTime()));
    };

    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    destroyRef.onDestroy(() => {
      window.clearTimeout(timeout);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    });
  }
}
