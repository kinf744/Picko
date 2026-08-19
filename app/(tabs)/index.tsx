import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppHeader, FamilySelector, Panel, PrimaryAction, SectionLabel, StatusPill } from "@/components/kighmu-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { TUNNEL_CATALOG } from "@/lib/vpn/tunnel-profiles";
import { useVpn } from "@/lib/vpn/vpn-context";

const statusCopy = {
  disconnected: { label: "Prêt à se connecter", hint: "Choisissez une famille puis au moins un profil.", icon: "shield" as const },
  connecting: { label: "Connexion en cours", hint: "Préparation sécurisée du tunnel sélectionné…", icon: "sync" as const },
  connected: { label: "Tunnel actif", hint: "Le trafic utilise la famille sélectionnée.", icon: "verified-user" as const },
  error: { label: "Connexion interrompue", hint: "Consultez le diagnostic pour identifier l’étape bloquante.", icon: "error-outline" as const },
};

export default function HomeScreen() {
  const colors = useColors();
  const { activeKind, selectTunnel, activeProfiles, balancersByKind, status, lastError, connect, disconnect } = useVpn();
  const copy = statusCopy[status];
  const isBusy = status === "connecting";
  const isConnected = status === "connected";
  const canDisconnect = isBusy || isConnected;
  const balancer = balancersByKind[activeKind];
  const usesBalancer = balancer.enabled && activeProfiles.length > 1;
  const tone = status === "connected" ? "success" : status === "error" ? "error" : status === "connecting" ? "warning" : "primary";

  return <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right", "bottom"]}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <AppHeader />

      <Panel raised style={styles.statusPanel}>
        <View style={styles.statusTop}><StatusPill label={copy.label} tone={tone} /><MaterialIcons name={copy.icon} size={28} color={status === "error" ? colors.error : status === "connected" ? colors.success : colors.primary} /></View>
        <Text style={[styles.activeFamily, { color: colors.foreground }]}>{TUNNEL_CATALOG[activeKind].label}</Text>
        <Text style={[styles.statusHint, { color: status === "error" ? colors.error : colors.muted }]}>{lastError ?? copy.hint}</Text>
        <View style={[styles.statusFooter, { borderTopColor: colors.border }]}><Text style={[styles.statusMeta, { color: colors.muted }]}>{activeProfiles.length} profil{activeProfiles.length > 1 ? "s" : ""} sélectionné{activeProfiles.length > 1 ? "s" : ""}</Text><Text style={[styles.statusMeta, { color: usesBalancer ? colors.success : colors.muted }]}>{usesBalancer ? "Balancier actif" : "Sortie directe"}</Text></View>
      </Panel>

      <View><SectionLabel>Famille de tunnel</SectionLabel><FamilySelector activeKind={activeKind} onSelect={selectTunnel} /></View>

      <PrimaryAction label={isBusy ? "Annuler la connexion" : isConnected ? "Déconnecter" : "Connecter"} icon={canDisconnect ? "power-settings-new" : "bolt"} onPress={canDisconnect ? disconnect : connect} tone={canDisconnect ? "error" : "primary"} loading={isBusy} />
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
