/**
 * Mala key-value baza na uređaju (IndexedDB) za lokalnu kopiju podataka -
 * radi na Android-u i iPhone-u, i bez interneta.
 *
 * Kopija služi SAMO za čitanje: baza (Supabase) je uvek glavni izvor, a ovde
 * se pamti poslednje viđeno stanje da bi aplikacija imala šta da prikaže kad
 * nema interneta. Svaka greška (privatni prozor, pun disk, stari browser) se
 * tiho ignoriše - aplikacija tada radi kao bez kopije.
 */

const DB_NAME = 'fuelscan';
const STORE = 'cache';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const request = op(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export function cacheGet<T>(key: string): Promise<T | undefined> {
  return run<T>('readonly', (store) => store.get(key) as IDBRequest<T>);
}

export async function cacheSet(key: string, value: unknown): Promise<void> {
  await run('readwrite', (store) => store.put(value, key));
}

export async function cacheDelete(key: string): Promise<void> {
  await run('readwrite', (store) => store.delete(key));
}

/** Sadržaj kopije + kad je poslednji put potvrđen iz baze. */
export interface CacheEntry<T> {
  savedAt: string;
  data: T;
}

/** Ključ po korisniku - drugi korisnik na istom telefonu nikad ne vidi tuđu kopiju. */
export function userCacheKey(kind: 'receipts' | 'nicknames', userId: string): string {
  return `${kind}:${userId}`;
}

/**
 * Traži od browsera da podatke sajta ne briše sam kad mu ponestane prostora
 * (Android) - bez toga lokalna kopija može nestati bez upozorenja.
 */
export function requestPersistentStorage(): void {
  try {
    const storage = navigator.storage;
    if (!storage?.persist || !storage.persisted) return;
    void storage
      .persisted()
      .then((already) => (already ? undefined : storage.persist()))
      .catch(() => undefined);
  } catch {
    // Nije podržano - kopija i dalje radi, samo bez garancije.
  }
}
