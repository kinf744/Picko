import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { InfoRow, Panel, SectionLabel, SegmentedControl, SettingNumberRow, SettingTextRow, ToggleRow } from "@/components/kighmu-ui";
import { useColors } from "@/hooks/use-colors";
import { DEFAULT_APP_SETTINGS, loadAppSettings, saveAppSettings, type AppSettings } from "@/lib/app-settings";
import { useThemeContext } from "@/lib/theme-provider";
import { getNativeVpn, type DeviceSecurityInfo } from "@/lib/vpn/native";

const unavailableDevice: DeviceSecurityInfo = { hardwareId: "Disponible après installation Android", mobileOperator: "—", rooted: false };

// Validation JS = première barrière ; le natif re-valide de toute façon
// (repli sur ses défauts) → une saisie invalide ne peut pas casser le tunnel.
const dnsFormatError = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^[a-zA-Z0-9._:-]+$/.test(trimmed) ? null : "Adresse ou hôte invalide.";
};
const httpUrlError = (value: string): string | null => {
  const trimmed = value.trim();
  if (!/^https?:\/\/\S+$/i.test(trimmed)) return "L’URL doit commencer par http:// ou https://.";
  return /^https?:\/\/[^\s/:?#]+/i.test(trimmed) ? null : "Hôte manquant dans l’URL.";
};

export default function SettingsScreen() {
  const colors = useColors();
  const { themePreference, setThemePreference } = useThemeContext();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [device, setDevice] = useState<DeviceSecurityInfo>(unavailableDevice);
  useEffect(() => {
    loadAppSettings().then(setSettings);
    const native = getNativeVpn();
    if (native) native.getDeviceSecurityInfo().then(setDevice).catch(() => setDevice(unavailableDevice));
  }, []);
  const update = (patch: Partial<AppSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      void saveAppSettings(next);
      return next;
    });
  };
  const applyTheme = (theme: AppSettings["theme"]) => {
    update({ theme });
    setThemePreference(theme);
  };
  const copyHardwareId = async () => {
    if (!/^[A-F0-9]{32}$/.test(device.hardwareId)) { Alert.alert("Hardware ID indisponible", "Installez l’APK Android KIGHMU VPN pour lire l’identifiant matériel local."); return; }
    await Clipboard.setStringAsync(device.hardwareId);
    Alert.alert("Hardware ID copié", "Collez cet identifiant dans la liste autorisée lors de l’export d’une configuration verrouillée.");
  };
  const reset = () => Alert.alert("Réinitialiser les paramètres ?", "Les profils, secrets et tunnels resteront intacts.", [{ text: "Annuler", style: "cancel" }, { text: "Réinitialiser", style: "destructive", onPress: () => { setSettings(DEFAULT_APP_SETTINGS); void saveAppSettings(DEFAULT_APP_SETTINGS); setThemePreference(DEFAULT_APP_SETTINGS.theme); } }]);

  return <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-5"><View style={styles.top}><Pressable onPress={() => router.back()} style={({ pressed }) => [styles.back, { backgroundColor: colors.surfaceRaised }, pressed && styles.pressed]}><MaterialIcons name="arrow-back" size={20} color={colors.foreground} /></Pressable><Text style={[styles.headerTitle, { color: colors.foreground }]}>Paramètres</Text><View style={styles.back} /></View><ScrollView contentContainerStyle={styles.content}>
    <Text style={[styles.intro, { color: colors.muted }]}>Réglez le comportement de KIGHMU VPN. Ces préférences sont locales et n’altèrent pas les profils ni les moteurs de tunnel.</Text>

    <SectionLabel>Apparence</SectionLabel>
    <Panel style={styles.panel}>
      <Text style={[styles.subTitle, { color: colors.muted }]}>Thème</Text>
      <SegmentedControl<AppSettings["theme"]>
        options={[{ label: "Système", value: "system" }, { label: "Clair", value: "light" }, { label: "Sombre", value: "dark" }]}
        value={themePreference}
        onChange={applyTheme}
      />
      <Text style={[styles.note, { color: colors.muted }]}>« Système » suit automatiquement le mode clair ou sombre d’Android en temps réel ; « Clair » et « Sombre » figent l’apparence.</Text>
    </Panel>

    <SectionLabel>VPN</SectionLabel>
    <Panel style={styles.panel}>
      <SettingNumberRow icon="tune" title="MTU" description="Taille maximale des paquets VPN, de 1280 à 1500." value={settings.mtu} min={1280} max={1500} step={10} unit="o" onChange={(value) => update({ mtu: value })} />
      <ToggleRow icon="battery-charging-full" title="WakeLock" description="Maintient le processeur actif tant que le VPN est connecté." value={settings.wakeLockEnabled} onChange={(value) => update({ wakeLockEnabled: value })} />
      <ToggleRow icon="notifications" title="Nom du profil dans la notification" description="Affiche le premier profil actif dans la notification Android." value={settings.profileNameInNotification} onChange={(value) => update({ profileNameInNotification: value })} />
    </Panel>

    <SectionLabel>Proxy et ports locaux</SectionLabel>
    <Panel style={styles.panel}>
      <InfoRow icon="swap-horiz" title="Ports SOCKS et DNSTT" description="Attribués dynamiquement pour préserver le multi-profil et éviter les collisions." pillLabel="Auto par profil" pillTone="success" />
      <InfoRow icon="devices" title="Accès depuis le réseau local" description="Les proxys locaux restent privés sur l’appareil ; aucune ouverture LAN non authentifiée n’est exposée." pillLabel="Désactivé" />
    </Panel>

    <SectionLabel>DNS</SectionLabel>
    <Panel style={styles.panel}>
      <ToggleRow icon="dns" title="Protection anti-fuite DNS" description="Réduire le risque de résolution DNS hors du tunnel (mécanisme local de l’application)." value={settings.dnsProtection} onChange={(value) => update({ dnsProtection: value })} />
      <ToggleRow icon="public" title="DNS personnalisé" description="Remplace les résolveurs utilisés par le moteur VPN par vos deux serveurs." value={settings.customDnsEnabled} onChange={(value) => update({ customDnsEnabled: value })} />
      <SettingTextRow icon="looks-one" title="DNS primaire" description="Premier résolveur consulté par le moteur." value={settings.dnsPrimary} onChangeText={(value) => update({ dnsPrimary: value })} error={dnsFormatError(settings.dnsPrimary)} disabled={!settings.customDnsEnabled} />
      <SettingTextRow icon="looks-two" title="DNS secondaire" description="Résolveur de secours." value={settings.dnsSecondary} onChangeText={(value) => update({ dnsSecondary: value })} error={dnsFormatError(settings.dnsSecondary)} disabled={!settings.customDnsEnabled} />
      <Text style={[styles.note, { color: colors.muted }]}>La protection anti-fuite et le DNS personnalisé sont complémentaires : l’une sécurise la résolution locale des ponts, l’autre choisit les résolveurs du tunnel.</Text>
    </Panel>

    <SectionLabel>Vérification HTTP et reconnexion</SectionLabel>
    <Panel style={styles.panel}>
      <Text style={[styles.subTitle, { color: colors.muted }]}>Contrôlé par le moteur</Text>
      <ToggleRow icon="network-check" title="Vérification HTTP" description="Contrôle régulier de la connectivité réelle du tunnel via une requête HTTP." value={settings.httpPingEnabled} onChange={(value) => update({ httpPingEnabled: value })} />
      <SettingTextRow icon="link" title="URL de vérification" description="Point de contact censé répondre sans contenu (204)." value={settings.httpPingUrl} onChangeText={(value) => update({ httpPingUrl: value })} error={httpUrlError(settings.httpPingUrl)} disabled={!settings.httpPingEnabled} />
      <SettingNumberRow icon="timer" title="Intervalle" description="Temps entre deux vérifications, de 1 s à 120 s." value={settings.httpPingIntervalMs} min={1000} max={120000} step={1000} unit="ms" onChange={(value) => {
        const ceiling = Math.min(60000, value);
        if (settings.httpPingTimeoutMs > ceiling) update({ httpPingIntervalMs: value, httpPingTimeoutMs: ceiling });
        else update({ httpPingIntervalMs: value });
      }} disabled={!settings.httpPingEnabled} />
      <SettingNumberRow icon="hourglass-empty" title="Délai maximal" description="Sans réponse avant ce délai, la vérification échoue." value={settings.httpPingTimeoutMs} min={1000} max={Math.min(60000, settings.httpPingIntervalMs)} step={1000} unit="ms" onChange={(value) => update({ httpPingTimeoutMs: value })} disabled={!settings.httpPingEnabled} />
      <SettingNumberRow icon="repeat" title="Échecs avant reconnexion" description="Nombre d’échecs consécutifs déclenchant une relance du tunnel (0–20)." value={settings.reconnectAfterFailures} min={0} max={20} step={1} onChange={(value) => update({ reconnectAfterFailures: value })} />
      <ToggleRow icon="all-inclusive" title="Toujours tenter de reconnecter" description="Relancer indéfiniment le tunnel après une perte." value={settings.alwaysReconnect} onChange={(value) => update({ alwaysReconnect: value })} />
      <View style={[styles.divider, { borderTopColor: colors.border }]} />
      <Text style={[styles.subTitle, { color: colors.muted }]}>Comportement de l’application</Text>
      <ToggleRow icon="sync" title="Reconnexion automatique" description="Réessayer après une déconnexion inattendue." value={settings.autoReconnect} onChange={(value) => update({ autoReconnect: value })} />
      <SettingNumberRow icon="timer" title="Délai de reconnexion" description="Attente avant chaque nouvel essai (1 à 60 s)." value={settings.reconnectDelaySeconds} min={1} max={60} step={1} unit="s" onChange={(value) => update({ reconnectDelaySeconds: value })} />
      <ToggleRow icon="signal-wifi-off" title="Arrêter sur perte réseau" description="Arrêter proprement le VPN si le réseau disparaît." value={settings.stopOnNetworkLoss} onChange={(value) => update({ stopOnNetworkLoss: value })} />
      <ToggleRow icon="power-settings-new" title="Démarrer au lancement" description="Préparer le dernier tunnel au lancement, désactivé par défaut." value={settings.launchOnBoot} onChange={(value) => update({ launchOnBoot: value })} />
    </Panel>

    <SectionLabel>Diagnostic</SectionLabel>
    <Panel style={styles.panel}>
      <ToggleRow icon="article" title="Diagnostic détaillé" description="Conserver les événements de transport et de cycle de vie dans le journal local. N’affecte que les logs, jamais le moteur." value={settings.verboseDiagnostics} onChange={(value) => update({ verboseDiagnostics: value })} />
      <ToggleRow icon="help-outline" title="Confirmer la déconnexion" description="Demander une confirmation avant d’arrêter un tunnel actif." value={settings.confirmDisconnect} onChange={(value) => update({ confirmDisconnect: value })} />
    </Panel>

    <SectionLabel>Payload</SectionLabel>
    <Panel style={styles.panel}>
      <InfoRow icon="memory" title="Payload Buffer" description="Tampons optimisés automatiquement : client 16 384 octets · distant 32 768 octets. Aucun réglage manuel nécessaire." pillLabel="Auto" pillTone="success" />
    </Panel>

    <SectionLabel>Identité de l’appareil</SectionLabel>
    <Panel style={styles.devicePanel}>
      <View style={[styles.deviceIcon, { backgroundColor: colors.surfaceRaised }]}><MaterialIcons name="fingerprint" size={22} color={colors.primary} /></View>
      <View style={styles.deviceCopy}><Text style={styles.rowTitleLocal}>Hardware ID</Text><Text numberOfLines={2} style={[styles.hardwareId, { color: colors.foreground }]}>{device.hardwareId}</Text><Text style={[styles.description, { color: colors.muted }]}>Opérateur : {device.mobileOperator || "indisponible"} · Intégrité : {device.rooted ? "root détecté" : "aucun root détecté"}</Text></View>
      <Pressable onPress={() => void copyHardwareId()} style={({ pressed }) => [styles.copyButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}><MaterialIcons name="content-copy" size={18} color="#FFFFFF" /></Pressable>
    </Panel>
    <Text style={[styles.deviceHint, { color: colors.muted }]}>Copiez cet ID pour l’ajouter à une liste autorisée dans Exporter.</Text>

    <Pressable onPress={reset} style={({ pressed }) => [styles.reset, pressed && styles.pressed]}><MaterialIcons name="restart-alt" size={18} color={colors.error} /><Text style={[styles.resetText, { color: colors.error }]}>Réinitialiser les paramètres</Text></Pressable>
  </ScrollView></ScreenContainer>;
}

const styles = StyleSheet.create({
  top: { height: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "900" },
  content: { paddingTop: 14, paddingBottom: 32, gap: 12 },
  intro: { fontSize: 14, lineHeight: 20, marginBottom: 8 },
  panel: { padding: 16 },
  subTitle: { fontSize: 11, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10 },
  note: { fontSize: 11, lineHeight: 16 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 14, marginBottom: 12 },
  devicePanel: { padding: 15, flexDirection: "row", alignItems: "center", gap: 11 },
  deviceIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  deviceCopy: { flex: 1 },
  hardwareId: { marginTop: 5, fontSize: 13, lineHeight: 18, fontWeight: "900", letterSpacing: 0.3 },
  copyButton: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  deviceHint: { marginTop: -6, fontSize: 11, lineHeight: 16 },
  rowTitleLocal: { fontSize: 14, fontWeight: "900" },
  description: { marginTop: 4, fontSize: 11, lineHeight: 16 },
  reset: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  resetText: { fontSize: 13, fontWeight: "900" },
  pressed: { opacity: 0.76, transform: [{ scale: 0.985 }] },
});