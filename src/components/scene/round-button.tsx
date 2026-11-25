import { Pressable, StyleSheet } from 'react-native';
import { Icon, type IconName } from '@/components/icons';
import { minTouch } from '@/design/tokens';

/**
 * The round outlined icon button of a scene's header (search, close). Colours come from the
 * caller: on the wall it is the room's `title` and `control`; over a scrim, `onScrim`.
 */
export function RoundButton({
  icon,
  label,
  onPress,
  color,
  borderColor,
  size = 19,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  color: string;
  borderColor: string;
  size?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [styles.round, { borderColor, opacity: pressed ? 0.5 : 1 }]}
    >
      <Icon name={icon} size={size} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  round: { width: minTouch, height: minTouch, borderRadius: minTouch / 2, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
