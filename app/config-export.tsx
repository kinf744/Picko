import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { router } from "expo-router";
import { type ComponentProps, useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { Panel, PrimaryAction, SectionLabel } from "@/components/kighmu-ui";
import { useColors } from "@/hooks/use-colors";
import { buildClipboardPayloadAsync, buildEncryptedFilePayload } from "@/lib/vpn/config-transfer";
import { DEFAULT_EXPORT_RESTRICTIONS, normalizeExportRestrictions, restrictionCount, type ExportRestrictions } from "@/lib/vpn/export-restrictions";
import { TUNNEL_KINDS, type TunnelKind, type TunnelProfile } from "@/lib/vpn/tunnel-profiles";
import { useVpn } from "@/lib/vpn/vpn-context";
import { useLang } from "@/lib/i18n-provider";

type RestrictionKey = Exclude<keyof ExportRestrictions, "expiresAt" | "userNote" | "allowedHardwareIds" | "allowedMobileOperators">;

function CheckRow({ checked, title, description, icon, onPress, disabled = false }: { checked: boolean; title: string; description: string; icon: ComponentProps<typeof MaterialIcons>["name"]; onPress: () => void; disabled?: boolean }) {
  const colors = useColors();
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="checkbox" accessibilityState={{ checked, disabled }} style={({ pressed }) => [styles.checkRow, { borderTopColor: colors.border }, pressed && !disabled && styles.pressed]}>
    <View style={[styles.check, { borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary : "transparent", opacity: disabled ? 0.35 : 1 }]}>{checked ? <MaterialIcons name="check" size={17} color="#FFFFFF" /> : null}</View>
    <View style={styles.rowCopy}><View style={styles.rowTitleLine}><MaterialIcons name={icon} size={17} color={colors.primary} /><Text style={[styles.rowTitle, { color: colors.foreground }]}>{title}</Text></View><Text style={[styles.rowDescription, { color: colors.muted }]}>{description}</Text></View>
  </Pressable>;
}

function ListInput({ label, value, placeholder, helper, onChangeText }: { label: string; value: string; placeholder: string; helper: string; onChangeText: (value: string) => void }) {
  const colors = useColors();
  return <View style={[styles.listInput, { borderTopColor: colors.border }]}><Text style={[styles.inlineLabel, { color: colors.foreground }]}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} multiline autoCapitalize="characters" style={[styles.listText, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surfaceRaised }]} /><Text style={[styles.helper, { color: colors.muted }]}>{helper}</Text></View>;
}

function TunnelCheckRow({
  checked,
  total,
  ticked,
  onPress,
  title,
  description,
}: {
  checked: boolean;
  total: number;
  ticked: number;
  onPress: () => void;
  title: string;
  description: string;
}) {
  const colors = useColors();
  const disabled = ticked === 0;
  const badgeColor = ticked > 0 ? colors.primary : colors.border;
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="checkbox" accessibilityState={{ checked, disabled }} style={({ pressed }) => [styles.checkRow, { borderTopColor: colors.border }, pressed && !disabled && styles.pressed]}>
    <View style={[styles.check, { borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary : "transparent", opacity: disabled ? 0.4 : 1 }]}>{checked ? <MaterialIcons name="check" size={17} color="#FFFFFF" /> : null}</View>
    <View style={styles.rowCopy}>
      <View style={styles.rowTitleLine}>
        <MaterialIcons name="tune" size={17} color={colors.primary} />
        <Text style={[styles.rowTitle, { color: colors.foreground }]}>{title}</Text>
        <View style={[styles.badge, { backgroundColor: badgeColor }]}><Text style={styles.badgeText}>{ticked}/{total}</Text></View>
      </View>
      <Text style={[styles.rowDescription, { color: disabled ? colors.warning : colors.muted }]}>{description}</Text>
    </View>
  </Pressable>;
}

