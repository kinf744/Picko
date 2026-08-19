import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { router } from "expo-router";
import { type ComponentProps, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { Panel, PrimaryAction, SectionLabel } from "@/components/kighmu-ui";
import { useColors } from "@/hooks/use-colors";
import { DEFAULT_EXPORT_RESTRICTIONS, normalizeExportRestrictions, restrictionCount, type ExportRestrictions } from "@/lib/vpn/export-restrictions";
import { TUNNEL_CATALOG, TUNNEL_KINDS, type TunnelKind } from "@/lib/vpn/tunnel-profiles";
import { useVpn } from "@/lib/vpn/vpn-context";

type RestrictionKey = Exclude<keyof ExportRestrictions, "expiresAt" | "userNote" | "allowedHardwareIds" | "allowedMobileOperators">;

function CheckRow({ checked, title, description, icon, onPress }: { checked: boolean; title: string; description: string; icon: ComponentProps<typeof MaterialIcons>["name"]; onPress: () => void }) {
  const colors = useColors();
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.checkRow, { borderTopColor: colors.border }, pressed && styles.pressed]}>
    <View style={[styles.check, { borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary : "transparent" }]}>{checked ? <MaterialIcons name="check" size={17} color="#FFFFFF" /> : null}</View>
    <View style={styles.rowCopy}><View style={styles.rowTitleLine}><MaterialIcons name={icon} size={17} color={colors.primary} /><Text style={[styles.rowTitle, { color: colors.foreground }]}>{title}</Text></View><Text style={[styles.rowDescription, { color: colors.muted }]}>{description}</Text></View>
  </Pressable>;
}

function ListInput({ label, value, placeholder, helper, onChangeText }: { label: string; value: string; placeholder: string; helper: string; onChangeText: (value: string) => void }) {
  const colors = useColors();
  return <View style={[styles.listInput, { borderTopColor: colors.border }]}><Text style={[styles.inlineLabel, { color: colors.foreground }]}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} multiline autoCapitalize="characters" style={[styles.listText, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surfaceRaised }]} /><Text style={[styles.helper, { color: colors.muted }]}>{helper}</Text></View>;
}

