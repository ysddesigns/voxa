import Svg, { Circle, Path, Rect, Text as SvgText } from 'react-native-svg';

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
  | 'offline'
  | 'chevronLeft'
  | 'chevronDown'
  | 'more'
  | 'heart'
  | 'play'
  | 'pause'
  | 'back15'
  | 'forward15'
  | 'share'
  | 'search'
  | 'download'
  | 'speaker'
  | 'lock'
  | 'check'
  | 'stop'
  | 'flag'
  | 'trash'
  | 'scan'
  | 'settings'
  | 'close'
  | 'rack';

type Props = {
  name: IconName;
  size?: number;
  color: string;
  strokeWidth?: number;
  /** Solid version (heart). play, pause, stop and check are always solid. */
  filled?: boolean;
  /** Second colour for marks drawn on a solid shape (the tick in check). */
  onColor?: string;
};

export function Icon({ name, size = 22, color, strokeWidth = 2, filled = false, onColor = '#FFFFFF' }: Props) {
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
      {name === 'rack' && (
        <>
          <Path d="M4 3v18M20 3v18M4 10h16M4 17h16" {...common} />
          <Rect x={6.5} y={5} width={4} height={5} rx={0.8} {...common} />
          <Rect x={13.5} y={12} width={4} height={5} rx={0.8} {...common} />
        </>
      )}
      {name === 'chevronLeft' && <Path d="M15 5l-7 7 7 7" {...common} />}
      {name === 'chevronDown' && <Path d="M6 9l6 6 6-6" {...common} />}
      {name === 'more' && (
        <>
          <Circle cx={5} cy={12} r={1.8} fill={color} />
          <Circle cx={12} cy={12} r={1.8} fill={color} />
          <Circle cx={19} cy={12} r={1.8} fill={color} />
        </>
      )}
      {name === 'heart' && (
        <Path
          d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"
          {...common}
          fill={filled ? color : 'none'}
          strokeWidth={filled ? 0 : 1.8}
        />
      )}
      {name === 'play' && <Path d="M8 5.5v13l10.5-6.5z" fill={color} />}
      {name === 'pause' && (
        <>
          <Rect x={6.5} y={5} width={4} height={14} rx={1.2} fill={color} />
          <Rect x={13.5} y={5} width={4} height={14} rx={1.2} fill={color} />
        </>
      )}
      {name === 'stop' && <Rect x={7} y={7} width={10} height={10} rx={2} fill={color} />}
      {name === 'flag' && <Path d="M5 21V4M5 4h11l-2 4 2 4H5" {...common} />}
      {name === 'trash' && <Path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" {...common} />}
      {name === 'scan' && <Path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 10h8M8 14h5" {...common} />}
      {name === 'settings' && (
        <>
          <Circle cx={12} cy={12} r={3} {...common} />
          <Path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" {...common} />
        </>
      )}
      {name === 'close' && <Path d="M6 6l12 12M18 6L6 18" {...common} />}
      {name === 'back15' && (
        <>
          <Path d="M12 4a8 8 0 1 1-7.4 5" {...common} strokeWidth={1.7} />
          <Path d="M4 4v5h5" {...common} strokeWidth={1.7} />
          <SvgText x={12.5} y={15.5} fontSize={7} fontWeight="700" textAnchor="middle" fill={color}>
            15
          </SvgText>
        </>
      )}
      {name === 'forward15' && (
        <>
          <Path d="M12 4a8 8 0 1 0 7.4 5" {...common} strokeWidth={1.7} />
          <Path d="M20 4v5h-5" {...common} strokeWidth={1.7} />
          <SvgText x={11.5} y={15.5} fontSize={7} fontWeight="700" textAnchor="middle" fill={color}>
            15
          </SvgText>
        </>
      )}
      {name === 'share' && <Path d="M12 3v12M7.5 7.5L12 3l4.5 4.5M7 11H5v9h14v-9h-2" {...common} />}
      {name === 'search' && (
        <>
          <Circle cx={11} cy={11} r={6.5} {...common} />
          <Path d="M16 16l4.5 4.5" {...common} />
        </>
      )}
      {name === 'download' && (
        <>
          <Circle cx={12} cy={12} r={9} {...common} strokeWidth={1.8} />
          <Path d="M12 7.5v8M8.5 12l3.5 3.5 3.5-3.5" {...common} strokeWidth={1.8} />
        </>
      )}
      {name === 'speaker' && <Path d="M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 0 1 0 7" {...common} strokeWidth={1.8} />}
      {name === 'lock' && (
        <>
          <Rect x={5} y={11} width={14} height={9} rx={2} {...common} />
          <Path d="M8 11V8a4 4 0 0 1 8 0v3" {...common} />
        </>
      )}
      {name === 'check' && (
        <>
          <Circle cx={12} cy={12} r={9} fill={color} />
          <Path d="M8 12.5l2.8 2.8L16.5 9.5" {...common} stroke={onColor} strokeWidth={2.4} />
        </>
      )}
    </Svg>
  );
}
