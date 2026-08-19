import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { type ComponentProps, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { useColors } from "@/hooks/use-colors";
import { TUNNEL_CATALOG, TUNNEL_KINDS, type TunnelKind } from "@/lib/vpn/tunnel-profiles";
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
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.familyRail}>{TUNNEL_KINDS.map((kind) => {
    const active = kind === activeKind;
    return <Pressable key={kind} accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={() => onSelect(kind)} style={({ pressed }) => [styles.familyChip, { backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border }, pressed && styles.pressed]}><MaterialIcons name={familyIcons[kind]} size={16} color={active ? "#FFFFFF" : colors.muted} /><Text style={[styles.familyChipText, { color: active ? "#FFFFFF" : colors.foreground }]}>{TUNNEL_CATALOG[kind].shortLabel}</Text></Pressable>;
  })}</ScrollView>;
}

export function IconAction({ label, icon, onPress, destructive = false }: { label: string; icon: MaterialIconName; onPress: () => void; destructive?: boolean }) {
  const colors = useColors();
  const color = destructive ? colors.error : colors.primary;
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.iconAction, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && styles.pressed]}><MaterialIcons name={icon} size={18} color={color} /><Text style={[styles.iconActionText, { color }]}>{label}</Text></Pressable>;
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
  pressed: { opacity: 0.76, transform: [{ scale: 0.985 }] },
});