export default function ConfigExportScreen() {
  const colors = useColors();
  const { t } = useLang();
  const { profilesByKind, buildConfigExport } = useVpn();
  const safeBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, []);
  const [selected, setSelected] = useState<TunnelKind[]>([]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fileName, setFileName] = useState("kighmu-vpn-config");
  const [restrictions, setRestrictions] = useState<ExportRestrictions>(DEFAULT_EXPORT_RESTRICTIONS);
  const [hardwareIds, setHardwareIds] = useState("");
  const [operators, setOperators] = useState("");
  const [working, setWorking] = useState(false);

  const statsByKind = useMemo(() => {
    const map: Record<TunnelKind, { total: number; ticked: number }> = {} as Record<TunnelKind, { total: number; ticked: number }>;
    TUNNEL_KINDS.forEach((kind) => {
      const profiles: TunnelProfile[] = profilesByKind[kind] ?? [];
      const ticked = profiles.filter((profile) => profile.selected).length;
      map[kind] = { total: profiles.length, ticked };
    });
    return map;
  }, [profilesByKind]);

  const exportableKinds = useMemo(() => TUNNEL_KINDS.filter((kind) => statsByKind[kind].ticked > 0), [statsByKind]);

  useEffect(() => {
    setSelected(exportableKinds);
  }, [exportableKinds]);

  const toggleKind = (kind: TunnelKind) => {
    if (statsByKind[kind].ticked === 0) return;
    setSelected((current) => current.includes(kind) ? current.filter((item) => item !== kind) : [...current, kind]);
  };
  const toggleRestriction = (key: RestrictionKey) => setRestrictions((current) => ({ ...current, [key]: !current[key] }));
  const setExpiry = (enabled: boolean) => setRestrictions((current) => ({ ...current, expiresAt: enabled ? (current.expiresAt ?? new Date().toISOString().slice(0, 10)) : null }));
  const exportRestrictions = () => normalizeExportRestrictions({ ...restrictions, allowedHardwareIds: hardwareIds, allowedMobileOperators: operators });
  const validateExport = () => {
    const readyRestrictions = exportRestrictions();
    if (selected.length === 0) { Alert.alert(t("export.selRequiredTitle"), t("export.selRequiredBody")); return null; }
    const emptySelected = selected.filter((kind) => statsByKind[kind].ticked === 0);
    if (emptySelected.length > 0) { Alert.alert(t("export.families.empty"), emptySelected.map((kind) => t(`tunnels.${kind}.label`)).join(", ")); return null; }
    if (readyRestrictions.bindDeviceId && readyRestrictions.allowedHardwareIds.length === 0) { Alert.alert(t("export.hwRequiredTitle"), t("export.hwRequiredBody")); return null; }
    if (readyRestrictions.lockMobileOperator && readyRestrictions.allowedMobileOperators.length === 0) { Alert.alert(t("export.opRequiredTitle"), t("export.opRequiredBody")); return null; }
    if (readyRestrictions.expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(readyRestrictions.expiresAt)) { Alert.alert(t("export.dateInvalidTitle"), t("export.dateInvalidBody")); return null; }
    return readyRestrictions;
  };
  const validatePassword = (): string | null => {
    if (!password || password.length < 8) { Alert.alert(t("export.pwdRequiredTitle") ?? "Mot de passe requis", t("export.pwdRequiredBody") ?? "Saisissez un mot de passe d'au moins 8 caractères pour chiffrer la configuration."); return null; }
    if (password !== confirmPassword) { Alert.alert(t("export.pwdMismatchTitle") ?? "Mots de passe différents", t("export.pwdMismatchBody") ?? "La confirmation ne correspond pas."); return null; }
    return password;
  };
  const createFile = async () => {
    const readyRestrictions = validateExport();
    if (!readyRestrictions) return;
    const pwd = validatePassword();
    if (!pwd) return;
    try {
      setWorking(true);
      const directory = FileSystem.cacheDirectory;
      if (!directory) throw new Error(t("export.cacheMissing"));
      const safeName = fileName.trim().replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 48) || "kighmu-vpn-config";
      const uri = `${directory}${safeName}.json`;
      const payload = await buildEncryptedFilePayload(buildConfigExport(selected, true, readyRestrictions), pwd);
      await FileSystem.writeAsStringAsync(uri, payload, { encoding: FileSystem.EncodingType.UTF8 });
      if (!await Sharing.isAvailableAsync()) { Alert.alert(t("export.fileCreatedTitle"), t("export.fileCreatedBody")); return; }
      await Sharing.shareAsync(uri, { dialogTitle: t("export.shareDialog"), mimeType: "application/json" });
    } catch (error) { Alert.alert(t("export.exportFailTitle"), error instanceof Error ? error.message : t("export.exportFailBody")); } finally { setWorking(false); }
  };
  const createClipboard = async () => {
    const readyRestrictions = validateExport();
    if (!readyRestrictions) return;
    const pwd = validatePassword();
    if (!pwd) return;
    try {
      setWorking(true);
      await Clipboard.setStringAsync(await buildClipboardPayloadAsync(buildConfigExport(selected, true, readyRestrictions), pwd));
      Alert.alert(t("export.copiedTitle"), t("export.copiedBody"));
    } catch (error) { Alert.alert(t("export.copyFailTitle"), error instanceof Error ? error.message : t("export.copyFailBody")); } finally { setWorking(false); }
  };

  const totalTicked = useMemo(() => TUNNEL_KINDS.reduce((sum, kind) => sum + statsByKind[kind].ticked, 0), [statsByKind]);
  const totalProfiles = useMemo(() => TUNNEL_KINDS.reduce((sum, kind) => sum + statsByKind[kind].total, 0), [statsByKind]);
  const allToggled = exportableKinds.length > 0 && selected.length === exportableKinds.length;
  const selectAllLabel = allToggled ? t("export.clearAll") : t("export.selectAll");

  return <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-5">
    <View style={styles.top}>
      <Pressable onPress={() => safeBack()} style={({ pressed }) => [styles.back, { backgroundColor: colors.surfaceRaised }, pressed && styles.pressed]}><MaterialIcons name="arrow-back" size={20} color={colors.foreground} /></Pressable>
      <Text style={[styles.title, { color: colors.foreground }]}>{t("export.title")}</Text>
      <View style={styles.back} />
    </View>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={[styles.intro, { color: colors.muted }]}>{t("export.intro")}</Text>
      <Panel style={styles.namePanel}>
        <Text style={[styles.label, { color: colors.foreground }]}>{t("export.fileName")}</Text>
        <TextInput value={fileName} onChangeText={setFileName} placeholder="kighmu-vpn-config" placeholderTextColor={colors.muted} autoCapitalize="none" style={[styles.input, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.foreground }]} />
        <Text style={[styles.helper, { color: colors.muted }]}>{t("export.fileName.helper")}</Text>
      </Panel>
      <Panel style={styles.selection}>
        <View style={styles.selectionHead}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.foreground }]}>{t("export.families")}</Text>
            <Text style={[styles.helper, { color: colors.muted, marginTop: 4 }]}>{t("export.families.helper")}</Text>
          </View>
          <Pressable disabled={exportableKinds.length === 0} onPress={() => setSelected(allToggled ? [] : exportableKinds)}><Text style={[styles.selectAll, { color: exportableKinds.length === 0 ? colors.muted : colors.primary }]}>{selectAllLabel}</Text></Pressable>
        </View>
        <View style={styles.selectionSummary}>
          <Text style={[styles.summaryPrimary, { color: colors.foreground }]}>{t("export.selectedCount", { n: selected.length })}</Text>
          <Text style={[styles.summarySecondary, { color: colors.muted }]}>{t("export.families.checked", { checked: totalTicked, total: totalProfiles })}</Text>
        </View>
        {TUNNEL_KINDS.map((kind) => {
          const stats = statsByKind[kind];
          const description = stats.ticked === 0 ? t("export.families.empty") : t("export.families.checked", { checked: stats.ticked, total: stats.total });
          return <TunnelCheckRow key={kind} checked={selected.includes(kind)} total={stats.total} ticked={stats.ticked} onPress={() => toggleKind(kind)} title={t(`tunnels.${kind}.label`)} description={description} />;
        })}
        {exportableKinds.length === 0 ? <Text style={[styles.helper, { color: colors.warning, marginTop: 8 }]}>{t("export.noneAvailable")}</Text> : null}
      </Panel>
      <Panel style={styles.panel}>
        <SectionLabel>{t("export.secSection")}</SectionLabel>
        <View style={[styles.inlineField, { borderTopColor: "transparent" }]}>
          <Text style={[styles.inlineLabel, { color: colors.foreground }]}>{t("export.pwd.label") ?? "Mot de passe chiffrement"}</Text>
        </View>
        <TextInput value={password} onChangeText={setPassword} placeholder="••••••••" placeholderTextColor={colors.muted} secureTextEntry autoCapitalize="none" style={[styles.input, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.foreground, marginTop: 6 }]} />
        <Text style={[styles.helper, { color: colors.muted }]}>{t("export.pwd.helper") ?? "8 caractères min. Conservé uniquement pour chiffrer (AES-GCM PBKDF2). Partagez-le séparément."}</Text>
        <TextInput value={confirmPassword} onChangeText={setConfirmPassword} placeholder={t("export.pwd.confirmPh") ?? "Confirmer le mot de passe"} placeholderTextColor={colors.muted} secureTextEntry autoCapitalize="none" style={[styles.input, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.foreground, marginTop: 10 }]} />
        <CheckRow checked={restrictions.lockConfiguration} onPress={() => toggleRestriction("lockConfiguration")} title={t("export.lockConfig.title")} description={t("export.lockConfig.desc")} icon="lock" />
        <CheckRow checked={restrictions.lockPolicyControls} onPress={() => toggleRestriction("lockPolicyControls")} title={t("export.lockPolicy.title")} description={t("export.lockPolicy.desc")} icon="policy" />
      </Panel>
      <Panel style={styles.panel}>
        <SectionLabel>{t("export.devSection")}</SectionLabel>
        <CheckRow checked={restrictions.mobileDataOnly} onPress={() => toggleRestriction("mobileDataOnly")} title={t("export.mobileDataOnly.title")} description={t("export.mobileDataOnly.desc")} icon="mobile-friendly" />
        <CheckRow checked={restrictions.lockMobileOperator} onPress={() => toggleRestriction("lockMobileOperator")} title={t("export.blockOperators.title")} description={t("export.blockOperators.desc")} icon="sim-card" />
        {restrictions.lockMobileOperator ? <ListInput label={t("export.allowedOperators.label")} value={operators} onChangeText={setOperators} placeholder="20801" helper={t("export.allowedOperators.helper")} /> : null}
        <CheckRow checked={restrictions.blockRootedDevice} onPress={() => toggleRestriction("blockRootedDevice")} title={t("export.blockRoot.title")} description={t("export.blockRoot.desc")} icon="report" />
        <CheckRow checked={restrictions.bindDeviceId} onPress={() => toggleRestriction("bindDeviceId")} title={t("export.bindHwId.title")} description={t("export.bindHwId.desc")} icon="fingerprint" />
        {restrictions.bindDeviceId ? <ListInput label={t("export.allowedIds.label")} value={hardwareIds} onChangeText={setHardwareIds} placeholder="B1CDCFA839525E38B3B8B6DBCD28DA5F" helper={t("export.allowedIds.helper")} /> : null}
        <CheckRow checked={restrictions.requireDeviceAttestation} onPress={() => toggleRestriction("requireDeviceAttestation")} title={t("export.attestation.title")} description={t("export.attestation.desc")} icon="verified-user" />
      </Panel>
      <Panel style={styles.panel}>
        <SectionLabel>{t("export.complianceSection")}</SectionLabel>
        <CheckRow checked={Boolean(restrictions.expiresAt)} onPress={() => setExpiry(!restrictions.expiresAt)} title={t("export.expiry.title")} description={t("export.expiry.desc")} icon="event-busy" />
        {restrictions.expiresAt ? <View style={[styles.inlineField, { borderTopColor: colors.border }]}><Text style={[styles.inlineLabel, { color: colors.foreground }]}>{t("export.expiry.label")}</Text><TextInput value={restrictions.expiresAt ?? ""} onChangeText={(value) => setRestrictions((current) => ({ ...current, expiresAt: value }))} placeholder="AAAA-MM-JJ" placeholderTextColor={colors.muted} autoCapitalize="none" style={[styles.dateInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surfaceRaised }]} /></View> : null}
        <CheckRow checked={restrictions.sshBindToDevice} onPress={() => toggleRestriction("sshBindToDevice")} title={t("export.sshBind.title")} description={t("export.sshBind.desc")} icon="link" />
        <CheckRow checked={restrictions.blockTorrent} onPress={() => toggleRestriction("blockTorrent")} title={t("export.noTorrent.title")} description={t("export.noTorrent.desc")} icon="block" />
      </Panel>
      <Panel style={styles.notePanel}>
        <View style={styles.noteHead}><MaterialIcons name="edit-note" size={18} color={colors.primary} /><Text style={[styles.label, { color: colors.foreground }]}>{t("export.notes.label")}</Text></View>
        <TextInput value={restrictions.userNote ?? ""} onChangeText={(value) => setRestrictions((current) => ({ ...current, userNote: value }))} placeholder={t("export.notes.ph")} placeholderTextColor={colors.muted} multiline style={[styles.noteInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surfaceRaised }]} />
      </Panel>
      <Text style={[styles.rulesCount, { color: colors.muted }]}>{t("export.rulesCount", { n: restrictionCount(restrictions) })}</Text>
      <PrimaryAction label={working ? t("export.preparing") : t("export.createFile")} icon="file-upload" disabled={working || selected.length === 0} onPress={createFile} />
      <Pressable onPress={createClipboard} disabled={working || selected.length === 0} style={({ pressed }) => [styles.clipboard, { borderColor: colors.border, backgroundColor: colors.surface }, (working || selected.length === 0) && styles.disabled, pressed && styles.pressed]}><MaterialIcons name="content-paste" size={18} color={(working || selected.length === 0) ? colors.muted : colors.primary} /><Text style={[styles.clipboardText, { color: (working || selected.length === 0) ? colors.muted : colors.primary }]}>{t("export.clipboard")}</Text></Pressable>
    </ScrollView>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  top: { height: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 17, fontWeight: "900" },
  content: { gap: 16, paddingTop: 14, paddingBottom: 20 },
  intro: { fontSize: 14, lineHeight: 20 },
  namePanel: { padding: 16 },
  label: { fontSize: 13, fontWeight: "900" },
  input: { marginTop: 10, minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, fontSize: 14, fontWeight: "700" },
  helper: { marginTop: 7, fontSize: 11, lineHeight: 16 },
  selection: { padding: 16 },
  selectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 10 },
  selectionSummary: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#0001" },
  summaryPrimary: { fontSize: 12, fontWeight: "900" },
  summarySecondary: { fontSize: 11, fontWeight: "700" },
  selectAll: { fontSize: 12, fontWeight: "900" },
  panel: { paddingHorizontal: 16 },
  checkRow: { minHeight: 65, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: 11 },
  check: { width: 25, height: 25, borderRadius: 8, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, marginLeft: 6 },
  badgeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  rowCopy: { flex: 1, paddingVertical: 10 },
  rowTitleLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowTitle: { flex: 1, fontSize: 13, fontWeight: "900" },
  rowDescription: { marginTop: 4, marginLeft: 25, fontSize: 11, lineHeight: 15 },
  inlineField: { paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: 10 },
  inlineLabel: { flex: 1, fontSize: 12, fontWeight: "800" },
  dateInput: { width: 124, minHeight: 40, borderRadius: 11, borderWidth: 1, paddingHorizontal: 10, fontSize: 12, fontWeight: "800" },
  listInput: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 12 },
  listText: { minHeight: 74, marginTop: 8, borderWidth: 1, borderRadius: 12, padding: 11, textAlignVertical: "top", fontSize: 13, lineHeight: 18 },
  notePanel: { padding: 16 },
  noteHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  noteInput: { minHeight: 92, marginTop: 10, borderWidth: 1, borderRadius: 14, padding: 12, textAlignVertical: "top", fontSize: 13, lineHeight: 18 },
  rulesCount: { fontSize: 12, textAlign: "center", marginTop: 4 },
  clipboard: { marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13, borderRadius: 14, borderWidth: 1 },
  clipboardText: { fontSize: 13, fontWeight: "900" },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.985 }] },
});
