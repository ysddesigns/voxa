import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/icons';
import { useTheme } from '@/design/theme';
import { minTouch, radius, squircle } from '@/design/tokens';
import { type } from '@/design/type';

/**
 * Apple-style building blocks shared by every screen: navigation bar, grouped inset lists,
 * rows, search field and buttons.
 */

/** Inline navigation bar: back chevron with the previous screen's name, centred title. */
export function NavBar({ title, back = 'Back', right }: { title?: string; back?: string; right?: ReactNode }) {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.nav, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <View style={styles.navRow}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={`Back to ${back}`}
          hitSlop={8}
          style={({ pressed }) => [styles.navBack, pressed && { opacity: 0.4 }]}
        >
          <Icon name="chevronLeft" size={24} color={colors.accentText} strokeWidth={2.4} />
          <Text style={[type.body, { color: colors.accentText }]} numberOfLines={1}>
            {back}
          </Text>
        </Pressable>
        {title ? (
          <Text style={[type.headline, styles.navTitle, { color: colors.text }]} numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
        ) : null}
        <View style={styles.navRight}>{right}</View>
      </View>
    </View>
  );
}

/** Scrolling page on the grouped background, with room for the home indicator. */
export function Page({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 32, gap: 24 }, style]}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

/** Large title at the top of a page's content (one per screen). */
export function LargeTitle({ children }: { children: string }) {
  const { colors } = useTheme();
  return (
    <Text style={[type.largeTitle, { color: colors.text, paddingHorizontal: 4 }]} accessibilityRole="header">
      {children}
    </Text>
  );
}

