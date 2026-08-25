import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { type ComponentProps, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, type StyleProp, type ViewStyle } from "react-native";

import { useColors } from "@/hooks/use-colors";
import { TUNNEL_KINDS, tunnelCatalog, type TunnelKind } from "@/lib/vpn/tunnel-profiles";
import { useLang } from "@/lib/i18n-provider";
import { ConfigMenu } from "@/components/config-menu";

type MaterialIconName = ComponentProps<typeof MaterialIcons>["name"];
type Tone = "neutral" | "primary" | "success" | "warning" | "error";

const familyIcons: Record<TunnelKind, MaterialIconName> = {
  zivpn: "shield",
  slowdns: "dns",
  hysteria: "speed",
  "http-payload": "http",
  "ssh-tls": "lock",
  "v2ray-slowdns": "hub",
  "xray-v2ray": "alt-route",
};

export function AppHeader() {
  const colors = useColors();
  return (
    <View style={styles.header}><View style={styles.headerSpacer} /><Text style={[styles.headerTitle, { color: colors.foreground }]}>KIGHMU VPN</Text><View style={styles.headerActions}><Pressable accessibilityRole="button" accessibilityLabel="Paramètres" onPress={() => router.push("/settings")} style={({ pressed }) => [styles.headerButton, { backgroundColor: colors.surfaceRaised }, pressed && styles.pressed]}><MaterialIcons name="settings" size={19} color={colors.foreground} /></Pressable><ConfigMenu /></View></View>
  );
}

export function Panel({ children, style, raised = false }: { children: ReactNode; style?: StyleProp<ViewStyle>; raised?: boolean }) {
  const colors = useColors();
  return <View style={[styles.panel, { backgroundColor: raised ? colors.surfaceRaised : colors.surface, borderColor: colors.border }, style]}>{children}</View>;
}

export function SectionLabel({ children, trailing }: { children: string; trailing?: ReactNode }) {
  const colors = useColors();
  return <View style={styles.sectionLabel}><Text style={[styles.sectionText, { color: colors.muted }]}>{children}</Text>{trailing}</View>;
}

export function StatusPill({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  const colors = useColors();
  const toneColor = tone === "primary" ? colors.primary : tone === "success" ? colors.success : tone === "warning" ? colors.warning : tone === "error" ? colors.error : colors.muted;
  return <View style={[styles.statusPill, { backgroundColor: `${String(toneColor)}22` }]}><View style={[styles.statusDot, { backgroundColor: toneColor }]} /><Text style={[styles.statusText, { color: toneColor }]}>{label}</Text></View>;
}

export function PrimaryAction({ label, icon, onPress, tone = "primary", loading = false, disabled = false }: { label: string; icon: MaterialIconName; onPress: () => void; tone?: "primary" | "error"; loading?: boolean; disabled?: boolean }) {
  const colors = useColors();
  const color = tone === "error" ? colors.error : colors.primary;
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.primaryAction, { backgroundColor: color, opacity: disabled ? 0.45 : 1 }, pressed && !disabled && styles.pressed]}><MaterialIcons name={loading ? "sync" : icon} size={19} color="#FFFFFF" /><Text style={styles.primaryActionText}>{label}</Text></Pressable>;
}

export function FamilySelector({ activeKind, onSelect }: { activeKind: TunnelKind; onSelect: (kind: TunnelKind) => void }) {
  const colors = useColors();
  const { t } = useLang();
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.familyRail}>{TUNNEL_KINDS.map((kind) => {
    const active = kind === activeKind;
    return <Pressable key={kind} accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={() => onSelect(kind)} style={({ pressed }) => [styles.familyChip, { backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border }, pressed && styles.pressed]}><MaterialIcons name={familyIcons[kind]} size={16} color={active ? "#FFFFFF" : colors.muted} /><Text style={[styles.familyChipText, { color: active ? "#FFFFFF" : colors.foreground }]}>{t(`tunnels.${kind}.shortLabel`)}</Text></Pressable>;
  })}</ScrollView>;
}

