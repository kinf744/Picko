import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppHeader, FamilySelector, Panel, PrimaryAction, SectionLabel, StatusPill } from "@/components/kighmu-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useLang } from "@/lib/i18n-provider";
import { useVpn } from "@/lib/vpn/vpn-context";

const STATUS_ICONS = {
  disconnected: "shield",
  connecting: "sync",
  connected: "verified-user",
  error: "error-outline",
} as const;

export default function HomeScreen() {
  const colors = useColors();
  const { t } = useLang();
  const { activeKind, selectTunnel, activeProfiles, status, lastError, connect, disconnect } = useVpn();
  const statusCopy: Record<typeof status, { label: string; hint: string }> = {
    disconnected: { label: t("home.ready.label"), hint: t("home.ready.hint") },
    connecting: { label: t("home.connecting.label"), hint: t("home.connecting.hint") },
    connected: { label: t("home.connected.label"), hint: t("home.connected.hint") },
    error: { label: t("home.error.label"), hint: t("home.error.hint") },
  };
  const copy = statusCopy[status];
  const isBusy = status === "connecting";
  const isConnected = status === "connected";
  const canDisconnect = isBusy || isConnected;
  const usesBalancer = activeProfiles.length >= 2;
  const tone = status === "connected" ? "success" : status === "error" ? "error" : status === "connecting" ? "warning" : "primary";

  return <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right", "bottom"]}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <AppHeader />

      <Panel raised style={styles.statusPanel}>
        <View style={styles.statusTop}><StatusPill label={copy.label} tone={tone} /><MaterialIcons name={STATUS_ICONS[status]} size={28} color={status === "error" ? colors.error : status === "connected" ? colors.success : colors.primary} /></View>
        <Text style={[styles.activeFamily, { color: colors.foreground }]}>{t(`tunnels.${activeKind}.label`)}</Text>
        <Text style={[styles.statusHint, { color: status === "error" ? colors.error : colors.muted }]}>{lastError ?? copy.hint}</Text>
        <View style={[styles.statusFooter, { borderTopColor: colors.border }]}><Text style={[styles.statusMeta, { color: colors.muted }]}>{t("home.profilesSelected", { n: activeProfiles.length })}</Text><Text style={[styles.statusMeta, { color: usesBalancer ? colors.success : colors.muted }]}>{usesBalancer ? t("home.balancerOn") : t("home.balancerOff")}</Text></View>
      </Panel>

      <View><SectionLabel>{t("home.familyLabel")}</SectionLabel><FamilySelector activeKind={activeKind} onSelect={selectTunnel} /></View>

      <PrimaryAction label={isBusy ? t("home.cancelConnecting") : isConnected ? t("home.disconnect") : t("home.connect")} icon={canDisconnect ? "power-settings-new" : "bolt"} onPress={canDisconnect ? disconnect : connect} tone={canDisconnect ? "error" : "primary"} loading={isBusy} />
    </ScrollView>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 30, gap: 20 },
  statusPanel: { padding: 20 },
  statusTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  activeFamily: { marginTop: 22, fontSize: 24, lineHeight: 29, fontWeight: "800", letterSpacing: -0.35 },
  statusHint: { marginTop: 7, fontSize: 14, lineHeight: 20 },
  statusFooter: { marginTop: 18, paddingTop: 13, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", justifyContent: "space-between", gap: 12 },
  statusMeta: { fontSize: 12, fontWeight: "700" },
  pressed: { opacity: 0.76, transform: [{ scale: 0.985 }] },
});
