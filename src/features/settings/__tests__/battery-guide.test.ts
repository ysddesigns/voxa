import { guideFor, shouldShowTip } from '../battery-guide';

describe('battery guide', () => {
  it('picks the brand guide from the manufacturer or brand, case-insensitively', () => {
    expect(guideFor('TECNO MOBILE LIMITED').brand).toBe('Tecno, Infinix and itel');
    expect(guideFor('INFINIX MOBILITY LIMITED').strict).toBe(true);
    expect(guideFor('Xiaomi', 'Redmi').brand).toBe('Xiaomi, Redmi and POCO');
    expect(guideFor(null, 'samsung').brand).toBe('Samsung');
    expect(guideFor('Google')).toEqual(expect.objectContaining({ brand: 'your phone', strict: false }));
  });

  it('shows on Android until dismissed, when Voxa is still optimised or the brand is strict', () => {
    expect(shouldShowTip({ android: true, unrestricted: false, strict: false, dismissed: false })).toBe(true);
    expect(shouldShowTip({ android: true, unrestricted: true, strict: true, dismissed: false })).toBe(true);
    expect(shouldShowTip({ android: true, unrestricted: true, strict: false, dismissed: false })).toBe(false);
    expect(shouldShowTip({ android: true, unrestricted: null, strict: true, dismissed: false })).toBe(true);
    expect(shouldShowTip({ android: true, unrestricted: false, strict: true, dismissed: true })).toBe(false);
    expect(shouldShowTip({ android: false, unrestricted: false, strict: true, dismissed: false })).toBe(false);
  });
});
