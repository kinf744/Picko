import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { type ComponentProps, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AppHeader, FamilySelector, IconAction, Panel, PrimaryAction, SectionLabel, StatusPill } from "@/components/kighmu-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { TUNNEL_CATALOG, profileEndpoint, type ProfileFieldErrors, type TunnelProfile } from "@/lib/vpn/tunnel-profiles";
import { useVpn } from "@/lib/vpn/vpn-context";

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
  const { activeKind, selectTunnel, profilesByKind, createProfile, saveProfile, deleteProfile, toggleProfileSelection, resetAllProfiles } = useVpn();
  const [draft, setDraft] = useState<TunnelProfile | null>(null);
  const [errors, setErrors] = useState<ProfileFieldErrors>({});
  const [saved, setSaved] = useState(false);
  const profiles = profilesByKind[activeKind];

  useEffect(() => { setDraft(null); setErrors({}); setSaved(false); }, [activeKind]);
  const patch = (field: string, value: string) => setDraft((current) => current ? ({ ...current, [field]: value } as TunnelProfile) : current);
  const beginNew = () => { setDraft(createProfile(activeKind)); setErrors({}); setSaved(false); };
  const beginEdit = (profile: TunnelProfile) => { setDraft({ ...profile }); setErrors({}); setSaved(false); };
  const handleSave = async () => { if (!draft) return; const outcome = await saveProfile(draft); setErrors(outcome.errors); if (outcome.ok) { setSaved(true); setDraft(null); setTimeout(() => setSaved(false), 2000); } };
  const confirmDelete = (profile: TunnelProfile) => Alert.alert("Supprimer ce profil ?", `Le profil « ${profile.name} » et ses secrets locaux seront supprimés.`, [{ text: "Annuler", style: "cancel" }, { text: "Supprimer", style: "destructive", onPress: () => deleteProfile(profile.kind, profile.id) }]);
  const handleReset = () => Alert.alert("Réinitialiser toutes les collections ?", "Tous les profils, secrets et réglages de balancier seront supprimés de l’appareil.", [{ text: "Annuler", style: "cancel" }, { text: "Réinitialiser", style: "destructive", onPress: () => resetAllProfiles() }]);

  const profileEditor = () => {
    if (!draft) return null;
    const field = (label: string, key: string, placeholder: string, options?: Omit<FieldProps, "label" | "value" | "onChangeText" | "placeholder">) => <Field label={label} value={String((draft as Record<string, unknown>)[key] ?? "")} onChangeText={(value) => patch(key, value)} placeholder={placeholder} error={errors[key]} {...options} />;
    return <Panel raised style={styles.editorPanel}>
      <View style={styles.editorHeader}><View><StatusPill label={profiles.some((profile) => profile.id === draft.id) ? "Modification du profil" : "Nouveau profil"} tone="primary" /><Text style={[styles.editorTitle, { color: colors.foreground }]}>{TUNNEL_CATALOG[draft.kind].label}</Text></View><IconAction label="Fermer" icon="close" onPress={() => setDraft(null)} /></View>
      {field("Nom du profil", "name", "Ex. Serveur principal")}
      {draft.kind === "zivpn" ? <><GroupTitle title="Accès UDP-ZIVPN" icon="shield" />{field("Host ou adresse IP", "host", "vpn.exemple.com ou 203.0.113.10")}{field("Port ou plage de ports", "port", "6000-19999", { keyboardType: "numeric" })}<GroupTitle title="Authentification" icon="key" />{field("Mot de passe", "password", "Mot de passe du serveur", { note: "Affiché à votre demande ; conservez cet écran à l’abri des regards." })}</> : null}
      {draft.kind === "slowdns" ? <><GroupTitle title="Transport DNS" icon="dns" />{field("Serveur DNS/UDP", "dnsServer", "203.0.113.10")}{field("Port DNS UDP", "dnsPort", "53", { keyboardType: "numeric" })}{field("Nameserver SlowDNS", "nameserver", "t.exemple.com")}{field("Clé publique dnstt", "publicKey", "Clé publique du serveur dnstt", { multiline: true })}<GroupTitle title="Accès SSH" icon="vpn-key" />{field("Identifiant SSH", "sshUsername", "utilisateur SSH")}{field("Mot de passe SSH", "sshPassword", "Mot de passe SSH", { note: "Affiché à votre demande ; conservez cet écran à l’abri des regards." })}</> : null}
      {draft.kind === "hysteria" ? <><GroupTitle title="Connexion UDP" icon="speed" />{field("Host ou adresse IP", "host", "hysteria.exemple.com")}{field("Port ou plage UDP", "port", "443 ou 20000-50000", { keyboardType: "numeric" })}<GroupTitle title="Authentification" icon="key" />{field("Authentification Hysteria", "auth", "Mot de passe d’authentification", { note: "Affiché à votre demande ; conservez cet écran à l’abri des regards." })}{field("Obfs facultatif", "obfs", "Clé Obfs", { secureTextEntry: true })}<GroupTitle title="Débits du téléphone" icon="insights" />{field("Débit montant (Mbps)", "uploadMbps", "10", { keyboardType: "numeric", note: "Utilisez le débit montant réellement mesuré sur ce téléphone." })}{field("Débit descendant (Mbps)", "downloadMbps", "50", { keyboardType: "numeric", note: "Une valeur réaliste évite de limiter ou dégrader le tunnel." })}</> : null}
      {draft.kind === "http-payload" ? <><GroupTitle title="Proxy HTTP" icon="http" />{field("Hôte du proxy HTTP", "proxyHost", "proxy.exemple.com")}{field("Port du proxy HTTP", "proxyPort", "8080", { keyboardType: "numeric" })}{field("Payload HTTP", "payload", "CONNECT [host]:[port] HTTP/1.1[crlf]Host: [host]:[port][crlf][crlf]", { multiline: true, note: "Variables : [host], [port], [crlf], [split] et [delay]." })}<GroupTitle title="Accès SSH" icon="vpn-key" />{field("Hôte SSH cible", "sshHost", "ssh.exemple.com")}{field("Port SSH cible", "sshPort", "22", { keyboardType: "numeric" })}{field("Identifiant SSH", "sshUsername", "utilisateur SSH")}{field("Mot de passe SSH", "sshPassword", "Mot de passe SSH", { note: "Affiché à votre demande ; conservez cet écran à l’abri des regards." })}</> : null}
      {draft.kind === "ssh-tls" ? <><GroupTitle title="Couche TLS" icon="lock" />{field("Hôte SSL/TLS", "tlsHost", "tls.exemple.com")}{field("Port SSL/TLS", "tlsPort", "443", { keyboardType: "numeric" })}{field("SNI facultatif", "sni", "tls.exemple.com", { note: "Laissez vide pour utiliser l’hôte SSL/TLS. Le certificat reste validé." })}<GroupTitle title="Accès SSH" icon="vpn-key" />{field("Identifiant SSH", "sshUsername", "utilisateur SSH")}{field("Mot de passe SSH", "sshPassword", "Mot de passe SSH", { note: "Affiché à votre demande ; conservez cet écran à l’abri des regards." })}</> : null}
      {draft.kind === "xray-v2ray" ? <><GroupTitle title="Source Xray/V2Ray" icon="alt-route" /><View style={styles.inputModeRow}><Pressable onPress={() => setDraft({ ...draft, inputMode: "link" })} style={({ pressed }) => [styles.modeButton, { backgroundColor: draft.inputMode === "link" ? colors.primary : colors.surface, borderColor: draft.inputMode === "link" ? colors.primary : colors.border }, pressed && styles.pressed]}><Text style={[styles.modeText, { color: draft.inputMode === "link" ? "#FFFFFF" : colors.foreground }]}>Lien</Text></Pressable><Pressable onPress={() => setDraft({ ...draft, inputMode: "json" })} style={({ pressed }) => [styles.modeButton, { backgroundColor: draft.inputMode === "json" ? colors.primary : colors.surface, borderColor: draft.inputMode === "json" ? colors.primary : colors.border }, pressed && styles.pressed]}><Text style={[styles.modeText, { color: draft.inputMode === "json" ? "#FFFFFF" : colors.foreground }]}>JSON</Text></Pressable></View>{draft.inputMode === "link" ? field("Lien Xray/V2Ray", "link", "vless://, vmess:// ou trojan://", { multiline: true }) : field("Configuration Xray/V2Ray", "json", "{ \"inbounds\": [], \"outbounds\": [] }", { multiline: true })}</> : null}
      {draft.kind === "v2ray-slowdns" ? <><GroupTitle title="Transport SlowDNS" icon="dns" />{field("Serveur DNS/UDP", "dnsServer", "203.0.113.10")}{field("Port DNS UDP", "dnsPort", "53", { keyboardType: "numeric" })}{field("Nameserver SlowDNS", "nameserver", "t.exemple.com")}{field("Clé publique dnstt", "publicKey", "Clé publique du serveur dnstt", { multiline: true })}<GroupTitle title="Lien V2Ray" icon="hub" />{field("Lien VMess, VLESS ou Trojan", "link", "vmess://, vless:// ou trojan://", { multiline: true, note: "Le lien est utilisé à travers le transport SlowDNS ; le JSON brut n’est plus demandé." })}</> : null}
      <PrimaryAction label={saved ? "Profil enregistré" : "Enregistrer le profil"} icon="check" onPress={handleSave} />
    </Panel>;
  };

  return <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right", "bottom"]}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <AppHeader />
      <View><SectionLabel>Famille active</SectionLabel><FamilySelector activeKind={activeKind} onSelect={selectTunnel} /></View>
      <View style={styles.profilesHeading}><SectionLabel>Profils enregistrés</SectionLabel><IconAction label="Ajouter" icon="add" onPress={beginNew} /></View>
      {profiles.length === 0 ? <Panel style={styles.emptyPanel}><MaterialIcons name="add-circle-outline" size={28} color={colors.primary} /><Text style={[styles.emptyTitle, { color: colors.foreground }]}>Créez votre premier profil</Text><Text style={[styles.emptyText, { color: colors.muted }]}>Les paramètres resteront isolés de toutes les autres familles de tunnel.</Text><Pressable onPress={beginNew} style={({ pressed }) => [styles.emptyAction, { backgroundColor: colors.surfaceRaised }, pressed && styles.pressed]}><Text style={[styles.emptyActionText, { color: colors.primary }]}>Ajouter un profil</Text></Pressable></Panel> : <View style={styles.profileList}>{profiles.map((profile) => <Panel key={profile.id} style={[styles.profileCard, profile.selected && { borderColor: colors.primary }]}><View style={styles.profileTop}><Pressable onPress={() => toggleProfileSelection(activeKind, profile.id)} accessibilityRole="checkbox" accessibilityState={{ checked: profile.selected }} style={({ pressed }) => [styles.profileToggle, pressed && styles.pressed]}><View style={[styles.check, { borderColor: profile.selected ? colors.primary : colors.border, backgroundColor: profile.selected ? colors.primary : "transparent" }]}>{profile.selected ? <MaterialIcons name="check" size={15} color="#FFFFFF" /> : null}</View><View style={styles.profileText}><Text style={[styles.profileName, { color: colors.foreground }]}>{profile.name}</Text><Text numberOfLines={1} style={[styles.profileEndpoint, { color: colors.muted }]}>{profileEndpoint(profile)}</Text></View></Pressable><View style={styles.profileActions}><Pressable onPress={() => beginEdit(profile)} style={({ pressed }) => [styles.smallIconButton, { backgroundColor: colors.surfaceRaised }, pressed && styles.pressed]}><MaterialIcons name="edit" size={18} color={colors.primary} /></Pressable><Pressable onPress={() => confirmDelete(profile)} style={({ pressed }) => [styles.smallIconButton, { backgroundColor: colors.surfaceRaised }, pressed && styles.pressed]}><MaterialIcons name="delete-outline" size={18} color={colors.error} /></Pressable></View></View></Panel>)}</View>}
      {profileEditor()}
      <Pressable onPress={handleReset} style={({ pressed }) => [styles.resetButton, pressed && styles.pressed]}><MaterialIcons name="restart-alt" size={18} color={colors.error} /><Text style={[styles.resetText, { color: colors.error }]}>Réinitialiser les profils locaux</Text></Pressable>
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
  resetButton: { minHeight: 50, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginTop: 4 },
  resetText: { fontSize: 13, fontWeight: "800" },
  pressed: { opacity: 0.76, transform: [{ scale: 0.985 }] },
});