export function IconAction({ label, icon, onPress, destructive = false }: { label: string; icon: MaterialIconName; onPress: () => void; destructive?: boolean }) {
  const colors = useColors();
  const color = destructive ? colors.error : colors.primary;
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.iconAction, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && styles.pressed]}><MaterialIcons name={icon} size={18} color={color} /><Text style={[styles.iconActionText, { color }]}>{label}</Text></Pressable>;
}

/** Ligne interrupteur (promue depuis l'écran Paramètres pour unifier le langage visuel). */
export function ToggleRow({ icon, title, description, value, onChange, disabled = false }: { icon: MaterialIconName; title: string; description: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  const colors = useColors();
  return <View style={[styles.row, { borderTopColor: colors.border }, disabled && styles.disabledRow]} pointerEvents={disabled ? "none" : "auto"}><View style={[styles.rowIcon, { backgroundColor: colors.surfaceRaised }]}><MaterialIcons name={icon} size={18} color={colors.primary} /></View><View style={styles.copy}><Text style={[styles.rowTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.description, { color: colors.muted }]}>{description}</Text></View><Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" /></View>;
}

/** Champ texte de réglage (DNS, URL) — même style d'input que l'écran Configuration. */
export function SettingTextRow({ icon, title, description, value, onChangeText, placeholder, error, disabled = false }: { icon: MaterialIconName; title: string; description: string; value: string; onChangeText: (value: string) => void; placeholder?: string; error?: string | null; disabled?: boolean }) {
  const colors = useColors();
  return <View style={[styles.settingBlock, { borderTopColor: colors.border }, disabled && styles.disabledRow]} pointerEvents={disabled ? "none" : "auto"}><View style={styles.rowHeader}><View style={[styles.rowIcon, { backgroundColor: colors.surfaceRaised }]}><MaterialIcons name={icon} size={18} color={colors.primary} /></View><View style={styles.copy}><Text style={[styles.rowTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.description, { color: colors.muted }]}>{description}</Text></View></View><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} editable={!disabled} style={[styles.textInput, { color: colors.foreground, backgroundColor: colors.surfaceRaised, borderColor: error ? colors.error : colors.border }]} />{error ? <Text style={[styles.fieldError, { color: colors.error }]}>{error}</Text> : null}</View>;
}

