import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { AppState, Platform } from "react-native";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getNativeVpn, subscribeNativeVpn } from "./native";
import { createEmptyProfile, stripSecrets, withFixedZiVpnObfs, type StoredVpnProfile, type TunnelMethod, type VpnProfile } from "./profiles";
import { validateProfile } from "./validation";
import { useVpnSettings } from "./settings-context";

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
  setMethodEnabled: (method: TunnelMethod, enabled: boolean) => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  clearLogs: () => void;
  importProfiles: (nextProfiles: VpnProfile[]) => Promise<boolean>;
  resetProfiles: () => Promise<void>;
};

const VpnContext = createContext<VpnContextValue | null>(null);

export function VpnProvider({ children }: { children: React.ReactNode }) {
  const { settings, hydrated: settingsHydrated } = useVpnSettings();
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
          const restored = await Promise.all(parsed.map(async (profile) => withFixedZiVpnObfs({ ...createEmptyProfile(profile.method), ...profile, ...(await readSecret(profile.id)) })));
          if (mounted) setProfiles(restored);
        } else {
          const legacy = await AsyncStorage.getItem(LEGACY_CONFIG_KEY);
          const password = Platform.OS === "web" ? localStorage.getItem(LEGACY_PASSWORD_KEY) : await SecureStore.getItemAsync(LEGACY_PASSWORD_KEY);
          if (legacy) {
            const parsed = JSON.parse(legacy) as { host?: string; port?: string };
            const migrated = { ...createEmptyProfile("zivpn-udp"), name: "Profil ZiVPN migré", host: parsed.host ?? "", port: parsed.port ?? "", password: password ?? "" };
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

  const syncNativeStatus = useCallback(() => {
    try {
      const native = getNativeVpn();
      const raw = native?.getStatus?.();
      if (typeof raw === "string" && ["connected", "connecting", "disconnected", "error"].includes(raw)) {
        setStatus((prev) => (prev !== raw ? (raw as TunnelStatus) : prev));
      }
    } catch {}
  }, []);

  // Resync du status natif au montage, à l'hydratation et au retour au premier plan.
  // Corrige le bug "VPN affiché déconnecté" alors que le service tourne encore :
  // les events natifs manqués pendant le background ne re-signalent pas l'état.
  useEffect(() => {
    syncNativeStatus();
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") syncNativeStatus();
    });
    return () => sub.remove();
  }, [syncNativeStatus]);

  useEffect(() => {
    if (hydrated) syncNativeStatus();
  }, [hydrated, syncNativeStatus]);

  const createProfile = useCallback((method: TunnelMethod) => createEmptyProfile(method), []);

  const saveProfile = useCallback(async (profile: VpnProfile) => {
    const normalizedProfile = withFixedZiVpnObfs(profile);
    const errors = validateProfile(normalizedProfile);
    if (Object.keys(errors).length > 0) {
      addLog("warning", "VALIDATION", `Le profil « ${profile.name || "sans nom"} » contient des champs invalides.`);
      return false;
    }
    const next = profiles.some((current) => current.id === profile.id)
      ? profiles.map((current) => current.id === normalizedProfile.id ? normalizedProfile : current)
      : [...profiles, normalizedProfile];
    try {
      await persistProfiles(next);
      setProfiles(next);
      addLog("info", "STORAGE", `Profil « ${normalizedProfile.name} » enregistré.`);
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
    const clone = withFixedZiVpnObfs({ ...source, id: createEmptyProfile(source.method).id, name: copyName });
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

  const importProfiles = useCallback(async (nextProfiles: VpnProfile[]) => {
    try {
      const unique = new Set<string>();
      const normalized = nextProfiles.map((profile) => {
        const fallback = createEmptyProfile(profile.method);
        const id = profile.id && !unique.has(profile.id) ? profile.id : fallback.id;
        unique.add(id);
        return withFixedZiVpnObfs({ ...fallback, ...profile, id, enabled: false });
      });
      const invalid = normalized.find((profile) => Object.keys(validateProfile(profile)).length > 0);
      if (invalid) {
        addLog("warning", "IMPORT", `Import refusé : le profil « ${invalid.name || "sans nom"} » est invalide.`);
        return false;
      }
      await persistProfiles(normalized);
      const importedIds = new Set(normalized.map((profile) => profile.id));
      await Promise.all(profiles.filter((profile) => !importedIds.has(profile.id)).map((profile) => removeSecret(profile.id)));
      setProfiles(normalized);
      addLog("connection", "IMPORT", `${normalized.length} profil(s) importé(s). Ils sont désactivés par sécurité.`);
      return true;
    } catch {
      addLog("error", "IMPORT", "Échec de l’importation des profils.");
      return false;
    }
  }, [addLog, persistProfiles, profiles]);

  const resetProfiles = useCallback(async () => {
    await Promise.all(profiles.map((profile) => removeSecret(profile.id)));
    await AsyncStorage.removeItem(PROFILES_KEY);
    setProfiles([]);
    addLog("connection", "STORAGE", "Configurations VPN réinitialisées sur cet appareil.");
  }, [addLog, profiles]);

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

  const setMethodEnabled = useCallback(async (method: TunnelMethod, enabled: boolean) => {
    const next = profiles.map((profile) => profile.method === method ? { ...profile, enabled } : profile);
    await persistProfiles(next);
    setProfiles(next);
    const count = next.filter((profile) => profile.method === method).length;
    addLog("info", "TUNNEL", `${count} profil(s) ${enabled ? "activé(s)" : "désactivé(s)"} pour la méthode ${method}.`);
  }, [addLog, persistProfiles, profiles]);

  const activeProfiles = useMemo(() => profiles.filter((profile) => profile.enabled), [profiles]);
  const primaryProfile = activeProfiles[0] ?? profiles[0] ?? null;

  const connect = useCallback(async () => {
    if (!settingsHydrated) {
      setLastError("Chargement des paramètres VPN en cours. Réessayez dans un instant.");
      addLog("warning", "SETTINGS", "Connexion différée pendant le chargement des paramètres.");
      return;
    }
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
      await native.startVpn(JSON.stringify({ profiles: activeProfiles, settings }));
      addLog("connection", "NATIVE", "Service VPN démarré ; initialisation et contrôle de santé des tunnels en cours.");
    } catch (error) {
      setLastError("Le service VPN Android n’a pas pu démarrer.");
      setStatus("error");
      addLog("error", "NATIVE", `Échec du démarrage natif : ${String(error).slice(0, 180)}`);
    }
  }, [activeProfiles, addLog, settings, settingsHydrated]);

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

  const value = useMemo(() => ({ profiles, activeProfiles, primaryProfile, status, logs, lastError, hydrated, createProfile, saveProfile, duplicateProfile, importProfiles, resetProfiles, deleteProfile, setProfileEnabled, setMethodEnabled, connect, disconnect, clearLogs: () => setLogs([]) }), [profiles, activeProfiles, primaryProfile, status, logs, lastError, hydrated, createProfile, saveProfile, duplicateProfile, importProfiles, resetProfiles, deleteProfile, setProfileEnabled, setMethodEnabled, connect, disconnect]);
  return <VpnContext.Provider value={value}>{children}</VpnContext.Provider>;
}

export function useVpn() {
  const value = useContext(VpnContext);
  if (!value) throw new Error("useVpn doit être utilisé dans VpnProvider");
  return value;
}
