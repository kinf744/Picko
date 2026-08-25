import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { type ComponentProps, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AppHeader, FamilySelector, IconAction, Panel, PrimaryAction, SectionLabel, StatusPill } from "@/components/kighmu-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { profileEndpoint, type ProfileFieldErrors, type TunnelProfile } from "@/lib/vpn/tunnel-profiles";
import { useVpn } from "@/lib/vpn/vpn-context";
import { useLang } from "@/lib/i18n-provider";

type FieldProps = { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; secureTextEntry?: boolean; keyboardType?: "default" | "numeric"; error?: string; multiline?: boolean; note?: string };

function Field({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType, error, multiline, note }: FieldProps) {
  const colors = useColors();
  return <View style={styles.fieldGroup}><Text style={[styles.fieldLabel, { color: colors.foreground }]}>{label}</Text>{note ? <Text style={[styles.fieldNote, { color: colors.muted }]}>{note}</Text> : null}<TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} secureTextEntry={secureTextEntry} keyboardType={keyboardType} autoCapitalize="none" multiline={multiline} style={[styles.input, multiline && styles.multilineInput, { color: colors.foreground, backgroundColor: colors.surfaceRaised, borderColor: error ? colors.error : colors.border }]} />{error ? <Text style={[styles.fieldError, { color: colors.error }]}>{error}</Text> : null}</View>;
}

function GroupTitle({ title, icon }: { title: string; icon: ComponentProps<typeof MaterialIcons>["name"] }) {
  const colors = useColors();
  return <View style={styles.groupTitle}><MaterialIcons name={icon} size={17} color={colors.primary} /><Text style={[styles.groupTitleText, { color: colors.foreground }]}>{title}</Text></View>;
}

