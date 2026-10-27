import { Injectable, signal } from '@angular/core';
import type { User } from '@supabase/supabase-js';

import { SUPABASE_URL } from '../config/app-config';
import { supabaseClient } from '../supabase/supabase-client';

/** Ključ pod kojim supabase-js čuva sesiju u localStorage (`sb-<ref>-auth-token`). */
const SESSION_STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

/**
 * Prijava preko Supabase-a, izložena kroz signale.
 *
 * Offline: pristupni token važi ~1h i obnavlja se preko mreže. Bez interneta
 * (pumpa bez signala) obnova ne uspe i supabase-js vrati "nema sesije", pa bi
 * korisnik bio izbačen na welcome i ne bi mogao ni da stavi račun u offline
 * red. Zato se tada koristi korisnik iz sačuvane sesije (sesija NIJE
 * poništena - samo nije mogla da se obnovi), a prava provera se radi čim se
 * veza vrati.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  /** Trenutno ulogovan korisnik, ili `null` ako niko nije prijavljen. */
  readonly currentUser = signal<User | null>(null);

  /** `true` čim je inicijalna sesija proverena. */
  readonly isAuthReady = signal(false);

  /** `true` dok se koristi sačuvana (neproverena) sesija jer nema interneta. */
  readonly offlineSession = signal(false);

  private initialized = false;

  /** Poziva se jednom pri startu aplikacije (vidi `provideAppInitializer` u app.config.ts). */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    supabaseClient.auth.onAuthStateChange((event, session) => {
      // Dok smo offline, "nema sesije" znači "nije mogla da se obnovi", ne odjavu.
      if (!session && event !== 'SIGNED_OUT' && this.offlineSession()) {
        return;
      }
      if (session) {
        this.offlineSession.set(false);
      }
      this.currentUser.set(session?.user ?? null);
    });

    window.addEventListener('online', () => void this.revalidate());

    if (!navigator.onLine && this.useStoredSession()) {
      // Bez mreže getSession() bi čekao na neuspelu obnovu tokena - ne blokiraj start aplikacije.
      this.isAuthReady.set(true);
      return;
    }

    await this.revalidate();
    this.isAuthReady.set(true);
  }

  private async revalidate(): Promise<void> {
    const { data, error } = await supabaseClient.auth.getSession();
    const user = error ? null : (data.session?.user ?? null);

    // "Ima mreže" po browseru ne znači i da internet radi (slab signal na pumpi):
    // mrežna greška pri obnovi tokena se tretira isto kao offline.
    const networkFailure = !navigator.onLine || error?.name === 'AuthRetryableFetchError';
    if (!user && networkFailure && this.useStoredSession()) {
      return;
    }
    this.offlineSession.set(false);
    this.currentUser.set(user);
  }

  /** Postavlja korisnika iz sačuvane sesije; `false` ako sesije nema. */
  private useStoredSession(): boolean {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      const user = raw ? (JSON.parse(raw) as { user?: User }).user : undefined;
      if (!user?.id) return false;
      this.currentUser.set(user);
      this.offlineSession.set(true);
      return true;
    } catch {
      return false;
    }
  }

  async signInWithGoogle(): Promise<void> {
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) {
      throw error;
    }
  }

  /**
   * Odjava. Bez interneta server ne može da poništi sesiju, ali odjava na ovom
   * uređaju mora uvek da uspe - tada se briše samo lokalna sesija
   * (refresh token na serveru ionako ističe sam).
   */
  async signOut(): Promise<void> {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
      const local = await supabaseClient.auth.signOut({ scope: 'local' });
      if (local.error) {
        throw local.error;
      }
    }
    this.offlineSession.set(false);
    this.currentUser.set(null);
  }

  /** Ime za pozdravnu poruku na dashboard-u (isto ponašanje kao `handleSignedInUI`). */
  greetingName(): string {
    const user = this.currentUser();
    const fullName = (user?.user_metadata?.['full_name'] as string | undefined) ?? '';
    return fullName.split(' ')[0] || 'Korisnik';
  }

  avatarUrl(): string {
    const user = this.currentUser();
    return (user?.user_metadata?.['avatar_url'] as string | undefined) ?? '';
  }
}
