import { prepareZXingModule, writeBarcode } from 'zxing-wasm/writer';

import { detectQrFromFile } from './qr-detector';

// Realističan URL sa fiskalnog računa (dug `vl` parametar -> gust QR kod).
const RECEIPT_URL =
  'https://suf.purs.gov.rs/v/?vl=A1o3QkRaVlo5QlI3NEgyWjlCUjc0SDJ0HAAAZhwAAIDZxgEAAAAAAAABl8rdJ4MAAAAPpH%2FnPh2X6l8YhGyb0rB7xH5mNQ1v2tJpP3w0dQnG8a7Lk2iF4yR9sV6cU1oE0bW3zA5xD8fC2gH7jK4lM6nP9qR1sT3uV5wX7yZ0aB2cD4eF6gH8iJ0kL2mN4oP6qR8sT0uV2wX4yZ6aB8cD0eF2gH4iJ6kL8mN0oP2qR4sT6uV8wX0yZ2aB4cD6eF8gH0iJ2kL4mN6oP8qR0sT2uV4wX6yZ8aB0cD2eF4gH6iJ8kL0mN2oP4qR6sT8uV0wX2yZ4aB6cD8eF0gH2iJ4kL6mN8oP0qR2sT4uV6wX8yZ0aB2c%3D';

async function qrPng(text: string, scale: number): Promise<Blob> {
  prepareZXingModule({
    overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? `/assets/zxing/${path}` : prefix + path) },
  });
  const result = await writeBarcode(text, { format: 'QRCode', scale, ecLevel: 'L' });
  if (!result.image) throw new Error(result.error);
  return result.image;
}

/** Simulira fotografiju telefonom: veliki kadar, QR mali u sredini, blago siv/šumovit papir. */
async function asPhoto(qr: Blob, width: number, height: number): Promise<Blob> {
  const bitmap = await createImageBitmap(qr);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#d9d6cf';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#f4f2ec';
  ctx.fillRect(width * 0.2, 0, width * 0.6, height);
  ctx.drawImage(bitmap, (width - bitmap.width) / 2, (height - bitmap.height) / 2);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.85));
}

describe('qr-detector', () => {
  it('dekodira gust QR sa fiskalnog računa iz slike', async () => {
    const png = await qrPng(RECEIPT_URL, 4);
    expect(await detectQrFromFile(png)).toBe(RECEIPT_URL);
  });

  it('dekodira QR koji je mali deo velike fotografije (12MP)', async () => {
    const png = await qrPng(RECEIPT_URL, 6);
    const photo = await asPhoto(png, 3000, 4000);
    expect(await detectQrFromFile(photo)).toBe(RECEIPT_URL);
  });

  it('vraća null kad na slici nema QR koda', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const blank = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
    expect(await detectQrFromFile(blank)).toBeNull();
  });
});
