/**
 * Signal korisniku da je QR kod prepoznat: vibracija (Android) + kratak "bip".
 *
 * iPhone ne dozvoljava web aplikacijama da vibriraju, a zvuk sme da pusti tek
 * posle dodira korisnika. Zato se audio "otključava" na prvom dodiru bilo gde
 * u aplikaciji (npr. tap na "Skeniraj" u navigaciji) - kad kamera kasnije sama
 * prepozna kod, bip može da se čuje i bez novog dodira.
 */

let audioContext: AudioContext | null = null;
let primed = false;

type AudioContextCtor = typeof AudioContext;

function createContext(): AudioContext | null {
  const Ctor =
    (globalThis as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor }).AudioContext ??
    (globalThis as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

/** Poziva se jednom pri startu aplikacije. */
export function primeScanFeedbackOnFirstGesture(): void {
  if (primed || typeof document === 'undefined') return;
  primed = true;

  const unlock = () => {
    audioContext ??= createContext();
    if (audioContext?.state === 'suspended') {
      void audioContext.resume().catch(() => undefined);
    }
    // Nečujan kratak zvuk - iOS tek tada smatra audio "otključanim".
    if (audioContext) {
      const buffer = audioContext.createBuffer(1, 1, 22050);
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.start(0);
    }
    document.removeEventListener('pointerdown', unlock, true);
    document.removeEventListener('touchend', unlock, true);
  };

  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('touchend', unlock, true);
}

/** Kratak, tih "bip" (~120ms, 1320Hz). Tiho ne radi ništa ako audio nije dostupan. */
export function playScanBeep(): void {
  const ctx = audioContext;
  if (!ctx || ctx.state !== 'running') return;
  try {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 1320;
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.13);
  } catch {
    // Zvuk je samo dodatak - nikad ne sme da prekine skeniranje.
  }
}

/** Vibracija gde je podržana (Android) + bip (svuda gde je audio otključan). */
export function scanSuccessFeedback(): void {
  try {
    navigator.vibrate?.(80);
  } catch {
    // iOS / desktop - nema vibracije.
  }
  playScanBeep();
}
