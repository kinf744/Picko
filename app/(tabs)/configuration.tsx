import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useVpn, type VpnConfig } from "@/lib/vpn/vpn-context";
import { FIXED_OBFS } from "@/lib/vpn/validation";

function Field({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType, error }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; secureTextEntry?: boolean; keyboardType?: "default" | "numeric"; error?: string }) {
  const colors = useColors();
  return <View style={styles.fieldGroup}>
    <Text className="mb-2 text-sm font-semibold text-foreground">{label}</Text>
    <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} secureTextEntry={secureTextEntry} keyboardType={keyboardType} autoCapitalize="none" style={[styles.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: error ? colors.error : colors.border }]} />
    {error ? <Text className="mt-1 text-xs text-error">{error}</Text> : null}
  </View>;
}

export default function ConfigurationScreen() {
  const colors = useColors();
  const { config, updateConfig, saveConfig, resetConfig, validate } = useVpn();
  const [errors, setErrors] = useState<Partial<Record<keyof VpnConfig, string>>>({});
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    const ok = await saveConfig();
    setSaved(ok);
    if (ok) setTimeout(() => setSaved(false), 2200);
  };

  const handleReset = () => {
    Alert.alert("Réinitialiser le profil ?", "Le mot de passe et la clé Obfs seront supprimés de l’appareil.", [
      { text: "Annuler", style: "cancel" },
      { text: "Réinitialiser", style: "destructive", onPress: () => resetConfig() },
    ]);
  };

  return <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right", "bottom"]}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Text className="text-3xl font-bold text-foreground">Configuration</Text>
      <Text className="mt-2 text-sm leading-5 text-muted">Renseignez les paramètres de votre serveur KIGHMU. Les secrets ne sont jamais affichés dans les journaux.</Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Field label="Host ou adresse IP" value={config.host} onChangeText={(host) => { updateConfig({ host }); setSaved(false); }} placeholder="vpn.exemple.com ou 203.0.113.10" error={errors.host} />
        <Field label="Port ou plage de ports" value={config.port} onChangeText={(port) => { updateConfig({ port }); setSaved(false); }} placeholder="443 ou 6000-19999" keyboardType="numeric" error={errors.port} />
        <View style={styles.fixedField}>
          <Text className="text-sm font-semibold text-foreground">Obfs Salamander</Text>
          <Text className="mt-1 text-sm text-muted">{FIXED_OBFS} · valeur fixe intégrée au moteur KIGHMU</Text>
        </View>
        <Field label="Mot de passe" value={config.password} onChangeText={(password) => { updateConfig({ password }); setSaved(false); }} placeholder="Mot de passe du serveur" secureTextEntry error={errors.password} />
      </View>
      <Pressable onPress={handleSave} style={({ pressed }) => [styles.saveButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}><Text style={styles.saveText}>{saved ? "Profil enregistré" : "Enregistrer le profil"}</Text></Pressable>
      <Pressable onPress={handleReset} style={({ pressed }) => [styles.resetButton, pressed && styles.pressed]}><Text className="text-sm font-semibold text-error">Réinitialiser les paramètres</Text></Pressable>
    </ScrollView>
  </ScreenContainer>;
}

const styles = StyleSheet.create({ content: { paddingBottom: 28 }, card: { borderWidth: 1, borderRadius: 24, padding: 18, marginTop: 22, gap: 18 }, fieldGroup: { width: "100%" }, fixedField: { minHeight: 50, justifyContent: "center", paddingHorizontal: 2 }, input: { minHeight: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontSize: 15 }, saveButton: { minHeight: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 18 }, saveText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" }, resetButton: { minHeight: 48, alignItems: "center", justifyContent: "center" }, pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] } });
