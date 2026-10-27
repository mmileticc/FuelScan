/**
 * Pretvara greške iz mreže / Supabase-a u poruke za korisnika na srpskom.
 * Sirove poruke ("Failed to fetch", "new row violates row-level security
 * policy"...) nikad ne idu direktno u UI.
 */

interface ErrorLike {
  message?: string;
  code?: string;
  name?: string;
  status?: number;
}

export const OFFLINE_MESSAGE = 'Nema internet veze. Prikazani su poslednji učitani podaci.';

/** `true` za grešku koja znači "nema mreže / server nedostupan". */
export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  const e = (err ?? {}) as ErrorLike;
  const message = (e.message ?? String(err ?? '')).toLowerCase();
  return (
    e.name === 'AuthRetryableFetchError' ||
    (err instanceof TypeError && /fetch|network|load failed/.test(message)) ||
    /failed to fetch|networkerror|network request failed|load failed/.test(message)
  );
}

/**
 * Poruka za korisnika. `action` opisuje šta nije uspelo ("čuvanju", "brisanju"...)
 * i koristi se za opštu poruku kad greška nije prepoznata.
 */
export function friendlyError(err: unknown, action: string): string {
  if (isNetworkError(err)) {
    return 'Nema internet veze. Pokušajte ponovo kad se veza vrati.';
  }
  const e = (err ?? {}) as ErrorLike;
  const message = (e.message ?? '').toLowerCase();

  if (e.code === '23505') return 'Ovaj račun je već sačuvan.';
  if (e.code === '42501' || message.includes('row-level security') || e.status === 401 || e.status === 403) {
    return 'Sesija je istekla ili nemate dozvolu. Odjavite se i prijavite ponovo.';
  }
  if (e.code === '23514' || e.code === '22P02' || e.code === '22003') {
    return 'Neka od unetih vrednosti nije ispravna. Proverite podatke.';
  }
  // Naše sopstvene poruke (već na srpskom) prolaze neizmenjene.
  if (err instanceof Error && !e.code && /[čćšžđ]|račun|korisnik|nadimak/i.test(err.message)) {
    return err.message;
  }
  return `Greška pri ${action}. Pokušajte ponovo.`;
}
