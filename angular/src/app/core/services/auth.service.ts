import { Injectable, signal } from '@angular/core';
import type { User } from '@supabase/supabase-js';

import { supabaseClient } from '../supabase/supabase-client';

/**
 * Prenos `old-vanilla/js/auth.js` u Angular servis sa signalima
 * (umesto ručnog niza callback-ova `onAuthReady`).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  /** Trenutno ulogovan korisnik, ili `null` ako niko nije prijavljen. */
  readonly currentUser = signal<User | null>(null);

  /** `true` čim je inicijalna sesija proverena (isto kao `isAuthReady()` u starom kodu). */
  readonly isAuthReady = signal(false);

  private initialized = false;

  /**
   * Poziva se jednom pri startu aplikacije (vidi `provideAppInitializer` u app.config.ts).
   * Ekvivalent `await initAuth()` iz starog `main.js`.
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    const { data, error } = await supabaseClient.auth.getSession();
    this.currentUser.set(error ? null : (data.session?.user ?? null));
    this.isAuthReady.set(true);

    supabaseClient.auth.onAuthStateChange((_event, session) => {
      this.currentUser.set(session?.user ?? null);
    });
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

  async signOut(): Promise<void> {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
      throw error;
    }
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
