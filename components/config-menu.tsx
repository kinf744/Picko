import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";
import { parseConfigImport } from "@/lib/vpn/config-transfer";
import { TUNNEL_CATALOG, TUNNEL_KINDS, type TunnelKind } from "@/lib/vpn/tunnel-profiles";
import { useVpn } from "@/lib/vpn/vpn-context";

export function ConfigMenu() {
  const colors = useColors();
  const { profilesByKind, importConfig, buildConfigExport, resetAllProfiles } = useVpn();
  const [open, setOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [selectedKinds, setSelectedKinds] = useState<TunnelKind[]>([]);
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const availableKinds = useMemo(() => TUNNEL_KINDS.filter((kind) => profilesByKind[kind].length > 0), [profilesByKind]);

  useEffect(() => {
    setSelectedKinds((current) => current.filter((kind) => availableKinds.includes(kind)));
  }, [availableKinds]);

  const close = () => { setOpen(false); setExportOpen(false); setIncludeSecrets(false); };
  const toggleKind = (kind: TunnelKind) => setSelectedKinds((current) => current.includes(kind) ? current.filter((item) => item !== kind) : [...current, kind]);

  const importFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["application/json", "text/json", "text/plain"], copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      if ((asset.size ?? 0) > 1_000_000) { Alert.alert("Fichier refusé", "La configuration dépasse la limite de 1 Mo."); return; }
      const raw = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
      const preview = parseConfigImport(raw);
      const description = `${preview.importedProfiles} profil(s) pour ${preview.importedKinds.map((kind) => TUNNEL_CATALOG[kind].shortLabel).join(", ")}.${preview.skippedProfiles ? ` ${preview.skippedProfiles} profil(s) invalide(s) seront ignorés.` : ""}${preview.containsSecrets ? " Le fichier contient des secrets." : ""}`;
      Alert.alert("Importer la configuration", description, [
        { text: "Annuler", style: "cancel" },
        { text: "Ajouter", onPress: () => importConfig(raw, "append").catch(() => Alert.alert("Import impossible", "La configuration n’a pas pu être enregistrée.")) },
        { text: "Remplacer", style: "destructive", onPress: () => importConfig(raw, "replace-imported").catch(() => Alert.alert("Import impossible", "La configuration n’a pas pu être enregistrée.")) },
      ]);
      close();
    } catch (error) {
      Alert.alert("Import impossible", error instanceof Error ? error.message : "Le fichier sélectionné n’est pas compatible.");
    }
  };

  const exportFile = async () => {
    if (selectedKinds.length === 0) { Alert.alert("Sélection requise", "Choisissez au moins une famille qui contient des profils."); return; }
    try {
      const payload = buildConfigExport(selectedKinds, includeSecrets);
      const uri = `${FileSystem.cacheDirectory}kighmu-vpn-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      await FileSystem.writeAsStringAsync(uri, JSON.stringify(payload, null, 2), { encoding: FileSystem.EncodingType.UTF8 });
      if (!await Sharing.isAvailableAsync()) { Alert.alert("Export créé", "Le fichier a été préparé, mais le partage n’est pas disponible sur cet appareil."); return; }
      await Sharing.shareAsync(uri, { dialogTitle: "Exporter la configuration KIGHMU VPN", mimeType: "application/json" });
      close();
    } catch {
      Alert.alert("Export impossible", "Le fichier de configuration n’a pas pu être créé.");
    }
  };

  const confirmReset = () => Alert.alert("Réinitialiser tous les VPN ?", "Cette action supprime de cet appareil tous les profils, secrets et réglages de balancier. Elle ne peut pas être annulée.", [
    { text: "Annuler", style: "cancel" },
    { text: "Réinitialiser", style: "destructive", onPress: () => resetAllProfiles().catch(() => Alert.alert("Réinitialisation impossible", "Les données locales n’ont pas pu être effacées.")) },
  ]);

  return <><Pressable accessibilityRole="button" accessibilityLabel="Options de configuration" onPress={() => setOpen(true)} style={({ pressed }) => [styles.trigger, { backgroundColor: colors.surfaceRaised }, pressed && styles.pressed]}><MaterialIcons name="more-vert" size={23} color={colors.foreground} /></Pressable><Modal visible={open} transparent animationType="fade" statusBarTranslucent onRequestClose={close}><View style={styles.overlay}><Pressable style={StyleSheet.absoluteFill} onPress={close} /><View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>{exportOpen ? <><View style={styles.sheetHeader}><View><Text style={[styles.sheetTitle, { color: colors.foreground }]}>Exporter la configuration</Text><Text style={[styles.sheetSubtitle, { color: colors.muted }]}>Choisissez les familles à inclure dans le fichier JSON.</Text></View><Pressable onPress={() => setExportOpen(false)} style={({ pressed }) => [styles.close, { backgroundColor: colors.surfaceRaised }, pressed && styles.pressed]}><MaterialIcons name="close" size={19} color={colors.foreground} /></Pressable></View><ScrollView style={styles.selectionList} contentContainerStyle={styles.selectionContent} showsVerticalScrollIndicator={false}>{availableKinds.length === 0 ? <View style={[styles.empty, { backgroundColor: colors.surfaceRaised }]}><MaterialIcons name="folder-off" size={22} color={colors.muted} /><Text style={[styles.emptyText, { color: colors.muted }]}>Aucun profil n’est disponible à exporter.</Text></View> : availableKinds.map((kind) => { const selected = selectedKinds.includes(kind); return <Pressable key={kind} onPress={() => toggleKind(kind)} style={({ pressed }) => [styles.tunnelRow, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? `${colors.primary}12` : colors.surface }, pressed && styles.pressed]}><View style={[styles.checkbox, { backgroundColor: selected ? colors.primary : "transparent", borderColor: selected ? colors.primary : colors.border }]}>{selected ? <MaterialIcons name="check" size={15} color="#FFFFFF" /> : null}</View><View style={styles.tunnelCopy}><Text style={[styles.tunnelTitle, { color: colors.foreground }]}>{TUNNEL_CATALOG[kind].label}</Text><Text style={[styles.tunnelMeta, { color: colors.muted }]}>{profilesByKind[kind].length} profil{profilesByKind[kind].length > 1 ? "s" : ""}</Text></View></Pressable>; })}</ScrollView><View style={[styles.secretChoice, { backgroundColor: colors.surfaceRaised }]}><View style={styles.secretCopy}><Text style={[styles.secretTitle, { color: colors.foreground }]}>Inclure les secrets</Text><Text style={[styles.secretText, { color: colors.muted }]}>Désactivé par défaut. Activez-le uniquement si le fichier reste sous votre contrôle.</Text></View><Switch value={includeSecrets} onValueChange={setIncludeSecrets} trackColor={{ false: colors.border, true: colors.primary }} /></View><Pressable onPress={exportFile} style={({ pressed }) => [styles.exportButton, { backgroundColor: colors.primary, opacity: availableKinds.length ? 1 : 0.45 }, pressed && styles.pressed]} disabled={availableKinds.length === 0}><MaterialIcons name="ios-share" size={19} color="#FFFFFF" /><Text style={styles.exportText}>Créer et partager le fichier</Text></Pressable></> : <><View style={styles.sheetHeader}><View><Text style={[styles.sheetTitle, { color: colors.foreground }]}>Gestion de configuration</Text><Text style={[styles.sheetSubtitle, { color: colors.muted }]}>Importez, exportez ou effacez les données VPN locales.</Text></View><Pressable onPress={close} style={({ pressed }) => [styles.close, { backgroundColor: colors.surfaceRaised }, pressed && styles.pressed]}><MaterialIcons name="close" size={19} color={colors.foreground} /></Pressable></View><Pressable onPress={importFile} style={({ pressed }) => [styles.menuItem, { borderColor: colors.border }, pressed && styles.pressed]}><View style={[styles.menuIcon, { backgroundColor: colors.surfaceRaised }]}><MaterialIcons name="file-open" size={20} color={colors.primary} /></View><View style={styles.menuCopy}><Text style={[styles.menuTitle, { color: colors.foreground }]}>Importer une configuration</Text><Text style={[styles.menuText, { color: colors.muted }]}>Ajoutez ou remplacez les familles présentes dans un fichier JSON KIGHMU VPN.</Text></View><MaterialIcons name="chevron-right" size={21} color={colors.muted} /></Pressable><Pressable onPress={() => { setSelectedKinds(availableKinds); setExportOpen(true); }} style={({ pressed }) => [styles.menuItem, { borderColor: colors.border }, pressed && styles.pressed]}><View style={[styles.menuIcon, { backgroundColor: colors.surfaceRaised }]}><MaterialIcons name="file-upload" size={20} color={colors.primary} /></View><View style={styles.menuCopy}><Text style={[styles.menuTitle, { color: colors.foreground }]}>Exporter une configuration</Text><Text style={[styles.menuText, { color: colors.muted }]}>Sélectionnez une ou plusieurs familles et choisissez si les secrets sont inclus.</Text></View><MaterialIcons name="chevron-right" size={21} color={colors.muted} /></Pressable><Pressable onPress={() => { close(); confirmReset(); }} style={({ pressed }) => [styles.menuItem, { borderColor: colors.border }, pressed && styles.pressed]}><View style={[styles.menuIcon, { backgroundColor: `${colors.error}16` }]}><MaterialIcons name="restart-alt" size={20} color={colors.error} /></View><View style={styles.menuCopy}><Text style={[styles.menuTitle, { color: colors.error }]}>Réinitialiser tous les VPN</Text><Text style={[styles.menuText, { color: colors.muted }]}>Supprime les profils, secrets et réglages locaux après confirmation.</Text></View><MaterialIcons name="chevron-right" size={21} color={colors.muted} /></Pressable></>}</View></View></Modal></>;
}

const styles = StyleSheet.create({
  trigger: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(4, 13, 24, 0.45)" },
  sheet: { borderTopWidth: 1, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 30, gap: 10, maxHeight: "82%" },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 6 },
  sheetTitle: { fontSize: 19, fontWeight: "900" },
  sheetSubtitle: { marginTop: 5, fontSize: 12, lineHeight: 17, maxWidth: 265 },
  close: { width: 36, height: 36, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  menuItem: { minHeight: 86, borderWidth: 1, borderRadius: 17, padding: 13, flexDirection: "row", alignItems: "center", gap: 12 },
  menuIcon: { width: 42, height: 42, borderRadius: 14, justifyContent: "center", alignItems: "center" },
  menuCopy: { flex: 1 },
  menuTitle: { fontSize: 14, fontWeight: "900" },
  menuText: { marginTop: 4, fontSize: 11, lineHeight: 16 },
  selectionList: { maxHeight: 290 },
  selectionContent: { gap: 8 },
  tunnelRow: { minHeight: 62, borderWidth: 1, borderRadius: 16, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  checkbox: { width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  tunnelCopy: { flex: 1 },
  tunnelTitle: { fontSize: 13, fontWeight: "900" },
  tunnelMeta: { marginTop: 3, fontSize: 11 },
  secretChoice: { marginTop: 7, borderRadius: 16, padding: 13, flexDirection: "row", alignItems: "center", gap: 12 },
  secretCopy: { flex: 1 },
  secretTitle: { fontSize: 13, fontWeight: "900" },
  secretText: { marginTop: 4, fontSize: 11, lineHeight: 16 },
  exportButton: { minHeight: 53, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 6 },
  exportText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  empty: { borderRadius: 16, padding: 18, alignItems: "center", gap: 8 },
  emptyText: { fontSize: 12, textAlign: "center" },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
});
