import AsyncStorage from "@react-native-async-storage/async-storage";

export const APP_SETTINGS_KEY = "kighmu.vpn.app-settings.v1";

/** Préférence de thème : « system » suit l'OS en direct, « light »/« dark » forcent le schéma. */
export type ThemePreference = "system" | "light" | "dark";

/** Préférence de langue : « system » suit l'appareil (repli français), sinon forçage fr/en. */
export type LanguagePreference = "system" | "fr" | "en";

export type AppSettings = {
  autoReconnect: boolean;
  stopOnNetworkLoss: boolean;
  dnsProtection: boolean;
  launchOnBoot: boolean;
  verboseDiagnostics: boolean;
  confirmDisconnect: boolean;
  reconnectDelaySeconds: number;
  theme: ThemePreference;
  language: LanguagePreference;
  mtu: number;
  wakeLockEnabled: boolean;
  profileNameInNotification: boolean;
  customDnsEnabled: boolean;
  dnsPrimary: string;
  dnsSecondary: string;
  pingEnabled: boolean;
  httpPingEnabled: boolean;
  httpPingUrl: string;
  httpPingIntervalMs: number;
  httpPingTimeoutMs: number;
  reconnectAfterFailures: number;
  alwaysReconnect: boolean;
};

// Défauts des champs moteurs = défauts natifs au byte près (référence :
// modules/kighmu-vpn-native/.../VpnRuntimeSettings.kt:7-20). Dès que la charge
// utile émet `settings`, ces valeurs deviennent autoritaires : un utilisateur
// qui ne touche à rien doit obtenir exactement le comportement actuel.
export const DEFAULT_APP_SETTINGS: AppSettings = {
  autoReconnect: false,
  stopOnNetworkLoss: true,
  dnsProtection: true,
  launchOnBoot: false,
  verboseDiagnostics: true,
  confirmDisconnect: true,
  reconnectDelaySeconds: 5,
  theme: "system",
  language: "system",
  mtu: 1400, // natif : coerceIn(1280, 1500)
  wakeLockEnabled: false,
  profileNameInNotification: true,
  customDnsEnabled: false,
  dnsPrimary: "1.1.1.1", // natif : trim + ≤255 caractères
  dnsSecondary: "1.0.0.1",
  pingEnabled: false, // désactivé par défaut : l'utilisateur active l'affichage du ping s'il le souhaite
  httpPingEnabled: false,
  httpPingUrl: "https://www.google.com/generate_204", // natif : schéma http(s) exigé
  httpPingIntervalMs: 5000, // natif : coerceIn(1000, 120000)
  httpPingTimeoutMs: 5000, // natif : coerceIn(1000, min(60000, intervalle))
  reconnectAfterFailures: 3, // natif : coerceIn(0, 20)
  alwaysReconnect: true,
};

export async function loadAppSettings(): Promise<AppSettings> { try { const raw = await AsyncStorage.getItem(APP_SETTINGS_KEY); return raw ? { ...DEFAULT_APP_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) } : DEFAULT_APP_SETTINGS; } catch { return DEFAULT_APP_SETTINGS; } }
export async function saveAppSettings(settings: AppSettings): Promise<void> { await AsyncStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settings)); }