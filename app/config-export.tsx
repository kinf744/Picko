import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { Panel, PrimaryAction } from "@/components/kighmu-ui";
import { useColors } from "@/hooks/use-colors";
import { TUNNEL_CATALOG, TUNNEL_KINDS, type TunnelKind } from "@/lib/vpn/tunnel-profiles";
import { useVpn } from "@/lib/vpn/vpn-context";

export default function ConfigExportScreen() {
  const colors = useColors();
  const { profilesByKind, buildConfigExport } = useVpn();
  const availableKinds = useMemo(() => TUNNEL_KINDS.filter((kind) => profilesByKind[kind].length > 0), [profilesByKind]);
  const [selected, setSelected] = useState<TunnelKind[]>([]);
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [fileName, setFileName] = useState("kighmu-vpn-config");
  const [working, setWorking] = useState(false);
  useEffect(() => setSelected(availableKinds), [availableKinds]);
  const toggle = (kind: TunnelKind) => setSelected((current) => current.includes(kind) ? current.filter((item) => item !== kind) : [...current, kind]);
  const createFile = async () => {
    if (selected.length === 0) { Alert.alert("Sélection requise", "Choisissez au moins une famille de tunnel à exporter."); return; }
    const execute = async () => {
      try {
        setWorking(true);
        const directory = FileSystem.cacheDirectory;
        if (!directory) throw new Error("Dossier de cache indisponible.");
        const safeName = fileName.trim().replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 48) || "kighmu-vpn-config";
        const uri = `${directory}${safeName}.json`;
        await FileSystem.writeAsStringAsync(uri, JSON.stringify(buildConfigExport(selected, includeSecrets), null, 2), { encoding: FileSystem.EncodingType.UTF8 });
        if (!await Sharing.isAvailableAsync()) { Alert.alert("Fichier créé", "Le fichier est prêt, mais le partage n’est pas disponible sur cet appareil."); return; }
        await Sharing.shareAsync(uri, { dialogTitle: "Exporter la configuration KIGHMU VPN", mimeType: "application/json" });
      } catch (error) { Alert.alert("Export impossible", error instanceof Error ? error.message : "Le fichier n’a pas pu être créé."); } finally { setWorking(false); }
    };
    if (includeSecrets) Alert.alert("Inclure les secrets ?", "Le fichier contiendra potentiellement des mots de passe, clés, liens ou valeurs Obfs. Ne le partagez qu’avec une personne ou un stockage de confiance.", [{ text: "Annuler", style: "cancel" }, { text: "Continuer", style: "destructive", onPress: () => { void execute(); } }]);
    else void execute();
  };
  return <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-5"><View style={styles.top}><Pressable onPress={() => router.back()} style={({ pressed }) => [styles.back, { backgroundColor: colors.surfaceRaised }, pressed && styles.pressed]}><MaterialIcons name="arrow-back" size={20} color={colors.foreground} /></Pressable><Text style={[styles.title, { color: colors.foreground }]}>Exporter</Text><View style={styles.back} /></View><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}><Text style={[styles.intro, { color: colors.muted }]}>Créez un fichier portable avec une ou plusieurs familles de tunnel. Les secrets restent exclus tant que vous ne les activez pas volontairement.</Text><Panel style={styles.namePanel}><Text style={[styles.label, { color: colors.foreground }]}>Nom du fichier</Text><TextInput value={fileName} onChangeText={setFileName} placeholder="kighmu-vpn-config" placeholderTextColor={colors.muted} autoCapitalize="none" style={[styles.input, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.foreground }]} /><Text style={[styles.helper, { color: colors.muted }]}>Le suffixe .json est ajouté automatiquement.</Text></Panel><Panel style={styles.selection}><View style={styles.selectionHead}><Text style={[styles.label, { color: colors.foreground }]}>Familles à exporter</Text><Pressable onPress={() => setSelected(selected.length === availableKinds.length ? [] : availableKinds)}><Text style={[styles.selectAll, { color: colors.primary }]}>{selected.length === availableKinds.length ? "Tout retirer" : "Tout sélectionner"}</Text></Pressable></View>{availableKinds.length === 0 ? <Text style={[styles.helper, { color: colors.muted }]}>Aucun profil n’est disponible à exporter.</Text> : availableKinds.map((kind) => { const checked = selected.includes(kind); return <Pressable key={kind} onPress={() => toggle(kind)} style={({ pressed }) => [styles.kindRow, { borderTopColor: colors.border }, pressed && styles.pressed]}><View style={[styles.box, { backgroundColor: checked ? colors.primary : "transparent", borderColor: checked ? colors.primary : colors.border }]}>{checked ? <MaterialIcons name="check" size={15} color="#FFFFFF" /> : null}</View><View style={styles.kindCopy}><Text style={[styles.kindTitle, { color: colors.foreground }]}>{TUNNEL_CATALOG[kind].label}</Text><Text style={[styles.kindMeta, { color: colors.muted }]}>{profilesByKind[kind].length} profil{profilesByKind[kind].length > 1 ? "s" : ""}</Text></View></Pressable>; })}</Panel><Panel raised style={styles.secret}><View style={styles.secretCopy}><Text style={[styles.label, { color: colors.foreground }]}>Inclure les secrets</Text><Text style={[styles.helper, { color: colors.muted }]}>Option désactivée par défaut. Les mots de passe, clés et données d’accès seront écrits dans le fichier si vous l’activez.</Text></View><Switch value={includeSecrets} onValueChange={setIncludeSecrets} trackColor={{ false: colors.border, true: colors.primary }} /></Panel></ScrollView><View style={[styles.action, { borderTopColor: colors.border }]}><PrimaryAction label={working ? "Préparation…" : "Créer et partager le fichier"} icon="ios-share" loading={working} disabled={availableKinds.length === 0} onPress={() => void createFile()} /></View></ScreenContainer>;
}

const styles = StyleSheet.create({ top: { height: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, back: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" }, title: { fontSize: 17, fontWeight: "900" }, content: { gap: 16, paddingTop: 14, paddingBottom: 18 }, intro: { fontSize: 14, lineHeight: 20 }, namePanel: { padding: 16 }, label: { fontSize: 13, fontWeight: "900" }, input: { marginTop: 10, minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, fontSize: 14, fontWeight: "700" }, helper: { marginTop: 7, fontSize: 11, lineHeight: 16 }, selection: { padding: 16 }, selectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }, selectAll: { fontSize: 12, fontWeight: "900" }, kindRow: { minHeight: 58, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: 10 }, box: { width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, alignItems: "center", justifyContent: "center" }, kindCopy: { flex: 1 }, kindTitle: { fontSize: 13, fontWeight: "900" }, kindMeta: { marginTop: 3, fontSize: 11 }, secret: { padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }, secretCopy: { flex: 1 }, action: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 14 }, pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] } });
