import { cacheDelete, cacheGet, cacheSet, userCacheKey } from './local-cache';

describe('local-cache (IndexedDB)', () => {
  const key = userCacheKey('receipts', 'test-user');

  afterEach(async () => cacheDelete(key));

  it('čuva, čita i briše po korisniku', async () => {
    await cacheSet(key, { savedAt: '2026-10-27T10:00:00Z', data: [{ id: 'a' }] });
    expect(await cacheGet(key)).toEqual({ savedAt: '2026-10-27T10:00:00Z', data: [{ id: 'a' }] });
    expect(await cacheGet(userCacheKey('receipts', 'drugi-korisnik'))).toBeUndefined();

    await cacheDelete(key);
    expect(await cacheGet(key)).toBeUndefined();
  });
});
