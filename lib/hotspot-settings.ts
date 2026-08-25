import AsyncStorage from "@react-native-async-storage/async-storage";

export const HOTSPOT_SETTINGS_KEY = "kighmu.vpn.hotspot.v1";

export type HotspotSettings = {
  /** L'utilisateur a armé le partage (intention) ; l'activation du hotspot reste manuelle/système. */
  shareArmed: boolean;
  ssid: string;
  password: string;
  /** Alerte immédiate dès que le VPN tombe pour éviter toute fuite des clients. */
  killSwitchEnabled: boolean;
  /** Proxy de partage sur le réseau du hotspot (HTTP + SOCKS5, un seul port). */
  lanProxyEnabled: boolean;
  lanProxyPort: number;
};

export const DEFAULT_HOTSPOT_SETTINGS: HotspotSettings = {
  shareArmed: false,
  ssid: "KIGHMU VPN",
  password: "",
  killSwitchEnabled: true,
  lanProxyEnabled: false,
  lanProxyPort: 8888,
};

export async function loadHotspotSettings(): Promise<HotspotSettings> {
  try {
    const raw = await AsyncStorage.getItem(HOTSPOT_SETTINGS_KEY);
    return raw ? { ...DEFAULT_HOTSPOT_SETTINGS, ...(JSON.parse(raw) as Partial<HotspotSettings>) } : DEFAULT_HOTSPOT_SETTINGS;
  } catch {
    return DEFAULT_HOTSPOT_SETTINGS;
  }
}

export async function saveHotspotSettings(settings: HotspotSettings): Promise<void> {
  await AsyncStorage.setItem(HOTSPOT_SETTINGS_KEY, JSON.stringify(settings));
}
