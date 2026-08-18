import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { TUNNEL_CATALOG, TUNNEL_KINDS, profileEndpoint } from "@/lib/vpn/tunnel-profiles";
import { useVpn } from "@/lib/vpn/vpn-context";

const statusCopy = {
  disconnected: { label: "Prêt à se connecter", hint: "Choisissez un tunnel puis un ou plusieurs profils.", icon: "shield.fill" as const },
  connecting: { label: "Connexion en cours", hint: "Préparation du tunnel sélectionné…", icon: "arrow.triangle.2.circlepath" as const },
  connected: { label: "Tunnel actif", hint: "Le trafic passe par le tunnel choisi.", icon: "checkmark.shield.fill" as const },
  error: { label: "Connexion interrompue", hint: "Consultez le diagnostic pour plus de détails.", icon: "exclamationmark.circle" as const },
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

  return <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right", "bottom"]}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}><Text className="text-sm font-semibold text-primary">KIGHMU VPN</Text><View style={[styles.brandMark, { backgroundColor: colors.primary }]}><IconSymbol name="shield.fill" size={22} color="#FFFFFF" /></View></View>
      <Text className="text-2xl font-bold text-foreground">Choisir un tunnel</Text>
      <Text className="mt-1 text-sm leading-5 text-muted">Les familles sont isolées. Le balancier ne combine jamais des profils de protocoles différents.</Text>
      <View style={styles.catalog}>{TUNNEL_KINDS.map((kind) => <Pressable key={kind} onPress={() => selectTunnel(kind)} style={({ pressed }) => [styles.tunnelChip, { backgroundColor: activeKind === kind ? TUNNEL_CATALOG[kind].accent : colors.surface, borderColor: activeKind === kind ? TUNNEL_CATALOG[kind].accent : colors.border }, pressed && styles.pressed]}><Text style={{ color: activeKind === kind ? "#fff" : colors.foreground, fontSize: 12, fontWeight: "800" }}>{TUNNEL_CATALOG[kind].shortLabel}</Text></Pressable>)}</View>
      <View style={[styles.statusCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.statusIcon, { backgroundColor: isConnected ? colors.success : status === "error" ? colors.error : TUNNEL_CATALOG[activeKind].accent }]}>{isBusy ? <ActivityIndicator color="#FFFFFF" /> : <IconSymbol name={copy.icon} size={28} color="#FFFFFF" />}</View>
        <Text className="mt-4 text-xl font-bold text-foreground">{copy.label}</Text><Text className="mt-1 text-center text-sm text-muted">{lastError ?? copy.hint}</Text>
        <Pressable onPress={canDisconnect ? disconnect : connect} accessibilityRole="button" style={({ pressed }) => [styles.primaryButton, { backgroundColor: canDisconnect ? colors.error : TUNNEL_CATALOG[activeKind].accent }, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>{isBusy ? "Annuler la connexion" : isConnected ? "Déconnecter" : `Connecter ${TUNNEL_CATALOG[activeKind].shortLabel}`}</Text></Pressable>
        <Pressable onPress={() => router.push("./configuration")} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><Text className="text-sm font-semibold text-primary">Gérer les profils</Text></Pressable>
      </View>
      <View style={[styles.profileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={styles.cardHeader}><View><Text className="text-base font-bold text-foreground">{TUNNEL_CATALOG[activeKind].label}</Text><Text className="mt-1 text-xs text-muted">{activeProfiles.length} profil{activeProfiles.length > 1 ? "s" : ""} sélectionné{activeProfiles.length > 1 ? "s" : ""}</Text></View><Pressable onPress={() => router.push("./configuration")}><IconSymbol name="pencil" size={20} color={colors.primary} /></Pressable></View>{activeProfiles.length === 0 ? <Text className="text-sm text-muted">Aucun profil sélectionné. Ouvrez la configuration pour en ajouter.</Text> : <>{activeProfiles.slice(0, 3).map((profile) => <View key={profile.id} style={styles.row}><Text numberOfLines={1} className="max-w-[38%] text-sm font-semibold text-foreground">{profile.name}</Text><Text numberOfLines={1} className="max-w-[57%] text-right text-sm text-muted">{profileEndpoint(profile)}</Text></View>)}{activeProfiles.length > 3 ? <Text className="mt-2 text-xs text-muted">+ {activeProfiles.length - 3} autre(s) profil(s) sélectionné(s)</Text> : null}</>}<View style={[styles.balancerNote, { borderColor: colors.border }]}><Text className="text-xs font-bold text-foreground">Balancier</Text><Text className="text-xs text-muted">{usesBalancer ? "Actif · round-robin avec contrôle de santé" : "Inactif · sortie SOCKS du profil choisi"}</Text></View></View>
      <Pressable onPress={() => router.push("./diagnostic")} style={({ pressed }) => [styles.diagnosticLink, pressed && styles.pressed]}><View style={[styles.diagnosticIcon, { backgroundColor: colors.background, borderColor: colors.border }]}><IconSymbol name="doc.text" size={20} color={colors.primary} /></View><View style={styles.diagnosticText}><Text className="text-sm font-bold text-foreground">Ouvrir le diagnostic</Text><Text className="mt-1 text-xs text-muted">Suivre le moteur, les profils et le balancier</Text></View><IconSymbol name="chevron.right" size={20} color={colors.muted} /></Pressable>
    </ScrollView>
  </ScreenContainer>;
}

const styles = StyleSheet.create({ content: { paddingBottom: 28, gap: 16 }, header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }, brandMark: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" }, catalog: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingTop: 2, paddingBottom: 2 }, tunnelChip: { width: "31.9%", minHeight: 40, borderRadius: 14, paddingHorizontal: 6, borderWidth: 1, alignItems: "center", justifyContent: "center" }, statusCard: { borderWidth: 1, borderRadius: 26, alignItems: "center", padding: 24 }, statusIcon: { width: 64, height: 64, borderRadius: 22, alignItems: "center", justifyContent: "center" }, primaryButton: { width: "100%", minHeight: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 22 }, primaryButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" }, secondaryButton: { minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 }, profileCard: { borderWidth: 1, borderRadius: 22, padding: 18 }, cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }, row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 }, balancerNote: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 10, paddingTop: 12, flexDirection: "row", justifyContent: "space-between", gap: 12 }, diagnosticLink: { flexDirection: "row", alignItems: "center", borderRadius: 18, padding: 12 }, diagnosticIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1 }, diagnosticText: { flex: 1, marginHorizontal: 12 }, pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] } });
