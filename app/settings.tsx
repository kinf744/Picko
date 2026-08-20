import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useThemeContext, type ThemePreference } from "@/lib/theme-provider";
import { useVpnSettings, type VpnRuntimeSettings } from "@/lib/vpn/settings-context";
import { useVpn } from "@/lib/vpn/vpn-context";

type BooleanSetting = "customDnsEnabled" | "wakeLockEnabled" | "profileNameInNotification" | "debugMode" | "httpPingEnabled" | "alwaysReconnect";
type TextSetting = "dnsPrimary" | "dnsSecondary" | "mtu" | "httpPingUrl" | "httpPingIntervalMs" | "httpPingTimeoutMs" | "reconnectAfterFailures";

export default function SettingsScreen() {
  const colors = useColors();
  const { settings, updateSettings, resetSettings } = useVpnSettings();
  const { themePreference, setThemePreference } = useThemeContext();
  const { status } = useVpn();
  const connected = status === "connected" || status === "connecting";

  const toggle = (key: BooleanSetting) => updateSettings({ [key]: !settings[key] });
  const setText = (key: TextSetting, value: string) => updateSettings({ [key]: value });

  return <ScreenContainer className="px-5 pt-3" edges={["top", "left", "right", "bottom"]}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Retour" style={({ pressed }) => [styles.iconButton, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && styles.pressed]}>
          <IconSymbol name="chevron.left" size={20} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerCopy}><Text className="text-2xl font-bold text-foreground">Paramètres</Text><Text className="mt-1 text-sm text-muted">Préférences de l’application et du moteur VPN</Text></View>
      </View>

      {connected ? <View style={[styles.notice, { borderColor: colors.warning, backgroundColor: colors.surface }]}><Text style={[styles.noticeTitle, { color: colors.warning }]}>Connexion en cours</Text><Text className="mt-1 text-sm leading-5 text-muted">Les réglages de service seront appliqués à la prochaine connexion VPN. L’apparence est appliquée immédiatement.</Text></View> : null}

      <Section title="Apparence">
        <Choice label="Thème" value={themePreference} options={["system", "light", "dark"]} labels={{ system: "Système", light: "Clair", dark: "Sombre" }} onSelect={(value) => setThemePreference(value as ThemePreference)} />
      </Section>

      <Section title="VPN">
        <TextSettingRow label="MTU" hint="Taille maximale des paquets VPN, de 1280 à 1500." value={settings.mtu} onChangeText={(value) => setText("mtu", value)} keyboardType="numeric" />
        <SwitchSetting label="WakeLock" hint="Maintient le processeur actif tant que le VPN est connecté." value={settings.wakeLockEnabled} onValueChange={() => toggle("wakeLockEnabled")} />
        <SwitchSetting label="Nom du profil dans la notification" hint="Affiche le premier profil actif dans la notification Android." value={settings.profileNameInNotification} onValueChange={() => toggle("profileNameInNotification")} />
        <InfoSetting label="Proxy et ports locaux" value="Automatiques par profil" hint="Les ports SOCKS et DNSTT sont attribués dynamiquement pour préserver le multi-profil et éviter les collisions." />
        <InfoSetting label="Accès depuis le réseau local" value="Désactivé" hint="Les proxys locaux restent privés sur l’appareil ; aucune ouverture LAN non authentifiée n’est exposée." />
      </Section>

      <Section title="DNS">
        <SwitchSetting label="DNS personnalisé" hint="Remplace les DNS du VPN par les deux adresses ci-dessous." value={settings.customDnsEnabled} onValueChange={() => toggle("customDnsEnabled")} />
        <TextSettingRow label="DNS primaire" hint="Adresse IP ou nom de serveur DNS." value={settings.dnsPrimary} onChangeText={(value) => setText("dnsPrimary", value)} />
        <TextSettingRow label="DNS secondaire" hint="Utilisé comme secours si le DNS primaire échoue." value={settings.dnsSecondary} onChangeText={(value) => setText("dnsSecondary", value)} />
      </Section>

      <Section title="Vérification HTTP et reconnexion">
        <SwitchSetting label="Vérification HTTP" hint="Teste l’URL via le balancier SOCKS après la connexion VPN." value={settings.httpPingEnabled} onValueChange={() => toggle("httpPingEnabled")} />
        <TextSettingRow label="URL de vérification" hint="Adresse HTTP ou HTTPS attendue par le contrôle de connectivité." value={settings.httpPingUrl} onChangeText={(value) => setText("httpPingUrl", value)} autoCapitalize="none" />
        <TextSettingRow label="Intervalle (ms)" hint="De 1000 à 120000 ms." value={settings.httpPingIntervalMs} onChangeText={(value) => setText("httpPingIntervalMs", value)} keyboardType="numeric" />
        <TextSettingRow label="Délai maximal (ms)" hint="De 1000 à 60000 ms par vérification." value={settings.httpPingTimeoutMs} onChangeText={(value) => setText("httpPingTimeoutMs", value)} keyboardType="numeric" />
        <TextSettingRow label="Échecs avant reconnexion" hint="0 désactive la relance par vérification ; maximum 20." value={settings.reconnectAfterFailures} onChangeText={(value) => setText("reconnectAfterFailures", value)} keyboardType="numeric" />
        <SwitchSetting label="Toujours tenter de reconnecter" hint="Conserve le VPN actif et relance les tunnels récupérables après une perte de connectivité." value={settings.alwaysReconnect} onValueChange={() => toggle("alwaysReconnect")} />
      </Section>

      <Section title="Diagnostic">
        <SwitchSetting label="Mode diagnostic détaillé" hint="Ajoute les événements techniques non critiques dans l’écran Diagnostic. Les erreurs et changements de connexion restent toujours visibles." value={settings.debugMode} onValueChange={() => toggle("debugMode")} />
      </Section>

      <View style={[styles.safetyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text className="text-base font-bold text-foreground">Fonctions de sécurité</Text>
        <Text className="mt-2 text-sm leading-5 text-muted">Les commandes root, le partage automatique du VPN et l’exposition réseau local ne sont volontairement pas ajoutés : ils demandent des privilèges externes ou réduisent la sécurité de l’appareil. Les options présentées ici sont toutes prises en charge par Picko.</Text>
      </View>

      <Pressable onPress={resetSettings} accessibilityRole="button" style={({ pressed }) => [styles.resetButton, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && styles.pressed]}><Text style={{ color: colors.error, fontWeight: "700" }}>Restaurer les valeurs par défaut</Text></Pressable>
    </ScrollView>
  </ScreenContainer>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.section}><Text className="text-sm font-bold text-primary">{title.toUpperCase()}</Text><View style={styles.sectionRows}>{children}</View></View>;
}

