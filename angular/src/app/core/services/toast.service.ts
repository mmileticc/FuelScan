import { Injectable, signal } from '@angular/core';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastMessage {
  id: number;
  message: string;
  type: ToastType;
}

/**
 * Prenos `showToast` iz `old-vanilla/js/ui/common.js` u Angular servis.
 * Umesto direktne DOM manipulacije, drži se `signal` koji AppComponent
 * prikazuje preko toast trake u shell-u.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toast = signal<ToastMessage | null>(null);

  private counter = 0;
  private timer?: ReturnType<typeof setTimeout>;

  show(message: string, type: ToastType = 'info', duration = 3000): void {
    clearTimeout(this.timer);

    const id = ++this.counter;
    this.toast.set({ id, message, type });

    this.timer = setTimeout(() => {
      if (this.toast()?.id === id) {
        this.toast.set(null);
      }
    }, duration);
  }
}
