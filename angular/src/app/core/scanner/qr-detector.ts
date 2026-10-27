/**
 * QR dekoder za kameru i fotografije.
 *
 * Redosled:
 *   1. Nativni `BarcodeDetector` (Android Chrome, deo Safari verzija) - brz, radi
 *      na GPU/ML Kit-u i odlično čita guste kodove.
 *   2. Ako nativnog nema (iOS, desktop Firefox...) - ZXing (WASM) ponyfill iz
 *      paketa `barcode-detector`. Učitava se lenjo, tek kad zatreba, a `.wasm`
 *      se služi iz `assets/zxing/` (kopira ga angular.json), pa radi i offline.
 *
 * Fiskalni QR je gust (dug URL), pa za fotografije pokušavamo više varijanti
 * istog kadra (ceo, umanjen, centralni isečak) - pun 12MP kadar ume da
 * promaši dekoder, a umanjen ili isečen uspe.
 */

interface DetectedCode {
  rawValue: string;
}

interface Detector {
  detect(source: ImageBitmapSource): Promise<DetectedCode[]>;
}

interface BarcodeDetectorCtor {
  new (options?: { formats: string[] }): Detector;
  getSupportedFormats?(): Promise<string[]>;
}

let nativePromise: Promise<Detector | null> | null = null;
let zxingPromise: Promise<Detector> | null = null;

function getNativeDetector(): Promise<Detector | null> {
  nativePromise ??= (async () => {
    const Ctor = (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    if (!Ctor) return null;
    try {
      const formats = (await Ctor.getSupportedFormats?.()) ?? ['qr_code'];
      return formats.includes('qr_code') ? new Ctor({ formats: ['qr_code'] }) : null;
    } catch {
      return null;
    }
  })();
  return nativePromise;
}

function getZxingDetector(): Promise<Detector> {
  zxingPromise ??= import('barcode-detector/ponyfill').then(({ BarcodeDetector, prepareZXingModule }) => {
    const wasmBase = new URL('assets/zxing/', document.baseURI).href;
    prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmBase + path : prefix + path),
      },
    });
    return new BarcodeDetector({ formats: ['qr_code'] }) as unknown as Detector;
  });
  return zxingPromise;
}

/** Glavni dekoder za živu kameru (nativni ako postoji, inače ZXing). */
async function primaryDetector(): Promise<Detector> {
  return (await getNativeDetector()) ?? getZxingDetector();
}

/** Učitava dekoder unapred (da prvi kadar ne čeka na WASM). */
export function warmUpQrDetector(): void {
  void primaryDetector().catch(() => undefined);
}

async function detectWith(detector: Detector, source: ImageBitmapSource): Promise<string | null> {
  try {
    const codes = await detector.detect(source);
    return codes.find((c) => !!c.rawValue)?.rawValue ?? null;
  } catch {
    return null;
  }
}

/** Jedan pokušaj nad trenutnim izvorom (kadar videa, canvas, bitmap). */
export async function detectQr(source: ImageBitmapSource): Promise<string | null> {
  return detectWith(await primaryDetector(), source);
}

/**
 * Isečak centralnog dela izvora u canvas. `scale` > 1 uvećava isečak (pomaže
 * kad je kod mali u kadru), `fraction` je deo kraće stranice koji se uzima.
 */
export function cropCenter(
  source: CanvasImageSource,
  width: number,
  height: number,
  fraction: number,
  scale = 1,
  canvas: HTMLCanvasElement = document.createElement('canvas'),
): HTMLCanvasElement {
  const side = Math.round(Math.min(width, height) * fraction);
  const sx = Math.round((width - side) / 2);
  const sy = Math.round((height - side) / 2);
  const out = Math.round(side * scale);
  if (canvas.width !== out) canvas.width = out;
  if (canvas.height !== out) canvas.height = out;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx?.drawImage(source, sx, sy, side, side, 0, 0, out, out);
  return canvas;
}

function resizeTo(source: ImageBitmap, maxSide: number): HTMLCanvasElement {
  const ratio = Math.min(1, maxSide / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(source.width * ratio);
  canvas.height = Math.round(source.height * ratio);
  canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Dekodira QR sa fotografije (nativna kamera telefona ili galerija). Pokušava
 * više varijanti i oba dekodera pre nego što odustane.
 */
export async function detectQrFromFile(file: Blob): Promise<string | null> {
  let bitmap: ImageBitmap;
  try {
    // `imageOrientation: 'from-image'` poštuje EXIF rotaciju sa telefona.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return null;
  }

  try {
    const { width, height } = bitmap;
    const variants: Array<() => ImageBitmapSource> = [
      () => bitmap,
      () => resizeTo(bitmap, 1600),
      () => cropCenter(bitmap, width, height, 0.6),
      () => resizeTo(bitmap, 1000),
      () => cropCenter(bitmap, width, height, 0.4, 2),
    ];

    const detectors: Detector[] = [];
    const native = await getNativeDetector();
    if (native) detectors.push(native);
    detectors.push(await getZxingDetector());

    for (const detector of detectors) {
      for (const variant of variants) {
        const result = await detectWith(detector, variant());
        if (result) return result;
      }
    }
    return null;
  } finally {
    bitmap.close();
  }
}
