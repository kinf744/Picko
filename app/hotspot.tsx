import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Clipboard from "expo-clipboard";
import { Linking } from "react-native";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, AppState, PermissionsAndroid, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { InfoRow, Panel, SectionLabel, StatusPill, ToggleRow, SettingTextRow } from "@/components/kighmu-ui";
import { useColors } from "@/hooks/use-colors";
import { useLang } from "@/lib/i18n-provider";
import { DEFAULT_HOTSPOT_SETTINGS, loadHotspotSettings, saveHotspotSettings, type HotspotSettings } from "@/lib/hotspot-settings";
import type { WifiDirectInfo } from "@/lib/vpn/native";
import { getDeviceSecurityInfo, getTrafficTotals, probeVpnExitIp } from "@/lib/hotspot-runtime";
import { getLanShareStatus, getPhoneLanIps, getWifiDirectInfo, isVpnActive, probeDirectExitIp, setLanShareMode, startLanShare, startWifiDirect, stopLanShare, stopWifiDirect } from "@/lib/vpn/native";
import { useVpn } from "@/lib/vpn/vpn-context";

const CLIENT_TEST_URL = "https://api.ipify.org";

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 o";
  const units = ["o", "Ko", "Mo", "Go", "To"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

export default function HotspotScreen() {
  const colors = useColors();
  const { t } = useLang();
  const { status } = useVpn();
  const [settings, setSettings] = useState<HotspotSettings>(DEFAULT_HOTSPOT_SETTINGS);
  const [exitIp, setExitIp] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);
  const [totals, setTotals] = useState({ rx: 0, tx: 0 });
  const [lanState, setLanState] = useState<{ running: boolean; port: number }>({ running: false, port: -1 });
  const [ips, setIps] = useState<string[]>([]);
  const [rawVpnActive, setRawVpnActive] = useState(false);
  const [wd, setWd] = useState<WifiDirectInfo | null>(null);
  const [wdBusy, setWdBusy] = useState(false);
  const [wdError, setWdError] = useState<"perms" | "failed" | null>(null);
  const wdIpRef = useRef("");
  const prevThirdActive = useRef(false);
  const baseTotals = useRef({ rx: 0, tx: 0 });
  const previousStatus = useRef(status);

  // Source du partage : tunnels KIGHMU si notre VPN est connecté, sinon
  // routage système = VPN tiers actif (HTTP Injector, SSH Custom…) ou Internet.
  const thirdActive = rawVpnActive && status !== "connected";
  const shareMode: "tunnels" | "thirdvpn" | "internet" = status === "connected" ? "tunnels" : thirdActive ? "thirdvpn" : "internet";

  // Détection du VPN tiers (TRANSPORT_VPN présent alors que le nôtre est arrêté).
  useEffect(() => {
    const refresh = () => setRawVpnActive(isVpnActive());
    refresh();
    const timer = setInterval(refresh, 5_000);
    return () => clearInterval(timer);
  }, []);

  // Adresses du téléphone visibles par les clients. L'interface hotspot n'existe
  // qu'après activation dans le système : on rafraîchit périodiquement ET dès le
  // retour au premier plan. Interfaces hotspot (ap*/swlan*/wlan*) en priorité.
  useEffect(() => {
    const refresh = () => {
      const raw = getPhoneLanIps();
      const list = wdIpRef.current ? [wdIpRef.current, ...raw.filter((ip) => ip !== wdIpRef.current)] : raw;
      setIps(list.length > 0 ? [...list].sort((a, b) => rank(a) - rank(b)) : []);
    };
    const rank = (ip: string) => (ip.startsWith("192.168.43.") || ip.startsWith("192.168.137.") ? 0 : 2);
    refresh();
    const timer = setInterval(refresh, 8_000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);

  // Cycle de vie de la passerelle : active dès que le proxy est armé — la
  // source (tunnels KIGHMU / VPN tiers / Internet) est choisie automatiquement.
  useEffect(() => {
    let cancelled = false;
    if (settings.lanProxyEnabled) {
      void startLanShare(settings.lanProxyPort).then((result) => {
        if (!cancelled && result?.running) setLanState({ running: true, port: result.port });
      });
    } else {
      void stopLanShare().then(() => {
        if (!cancelled) setLanState({ running: false, port: -1 });
      });
    }
    return () => {
      cancelled = true;
    };
  }, [settings.lanProxyEnabled, settings.lanProxyPort]);

  useEffect(() => {
    void loadHotspotSettings().then(setSettings);
    void getWifiDirectInfo().then((info) => {
      if (info?.active) { setWd(info); wdIpRef.current = info.ip || "192.168.49.1"; }
    });
    baseTotals.current = getTrafficTotals();
    const timer = setInterval(() => {
      const now = getTrafficTotals();
      setTotals({ rx: Math.max(0, now.rx - baseTotals.current.rx), tx: Math.max(0, now.tx - baseTotals.current.tx) });
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  // Sonde d'IP de sortie : via nos tunnels (mode KIGHMU) ou via le routage
  // système (mode VPN tiers) ; automatique + rafraîchie toutes les 30 s si armé.
  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      setProbing(true);
      const job = shareMode === "tunnels" ? probeVpnExitIp() : shareMode === "thirdvpn" ? probeDirectExitIp() : Promise.resolve("");
      void job.then((ip) => {
        if (cancelled) return;
        setExitIp(ip);
        setProbing(false);
      });
    };
    if (shareMode !== "internet") run();
    const timer = settings.shareArmed && shareMode !== "internet" ? setInterval(run, 30_000) : null;
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [shareMode, settings.shareArmed]);

  useEffect(() => {
    setLanShareMode(shareMode !== "tunnels");
  }, [shareMode]);

  // Kill switch VPN tiers : si le VPN qui alimentait le partage tombe → alerte.
  useEffect(() => {
    const wasActive = prevThirdActive.current;
    prevThirdActive.current = thirdActive;
    if (settings.shareArmed && settings.killSwitchEnabled && shareMode === "thirdvpn" && wasActive && !thirdActive) {
      Alert.alert(t("hs.alert.thirdLost.title"), t("hs.alert.thirdLost.body"), [
        { text: t("hs.alert.vpnLost.later"), style: "cancel" },
        { text: t("hs.alert.vpnLost.open"), onPress: () => void openWirelessSettings() },
      ]);
    }
  }, [thirdActive, shareMode, settings.shareArmed, settings.killSwitchEnabled, t]);

  // Kill switch sans root : Android ne permet pas de couper le hotspot par code,
  // donc alerte immédiate + raccourci vers le réglage système dès que le tunnel tombe.
  useEffect(() => {
    const lost = status === "disconnected" || status === "error";
    const wasUp = previousStatus.current === "connected" || previousStatus.current === "connecting";
    previousStatus.current = status;
    if (settings.shareArmed && settings.killSwitchEnabled && wasUp && lost) {
      Alert.alert(t("hs.alert.vpnLost.title"), t("hs.alert.vpnLost.body"), [
        { text: t("hs.alert.vpnLost.later"), style: "cancel" },
        { text: t("hs.alert.vpnLost.open"), onPress: () => void openWirelessSettings() },
      ]);
    }
  }, [status, settings.shareArmed, settings.killSwitchEnabled, t]);

  const update = (patch: Partial<HotspotSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      void saveHotspotSettings(next);
      return next;
    });
  };

  const openWirelessSettings = async () => {
    try {
      await Linking.sendIntent("android.settings.WIRELESS_SETTINGS");
    } catch {
      Alert.alert(t("hs.open.fail"), t("hs.open.fail.body"));
    }
  };

  // Armer le partage → proposer immédiatement le panneau système (l'app ne peut
  // pas activer le hotspot elle-même : permission réservée au système).
  const armSharing = (value: boolean) => {
    update({ shareArmed: value });
    if (value) {
      Alert.alert(t("hs.panel.title"), t("hs.panel.body"), [
        { text: t("hs.alert.vpnLost.later"), style: "cancel" },
        { text: t("hs.panel.open"), onPress: () => void openConnectivityPanel() },
      ]);
    }
  };

  const openConnectivityPanel = async () => {
    try {
      await Linking.sendIntent("android.settings.panel.action.INTERNET_CONNECTIVITY");
    } catch {
      await openWirelessSettings();
    }
  };

  // Permissions Android pour createGroup : NEARBY_WIFI_DEVICES (13+) ou Localisation (<=12).
  const ensureWifiDirectPermissions = async (): Promise<boolean> => {
    try {
      if (Number(Platform.Version) >= 33) {
        const result = await PermissionsAndroid.request("android.permission.NEARBY_WIFI_DEVICES" as never, { title: t("hs.wifi.perms.title"), message: t("hs.wifi.perms.body"), buttonPositive: "OK" } as never);
        return result === PermissionsAndroid.RESULTS.GRANTED;
      }
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, { title: t("hs.wifi.perms.title"), message: t("hs.wifi.perms.body"), buttonPositive: "OK" });
      return result === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    }
  };

  const createWifiDirect = async () => {
    setWdError(null);
    setWdBusy(true);
    const granted = await ensureWifiDirectPermissions();
    if (!granted) { setWdBusy(false); setWdError("perms"); return; }
    const info = await startWifiDirect();
    setWdBusy(false);
    if (!info) { setWdError("failed"); return; }
    const detailed = await getWifiDirectInfo();
    const finalInfo = detailed?.active ? detailed : info;
    setWd(finalInfo);
    wdIpRef.current = finalInfo.ip || "192.168.49.1";
    setIps((current) => [wdIpRef.current, ...current.filter((ip) => ip !== wdIpRef.current)]);
  };

  const stopWifiDirectNetwork = async () => {
    await stopWifiDirect();
    setWd(null);
    wdIpRef.current = "";
    setIps(getPhoneLanIps());
  };

  const copyText = async (label: string, value: string) => {
    await Clipboard.setStringAsync(value);
    Alert.alert(t("hs.ipCopiedTitle"), label);
  };

  const vpnPill = (() => {
    if (!settings.shareArmed) return { label: t("hs.pill.off"), tone: "neutral" as const };
    if (status === "connected") return { label: t("hs.pill.armedOn"), tone: "success" as const };
    if (status === "connecting") return { label: t("hs.pill.armedWaiting"), tone: "warning" as const };
    return { label: t("hs.route.pill.off"), tone: "error" as const };
  })();

  return <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-5"><View style={styles.top}><Pressable onPress={() => router.back()} style={({ pressed }) => [styles.back, { backgroundColor: colors.surfaceRaised }, pressed && styles.pressed]}><MaterialIcons name="arrow-back" size={20} color={colors.foreground} /></Pressable><Text style={[styles.headerTitle, { color: colors.foreground }]}>{t("hs.title")}</Text><View style={styles.back} /></View><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <Text style={[styles.intro, { color: colors.muted }]}>{t("hs.intro")}</Text>

    <SectionLabel>{t("hs.state.section")}</SectionLabel>
    <Panel style={styles.panel}>
      <View style={styles.stateLine}><StatusPill label={vpnPill.label} tone={vpnPill.tone} /><Text style={[styles.statusText, { color: colors.muted }]}>VPN · {status}</Text></View>
      <ToggleRow icon="wifi-tethering" title={t("hs.share.toggle")} description={t("hs.share.desc")} value={settings.shareArmed} onChange={armSharing} />
      <ToggleRow icon="gpp-maybe" title={t("hs.killswitch.title")} description={t("hs.killswitch.desc")} value={settings.killSwitchEnabled} onChange={(value) => update({ killSwitchEnabled: value })} />
    </Panel>

    <SectionLabel>{t("hs.hotspot.section")}</SectionLabel>
    <Panel style={styles.panel}>
      <Pressable onPress={() => void openWirelessSettings()} style={({ pressed }) => [styles.systemButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}>
        <MaterialIcons name="open-in-new" size={18} color="#FFFFFF" />
        <Text style={styles.systemButtonText}>{t("hs.open.settings")}</Text>
      </Pressable>
    </Panel>

    <SectionLabel>{t("hs.wifi.section")}</SectionLabel>
    <Panel style={styles.panel}>
      <Text style={[styles.note, { color: colors.muted }]}>{t("hs.wifi.note")}</Text>
      {wd?.active ? (
        <View style={[styles.proxyBlock, { backgroundColor: colors.surfaceRaised }]}>
          <StatusPill label={t("hs.wifi.active")} tone="success" />
          <Text style={[styles.rowTitleSmall, { color: colors.muted }]}>{t("hs.wifi.ssid")}</Text>
          <Pressable onPress={() => void copyText(t("hs.wifi.ssid"), wd.ssid)} style={({ pressed }) => [pressed && styles.pressed]}><Text selectable style={[styles.proxyIp, { color: colors.foreground }]}>{wd.ssid}</Text></Pressable>
          {wd.passphrase ? (<><Text style={[styles.rowTitleSmall, { color: colors.muted }]}>{t("hs.wifi.pass")}</Text><Pressable onPress={() => void copyText(t("hs.wifi.pass"), wd.passphrase)} style={({ pressed }) => [pressed && styles.pressed]}><Text selectable style={[styles.proxyIp, { color: colors.foreground }]}>{wd.passphrase}</Text></Pressable></>) : null}
          <Text style={[styles.rowTitleSmall, { color: colors.muted }]}>{t("hs.wifi.ip")}</Text>
          <Text selectable style={[styles.proxyIp, { color: colors.primary }]}>{wd.ip || "192.168.49.1"}</Text>
        </View>
      ) : null}
      {wdBusy ? <Text style={[styles.note, { color: colors.muted }]}>{t("hs.wifi.starting")}</Text> : null}
      {wdError === "perms" ? <Text style={[styles.note, { color: colors.error }]}>{t("hs.wifi.perms.body")}</Text> : null}
      {wdError === "failed" ? <Text style={[styles.note, { color: colors.error }]}>{t("hs.wifi.failed")}</Text> : null}
      <Pressable disabled={wdBusy} onPress={() => void (wd?.active ? stopWifiDirectNetwork() : createWifiDirect())} style={({ pressed }) => [styles.systemButton, { backgroundColor: wd?.active ? colors.error : colors.primary }, pressed && !wdBusy && styles.pressed, wdBusy && styles.disabled]}>
        <MaterialIcons name={wd?.active ? "link-off" : "wifi-tethering"} size={18} color="#FFFFFF" />
        <Text style={styles.systemButtonText}>{wd?.active ? t("hs.wifi.stop") : t("hs.wifi.create")}</Text>
      </Pressable>
    </Panel>

    <SectionLabel>{t("hs.proxy.section")}</SectionLabel>
    <Panel style={styles.panel}>
      <ToggleRow icon="swap-horiz" title={t("hs.proxy.toggle")} description={t("hs.proxy.desc")} value={settings.lanProxyEnabled} onChange={(value) => update({ lanProxyEnabled: value })} />
      {/* Adresse du proxy en tête : c'est l'information clé pour les clients */}
      {settings.lanProxyEnabled ? (
        ips.length > 0 && lanState.running ? (
          <View style={[styles.proxyBlock, { backgroundColor: colors.surfaceRaised }]}>
            <Text style={[styles.rowTitleSmall, { color: colors.muted }]}>{t("hs.proxy.addr")}</Text>
            {ips.slice(0, 3).map((ip) => (
              <Pressable key={ip} onPress={() => void copyText(t("hs.proxy.copiedBody"), `${ip}:${lanState.port}`)} style={({ pressed }) => [pressed && styles.pressed]}>
                <Text selectable style={[styles.proxyIp, { color: colors.primary }]}>{ip}:{lanState.port}</Text>
              </Pressable>
            ))}
            <Text style={[styles.note, { color: colors.muted }]}>{t("hs.proxy.howto")}</Text>
            <Text style={[styles.note, { color: colors.muted }]}>{t("hs.proxy.pac", { url: `http://${ips[0]}:${lanState.port}/wpad.dat` })}</Text>
          </View>
        ) : !lanState.running ? (
          <Text style={[styles.note, { color: colors.muted }]}>{t("hs.proxy.starting")}</Text>
        ) : (
          <Text style={[styles.note, { color: colors.warning }]}>{t("hs.proxy.noIp")}</Text>
        )
      ) : null}
      <SettingTextRow icon="router" title={t("hs.proxy.port")} description={t("hs.proxy.port.desc")} value={String(settings.lanProxyPort)} onChangeText={(value) => { const parsed = parseInt(value.replace(/[^0-9]/g, ""), 10); if (Number.isFinite(parsed)) update({ lanProxyPort: parsed }); }} error={String(settings.lanProxyPort).match(/^\d+$/) && settings.lanProxyPort >= 1024 && settings.lanProxyPort <= 65535 ? null : "1024–65535"} />
    </Panel>

    <SectionLabel>{t("hs.routing.section")}</SectionLabel>
    <Panel style={styles.panel}>
      <InfoRow icon="alt-route" title={t("hs.route.title")} description={shareMode === "tunnels" ? t("hs.route.desc.tunnels") : shareMode === "thirdvpn" ? t("hs.route.desc.thirdvpn") : t("hs.route.desc.internet")} pillLabel={shareMode === "tunnels" ? t("hs.route.pill.tunnels") : shareMode === "thirdvpn" ? t("hs.route.pill.thirdvpn") : t("hs.route.pill.internet")} pillTone={shareMode === "internet" ? "warning" : "success"} />
      {/* Sonde d'IP de sortie via le SOCKS local = IP vue par les serveurs à travers le tunnel réel */}
      <View style={[styles.probeBlock, { borderTopColor: colors.border }]}>
        <View style={styles.probeHead}><Text style={[styles.rowTitleLocal, { color: colors.foreground }]}>{t("hs.probe.title")}</Text><Pressable onPress={() => { setProbing(true); void probeVpnExitIp().then((ip) => { setExitIp(ip); setProbing(false); }); }} style={({ pressed }) => [styles.probeButton, { borderColor: colors.border }, pressed && styles.pressed]}><Text style={[styles.probeButtonText, { color: colors.primary }]}>{t("hs.probe.refresh")}</Text></Pressable></View>
        <Pressable disabled={!exitIp} onPress={() => void copyText(t("hs.ipCopiedBody"), exitIp ?? "")} style={({ pressed }) => [pressed && styles.pressed]}>
          <Text selectable style={[styles.probeIp, { color: exitIp ? colors.success : colors.muted }]}>{probing ? "…" : exitIp === null ? t("hs.probe.idle") : exitIp || t("hs.probe.failed")}</Text>
        </Pressable>
        <Text style={[styles.note, { color: colors.muted }]}>{t("hs.probe.desc")}</Text>
        <View style={[styles.clientBlock, { backgroundColor: colors.surfaceRaised }]}>
          <Text style={[styles.rowTitleSmall, { color: colors.foreground }]}>{t("hs.client.title")}</Text>
          <Text style={[styles.note, { color: colors.muted }]}>{t("hs.client.desc")}</Text>
          <Pressable onPress={() => void copyText(t("hs.client.desc"), CLIENT_TEST_URL)} style={({ pressed }) => [pressed && styles.pressed]}>
            <Text selectable style={[styles.clientUrl, { color: colors.primary }]}>{CLIENT_TEST_URL}</Text>
          </Pressable>
        </View>
      </View>
      <InfoRow icon="dns" title={t("hs.leak.dns.title")} description={t("hs.leak.dns.desc.noroot")} pillLabel="DNS" />
      <InfoRow icon="block" title={t("hs.leak.ipv6.title")} description={t("hs.leak.ipv6.desc.noroot")} pillLabel="IPv6" />
    </Panel>

    <SectionLabel>{t("hs.devices.section")}</SectionLabel>
    <Panel style={styles.panel}>
      <InfoRow icon="devices" title={t("hs.devices.limit").slice(0, 46) + "…"} description={t("hs.devices.limit")} pillLabel="—" />
    </Panel>

    <SectionLabel>{t("hs.traffic.section")}</SectionLabel>
    <Panel style={styles.panel}>
      <View style={styles.trafficRow}>
        <View style={[styles.trafficCell, { backgroundColor: colors.surfaceRaised }]}><MaterialIcons name="south" size={17} color={colors.success} /><Text style={[styles.trafficValue, { color: colors.foreground }]}>{formatBytes(totals.rx)}</Text></View>
        <View style={[styles.trafficCell, { backgroundColor: colors.surfaceRaised }]}><MaterialIcons name="north" size={17} color={colors.primary} /><Text style={[styles.trafficValue, { color: colors.foreground }]}>{formatBytes(totals.tx)}</Text></View>
      </View>
      <Text style={[styles.note, { color: colors.muted }]}>{t("hs.traffic.global")}</Text>
    </Panel>
  </ScrollView></ScreenContainer>;
}

const styles = StyleSheet.create({
  top: { height: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "900" },
  content: { paddingTop: 14, paddingBottom: 32, gap: 12 },
  intro: { fontSize: 14, lineHeight: 20, marginBottom: 8 },
  panel: { padding: 16 },
  stateLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  statusText: { fontSize: 11, fontVariant: ["tabular-nums"], textTransform: "capitalize" },
  systemButton: { marginTop: 12, minHeight: 50, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  systemButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  probeBlock: { paddingTop: 14, marginTop: 14, borderTopWidth: StyleSheet.hairlineWidth, gap: 9 },
  probeHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  probeButton: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, minHeight: 34, alignItems: "center", justifyContent: "center" },
  probeButtonText: { fontSize: 12, fontWeight: "800" },
  probeIp: { fontSize: 22, fontWeight: "900", letterSpacing: 0.5 },
  rowTitleLocal: { fontSize: 14, fontWeight: "900" },
  rowTitleSmall: { fontSize: 12, fontWeight: "900" },
  note: { fontSize: 11, lineHeight: 16 },
  clientBlock: { borderRadius: 12, padding: 11, gap: 6 },
  proxyBlock: { borderRadius: 14, padding: 13, gap: 7 },
  proxyIp: { fontSize: 19, fontWeight: "900", letterSpacing: 0.4, fontVariant: ["tabular-nums"] },
  clientUrl: { fontSize: 13, fontWeight: "800", letterSpacing: 0.2 },
  trafficRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  trafficCell: { flex: 1, minHeight: 56, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  trafficValue: { fontSize: 16, fontWeight: "900", fontVariant: ["tabular-nums"] },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.985 }] },
});
