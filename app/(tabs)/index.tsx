import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useState } from "react";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { profileEndpoint, VpnMethodLabel } from "@/lib/vpn/profiles";
import { useVpn } from "@/lib/vpn/vpn-context";
import { useVpnSettings } from "@/lib/vpn/settings-context";
import { parseConfigurationImport, stringifyConfigurationExport } from "@/lib/vpn/config-transfer";

const statusCopy = {
  disconnected: { label: "Prêt à se connecter", hint: "Votre profil KIGHMU est en attente.", icon: "shield.fill" as const },
  connecting: { label: "Connexion en cours", hint: "Préparation du tunnel sécurisé…", icon: "arrow.triangle.2.circlepath" as const },
  connected: { label: "Tunnel actif", hint: "Le trafic passe par KIGHMU.", icon: "checkmark.shield.fill" as const },
  error: { label: "Connexion interrompue", hint: "Consultez le diagnostic pour plus de détails.", icon: "exclamationmark.circle" as const },
};

export default function HomeScreen() {
  const colors = useColors();
  const { profiles, primaryProfile, activeProfiles, status, lastError, connect, disconnect, importProfiles, resetProfiles } = useVpn();
  const { settings, updateSettings, resetSettings } = useVpnSettings();
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuBusy, setMenuBusy] = useState(false);
  const copy = statusCopy[status];
  const isBusy = status === "connecting";
  const isConnected = status === "connected";
  const canDisconnect = isBusy || isConnected;
  const endpoint = primaryProfile ? profileEndpoint(primaryProfile) : "Aucun profil enregistré";
  const method = primaryProfile ? VpnMethodLabel[primaryProfile.method] : "—";

  const exportConfiguration = async () => {
    setMenuBusy(true);
    try {
      const directory = FileSystem.documentDirectory;
      if (!directory) throw new Error("Stockage local indisponible");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const uri = `${directory}picko-config-${stamp}.json`;
      await FileSystem.writeAsStringAsync(uri, stringifyConfigurationExport(profiles, settings), { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/json", dialogTitle: "Exporter la configuration Picko" });
      else Alert.alert("Export créé", `Le fichier a été enregistré dans : ${uri}`);
    } catch (error) {
      Alert.alert("Export impossible", String(error).slice(0, 180));
    } finally {
      setMenuBusy(false);
    }
  };

  const importConfiguration = async () => {
    setMenuBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["application/json", "text/json"], copyToCacheDirectory: true, multiple: false });
      if (result.canceled || !result.assets?.[0]) return;
      const contents = await FileSystem.readAsStringAsync(result.assets[0].uri, { encoding: FileSystem.EncodingType.UTF8 });
      const imported = parseConfigurationImport(contents);
      Alert.alert("Importer la configuration", `${imported.profiles.length} profil(s) seront importés et les profils actuels seront remplacés. Les profils importés resteront désactivés par sécurité.`, [
        { text: "Annuler", style: "cancel" },
        { text: "Importer", onPress: () => { void (async () => {
          const accepted = await importProfiles(imported.profiles);
          if (accepted) {
            updateSettings(imported.settings);
            Alert.alert("Import terminé", `${imported.profiles.length} profil(s) ont été importés. Activez ceux à utiliser.`);
          } else Alert.alert("Import refusé", "La configuration contient au moins un profil invalide.");
        })(); } },
      ]);
    } catch (error) {
      Alert.alert("Import impossible", error instanceof Error ? error.message : "Le fichier ne peut pas être importé.");
    } finally {
      setMenuBusy(false);
    }
  };

  const resetConfiguration = () => Alert.alert("Réinitialiser Picko", "Tous les profils, mots de passe protégés et réglages VPN seront supprimés de cet appareil. Cette action est irréversible.", [
    { text: "Annuler", style: "cancel" },
    { text: "Réinitialiser", style: "destructive", onPress: () => { void (async () => {
      if (canDisconnect) await disconnect();
      await resetProfiles();
      resetSettings();
      Alert.alert("Réinitialisation terminée", "Les profils et réglages Picko ont été supprimés.");
    })(); } },
  ]);

  return (
    <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text className="text-sm font-semibold text-primary">KIGHMU VPN</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable onPress={() => setMenuVisible(true)} accessibilityRole="button" accessibilityLabel="Ouvrir le menu de configuration" style={({ pressed }) => [styles.settingsButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}>
              <IconSymbol name="ellipsis" size={22} color={colors.primary} />
            </Pressable>
            <Pressable onPress={() => router.push("/settings")} accessibilityRole="button" accessibilityLabel="Ouvrir les paramètres VPN" style={({ pressed }) => [styles.settingsButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}>
              <IconSymbol name="gearshape.fill" size={20} color={colors.primary} />
            </Pressable>
            <View style={[styles.brandMark, { backgroundColor: colors.primary }]}>
              <IconSymbol name="shield.fill" size={22} color="#FFFFFF" />
            </View>
          </View>
        </View>

        <View style={[styles.statusCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.statusIcon, { backgroundColor: isConnected ? colors.success : status === "error" ? colors.error : colors.primary }]}>
            {isBusy ? <ActivityIndicator color="#FFFFFF" /> : <IconSymbol name={copy.icon} size={28} color="#FFFFFF" />}
          </View>
          <Text className="mt-4 text-xl font-bold text-foreground">{copy.label}</Text>
          <Text className="mt-1 text-center text-sm text-muted">{lastError ?? copy.hint}</Text>
          <Pressable
            onPress={canDisconnect ? disconnect : connect}
            accessibilityRole="button"
            accessibilityLabel={isBusy ? "Annuler la connexion VPN" : isConnected ? "Déconnecter le VPN" : "Connecter le VPN"}
            style={({ pressed }) => [styles.primaryButton, { backgroundColor: canDisconnect ? colors.error : colors.primary }, pressed && styles.pressed]}
          >
            {isBusy ? <Text style={styles.primaryButtonText}>Annuler la connexion</Text> : <Text style={styles.primaryButtonText}>{isConnected ? "Déconnecter" : "Se connecter"}</Text>}
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
          <View style={styles.row}><Text className="text-sm text-muted">Méthode</Text><Text className="max-w-[62%] text-right text-sm font-semibold text-foreground">{method}</Text></View>
          <View style={styles.row}><Text className="text-sm text-muted">Serveur</Text><Text className="max-w-[62%] text-right text-sm font-semibold text-foreground">{endpoint}</Text></View>
          <View style={styles.row}><Text className="text-sm text-muted">Équilibrage</Text><Text className="text-sm font-semibold text-foreground">{activeProfiles.length} tunnel(s) actif(s)</Text></View>
          <View style={styles.row}><Text className="text-sm text-muted">Secrets</Text><Text className="text-sm font-semibold text-foreground">{primaryProfile?.password ? "Protégés" : "Non configurés"}</Text></View>
        </View>

        <Pressable onPress={() => router.push("./diagnostic")} style={({ pressed }) => [styles.diagnosticLink, pressed && styles.pressed]}>
          <View style={[styles.diagnosticIcon, { backgroundColor: colors.background, borderColor: colors.border }]}><IconSymbol name="doc.text" size={20} color={colors.primary} /></View>
          <View style={styles.diagnosticText}><Text className="text-sm font-bold text-foreground">Ouvrir le diagnostic</Text><Text className="mt-1 text-xs text-muted">Voir les événements détaillés et les erreurs</Text></View>
          <IconSymbol name="chevron.right" size={20} color={colors.muted} />
        </Pressable>
      </ScrollView>
      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setMenuVisible(false)}>
          <Pressable style={[styles.menu, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={(event) => event.stopPropagation()}>
            <Text className="mb-2 text-sm font-bold text-primary">CONFIGURATION</Text>
            <Pressable disabled={menuBusy} onPress={() => { setMenuVisible(false); void importConfiguration(); }} style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}><Text className="text-base font-semibold text-foreground">Importer config</Text><Text className="mt-1 text-xs text-muted">Choisir une sauvegarde Picko JSON</Text></Pressable>
            <Pressable disabled={menuBusy} onPress={() => { setMenuVisible(false); Alert.alert("Exporter la configuration", "Le fichier exporté contient les profils, réglages, identifiants et mots de passe de tunnel. Partagez-le uniquement avec une personne de confiance.", [{ text: "Annuler", style: "cancel" }, { text: "Exporter", onPress: () => { void exportConfiguration(); } }]); }} style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}><Text className="text-base font-semibold text-foreground">Exporter config</Text><Text className="mt-1 text-xs text-muted">Créer une sauvegarde JSON chiffrable hors de l’application</Text></Pressable>
            <Pressable disabled={menuBusy} onPress={() => { setMenuVisible(false); resetConfiguration(); }} style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}><Text style={{ color: colors.error, fontSize: 16, fontWeight: "700" }}>Réinitialiser</Text><Text className="mt-1 text-xs text-muted">Supprimer tous les profils et réglages locaux</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 28, gap: 16 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  settingsButton: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
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
  menuOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.48)", paddingTop: 76, paddingRight: 18, alignItems: "flex-end" },
  menu: { width: 290, borderWidth: 1, borderRadius: 18, padding: 14, gap: 4 },
  menuItem: { paddingVertical: 12, borderRadius: 12 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.65 },
});