/** Inset grouped list: header above, rows separated by inset hairlines, footer below. */
export function Group({
  header,
  footer,
  action,
  children,
}: {
  header?: string;
  footer?: ReactNode;
  /** A text link at the right of the header, such as See All. */
  action?: { label: string; onPress: () => void };
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={{ gap: 7 }}>
      {header ? (
        <View style={styles.groupHead}>
          <Text style={[type.overline, { color: colors.textSecondary, flex: 1 }]} accessibilityRole="header">
            {header}
          </Text>
          {action ? (
            <Pressable onPress={action.onPress} accessibilityRole="button" hitSlop={12} style={({ pressed }) => pressed && { opacity: 0.4 }}>
              <Text style={[type.subheadline, { color: colors.accentText }]}>{action.label}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {rows.length ? (
        <View style={[styles.group, { backgroundColor: colors.card }]}>
          {rows.map((row, i) => (
            <Fragment key={row.key ?? i}>
              {i > 0 ? <View style={[styles.separator, { backgroundColor: colors.separator }]} /> : null}
              {row}
            </Fragment>
          ))}
        </View>
      ) : null}
      {typeof footer === 'string' ? <Text style={[type.footnote, styles.groupFooter, { color: colors.textSecondary }]}>{footer}</Text> : footer}
    </View>
  );
}

/** A list item that opens something: icon tile, title, a line of detail, chevron. */
export function ListRow({
  icon,
  title,
  subtitle,
  tint,
  onPress,
  accessibilityLabel,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  /** Icon tile in the accent tint (live and attention items). */
  tint?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title)}
      style={({ pressed }) => [styles.row, { paddingVertical: 10 }, pressed && { backgroundColor: colors.chipPressed }]}
    >
      {icon ? (
        <View style={[styles.rowIcon, { backgroundColor: tint ? colors.warning : colors.chip }]}>
          <Icon name={icon} size={18} color={tint ? colors.accentText : colors.text} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.body, { color: colors.text }]} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[type.footnote, { color: colors.textSecondary }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Icon name="arrow" size={14} color={colors.textTertiary} strokeWidth={2.4} />
    </Pressable>
  );
}

/** Search field: grey rounded box with a magnifying glass, as in iOS. */
export function SearchField({ value, onChangeText, placeholder, label }: { value: string; onChangeText: (t: string) => void; placeholder: string; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.search, { backgroundColor: colors.chip }]}>
      <Icon name="search" size={18} color={colors.textSecondary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        accessibilityLabel={label}
        returnKeyType="search"
        style={[type.body, { color: colors.text, flex: 1, paddingVertical: 0 }]}
      />
      {value ? (
        <Pressable onPress={() => onChangeText('')} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10}>
          <Icon name="close" size={16} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** A row that opens another screen: label, optional value, chevron. */
export function NavRow({ label, value, icon, onPress }: { label: string; value?: string; icon?: IconName; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}: ${value}` : label}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.chipPressed }]}
    >
      {icon ? <Icon name={icon} size={20} color={colors.accentText} /> : null}
      <Text style={[type.body, { color: colors.text, flex: 1 }]}>{label}</Text>
      {value ? (
        <Text style={[type.body, { color: colors.textSecondary, flexShrink: 1 }]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      <Icon name="arrow" size={14} color={colors.textTertiary} strokeWidth={2.4} />
    </Pressable>
  );
}

export function InfoRow({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[type.body, { color: colors.text, flex: 1 }]}>{label}</Text>
      <Text style={[type.body, { color: colors.textSecondary, flexShrink: 1, textAlign: 'right' }]} selectable>
        {value}
      </Text>
    </View>
  );
}

export function ToggleRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.body, { color: colors.text }]}>{label}</Text>
        {hint ? <Text style={[type.footnote, { color: colors.textSecondary }]}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} trackColor={{ true: colors.accent, false: colors.chipPressed }} thumbColor="#FFFFFF" />
    </View>
  );
}

/** A tappable row that does something here: plain (accent) or destructive. */
export function ActionRow({ label, icon, destructive, disabled, onPress }: { label: string; icon?: IconName; destructive?: boolean; disabled?: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  // Destructive and plain actions share the accent ink: one accent, and it reads as a warning red-orange.
  void destructive;
  const color = colors.accentText;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.chipPressed }, disabled && { opacity: 0.4 }]}
    >
      {icon ? <Icon name={icon} size={20} color={color} /> : null}
      <Text style={[type.body, { color, flex: 1 }]}>{label}</Text>
    </Pressable>
  );
}

/** Free text inside a group (explanations, status). */
export function TextRow({ children }: { children: ReactNode }) {
  return <View style={[styles.row, { paddingVertical: 12 }]}>{children}</View>;
}

type ButtonKind = 'filled' | 'gray' | 'plain';

/** Apple button: filled (the one main action), gray (secondary), plain (text only). Pill shaped. */
export function Button({
  label,
  onPress,
  kind = 'filled',
  icon,
  disabled,
  accent,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  icon?: IconName;
  disabled?: boolean;
  /** Filled in the brand accent instead of black/white: only for the screen's hero action. */
  accent?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const bg = kind === 'filled' ? (accent ? colors.accent : colors.primaryFill) : kind === 'gray' ? colors.chip : 'transparent';
  const fg = kind === 'filled' ? (accent ? colors.onAccent : colors.onPrimary) : kind === 'gray' ? colors.text : colors.accentText;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [styles.button, { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.75 : 1, transform: [{ scale: pressed && !disabled ? 0.97 : 1 }] }, style]}
    >
      {icon ? <Icon name={icon} size={18} color={fg} /> : null}
      <Text style={[type.headline, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

/** A plain card on the grouped background. */
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View style={[styles.card, { backgroundColor: colors.card }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  nav: { zIndex: 1 },
  navRow: { height: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  navBack: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: minTouch, maxWidth: '35%', zIndex: 1 },
  navTitle: { position: 'absolute', left: 96, right: 96, textAlign: 'center' },
  navRight: { flex: 1, alignItems: 'flex-end' },
  group: { borderRadius: radius.group, overflow: 'hidden', ...squircle },
  groupHead: { flexDirection: 'row', alignItems: 'baseline', paddingHorizontal: 16 },
  rowIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', ...squircle },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: minTouch, paddingHorizontal: 12, borderRadius: radius.input, ...squircle },
  groupFooter: { paddingHorizontal: 16 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: minTouch, paddingHorizontal: 16, paddingVertical: 11 },
  button: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', minHeight: 50, borderRadius: radius.pill, paddingHorizontal: 20 },
  card: { borderRadius: radius.card, padding: 16, gap: 12, ...squircle },
});
