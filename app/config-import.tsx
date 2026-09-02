import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { Panel, PrimaryAction, StatusPill } from "@/components/kighmu-ui";
import { useColors } from "@/hooks/use-colors";
import { parseConfigImport, type ImportResult } from "@/lib/vpn/config-transfer";
import { useVpn } from "@/lib/vpn/vpn-context";
import { useLang } from "@/lib/i18n-provider";

export default function ConfigImportScreen() {
  const colors = useColors();
  const { t } = useLang();
  const router = useRouter();
  const { importConfig } = useVpn();
  const [raw, setRaw] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [working, setWorking] = useState(false);

  useFocusEffect(
    useCallback(() => {
      return () => {
        setRaw(null);
        setPreview(null);
        setFileName("");
      };
    }, []),
  );

  const safeBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [router]);
  const loadContent = (content: string, source: string) => {
    if (!content.trim()) throw new Error(t("import.err.emptyClipboard"));
    if (content.length > 1_000_000) throw new Error(t("import.err.overSizeClipboard"));
    setPreview(parseConfigImport(content));
    setRaw(content);
    setFileName(source);
  };
  const selectFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["application/json", "text/json", "text/plain"], copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      if ((asset.size ?? 0) > 1_000_000) throw new Error(t("import.err.overSizeFile"));
      loadContent(await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 }), asset.name);
    } catch (error) { setPreview(null); setRaw(null); Alert.alert(t("import.fileFailTitle"), error instanceof Error ? error.message : t("import.fileFailBody")); }
  };
  const importClipboard = async () => {
    try {
      setWorking(true);
      loadContent(await Clipboard.getStringAsync(), t("import.clipboardSource"));
    } catch (error) { setPreview(null); setRaw(null); Alert.alert(t("import.clipFailTitle"), error instanceof Error ? error.message : t("import.clipFailBody")); } finally { setWorking(false); }
  };
  const apply = (mode: "append" | "replace-imported") => {
    if (!raw || !preview) return;
    const modeLabel = mode === "append" ? t("import.append") : t("import.replace");
    Alert.alert(mode === "append" ? t("import.appendTitle") : t("import.replaceTitle"), mode === "append" ? t("import.appendBody") : t("import.replaceBody"), [{ text: t("common.cancel"), style: "cancel" }, { text: modeLabel, style: mode === "replace-imported" ? "destructive" : "default", onPress: () => { setWorking(true); importConfig(raw, mode).then(() => { Alert.alert(t("import.doneTitle"), t("import.doneBody", { n: preview.importedProfiles })); safeBack(); }).catch(() => Alert.alert(t("import.failTitle"), t("import.failBody"))).finally(() => setWorking(false)); } }]);
  };
  return <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-5"><View style={styles.top}><Pressable onPress={() => safeBack()} style={({ pressed }) => [styles.back, { backgroundColor: colors.surfaceRaised }, pressed && styles.pressed]}><MaterialIcons name="arrow-back" size={20} color={colors.foreground} /></Pressable><Text style={[styles.title, { color: colors.foreground }]}>{t("import.title")}</Text><View style={styles.back} /></View><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}><Text style={[styles.intro, { color: colors.muted }]}>{t("import.intro")}</Text><Panel raised style={styles.filePanel}><MaterialIcons name="upload-file" size={30} color={colors.primary} /><Text style={[styles.fileTitle, { color: colors.foreground }]}>{preview ? fileName : t("import.noSelection")}</Text><Text style={[styles.fileText, { color: colors.muted }]}>{preview ? t("import.ready") : t("import.rejected")}</Text><Pressable disabled={working} onPress={() => void selectFile()} style={({ pressed }) => [styles.pickButton, { borderColor: colors.border }, pressed && !working && styles.pressed, working && styles.disabled]}><MaterialIcons name="folder-open" size={18} color={colors.primary} /><Text style={[styles.pickText, { color: colors.primary }]}>{preview ? t("import.chooseAnother") : t("import.chooseFile")}</Text></Pressable><Pressable disabled={working} onPress={() => void importClipboard()} style={({ pressed }) => [styles.clipboardButton, { backgroundColor: colors.surfaceRaised }, pressed && !working && styles.pressed, working && styles.disabled]}><MaterialIcons name="content-paste" size={18} color={colors.primary} /><Text style={[styles.pickText, { color: colors.primary }]}>{t("import.fromClipboard")}</Text></Pressable></Panel>{preview ? <Panel style={styles.preview}><View style={styles.previewTop}><View><Text style={[styles.previewTitle, { color: colors.foreground }]}>{t("import.previewTitle")}</Text><Text style={[styles.previewMeta, { color: colors.muted }]}>{t("import.validProfiles", { n: preview.importedProfiles })}</Text></View><StatusPill label={preview.containsSecrets ? t("import.withSecrets") : t("import.noSecrets")} tone={preview.containsSecrets ? "warning" : "success"} /></View>{preview.importedKinds.map((kind) => <View key={kind} style={[styles.familyLine, { borderTopColor: colors.border }]}><MaterialIcons name="tune" size={17} color={colors.primary} /><Text style={[styles.familyText, { color: colors.foreground }]}>{t(`tunnels.${kind}.label`)}</Text><Text style={[styles.familyCount, { color: colors.muted }]}>{t("import.profilesCount", { n: preview.tunnels.find((item) => item.kind === kind)?.profiles.length ?? 0 })}</Text></View>)}{preview.skippedProfiles ? <Text style={[styles.warning, { color: colors.warning }]}>{t("import.skipped", { n: preview.skippedProfiles })}</Text> : null}</Panel> : null}</ScrollView>{preview ? <View style={[styles.actions, { borderTopColor: colors.border }]}><Pressable disabled={working} onPress={() => apply("append")} style={({ pressed }) => [styles.append, { borderColor: colors.border }, pressed && styles.pressed]}><Text style={[styles.appendText, { color: colors.primary }]}>{t("import.append")}</Text></Pressable><PrimaryAction label={working ? t("import.working") : t("import.replace")} icon="download" tone="error" loading={working} onPress={() => apply("replace-imported")} /></View> : null}</ScreenContainer>;
}

