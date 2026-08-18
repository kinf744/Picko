import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getNativeVpn, subscribeNativeVpn } from "./native";
import { validateVpnConfig, type TunnelMode } from "./validation";

export type TunnelStatus = "disconnected" | "connecting" | "connected" | "error";
export type LogLevel = "info" | "connection" | "warning" | "error";

export type VpnConfig = {
  mode: TunnelMode;
  host: string;
  port: string;
  obfs: string;
  password: string;
  slowDnsSshHost: string;
  slowDnsUsername: string;
  slowDnsPassword: string;
  slowDnsServer: string;
  slowDnsPort: string;
  slowDnsNameserver: string;
  slowDnsPublicKey: string;
};

export type DiagnosticLog = { id: string; timestamp: string; level: LogLevel; component: string; message: string };

const CONFIG_KEY = "kighmu.vpn.config.v2";
const LEGACY_CONFIG_KEY = "kighmu.vpn.config.v1";
const ZIVPN_PASSWORD_KEY = "kighmu.vpn.zivpn.password.v1";
const ZIVPN_OBFS_KEY = "kighmu.vpn.zivpn.obfs.v1";
const SLOWDNS_PASSWORD_KEY = "kighmu.vpn.slowdns.ssh-password.v1";
const LEGACY_PASSWORD_KEY = "kighmu.vpn.password.v1";
const LEGACY_OBFS_KEY = "kighmu.vpn.obfs.v1";

const EMPTY_CONFIG: VpnConfig = {
  mode: "zivpn", host: "", port: "", obfs: "", password: "",
  slowDnsSshHost: "", slowDnsUsername: "", slowDnsPassword: "", slowDnsServer: "", slowDnsPort: "53", slowDnsNameserver: "", slowDnsPublicKey: "",
};

const redact = (value: string) => value ? "••••••" : "non défini";
const makeLog = (level: LogLevel, component: string, message: string): DiagnosticLog => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, timestamp: new Date().toISOString(), level, component, message });
const storageGet = (key: string) => Platform.OS === "web" ? Promise.resolve(localStorage.getItem(key)) : SecureStore.getItemAsync(key);
const storageSet = (key: string, value: string) => Platform.OS === "web" ? Promise.resolve(localStorage.setItem(key, value)) : SecureStore.setItemAsync(key, value);
const storageDelete = (key: string) => Platform.OS === "web" ? Promise.resolve(localStorage.removeItem(key)) : SecureStore.deleteItemAsync(key);

export const validateConfig = validateVpnConfig;

type VpnContextValue = {
  config: VpnConfig; status: TunnelStatus; logs: DiagnosticLog[]; lastError: string | null; hydrated: boolean;
  updateConfig: (patch: Partial<VpnConfig>) => void; saveConfig: () => Promise<boolean>; validate: () => Partial<Record<keyof VpnConfig, string>>;
  connect: () => Promise<void>; disconnect: () => Promise<void>; clearLogs: () => void; resetConfig: () => Promise<void>;
};
const VpnContext = createContext<VpnContextValue | null>(null);

