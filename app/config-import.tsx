import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { Panel, PrimaryAction, StatusPill } from "@/components/kighmu-ui";
import { useColors } from "@/hooks/use-colors";
import { parseConfigImport, type ImportResult } from "@/lib/vpn/config-transfer";
import { TUNNEL_CATALOG } from "@/lib/vpn/tunnel-profiles";
import { useVpn } from "@/lib/vpn/vpn-context";

export default function ConfigImportScreen() {
  const colors = useColors();
  const { importConfig } = useVpn();
  const [raw, setRaw] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [working, setWorking] = useState(false);

  const selectFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["application/json", "text/json", "text/plain"], copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      if ((asset.size ?? 0) > 1_000_000) throw new Error("Le fichier dépasse la limite autorisée de 1 Mo.");
      const content = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
      setPreview(parseConfigImport(content));
      setRaw(content);
      setFileName(asset.name);
    } catch (error) {
      setPreview(null); setRaw(null);
      Alert.alert("Fichier non importé", error instanceof Error ? error.message : "Le fichier sélectionné n’est pas compatible.");
    }
  };

  const apply = (mode: "append" | "replace-imported") => {
    if (!raw || !preview) return;
    const modeLabel = mode === "append" ? "Ajouter" : "Remplacer";
    Alert.alert(`${modeLabel} la configuration ?`, mode === "append" ? "Les profils importés seront ajoutés aux familles existantes." : "Les familles présentes dans ce fichier remplaceront leurs collections locales.", [
      { text: "Annuler", style: "cancel" },
      { text: modeLabel, style: mode === "replace-imported" ? "destructive" : "default", onPress: () => { setWorking(true); importConfig(raw, mode).then(() => { Alert.alert("Import terminé", `${preview.importedProfiles} profil(s) ont été enregistrés.`); router.back(); }).catch(() => Alert.alert("Import impossible", "La configuration n’a pas pu être enregistrée.")).finally(() => setWorking(false)); } },
    ]);
  };

  return <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-5"><View style={styles.top}><Pressable onPress={() => router.back()} style={({ pressed }) => [styles.back, { backgroundColor: colors.surfaceRaised }, pressed && styles.pressed]}><MaterialIcons name="arrow-back" size={20} color={colors.foreground} /></Pressable><Text style={[styles.title, { color: colors.foreground }]}>Importer</Text><View style={styles.back} /></View><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}><Text style={[styles.intro, { color: colors.muted }]}>Choisissez un fichier JSON KIGHMU VPN. Son contenu est vérifié avant toute modification locale.</Text><Panel raised style={styles.filePanel}><MaterialIcons name="upload-file" size={30} color={colors.primary} /><Text style={[styles.fileTitle, { color: colors.foreground }]}>{preview ? fileName : "Aucun fichier sélectionné"}</Text><Text style={[styles.fileText, { color: colors.muted }]}>{preview ? "Le fichier est compatible et prêt à être appliqué." : "Les fichiers supérieurs à 1 Mo ou incompatibles sont refusés."}</Text><Pressable onPress={selectFile} style={({ pressed }) => [styles.pickButton, { borderColor: colors.border }, pressed && styles.pressed]}><MaterialIcons name="folder-open" size={18} color={colors.primary} /><Text style={[styles.pickText, { color: colors.primary }]}>{preview ? "Choisir un autre fichier" : "Choisir un fichier"}</Text></Pressable></Panel>{preview ? <Panel style={styles.preview}><View style={styles.previewTop}><View><Text style={[styles.previewTitle, { color: colors.foreground }]}>Aperçu de l’import</Text><Text style={[styles.previewMeta, { color: colors.muted }]}>{preview.importedProfiles} profil(s) valide(s)</Text></View><StatusPill label={preview.containsSecrets ? "Secrets inclus" : "Sans secrets"} tone={preview.containsSecrets ? "warning" : "success"} /></View>{preview.importedKinds.map((kind) => <View key={kind} style={[styles.familyLine, { borderTopColor: colors.border }]}><MaterialIcons name="tune" size={17} color={colors.primary} /><Text style={[styles.familyText, { color: colors.foreground }]}>{TUNNEL_CATALOG[kind].label}</Text><Text style={[styles.familyCount, { color: colors.muted }]}>{preview.tunnels.find((item) => item.kind === kind)?.profiles.length ?? 0} profil(s)</Text></View>)}{preview.skippedProfiles ? <Text style={[styles.warning, { color: colors.warning }]}>{preview.skippedProfiles} profil(s) invalide(s) seront ignorés.</Text> : null}</Panel> : null}</ScrollView>{preview ? <View style={[styles.actions, { borderTopColor: colors.border }]}><Pressable disabled={working} onPress={() => apply("append")} style={({ pressed }) => [styles.append, { borderColor: colors.border }, pressed && styles.pressed]}><Text style={[styles.appendText, { color: colors.primary }]}>Ajouter</Text></Pressable><PrimaryAction label={working ? "Importation…" : "Remplacer"} icon="download" tone="error" loading={working} onPress={() => apply("replace-imported")} /></View> : null}</ScreenContainer>;
}

const styles = StyleSheet.create({ top: { height: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, back: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" }, title: { fontSize: 17, fontWeight: "900" }, content: { gap: 16, paddingTop: 14, paddingBottom: 18 }, intro: { fontSize: 14, lineHeight: 20 }, filePanel: { minHeight: 230, alignItems: "center", justifyContent: "center", padding: 22 }, fileTitle: { marginTop: 12, fontSize: 15, fontWeight: "900", textAlign: "center" }, fileText: { marginTop: 7, fontSize: 12, textAlign: "center", lineHeight: 17 }, pickButton: { marginTop: 18, borderWidth: 1, borderRadius: 14, minHeight: 44, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 14 }, pickText: { fontSize: 13, fontWeight: "900" }, preview: { padding: 16 }, previewTop: { flexDirection: "row", justifyContent: "space-between", gap: 10 }, previewTitle: { fontSize: 16, fontWeight: "900" }, previewMeta: { marginTop: 5, fontSize: 12 }, familyLine: { minHeight: 44, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 12, paddingTop: 12, flexDirection: "row", alignItems: "center", gap: 8 }, familyText: { flex: 1, fontSize: 13, fontWeight: "800" }, familyCount: { fontSize: 11 }, warning: { marginTop: 12, fontSize: 12, lineHeight: 17, fontWeight: "700" }, actions: { borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: 10, paddingVertical: 14 }, append: { flex: 0.8, minHeight: 52, borderRadius: 15, borderWidth: 1, justifyContent: "center", alignItems: "center" }, appendText: { fontSize: 14, fontWeight: "900" }, pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] } });
