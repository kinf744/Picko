import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useVpn, type VpnConfig } from "@/lib/vpn/vpn-context";

function Field({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType, error, note }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; secureTextEntry?: boolean; keyboardType?: "default" | "numeric"; error?: string; note?: string }) {
  const colors = useColors();
  return <View style={styles.fieldGroup}>
    <Text className="mb-2 text-sm font-semibold text-foreground">{label}</Text>
    {note ? <Text className="mb-2 text-xs leading-4 text-muted">{note}</Text> : null}
    <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} secureTextEntry={secureTextEntry} keyboardType={keyboardType} autoCapitalize="none" multiline={label.includes("publique")} style={[styles.input, label.includes("publique") && styles.multilineInput, { color: colors.foreground, backgroundColor: colors.surface, borderColor: error ? colors.error : colors.border }]} />
    {error ? <Text className="mt-1 text-xs text-error">{error}</Text> : null}
  </View>;
}

export default function ConfigurationScreen() {
  const colors = useColors();
  const { config, updateConfig, saveConfig, resetConfig, validate } = useVpn();
  const [errors, setErrors] = useState<Partial<Record<keyof VpnConfig, string>>>({});
  const [saved, setSaved] = useState(false);
  const patch = (next: Partial<VpnConfig>) => { updateConfig(next); setSaved(false); };
  const handleSave = async () => { const nextErrors = validate(); setErrors(nextErrors); if (Object.keys(nextErrors).length > 0) return; const ok = await saveConfig(); setSaved(ok); if (ok) setTimeout(() => setSaved(false), 2200); };
  const handleReset = () => Alert.alert("Réinitialiser les profils ?", "Les mots de passe et la clé Obfs seront supprimés de l’appareil.", [{ text: "Annuler", style: "cancel" }, { text: "Réinitialiser", style: "destructive", onPress: () => resetConfig() }]);
  const slowDns = config.mode === "slowdns";
  return <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right", "bottom"]}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Text className="text-3xl font-bold text-foreground">Configuration</Text>
      <Text className="mt-2 text-sm leading-5 text-muted">Choisissez un tunnel. SlowDNS utilise une seule session SSH ; aucun balancier ni tunnel parallèle n’est activé.</Text>
      <View style={styles.modeRow}>
        <Pressable onPress={() => patch({ mode: "zivpn" })} style={({ pressed }) => [styles.modeButton, { borderColor: config.mode === "zivpn" ? colors.primary : colors.border, backgroundColor: config.mode === "zivpn" ? colors.primary : colors.surface }, pressed && styles.pressed]}><Text style={[styles.modeText, { color: config.mode === "zivpn" ? "#fff" : colors.foreground }]}>UDP-ZIVPN</Text></Pressable>
        <Pressable onPress={() => patch({ mode: "slowdns" })} style={({ pressed }) => [styles.modeButton, { borderColor: slowDns ? colors.primary : colors.border, backgroundColor: slowDns ? colors.primary : colors.surface }, pressed && styles.pressed]}><Text style={[styles.modeText, { color: slowDns ? "#fff" : colors.foreground }]}>SSH / SlowDNS</Text></Pressable>
      </View>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {slowDns ? <>
          <Field label="Serveur DNS/UDP" value={config.slowDnsServer} onChangeText={(slowDnsServer) => patch({ slowDnsServer })} placeholder="203.0.113.10" error={errors.slowDnsServer} />
          <Field label="Port DNS UDP" value={config.slowDnsPort} onChangeText={(slowDnsPort) => patch({ slowDnsPort })} placeholder="53" keyboardType="numeric" error={errors.slowDnsPort} />
          <Field label="Nameserver SlowDNS" value={config.slowDnsNameserver} onChangeText={(slowDnsNameserver) => patch({ slowDnsNameserver })} placeholder="t.exemple.com" error={errors.slowDnsNameserver} />
          <Field label="Clé publique dnstt" value={config.slowDnsPublicKey} onChangeText={(slowDnsPublicKey) => patch({ slowDnsPublicKey })} placeholder="Clé publique du serveur dnstt" error={errors.slowDnsPublicKey} />
          <Field label="Hôte SSH attendu" value={config.slowDnsSshHost} onChangeText={(slowDnsSshHost) => patch({ slowDnsSshHost })} placeholder="ssh.exemple.com" note="Libellé de contrôle : la cible SSH réelle est définie par le serveur SlowDNS." error={errors.slowDnsSshHost} />
          <Field label="Identifiant SSH" value={config.slowDnsUsername} onChangeText={(slowDnsUsername) => patch({ slowDnsUsername })} placeholder="utilisateur SSH" error={errors.slowDnsUsername} />
          <Field label="Mot de passe SSH" value={config.slowDnsPassword} onChangeText={(slowDnsPassword) => patch({ slowDnsPassword })} placeholder="Mot de passe SSH" secureTextEntry error={errors.slowDnsPassword} />
        </> : <>
          <Field label="Host ou adresse IP" value={config.host} onChangeText={(host) => patch({ host })} placeholder="vpn.exemple.com ou 203.0.113.10" error={errors.host} />
          <Field label="Port ou plage de ports" value={config.port} onChangeText={(port) => patch({ port })} placeholder="443 ou 6000-19999" keyboardType="numeric" error={errors.port} />
          <Field label="Obfs" value={config.obfs} onChangeText={(obfs) => patch({ obfs })} placeholder="Clé Salamander" secureTextEntry error={errors.obfs} />
          <Field label="Mot de passe" value={config.password} onChangeText={(password) => patch({ password })} placeholder="Mot de passe du serveur" secureTextEntry error={errors.password} />
        </>}
      </View>
      <Pressable onPress={handleSave} style={({ pressed }) => [styles.saveButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}><Text style={styles.saveText}>{saved ? "Profil enregistré" : "Enregistrer le profil"}</Text></Pressable>
      <Pressable onPress={handleReset} style={({ pressed }) => [styles.resetButton, pressed && styles.pressed]}><Text className="text-sm font-semibold text-error">Réinitialiser les profils</Text></Pressable>
    </ScrollView>
  </ScreenContainer>;
}
const styles = StyleSheet.create({ content: { paddingBottom: 28 }, modeRow: { flexDirection: "row", gap: 10, marginTop: 20 }, modeButton: { flex: 1, minHeight: 46, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 }, modeText: { fontSize: 13, fontWeight: "700" }, card: { borderWidth: 1, borderRadius: 24, padding: 18, marginTop: 16, gap: 18 }, fieldGroup: { width: "100%" }, input: { minHeight: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontSize: 15 }, multilineInput: { minHeight: 86, paddingTop: 12, textAlignVertical: "top" }, saveButton: { minHeight: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 18 }, saveText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" }, resetButton: { minHeight: 48, alignItems: "center", justifyContent: "center" }, pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] } });