export default function ConfigurationScreen() {
  const colors = useColors();
  const { t } = useLang();
  const { activeKind, selectTunnel, profilesByKind, createProfile, cloneProfile, saveProfile, deleteProfile, toggleProfileSelection } = useVpn();
  const [draft, setDraft] = useState<TunnelProfile | null>(null);
  const [errors, setErrors] = useState<ProfileFieldErrors>({});
  const [saved, setSaved] = useState(false);
  const profiles = profilesByKind[activeKind];

  useEffect(() => { setDraft(null); setErrors({}); setSaved(false); }, [activeKind]);
  const patch = (field: string, value: string) => setDraft((current) => current ? ({ ...current, [field]: value } as TunnelProfile) : current);
  const beginNew = () => { setDraft(createProfile(activeKind)); setErrors({}); setSaved(false); };
  const beginEdit = (profile: TunnelProfile) => { setDraft({ ...profile }); setErrors({}); setSaved(false); };
  const handleClone = (profile: TunnelProfile) => { void cloneProfile(profile); };
  const handleSave = async () => { if (!draft) return; const outcome = await saveProfile(draft); setErrors(outcome.errors); if (outcome.ok) { setSaved(true); setDraft(null); setTimeout(() => setSaved(false), 2000); } };
  const confirmDelete = (profile: TunnelProfile) => Alert.alert(t("config.deleteTitle"), t("config.deleteBody", { name: profile.name }), [{ text: t("common.cancel"), style: "cancel" }, { text: t("common.delete"), style: "destructive", onPress: () => deleteProfile(profile.kind, profile.id) }]);

  const profileEditor = () => {
    if (!draft) return null;
    const field = (label: string, key: string, placeholder: string, options?: Omit<FieldProps, "label" | "value" | "onChangeText" | "placeholder">) => <Field label={label} value={String((draft as Record<string, unknown>)[key] ?? "")} onChangeText={(value) => patch(key, value)} placeholder={placeholder} error={errors[key]} {...options} />;
    return <Panel raised style={styles.editorPanel}>
      <View style={styles.editorHeader}><View><StatusPill label={profiles.some((profile) => profile.id === draft.id) ? t("config.editor.modifying") : t("config.editor.new")} tone="primary" /><Text style={[styles.editorTitle, { color: colors.foreground }]}>{t(`tunnels.${draft.kind}.label`)}</Text></View><IconAction label={t("common.close")} icon="close" onPress={() => setDraft(null)} /></View>
      {field(t("config.field.name"), "name", t("config.field.name.ph"))}
      {draft.kind === "zivpn" ? <><GroupTitle title={t("config.group.zivpn.access")} icon="shield" />{field(t("config.field.host"), "host", t("config.field.host.ph"))}{field(t("config.field.port"), "port", t("config.field.port.ph"), { keyboardType: "numeric" })}<GroupTitle title={t("config.group.auth")} icon="key" />{field(t("config.field.password"), "password", t("config.field.password.ph"), { note: t("config.field.secretNote") })}<GroupTitle title={t("config.group.throttle")} icon="insights" />{field(t("config.field.upMbps"), "uploadMbps", t("config.field.upMbps.ph"), { keyboardType: "numeric", note: t("config.field.upMbps.note.zivpn") })}{field(t("config.field.downMbps"), "downloadMbps", t("config.field.downMbps.ph"), { keyboardType: "numeric", note: t("config.field.downMbps.note.zivpn") })}</> : null}
      {draft.kind === "slowdns" ? <><GroupTitle title={t("config.group.slowdns.transport")} icon="dns" />{field(t("config.field.dnsServer"), "dnsServer", t("config.field.dnsServer.ph"))}{field(t("config.field.dnsPort"), "dnsPort", t("config.field.dnsPort.ph"), { keyboardType: "numeric" })}{field(t("config.field.nameserver"), "nameserver", t("config.field.nameserver.ph"))}{field(t("config.field.publicKey"), "publicKey", t("config.field.publicKey.ph"), { multiline: true })}<GroupTitle title={t("config.group.ssh")} icon="vpn-key" />{field(t("config.field.sshUser"), "sshUsername", t("config.field.sshUser.ph"))}{field(t("config.field.sshPassword"), "sshPassword", t("config.field.sshPassword"), { note: t("config.field.secretNote") })}</> : null}
      {draft.kind === "hysteria" ? <><GroupTitle title={t("config.group.hysteria.udp")} icon="speed" />{field(t("config.field.host"), "host", t("config.field.host.ph.hysteria"))}{field(t("config.field.portUdp"), "port", t("config.field.portUdp.ph"), { keyboardType: "numeric" })}<GroupTitle title={t("config.group.auth")} icon="key" />{field(t("config.field.authHysteria"), "auth", t("config.field.authHysteria.ph"), { note: t("config.field.secretNote") })}{field(t("config.field.obfs"), "obfs", t("config.field.obfs.ph"), { note: t("config.field.obfs.note") })}<GroupTitle title={t("config.group.throttle")} icon="insights" />{field(t("config.field.upMbps"), "uploadMbps", t("config.field.upMbps.ph"), { keyboardType: "numeric", note: t("config.field.upMbps.note.hysteria") })}{field(t("config.field.downMbps"), "downloadMbps", t("config.field.downMbps.ph"), { keyboardType: "numeric", note: t("config.field.downMbps.note.hysteria") })}</> : null}
      {draft.kind === "http-payload" ? <><GroupTitle title={t("config.group.http.proxy")} icon="http" />{field(t("config.field.proxyHost"), "proxyHost", t("config.field.proxyHost.ph"))}{field(t("config.field.proxyPort"), "proxyPort", t("config.field.proxyPort.ph"), { keyboardType: "numeric" })}{field(t("config.field.payload"), "payload", "CONNECT [host]:[port] HTTP/1.1[crlf]Host: [host]:[port][crlf][crlf]", { multiline: true, note: t("config.field.payload.variablesNote") })}<GroupTitle title={t("config.group.ssh")} icon="vpn-key" />{field(t("config.field.sshHost"), "sshHost", t("config.field.sshHost.ph"))}{field(t("config.field.sshPort"), "sshPort", t("config.field.sshPort.ph"), { keyboardType: "numeric" })}{field(t("config.field.sshUser"), "sshUsername", t("config.field.sshUser.ph"))}{field(t("config.field.sshPassword"), "sshPassword", t("config.field.sshPassword"), { note: t("config.field.secretNote") })}</> : null}
      {draft.kind === "ssh-tls" ? <><GroupTitle title={t("config.group.tls")} icon="lock" />{field(t("config.field.tlsHost"), "tlsHost", t("config.field.tlsHost.ph"))}{field(t("config.field.tlsPort"), "tlsPort", t("config.field.tlsPort.ph"), { keyboardType: "numeric" })}{field(t("config.field.sni"), "sni", t("config.field.tlsHost.ph"), { note: t("config.field.sni.note") })}<GroupTitle title={t("config.group.ssh")} icon="vpn-key" />{field(t("config.field.sshUser"), "sshUsername", t("config.field.sshUser.ph"))}{field(t("config.field.sshPassword"), "sshPassword", t("config.field.sshPassword"), { note: t("config.field.secretNote") })}</> : null}
      {draft.kind === "xray-v2ray" ? <><GroupTitle title={t("config.group.xray.source")} icon="alt-route" /><View style={styles.inputModeRow}><Pressable onPress={() => setDraft({ ...draft, inputMode: "link" })} style={({ pressed }) => [styles.modeButton, { backgroundColor: draft.inputMode === "link" ? colors.primary : colors.surface, borderColor: draft.inputMode === "link" ? colors.primary : colors.border }, pressed && styles.pressed]}><Text style={[styles.modeText, { color: draft.inputMode === "link" ? "#FFFFFF" : colors.foreground }]}>{t("config.mode.link")}</Text></Pressable><Pressable onPress={() => setDraft({ ...draft, inputMode: "json" })} style={({ pressed }) => [styles.modeButton, { backgroundColor: draft.inputMode === "json" ? colors.primary : colors.surface, borderColor: draft.inputMode === "json" ? colors.primary : colors.border }, pressed && styles.pressed]}><Text style={[styles.modeText, { color: draft.inputMode === "json" ? "#FFFFFF" : colors.foreground }]}>JSON</Text></Pressable></View>{draft.inputMode === "link" ? field(t("config.field.linkXray"), "link", t("config.field.linkXray.ph"), { multiline: true }) : field(t("config.field.jsonXray"), "json", "{ \"inbounds\": [], \"outbounds\": [] }", { multiline: true })}</> : null}
      {draft.kind === "v2ray-slowdns" ? <><GroupTitle title={t("config.group.v2dns.transport")} icon="dns" />{field(t("config.field.dnsServer"), "dnsServer", t("config.field.dnsServer.ph"))}{field(t("config.field.dnsPort"), "dnsPort", t("config.field.dnsPort.ph"), { keyboardType: "numeric" })}{field(t("config.field.nameserver"), "nameserver", t("config.field.nameserver.ph"))}{field(t("config.field.publicKey"), "publicKey", t("config.field.publicKey.ph"), { multiline: true })}<GroupTitle title={t("config.group.v2dns.link")} icon="hub" />{field(t("config.field.linkVmess"), "link", t("config.field.linkVmess.ph"), { multiline: true, note: t("config.field.linkVmess.note") })}</> : null}
      <PrimaryAction label={saved ? t("config.saved") : t("config.save")} icon="check" onPress={handleSave} />
    </Panel>;
  };

  return <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right", "bottom"]}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <AppHeader />
      <View><SectionLabel>{t("config.familyActive")}</SectionLabel><FamilySelector activeKind={activeKind} onSelect={selectTunnel} /></View>
      <View style={styles.profilesHeading}><SectionLabel>{t("config.savedProfiles")}</SectionLabel><IconAction label={t("config.add")} icon="add" onPress={beginNew} /></View>
      {profiles.length === 0 ? <Panel style={styles.emptyPanel}><MaterialIcons name="add-circle-outline" size={28} color={colors.primary} /><Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t("config.empty.title")}</Text><Text style={[styles.emptyText, { color: colors.muted }]}>{t("config.empty.text")}</Text><Pressable onPress={beginNew} style={({ pressed }) => [styles.emptyAction, { backgroundColor: colors.surfaceRaised }, pressed && styles.pressed]}><Text style={[styles.emptyActionText, { color: colors.primary }]}>{t("config.addProfile")}</Text></Pressable></Panel> : <View style={styles.profileList}>{profiles.map((profile) => <Panel key={profile.id} style={[styles.profileCard, profile.selected && { borderColor: colors.primary }]}><View style={styles.profileTop}><Pressable onPress={() => toggleProfileSelection(activeKind, profile.id)} accessibilityRole="checkbox" accessibilityState={{ checked: profile.selected }} style={({ pressed }) => [styles.profileToggle, pressed && styles.pressed]}><View style={[styles.check, { borderColor: profile.selected ? colors.primary : colors.border, backgroundColor: profile.selected ? colors.primary : "transparent" }]}>{profile.selected ? <MaterialIcons name="check" size={15} color="#FFFFFF" /> : null}</View><View style={styles.profileText}><Text style={[styles.profileName, { color: colors.foreground }]}>{profile.name}</Text><Text numberOfLines={1} style={[styles.profileEndpoint, { color: colors.muted }]}>{profileEndpoint(profile, t)}</Text></View></Pressable><View style={styles.profileActions}><Pressable accessibilityLabel={t("config.cloneA11y")} onPress={() => handleClone(profile)} style={({ pressed }) => [styles.smallIconButton, { backgroundColor: colors.surfaceRaised }, pressed && styles.pressed]}><MaterialIcons name="content-copy" size={17} color={colors.primary} /></Pressable><Pressable onPress={() => beginEdit(profile)} style={({ pressed }) => [styles.smallIconButton, { backgroundColor: colors.surfaceRaised }, pressed && styles.pressed]}><MaterialIcons name="edit" size={18} color={colors.primary} /></Pressable><Pressable onPress={() => confirmDelete(profile)} style={({ pressed }) => [styles.smallIconButton, { backgroundColor: colors.surfaceRaised }, pressed && styles.pressed]}><MaterialIcons name="delete-outline" size={18} color={colors.error} /></Pressable></View></View></Panel>)}</View>}
      {profileEditor()}
    </ScrollView>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 34, gap: 20 },
  profilesHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  emptyPanel: { alignItems: "center", paddingVertical: 28 },
  emptyTitle: { marginTop: 12, fontSize: 16, fontWeight: "800" },
  emptyText: { marginTop: 6, maxWidth: 260, textAlign: "center", fontSize: 12, lineHeight: 18 },
  emptyAction: { marginTop: 16, minHeight: 42, justifyContent: "center", borderRadius: 13, paddingHorizontal: 15 },
  emptyActionText: { fontSize: 13, fontWeight: "800" },
  profileList: { gap: 10 },
  profileCard: { padding: 14 },
  profileTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  profileToggle: { flex: 1, minHeight: 46, flexDirection: "row", alignItems: "center", gap: 11 },
  check: { width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  profileText: { flex: 1 },
  profileName: { fontSize: 14, fontWeight: "800" },
  profileEndpoint: { marginTop: 4, fontSize: 12 },
  profileActions: { flexDirection: "row", gap: 7 },
  smallIconButton: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  editorPanel: { gap: 16 },
  editorHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  editorTitle: { marginTop: 10, fontSize: 19, fontWeight: "800" },
  groupTitle: { marginTop: 2, flexDirection: "row", alignItems: "center", gap: 7 },
  groupTitleText: { fontSize: 14, fontWeight: "800" },
  fieldGroup: { width: "100%" },
  fieldLabel: { fontSize: 13, fontWeight: "800" },
  fieldNote: { marginTop: 5, fontSize: 11, lineHeight: 16 },
  input: { minHeight: 50, marginTop: 8, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontSize: 15 },
  multilineInput: { minHeight: 108, paddingTop: 12, textAlignVertical: "top" },
  fieldError: { marginTop: 6, fontSize: 11, fontWeight: "700" },
  inputModeRow: { flexDirection: "row", gap: 9 },
  modeButton: { flex: 1, minHeight: 42, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  modeText: { fontSize: 13, fontWeight: "800" },
  pressed: { opacity: 0.76, transform: [{ scale: 0.985 }] },
});
