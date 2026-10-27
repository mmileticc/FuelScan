import {
  belgradeOffset,
  cleanStationName,
  detectFuel,
  isSufReceiptUrl,
  normalizeText,
  parseLocalReceiptDate,
  parseNumber,
} from './receipt-parsing.utils';

describe('receipt-parsing.utils', () => {
  describe('detectFuel', () => {
    const cases: Array<[string, string | null]> = [
      ['EVRO DIZEL', 'Dizel'],
      ['EURODIESEL/L', 'Dizel'],
      ['MaxxMotion Diesel', 'Dizel'],
      ['OMV Diesel', 'Dizel'],
      ['G-DRIVE DIESEL', 'Dizel'],
      ['ЕВРО ДИЗЕЛ', 'Dizel'],
      ['EVO D', 'Dizel'],
      ['BMB 95', 'Benzin'],
      ['BMB95', 'Benzin'],
      ['G-DRIVE 100', 'Benzin'],
      ['V-Power 100', 'Benzin'],
      ['Benzin Premium 98', 'Benzin'],
      ['ТНГ', 'TNG'],
      ['AUTOGAS', 'TNG'],
      ['LPG', 'TNG'],
      ['CNG', 'CNG'],
      ['AdBlue 10L', null],
      ['PREMIUM KAFA', null],
      ['COCA COLA 0.5', null],
      ['VEGAS CIGARETE', null],
      ['MOTORNO ULJE 5W30 DIESEL', null],
    ];

    for (const [name, category] of cases) {
      it(`"${name}" -> ${category ?? 'nije gorivo'}`, () => {
        const result = detectFuel(name);
        expect(result.category).toBe(category as never);
        expect(result.isFuel).toBe(category !== null);
      });
    }

    it('vraća "nije gorivo" za prazan naziv', () => {
      expect(detectFuel(null).isFuel).toBeFalse();
      expect(detectFuel('').isFuel).toBeFalse();
    });
  });

  describe('parseNumber', () => {
    it('parsira srpski format', () => {
      expect(parseNumber('1.234,56')).toBe(1234.56);
      expect(parseNumber('45,10')).toBe(45.1);
      expect(parseNumber(12.5)).toBe(12.5);
    });

    it('vraća null za nevalidno', () => {
      expect(parseNumber('abc')).toBeNull();
      expect(parseNumber(null)).toBeNull();
    });
  });

  describe('parseLocalReceiptDate', () => {
    it('dodaje letnji offset (+02:00)', () => {
      expect(parseLocalReceiptDate('18.6.2026. 11:14:31')).toBe('2026-06-18T11:14:31+02:00');
    });

    it('dodaje zimski offset (+01:00)', () => {
      expect(parseLocalReceiptDate('3.1.2026. 7:05:00')).toBe('2026-01-03T07:05:00+01:00');
    });

    it('točenje u ponoć ostaje u istom mesecu kad se pročita kao Date', () => {
      const iso = parseLocalReceiptDate('1.7.2026. 00:30:00') as string;
      const utc = new Date(iso);
      expect(utc.toISOString()).toBe('2026-06-30T22:30:00.000Z');
    });

    it('ne dira već ISO datum', () => {
      expect(parseLocalReceiptDate('2026-06-18T11:14:31+02:00')).toBe('2026-06-18T11:14:31+02:00');
    });

    it('belgradeOffset', () => {
      expect(belgradeOffset(2026, 8, 1)).toBe('+02:00');
      expect(belgradeOffset(2026, 12, 1)).toBe('+01:00');
    });
  });

  describe('isSufReceiptUrl', () => {
    it('prihvata pravi URL računa', () => {
      expect(isSufReceiptUrl('https://suf.purs.gov.rs/v/?vl=A1B2C3')).toBeTrue();
    });

    it('odbija druge domene i trikove', () => {
      expect(isSufReceiptUrl('https://evil.com/?suf.purs.gov.rs')).toBeFalse();
      expect(isSufReceiptUrl('https://suf.purs.gov.rs.evil.com/v/')).toBeFalse();
      expect(isSufReceiptUrl('http://suf.purs.gov.rs/v/')).toBeFalse();
      expect(isSufReceiptUrl('nije url')).toBeFalse();
      expect(isSufReceiptUrl(null)).toBeFalse();
    });
  });

  describe('tekst', () => {
    it('transliteruje ćirilicu', () => {
      expect(normalizeText('Љубљанска Џ')).toBe('Ljubljanska Dž');
    });

    it('čisti broj stanice', () => {
      expect(cleanStationName('1249582-CAMPER GALERIJA')).toBe('CAMPER GALERIJA');
    });
  });
});
