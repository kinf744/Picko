import AsyncStorage from "@react-native-async-storage/async-storage";

export const APP_SETTINGS_KEY = "kighmu.vpn.app-settings.v1";
export type AppSettings = { autoReconnect: boolean; stopOnNetworkLoss: boolean; dnsProtection: boolean; launchOnBoot: boolean; verboseDiagnostics: boolean; confirmDisconnect: boolean; reconnectDelaySeconds: number };
export const DEFAULT_APP_SETTINGS: AppSettings = { autoReconnect: false, stopOnNetworkLoss: true, dnsProtection: true, launchOnBoot: false, verboseDiagnostics: true, confirmDisconnect: true, reconnectDelaySeconds: 5 };
export async function loadAppSettings(): Promise<AppSettings> { try { const raw = await AsyncStorage.getItem(APP_SETTINGS_KEY); return raw ? { ...DEFAULT_APP_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) } : DEFAULT_APP_SETTINGS; } catch { return DEFAULT_APP_SETTINGS; } }
export async function saveAppSettings(settings: AppSettings): Promise<void> { await AsyncStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settings)); }
