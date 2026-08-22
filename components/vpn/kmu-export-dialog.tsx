import { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { useColors } from "@/hooks/use-colors";
import { createKighmuUri, DEFAULT_DISTRIBUTION_POLICY, stringifyConfigurationExport, suggestedKmuFileName, type KighmuDistributionPolicy } from "@/lib/vpn/config-transfer";
import { profileEndpoint, VpnMethodLabel, type VpnProfile } from "@/lib/vpn/profiles";
import { getNativeVpn } from "@/lib/vpn/native";
import type { VpnRuntimeSettings } from "@/lib/vpn/settings-context";

type BooleanPolicy = Exclude<keyof KighmuDistributionPolicy, "deviceId" | "expiresAt" | "userMessage">;

const policyOptions: { key: BooleanPolicy; label: string; hint: string; applied: boolean }[] = [
  { key: "mobileDataOnly", label: "Réseau de données mobiles uniquement", hint: "Conservé dans la politique de distribution.", applied: false },
  { key: "lockMobileCarrier", label: "Verrouiller l’opérateur mobile", hint: "Nécessite une vérification opérateur gérée par une infrastructure externe.", applied: false },
  { key: "requireDeviceAttestation", label: "Attester l’appareil", hint: "Nécessite une intégration Play Integrity et un serveur de vérification.", applied: false },
  { key: "blockRootedDevice", label: "Bloquer l’appareil rooté", hint: "Indicateur de politique ; une détection de root n’est jamais infaillible localement.", applied: false },
  { key: "playStoreOnly", label: "Installation Play Store uniquement", hint: "Indicateur de politique destiné à une vérification de distribution externe.", applied: false },
  { key: "lockDeviceId", label: "Verrouillage de l’ID de l’appareil", hint: "Appliqué par Picko à l’import : seul le Hardware ID indiqué pourra importer ce bloc.", applied: true },
  { key: "preventTunnelOverride", label: "Empêcher l’écrasement du tunnel et du serveur", hint: "Politique de distribution conservée dans le bloc exporté.", applied: false },
  { key: "readOnly", label: "Verrouiller toute la configuration (lecture seule)", hint: "Politique de distribution conservée dans le bloc exporté.", applied: false },
  { key: "blockTorrent", label: "Interdire le torrent", hint: "Nécessite un filtrage réseau serveur ou une inspection de trafic dédiée.", applied: false },
  { key: "gameModeOnly", label: "Mode Jeu (seuls les jeux utilisent le VPN)", hint: "Nécessite une sélection d’applications Android par l’utilisateur.", applied: false },
];

export function KmuExportDialog({ visible, profiles, settings, onClose }: { visible: boolean; profiles: VpnProfile[]; settings: VpnRuntimeSettings; onClose: () => void }) {
  const colors = useColors();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [fileBaseName, setFileBaseName] = useState("kighmu_config");
  const [policy, setPolicy] = useState<KighmuDistributionPolicy>(DEFAULT_DISTRIBUTION_POLICY);
  const [busy, setBusy] = useState(false);
  const hardwareId = useMemo(() => {
    try { return getNativeVpn()?.getHardwareId?.() ?? ""; } catch { return ""; }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    setSelectedIds(profiles.map((profile) => profile.id));
    setFileBaseName("kighmu_config");
    setPolicy(DEFAULT_DISTRIBUTION_POLICY);
  }, [visible, profiles]);

  const selectedProfiles = profiles.filter((profile) => selectedIds.includes(profile.id));
  const effectivePolicy = { ...policy, deviceId: policy.lockDeviceId ? (policy.deviceId || hardwareId) : "" };
  const toggleProfile = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const togglePolicy = (key: BooleanPolicy) => setPolicy((current) => ({ ...current, [key]: !current[key] }));

  const ensureProfiles = () => {
    if (selectedProfiles.length > 0) return true;
    Alert.alert("Aucun tunnel sélectionné", "Sélectionnez au moins un profil de tunnel à inclure dans l’export.");
    return false;
  };

  const exportFile = async () => {
    if (!ensureProfiles()) return;
    setBusy(true);
    try {
      const directory = FileSystem.documentDirectory;
      if (!directory) throw new Error("Stockage local indisponible");
      const uri = `${directory}${suggestedKmuFileName(fileBaseName)}`;
      const contents = stringifyConfigurationExport(selectedProfiles, settings, effectivePolicy);
      await FileSystem.writeAsStringAsync(uri, contents, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/vnd.kighmu.config", dialogTitle: "Exporter le bloc Kighmu .kmu" });
      else Alert.alert("Fichier créé", `Le bloc .kmu est enregistré dans : ${uri}`);
    } catch (error) {
      Alert.alert("Export .kmu impossible", String(error).slice(0, 180));
    } finally {
      setBusy(false);
    }
  };

  const copyUri = async () => {
    if (!ensureProfiles()) return;
    setBusy(true);
    try {
      const uri = createKighmuUri(selectedProfiles, settings, effectivePolicy);
      await Clipboard.setStringAsync(uri);
      Alert.alert("Lien copié", "Le bloc kighmu:// a été copié dans le presse-papiers. Il peut être importé directement par Picko.");
    } catch (error) {
      Alert.alert("Copie impossible", String(error).slice(0, 180));
    } finally {
      setBusy(false);
    }
  };

  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderColor: colors.border }]}><View><Text className="text-2xl font-bold text-foreground">Exporter une configuration</Text><Text className="mt-1 text-sm text-muted">Créez un bloc Kighmu adapté à vos tunnels.</Text></View><Pressable onPress={onClose} style={({ pressed }) => [styles.close, { borderColor: colors.border }, pressed && styles.pressed]}><Text style={{ color: colors.primary, fontWeight: "700" }}>Fermer</Text></Pressable></View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Section title="Tunnels à inclure"><View style={styles.checkList}>{profiles.length === 0 ? <Text className="text-sm text-muted">Aucun profil enregistré.</Text> : profiles.map((profile) => <Pressable key={profile.id} onPress={() => toggleProfile(profile.id)} style={[styles.checkRow, { borderColor: colors.border, backgroundColor: colors.surface }]}><Check checked={selectedIds.includes(profile.id)} /><View style={styles.checkCopy}><Text className="text-base font-semibold text-foreground">{profile.name}</Text><Text className="mt-1 text-xs text-muted">{VpnMethodLabel[profile.method]} · {profileEndpoint(profile)}</Text></View></Pressable>)}</View></Section>
        <Section title="Nom du fichier"><TextInput value={fileBaseName} onChangeText={setFileBaseName} placeholder="kighmu_config" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} /><Text className="mt-2 text-sm text-muted">Le fichier sera créé avec l’extension <Text className="font-bold">.kmu</Text>.</Text></Section>
        <Section title="Politiques de distribution"><Text className="mb-2 text-sm leading-5 text-muted">Ces valeurs sont rassemblées dans le même bloc `.kmu` ou `kighmu://`. Les options décrites comme appliquées sont vérifiées par Picko à l’import ; les autres sont conservées comme politiques de distribution et nécessitent le contrôle indiqué.</Text><View style={styles.policyList}>{policyOptions.map((option) => <View key={option.key} style={[styles.policyRow, { borderColor: colors.border, backgroundColor: colors.surface }]}><View style={styles.policyCopy}><Text className="text-base font-semibold text-foreground">{option.label}</Text><Text className="mt-1 text-xs leading-4 text-muted">{option.hint}</Text>{option.applied ? <Text className="mt-1 text-xs font-bold text-primary">Appliqué à l’import Picko</Text> : null}</View><Switch value={policy[option.key]} onValueChange={() => togglePolicy(option.key)} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" /></View>)}</View></Section>
        {policy.lockDeviceId ? <Section title="Verrouillage de l’appareil"><TextInput value={effectivePolicy.deviceId} editable={false} selectTextOnFocus style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} /><Text className="mt-2 text-sm text-muted">Le Hardware ID de cet appareil sera inscrit dans le bloc et contrôlé pendant l’import.</Text></Section> : null}
        <Section title="Expiration"><TextInput value={policy.expiresAt} onChangeText={(expiresAt) => setPolicy((current) => ({ ...current, expiresAt }))} placeholder="2027-12-31T23:59:59Z (facultatif)" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} /><Text className="mt-2 text-sm text-muted">Une date ISO valide est contrôlée par Picko à l’import.</Text></Section>
        <Section title="Message / notes pour les utilisateurs"><TextInput value={policy.userMessage} onChangeText={(userMessage) => setPolicy((current) => ({ ...current, userMessage }))} placeholder="Message optionnel (HTML stocké comme texte)" placeholderTextColor={colors.muted} multiline style={[styles.input, styles.notes, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} /></Section>
        <View style={[styles.warning, { borderColor: colors.warning, backgroundColor: colors.surface }]}><Text style={{ color: colors.warning, fontWeight: "800" }}>Données sensibles</Text><Text className="mt-1 text-sm leading-5 text-muted">Les deux formats peuvent contenir les identifiants, mots de passe et clés de vos tunnels. Partagez-les uniquement avec des personnes de confiance.</Text></View>
        <View style={styles.actions}><Pressable disabled={busy} onPress={() => void exportFile()} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary }, pressed && styles.pressed, busy && styles.disabled]}><Text style={styles.primaryText}>Créer le fichier .kmu</Text></Pressable><Pressable disabled={busy} onPress={() => void copyUri()} style={({ pressed }) => [styles.secondaryButton, { borderColor: colors.primary }, pressed && styles.pressed, busy && styles.disabled]}><Text style={{ color: colors.primary, fontWeight: "700" }}>Copier kighmu://</Text></Pressable></View>
      </ScrollView>
    </View>
  </Modal>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <View style={styles.section}><Text className="text-sm font-bold text-primary">{title.toUpperCase()}</Text><View className="mt-2">{children}</View></View>; }