export default function ConfigExportScreen() {
  const colors = useColors();
  const { profilesByKind, buildConfigExport } = useVpn();
  const availableKinds = useMemo(() => TUNNEL_KINDS.filter((kind) => profilesByKind[kind].length > 0), [profilesByKind]);
  const [selected, setSelected] = useState<TunnelKind[]>([]);
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [fileName, setFileName] = useState("kighmu-vpn-config");
  const [restrictions, setRestrictions] = useState<ExportRestrictions>(DEFAULT_EXPORT_RESTRICTIONS);
  const [hardwareIds, setHardwareIds] = useState("");
  const [operators, setOperators] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => setSelected(availableKinds), [availableKinds]);
  const toggleKind = (kind: TunnelKind) => setSelected((current) => current.includes(kind) ? current.filter((item) => item !== kind) : [...current, kind]);
  const toggleRestriction = (key: RestrictionKey) => setRestrictions((current) => ({ ...current, [key]: !current[key] }));
  const setExpiry = (enabled: boolean) => setRestrictions((current) => ({ ...current, expiresAt: enabled ? (current.expiresAt ?? new Date().toISOString().slice(0, 10)) : null }));
  const exportRestrictions = () => normalizeExportRestrictions({ ...restrictions, allowedHardwareIds: hardwareIds, allowedMobileOperators: operators });
  const validateExport = () => {
    const readyRestrictions = exportRestrictions();
    if (selected.length === 0) { Alert.alert("Sélection requise", "Choisissez au moins une famille de tunnel à exporter."); return null; }
    if (readyRestrictions.bindDeviceId && readyRestrictions.allowedHardwareIds.length === 0) { Alert.alert("Hardware ID requis", "Ajoutez au moins un Hardware ID de 32 caractères hexadécimaux avant d’activer le verrouillage."); return null; }
    if (readyRestrictions.lockMobileOperator && readyRestrictions.allowedMobileOperators.length === 0) { Alert.alert("Opérateur requis", "Ajoutez au moins un code opérateur avant d’activer le verrouillage opérateur."); return null; }
    if (readyRestrictions.expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(readyRestrictions.expiresAt)) { Alert.alert("Date invalide", "Utilisez le format AAAA-MM-JJ pour la date d’expiration."); return null; }
    return readyRestrictions;
  };
  const createFile = async () => {
    const readyRestrictions = validateExport();
    if (!readyRestrictions) return;
    const execute = async () => {
      try {
        setWorking(true);
        const directory = FileSystem.cacheDirectory;
        if (!directory) throw new Error("Dossier de cache indisponible.");
        const safeName = fileName.trim().replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 48) || "kighmu-vpn-config";
        const uri = `${directory}${safeName}.json`;
        await FileSystem.writeAsStringAsync(uri, JSON.stringify(buildConfigExport(selected, includeSecrets, readyRestrictions), null, 2), { encoding: FileSystem.EncodingType.UTF8 });
        if (!await Sharing.isAvailableAsync()) { Alert.alert("Fichier créé", "Le fichier est prêt, mais le partage n’est pas disponible sur cet appareil."); return; }
        await Sharing.shareAsync(uri, { dialogTitle: "Exporter la configuration KIGHMU VPN", mimeType: "application/json" });
      } catch (error) { Alert.alert("Export impossible", error instanceof Error ? error.message : "Le fichier n’a pas pu être créé."); } finally { setWorking(false); }
    };
    if (includeSecrets) Alert.alert("Inclure les secrets ?", "Le fichier contiendra potentiellement des mots de passe, clés et liens d’accès. Ne le partagez qu’avec une personne ou un stockage de confiance.", [{ text: "Annuler", style: "cancel" }, { text: "Continuer", style: "destructive", onPress: () => { void execute(); } }]);
    else void execute();
  };
  const createClipboard = async () => {
    const readyRestrictions = validateExport();
    if (!readyRestrictions) return;
    const execute = async () => {
      try {
        setWorking(true);
        await Clipboard.setStringAsync(JSON.stringify(buildConfigExport(selected, includeSecrets, readyRestrictions)));
        Alert.alert("Configuration copiée", "La configuration KIGHMU VPN est prête à être importée depuis le presse-papiers sur un autre appareil.");
      } catch (error) { Alert.alert("Copie impossible", error instanceof Error ? error.message : "La configuration n’a pas pu être copiée."); } finally { setWorking(false); }
    };
    if (includeSecrets) Alert.alert("Inclure les secrets ?", "Le presse-papiers contiendra des mots de passe, clés ou liens d’accès. Effacez-le après le transfert.", [{ text: "Annuler", style: "cancel" }, { text: "Copier", style: "destructive", onPress: () => { void execute(); } }]);
    else void execute();
  };

  return <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-5"><View style={styles.top}><Pressable onPress={() => router.back()} style={({ pressed }) => [styles.back, { backgroundColor: colors.surfaceRaised }, pressed && styles.pressed]}><MaterialIcons name="arrow-back" size={20} color={colors.foreground} /></Pressable><Text style={[styles.title, { color: colors.foreground }]}>Exporter</Text><View style={styles.back} /></View><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}><Text style={[styles.intro, { color: colors.muted }]}>Choisissez les familles à partager et les politiques à joindre. Les verrous Hardware ID, opérateur et root sont vérifiés localement au démarrage par KIGHMU VPN.</Text><Panel style={styles.namePanel}><Text style={[styles.label, { color: colors.foreground }]}>Nom du fichier de configuration</Text><TextInput value={fileName} onChangeText={setFileName} placeholder="kighmu-vpn-config" placeholderTextColor={colors.muted} autoCapitalize="none" style={[styles.input, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.foreground }]} /><Text style={[styles.helper, { color: colors.muted }]}>Le suffixe .json est ajouté automatiquement.</Text></Panel><Panel style={styles.selection}><View style={styles.selectionHead}><View><Text style={[styles.label, { color: colors.foreground }]}>Familles à exporter</Text><Text style={[styles.helper, { color: colors.muted }]}>{selected.length} famille{selected.length > 1 ? "s" : ""} sélectionnée{selected.length > 1 ? "s" : ""}</Text></View><Pressable onPress={() => setSelected(selected.length === availableKinds.length ? [] : availableKinds)}><Text style={[styles.selectAll, { color: colors.primary }]}>{selected.length === availableKinds.length ? "Tout retirer" : "Tout sélectionner"}</Text></Pressable></View>{availableKinds.length === 0 ? <Text style={[styles.helper, { color: colors.muted }]}>Aucun profil n’est disponible à exporter.</Text> : availableKinds.map((kind) => <CheckRow key={kind} checked={selected.includes(kind)} title={TUNNEL_CATALOG[kind].label} description={`${profilesByKind[kind].length} profil${profilesByKind[kind].length > 1 ? "s" : ""}`} icon="tune" onPress={() => toggleKind(kind)} />)}</Panel><SectionLabel>Sécurité et verrouillage</SectionLabel><Panel style={styles.panel}><CheckRow checked={includeSecrets} title="Inclure les secrets" description="Mots de passe, clés et liens d’accès dans le fichier exporté." icon="key" onPress={() => setIncludeSecrets((value) => !value)} /><CheckRow checked={restrictions.lockConfiguration} title="Verrouiller la configuration" description="Empêcher l’édition des profils après import." icon="lock" onPress={() => toggleRestriction("lockConfiguration")} /><CheckRow checked={restrictions.lockPolicyControls} title="Verrouiller les restrictions" description="Déclarer les options de politique comme non modifiables après import." icon="admin-panel-settings" onPress={() => toggleRestriction("lockPolicyControls")} /></Panel><SectionLabel>Réseau et appareil</SectionLabel><Panel style={styles.panel}><CheckRow checked={restrictions.mobileDataOnly} title="Réseau de données mobiles uniquement" description="Refuser le démarrage hors connexion cellulaire." icon="signal-cellular-alt" onPress={() => toggleRestriction("mobileDataOnly")} /><CheckRow checked={restrictions.lockMobileOperator} title="Bloquer les opérateurs non autorisés" description="Autoriser seulement les codes opérateurs inscrits ci-dessous." icon="sim-card" onPress={() => toggleRestriction("lockMobileOperator")} />{restrictions.lockMobileOperator ? <ListInput label="Codes opérateurs autorisés" value={operators} onChangeText={setOperators} placeholder="Ex. 20801, 310260" helper="Un code MCC/MNC par ligne ou séparé par une virgule." /> : null}<CheckRow checked={restrictions.blockRootedDevice} title="Bloquer les appareils rootés" description="Refuser le tunnel si les contrôles locaux détectent un root." icon="security" onPress={() => toggleRestriction("blockRootedDevice")} /><CheckRow checked={restrictions.bindDeviceId} title="Verrouillage Hardware ID" description="Autoriser seulement les appareils dont l’ID figure dans la liste." icon="phonelink-lock" onPress={() => toggleRestriction("bindDeviceId")} />{restrictions.bindDeviceId ? <ListInput label="Hardware ID autorisés" value={hardwareIds} onChangeText={setHardwareIds} placeholder="B1CDCFA839525E38B3B8B6DBCD28DA5F" helper="Un ID de 32 caractères hexadécimaux par ligne ou séparé par une virgule." /> : null}<CheckRow checked={restrictions.requireDeviceAttestation} title="Attester l’appareil" description="Déclarer une attestation compatible avec un service distant." icon="verified-user" onPress={() => toggleRestriction("requireDeviceAttestation")} /></Panel><SectionLabel>Accès et conformité</SectionLabel><Panel style={styles.panel}><CheckRow checked={Boolean(restrictions.expiresAt)} title="Définir la date d’expiration" description="La configuration devient invalide après cette date." icon="event-busy" onPress={() => setExpiry(!restrictions.expiresAt)} />{restrictions.expiresAt ? <View style={styles.inlineField}><Text style={[styles.inlineLabel, { color: colors.foreground }]}>Expiration</Text><TextInput value={restrictions.expiresAt} onChangeText={(value) => setRestrictions((current) => ({ ...current, expiresAt: value }))} placeholder="AAAA-MM-JJ" placeholderTextColor={colors.muted} autoCapitalize="none" style={[styles.dateInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surfaceRaised }]} /></View> : null}<CheckRow checked={restrictions.sshBindToDevice} title="Connexion SSH avec ID d’appareil" description="Déclarer une liaison SSH au Hardware ID ; le serveur doit la prendre en charge." icon="terminal" onPress={() => toggleRestriction("sshBindToDevice")} /><CheckRow checked={restrictions.blockTorrent} title="Interdire le torrent" description="Exporter une règle de conformité à appliquer par le moteur ou le serveur." icon="block" onPress={() => toggleRestriction("blockTorrent")} /></Panel><Panel style={styles.notePanel}><View style={styles.noteHead}><MaterialIcons name="notes" size={18} color={colors.primary} /><Text style={[styles.label, { color: colors.foreground }]}>Message / notes pour les utilisateurs</Text></View><TextInput value={restrictions.userNote} onChangeText={(value) => setRestrictions((current) => ({ ...current, userNote: value }))} placeholder="Message facultatif affiché avec la configuration" placeholderTextColor={colors.muted} multiline style={[styles.noteInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surfaceRaised }]} /><Text style={[styles.helper, { color: colors.muted }]}>{restrictionCount(exportRestrictions())} règle{restrictionCount(exportRestrictions()) > 1 ? "s" : ""} ou information{restrictionCount(exportRestrictions()) > 1 ? "s" : ""} ajoutée{restrictionCount(exportRestrictions()) > 1 ? "s" : ""} à l’export.</Text></Panel></ScrollView><View style={[styles.action, { borderTopColor: colors.border }]}><PrimaryAction label={working ? "Préparation…" : "Créer et partager le fichier"} icon="ios-share" loading={working} disabled={availableKinds.length === 0} onPress={() => void createFile()} /><Pressable disabled={working || availableKinds.length === 0} onPress={() => void createClipboard()} style={({ pressed }) => [styles.clipboardAction, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && !working && styles.pressed, (working || availableKinds.length === 0) && styles.disabled]}><MaterialIcons name="content-copy" size={18} color={colors.primary} /><Text style={[styles.clipboardText, { color: colors.primary }]}>Créer le clipboard</Text></Pressable></View></ScreenContainer>;
}

