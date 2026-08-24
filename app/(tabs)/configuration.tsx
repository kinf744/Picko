import { useState } from "react";
import { router } from "expo-router";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useLanguage } from "@/lib/language-provider";
import { VpnMethodLabel, profileEndpoint, type TunnelMethod, type VpnProfile } from "@/lib/vpn/profiles";
import { useVpn } from "@/lib/vpn/vpn-context";
import { validateProfile, type ProfileValidationErrors } from "@/lib/vpn/validation";

function Field({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType, multiline, error }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; secureTextEntry?: boolean; keyboardType?: "default" | "numeric"; multiline?: boolean; error?: string }) {
  const colors = useColors();
  const { t } = useLanguage();
  return <View style={styles.fieldGroup}>
    <Text className="mb-2 text-sm font-semibold text-foreground">{t(label)}</Text>
    <TextInput value={value} onChangeText={onChangeText} placeholder={t(placeholder)} placeholderTextColor={colors.muted} secureTextEntry={secureTextEntry} keyboardType={keyboardType} multiline={multiline} autoCapitalize="none" style={[styles.input, multiline && styles.multilineInput, { color: colors.foreground, backgroundColor: colors.surface, borderColor: error ? colors.error : colors.border }]} />
    {error ? <Text className="mt-1 text-xs text-error">{t(error)}</Text> : null}
  </View>;
}