function Check({ checked }: { checked: boolean }) { const colors = useColors(); return <View style={[styles.checkbox, { borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary : "transparent" }]}>{checked ? <Text style={styles.checkMark}>✓</Text> : null}</View>; }

const styles = StyleSheet.create({
  container: { flex: 1 }, header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 }, close: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 }, content: { padding: 20, paddingBottom: 40, gap: 24 }, section: { gap: 6 }, checkList: { gap: 9 }, checkRow: { borderWidth: 1, borderRadius: 15, padding: 13, flexDirection: "row", alignItems: "center" }, checkbox: { width: 26, height: 26, borderWidth: 2, borderRadius: 7, alignItems: "center", justifyContent: "center", marginRight: 12 }, checkMark: { color: "#FFFFFF", fontSize: 18, fontWeight: "800" }, checkCopy: { flex: 1 }, input: { minHeight: 50, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, fontSize: 16 }, notes: { minHeight: 110, paddingTop: 12, textAlignVertical: "top" }, policyList: { gap: 9 }, policyRow: { borderWidth: 1, borderRadius: 15, padding: 13, flexDirection: "row", gap: 12, alignItems: "center" }, policyCopy: { flex: 1 }, warning: { borderWidth: 1, borderRadius: 16, padding: 14 }, actions: { gap: 10 }, primaryButton: { minHeight: 52, borderRadius: 15, alignItems: "center", justifyContent: "center" }, primaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" }, secondaryButton: { minHeight: 50, borderRadius: 15, borderWidth: 1, alignItems: "center", justifyContent: "center" }, pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] }, disabled: { opacity: 0.55 },
});
