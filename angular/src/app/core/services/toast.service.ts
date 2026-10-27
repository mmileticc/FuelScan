import { Injectable, signal } from '@angular/core';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastAction {
  label: string;
  handler: () => void;
}

export interface ToastMessage {
  id: number;
  message: string;
  type: ToastType;
  action?: ToastAction;
}

/**
 * Jedna toast poruka u shell-u (`app.html`). Opciono nosi dugme akcije
 * (npr. "Poništi" posle brisanja).
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toast = signal<ToastMessage | null>(null);

  private counter = 0;
  private timer?: ReturnType<typeof setTimeout>;

  show(message: string, type: ToastType = 'info', duration = 3000, action?: ToastAction): void {
    clearTimeout(this.timer);

    const id = ++this.counter;
    this.toast.set({ id, message, type, action });

    this.timer = setTimeout(() => {
      if (this.toast()?.id === id) {
        this.toast.set(null);
      }
    }, duration);
  }

  /** Klik na dugme akcije - izvrši je i skloni toast. */
  runAction(): void {
    const current = this.toast();
    clearTimeout(this.timer);
    this.toast.set(null);
    current?.action?.handler();
  }

  dismiss(): void {
    clearTimeout(this.timer);
    this.toast.set(null);
  }
}