/** Champ numérique à pas (+/−) avec clamp min/max et unité — généralise le stepper existant. */
export function SettingNumberRow({ icon, title, description, value, min, max, step = 1, unit, onChange, disabled = false }: { icon: MaterialIconName; title: string; description: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (value: number) => void; disabled?: boolean }) {
  const colors = useColors();
  const clamp = (next: number) => Math.min(max, Math.max(min, Math.round(next)));
  return <View style={[styles.row, { borderTopColor: colors.border }, disabled && styles.disabledRow]} pointerEvents={disabled ? "none" : "auto"}><View style={[styles.rowIcon, { backgroundColor: colors.surfaceRaised }]}><MaterialIcons name={icon} size={18} color={colors.primary} /></View><View style={styles.copy}><Text style={[styles.rowTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.description, { color: colors.muted }]}>{description}</Text></View><View style={styles.numberSide}><Text style={[styles.numberValue, { color: colors.foreground }]}>{value}{unit ? ` ${unit}` : ""}</Text><View style={styles.stepper}><Pressable accessibilityRole="button" accessibilityLabel={`Diminuer ${title}`} disabled={disabled || value <= min} onPress={() => onChange(clamp(value - step))} style={({ pressed }) => [styles.step, { borderColor: colors.border }, pressed && styles.pressed]}><Text style={[styles.stepText, { color: colors.primary }]}>−</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Augmenter ${title}`} disabled={disabled || value >= max} onPress={() => onChange(clamp(value + step))} style={({ pressed }) => [styles.step, { borderColor: colors.border }, pressed && styles.pressed]}><Text style={[styles.stepText, { color: colors.primary }]}>+</Text></Pressable></View></View></View>;
}

/** Sélecteur segmenté (thème Système/Clair/Sombre) — motif repris de dev/theme-lab. */
export function SegmentedControl<T extends string>({ options, value, onChange }: { options: ReadonlyArray<{ label: string; value: T }>; value: T; onChange: (value: T) => void }) {
  const colors = useColors();
  return <View style={[styles.segmented, { backgroundColor: colors.surfaceRaised }]}>{options.map((option) => {
    const active = option.value === value;
    return <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={() => onChange(option.value)} style={({ pressed }) => [styles.segmentItem, active && { backgroundColor: colors.primary }, pressed && styles.pressed]}><Text numberOfLines={1} style={[styles.segmentText, { color: active ? "#FFFFFF" : colors.foreground }]}>{option.label}</Text></Pressable>;
  })}</View>;
}

/** Ligne lecture seule avec pill de statut (ports locaux, LAN, tampons). */
export function InfoRow({ icon, title, description, pillLabel, pillTone = "neutral" }: { icon: MaterialIconName; title: string; description: string; pillLabel: string; pillTone?: "neutral" | "primary" | "success" | "warning" | "error" }) {
  const colors = useColors();
  return <View style={[styles.row, { borderTopColor: colors.border }]}><View style={[styles.rowIcon, { backgroundColor: colors.surfaceRaised }]}><MaterialIcons name={icon} size={18} color={colors.primary} /></View><View style={styles.copy}><Text style={[styles.rowTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.description, { color: colors.muted }]}>{description}</Text></View><StatusPill label={pillLabel} tone={pillTone} /></View>;
}

const styles = StyleSheet.create({
  header: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerSpacer: { width: 40, height: 40 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 7 },
  headerButton: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  headerTitle: { position: "absolute", left: 54, right: 54, textAlign: "center", fontSize: 17, fontWeight: "900", letterSpacing: 0.2 },
  panel: { borderWidth: 1, borderRadius: 20, padding: 16 },
  sectionLabel: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  sectionText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.95, textTransform: "uppercase" },
  statusPill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 99 },
  statusText: { fontSize: 12, fontWeight: "800" },
  primaryAction: { minHeight: 56, borderRadius: 16, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 9, paddingHorizontal: 20 },
  primaryActionText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  familyRail: { gap: 8, paddingRight: 20 },
  familyChip: { minHeight: 42, borderWidth: 1, borderRadius: 14, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 12 },
  familyChipText: { fontSize: 13, fontWeight: "700" },
  iconAction: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderRadius: 13, paddingHorizontal: 11 },
  iconActionText: { fontSize: 12, fontWeight: "800" },
  row: { minHeight: 72, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14, marginTop: 14, flexDirection: "row", alignItems: "center", gap: 11 },
  rowIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: "900" },
  description: { marginTop: 4, fontSize: 11, lineHeight: 16 },
  rowHeader: { flexDirection: "row", alignItems: "center", gap: 11 },
  settingBlock: { paddingTop: 14, marginTop: 14, borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
  textInput: { minHeight: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontSize: 15 },
  fieldError: { fontSize: 11, fontWeight: "700", marginTop: -2 },
  numberSide: { alignItems: "flex-end", gap: 6 },
  numberValue: { fontSize: 15, fontWeight: "900", fontVariant: ["tabular-nums"] },
  stepper: { flexDirection: "row", gap: 6 },
  step: { width: 34, height: 34, borderWidth: 1, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  stepText: { fontSize: 20, fontWeight: "800" },
  segmented: { flexDirection: "row", borderRadius: 14, padding: 3, gap: 3 },
  segmentItem: { flex: 1, minHeight: 40, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  segmentText: { fontSize: 13, fontWeight: "800" },
  disabledRow: { opacity: 0.45 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.985 }] },
});
