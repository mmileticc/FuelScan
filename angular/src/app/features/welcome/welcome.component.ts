import { Component, inject } from '@angular/core';

import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';

/** Rekonstrukcija `#screen-welcome` iz `old-vanilla/index.html`. */
@Component({
  selector: 'app-welcome',
  standalone: true,
  template: `
    <section class="max-w-md mx-auto px-4 py-8 flex flex-col justify-between min-h-[calc(100vh-4rem)]">
      <div class="text-center my-auto space-y-4">
        <div class="inline-flex p-3 bg-fuel-500/10 rounded-2xl border border-fuel-500/20 text-fuel-400 mb-2">
          <img src="assets/icon-512x512.png" alt="FuelScan Logo" class="w-24 h-24 rounded-xl" />
        </div>
        <h1 class="text-3xl font-extrabold tracking-tight text-white">FuelScan</h1>
        <p class="text-slate-400 text-sm max-w-xs mx-auto">
          Automatski pratite potrošnju goriva, cene i statistiku jednostavnim skeniranjem QR koda sa fiskalnog računa.
        </p>
      </div>

      <div class="bg-surface-card border border-surface-border rounded-2xl p-5 my-6 space-y-4 text-left">
        <h3 class="text-xs font-bold uppercase tracking-wider text-fuel-400 mb-2">Kako funkcioniše?</h3>

        <div class="flex gap-3 items-start">
          <div class="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold font-mono text-slate-300 shrink-0">1</div>
          <div>
            <h4 class="text-sm font-semibold text-white">Prijavite se bezbedno</h4>
            <p class="text-xs text-slate-400">Koristite svoj Google nalog kako bi vaši računi bili sačuvani samo za vas.</p>
          </div>
        </div>

        <div class="flex gap-3 items-start">
          <div class="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold font-mono text-slate-300 shrink-0">2</div>
          <div>
            <h4 class="text-sm font-semibold text-white">Skenirajte QR kod</h4>
            <p class="text-xs text-slate-400">Otvorite kameru unutar aplikacije i usmerite je ka QR kodu na dnu fiskalnog računa sa benzinske pumpe.</p>
          </div>
        </div>

        <div class="flex gap-3 items-start">
          <div class="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold font-mono text-slate-300 shrink-0">3</div>
          <div>
            <h4 class="text-sm font-semibold text-white">Pratite troškove i litre</h4>
            <p class="text-xs text-slate-400">Aplikacija sama prepoznaje količinu, cenu i pumpu. Dashboard vam odmah računa mesečnu potrošnju i poređenje sa prošlim mesecom.</p>
          </div>
        </div>
      </div>

      <div class="w-full space-y-3">
        <button
          type="button"
          (click)="login()"
          class="w-full bg-fuel-600 hover:bg-fuel-500 text-white font-bold py-3.5 px-4 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 text-sm"
        >
          Započni prijavom preko Google-a
        </button>
        <p class="text-[10px] text-center text-slate-500">
          * Podaci sa vaših računa se bezbedno čuvaju u bazi i niko osim vas ih ne može videti.
        </p>
      </div>
    </section>
  `,
})
export class WelcomeComponent {
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  async login(): Promise<void> {
    try {
      await this.auth.signInWithGoogle();
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : 'Greška pri prijavi.', 'error');
    }
  }
}
