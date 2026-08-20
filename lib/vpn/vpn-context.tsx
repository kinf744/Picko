import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getNativeVpn, subscribeNativeVpn } from "./native";
import { createEmptyProfile, stripSecrets, type StoredVpnProfile, type TunnelMethod, type VpnProfile } from "./profiles";
import { validateProfile } from "./validation";

export type TunnelStatus = "disconnected" | "connecting" | "connected" | "error";
export type LogLevel = "info" | "connection" | "warning" | "error";
export type { VpnProfile } from "./profiles";

export type DiagnosticLog = {
  id: string;
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
};

const PROFILES_KEY = "kighmu.vpn.profiles.v2";
const LEGACY_CONFIG_KEY = "kighmu.vpn.config.v1";
const LEGACY_PASSWORD_KEY = "kighmu.vpn.password.v1";
const LEGACY_OBFS_KEY = "kighmu.vpn.obfs.v1";
const SECRET_PREFIX = "kighmu.vpn.profile.secret.";

function secretKey(id: string) {
  return `${SECRET_PREFIX}${id}`;
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

async function readSecret(id: string) {
  const key = secretKey(id);
  const value = Platform.OS === "web" ? localStorage.getItem(key) : await SecureStore.getItemAsync(key);
  if (!value) return { obfs: "", password: "", hysteriaAuth: "", hysteriaObfs: "", xrayLink: "", xrayJson: "" };
  try {
    const parsed = JSON.parse(value) as { obfs?: string; password?: string; hysteriaAuth?: string; hysteriaObfs?: string; xrayLink?: string; xrayJson?: string };
    return {
      obfs: parsed.obfs ?? "",
      password: parsed.password ?? "",
      hysteriaAuth: parsed.hysteriaAuth ?? "",
      hysteriaObfs: parsed.hysteriaObfs ?? "",
      xrayLink: parsed.xrayLink ?? "",
      xrayJson: parsed.xrayJson ?? "",
    };
  } catch {
    return { obfs: "", password: "", hysteriaAuth: "", hysteriaObfs: "", xrayLink: "", xrayJson: "" };
  }
}

async function writeSecret(profile: VpnProfile) {
  const value = JSON.stringify({
    obfs: profile.obfs,
    password: profile.password,
    hysteriaAuth: profile.hysteriaAuth,
    hysteriaObfs: profile.hysteriaObfs,
    xrayLink: profile.xrayLink,
    xrayJson: profile.xrayJson,
  });
  const key = secretKey(profile.id);
  if (Platform.OS === "web") localStorage.setItem(key, value);
  else await SecureStore.setItemAsync(key, value);
}

async function removeSecret(id: string) {
  const key = secretKey(id);
  if (Platform.OS === "web") localStorage.removeItem(key);
  else await SecureStore.deleteItemAsync(key);
}

type VpnContextValue = {
  profiles: VpnProfile[];
  activeProfiles: VpnProfile[];
  primaryProfile: VpnProfile | null;
  status: TunnelStatus;
  logs: DiagnosticLog[];
  lastError: string | null;
  hydrated: boolean;
  createProfile: (method: TunnelMethod) => VpnProfile;
  saveProfile: (profile: VpnProfile) => Promise<boolean>;
  duplicateProfile: (profile: VpnProfile) => Promise<boolean>;
  deleteProfile: (id: string) => Promise<void>;
  setProfileEnabled: (id: string, enabled: boolean) => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  clearLogs: () => void;
};

const VpnContext = createContext<VpnContextValue | null>(null);

export function VpnProvider({ children }: { children: React.ReactNode }) {
  const [profiles, setProfiles] = useState<VpnProfile[]>([]);
  const [status, setStatus] = useState<TunnelStatus>("disconnected");
  const [logs, setLogs] = useState<DiagnosticLog[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const addLog = useCallback((level: LogLevel, component: string, message: string) => {
    setLogs((current) => [makeLog(level, component, message), ...current].slice(0, 300));
  }, []);

  const persistProfiles = useCallback(async (next: VpnProfile[]) => {
    await AsyncStorage.setItem(PROFILES_KEY, JSON.stringify(next.map(stripSecrets)));
    await Promise.all(next.map(writeSecret));
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(PROFILES_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as StoredVpnProfile[];
          const restored = await Promise.all(parsed.map(async (profile) => ({ ...createEmptyProfile(profile.method), ...profile, ...(await readSecret(profile.id)) })));
          if (mounted) setProfiles(restored);
        } else {
          const legacy = await AsyncStorage.getItem(LEGACY_CONFIG_KEY);
          const password = Platform.OS === "web" ? localStorage.getItem(LEGACY_PASSWORD_KEY) : await SecureStore.getItemAsync(LEGACY_PASSWORD_KEY);
          const obfs = Platform.OS === "web" ? localStorage.getItem(LEGACY_OBFS_KEY) : await SecureStore.getItemAsync(LEGACY_OBFS_KEY);
          if (legacy) {
            const parsed = JSON.parse(legacy) as { host?: string; port?: string };
            const migrated = { ...createEmptyProfile("zivpn-udp"), name: "Profil ZiVPN migré", host: parsed.host ?? "", port: parsed.port ?? "", password: password ?? "", obfs: obfs ?? "" };
            if (mounted) setProfiles([migrated]);
            await persistProfiles([migrated]);
          }
        }
        if (mounted) addLog("info", "STORAGE", "Profils locaux chargés ; les secrets restent protégés.");
      } catch {
        if (mounted) addLog("warning", "STORAGE", "Les profils locaux n’ont pas pu être chargés.");
      } finally {
        if (mounted) setHydrated(true);
      }
    })();
    return () => { mounted = false; };
  }, [addLog, persistProfiles]);

  useEffect(() => subscribeNativeVpn(
    (payload) => {
      const level = payload.level === "error" || payload.level === "warning" || payload.level === "connection" ? payload.level : "info";
      setLogs((current) => [{ id: `${Date.now()}-native`, timestamp: new Date(Number(payload.timestamp) || Date.now()).toISOString(), level, component: payload.component || "NATIVE", message: payload.message } as DiagnosticLog, ...current].slice(0, 300));
    },
    (payload) => {
      if (payload.status === "connected" || payload.status === "connecting" || payload.status === "disconnected" || payload.status === "error") setStatus(payload.status);
    },
  ), []);

  const createProfile = useCallback((method: TunnelMethod) => createEmptyProfile(method), []);

  const saveProfile = useCallback(async (profile: VpnProfile) => {
    const errors = validateProfile(profile);
    if (Object.keys(errors).length > 0) {
      addLog("warning", "VALIDATION", `Le profil « ${profile.name || "sans nom"} » contient des champs invalides.`);
      return false;
    }
    const next = profiles.some((current) => current.id === profile.id)
      ? profiles.map((current) => current.id === profile.id ? profile : current)
      : [...profiles, profile];
    try {
      await persistProfiles(next);
      setProfiles(next);
      addLog("info", "STORAGE", `Profil « ${profile.name} » enregistré.`);
      return true;
    } catch {
      addLog("error", "STORAGE", "Échec d’enregistrement du profil sécurisé.");
      return false;
    }
  }, [addLog, persistProfiles, profiles]);

  const duplicateProfile = useCallback(async (source: VpnProfile) => {
    const existingNames = new Set(profiles.map((profile) => profile.name.trim().toLocaleLowerCase()));
    const baseName = source.name.trim() || "Profil de tunnel";
    let copyName = `${baseName} (copie)`;
    let suffix = 2;
    while (existingNames.has(copyName.toLocaleLowerCase())) {
      copyName = `${baseName} (copie ${suffix})`;
      suffix += 1;
    }
    const clone = { ...source, id: createEmptyProfile(source.method).id, name: copyName };
    try {
      const next = [...profiles, clone];
      await persistProfiles(next);
      setProfiles(next);
      addLog("info", "STORAGE", `Profil « ${source.name || "sans nom"} » cloné sous « ${copyName} ».`);
      return true;
    } catch {
      addLog("error", "STORAGE", "Échec du clonage du profil sécurisé.");
      return false;
    }
  }, [addLog, persistProfiles, profiles]);

  const deleteProfile = useCallback(async (id: string) => {
    const next = profiles.filter((profile) => profile.id !== id);
    await persistProfiles(next);
    await removeSecret(id);
    setProfiles(next);
    addLog("info", "STORAGE", "Profil supprimé de l’appareil.");
  }, [addLog, persistProfiles, profiles]);

  const setProfileEnabled = useCallback(async (id: string, enabled: boolean) => {
    const next = profiles.map((profile) => profile.id === id ? { ...profile, enabled } : profile);
    await persistProfiles(next);
    setProfiles(next);
  }, [persistProfiles, profiles]);

  const activeProfiles = useMemo(() => profiles.filter((profile) => profile.enabled), [profiles]);
  const primaryProfile = activeProfiles[0] ?? profiles[0] ?? null;

  const connect = useCallback(async () => {
    if (activeProfiles.length === 0) {
      setLastError("Activez au moins un profil de tunnel avant de vous connecter.");
      setStatus("error");
      addLog("error", "VALIDATION", "Connexion refusée : aucun profil actif.");
      return;
    }
    const invalid = activeProfiles.find((profile) => Object.keys(validateProfile(profile)).length > 0);
    if (invalid) {
      setLastError(`Complétez le profil « ${invalid.name || "sans nom"} » avant de vous connecter.`);
      setStatus("error");
      addLog("error", "VALIDATION", "Connexion refusée : un profil actif est invalide.");
      return;
    }
    setLastError(null);
    setStatus("connecting");
    addLog("connection", "TUNNEL", `Préparation de ${activeProfiles.length} tunnel(s) actif(s).`);
    const native = getNativeVpn();
    if (!native) {
      setLastError("Le moteur natif Android n’est pas disponible dans ce preview.");
      setStatus("error");
      addLog("warning", "NATIVE", "Un build Android personnalisé est nécessaire pour établir les tunnels.");
      return;
    }
    try {
      const prepared = await native.prepareVpn();
      if (!prepared) {
        setStatus("disconnected");
        setLastError("Autorisation VPN en attente ou refusée par Android.");
        addLog("warning", "ANDROID", "L’autorisation VPN doit être confirmée dans la fenêtre système.");
        return;
      }
      await native.startVpn(JSON.stringify({ profiles: activeProfiles }));
      addLog("connection", "NATIVE", "Service VPN démarré ; initialisation et contrôle de santé des tunnels en cours.");
    } catch (error) {
      setLastError("Le service VPN Android n’a pas pu démarrer.");
      setStatus("error");
      addLog("error", "NATIVE", `Échec du démarrage natif : ${String(error).slice(0, 180)}`);
    }
  }, [activeProfiles, addLog]);

  const disconnect = useCallback(async () => {
    try {
      await getNativeVpn()?.stopVpn();
    } catch (error) {
      addLog("warning", "NATIVE", `Arrêt natif signalé avec une erreur : ${String(error).slice(0, 160)}`);
    }
    setStatus("disconnected");
    setLastError(null);
    addLog("connection", "TUNNEL", "Déconnexion demandée.");
  }, [addLog]);

  const value = useMemo(() => ({ profiles, activeProfiles, primaryProfile, status, logs, lastError, hydrated, createProfile, saveProfile, duplicateProfile, deleteProfile, setProfileEnabled, connect, disconnect, clearLogs: () => setLogs([]) }), [profiles, activeProfiles, primaryProfile, status, logs, lastError, hydrated, createProfile, saveProfile, duplicateProfile, deleteProfile, setProfileEnabled, connect, disconnect]);
  return <VpnContext.Provider value={value}>{children}</VpnContext.Provider>;
}

export function useVpn() {
  const value = useContext(VpnContext);
  if (!value) throw new Error("useVpn doit être utilisé dans VpnProvider");
  return value;
}