function SwitchSetting({ label, hint, value, onValueChange }: { label: string; hint: string; value: boolean; onValueChange: () => void }) {
  const colors = useColors();
  return <View style={styles.settingRow}><View style={styles.settingCopy}><Text className="text-lg font-semibold text-foreground">{label}</Text><Text className="mt-1 text-sm leading-5 text-muted">{hint}</Text></View><Switch value={value} onValueChange={onValueChange} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" accessibilityLabel={label} /></View>;
}

function TextSettingRow({ label, hint, value, onChangeText, keyboardType, autoCapitalize = "sentences" }: { label: string; hint: string; value: string; onChangeText: (value: string) => void; keyboardType?: "default" | "numeric" | "url"; autoCapitalize?: "none" | "sentences" | "words" | "characters" }) {
  const colors = useColors();
  return <View style={styles.textRow}><Text className="text-lg font-semibold text-foreground">{label}</Text><Text className="mt-1 text-sm leading-5 text-muted">{hint}</Text><TextInput value={value} onChangeText={onChangeText} keyboardType={keyboardType} autoCapitalize={autoCapitalize} autoCorrect={false} placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} /></View>;
}

function InfoSetting({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <View style={styles.textRow}><Text className="text-lg font-semibold text-foreground">{label}</Text><Text className="mt-1 text-base text-foreground">{value}</Text><Text className="mt-1 text-sm leading-5 text-muted">{hint}</Text></View>;
}

function Choice({ label, value, options, labels, onSelect }: { label: string; value: string; options: string[]; labels: Record<string, string>; onSelect: (value: string) => void }) {
  const colors = useColors();
  return <View style={styles.textRow}><Text className="text-lg font-semibold text-foreground">{label}</Text><View style={styles.choiceRow}>{options.map((option) => <Pressable key={option} onPress={() => onSelect(option)} style={[styles.choice, { borderColor: value === option ? colors.primary : colors.border, backgroundColor: value === option ? colors.primary : colors.background }]}><Text style={{ color: value === option ? "#FFFFFF" : colors.foreground, fontWeight: "700" }}>{labels[option]}</Text></Pressable>)}</View></View>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 32, gap: 24 },
  header: { flexDirection: "row", alignItems: "center", gap: 14 },
  headerCopy: { flex: 1 },
  iconButton: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  notice: { borderWidth: 1, borderRadius: 16, padding: 14 },
  noticeTitle: { fontSize: 14, fontWeight: "800" },
  section: { gap: 12 },
  sectionRows: { gap: 12 },
  settingRow: { flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 8 },
  settingCopy: { flex: 1 },
  textRow: { paddingVertical: 8 },
  input: { marginTop: 10, minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, fontSize: 16 },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  choice: { minHeight: 40, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, justifyContent: "center" },
  safetyCard: { borderWidth: 1, borderRadius: 18, padding: 16 },
  resetButton: { minHeight: 50, borderRadius: 15, borderWidth: 1, justifyContent: "center", alignItems: "center" },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});
