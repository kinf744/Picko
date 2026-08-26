import AsyncStorage from "@react-native-async-storage/async-storage";

export const HOTSPOT_SETTINGS_KEY = "kighmu.vpn.hotspot.v1";

export type HotspotSettings = {
  /** L'utilisateur a armé le partage (intention) ; l'activation du hotspot reste manuelle/système. */
  shareArmed: boolean;
  /** Alerte immédiate dès que le VPN tombe pour éviter toute fuite des clients. */
  killSwitchEnabled: boolean;
  /** Proxy de partage sur le réseau du hotspot (HTTP + SOCKS5, un seul port). */
  lanProxyEnabled: boolean;
  lanProxyPort: number;
};

export const DEFAULT_HOTSPOT_SETTINGS: HotspotSettings = {
  shareArmed: false,
  killSwitchEnabled: true,
  lanProxyEnabled: false,
  lanProxyPort: 8888,
};

export async function loadHotspotSettings(): Promise<HotspotSettings> {
  try {
    const raw = await AsyncStorage.getItem(HOTSPOT_SETTINGS_KEY);
    if (!raw) return DEFAULT_HOTSPOT_SETTINGS;
    // Fusion stricte : seuls les champs connus sont repris (les clés héritées
    // d'anciennes versions, ex. ssid/password, sont abandonnées proprement).
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const merged = { ...DEFAULT_HOTSPOT_SETTINGS } as Record<string, unknown>;
    for (const key of Object.keys(merged)) if (key in parsed) merged[key] = parsed[key];
    return merged as HotspotSettings;
  } catch {
    return DEFAULT_HOTSPOT_SETTINGS;
  }
}

export async function saveHotspotSettings(settings: HotspotSettings): Promise<void> {
  await AsyncStorage.setItem(HOTSPOT_SETTINGS_KEY, JSON.stringify(settings));
}