export default function ConfigurationScreen() {
  const colors = useColors();
  const { t } = useLanguage();
  const { profiles, createProfile, saveProfile, duplicateProfile, deleteProfile, setProfileEnabled } = useVpn();
  const [methodPickerVisible, setMethodPickerVisible] = useState(false);
  const [profileMenu, setProfileMenu] = useState<VpnProfile | null>(null);
  const [draft, setDraft] = useState<VpnProfile | null>(null);
  const [errors, setErrors] = useState<ProfileValidationErrors>({});
  const [saving, setSaving] = useState(false);

  const updateDraft = (patch: Partial<VpnProfile>) => setDraft((current) => current ? { ...current, ...patch } : current);
  const dismissDraft = () => setDraft(null);
  const beginCreate = (method: TunnelMethod) => {
    setMethodPickerVisible(false);
    setErrors({});
    setDraft(createProfile(method));
  };
  const beginEdit = (profile: VpnProfile) => {
    setErrors({});
    setDraft({ ...profile });
  };
  const saveDraft = async () => {
    if (!draft) return;
    const nextErrors = validateProfile(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSaving(true);
    const saved = await saveProfile(draft);
    setSaving(false);
    if (saved) dismissDraft();
  };
  const cloneProfile = async (profile: VpnProfile) => {
    const cloned = await duplicateProfile(profile);
    if (!cloned) Alert.alert(t("Clonage impossible"), t("Le profil n’a pas pu être dupliqué. Réessayez après avoir vérifié l’espace de stockage de l’application."));
  };
  const confirmDelete = (profile: VpnProfile) => Alert.alert(t("Supprimer ce profil ?"), t("« {name} » et ses secrets seront supprimés de l’appareil.", { name: profile.name }), [
    { text: t("Annuler"), style: "cancel" },
    { text: t("Supprimer"), style: "destructive", onPress: () => void deleteProfile(profile.id) },
  ]);

  return <ScreenContainer className="px-5 pt-3" edges={["top", "left", "right", "bottom"]} swipeTabs>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.configurationHeader}>
        <Pressable onPress={() => router.navigate("/")} accessibilityRole="button" accessibilityLabel={t("Retour vers Tunnel")} hitSlop={10} style={({ pressed }) => [styles.headerIconButton, pressed && styles.pressed]}>
          <IconSymbol name="chevron.left" size={36} color={colors.foreground} />
        </Pressable>
        <Text className="text-3xl font-bold text-foreground">{t("Profils de tunnel")}</Text>
        <Pressable onPress={() => setMethodPickerVisible(true)} accessibilityRole="button" accessibilityLabel={t("Ajouter un profil")} hitSlop={10} style={({ pressed }) => [styles.headerIconButton, pressed && styles.pressed]}>
          <Text style={[styles.plusIcon, { color: colors.foreground }]}>+</Text>
        </Pressable>
      </View>

      <Text className="mt-8 text-lg leading-6 text-muted">{t("Sélectionnez les profils que vous souhaitez activer.")}</Text>
      <View style={[styles.separator, { backgroundColor: colors.border }]} />

      {profiles.length === 0 ? <View style={styles.emptyState}><Text className="text-base font-semibold text-foreground">{t("Aucun profil")}</Text><Text className="mt-2 text-sm leading-5 text-muted">{t("Utilisez « Ajouter un profil » pour créer un tunnel ZiVPN UDP, SSH SlowDNS, Hysteria UDP, Xray, V2Ray DNS, HTTP Proxy payload ou SSH SSL/TLS.")}</Text></View> : null}

      <View style={styles.profileList}>{profiles.map((profile) => <View key={profile.id} style={[styles.profileRow, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => void setProfileEnabled(profile.id, !profile.enabled)} accessibilityRole="checkbox" accessibilityState={{ checked: profile.enabled }} accessibilityLabel={`${profile.name} : ${profile.enabled ? t("Actif : inclus dans l’équilibrage") : t("Inactif : conservé sans connexion")}`} hitSlop={8} style={({ pressed }) => [styles.profileSelection, pressed && styles.pressed]}>
          <View style={[styles.checkbox, { borderColor: profile.enabled ? colors.primary : colors.muted, backgroundColor: profile.enabled ? colors.primary : "transparent" }]}>{profile.enabled ? <Text style={styles.checkboxMark}>✓</Text> : null}</View>
          <View style={styles.profileMeta}><Text className="text-xl font-bold text-foreground" numberOfLines={1}>{profile.name || VpnMethodLabel[profile.method]}</Text><Text className="mt-1 text-base text-muted" numberOfLines={1}>{profileEndpoint(profile)}</Text></View>
        </Pressable>
        <Pressable onPress={() => setProfileMenu(profile)} accessibilityRole="button" accessibilityLabel={t("Actions du profil")} hitSlop={12} style={({ pressed }) => [styles.actionTrigger, pressed && styles.pressed]}>
          <IconSymbol name="ellipsis" size={28} color={colors.muted} />
        </Pressable>
      </View>)}</View>
    </ScrollView>

    <Modal visible={profileMenu !== null} transparent animationType="fade" onRequestClose={() => setProfileMenu(null)}>
      <View style={styles.actionOverlay}>
        <Pressable onPress={() => setProfileMenu(null)} style={StyleSheet.absoluteFill} />
        <View style={[styles.actionMenu, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text className="mb-2 text-sm font-bold text-muted" numberOfLines={1}>{profileMenu?.name || t("Profils de tunnel")}</Text>
          <Pressable onPress={() => { const selected = profileMenu; setProfileMenu(null); if (selected) beginEdit(selected); }} style={({ pressed }) => [styles.actionMenuItem, pressed && styles.pressed]}><Text className="text-base font-semibold text-foreground">{t("Modifier")}</Text></Pressable>
          <Pressable onPress={() => { const selected = profileMenu; setProfileMenu(null); if (selected) void cloneProfile(selected); }} style={({ pressed }) => [styles.actionMenuItem, pressed && styles.pressed]}><Text className="text-base font-semibold text-foreground">{t("Cloner")}</Text></Pressable>
          <Pressable onPress={() => { const selected = profileMenu; setProfileMenu(null); if (selected) confirmDelete(selected); }} style={({ pressed }) => [styles.actionMenuItem, pressed && styles.pressed]}><Text style={{ color: colors.error, fontSize: 16, fontWeight: "700" }}>{t("Supprimer")}</Text></Pressable>
        </View>
      </View>
    </Modal>

    <Modal visible={methodPickerVisible} transparent animationType="fade" onRequestClose={() => setMethodPickerVisible(false)}>
      <View style={styles.backdrop}><View style={[styles.modalCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <Text className="text-xl font-bold text-foreground">{t("Nouveau profil")}</Text>
        <Text className="mt-2 text-sm leading-5 text-muted">{t("Choisissez la méthode du tunnel à configurer.")}</Text>
        <Pressable onPress={() => beginCreate("zivpn-udp")} style={({ pressed }) => [styles.methodButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}><Text className="text-base font-bold text-foreground">ZiVPN UDP</Text><Text className="mt-1 text-sm text-muted">{t("Tunnel UDP avec Obfs et mot de passe")}</Text></Pressable>
        <Pressable onPress={() => beginCreate("ssh-slowdns")} style={({ pressed }) => [styles.methodButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}><Text className="text-base font-bold text-foreground">SSH SlowDNS</Text><Text className="mt-1 text-sm text-muted">{t("SSH transporté par DNSTT / DNS")}</Text></Pressable>
        <Pressable onPress={() => beginCreate("hysteria-udp")} style={({ pressed }) => [styles.methodButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}><Text className="text-base font-bold text-foreground">Hysteria UDP</Text><Text className="mt-1 text-sm text-muted">{t("UDP rapide, avec port hopping facultatif")}</Text></Pressable>
        <Pressable onPress={() => beginCreate("xray")} style={({ pressed }) => [styles.methodButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}><Text className="text-base font-bold text-foreground">Xray</Text><Text className="mt-1 text-sm text-muted">{t("Lien VMess, VLESS ou Trojan, ou JSON Xray")}</Text></Pressable>
        <Pressable onPress={() => beginCreate("v2ray-dns")} style={({ pressed }) => [styles.methodButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}><Text className="text-base font-bold text-foreground">V2Ray DNS</Text><Text className="mt-1 text-sm text-muted">{t("Xray/V2Ray transporté par DNSTT / DNS")}</Text></Pressable>
        <Pressable onPress={() => beginCreate("http-proxy-payload")} style={({ pressed }) => [styles.methodButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}><Text className="text-base font-bold text-foreground">HTTP Proxy Payload</Text><Text className="mt-1 text-sm text-muted">{t("SSH transporté au travers d’un proxy HTTP personnalisé")}</Text></Pressable>
        <Pressable onPress={() => beginCreate("ssh-ssl-tls")} style={({ pressed }) => [styles.methodButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}><Text className="text-base font-bold text-foreground">SSH SSL/TLS</Text><Text className="mt-1 text-sm text-muted">{t("SSH encapsulé dans une connexion SSL/TLS avec SNI")}</Text></Pressable>
        <Pressable onPress={() => setMethodPickerVisible(false)} style={styles.cancelButton}><Text className="text-sm font-semibold text-muted">{t("Annuler")}</Text></Pressable>
      </View></View>
    </Modal>

    <Modal visible={draft !== null} animationType="slide" onRequestClose={dismissDraft}>
      <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right", "bottom"]}>
        <ScrollView contentContainerStyle={styles.editorContent} keyboardShouldPersistTaps="handled">
          {draft ? <><View style={styles.editorHeader}><View><Text className="text-2xl font-bold text-foreground">{draft.name ? t("Configurer le profil") : t("Nouveau profil")}</Text><Text className="mt-1 text-sm text-primary">{VpnMethodLabel[draft.method]}</Text></View><Pressable onPress={dismissDraft}><Text className="text-base font-semibold text-primary">{t("Fermer")}</Text></Pressable></View>
          <View style={[styles.editorCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Field label="Nom du profil" value={draft.name} onChangeText={(name) => updateDraft({ name })} placeholder="Ex. Réseau mobile" error={errors.name} />
            {draft.method === "zivpn-udp" ? <>
              <Field label="Hôte ou adresse IP" value={draft.host} onChangeText={(host) => updateDraft({ host })} placeholder="vpn.exemple.com" error={errors.host} />
              <Field label="Port ou plage" value={draft.port} onChangeText={(port) => updateDraft({ port })} placeholder="443 ou 6000-19999" keyboardType="numeric" error={errors.port} />
              <Field label="Mot de passe" value={draft.password} onChangeText={(password) => updateDraft({ password })} placeholder="Mot de passe du serveur" error={errors.password} />
            </> : draft.method === "ssh-slowdns" ? <>
              <Field label="Serveur SSH" value={draft.sshHost} onChangeText={(sshHost) => updateDraft({ sshHost })} placeholder="ssh.exemple.com" error={errors.sshHost} />
              <Field label="Port SSH" value={draft.sshPort} onChangeText={(sshPort) => updateDraft({ sshPort })} placeholder="22" keyboardType="numeric" error={errors.sshPort} />
              <Field label="Utilisateur SSH" value={draft.sshUser} onChangeText={(sshUser) => updateDraft({ sshUser })} placeholder="utilisateur" error={errors.sshUser} />
              <Field label="Mot de passe SSH" value={draft.password} onChangeText={(password) => updateDraft({ password })} placeholder="Mot de passe SSH" error={errors.password} />
              <Field label="Résolveur DNS" value={draft.dnsServer} onChangeText={(dnsServer) => updateDraft({ dnsServer })} placeholder="8.8.8.8" error={errors.dnsServer} />
              <Field label="Port DNS" value={draft.dnsPort} onChangeText={(dnsPort) => updateDraft({ dnsPort })} placeholder="53" keyboardType="numeric" error={errors.dnsPort} />
              <Field label="Domaine SlowDNS" value={draft.nameserver} onChangeText={(nameserver) => updateDraft({ nameserver })} placeholder="tunnel.exemple.com" error={errors.nameserver} />
              <Field label="Clé publique DNSTT" value={draft.publicKey} onChangeText={(publicKey) => updateDraft({ publicKey })} placeholder="Clé publique du serveur DNSTT" multiline error={errors.publicKey} />
            </> : draft.method === "hysteria-udp" ? <>
              <Field label="Serveur Hysteria" value={draft.hysteriaHost} onChangeText={(hysteriaHost) => updateDraft({ hysteriaHost })} placeholder="hysteria.exemple.com" error={errors.hysteriaHost} />
              <Field label="Port ou plage Hysteria" value={draft.hysteriaPort} onChangeText={(hysteriaPort) => updateDraft({ hysteriaPort })} placeholder="443 ou 20000-50000" error={errors.hysteriaPort} />
              <Field label="Mot de passe Hysteria" value={draft.hysteriaAuth} onChangeText={(hysteriaAuth) => updateDraft({ hysteriaAuth })} placeholder="Mot de passe du serveur" error={errors.hysteriaAuth} />
              <Field label="Débit montant (Mbps)" value={draft.hysteriaUpMbps} onChangeText={(hysteriaUpMbps) => updateDraft({ hysteriaUpMbps })} placeholder="100" keyboardType="numeric" error={errors.hysteriaUpMbps} />
              <Field label="Débit descendant (Mbps)" value={draft.hysteriaDownMbps} onChangeText={(hysteriaDownMbps) => updateDraft({ hysteriaDownMbps })} placeholder="100" keyboardType="numeric" error={errors.hysteriaDownMbps} />
              <Field label="Obfs Hysteria (facultatif)" value={draft.hysteriaObfs} onChangeText={(hysteriaObfs) => updateDraft({ hysteriaObfs })} placeholder="Clé d’obfuscation" />
            </> : draft.method === "v2ray-dns" ? <>
              <Field label="Lien V2Ray / Xray (vmess / vless / trojan)" value={draft.xrayLink} onChangeText={(xrayLink) => updateDraft({ xrayLink, xrayMode: "link" })} placeholder="vless://…" multiline error={errors.xrayLink} />
              <Field label="Configuration JSON Xray (facultatif)" value={draft.xrayJson} onChangeText={(xrayJson) => updateDraft({ xrayJson, xrayMode: "json" })} placeholder={'{ "inbounds": [...], "outbounds": [...] }'} multiline error={errors.xrayJson} />
              <View style={styles.modeRow}><Text className="text-sm font-semibold text-foreground">{t("Mode Xray actif")}</Text><View style={styles.modeButtons}><Pressable onPress={() => updateDraft({ xrayMode: "link" })} style={[styles.modeButton, { borderColor: draft.xrayMode === "link" ? colors.primary : colors.border }]}><Text style={{ color: draft.xrayMode === "link" ? colors.primary : colors.muted }}>{t("Lien")}</Text></Pressable><Pressable onPress={() => updateDraft({ xrayMode: "json" })} style={[styles.modeButton, { borderColor: draft.xrayMode === "json" ? colors.primary : colors.border }]}><Text style={{ color: draft.xrayMode === "json" ? colors.primary : colors.muted }}>JSON</Text></Pressable></View></View>
              <Field label="Résolveur DNS" value={draft.dnsServer} onChangeText={(dnsServer) => updateDraft({ dnsServer })} placeholder="8.8.8.8" error={errors.dnsServer} />
              <Field label="Port DNS" value={draft.dnsPort} onChangeText={(dnsPort) => updateDraft({ dnsPort })} placeholder="53" keyboardType="numeric" error={errors.dnsPort} />
              <Field label="Domaine SlowDNS" value={draft.nameserver} onChangeText={(nameserver) => updateDraft({ nameserver })} placeholder="tunnel.exemple.com" error={errors.nameserver} />
              <Field label="Clé publique DNSTT" value={draft.publicKey} onChangeText={(publicKey) => updateDraft({ publicKey })} placeholder="Clé publique du serveur DNSTT" multiline error={errors.publicKey} />
            </> : draft.method === "http-proxy-payload" ? <>
              <Field label="Serveur SSH cible" value={draft.sshHost} onChangeText={(sshHost) => updateDraft({ sshHost })} placeholder="ssh.exemple.com" error={errors.sshHost} />
              <Field label="Port SSH cible" value={draft.sshPort} onChangeText={(sshPort) => updateDraft({ sshPort })} placeholder="22" keyboardType="numeric" error={errors.sshPort} />
              <Field label="Utilisateur SSH" value={draft.sshUser} onChangeText={(sshUser) => updateDraft({ sshUser })} placeholder="utilisateur" error={errors.sshUser} />
              <Field label="Mot de passe SSH" value={draft.password} onChangeText={(password) => updateDraft({ password })} placeholder="Mot de passe SSH" error={errors.password} />
              <Field label="Serveur du proxy HTTP" value={draft.proxyHost} onChangeText={(proxyHost) => updateDraft({ proxyHost })} placeholder="proxy.exemple.com" error={errors.proxyHost} />
              <Field label="Port du proxy HTTP" value={draft.proxyPort} onChangeText={(proxyPort) => updateDraft({ proxyPort })} placeholder="8080" keyboardType="numeric" error={errors.proxyPort} />
              <Field label="Payload HTTP" value={draft.httpPayload} onChangeText={(httpPayload) => updateDraft({ httpPayload })} placeholder="CONNECT [host]:[port] HTTP/1.1[crlf]…" multiline error={errors.httpPayload} />
              <Text className="text-sm leading-5 text-muted">{t("Variables disponibles : [host], [port], [proxy_host], [proxy_port], [crlf], [split] et [delay]. Le payload reste entièrement visible après enregistrement.")}</Text>
            </> : draft.method === "ssh-ssl-tls" ? <>
              <Field label="Serveur SSL/TLS" value={draft.sshHost} onChangeText={(sshHost) => updateDraft({ sshHost })} placeholder="ssl.exemple.com" error={errors.sshHost} />
              <Field label="Port SSL/TLS" value={draft.sshPort} onChangeText={(sshPort) => updateDraft({ sshPort })} placeholder="443" keyboardType="numeric" error={errors.sshPort} />
              <Field label="Utilisateur SSH" value={draft.sshUser} onChangeText={(sshUser) => updateDraft({ sshUser })} placeholder="utilisateur" error={errors.sshUser} />
              <Field label="Mot de passe SSH" value={draft.password} onChangeText={(password) => updateDraft({ password })} placeholder="Mot de passe SSH" error={errors.password} />
              <Field label="SNI (facultatif)" value={draft.sslSni} onChangeText={(sslSni) => updateDraft({ sslSni })} placeholder="sni.exemple.com" error={errors.sslSni} />
              <Field label="Version TLS" value={draft.sslTlsVersion} onChangeText={(sslTlsVersion) => updateDraft({ sslTlsVersion })} placeholder="TLS, TLSv1.2 ou TLSv1.3" error={errors.sslTlsVersion} />
              <Text className="text-sm leading-5 text-muted">{t("Utilisez le SNI attendu par le serveur. Le certificat est accepté comme dans l’implémentation de référence.")}</Text>
            </> : <>
              <Field label="Lien Xray (vmess / vless / trojan)" value={draft.xrayLink} onChangeText={(xrayLink) => updateDraft({ xrayLink, xrayMode: "link" })} placeholder="vless://…" multiline error={errors.xrayLink} />
              <Text className="text-sm leading-5 text-muted">{t("Pour une configuration avancée, collez directement le JSON Xray ci-dessous. Le mode JSON est prioritaire lorsque vous le sélectionnez dans le nom du profil.")}</Text>
              <Field label="Configuration JSON Xray (facultatif)" value={draft.xrayJson} onChangeText={(xrayJson) => updateDraft({ xrayJson, xrayMode: "json" })} placeholder={'{ "inbounds": [...], "outbounds": [...] }'} multiline error={errors.xrayJson} />
              <View style={styles.modeRow}><Text className="text-sm font-semibold text-foreground">{t("Mode actif")}</Text><View style={styles.modeButtons}><Pressable onPress={() => updateDraft({ xrayMode: "link" })} style={[styles.modeButton, { borderColor: draft.xrayMode === "link" ? colors.primary : colors.border }]}><Text style={{ color: draft.xrayMode === "link" ? colors.primary : colors.muted }}>{t("Lien")}</Text></Pressable><Pressable onPress={() => updateDraft({ xrayMode: "json" })} style={[styles.modeButton, { borderColor: draft.xrayMode === "json" ? colors.primary : colors.border }]}><Text style={{ color: draft.xrayMode === "json" ? colors.primary : colors.muted }}>JSON</Text></Pressable></View></View>
            </>}
          </View>
          <Pressable onPress={() => void saveDraft()} disabled={saving} style={({ pressed }) => [styles.addButton, { backgroundColor: colors.primary }, (pressed || saving) && styles.pressed]}><Text style={styles.addText}>{saving ? t("Enregistrement…") : t("Enregistrer le profil")}</Text></Pressable>
          </> : null}
        </ScrollView>
      </ScreenContainer>
    </Modal>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 30 },
  configurationHeader: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerIconButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  plusIcon: { fontSize: 46, fontWeight: "300", lineHeight: 48, marginTop: -4 },
  separator: { height: StyleSheet.hairlineWidth, marginTop: 28 },
  emptyState: { paddingVertical: 28 },
  profileList: { width: "100%" },
  profileRow: { minHeight: 102, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth },
  profileSelection: { flex: 1, minHeight: 101, flexDirection: "row", alignItems: "center", paddingRight: 10 },
  checkbox: { width: 28, height: 28, borderWidth: 2, borderRadius: 6, alignItems: "center", justifyContent: "center", marginHorizontal: 8 },
  checkboxMark: { color: "#FFFFFF", fontWeight: "900", fontSize: 21, lineHeight: 22 },
  profileMeta: { flex: 1, minWidth: 0, marginLeft: 12 },
  actionTrigger: { width: 52, minHeight: 76, alignItems: "center", justifyContent: "center" },
  actionOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.42)", alignItems: "flex-end", justifyContent: "flex-start", paddingTop: 148, paddingRight: 22 },
  actionMenu: { width: 212, borderWidth: 1, borderRadius: 16, padding: 8 },
  actionMenuItem: { minHeight: 46, justifyContent: "center", paddingHorizontal: 10, borderRadius: 10 },
  modeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modeButtons: { flexDirection: "row", gap: 8 },
  modeButton: { minWidth: 70, minHeight: 38, borderWidth: 1, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  addButton: { minHeight: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 20 },
  addText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.46)", alignItems: "center", justifyContent: "center", padding: 22 },
  modalCard: { width: "100%", maxWidth: 460, borderWidth: 1, borderRadius: 24, padding: 20 },
  methodButton: { borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 16 },
  cancelButton: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: 10 },
  editorContent: { paddingBottom: 30 },
  editorHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
  editorCard: { borderWidth: 1, borderRadius: 22, padding: 18, gap: 17 },
  fieldGroup: { width: "100%" },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontSize: 15 },
  multilineInput: { minHeight: 92, paddingTop: 12, textAlignVertical: "top" },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});
