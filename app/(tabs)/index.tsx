import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { AppHeader, FamilySelector, IconAction, Panel, PrimaryAction, SectionLabel, StatusPill } from "@/components/kighmu-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { TUNNEL_CATALOG, profileEndpoint } from "@/lib/vpn/tunnel-profiles";
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

      <Panel style={styles.profilesPanel}>
        <SectionLabel trailing={<IconAction label="Gérer" icon="tune" onPress={() => router.push("./configuration")} />}>Profils sélectionnés</SectionLabel>
        {activeProfiles.length === 0 ? <View style={[styles.emptyState, { backgroundColor: colors.surfaceRaised }]}><MaterialIcons name="playlist-add" size={22} color={colors.primary} /><View style={styles.emptyCopy}><Text style={[styles.emptyTitle, { color: colors.foreground }]}>Aucun profil actif</Text><Text style={[styles.emptyText, { color: colors.muted }]}>Ajoutez puis sélectionnez un profil pour cette famille.</Text></View></View> : <View style={styles.profileList}>{activeProfiles.slice(0, 2).map((profile) => <View key={profile.id} style={[styles.profileRow, { borderBottomColor: colors.border }]}><View style={[styles.profileIndicator, { backgroundColor: colors.success }]} /><View style={styles.profileCopy}><Text numberOfLines={1} style={[styles.profileName, { color: colors.foreground }]}>{profile.name}</Text><Text numberOfLines={1} style={[styles.profileEndpoint, { color: colors.muted }]}>{profileEndpoint(profile)}</Text></View></View>)}{activeProfiles.length > 2 ? <Text style={[styles.moreProfiles, { color: colors.muted }]}>+ {activeProfiles.length - 2} autre{activeProfiles.length - 2 > 1 ? "s" : ""} profil{activeProfiles.length - 2 > 1 ? "s" : ""}</Text> : null}</View>}
      </Panel>

      <PrimaryAction label={isBusy ? "Annuler la connexion" : isConnected ? "Déconnecter" : "Connecter"} icon={canDisconnect ? "power-settings-new" : "bolt"} onPress={canDisconnect ? disconnect : connect} tone={canDisconnect ? "error" : "primary"} loading={isBusy} />

      <Pressable onPress={() => router.push("./diagnostic")} style={({ pressed }) => [styles.diagnosticLink, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}><View style={[styles.diagnosticIcon, { backgroundColor: colors.surfaceRaised }]}><MaterialIcons name="insights" size={20} color={colors.primary} /></View><View style={styles.diagnosticCopy}><Text style={[styles.diagnosticTitle, { color: colors.foreground }]}>Dernier événement</Text><Text numberOfLines={2} style={[styles.diagnosticText, { color: colors.muted }]}>{lastError ?? "Ouvrez le diagnostic pour suivre les étapes du tunnel."}</Text></View><MaterialIcons name="chevron-right" size={22} color={colors.muted} /></Pressable>
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
  profilesPanel: { paddingBottom: 10 },
  emptyState: { borderRadius: 15, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  emptyCopy: { flex: 1 },
  emptyTitle: { fontSize: 14, fontWeight: "800" },
  emptyText: { marginTop: 3, fontSize: 12, lineHeight: 17 },
  profileList: { marginTop: 2 },
  profileRow: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  profileIndicator: { width: 8, height: 8, borderRadius: 20 },
  profileCopy: { flex: 1 },
  profileName: { fontSize: 14, fontWeight: "800" },
  profileEndpoint: { marginTop: 3, fontSize: 12 },
  moreProfiles: { marginTop: 12, fontSize: 12, fontWeight: "700" },
  diagnosticLink: { minHeight: 78, borderRadius: 18, borderWidth: 1, flexDirection: "row", alignItems: "center", padding: 13, gap: 12 },
  diagnosticIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  diagnosticCopy: { flex: 1 },
  diagnosticTitle: { fontSize: 14, fontWeight: "800" },
  diagnosticText: { marginTop: 4, fontSize: 12, lineHeight: 17 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.985 }] },
});
