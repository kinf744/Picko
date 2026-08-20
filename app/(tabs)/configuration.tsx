import { useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { VpnMethodLabel, profileEndpoint, type TunnelMethod, type VpnProfile } from "@/lib/vpn/profiles";
import { useVpn } from "@/lib/vpn/vpn-context";
import { validateProfile, type ProfileValidationErrors } from "@/lib/vpn/validation";

function Field({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType, multiline, error }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; secureTextEntry?: boolean; keyboardType?: "default" | "numeric"; multiline?: boolean; error?: string }) {
  const colors = useColors();
  return <View style={styles.fieldGroup}>
    <Text className="mb-2 text-sm font-semibold text-foreground">{label}</Text>
    <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} secureTextEntry={secureTextEntry} keyboardType={keyboardType} multiline={multiline} autoCapitalize="none" style={[styles.input, multiline && styles.multilineInput, { color: colors.foreground, backgroundColor: colors.surface, borderColor: error ? colors.error : colors.border }]} />
    {error ? <Text className="mt-1 text-xs text-error">{error}</Text> : null}
  </View>;
}

export default function ConfigurationScreen() {
  const colors = useColors();
  const { profiles, createProfile, saveProfile, duplicateProfile, deleteProfile, setProfileEnabled } = useVpn();
  const [methodPickerVisible, setMethodPickerVisible] = useState(false);
  const [draft, setDraft] = useState<VpnProfile | null>(null);
  const [errors, setErrors] = useState<ProfileValidationErrors>({});
  const [saving, setSaving] = useState(false);

  const updateDraft = (patch: Partial<VpnProfile>) => setDraft((current) => current ? { ...current, ...patch } : current);
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
    if (saved) setDraft(null);
  };
  const cloneProfile = async (profile: VpnProfile) => {
    const cloned = await duplicateProfile(profile);
    if (!cloned) Alert.alert("Clonage impossible", "Le profil n’a pas pu être dupliqué. Réessayez après avoir vérifié l’espace de stockage de l’application.");
  };
  const confirmDelete = (profile: VpnProfile) => Alert.alert("Supprimer ce profil ?", `« ${profile.name} » et ses secrets seront supprimés de l’appareil.`, [
    { text: "Annuler", style: "cancel" },
    { text: "Supprimer", style: "destructive", onPress: () => void deleteProfile(profile.id) },
  ]);

  return <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right", "bottom"]}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Text className="text-3xl font-bold text-foreground">Profils de tunnel</Text>
      <Text className="mt-2 text-sm leading-5 text-muted">Créez vos profils ZiVPN UDP, SSH SlowDNS ou Hysteria UDP, puis activez ceux que vous souhaitez équilibrer. Les secrets restent uniquement sur l’appareil.</Text>

      <Pressable onPress={() => setMethodPickerVisible(true)} style={({ pressed }) => [styles.addButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}>
        <Text style={styles.addText}>Ajouter un profil</Text>
      </Pressable>

      {profiles.length === 0 ? <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text className="text-base font-bold text-foreground">Aucun profil</Text><Text className="mt-2 text-sm leading-5 text-muted">Utilisez « Ajouter un profil » pour créer un tunnel ZiVPN UDP, SSH SlowDNS ou Hysteria UDP.</Text></View> : null}

      <View style={styles.profileList}>{profiles.map((profile) => <View key={profile.id} style={[styles.profileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.profileHeader}>
          <View style={styles.profileMeta}><Text className="text-base font-bold text-foreground">{profile.name}</Text><Text className="mt-1 text-xs font-semibold text-primary">{VpnMethodLabel[profile.method]}</Text></View>
          <Switch value={profile.enabled} onValueChange={(enabled) => void setProfileEnabled(profile.id, enabled)} trackColor={{ false: colors.border, true: colors.primary }} />
        </View>
        <Text className="mt-3 text-sm text-muted">{profileEndpoint(profile)}</Text>
        <Text className="mt-1 text-xs text-muted">{profile.enabled ? "Actif : inclus dans l’équilibrage" : "Inactif : conservé sans connexion"}</Text>
        <View style={styles.actions}><Pressable onPress={() => beginEdit(profile)} style={({ pressed }) => [styles.outlineButton, { borderColor: colors.primary }, pressed && styles.pressed]}><Text style={[styles.outlineText, { color: colors.primary }]}>Modifier</Text></Pressable><Pressable onPress={() => void cloneProfile(profile)} style={({ pressed }) => [styles.outlineButton, { borderColor: colors.primary }, pressed && styles.pressed]}><Text style={[styles.outlineText, { color: colors.primary }]}>Cloner</Text></Pressable><Pressable onPress={() => confirmDelete(profile)} style={({ pressed }) => [styles.outlineButton, { borderColor: colors.error }, pressed && styles.pressed]}><Text style={[styles.outlineText, { color: colors.error }]}>Supprimer</Text></Pressable></View>
      </View>)}</View>
    </ScrollView>

    <Modal visible={methodPickerVisible} transparent animationType="fade" onRequestClose={() => setMethodPickerVisible(false)}>
      <View style={styles.backdrop}><View style={[styles.modalCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <Text className="text-xl font-bold text-foreground">Nouveau profil</Text>
        <Text className="mt-2 text-sm leading-5 text-muted">Choisissez la méthode du tunnel à configurer.</Text>
        <Pressable onPress={() => beginCreate("zivpn-udp")} style={({ pressed }) => [styles.methodButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}><Text className="text-base font-bold text-foreground">ZiVPN UDP</Text><Text className="mt-1 text-sm text-muted">Tunnel UDP avec Obfs et mot de passe</Text></Pressable>
        <Pressable onPress={() => beginCreate("ssh-slowdns")} style={({ pressed }) => [styles.methodButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}><Text className="text-base font-bold text-foreground">SSH SlowDNS</Text><Text className="mt-1 text-sm text-muted">SSH transporté par DNSTT / DNS</Text></Pressable>
        <Pressable onPress={() => beginCreate("hysteria-udp")} style={({ pressed }) => [styles.methodButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}><Text className="text-base font-bold text-foreground">Hysteria UDP</Text><Text className="mt-1 text-sm text-muted">UDP rapide, avec port hopping facultatif</Text></Pressable>
        <Pressable onPress={() => setMethodPickerVisible(false)} style={styles.cancelButton}><Text className="text-sm font-semibold text-muted">Annuler</Text></Pressable>
      </View></View>
    </Modal>

    <Modal visible={draft !== null} animationType="slide" onRequestClose={() => setDraft(null)}>
      <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right", "bottom"]}>
        <ScrollView contentContainerStyle={styles.editorContent} keyboardShouldPersistTaps="handled">
          {draft ? <><View style={styles.editorHeader}><View><Text className="text-2xl font-bold text-foreground">{draft.name ? "Configurer le profil" : "Nouveau profil"}</Text><Text className="mt-1 text-sm text-primary">{VpnMethodLabel[draft.method]}</Text></View><Pressable onPress={() => setDraft(null)}><Text className="text-base font-semibold text-primary">Fermer</Text></Pressable></View>
          <View style={[styles.editorCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Field label="Nom du profil" value={draft.name} onChangeText={(name) => updateDraft({ name })} placeholder="Ex. Réseau mobile" error={errors.name} />
            {draft.method === "zivpn-udp" ? <>
              <Field label="Hôte ou adresse IP" value={draft.host} onChangeText={(host) => updateDraft({ host })} placeholder="vpn.exemple.com" error={errors.host} />
              <Field label="Port ou plage" value={draft.port} onChangeText={(port) => updateDraft({ port })} placeholder="443 ou 6000-19999" keyboardType="numeric" error={errors.port} />
              <Field label="Obfs" value={draft.obfs} onChangeText={(obfs) => updateDraft({ obfs })} placeholder="Clé Salamander" error={errors.obfs} />
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
            </> : <>
              <Field label="Serveur Hysteria" value={draft.hysteriaHost} onChangeText={(hysteriaHost) => updateDraft({ hysteriaHost })} placeholder="hysteria.exemple.com" error={errors.hysteriaHost} />
              <Field label="Port ou plage Hysteria" value={draft.hysteriaPort} onChangeText={(hysteriaPort) => updateDraft({ hysteriaPort })} placeholder="443 ou 20000-50000" error={errors.hysteriaPort} />
              <Field label="Mot de passe Hysteria" value={draft.hysteriaAuth} onChangeText={(hysteriaAuth) => updateDraft({ hysteriaAuth })} placeholder="Mot de passe du serveur" error={errors.hysteriaAuth} />
              <Field label="Débit montant (Mbps)" value={draft.hysteriaUpMbps} onChangeText={(hysteriaUpMbps) => updateDraft({ hysteriaUpMbps })} placeholder="100" keyboardType="numeric" error={errors.hysteriaUpMbps} />
              <Field label="Débit descendant (Mbps)" value={draft.hysteriaDownMbps} onChangeText={(hysteriaDownMbps) => updateDraft({ hysteriaDownMbps })} placeholder="100" keyboardType="numeric" error={errors.hysteriaDownMbps} />
              <Field label="Obfs Hysteria (facultatif)" value={draft.hysteriaObfs} onChangeText={(hysteriaObfs) => updateDraft({ hysteriaObfs })} placeholder="Clé d’obfuscation" />
            </>}
          </View>
          <Pressable onPress={() => void saveDraft()} disabled={saving} style={({ pressed }) => [styles.addButton, { backgroundColor: colors.primary }, (pressed || saving) && styles.pressed]}><Text style={styles.addText}>{saving ? "Enregistrement…" : "Enregistrer le profil"}</Text></Pressable>
          </> : null}
        </ScrollView>
      </ScreenContainer>
    </Modal>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 30 }, profileList: { gap: 12, marginTop: 18 }, addButton: { minHeight: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 20 }, addText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" }, emptyCard: { borderWidth: 1, borderRadius: 22, marginTop: 18, padding: 18 }, profileCard: { borderWidth: 1, borderRadius: 22, padding: 18 }, profileHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, profileMeta: { flex: 1, paddingRight: 12 }, actions: { flexDirection: "row", gap: 10, marginTop: 16 }, outlineButton: { flex: 1, minHeight: 42, borderWidth: 1, borderRadius: 13, alignItems: "center", justifyContent: "center" }, outlineText: { fontSize: 13, fontWeight: "700" }, backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.46)", alignItems: "center", justifyContent: "center", padding: 22 }, modalCard: { width: "100%", maxWidth: 460, borderWidth: 1, borderRadius: 24, padding: 20 }, methodButton: { borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 16 }, cancelButton: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: 10 }, editorContent: { paddingBottom: 30 }, editorHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }, editorCard: { borderWidth: 1, borderRadius: 22, padding: 18, gap: 17 }, fieldGroup: { width: "100%" }, input: { minHeight: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontSize: 15 }, multilineInput: { minHeight: 92, paddingTop: 12, textAlignVertical: "top" }, pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});
