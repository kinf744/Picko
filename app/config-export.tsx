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
import { buildClipboardPayload } from "@/lib/vpn/config-transfer";
import { DEFAULT_EXPORT_RESTRICTIONS, normalizeExportRestrictions, restrictionCount, type ExportRestrictions } from "@/lib/vpn/export-restrictions";
import { TUNNEL_KINDS, type TunnelKind } from "@/lib/vpn/tunnel-profiles";
import { useVpn } from "@/lib/vpn/vpn-context";
import { useLang } from "@/lib/i18n-provider";

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
  const { t } = useLang();
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
    if (selected.length === 0) { Alert.alert(t("export.selRequiredTitle"), t("export.selRequiredBody")); return null; }
    if (readyRestrictions.bindDeviceId && readyRestrictions.allowedHardwareIds.length === 0) { Alert.alert(t("export.hwRequiredTitle"), t("export.hwRequiredBody")); return null; }
    if (readyRestrictions.lockMobileOperator && readyRestrictions.allowedMobileOperators.length === 0) { Alert.alert(t("export.opRequiredTitle"), t("export.opRequiredBody")); return null; }
    if (readyRestrictions.expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(readyRestrictions.expiresAt)) { Alert.alert(t("export.dateInvalidTitle"), t("export.dateInvalidBody")); return null; }
    return readyRestrictions;
  };
  const createFile = async () => {
    const readyRestrictions = validateExport();
    if (!readyRestrictions) return;
    const execute = async () => {
      try {
        setWorking(true);
        const directory = FileSystem.cacheDirectory;
        if (!directory) throw new Error(t("export.cacheMissing"));
        const safeName = fileName.trim().replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 48) || "kighmu-vpn-config";
        const uri = `${directory}${safeName}.json`;
        await FileSystem.writeAsStringAsync(uri, JSON.stringify(buildConfigExport(selected, includeSecrets, readyRestrictions), null, 2), { encoding: FileSystem.EncodingType.UTF8 });
        if (!await Sharing.isAvailableAsync()) { Alert.alert(t("export.fileCreatedTitle"), t("export.fileCreatedBody")); return; }
        await Sharing.shareAsync(uri, { dialogTitle: t("export.shareDialog"), mimeType: "application/json" });
      } catch (error) { Alert.alert(t("export.exportFailTitle"), error instanceof Error ? error.message : t("export.exportFailBody")); } finally { setWorking(false); }
    };
    if (includeSecrets) Alert.alert(t("export.secretsAskTitle"), t("export.secretsAskFile"), [{ text: t("common.cancel"), style: "cancel" }, { text: t("export.continue"), style: "destructive", onPress: () => { void execute(); } }]);
    else void execute();
  };
  const createClipboard = async () => {
    const readyRestrictions = validateExport();
    if (!readyRestrictions) return;
    const execute = async () => {
      try {
        setWorking(true);
        await Clipboard.setStringAsync(buildClipboardPayload(buildConfigExport(selected, includeSecrets, readyRestrictions)));
        Alert.alert(t("export.copiedTitle"), t("export.copiedBody"));
      } catch (error) { Alert.alert(t("export.copyFailTitle"), error instanceof Error ? error.message : t("export.copyFailBody")); } finally { setWorking(false); }
    };
    if (includeSecrets) Alert.alert(t("export.secretsAskTitle"), t("export.secretsAskClipboard"), [{ text: t("common.cancel"), style: "cancel" }, { text: t("export.copyAction"), style: "destructive", onPress: () => { void execute(); } }]);
    else void execute();
  };

  return <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-5"><View style={styles.top}><Pressable onPress={() => router.back()} style={({ pressed }) => [styles.back, { backgroundColor: colors.surfaceRaised }, pressed && styles.pressed]}><MaterialIcons name="arrow-back" size={20} color={colors.foreground} /></Pressable><Text style={[styles.title, { color: colors.foreground }]}>{t("export.title")}</Text><View style={styles.back} /></View><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}><Text style={[styles.intro, { color: colors.muted }]}>{t("export.intro")}</Text><Panel style={styles.namePanel}><Text style={[styles.label, { color: colors.foreground }]}>{t("export.fileName")}</Text><TextInput value={fileName} onChangeText={setFileName} placeholder="kighmu-vpn-config" placeholderTextColor={colors.muted} autoCapitalize="none" style={[styles.input, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.foreground }]} /><Text style={[styles.helper, { color: colors.muted }]}>{t("export.fileName.helper")}</Text></Panel><Panel style={styles.selection}><View style={styles.selectionHead}><View><Text style={[styles.label, { color: colors.foreground }]}>{t("export.families")}</Text><Text style={[styles.helper, { color: colors.muted }]}>{t("export.selectedCount", { n: selected.length })}</Text></View><Pressable onPress={() => setSelected(selected.length === availableKinds.length ? [] : availableKinds)}><Text style={[styles.selectAll, { color: colors.primary }]}>{selected.length === availableKinds.length ? t("export.clearAll") : t("export.selectAll")}</Text></Pressable></View>{availableKinds.length === 0 ? <Text style={[styles.helper, { color: colors.muted }]}>{t("export.noneAvailable")}</Text> : availableKinds.map((kind) => <CheckRow key={kind} checked={selected.includes(kind)} title={t(`tunnels.${kind}.label`)} description={t("export.profileCount", { n: profilesByKind[kind].length })} icon="tune" onPress={() => toggleKind(kind)} />)}</Panel><SectionLabel>{t("export.secSection")}</SectionLabel><Panel style={styles.panel}><CheckRow checked={includeSecrets} title={t("export.includeSecrets.title")} description={t("export.includeSecrets.desc")} icon="key" onPress={() => setIncludeSecrets((value) => !value)} /><CheckRow checked={restrictions.lockConfiguration} title={t("export.lockConfig.title")} description={t("export.lockConfig.desc")} icon="lock" onPress={() => toggleRestriction("lockConfiguration")} /><CheckRow checked={restrictions.lockPolicyControls} title={t("export.lockPolicy.title")} description={t("export.lockPolicy.desc")} icon="admin-panel-settings" onPress={() => toggleRestriction("lockPolicyControls")} /></Panel><SectionLabel>{t("export.devSection")}</SectionLabel><Panel style={styles.panel}><CheckRow checked={restrictions.mobileDataOnly} title={t("export.mobileDataOnly.title")} description={t("export.mobileDataOnly.desc")} icon="signal-cellular-alt" onPress={() => toggleRestriction("mobileDataOnly")} /><CheckRow checked={restrictions.lockMobileOperator} title={t("export.blockOperators.title")} description={t("export.blockOperators.desc")} icon="sim-card" onPress={() => toggleRestriction("lockMobileOperator")} />{restrictions.lockMobileOperator ? <ListInput label={t("export.allowedOperators.label")} value={operators} onChangeText={setOperators} placeholder="Ex. 20801, 310260" helper={t("export.allowedOperators.helper")} /> : null}<CheckRow checked={restrictions.blockRootedDevice} title={t("export.blockRoot.title")} description={t("export.blockRoot.desc")} icon="security" onPress={() => toggleRestriction("blockRootedDevice")} /><CheckRow checked={restrictions.bindDeviceId} title={t("export.bindHwId.title")} description={t("export.bindHwId.desc")} icon="phonelink-lock" onPress={() => toggleRestriction("bindDeviceId")} />{restrictions.bindDeviceId ? <ListInput label={t("export.allowedIds.label")} value={hardwareIds} onChangeText={setHardwareIds} placeholder="B1CDCFA839525E38B3B8B6DBCD28DA5F" helper={t("export.allowedIds.helper")} /> : null}<CheckRow checked={restrictions.requireDeviceAttestation} title={t("export.attestation.title")} description={t("export.attestation.desc")} icon="verified-user" onPress={() => toggleRestriction("requireDeviceAttestation")} /></Panel><SectionLabel>{t("export.complianceSection")}</SectionLabel><Panel style={styles.panel}><CheckRow checked={Boolean(restrictions.expiresAt)} title={t("export.expiry.title")} description={t("export.expiry.desc")} icon="event-busy" onPress={() => setExpiry(!restrictions.expiresAt)} />{restrictions.expiresAt ? <View style={styles.inlineField}><Text style={[styles.inlineLabel, { color: colors.foreground }]}>{t("export.expiry.label")}</Text><TextInput value={restrictions.expiresAt} onChangeText={(value) => setRestrictions((current) => ({ ...current, expiresAt: value }))} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} autoCapitalize="none" style={[styles.dateInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surfaceRaised }]} /></View> : null}<CheckRow checked={restrictions.sshBindToDevice} title={t("export.sshBind.title")} description={t("export.sshBind.desc")} icon="terminal" onPress={() => toggleRestriction("sshBindToDevice")} /><CheckRow checked={restrictions.blockTorrent} title={t("export.noTorrent.title")} description={t("export.noTorrent.desc")} icon="block" onPress={() => toggleRestriction("blockTorrent")} /></Panel><Panel style={styles.notePanel}><View style={styles.noteHead}><MaterialIcons name="notes" size={18} color={colors.primary} /><Text style={[styles.label, { color: colors.foreground }]}>{t("export.notes.label")}</Text></View><TextInput value={restrictions.userNote} onChangeText={(value) => setRestrictions((current) => ({ ...current, userNote: value }))} placeholder={t("export.notes.ph")} placeholderTextColor={colors.muted} multiline style={[styles.noteInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surfaceRaised }]} /><Text style={[styles.helper, { color: colors.muted }]}>{t("export.rulesCount", { n: restrictionCount(exportRestrictions()) })}</Text></Panel></ScrollView><View style={[styles.action, { borderTopColor: colors.border }]}><PrimaryAction label={working ? t("export.preparing") : t("export.createFile")} icon="ios-share" loading={working} disabled={availableKinds.length === 0} onPress={() => void createFile()} /><Pressable disabled={working || availableKinds.length === 0} onPress={() => void createClipboard()} style={({ pressed }) => [styles.clipboardAction, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && !working && styles.pressed, (working || availableKinds.length === 0) && styles.disabled]}><MaterialIcons name="content-copy" size={18} color={colors.primary} /><Text style={[styles.clipboardText, { color: colors.primary }]}>{t("export.clipboard")}</Text></Pressable></View></ScreenContainer>;
}

