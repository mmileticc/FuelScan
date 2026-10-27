import { playScanBeep, scanSuccessFeedback } from './scan-feedback';

describe('scan-feedback', () => {
  it('nikad ne baca grešku, ni kad audio nije otključan', () => {
    expect(() => playScanBeep()).not.toThrow();
    expect(() => scanSuccessFeedback()).not.toThrow();
  });
});