export function VpnProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<VpnConfig>(EMPTY_CONFIG);
  const [status, setStatus] = useState<TunnelStatus>("disconnected");
  const [logs, setLogs] = useState<DiagnosticLog[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const addLog = useCallback((level: LogLevel, component: string, message: string) => setLogs((current) => [makeLog(level, component, message), ...current].slice(0, 300)), []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(CONFIG_KEY) ?? await AsyncStorage.getItem(LEGACY_CONFIG_KEY);
        const [savedPassword, savedObfs, legacyPassword, legacyObfs, sshPassword] = await Promise.all([storageGet(ZIVPN_PASSWORD_KEY), storageGet(ZIVPN_OBFS_KEY), storageGet(LEGACY_PASSWORD_KEY), storageGet(LEGACY_OBFS_KEY), storageGet(SLOWDNS_PASSWORD_KEY)]);
        const password = savedPassword ?? legacyPassword;
        const obfs = savedObfs ?? legacyObfs;
        if (mounted && stored) {
          const parsed = JSON.parse(stored) as Partial<VpnConfig>;
          setConfig({ ...EMPTY_CONFIG, ...parsed, password: password ?? "", obfs: obfs ?? parsed.obfs ?? "", slowDnsPassword: sshPassword ?? "" });
        }
        if (mounted) addLog("info", "STORAGE", "Profil local chargé ; les secrets restent masqués.");
      } catch { if (mounted) addLog("warning", "STORAGE", "Le profil local n’a pas pu être chargé."); }
      finally { if (mounted) setHydrated(true); }
    })();
    return () => { mounted = false; };
  }, [addLog]);

  useEffect(() => subscribeNativeVpn(
    (payload) => {
      const level = payload.level === "error" || payload.level === "warning" || payload.level === "connection" ? payload.level : "info";
      setLogs((current) => [{ id: `${Date.now()}-native`, timestamp: new Date(Number(payload.timestamp) || Date.now()).toISOString(), level, component: payload.component || "NATIVE", message: payload.message } as DiagnosticLog, ...current].slice(0, 300));
    },
    (payload) => { if (["connected", "connecting", "disconnected", "error"].includes(payload.status)) setStatus(payload.status as TunnelStatus); },
  ), []);

  const updateConfig = useCallback((patch: Partial<VpnConfig>) => setConfig((current) => ({ ...current, ...patch })), []);
  const validate = useCallback(() => validateConfig(config), [config]);
  const saveConfig = useCallback(async () => {
    if (Object.keys(validateConfig(config)).length > 0) { addLog("warning", "VALIDATION", "Enregistrement refusé : certains champs sont invalides."); return false; }
    try {
      const { password, obfs, slowDnsPassword, ...publicConfig } = config;
      await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(publicConfig));
      await Promise.all([storageSet(ZIVPN_PASSWORD_KEY, password), storageSet(ZIVPN_OBFS_KEY, obfs), storageSet(SLOWDNS_PASSWORD_KEY, slowDnsPassword)]);
      addLog("info", "STORAGE", config.mode === "slowdns" ? `Profil SSH/SlowDNS enregistré ; SSH=${redact(slowDnsPassword)}.` : `Profil UDP-ZIVPN enregistré ; password=${redact(password)}; obfs=${redact(obfs)}.`);
      return true;
    } catch { addLog("error", "STORAGE", "Échec d’enregistrement du profil sécurisé."); return false; }
  }, [addLog, config]);

  const connect = useCallback(async () => {
    const errors = validateConfig(config);
    if (Object.keys(errors).length > 0) { setLastError("Corrigez la configuration avant de vous connecter."); setStatus("error"); addLog("error", "VALIDATION", "Connexion refusée : configuration invalide."); return; }
    setLastError(null); setStatus("connecting");
    if (config.mode === "slowdns") {
      addLog("connection", "SLOWDNS", `Préparation SSH/SlowDNS via ${config.slowDnsServer}:${config.slowDnsPort}; nameserver=${config.slowDnsNameserver}.`);
      addLog("connection", "AUTH", `Identifiant SSH chargé ; mot de passe=${redact(config.slowDnsPassword)}.`);
    } else {
      addLog("connection", "TUNNEL", `Préparation UDP-ZIVPN vers ${config.host}:${config.port}.`);
      addLog("connection", "AUTH", `Paramètres chargés; password=${redact(config.password)}; obfs=${redact(config.obfs)}.`);
    }
    const native = getNativeVpn();
    if (!native) { setLastError("Le moteur natif Android n’est pas disponible dans ce preview."); setStatus("error"); addLog("warning", "NATIVE", "La connexion réelle nécessite un build natif personnalisé."); return; }
    try {
      addLog("connection", "ANDROID", "Demande d’autorisation VPN au système Android.");
      if (!await native.prepareVpn()) { setStatus("disconnected"); setLastError("Autorisation VPN en attente ou refusée par Android."); addLog("warning", "ANDROID", "L’autorisation VPN doit être confirmée dans la fenêtre système."); return; }
      await native.startVpn(JSON.stringify({
        mode: config.mode, host: config.host, port: config.port, obfs: config.obfs, password: config.password,
        slowDns: { sshHost: config.slowDnsSshHost, sshUsername: config.slowDnsUsername, sshPassword: config.slowDnsPassword, dnsServer: config.slowDnsServer, dnsPort: Number(config.slowDnsPort), nameserver: config.slowDnsNameserver, publicKey: config.slowDnsPublicKey },
      }));
      addLog("connection", "NATIVE", config.mode === "slowdns" ? "Service VpnService démarré ; authentification SSH/SlowDNS en attente." : "Service VpnService démarré ; test UDP-ZIVPN en attente.");
    } catch (error) { setLastError("Le service VPN Android n’a pas pu démarrer."); setStatus("error"); addLog("error", "NATIVE", `Échec du démarrage natif : ${String(error).slice(0, 180)}`); }
  }, [addLog, config]);

  const disconnect = useCallback(async () => { try { await getNativeVpn()?.stopVpn(); } catch (error) { addLog("warning", "NATIVE", `Arrêt natif signalé avec une erreur : ${String(error).slice(0, 160)}`); } setStatus("disconnected"); setLastError(null); addLog("connection", "TUNNEL", "Déconnexion demandée."); }, [addLog]);
  const clearLogs = useCallback(() => setLogs([]), []);
  const resetConfig = useCallback(async () => { await AsyncStorage.multiRemove([CONFIG_KEY, LEGACY_CONFIG_KEY]); await Promise.all([storageDelete(ZIVPN_PASSWORD_KEY), storageDelete(ZIVPN_OBFS_KEY), storageDelete(LEGACY_PASSWORD_KEY), storageDelete(LEGACY_OBFS_KEY), storageDelete(SLOWDNS_PASSWORD_KEY)]); setConfig(EMPTY_CONFIG); addLog("info", "STORAGE", "Les profils locaux ont été réinitialisés."); }, [addLog]);
  const value = useMemo(() => ({ config, status, logs, lastError, hydrated, updateConfig, saveConfig, validate, connect, disconnect, clearLogs, resetConfig }), [config, status, logs, lastError, hydrated, updateConfig, saveConfig, validate, connect, disconnect, clearLogs, resetConfig]);
  return <VpnContext.Provider value={value}>{children}</VpnContext.Provider>;
}
export function useVpn() { const value = useContext(VpnContext); if (!value) throw new Error("useVpn doit être utilisé dans VpnProvider"); return value; }
