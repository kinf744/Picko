import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { TUNNEL_CATALOG, TUNNEL_KINDS, profileEndpoint, type ProfileFieldErrors, type TunnelKind, type TunnelProfile } from "@/lib/vpn/tunnel-profiles";
import { useVpn } from "@/lib/vpn/vpn-context";

function Field({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType, error, multiline, note }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; secureTextEntry?: boolean; keyboardType?: "default" | "numeric"; error?: string; multiline?: boolean; note?: string }) {
  const colors = useColors();
  return <View style={styles.fieldGroup}>
    <Text className="mb-2 text-sm font-semibold text-foreground">{label}</Text>
    {note ? <Text className="mb-2 text-xs leading-4 text-muted">{note}</Text> : null}
    <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} secureTextEntry={secureTextEntry} keyboardType={keyboardType} autoCapitalize="none" multiline={multiline} style={[styles.input, multiline && styles.multilineInput, { color: colors.foreground, backgroundColor: colors.surface, borderColor: error ? colors.error : colors.border }]} />
    {error ? <Text className="mt-1 text-xs text-error">{error}</Text> : null}
  </View>;
}

export default function ConfigurationScreen() {
  const colors = useColors();
  const { activeKind, selectTunnel, profilesByKind, balancersByKind, createProfile, saveProfile, deleteProfile, toggleProfileSelection, setBalancer, resetAllProfiles } = useVpn();
  const [draft, setDraft] = useState<TunnelProfile | null>(null);
  const [errors, setErrors] = useState<ProfileFieldErrors>({});
  const [saved, setSaved] = useState(false);
  const profiles = profilesByKind[activeKind];
  const selectedCount = useMemo(() => profiles.filter((profile) => profile.selected).length, [profiles]);
  const balancer = balancersByKind[activeKind];

  useEffect(() => { setDraft(null); setErrors({}); setSaved(false); }, [activeKind]);
  const patch = (field: string, value: string) => setDraft((current) => current ? ({ ...current, [field]: value } as TunnelProfile) : current);
  const beginNew = () => { setDraft(createProfile(activeKind)); setErrors({}); setSaved(false); };
  const beginEdit = (profile: TunnelProfile) => { setDraft({ ...profile }); setErrors({}); setSaved(false); };
  const handleSave = async () => {
    if (!draft) return;
    const outcome = await saveProfile(draft);
    setErrors(outcome.errors);
    if (outcome.ok) { setSaved(true); setDraft(null); setTimeout(() => setSaved(false), 2000); }
  };
  const confirmDelete = (profile: TunnelProfile) => Alert.alert("Supprimer ce profil ?", `Le profil « ${profile.name} » et ses secrets locaux seront supprimés.`, [{ text: "Annuler", style: "cancel" }, { text: "Supprimer", style: "destructive", onPress: () => deleteProfile(profile.kind, profile.id) }]);
  const handleReset = () => Alert.alert("Réinitialiser toutes les collections ?", "Tous les profils, secrets et réglages de balancier seront supprimés de l’appareil.", [{ text: "Annuler", style: "cancel" }, { text: "Réinitialiser", style: "destructive", onPress: () => resetAllProfiles() }]);

  const profileEditor = () => {
    if (!draft) return null;
    const field = (label: string, key: string, placeholder: string, options?: Omit<React.ComponentProps<typeof Field>, "label" | "value" | "onChangeText" | "placeholder">) => <Field label={label} value={String((draft as Record<string, unknown>)[key] ?? "")} onChangeText={(value) => patch(key, value)} placeholder={placeholder} error={errors[key]} {...options} />;
    return <View style={[styles.editorCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.editorHeader}><View><Text className="text-base font-bold text-foreground">{profiles.some((profile) => profile.id === draft.id) ? "Modifier le profil" : "Nouveau profil"}</Text><Text className="mt-1 text-xs text-muted">{TUNNEL_CATALOG[draft.kind].label}</Text></View><Pressable onPress={() => setDraft(null)} style={({ pressed }) => [styles.closeButton, { borderColor: colors.border }, pressed && styles.pressed]}><Text className="text-sm font-bold text-muted">Fermer</Text></Pressable></View>
      {field("Nom du profil", "name", "Ex. Serveur principal")}
      {draft.kind === "zivpn" ? <>
        {field("Host ou adresse IP", "host", "vpn.exemple.com ou 203.0.113.10")}
        {field("Port ou plage de ports", "port", "6000-19999", { keyboardType: "numeric" })}
        {field("Obfs", "obfs", "Clé Obfs", { secureTextEntry: true })}
        {field("Mot de passe", "password", "Mot de passe du serveur", { secureTextEntry: true })}
      </> : null}
      {draft.kind === "slowdns" ? <>
        {field("Serveur DNS/UDP", "dnsServer", "203.0.113.10")}
        {field("Port DNS UDP", "dnsPort", "53", { keyboardType: "numeric" })}
        {field("Nameserver SlowDNS", "nameserver", "t.exemple.com")}
        {field("Clé publique dnstt", "publicKey", "Clé publique du serveur dnstt", { multiline: true })}
        {field("Hôte SSH attendu", "sshHost", "ssh.exemple.com", { note: "Libellé de contrôle : la cible SSH réelle est définie par le serveur SlowDNS." })}
        {field("Identifiant SSH", "sshUsername", "utilisateur SSH")}
        {field("Mot de passe SSH", "sshPassword", "Mot de passe SSH", { secureTextEntry: true })}
      </> : null}
      {draft.kind === "hysteria" ? <>
        {field("Host ou adresse IP", "host", "hysteria.exemple.com")}
        {field("Port ou plage UDP", "port", "443 ou 20000-50000", { keyboardType: "numeric" })}
        {field("Authentification Hysteria", "auth", "Mot de passe d’authentification", { secureTextEntry: true })}
        {field("Obfs facultatif", "obfs", "Clé Obfs", { secureTextEntry: true })}
        {field("Débit montant (Mbps)", "uploadMbps", "10", { keyboardType: "numeric", note: "Indiquez le débit montant réellement mesuré sur ce téléphone. Une valeur trop élevée ou trop basse peut réduire les performances." })}
        {field("Débit descendant (Mbps)", "downloadMbps", "50", { keyboardType: "numeric", note: "Indiquez le débit descendant réellement mesuré sur ce téléphone. Ce réglage est propre à ce profil Hysteria." })}
      </> : null}
      {draft.kind === "http-payload" ? <>
        {field("Hôte du proxy HTTP", "proxyHost", "proxy.exemple.com")}
        {field("Port du proxy HTTP", "proxyPort", "8080", { keyboardType: "numeric" })}
        {field("Payload HTTP", "payload", "CONNECT [host]:[port] HTTP/1.1[crlf]Host: [host]:[port][crlf][crlf]", { multiline: true, note: "Variables prises en charge : [host], [port], [crlf], [split] et [delay]." })}
        {field("Hôte SSH cible", "sshHost", "ssh.exemple.com")}
        {field("Port SSH cible", "sshPort", "22", { keyboardType: "numeric" })}
        {field("Identifiant SSH", "sshUsername", "utilisateur SSH")}
        {field("Mot de passe SSH", "sshPassword", "Mot de passe SSH", { secureTextEntry: true })}
      </> : null}
      {draft.kind === "ssh-tls" ? <>
        {field("Hôte SSL/TLS", "tlsHost", "tls.exemple.com")}
        {field("Port SSL/TLS", "tlsPort", "443", { keyboardType: "numeric" })}
        {field("SNI facultatif", "sni", "tls.exemple.com", { note: "Laissez vide pour utiliser l’hôte SSL/TLS. Le certificat TLS est validé avant la connexion SSH." })}
        {field("Identifiant SSH", "sshUsername", "utilisateur SSH")}
        {field("Mot de passe SSH", "sshPassword", "Mot de passe SSH", { secureTextEntry: true })}
      </> : null}
      {draft.kind === "xray-v2ray" ? <>
        <View style={styles.inputModeRow}><Pressable onPress={() => setDraft({ ...draft, inputMode: "link" })} style={[styles.inputMode, { borderColor: draft.inputMode === "link" ? colors.primary : colors.border, backgroundColor: draft.inputMode === "link" ? colors.primary : colors.background }]}><Text style={{ color: draft.inputMode === "link" ? "#fff" : colors.foreground, fontWeight: "700", fontSize: 12 }}>Lien</Text></Pressable><Pressable onPress={() => setDraft({ ...draft, inputMode: "json" })} style={[styles.inputMode, { borderColor: draft.inputMode === "json" ? colors.primary : colors.border, backgroundColor: draft.inputMode === "json" ? colors.primary : colors.background }]}><Text style={{ color: draft.inputMode === "json" ? "#fff" : colors.foreground, fontWeight: "700", fontSize: 12 }}>JSON</Text></Pressable></View>
        {draft.inputMode === "link" ? field("Lien Xray/V2Ray", "link", "vless://, vmess:// ou trojan://", { multiline: true }) : field("Configuration Xray/V2Ray", "json", "{ \"inbounds\": [], \"outbounds\": [] }", { multiline: true })}
      </> : null}
      {draft.kind === "v2ray-slowdns" ? <>
        {field("Serveur DNS/UDP", "dnsServer", "203.0.113.10")}
        {field("Port DNS UDP", "dnsPort", "53", { keyboardType: "numeric" })}
        {field("Nameserver SlowDNS", "nameserver", "t.exemple.com")}
        {field("Clé publique dnstt", "publicKey", "Clé publique du serveur dnstt", { multiline: true })}
        {field("Configuration V2Ray", "json", "{ \"inbounds\": [], \"outbounds\": [] }", { multiline: true, note: "Configuration V2Ray utilisée à travers le transport SlowDNS." })}
      </> : null}
      <Pressable onPress={handleSave} style={({ pressed }) => [styles.saveButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}><Text style={styles.saveText}>{saved ? "Profil enregistré" : "Enregistrer le profil"}</Text></Pressable>
    </View>;
  };

  return <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right", "bottom"]}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Text className="text-3xl font-bold text-foreground">Profils de tunnel</Text>
      <Text className="mt-2 text-sm leading-5 text-muted">Chaque famille conserve ses profils, secrets et fichiers runtime séparément. Le balancier ne distribue que les profils sélectionnés du tunnel choisi.</Text>
      <View style={styles.catalog}>{TUNNEL_KINDS.map((kind) => <Pressable key={kind} onPress={() => selectTunnel(kind)} style={({ pressed }) => [styles.catalogCard, { backgroundColor: activeKind === kind ? TUNNEL_CATALOG[kind].accent : colors.surface, borderColor: activeKind === kind ? TUNNEL_CATALOG[kind].accent : colors.border }, pressed && styles.pressed]}><Text style={{ color: activeKind === kind ? "#fff" : colors.foreground, fontSize: 13, fontWeight: "800" }}>{TUNNEL_CATALOG[kind].shortLabel}</Text><Text numberOfLines={2} style={{ color: activeKind === kind ? "#fff" : colors.muted, fontSize: 10, marginTop: 4, lineHeight: 13 }}>{TUNNEL_CATALOG[kind].description}</Text></Pressable>)}</View>
      <View style={[styles.familyHeader, { borderColor: colors.border }]}><View style={{ flex: 1 }}><Text className="text-lg font-bold text-foreground">{TUNNEL_CATALOG[activeKind].label}</Text><Text className="mt-1 text-xs text-muted">{profiles.length} profil{profiles.length > 1 ? "s" : ""} enregistré{profiles.length > 1 ? "s" : ""} · {selectedCount} sélectionné{selectedCount > 1 ? "s" : ""}</Text></View><Pressable onPress={beginNew} style={({ pressed }) => [styles.addButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}><Text style={styles.addText}>+ Profil</Text></Pressable></View>
      <View style={[styles.balancerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={{ flex: 1 }}><Text className="text-sm font-bold text-foreground">Balancier multi-profils</Text><Text className="mt-1 text-xs leading-4 text-muted">Round-robin local entre les sorties SOCKS saines de {TUNNEL_CATALOG[activeKind].shortLabel}. Minimum : deux profils sélectionnés.</Text></View><Switch value={balancer.enabled} onValueChange={(enabled) => setBalancer(activeKind, { enabled })} trackColor={{ false: colors.border, true: TUNNEL_CATALOG[activeKind].accent }} /></View>
      {profiles.length === 0 ? <View style={[styles.empty, { borderColor: colors.border }]}><Text className="text-sm font-bold text-foreground">Aucun profil pour ce tunnel</Text><Text className="mt-1 text-xs text-center leading-4 text-muted">Ajoutez un profil. Ses paramètres ne seront jamais partagés avec une autre famille.</Text></View> : <View style={styles.profileList}>{profiles.map((profile) => <View key={profile.id} style={[styles.profileCard, { backgroundColor: colors.surface, borderColor: profile.selected ? TUNNEL_CATALOG[activeKind].accent : colors.border }]}><Pressable onPress={() => toggleProfileSelection(activeKind, profile.id)} style={styles.profileSelect}><View style={[styles.check, { borderColor: profile.selected ? TUNNEL_CATALOG[activeKind].accent : colors.border, backgroundColor: profile.selected ? TUNNEL_CATALOG[activeKind].accent : "transparent" }]}>{profile.selected ? <Text style={styles.checkText}>✓</Text> : null}</View><View style={styles.profileInfo}><Text className="text-sm font-bold text-foreground">{profile.name}</Text><Text numberOfLines={1} className="mt-1 text-xs text-muted">{profileEndpoint(profile)}</Text></View></Pressable><View style={styles.profileActions}><Pressable onPress={() => beginEdit(profile)} style={({ pressed }) => [styles.actionButton, { borderColor: colors.border }, pressed && styles.pressed]}><Text style={{ color: colors.primary, fontSize: 12, fontWeight: "800" }}>Modifier</Text></Pressable><Pressable onPress={() => confirmDelete(profile)} style={({ pressed }) => [styles.actionButton, { borderColor: colors.border }, pressed && styles.pressed]}><Text style={{ color: colors.error, fontSize: 12, fontWeight: "800" }}>Supprimer</Text></Pressable></View></View>)}</View>}
      {profileEditor()}
      <Pressable onPress={handleReset} style={({ pressed }) => [styles.resetButton, pressed && styles.pressed]}><Text className="text-sm font-semibold text-error">Réinitialiser toutes les collections</Text></Pressable>
    </ScrollView>
  </ScreenContainer>;
}

const styles = StyleSheet.create({ content: { paddingBottom: 32 }, catalog: { flexDirection: "row", flexWrap: "wrap", gap: 9, paddingVertical: 18 }, catalogCard: { width: "31.9%", minHeight: 86, borderWidth: 1, borderRadius: 18, padding: 11, justifyContent: "center" }, familyHeader: { borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", paddingBottom: 15, marginBottom: 15 }, addButton: { minHeight: 42, borderRadius: 13, paddingHorizontal: 15, alignItems: "center", justifyContent: "center" }, addText: { color: "#fff", fontSize: 13, fontWeight: "800" }, balancerCard: { borderWidth: 1, borderRadius: 18, padding: 15, flexDirection: "row", alignItems: "center", gap: 12 }, empty: { borderWidth: 1, borderRadius: 18, marginTop: 16, padding: 24, alignItems: "center" }, profileList: { marginTop: 16, gap: 10 }, profileCard: { borderWidth: 1, borderRadius: 18, padding: 14 }, profileSelect: { flexDirection: "row", alignItems: "center" }, check: { width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginRight: 11 }, checkText: { color: "#fff", fontSize: 14, fontWeight: "900" }, profileInfo: { flex: 1 }, profileActions: { flexDirection: "row", gap: 8, marginTop: 12, marginLeft: 35 }, actionButton: { borderWidth: 1, minHeight: 34, paddingHorizontal: 11, borderRadius: 10, alignItems: "center", justifyContent: "center" }, editorCard: { borderWidth: 1, borderRadius: 22, padding: 17, marginTop: 18, gap: 16 }, editorHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, closeButton: { minHeight: 34, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" }, fieldGroup: { width: "100%" }, input: { minHeight: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontSize: 15 }, multilineInput: { minHeight: 104, paddingTop: 12, textAlignVertical: "top" }, inputModeRow: { flexDirection: "row", gap: 9 }, inputMode: { flex: 1, minHeight: 40, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" }, saveButton: { minHeight: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 2 }, saveText: { color: "#fff", fontSize: 16, fontWeight: "700" }, resetButton: { minHeight: 52, alignItems: "center", justifyContent: "center", marginTop: 18 }, pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] } });