const styles = StyleSheet.create({
  top: { height: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, back: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" }, title: { fontSize: 17, fontWeight: "900" }, content: { gap: 16, paddingTop: 14, paddingBottom: 20 }, intro: { fontSize: 14, lineHeight: 20 }, namePanel: { padding: 16 }, label: { fontSize: 13, fontWeight: "900" }, input: { marginTop: 10, minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, fontSize: 14, fontWeight: "700" }, helper: { marginTop: 7, fontSize: 11, lineHeight: 16 }, selection: { padding: 16 }, selectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 7 }, selectAll: { fontSize: 12, fontWeight: "900" }, panel: { paddingHorizontal: 16 }, checkRow: { minHeight: 65, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: 11 }, check: { width: 25, height: 25, borderRadius: 8, borderWidth: 1.5, alignItems: "center", justifyContent: "center" }, rowCopy: { flex: 1, paddingVertical: 10 }, rowTitleLine: { flexDirection: "row", alignItems: "center", gap: 8 }, rowTitle: { flex: 1, fontSize: 13, fontWeight: "900" }, rowDescription: { marginTop: 4, marginLeft: 25, fontSize: 11, lineHeight: 15 }, inlineField: { paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: 10 }, inlineLabel: { flex: 1, fontSize: 12, fontWeight: "800" }, dateInput: { width: 124, minHeight: 40, borderRadius: 11, borderWidth: 1, paddingHorizontal: 10, fontSize: 12, fontWeight: "800" }, listInput: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 12 }, listText: { minHeight: 74, marginTop: 8, borderWidth: 1, borderRadius: 12, padding: 11, textAlignVertical: "top", fontSize: 13, lineHeight: 18 }, notePanel: { padding: 16 }, noteHead: { flexDirection: "row", alignItems: "center", gap: 8 }, noteInput: { minHeight: 92, marginTop: 11, borderWidth: 1, borderRadius: 14, padding: 12, textAlignVertical: "top", fontSize: 13, lineHeight: 18 }, action: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 14, gap: 9 }, clipboardAction: { minHeight: 48, borderWidth: 1, borderRadius: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }, clipboardText: { fontSize: 13, fontWeight: "900" }, disabled: { opacity: 0.45 }, pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
});
