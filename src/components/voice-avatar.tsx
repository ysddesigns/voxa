import { Text, View } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';
import { useTheme } from '@/design/theme';
import { fontFamily } from '@/design/type';

/** Round initial badge for a voice (Editor voice bar, Voices "Get more" rows). */
export function VoiceAvatar({ name, size = 36, solid = true }: { name: string; size?: number; solid?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: solid ? colors.accent : colors.warning,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontFamily: fontFamily.bold, fontSize: size * 0.42, color: solid ? colors.onAccent : colors.accentText }}>
        {name.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

/** Round progress ring with a stop square, for a voice download (tap to cancel). */
export function DownloadRing({ progress, size = 32 }: { progress: number; size?: number }) {
  const { colors } = useTheme();
  const r = 14;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, Math.max(0, progress));
  return (
    <Svg width={size} height={size} viewBox="0 0 36 36">
      <Circle cx={18} cy={18} r={r} fill="none" stroke={colors.chip} strokeWidth={4} />
      <Circle
        cx={18}
        cy={18}
        r={r}
        fill="none"
        stroke={colors.accent}
        strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray={`${Math.max(0.01, p * c)} ${c}`}
        transform="rotate(-90 18 18)"
      />
      <Rect x={14} y={14} width={8} height={8} rx={1.5} fill={colors.text} />
    </Svg>
  );
}
