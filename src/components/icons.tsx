import Svg, { Circle, Path, Rect } from 'react-native-svg';

/** Voxa's shared custom icon set (PRD: no SF Symbols or Material icons inside screens). */
export type IconName =
  | 'home'
  | 'live'
  | 'voices'
  | 'library'
  | 'mic'
  | 'chat'
  | 'plus'
  | 'arrow'
  | 'person'
  | 'wave'
  | 'offline';

type Props = { name: IconName; size?: number; color: string; strokeWidth?: number };

export function Icon({ name, size = 22, color, strokeWidth = 2 }: Props) {
  const common = {
    fill: 'none',
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      {name === 'home' && <Path d="M4 11l8-7 8 7v9h-5.5v-6h-5v6H4z" {...common} />}
      {name === 'live' && (
        <>
          <Path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" {...common} />
          <Path d="M8.5 9.5v3M12 8v6M15.5 9.5v3" {...common} />
        </>
      )}
      {name === 'voices' && (
        <>
          <Circle cx={9} cy={8} r={3.5} {...common} />
          <Path d="M3 20a6 6 0 0 1 12 0M18 7v7M21 9v3" {...common} />
        </>
      )}
      {name === 'library' && (
        <>
          <Rect x={4} y={4} width={4} height={16} rx={1} {...common} />
          <Rect x={10} y={4} width={4} height={16} rx={1} {...common} />
          <Path d="M16.5 5.2l3.8 14.3" {...common} />
        </>
      )}
      {name === 'mic' && (
        <>
          <Rect x={9} y={3} width={6} height={11} rx={3} {...common} />
          <Path d="M5 11a7 7 0 0 0 14 0M12 18v3" {...common} />
        </>
      )}
      {name === 'chat' && (
        <>
          <Path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" {...common} />
          <Path d="M8 11h0.01M12 11h0.01M16 11h0.01" {...common} strokeWidth={strokeWidth + 0.6} />
        </>
      )}
      {name === 'plus' && <Path d="M12 5v14M5 12h14" {...common} />}
      {name === 'arrow' && <Path d="M5 12h14M13 6l6 6-6 6" {...common} />}
      {name === 'person' && (
        <>
          <Circle cx={12} cy={9} r={3.6} {...common} />
          <Path d="M5 20a7 7 0 0 1 14 0" {...common} />
        </>
      )}
      {name === 'wave' && <Path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" {...common} />}
      {name === 'offline' && (
        <>
          <Path d="M3 8.5a13 13 0 0 1 18 0M6 12a8.5 8.5 0 0 1 12 0M9 15.5a4 4 0 0 1 6 0" {...common} />
          <Path d="M4 4l16 16" {...common} />
        </>
      )}
    </Svg>
  );
}
