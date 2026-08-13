import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useVpn } from "@/lib/vpn/vpn-context";

const statusCopy = {
  disconnected: { label: "Prêt à se connecter", hint: "Votre profil KIGHMU est en attente.", icon: "shield.fill" as const },
  connecting: { label: "Connexion en cours", hint: "Préparation du tunnel sécurisé…", icon: "arrow.triangle.2.circlepath" as const },
  connected: { label: "Tunnel actif", hint: "Le trafic passe par KIGHMU.", icon: "checkmark.shield.fill" as const },
  error: { label: "Connexion interrompue", hint: "Consultez le diagnostic pour plus de détails.", icon: "exclamationmark.circle" as const },
};

export default function HomeScreen() {
  const colors = useColors();
  const { config, status, lastError, connect, disconnect } = useVpn();
  const copy = statusCopy[status];
  const isBusy = status === "connecting";
  const isConnected = status === "connected";
  const endpoint = config.host ? `${config.host}:${config.port || "—"}` : "Aucun profil enregistré";

  return (
    <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text className="text-sm font-semibold text-primary">KIGHMU VPN</Text>
          </View>
          <View style={[styles.brandMark, { backgroundColor: colors.primary }]}>
            <IconSymbol name="shield.fill" size={22} color="#FFFFFF" />
          </View>
        </View>

        <View style={[styles.statusCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.statusIcon, { backgroundColor: isConnected ? colors.success : status === "error" ? colors.error : colors.primary }]}>
            {isBusy ? <ActivityIndicator color="#FFFFFF" /> : <IconSymbol name={copy.icon} size={28} color="#FFFFFF" />}
          </View>
          <Text className="mt-4 text-xl font-bold text-foreground">{copy.label}</Text>
          <Text className="mt-1 text-center text-sm text-muted">{lastError ?? copy.hint}</Text>
          <Pressable
            onPress={isConnected ? disconnect : connect}
            disabled={isBusy}
            style={({ pressed }) => [styles.primaryButton, { backgroundColor: isConnected ? colors.error : colors.primary }, pressed && styles.pressed, isBusy && styles.disabled]}
          >
            {isBusy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>{isConnected ? "Déconnecter" : "Se connecter"}</Text>}
          </Pressable>
          <Pressable onPress={() => router.push("./configuration")} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
            <Text className="text-sm font-semibold text-primary">Modifier la configuration</Text>
          </Pressable>
        </View>

        <View style={[styles.profileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <Text className="text-base font-bold text-foreground">Profil actif</Text>
            <Pressable onPress={() => router.push("./configuration")}><IconSymbol name="pencil" size={20} color={colors.primary} /></Pressable>
          </View>
          <View style={styles.row}><Text className="text-sm text-muted">Serveur</Text><Text className="max-w-[62%] text-right text-sm font-semibold text-foreground">{endpoint}</Text></View>
          <View style={styles.row}><Text className="text-sm text-muted">Obfs</Text><Text className="text-sm font-semibold text-foreground">{config.obfs ? "Configuré" : "Non configuré"}</Text></View>
          <View style={styles.row}><Text className="text-sm text-muted">Mot de passe</Text><Text className="text-sm font-semibold text-foreground">{config.password ? "Protégé" : "Non configuré"}</Text></View>
        </View>

        <Pressable onPress={() => router.push("./diagnostic")} style={({ pressed }) => [styles.diagnosticLink, pressed && styles.pressed]}>
          <View style={[styles.diagnosticIcon, { backgroundColor: colors.background, borderColor: colors.border }]}><IconSymbol name="doc.text" size={20} color={colors.primary} /></View>
          <View style={styles.diagnosticText}><Text className="text-sm font-bold text-foreground">Ouvrir le diagnostic</Text><Text className="mt-1 text-xs text-muted">Voir les événements détaillés et les erreurs</Text></View>
          <IconSymbol name="chevron.right" size={20} color={colors.muted} />
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 28, gap: 16 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  brandMark: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  statusCard: { borderWidth: 1, borderRadius: 26, alignItems: "center", padding: 24 },
  statusIcon: { width: 64, height: 64, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  primaryButton: { width: "100%", minHeight: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 22 },
  primaryButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  secondaryButton: { minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  profileCard: { borderWidth: 1, borderRadius: 22, padding: 18 },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 9 },
  diagnosticLink: { flexDirection: "row", alignItems: "center", borderRadius: 18, padding: 12 },
  diagnosticIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  diagnosticText: { flex: 1, marginHorizontal: 12 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.65 },
});
