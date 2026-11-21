import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Says something through TalkBack or VoiceOver when it is on; does nothing otherwise. */
export function announce(text: string) {
  if (text) AccessibilityInfo.announceForAccessibility(text);
}

/** Whether TalkBack or VoiceOver is on, kept up to date. */
export function useScreenReader(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((v) => live && setOn(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setOn);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return on;
}

/** Screen-reader props for a progress bar (0 to 1). */
export function progressProps(label: string, fraction: number) {
  return {
    accessible: true,
    accessibilityRole: 'progressbar' as const,
    accessibilityLabel: label,
    accessibilityValue: { min: 0, max: 100, now: Math.round(Math.max(0, Math.min(1, fraction)) * 100) },
  };
}
