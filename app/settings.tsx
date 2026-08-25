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
import { useLang } from "@/lib/i18n-provider";
import { getNativeVpn, type DeviceSecurityInfo } from "@/lib/vpn/native";

const unavailableDevice = (label: string): DeviceSecurityInfo => ({ hardwareId: label, mobileOperator: "—", rooted: false });

// Validation JS = première barrière ; le natif re-valide de toute façon
// (repli sur ses défauts) → une saisie invalide ne peut pas casser le tunnel.
export default function SettingsScreen() {
  const colors = useColors();
  const { t } = useLang();
  const { themePreference, setThemePreference } = useThemeContext();
  const { languagePreference, setLanguagePreference } = useLang();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [device, setDevice] = useState<DeviceSecurityInfo>(unavailableDevice(t("settings.hwid.unavailable")));
  useEffect(() => {
    loadAppSettings().then(setSettings);
    const native = getNativeVpn();
    if (native) native.getDeviceSecurityInfo().then(setDevice).catch(() => setDevice(unavailableDevice(t("settings.hwid.unavailable"))));
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
  const applyLanguage = (language: AppSettings["language"]) => {
    update({ language });
    setLanguagePreference(language);
  };
  // Validation JS = première barrière ; le natif re-valide de toute façon.
  const dnsFormatError = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed || /^[a-zA-Z0-9._:-]+$/.test(trimmed)) return null;
    return t("settings.err.dns");
  };
  const httpUrlError = (value: string): string | null => {
    const trimmed = value.trim();
    if (!/^https?:\/\/\S+$/i.test(trimmed)) return t("settings.err.urlScheme");
    return /^https?:\/\/[^\s/:?#]+/i.test(trimmed) ? null : t("settings.err.urlHost");
  };
  const copyHardwareId = async () => {
    if (!/^[A-F0-9]{32}$/.test(device.hardwareId)) { Alert.alert(t("settings.copyFailTitle"), t("settings.copyFailBody")); return; }
    await Clipboard.setStringAsync(device.hardwareId);
    Alert.alert(t("settings.copyOkTitle"), t("settings.copyOkBody"));
  };
  const reset = () => Alert.alert(t("settings.reset.title"), t("settings.reset.body"), [{ text: t("common.cancel"), style: "cancel" }, { text: t("settings.reset.confirm"), style: "destructive", onPress: () => { setSettings(DEFAULT_APP_SETTINGS); void saveAppSettings(DEFAULT_APP_SETTINGS); setThemePreference(DEFAULT_APP_SETTINGS.theme); setLanguagePreference(DEFAULT_APP_SETTINGS.language); } }]);

  return <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-5"><View style={styles.top}><Pressable onPress={() => router.back()} style={({ pressed }) => [styles.back, { backgroundColor: colors.surfaceRaised }, pressed && styles.pressed]}><MaterialIcons name="arrow-back" size={20} color={colors.foreground} /></Pressable><Text style={[styles.headerTitle, { color: colors.foreground }]}>{t("settings.title")}</Text><View style={styles.back} /></View><ScrollView contentContainerStyle={styles.content}>
    <Text style={[styles.intro, { color: colors.muted }]}>{t("settings.intro")}</Text>

    <SectionLabel>{t("settings.lang.section")}</SectionLabel>
    <Panel style={styles.panel}>
      <SegmentedControl<AppSettings["language"]>
        options={[{ label: t("settings.lang.system"), value: "system" }, { label: "Français", value: "fr" }, { label: "English", value: "en" }]}
        value={languagePreference}
        onChange={applyLanguage}
      />
      <Text style={[styles.note, { color: colors.muted }]}>{t("settings.lang.note")}</Text>
    </Panel>

    <SectionLabel>{t("settings.appearance.section")}</SectionLabel>
    <Panel style={styles.panel}>
      <Text style={[styles.subTitle, { color: colors.muted }]}>{t("settings.theme.label")}</Text>
      <SegmentedControl<AppSettings["theme"]>
        options={[{ label: t("settings.theme.system"), value: "system" }, { label: t("settings.theme.light"), value: "light" }, { label: t("settings.theme.dark"), value: "dark" }]}
        value={themePreference}
        onChange={applyTheme}
      />
      <Text style={[styles.note, { color: colors.muted }]}>{t("settings.theme.note")}</Text>
    </Panel>

    <SectionLabel>{t("settings.vpn.section")}</SectionLabel>
    <Panel style={styles.panel}>
      <SettingNumberRow icon="tune" title={t("settings.mtu.title")} description={t("settings.mtu.desc")} value={settings.mtu} min={1280} max={1500} step={10} unit="o" onChange={(value) => update({ mtu: value })} />
      <ToggleRow icon="battery-charging-full" title={t("settings.wakeLock.title")} description={t("settings.wakeLock.desc")} value={settings.wakeLockEnabled} onChange={(value) => update({ wakeLockEnabled: value })} />
      <ToggleRow icon="notifications" title={t("settings.notifProfile.title")} description={t("settings.notifProfile.desc")} value={settings.profileNameInNotification} onChange={(value) => update({ profileNameInNotification: value })} />
    </Panel>

    <SectionLabel>{t("settings.proxy.section")}</SectionLabel>
    <Panel style={styles.panel}>
      <InfoRow icon="swap-horiz" title={t("settings.ports.title")} description={t("settings.ports.desc")} pillLabel={t("settings.ports.pill")} pillTone="success" />
      <InfoRow icon="devices" title={t("settings.lan.title")} description={t("settings.lan.desc")} pillLabel={t("settings.lan.pill")} />
    </Panel>

    <SectionLabel>{t("settings.dns.section")}</SectionLabel>
    <Panel style={styles.panel}>
      <ToggleRow icon="dns" title={t("settings.dnsProtection.title")} description={t("settings.dnsProtection.desc")} value={settings.dnsProtection} onChange={(value) => update({ dnsProtection: value })} />
      <ToggleRow icon="public" title={t("settings.customDns.title")} description={t("settings.customDns.desc")} value={settings.customDnsEnabled} onChange={(value) => update({ customDnsEnabled: value })} />
      <SettingTextRow icon="looks-one" title={t("settings.dnsPrimary.title")} description={t("settings.dnsPrimary.desc")} value={settings.dnsPrimary} onChangeText={(value) => update({ dnsPrimary: value })} error={dnsFormatError(settings.dnsPrimary)} disabled={!settings.customDnsEnabled} />
      <SettingTextRow icon="looks-two" title={t("settings.dnsSecondary.title")} description={t("settings.dnsSecondary.desc")} value={settings.dnsSecondary} onChangeText={(value) => update({ dnsSecondary: value })} error={dnsFormatError(settings.dnsSecondary)} disabled={!settings.customDnsEnabled} />
      <Text style={[styles.note, { color: colors.muted }]}>{t("settings.dns.note")}</Text>
    </Panel>

    <SectionLabel>{t("settings.http.section")}</SectionLabel>
    <Panel style={styles.panel}>
      <Text style={[styles.subTitle, { color: colors.muted }]}>{t("settings.engineSubtitle")}</Text>
      <ToggleRow icon="network-check" title={t("settings.httpPing.title")} description={t("settings.httpPing.desc")} value={settings.httpPingEnabled} onChange={(value) => update({ httpPingEnabled: value })} />
      <SettingTextRow icon="link" title={t("settings.pingUrl.title")} description={t("settings.pingUrl.desc")} value={settings.httpPingUrl} onChangeText={(value) => update({ httpPingUrl: value })} error={httpUrlError(settings.httpPingUrl)} disabled={!settings.httpPingEnabled} />
      <SettingNumberRow icon="timer" title={t("settings.pingInterval.title")} description={t("settings.pingInterval.desc")} value={settings.httpPingIntervalMs} min={1000} max={120000} step={1000} unit="ms" onChange={(value) => {
        const ceiling = Math.min(60000, value);
        if (settings.httpPingTimeoutMs > ceiling) update({ httpPingIntervalMs: value, httpPingTimeoutMs: ceiling });
        else update({ httpPingIntervalMs: value });
      }} disabled={!settings.httpPingEnabled} />
      <SettingNumberRow icon="hourglass-empty" title={t("settings.pingTimeout.title")} description={t("settings.pingTimeout.desc")} value={settings.httpPingTimeoutMs} min={1000} max={Math.min(60000, settings.httpPingIntervalMs)} step={1000} unit="ms" onChange={(value) => update({ httpPingTimeoutMs: value })} disabled={!settings.httpPingEnabled} />
      <SettingNumberRow icon="repeat" title={t("settings.failures.title")} description={t("settings.failures.desc")} value={settings.reconnectAfterFailures} min={0} max={20} step={1} onChange={(value) => update({ reconnectAfterFailures: value })} />
      <ToggleRow icon="all-inclusive" title={t("settings.alwaysReconnect.title")} description={t("settings.alwaysReconnect.desc")} value={settings.alwaysReconnect} onChange={(value) => update({ alwaysReconnect: value })} />
      <View style={[styles.divider, { borderTopColor: colors.border }]} />
      <Text style={[styles.subTitle, { color: colors.muted }]}>{t("settings.appSubtitle")}</Text>
      <ToggleRow icon="sync" title={t("settings.autoReconnect.title")} description={t("settings.autoReconnect.desc")} value={settings.autoReconnect} onChange={(value) => update({ autoReconnect: value })} />
      <SettingNumberRow icon="timer" title={t("settings.delay.title")} description={t("settings.delay.desc")} value={settings.reconnectDelaySeconds} min={1} max={60} step={1} unit="s" onChange={(value) => update({ reconnectDelaySeconds: value })} />
      <ToggleRow icon="signal-wifi-off" title={t("settings.stopOnLoss.title")} description={t("settings.stopOnLoss.desc")} value={settings.stopOnNetworkLoss} onChange={(value) => update({ stopOnNetworkLoss: value })} />
      <ToggleRow icon="power-settings-new" title={t("settings.boot.title")} description={t("settings.boot.desc")} value={settings.launchOnBoot} onChange={(value) => update({ launchOnBoot: value })} />
    </Panel>

    <SectionLabel>{t("settings.diag.section")}</SectionLabel>
    <Panel style={styles.panel}>
      <ToggleRow icon="article" title={t("settings.verbose.title")} description={t("settings.verbose.desc")} value={settings.verboseDiagnostics} onChange={(value) => update({ verboseDiagnostics: value })} />
      <ToggleRow icon="help-outline" title={t("settings.confirmDisconnect.title")} description={t("settings.confirmDisconnect.desc")} value={settings.confirmDisconnect} onChange={(value) => update({ confirmDisconnect: value })} />
    </Panel>

    <SectionLabel>{t("settings.payload.section")}</SectionLabel>
    <Panel style={styles.panel}>
      <InfoRow icon="memory" title={t("settings.buffer.title")} description={t("settings.buffer.desc")} pillLabel={t("settings.buffer.pill")} pillTone="success" />
    </Panel>

    <SectionLabel>{t("settings.identity.section")}</SectionLabel>
    <Panel style={styles.devicePanel}>
      <View style={[styles.deviceIcon, { backgroundColor: colors.surfaceRaised }]}><MaterialIcons name="fingerprint" size={22} color={colors.primary} /></View>
      <View style={styles.deviceCopy}><Text style={styles.rowTitleLocal}>{t("settings.hwid.label")}</Text><Text numberOfLines={2} style={[styles.hardwareId, { color: colors.foreground }]}>{device.hardwareId}</Text><Text style={[styles.description, { color: colors.muted }]}>{t("settings.operator", { operator: device.mobileOperator || "—" })}{" · "}{t("settings.integrity", { state: device.rooted ? t("settings.rootDetected") : t("settings.noRoot") })}</Text></View>
      <Pressable onPress={() => void copyHardwareId()} style={({ pressed }) => [styles.copyButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}><MaterialIcons name="content-copy" size={18} color="#FFFFFF" /></Pressable>
    </Panel>
    <Text style={[styles.deviceHint, { color: colors.muted }]}>{t("settings.hwid.hint")}</Text>

    <Pressable onPress={reset} style={({ pressed }) => [styles.reset, pressed && styles.pressed]}><MaterialIcons name="restart-alt" size={18} color={colors.error} /><Text style={[styles.resetText, { color: colors.error }]}>{t("settings.reset.button")}</Text></Pressable>
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