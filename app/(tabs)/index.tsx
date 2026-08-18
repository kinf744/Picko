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
      <Text className="text-2xl font-bold text-foreground">Sélectionner un tunnel</Text>
      <Text className="mt-1 text-sm leading-5 text-muted">Cochez un seul tunnel, puis connectez-le. Les profils et le balancier restent propres au tunnel choisi.</Text>
      <View style={styles.selectorPanel}>
        <Text style={styles.selectorTitle}>TUNNELS DISPONIBLES</Text>
        <View style={styles.checkboxGrid}>{TUNNEL_KINDS.map((kind) => {
          const selected = activeKind === kind;
          return <Pressable key={kind} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => selectTunnel(kind)} style={({ pressed }) => [styles.tunnelOption, pressed && styles.pressed]}>
            <View style={[styles.checkbox, selected && styles.checkboxSelected]}>{selected ? <Text style={styles.checkboxCheck}>✓</Text> : null}</View>
            <Text numberOfLines={2} style={[styles.tunnelOptionText, selected && styles.tunnelOptionTextSelected]}>{TUNNEL_CATALOG[kind].label}</Text>
          </Pressable>;
        })}</View>
        <View style={styles.selectorDivider} />
        <Text style={[styles.selectionStatus, { color: status === "error" ? "#FF8896" : "#AEB6C1" }]}>{lastError ?? copy.hint}</Text>
        <Pressable onPress={canDisconnect ? disconnect : connect} accessibilityRole="button" style={({ pressed }) => [styles.connectButton, { borderColor: canDisconnect ? "#F15B6C" : "#35C675" }, pressed && styles.pressed]}><View style={styles.buttonInner}>{isBusy ? <ActivityIndicator color="#35C675" /> : null}<Text style={[styles.connectButtonText, { color: canDisconnect ? "#F15B6C" : "#35C675" }]}>{isBusy ? "ANNULER" : isConnected ? "DÉCONNECTER" : "CONNECTER"}</Text></View></Pressable>
        <Text style={styles.selectedTunnelNote}>Tunnel sélectionné : {TUNNEL_CATALOG[activeKind].label}</Text>
      </View>
      <View style={[styles.profileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={styles.cardHeader}><View><Text className="text-base font-bold text-foreground">{TUNNEL_CATALOG[activeKind].label}</Text><Text className="mt-1 text-xs text-muted">{activeProfiles.length} profil{activeProfiles.length > 1 ? "s" : ""} sélectionné{activeProfiles.length > 1 ? "s" : ""}</Text></View><Pressable onPress={() => router.push("./configuration")}><IconSymbol name="pencil" size={20} color={colors.primary} /></Pressable></View>{activeProfiles.length === 0 ? <Text className="text-sm text-muted">Aucun profil sélectionné. Ouvrez la configuration pour en ajouter.</Text> : <>{activeProfiles.slice(0, 3).map((profile) => <View key={profile.id} style={styles.row}><Text numberOfLines={1} className="max-w-[38%] text-sm font-semibold text-foreground">{profile.name}</Text><Text numberOfLines={1} className="max-w-[57%] text-right text-sm text-muted">{profileEndpoint(profile)}</Text></View>)}{activeProfiles.length > 3 ? <Text className="mt-2 text-xs text-muted">+ {activeProfiles.length - 3} autre(s) profil(s) sélectionné(s)</Text> : null}</>}<View style={[styles.balancerNote, { borderColor: colors.border }]}><Text className="text-xs font-bold text-foreground">Balancier</Text><Text className="text-xs text-muted">{usesBalancer ? "Actif · round-robin avec contrôle de santé" : "Inactif · sortie SOCKS du profil choisi"}</Text></View></View>
      <Pressable onPress={() => router.push("./diagnostic")} style={({ pressed }) => [styles.diagnosticLink, pressed && styles.pressed]}><View style={[styles.diagnosticIcon, { backgroundColor: colors.background, borderColor: colors.border }]}><IconSymbol name="doc.text" size={20} color={colors.primary} /></View><View style={styles.diagnosticText}><Text className="text-sm font-bold text-foreground">Ouvrir le diagnostic</Text><Text className="mt-1 text-xs text-muted">Suivre le moteur, les profils et le balancier</Text></View><IconSymbol name="chevron.right" size={20} color={colors.muted} /></Pressable>
    </ScrollView>
  </ScreenContainer>;
}

const styles = StyleSheet.create({ content: { paddingBottom: 28, gap: 16 }, header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }, brandMark: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" }, selectorPanel: { backgroundColor: "#17191D", borderRadius: 22, padding: 20, marginTop: 2 }, selectorTitle: { color: "#7C8591", fontSize: 11, fontWeight: "800", letterSpacing: 1.1, marginBottom: 16 }, checkboxGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: 18 }, tunnelOption: { width: "50%", flexDirection: "row", alignItems: "center", paddingRight: 8, minHeight: 32 }, checkbox: { width: 25, height: 25, borderRadius: 3, borderWidth: 2, borderColor: "#626B76", alignItems: "center", justifyContent: "center", marginRight: 10 }, checkboxSelected: { backgroundColor: "#AAB1BA", borderColor: "#AAB1BA" }, checkboxCheck: { color: "#17191D", fontSize: 19, fontWeight: "900", lineHeight: 21 }, tunnelOptionText: { flex: 1, color: "#AEB6C1", fontSize: 13, fontWeight: "600", lineHeight: 17 }, tunnelOptionTextSelected: { color: "#F3F6F8" }, selectorDivider: { height: StyleSheet.hairlineWidth, backgroundColor: "#323840", marginTop: 19, marginBottom: 14 }, selectionStatus: { fontSize: 12, lineHeight: 17, textAlign: "center", marginBottom: 14 }, connectButton: { width: "100%", minHeight: 58, borderRadius: 4, borderWidth: 2, alignItems: "center", justifyContent: "center" }, buttonInner: { flexDirection: "row", alignItems: "center", gap: 9 }, connectButtonText: { fontSize: 16, fontWeight: "900", letterSpacing: 0.3 }, selectedTunnelNote: { color: "#7C8591", fontSize: 11, textAlign: "center", marginTop: 12 }, profileCard: { borderWidth: 1, borderRadius: 22, padding: 18 }, cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }, row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 }, balancerNote: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 10, paddingTop: 12, flexDirection: "row", justifyContent: "space-between", gap: 12 }, diagnosticLink: { flexDirection: "row", alignItems: "center", borderRadius: 18, padding: 12 }, diagnosticIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1 }, diagnosticText: { flex: 1, marginHorizontal: 12 }, pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] } });
