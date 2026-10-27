import { friendlyError, isNetworkError } from './errors.utils';

describe('errors.utils', () => {
  it('prepoznaje mrežnu grešku', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBeTrue();
    expect(isNetworkError({ name: 'AuthRetryableFetchError', message: 'x' })).toBeTrue();
    expect(isNetworkError({ code: '23505', message: 'duplicate key' })).toBeFalse();
  });

  it('prevodi greške baze', () => {
    expect(friendlyError({ code: '23505', message: 'duplicate key value' }, 'čuvanju')).toBe('Ovaj račun je već sačuvan.');
    expect(friendlyError({ code: '42501', message: 'new row violates row-level security policy' }, 'čuvanju')).toContain('Sesija je istekla');
    expect(friendlyError({ code: 'XX000', message: 'internal' }, 'brisanju')).toBe('Greška pri brisanju. Pokušajte ponovo.');
  });

  it('naše poruke na srpskom prolaze neizmenjene', () => {
    expect(friendlyError(new Error('Ovaj račun je već sačuvan.'), 'čuvanju')).toBe('Ovaj račun je već sačuvan.');
    expect(friendlyError(new Error('Korisnik nije prijavljen.'), 'čuvanju')).toBe('Korisnik nije prijavljen.');
  });
});
