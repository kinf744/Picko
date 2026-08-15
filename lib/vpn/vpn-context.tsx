import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getNativeVpn, subscribeNativeVpn } from "./native";
import { FIXED_OBFS, validateVpnConfig } from "./validation";

export type TunnelStatus = "disconnected" | "connecting" | "connected" | "error";
export type LogLevel = "info" | "connection" | "warning" | "error";

export type VpnConfig = {
  host: string;
  port: string;
  obfs: string;
  username: string;
  password: string;
};

export type DiagnosticLog = {
  id: string;
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
};

const CONFIG_KEY = "kighmu.vpn.config.v1";
const USERNAME_KEY = "kighmu.vpn.username.v1";
const PASSWORD_KEY = "kighmu.vpn.password.v1";
const OBFS_KEY = "kighmu.vpn.obfs.v1";

const EMPTY_CONFIG: VpnConfig = { host: "", port: "", obfs: FIXED_OBFS, username: "", password: "" };

function redact(value: string) {
  return value ? "••••••" : "non défini";
}

function makeLog(level: LogLevel, component: string, message: string): DiagnosticLog {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    level,
    component,
    message,
  };
}

export const validateConfig = validateVpnConfig;

type VpnContextValue = {
  config: VpnConfig;
  status: TunnelStatus;
  logs: DiagnosticLog[];
  lastError: string | null;
  hydrated: boolean;
  updateConfig: (patch: Partial<VpnConfig>) => void;
  saveConfig: () => Promise<boolean>;
  validate: () => Partial<Record<keyof VpnConfig, string>>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  clearLogs: () => void;
  resetConfig: () => Promise<void>;
};

const VpnContext = createContext<VpnContextValue | null>(null);

