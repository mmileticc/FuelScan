import writeExcelFile from 'write-excel-file/browser';

import { FuelReceiptRecord } from '../../core/models/receipt.model';
import { buildReceiptsSheet } from './receipts-export';

function receipt(partial: Partial<FuelReceiptRecord>): FuelReceiptRecord {
  return {
    id: 'r1',
    user_id: 'u1',
    invoice_number: 'AB12-AB12-1',
    station: 'SPOONIT DOO PS 3',
    fuel_type: 'EVRO DIZEL',
    liters: 40.5,
    price_per_l: 205.9,
    total: 8338.95,
    date: '2026-10-20T14:32:10+02:00',
    raw_url: null,
    address: 'Cara Dušana 120',
    city: 'Beograd',
    municipality: null,
    ...partial,
  };
}

describe('Excel izvoz', () => {
  it('pravi zaglavlje, redove sa brojevima/datumima i red sa zbirom', () => {
    const sheet = buildReceiptsSheet([receipt({}), receipt({ id: 'r2', liters: 10, total: 2000 })], (r) =>
      r.id === 'r1' ? 'Kod mosta' : null,
    );

    expect(sheet.length).toBe(4);
    expect((sheet[0][0] as { value: string }).value).toBe('Datum');
    const first = sheet[1] as Array<{ value: unknown; type?: unknown } | null>;
    expect(first[0]?.type).toBe(Date);
    // Lokalno vreme sa računa, ne pomereno za zonu.
    expect((first[0]?.value as Date).getUTCHours()).toBe(new Date('2026-10-20T14:32:10+02:00').getHours());
    expect(first[1]?.value).toBe('Kod mosta');
    expect(first[2]?.value).toBe('SPOONIT DOO PS 3');
    expect(first[6]?.value).toBe(40.5);
    expect((sheet[2] as Array<{ value: unknown } | null>)[1]?.value).toBe('SPOONIT DOO PS 3');

    const total = sheet[3] as Array<{ value?: unknown }>;
    expect(total[0].value).toBe('Ukupno (2)');
    expect(total[6].value).toBe(50.5);
    expect(total[8].value).toBeCloseTo(10338.95, 2);
  });

  it('pravi ispravan .xlsx fajl', async () => {
    const blob = await writeExcelFile(buildReceiptsSheet([receipt({})]), { sheet: 'Točenja', stickyRowsCount: 1 }).toBlob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    // .xlsx je ZIP arhiva - počinje sa "PK".
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe('PK');
    expect(blob.size).toBeGreaterThan(1000);
  });
});
