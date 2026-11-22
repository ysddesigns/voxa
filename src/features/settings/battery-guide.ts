/**
 * Many Android brands stop apps in the background to save battery, which ends Listen when the
 * screen goes off. These steps tell people how to let Voxa keep running, by phone brand.
 * Based on dontkillmyapp.com and the brands' own settings. Menu names vary between phone
 * versions, so each guide says so.
 */
export type BatteryGuide = {
  brand: string;
  /** True when the brand is known for stopping background apps. */
  strict: boolean;
  steps: string[];
};

const LOCK_IN_RECENTS = 'Open Recent apps, then lock Voxa (press and hold its card, or pull it down, and tap the lock).';

const GUIDES: { match: RegExp; guide: BatteryGuide }[] = [
  {
    match: /tecno|infinix|itel|transsion/,
    guide: {
      brand: 'Tecno, Infinix and itel',
      strict: true,
      steps: [
        'Open Phone Master (or Settings → Battery), go to Auto-start or App launch management, and allow Voxa.',
        'In Settings → Apps → Voxa → Battery, allow background activity and choose No restrictions.',
        'Turn off Power marathon or Ultra power saving while you listen.',
        LOCK_IN_RECENTS,
      ],
    },
  },
  {
    match: /xiaomi|redmi|poco/,
    guide: {
      brand: 'Xiaomi, Redmi and POCO',
      strict: true,
      steps: [
        'Settings → Apps → Manage apps → Voxa → Battery saver → No restrictions.',
        'On the same page, turn Autostart on.',
        LOCK_IN_RECENTS,
      ],
    },
  },
  {
    match: /samsung/,
    guide: {
      brand: 'Samsung',
      strict: true,
      steps: [
        'Settings → Apps → Voxa → Battery → Unrestricted.',
        'Settings → Battery → Background usage limits: make sure Voxa is not in Sleeping apps or Deep sleeping apps.',
      ],
    },
  },
  {
    match: /oppo|realme|oneplus/,
    guide: {
      brand: 'Oppo, Realme and OnePlus',
      strict: true,
      steps: [
        'Settings → Apps → Voxa → Battery usage: allow background activity and auto launch.',
        LOCK_IN_RECENTS,
      ],
    },
  },
  {
    match: /vivo|iqoo/,
    guide: {
      brand: 'Vivo',
      strict: true,
      steps: ['Settings → Battery → Background power consumption management → Voxa → Allow.', 'Settings → Apps → Autostart: allow Voxa.', LOCK_IN_RECENTS],
    },
  },
  {
    match: /huawei|honor/,
    guide: {
      brand: 'Huawei and Honor',
      strict: true,
      steps: ['Settings → Battery → App launch → Voxa: switch to Manage manually and turn on all three options.', LOCK_IN_RECENTS],
    },
  },
];

const GENERIC: BatteryGuide = {
  brand: 'your phone',
  strict: false,
  steps: ['Settings → Apps → Voxa → Battery → Unrestricted (or Not optimised).'],
};

export function guideFor(manufacturer: string | null | undefined, brand?: string | null): BatteryGuide {
  const name = `${manufacturer ?? ''} ${brand ?? ''}`.toLowerCase();
  return GUIDES.find((g) => g.match.test(name))?.guide ?? GENERIC;
}

/**
 * Show the Live screen tip until dismissed when Android still optimises Voxa, or on a strict brand
 * (its own battery saver is invisible to the app, so Android's answer is not enough).
 */
export function shouldShowTip(o: { android: boolean; unrestricted: boolean | null; strict: boolean; dismissed: boolean }) {
  if (!o.android || o.dismissed) return false;
  return o.unrestricted === false || o.strict;
}
