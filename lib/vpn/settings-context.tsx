import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type VpnRuntimeSettings = {
  customDnsEnabled: boolean;
  dnsPrimary: string;
  dnsSecondary: string;
  mtu: string;
  wakeLockEnabled: boolean;
  profileNameInNotification: boolean;
  debugMode: boolean;
  httpPingEnabled: boolean;
  httpPingUrl: string;
  httpPingIntervalMs: string;
  httpPingTimeoutMs: string;
  reconnectAfterFailures: string;
  alwaysReconnect: boolean;
};

export const DEFAULT_VPN_SETTINGS: VpnRuntimeSettings = {
  customDnsEnabled: false,
  dnsPrimary: "1.1.1.1",
  dnsSecondary: "1.0.0.1",
  mtu: "1400",
  wakeLockEnabled: false,
  profileNameInNotification: true,
  debugMode: false,
  httpPingEnabled: true,
  httpPingUrl: "https://www.google.com/generate_204",
  httpPingIntervalMs: "5000",
  httpPingTimeoutMs: "5000",
  reconnectAfterFailures: "3",
  alwaysReconnect: true,
};

const SETTINGS_KEY = "picko.vpn.runtime-settings.v1";

type VpnSettingsContextValue = {
  settings: VpnRuntimeSettings;
  hydrated: boolean;
  updateSettings: (patch: Partial<VpnRuntimeSettings>) => void;
  resetSettings: () => void;
};

const VpnSettingsContext = createContext<VpnSettingsContextValue | null>(null);

function sanitizeSettings(candidate: Partial<VpnRuntimeSettings>): VpnRuntimeSettings {
  const text = (value: unknown, fallback: string, max: number) => typeof value === "string" ? value.slice(0, max) : fallback;
  return {
    customDnsEnabled: Boolean(candidate.customDnsEnabled),
    dnsPrimary: text(candidate.dnsPrimary, DEFAULT_VPN_SETTINGS.dnsPrimary, 255),
    dnsSecondary: text(candidate.dnsSecondary, DEFAULT_VPN_SETTINGS.dnsSecondary, 255),
    mtu: text(candidate.mtu, DEFAULT_VPN_SETTINGS.mtu, 5),
    wakeLockEnabled: Boolean(candidate.wakeLockEnabled),
    profileNameInNotification: candidate.profileNameInNotification !== false,
    debugMode: Boolean(candidate.debugMode),
    httpPingEnabled: candidate.httpPingEnabled !== false,
    httpPingUrl: text(candidate.httpPingUrl, DEFAULT_VPN_SETTINGS.httpPingUrl, 1024),
    httpPingIntervalMs: text(candidate.httpPingIntervalMs, DEFAULT_VPN_SETTINGS.httpPingIntervalMs, 6),
    httpPingTimeoutMs: text(candidate.httpPingTimeoutMs, DEFAULT_VPN_SETTINGS.httpPingTimeoutMs, 5),
    reconnectAfterFailures: text(candidate.reconnectAfterFailures, DEFAULT_VPN_SETTINGS.reconnectAfterFailures, 2),
    alwaysReconnect: candidate.alwaysReconnect !== false,
  };
}

export function VpnSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<VpnRuntimeSettings>(DEFAULT_VPN_SETTINGS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(SETTINGS_KEY).then((stored) => {
      if (active && stored) setSettings(sanitizeSettings(JSON.parse(stored) as Partial<VpnRuntimeSettings>));
    }).catch(() => undefined).finally(() => { if (active) setHydrated(true); });
    return () => { active = false; };
  }, []);

  const save = useCallback((next: VpnRuntimeSettings) => {
    setSettings(next);
    void AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  }, []);

  const updateSettings = useCallback((patch: Partial<VpnRuntimeSettings>) => {
    setSettings((current) => {
      const next = sanitizeSettings({ ...current, ...patch });
      void AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => save(DEFAULT_VPN_SETTINGS), [save]);
  const value = useMemo(() => ({ settings, hydrated, updateSettings, resetSettings }), [settings, hydrated, updateSettings, resetSettings]);
  return <VpnSettingsContext.Provider value={value}>{children}</VpnSettingsContext.Provider>;
}

export function useVpnSettings() {
  const value = useContext(VpnSettingsContext);
  if (!value) throw new Error("useVpnSettings doit être utilisé dans VpnSettingsProvider");
  return value;
}
