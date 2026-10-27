import { isIosDevice } from './ios-install-hint.component';

describe('isIosDevice', () => {
  it('prepoznaje iPhone i iPad (i iPadOS koji se predstavlja kao Mac)', () => {
    expect(isIosDevice({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', maxTouchPoints: 5 })).toBeTrue();
    expect(isIosDevice({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5, platform: 'MacIntel' })).toBeTrue();
  });

  it('ne prikazuje savet na Android-u i desktop Mac-u', () => {
    expect(isIosDevice({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)', maxTouchPoints: 5, platform: 'Linux armv8l' })).toBeFalse();
    expect(isIosDevice({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0, platform: 'MacIntel' })).toBeFalse();
  });
});
