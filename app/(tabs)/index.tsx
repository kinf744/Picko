import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useState } from "react";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Clipboard from "expo-clipboard";
import { ScreenContainer } from "@/components/screen-container";
import { KmuExportDialog } from "@/components/vpn/kmu-export-dialog";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useVpn } from "@/lib/vpn/vpn-context";
import { useVpnSettings } from "@/lib/vpn/settings-context";
import { parseConfigurationImport } from "@/lib/vpn/config-transfer";
import { getNativeVpn } from "@/lib/vpn/native";
import { VpnMethodLabel, type TunnelMethod } from "@/lib/vpn/profiles";

const methodOptions: TunnelMethod[] = ["http-proxy-payload", "ssh-ssl-tls", "ssh-slowdns", "xray", "v2ray-dns", "hysteria-udp", "zivpn-udp"];

export default function HomeScreen() {
  const colors = useColors();
  const { profiles, activeProfiles, status, connect, disconnect, importProfiles, resetProfiles, setMethodEnabled } = useVpn();
  const { settings, updateSettings, resetSettings } = useVpnSettings();
  const [menuVisible, setMenuVisible] = useState(false);
  const [exportVisible, setExportVisible] = useState(false);
  const [menuBusy, setMenuBusy] = useState(false);
  const canDisconnect = status !== "disconnected";
  const isConnecting = status === "connecting";
  const selectedTunnelCount = activeProfiles.length;

  const toggleMethod = (method: TunnelMethod) => {
    const methodProfiles = profiles.filter((profile) => profile.method === method);
    if (methodProfiles.length === 0) return;
    void setMethodEnabled(method, !methodProfiles.every((profile) => profile.enabled));
  };

  const toggleConnection = () => {
    if (canDisconnect) void disconnect();
    else void connect();
  };

  const applyImportedConfiguration = async (contents: string) => {
    const hardwareId = (() => { try { return getNativeVpn()?.getHardwareId?.(); } catch { return undefined; } })();
    const imported = parseConfigurationImport(contents, { hardwareId });
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
  };

  const importFromFile = async () => {
    setMenuBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["application/vnd.kighmu.config", "application/octet-stream", "text/plain"], copyToCacheDirectory: true, multiple: false });
      if (result.canceled || !result.assets?.[0]) return;
      const contents = await FileSystem.readAsStringAsync(result.assets[0].uri, { encoding: FileSystem.EncodingType.UTF8 });
      await applyImportedConfiguration(contents);
    } catch (error) {
      Alert.alert("Import impossible", error instanceof Error ? error.message : "Le fichier ne peut pas être importé.");
    } finally {
      setMenuBusy(false);
    }
  };

  const importFromClipboard = async () => {
    setMenuBusy(true);
    try {
      const contents = await Clipboard.getStringAsync();
      if (!contents.trim()) throw new Error("Le presse-papiers ne contient aucune configuration.");
      await applyImportedConfiguration(contents);
    } catch (error) {
      Alert.alert("Import impossible", error instanceof Error ? error.message : "Le lien ne peut pas être importé.");
    } finally {
      setMenuBusy(false);
    }
  };

  const importConfiguration = () => Alert.alert("Importer une configuration", "Choisissez un fichier .kmu ou un lien kighmu:// déjà copié dans le presse-papiers.", [
    { text: "Annuler", style: "cancel" },
    { text: "Fichier .kmu", onPress: () => { void importFromFile(); } },
    { text: "Presse-papiers", onPress: () => { void importFromClipboard(); } },
  ]);

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
    <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right", "bottom"]} swipeTabs>
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

        <View style={[styles.methodSelector, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text className="text-base font-bold text-foreground">Choisir les tunnels</Text>
          <View style={styles.methodGrid}>
            {methodOptions.map((method) => {
              const methodProfiles = profiles.filter((profile) => profile.method === method);
              const enabledProfiles = methodProfiles.filter((profile) => profile.enabled);
              const available = methodProfiles.length > 0;
              const selected = available && enabledProfiles.length === methodProfiles.length;
              const partial = available && enabledProfiles.length > 0 && !selected;
              return <Pressable key={method} disabled={!available} onPress={() => toggleMethod(method)} accessibilityRole="checkbox" accessibilityState={{ checked: selected, disabled: !available }} accessibilityLabel={`${VpnMethodLabel[method]} : ${available ? `${methodProfiles.length} profil(s) configuré(s)` : "aucun profil configuré"}`} style={({ pressed }) => [styles.methodOption, !available && styles.methodUnavailable, pressed && available && styles.pressed]}>
                <View style={[styles.checkbox, { borderColor: selected || partial ? colors.success : colors.muted, backgroundColor: selected || partial ? colors.success : "transparent" }]}>
                  {selected ? <Text style={styles.checkboxMark}>✓</Text> : partial ? <Text style={styles.checkboxMark}>−</Text> : null}
                </View>
                <View style={styles.methodText}><Text className="text-base font-semibold text-foreground">{VpnMethodLabel[method]}</Text><Text className="mt-1 text-xs text-muted">{available ? `${enabledProfiles.length}/${methodProfiles.length} profil(s) sélectionné(s)` : "Créer un profil dans Configuration"}</Text></View>
              </Pressable>;
            })}
          </View>
          <Pressable disabled={selectedTunnelCount === 0 && !canDisconnect} onPress={toggleConnection} accessibilityRole="button" accessibilityLabel={canDisconnect ? "Déconnecter les tunnels sélectionnés" : "Connecter les tunnels sélectionnés"} style={({ pressed }) => [styles.connectButton, { borderColor: canDisconnect ? colors.error : colors.success, backgroundColor: "transparent" }, selectedTunnelCount === 0 && !canDisconnect && styles.connectDisabled, pressed && styles.pressed]}>
            <Text style={{ color: canDisconnect ? colors.error : colors.success, fontSize: 17, fontWeight: "800" }}>{isConnecting ? "ANNULER" : canDisconnect ? "DÉCONNECTER" : "CONNECTER"}</Text>
          </Pressable>
          <Pressable onPress={() => router.push("./configuration")} style={({ pressed }) => [styles.configurationLink, pressed && styles.pressed]}><Text style={{ color: colors.primary, fontWeight: "700" }}>Gérer les profils dans Configuration</Text></Pressable>
        </View>
      </ScrollView>
      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setMenuVisible(false)}>
          <Pressable style={[styles.menu, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={(event) => event.stopPropagation()}>
            <Text className="mb-2 text-sm font-bold text-primary">CONFIGURATION</Text>
            <Pressable disabled={menuBusy} onPress={() => { setMenuVisible(false); importConfiguration(); }} style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}><Text className="text-base font-semibold text-foreground">Importer config</Text><Text className="mt-1 text-xs text-muted">Fichier .kmu ou lien kighmu:// du presse-papiers</Text></Pressable>
            <Pressable disabled={menuBusy} onPress={() => { setMenuVisible(false); setExportVisible(true); }} style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}><Text className="text-base font-semibold text-foreground">Exporter config</Text><Text className="mt-1 text-xs text-muted">Créer un fichier .kmu ou copier un lien kighmu://</Text></Pressable>
            <Pressable disabled={menuBusy} onPress={() => { setMenuVisible(false); resetConfiguration(); }} style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}><Text style={{ color: colors.error, fontSize: 16, fontWeight: "700" }}>Réinitialiser</Text><Text className="mt-1 text-xs text-muted">Supprimer tous les profils et réglages locaux</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      <KmuExportDialog visible={exportVisible} profiles={profiles} settings={settings} onClose={() => setExportVisible(false)} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 28, gap: 16 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  settingsButton: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  brandMark: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  methodSelector: { borderWidth: 1, borderRadius: 24, padding: 18, gap: 16 },
  methodGrid: { flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 12 },
  methodOption: { width: "47%", flexDirection: "row", alignItems: "center", minHeight: 54 },
  methodUnavailable: { opacity: 0.46 },
  checkbox: { width: 28, height: 28, borderWidth: 2, borderRadius: 6, alignItems: "center", justifyContent: "center", marginRight: 10 },
  checkboxMark: { color: "#FFFFFF", fontWeight: "900", fontSize: 20, lineHeight: 21 },
  methodText: { flex: 1 },
  connectButton: { minHeight: 56, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  connectDisabled: { opacity: 0.4 },
  configurationLink: { minHeight: 34, alignItems: "center", justifyContent: "center" },
  menuOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.48)", paddingTop: 76, paddingRight: 18, alignItems: "flex-end" },
  menu: { width: 290, borderWidth: 1, borderRadius: 18, padding: 14, gap: 4 },
  menuItem: { paddingVertical: 12, borderRadius: 12 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.65 },
});