const styles = StyleSheet.create({
  top: { height: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, back: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" }, title: { fontSize: 17, fontWeight: "900" }, content: { gap: 16, paddingTop: 14, paddingBottom: 20 }, intro: { fontSize: 14, lineHeight: 20 }, namePanel: { padding: 16 }, label: { fontSize: 13, fontWeight: "900" }, input: { marginTop: 10, minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, fontSize: 14, fontWeight: "700" }, helper: { marginTop: 7, fontSize: 11, lineHeight: 16 }, selection: { padding: 16 }, selectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 7 }, selectAll: { fontSize: 12, fontWeight: "900" }, panel: { paddingHorizontal: 16 }, checkRow: { minHeight: 65, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: 11 }, check: { width: 25, height: 25, borderRadius: 8, borderWidth: 1.5, alignItems: "center", justifyContent: "center" }, rowCopy: { flex: 1, paddingVertical: 10 }, rowTitleLine: { flexDirection: "row", alignItems: "center", gap: 8 }, rowTitle: { flex: 1, fontSize: 13, fontWeight: "900" }, rowDescription: { marginTop: 4, marginLeft: 25, fontSize: 11, lineHeight: 15 }, inlineField: { paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: 10 }, inlineLabel: { flex: 1, fontSize: 12, fontWeight: "800" }, dateInput: { width: 124, minHeight: 40, borderRadius: 11, borderWidth: 1, paddingHorizontal: 10, fontSize: 12, fontWeight: "800" }, listInput: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 12 }, listText: { minHeight: 74, marginTop: 8, borderWidth: 1, borderRadius: 12, padding: 11, textAlignVertical: "top", fontSize: 13, lineHeight: 18 }, notePanel: { padding: 16 }, noteHead: { flexDirection: "row", alignItems: "center", gap: 8 }, noteInput: { minHeight: 92, marginTop: 11, borderWidth: 1, borderRadius: 14, padding: 12, textAlignVertical: "top", fontSize: 13, lineHeight: 18 }, action: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 14, gap: 9 }, clipboardAction: { minHeight: 48, borderWidth: 1, borderRadius: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }, clipboardText: { fontSize: 13, fontWeight: "900" }, disabled: { opacity: 0.45 }, pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
});