export function VpnProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<VpnConfig>(EMPTY_CONFIG);
  const [status, setStatus] = useState<TunnelStatus>("disconnected");
  const [logs, setLogs] = useState<DiagnosticLog[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const addLog = useCallback((level: LogLevel, component: string, message: string) => {
    setLogs((current) => [makeLog(level, component, message), ...current].slice(0, 300));
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(CONFIG_KEY);
        const username = Platform.OS === "web" ? localStorage.getItem(USERNAME_KEY) : await SecureStore.getItemAsync(USERNAME_KEY);
        const password = Platform.OS === "web" ? localStorage.getItem(PASSWORD_KEY) : await SecureStore.getItemAsync(PASSWORD_KEY);
        const obfs = Platform.OS === "web" ? localStorage.getItem(OBFS_KEY) : await SecureStore.getItemAsync(OBFS_KEY);
        if (mounted && stored) {
          const parsed = JSON.parse(stored) as Partial<VpnConfig>;
          setConfig({ ...EMPTY_CONFIG, ...parsed, username: username ?? parsed.username ?? "", password: password ?? "", obfs: FIXED_OBFS });
        }
        if (mounted) addLog("info", "STORAGE", "Profil local chargé ; les secrets restent masqués.");
      } catch {
        if (mounted) addLog("warning", "STORAGE", "Le profil local n’a pas pu être chargé.");
      } finally {
        if (mounted) setHydrated(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [addLog]);

  useEffect(() => {
    return subscribeNativeVpn(
      (payload) => {
        const level = payload.level === "error" || payload.level === "warning" || payload.level === "connection" ? payload.level : "info";
        const component = payload.component || "NATIVE";
        const message = payload.message;
        setLogs((current) => [{ id: `${Date.now()}-native`, timestamp: new Date(Number(payload.timestamp) || Date.now()).toISOString(), level, component, message } as DiagnosticLog, ...current].slice(0, 300));
        if (component === "KIGHMU" && /failed to initialize|timeout|connect error|no recent network activity/i.test(message)) {
          setLastError("Le handshake KIGHMU a échoué ou a expiré.");
          setStatus("error");
        }
      },
      (payload) => {
        if (payload.status === "connected" || payload.status === "connecting" || payload.status === "disconnected" || payload.status === "error") setStatus(payload.status);
      },
    );
  }, []);

  const updateConfig = useCallback((patch: Partial<VpnConfig>) => {
    setConfig((current) => ({ ...current, ...patch }));
  }, []);

  const saveConfig = useCallback(async () => {
    const errors = validateConfig(config);
    if (Object.keys(errors).length > 0) {
      addLog("warning", "VALIDATION", "Enregistrement refusé : certains champs sont invalides.");
      return false;
    }
    try {
      await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify({ host: config.host, port: config.port, username: config.username }));
      if (Platform.OS === "web") {
        localStorage.setItem(USERNAME_KEY, config.username);
        localStorage.setItem(PASSWORD_KEY, config.password);
        localStorage.setItem(OBFS_KEY, FIXED_OBFS);
      } else {
        await SecureStore.setItemAsync(USERNAME_KEY, config.username);
        await SecureStore.setItemAsync(PASSWORD_KEY, config.password);
        await SecureStore.setItemAsync(OBFS_KEY, FIXED_OBFS);
      }
      addLog("info", "STORAGE", `Profil enregistré pour ${config.host}:${config.port}; username=${redact(config.username)}; password=${redact(config.password)}; obfs=${redact(config.obfs)}.`);
      return true;
    } catch {
      addLog("error", "STORAGE", "Échec d’enregistrement du profil sécurisé.");
      return false;
    }
  }, [addLog, config]);

  const validate = useCallback(() => validateConfig(config), [config]);

  const connect = useCallback(async () => {
    const errors = validateConfig(config);
    if (Object.keys(errors).length > 0) {
      setLastError("Corrigez la configuration avant de vous connecter.");
      setStatus("error");
      addLog("error", "VALIDATION", "Connexion refusée : configuration invalide.");
      return;
    }
    setLastError(null);
    setStatus("connecting");
    addLog("connection", "TUNNEL", `Préparation de la connexion vers ${config.host}:${config.port}.`);
    addLog("connection", "AUTH", `Paramètres chargés; username=${redact(config.username)}; password=${redact(config.password)}; obfs=${redact(config.obfs)}.`);
    const native = getNativeVpn();
    if (!native) {
      addLog("warning", "NATIVE", "Aucun module Android chargé dans ce preview ; la connexion réelle nécessite un build natif personnalisé.");
      setLastError("Le moteur natif Android n’est pas disponible dans ce preview.");
      setStatus("error");
      return;
    }
    try {
      addLog("connection", "ANDROID", "Demande d’autorisation VPN au système Android.");
      const prepared = await native.prepareVpn();
      if (!prepared) {
        setStatus("disconnected");
        setLastError("Autorisation VPN en attente ou refusée par Android.");
        addLog("warning", "ANDROID", "L’autorisation VPN doit être confirmée dans la fenêtre système.");
        return;
      }
      await native.startVpn(config.host, config.port, config.obfs, config.username, config.password);
      addLog("connection", "NATIVE", "Service VpnService démarré ; handshake KIGHMU en attente.");
      setStatus("connecting");
    } catch (error) {
      setLastError("Le service VPN Android n’a pas pu démarrer.");
      setStatus("error");
      addLog("error", "NATIVE", `Échec du démarrage natif : ${String(error).slice(0, 180)}`);
    }
  }, [addLog, config]);

  const disconnect = useCallback(async () => {
    const native = getNativeVpn();
    try {
      await native?.stopVpn();
    } catch (error) {
      addLog("warning", "NATIVE", `Arrêt natif signalé avec une erreur : ${String(error).slice(0, 160)}`);
    }
    setStatus("disconnected");
    setLastError(null);
    addLog("connection", "TUNNEL", "Déconnexion demandée.");
  }, [addLog]);

  const clearLogs = useCallback(() => setLogs([]), []);

  const resetConfig = useCallback(async () => {
    await AsyncStorage.removeItem(CONFIG_KEY);
    if (Platform.OS === "web") {
      localStorage.removeItem(USERNAME_KEY);
      localStorage.removeItem(PASSWORD_KEY);
      localStorage.removeItem(OBFS_KEY);
    } else {
      await SecureStore.deleteItemAsync(USERNAME_KEY);
      await SecureStore.deleteItemAsync(PASSWORD_KEY);
      await SecureStore.deleteItemAsync(OBFS_KEY);
    }
    setConfig(EMPTY_CONFIG);
    addLog("info", "STORAGE", "Le profil local a été réinitialisé.");
  }, [addLog]);

  const value = useMemo(() => ({ config, status, logs, lastError, hydrated, updateConfig, saveConfig, validate, connect, disconnect, clearLogs, resetConfig }), [config, status, logs, lastError, hydrated, updateConfig, saveConfig, validate, connect, disconnect, clearLogs, resetConfig]);
  return <VpnContext.Provider value={value}>{children}</VpnContext.Provider>;
}

export function useVpn() {
  const value = useContext(VpnContext);
  if (!value) throw new Error("useVpn doit être utilisé dans VpnProvider");
  return value;
}