const styles = StyleSheet.create({
  top: { height: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, back: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" }, title: { fontSize: 17, fontWeight: "900" }, content: { gap: 16, paddingTop: 14, paddingBottom: 18 }, intro: { fontSize: 14, lineHeight: 20 }, filePanel: { minHeight: 260, alignItems: "center", justifyContent: "center", padding: 22 }, fileTitle: { marginTop: 12, fontSize: 15, fontWeight: "900", textAlign: "center" }, fileText: { marginTop: 7, fontSize: 12, textAlign: "center", lineHeight: 17 }, pickButton: { marginTop: 18, borderWidth: 1, borderRadius: 14, minHeight: 44, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 14 }, clipboardButton: { marginTop: 10, borderRadius: 14, minHeight: 44, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 14 }, pickText: { fontSize: 13, fontWeight: "900" }, preview: { padding: 16 }, previewTop: { flexDirection: "row", justifyContent: "space-between", gap: 10 }, previewTitle: { fontSize: 16, fontWeight: "900" }, previewMeta: { marginTop: 5, fontSize: 12 }, familyLine: { minHeight: 44, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 12, paddingTop: 12, flexDirection: "row", alignItems: "center", gap: 8 }, familyText: { flex: 1, fontSize: 13, fontWeight: "800" }, familyCount: { fontSize: 11 }, warning: { marginTop: 12, fontSize: 12, lineHeight: 17, fontWeight: "700" }, actions: { borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: 10, paddingVertical: 14 }, append: { flex: 0.8, minHeight: 52, borderRadius: 15, borderWidth: 1, justifyContent: "center", alignItems: "center" }, appendText: { fontSize: 14, fontWeight: "900" }, disabled: { opacity: 0.45 }, pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
});
