import { fromDateTimeLocal, toDateTimeLocal } from './receipt-form.component';

describe('receipt-form datum', () => {
  it('čuva sekunde sa računa', () => {
    expect(fromDateTimeLocal('2026-06-18T11:14:31')).toBe('2026-06-18T11:14:31+02:00');
    expect(fromDateTimeLocal('2026-01-03T07:05')).toBe('2026-01-03T07:05:00+01:00');
  });

  it('toDateTimeLocal daje sekunde za input step=1', () => {
    expect(toDateTimeLocal('18.6.2026. 11:14:31')).toMatch(/T\d{2}:\d{2}:31$/);
  });
});
