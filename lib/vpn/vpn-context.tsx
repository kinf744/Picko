import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getNativeVpn, subscribeNativeVpn } from "./native";
import { buildConfigExport, parseConfigImport, type ConfigExport, type ImportResult } from "./config-transfer";
import { DEFAULT_EXPORT_RESTRICTIONS, normalizeExportRestrictions, type ExportRestrictions } from "./export-restrictions";
import {
  TUNNEL_CATALOG,
  TUNNEL_KINDS,
  cloneTunnelProfile,
  createProfile as makeProfile,
  defaultBalancer,
  omitSecrets,
  secretFields,
  withSecrets,
  type ProfileFieldErrors,
  type TunnelBalancer,
  type TunnelKind,
  type TunnelProfile,
} from "./tunnel-profiles";
import { validateTunnelProfile } from "./validation";

export type TunnelStatus = "disconnected" | "connecting" | "connected" | "error";
export type LogLevel = "info" | "connection" | "warning" | "error";
export type DiagnosticLog = { id: string; timestamp: string; level: LogLevel; component: string; message: string };
export type ProfilesByKind = Record<TunnelKind, TunnelProfile[]>;
export type BalancersByKind = Record<TunnelKind, TunnelBalancer>;

const LEGACY_CONFIG_KEY = "kighmu.vpn.config.v2";
const LEGACY_PASSWORD_KEY = "kighmu.vpn.zivpn.password.v1";
const LEGACY_SLOWDNS_PASSWORD_KEY = "kighmu.vpn.slowdns.ssh-password.v1";
const ACTIVE_TUNNEL_KEY = "kighmu.vpn.catalog.active.v1";
const REMOVED_V2RAY_DNS_PROFILE_KEY = "kighmu.vpn.v2ray-dns.profiles.v1";
const REMOVED_V2RAY_DNS_SECRET_KEY = "kighmu.vpn.v2ray-dns.secrets.v1";
const REMOVED_V2RAY_DNS_BALANCER_KEY = "kighmu.vpn.v2ray-dns.balancer.v1";
const ACTIVE_RESTRICTIONS_KEY = "kighmu.vpn.imported-restrictions.v1";
const profileStoreKey = (kind: TunnelKind) => `kighmu.vpn.${kind}.profiles.v1`;
const secretStoreKey = (kind: TunnelKind) => `kighmu.vpn.${kind}.secrets.v1`;
const balancerStoreKey = (kind: TunnelKind) => `kighmu.vpn.${kind}.balancer.v1`;

const emptyProfiles = (): ProfilesByKind => ({
  zivpn: [], slowdns: [], hysteria: [], "http-payload": [], "ssh-tls": [], "v2ray-slowdns": [], "xray-v2ray": [],
});
const emptyBalancers = (): BalancersByKind => ({
  zivpn: defaultBalancer(), slowdns: defaultBalancer(), hysteria: defaultBalancer(), "http-payload": defaultBalancer(), "ssh-tls": defaultBalancer(), "v2ray-slowdns": defaultBalancer(), "xray-v2ray": defaultBalancer(),
});
const redact = (value: string) => value ? "••••••" : "non défini";
const makeLog = (level: LogLevel, component: string, message: string): DiagnosticLog => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, timestamp: new Date().toISOString(), level, component, message });
const secretGet = (key: string) => Platform.OS === "web" ? Promise.resolve(localStorage.getItem(key)) : SecureStore.getItemAsync(key);
const secretSet = (key: string, value: string) => Platform.OS === "web" ? Promise.resolve(localStorage.setItem(key, value)) : SecureStore.setItemAsync(key, value);
const secretDelete = (key: string) => Platform.OS === "web" ? Promise.resolve(localStorage.removeItem(key)) : SecureStore.deleteItemAsync(key);

function extractSecrets(profile: TunnelProfile) {
  return Object.fromEntries(secretFields(profile).map((field) => [field, String((profile as Record<string, unknown>)[field] ?? "")]));
}

function normalizeProfiles(kind: TunnelKind, publicValue: string | null, secretValue: string | null): TunnelProfile[] {
  try {
    const publicProfiles = JSON.parse(publicValue ?? "[]") as TunnelProfile[];
    const secretMap = JSON.parse(secretValue ?? "{}") as Record<string, Record<string, string>>;
    return publicProfiles.filter((profile) => profile.kind === kind).map((profile) => {
      const hydrated = withSecrets(profile, secretMap[profile.id] ?? {}) as TunnelProfile & { obfs?: string; sshHost?: string; json?: string };
      if (hydrated.kind === "zivpn") {
        const { obfs: _legacyObfs, ...normalized } = hydrated;
        return normalized as TunnelProfile;
      }
      if (hydrated.kind === "slowdns") {
        const { sshHost: _legacySshHost, ...normalized } = hydrated;
        return normalized as TunnelProfile;
      }
      if (hydrated.kind === "v2ray-slowdns") {
        const { json: _legacyJson, ...normalized } = hydrated;
        return { ...normalized, inputMode: "link", link: hydrated.link ?? "" } as TunnelProfile;
      }
      return hydrated;
    });
  } catch { return []; }
}

type VpnContextValue = {
  activeKind: TunnelKind;
  profilesByKind: ProfilesByKind;
  balancersByKind: BalancersByKind;
  status: TunnelStatus;
  logs: DiagnosticLog[];
  lastError: string | null;
  hydrated: boolean;
  activeProfiles: TunnelProfile[];
  selectTunnel: (kind: TunnelKind) => void;
  createProfile: (kind?: TunnelKind) => TunnelProfile;
  cloneProfile: (profile: TunnelProfile) => Promise<void>;
  saveProfile: (profile: TunnelProfile) => Promise<{ ok: boolean; errors: ProfileFieldErrors }>;
  deleteProfile: (kind: TunnelKind, id: string) => Promise<void>;
  toggleProfileSelection: (kind: TunnelKind, id: string) => Promise<void>;
  setBalancer: (kind: TunnelKind, patch: Partial<TunnelBalancer>) => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  clearLogs: () => void;
  resetAllProfiles: () => Promise<void>;
  buildConfigExport: (kinds: TunnelKind[], includeSecrets?: boolean, restrictions?: ExportRestrictions) => ConfigExport;
  importConfig: (raw: string, mode: "append" | "replace-imported") => Promise<ImportResult>;
};
const VpnContext = createContext<VpnContextValue | null>(null);

export function VpnProvider({ children }: { children: React.ReactNode }) {
  const [activeKind, setActiveKind] = useState<TunnelKind>("zivpn");
  const [profilesByKind, setProfilesByKind] = useState<ProfilesByKind>(emptyProfiles);
  const [balancersByKind, setBalancersByKind] = useState<BalancersByKind>(emptyBalancers);
  const [activeRestrictions, setActiveRestrictions] = useState<ExportRestrictions>(DEFAULT_EXPORT_RESTRICTIONS);
  const [status, setStatus] = useState<TunnelStatus>("disconnected");
  const [logs, setLogs] = useState<DiagnosticLog[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const addLog = useCallback((level: LogLevel, component: string, message: string) => setLogs((current) => [makeLog(level, component, message), ...current].slice(0, 300)), []);

  const persistKind = useCallback(async (kind: TunnelKind, profiles: TunnelProfile[], balancer: TunnelBalancer) => {
    const secretMap = Object.fromEntries(profiles.map((profile) => [profile.id, extractSecrets(profile)]));
    await Promise.all([
      AsyncStorage.setItem(profileStoreKey(kind), JSON.stringify(profiles.map(omitSecrets))),
      secretSet(secretStoreKey(kind), JSON.stringify(secretMap)),
      AsyncStorage.setItem(balancerStoreKey(kind), JSON.stringify(balancer)),
    ]);
  }, []);

  const migrateLegacyProfile = useCallback(async () => {
    const [legacyConfig, password, sshPassword] = await Promise.all([
      AsyncStorage.getItem(LEGACY_CONFIG_KEY), secretGet(LEGACY_PASSWORD_KEY), secretGet(LEGACY_SLOWDNS_PASSWORD_KEY),
    ]);
    if (!legacyConfig) return null;
    try {
      const config = JSON.parse(legacyConfig) as Record<string, string>;
      if (config.mode === "slowdns") {
        return { ...makeProfile("slowdns"), name: "Profil SSH/SlowDNS migré", selected: true, dnsServer: config.slowDnsServer ?? "", dnsPort: config.slowDnsPort ?? "53", nameserver: config.slowDnsNameserver ?? "", publicKey: config.slowDnsPublicKey ?? "", sshUsername: config.slowDnsUsername ?? "", sshPassword: sshPassword ?? "" } as TunnelProfile;
      }
      return { ...makeProfile("zivpn"), name: "Profil UDP-ZIVPN migré", selected: true, host: config.host ?? "", port: config.port ?? "", password: password ?? "" } as TunnelProfile;
    } catch { return null; }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [activeStored, storedRestrictions] = await Promise.all([AsyncStorage.getItem(ACTIVE_TUNNEL_KEY), AsyncStorage.getItem(ACTIVE_RESTRICTIONS_KEY)]);
        if (activeStored === "v2ray-dns") {
          await AsyncStorage.setItem(ACTIVE_TUNNEL_KEY, "zivpn");
        }
        await Promise.all([
          AsyncStorage.removeItem(REMOVED_V2RAY_DNS_PROFILE_KEY),
          secretDelete(REMOVED_V2RAY_DNS_SECRET_KEY),
          AsyncStorage.removeItem(REMOVED_V2RAY_DNS_BALANCER_KEY),
        ]);
        const loaded = emptyProfiles();
        const loadedBalancers = emptyBalancers();
        await Promise.all(TUNNEL_KINDS.map(async (kind) => {
          const [publicProfiles, secretProfiles, savedBalancer] = await Promise.all([AsyncStorage.getItem(profileStoreKey(kind)), secretGet(secretStoreKey(kind)), AsyncStorage.getItem(balancerStoreKey(kind))]);
          loaded[kind] = normalizeProfiles(kind, publicProfiles, secretProfiles);
          try { if (savedBalancer) loadedBalancers[kind] = { ...defaultBalancer(), ...JSON.parse(savedBalancer) }; } catch { /* garde les valeurs sûres */ }
        }));
        if (loaded.zivpn.length === 0 && loaded.slowdns.length === 0) {
          const migrated = await migrateLegacyProfile();
          if (migrated) {
            loaded[migrated.kind] = [migrated];
            await persistKind(migrated.kind, [migrated], loadedBalancers[migrated.kind]);
          }
        }
        if (!mounted) return;
        setProfilesByKind(loaded);
        setBalancersByKind(loadedBalancers);
        setActiveRestrictions(normalizeExportRestrictions(storedRestrictions ? JSON.parse(storedRestrictions) : null));
        if (activeStored && TUNNEL_KINDS.includes(activeStored as TunnelKind)) setActiveKind(activeStored as TunnelKind);
        addLog("info", "STORAGE", "Collections de profils isolées chargées ; les secrets restent masqués.");
      } catch {
        if (mounted) addLog("warning", "STORAGE", "Une collection de profils n’a pas pu être chargée.");
      } finally { if (mounted) setHydrated(true); }
    })();
    return () => { mounted = false; };
  }, [addLog, migrateLegacyProfile, persistKind]);

  useEffect(() => subscribeNativeVpn(
    (payload) => {
      const level = payload.level === "error" || payload.level === "warning" || payload.level === "connection" ? payload.level : "info";
      setLogs((current) => [{ id: `${Date.now()}-native`, timestamp: new Date(Number(payload.timestamp) || Date.now()).toISOString(), level, component: payload.component || "NATIVE", message: payload.message } as DiagnosticLog, ...current].slice(0, 300));
    },
    (payload) => { if (["connected", "connecting", "disconnected", "error"].includes(payload.status)) setStatus(payload.status as TunnelStatus); },
  ), []);

  const selectTunnel = useCallback((kind: TunnelKind) => {
    setActiveKind(kind);
    AsyncStorage.setItem(ACTIVE_TUNNEL_KEY, kind).catch(() => undefined);
    addLog("info", "CATALOG", `Tunnel actif sélectionné : ${TUNNEL_CATALOG[kind].label}.`);
  }, [addLog]);

  const createProfile = useCallback((kind = activeKind) => makeProfile(kind), [activeKind]);

  const cloneProfile = useCallback(async (profile: TunnelProfile) => {
    if (activeRestrictions.lockConfiguration) { addLog("warning", "POLITIQUE", "Clonage refusé : configuration verrouillée."); return; }
    const cloned = cloneTunnelProfile(profile);
    const next = [...profilesByKind[profile.kind], cloned];
    await persistKind(profile.kind, next, balancersByKind[profile.kind]);
    setProfilesByKind((current) => ({ ...current, [profile.kind]: next }));
    addLog("info", "STORAGE", `Profil ${TUNNEL_CATALOG[profile.kind].shortLabel} cloné localement.`);
  }, [activeRestrictions.lockConfiguration, addLog, balancersByKind, persistKind, profilesByKind]);

  const saveProfile = useCallback(async (profile: TunnelProfile) => {
    if (activeRestrictions.lockConfiguration) return { ok: false, errors: { storage: "Cette configuration importée est verrouillée." } };
    const errors = validateTunnelProfile(profile);
    if (Object.keys(errors).length > 0) {
      addLog("warning", "VALIDATION", `Profil ${TUNNEL_CATALOG[profile.kind].shortLabel} non enregistré : champs invalides.`);
      return { ok: false, errors };
    }
    const nextProfile = { ...profile, updatedAt: Date.now() } as TunnelProfile;
    const next = profilesByKind[nextProfile.kind].some((item) => item.id === nextProfile.id)
      ? profilesByKind[nextProfile.kind].map((item) => item.id === nextProfile.id ? nextProfile : item)
      : [...profilesByKind[nextProfile.kind], nextProfile];
    try {
      await persistKind(nextProfile.kind, next, balancersByKind[nextProfile.kind]);
      setProfilesByKind((current) => ({ ...current, [nextProfile.kind]: next }));
      addLog("info", "STORAGE", `Profil ${TUNNEL_CATALOG[nextProfile.kind].shortLabel} enregistré ; secrets=${redact(Object.values(extractSecrets(nextProfile)).filter(Boolean).join(""))}.`);
      return { ok: true, errors: {} };
    } catch {
      addLog("error", "STORAGE", "Échec d’enregistrement du profil sécurisé.");
      return { ok: false, errors: { storage: "Le profil n’a pas pu être enregistré." } };
    }
  }, [activeRestrictions.lockConfiguration, addLog, balancersByKind, persistKind, profilesByKind]);

  const deleteProfile = useCallback(async (kind: TunnelKind, id: string) => {
    if (activeRestrictions.lockConfiguration) { addLog("warning", "POLITIQUE", "Suppression refusée : configuration verrouillée."); return; }
    const next = profilesByKind[kind].filter((profile) => profile.id !== id);
    await persistKind(kind, next, balancersByKind[kind]);
    setProfilesByKind((current) => ({ ...current, [kind]: next }));
    addLog("info", "STORAGE", `Profil ${TUNNEL_CATALOG[kind].shortLabel} supprimé.`);
  }, [activeRestrictions.lockConfiguration, addLog, balancersByKind, persistKind, profilesByKind]);

  const toggleProfileSelection = useCallback(async (kind: TunnelKind, id: string) => {
    if (activeRestrictions.lockConfiguration) { addLog("warning", "POLITIQUE", "Modification refusée : configuration verrouillée."); return; }
    const next = profilesByKind[kind].map((profile) => profile.id === id ? { ...profile, selected: !profile.selected, updatedAt: Date.now() } as TunnelProfile : profile);
    await persistKind(kind, next, balancersByKind[kind]);
    setProfilesByKind((current) => ({ ...current, [kind]: next }));
  }, [activeRestrictions.lockConfiguration, addLog, balancersByKind, persistKind, profilesByKind]);

  const setBalancer = useCallback(async (kind: TunnelKind, patch: Partial<TunnelBalancer>) => {
    const next = { ...balancersByKind[kind], ...patch };
    await persistKind(kind, profilesByKind[kind], next);
    setBalancersByKind((current) => ({ ...current, [kind]: next }));
    addLog("info", "BALANCER", `${TUNNEL_CATALOG[kind].shortLabel} : balancier ${next.enabled ? "activé" : "désactivé"}.`);
  }, [addLog, balancersByKind, persistKind, profilesByKind]);

  const activeProfiles = profilesByKind[activeKind].filter((profile) => profile.selected);
  const connect = useCallback(async () => {
    const selected = profilesByKind[activeKind].filter((profile) => profile.selected);
    if (selected.length === 0) {
      setLastError("Sélectionnez au moins un profil pour le tunnel choisi.");
      setStatus("error");
      addLog("error", "VALIDATION", "Connexion refusée : aucun profil sélectionné.");
      return;
    }
    const invalid = selected.map((profile) => ({ profile, errors: validateTunnelProfile(profile) })).find((item) => Object.keys(item.errors).length > 0);
    if (invalid) {
      setLastError(`Le profil « ${invalid.profile.name} » est incomplet.`);
      setStatus("error");
      addLog("error", "VALIDATION", `Connexion refusée : profil invalide pour ${TUNNEL_CATALOG[activeKind].shortLabel}.`);
      return;
    }
    const balancer = balancersByKind[activeKind];
    const shouldBalance = balancer.enabled && selected.length > 1;
    setLastError(null);
    setStatus("connecting");
    addLog("connection", "CATALOG", `${TUNNEL_CATALOG[activeKind].label} : ${selected.length} profil(s) sélectionné(s), balancier=${shouldBalance ? "actif" : "inactif"}.`);
    const native = getNativeVpn();
    if (!native) {
      setLastError("Le moteur natif Android n’est pas disponible dans ce preview.");
      setStatus("error");
      addLog("warning", "NATIVE", "La connexion réelle nécessite un build Android personnalisé.");
      return;
    }
    try {
      if (!await native.prepareVpn()) {
        setStatus("disconnected");
        setLastError("Autorisation VPN en attente ou refusée par Android.");
        addLog("warning", "ANDROID", "L’autorisation VPN doit être confirmée dans la fenêtre système.");
        return;
      }
      await native.startVpn(JSON.stringify({ version: 3, kind: activeKind, balancer: { ...balancer, enabled: shouldBalance }, restrictions: activeRestrictions, profiles: selected }));
      addLog("connection", "NATIVE", `Service Android démarré pour ${TUNNEL_CATALOG[activeKind].label}.`);
    } catch (error) {
      setLastError("Le service VPN Android n’a pas pu démarrer.");
      setStatus("error");
      addLog("error", "NATIVE", `Échec du démarrage natif : ${String(error).slice(0, 180)}`);
    }
  }, [activeKind, activeRestrictions, addLog, balancersByKind, profilesByKind]);

  const disconnect = useCallback(async () => {
    try { await getNativeVpn()?.stopVpn(); } catch (error) { addLog("warning", "NATIVE", `Arrêt natif signalé avec une erreur : ${String(error).slice(0, 160)}`); }
    setStatus("disconnected");
    setLastError(null);
    addLog("connection", "TUNNEL", "Déconnexion demandée.");
  }, [addLog]);

  const resetAllProfiles = useCallback(async () => {
    await Promise.all([...TUNNEL_KINDS.flatMap((kind) => [AsyncStorage.removeItem(profileStoreKey(kind)), AsyncStorage.removeItem(balancerStoreKey(kind)), secretDelete(secretStoreKey(kind))]), AsyncStorage.removeItem(ACTIVE_RESTRICTIONS_KEY)]);
    setProfilesByKind(emptyProfiles());
    setBalancersByKind(emptyBalancers());
    setActiveRestrictions(DEFAULT_EXPORT_RESTRICTIONS);
    addLog("info", "STORAGE", "Toutes les collections de profils et leurs secrets ont été réinitialisés.");
  }, [addLog]);

  const exportConfiguration = useCallback((kinds: TunnelKind[], includeSecrets = false, restrictions?: ExportRestrictions) => buildConfigExport(profilesByKind, balancersByKind, kinds, includeSecrets, restrictions), [balancersByKind, profilesByKind]);

  const importConfig = useCallback(async (raw: string, mode: "append" | "replace-imported") => {
    const parsed = parseConfigImport(raw);
    const nextProfiles = { ...profilesByKind };
    const nextBalancers = { ...balancersByKind };
    parsed.tunnels.forEach((tunnel) => {
      nextProfiles[tunnel.kind] = mode === "replace-imported" ? tunnel.profiles : [...nextProfiles[tunnel.kind], ...tunnel.profiles];
      nextBalancers[tunnel.kind] = tunnel.balancer;
    });
    await Promise.all(TUNNEL_KINDS.map((kind) => persistKind(kind, nextProfiles[kind], nextBalancers[kind])));
    await AsyncStorage.setItem(ACTIVE_RESTRICTIONS_KEY, JSON.stringify(parsed.restrictions));
    setProfilesByKind(nextProfiles);
    setBalancersByKind(nextBalancers);
    setActiveRestrictions(parsed.restrictions);
    if (parsed.importedKinds.length > 0) setActiveKind(parsed.importedKinds[0]);
    addLog("info", "IMPORT", `Configuration importée : ${parsed.importedProfiles} profil(s), ${parsed.importedKinds.length} famille(s), secrets=${parsed.containsSecrets ? "présents" : "absents"}.`);
    return parsed;
  }, [addLog, balancersByKind, persistKind, profilesByKind]);

  const value = useMemo(() => ({ activeKind, profilesByKind, balancersByKind, status, logs, lastError, hydrated, activeProfiles, selectTunnel, createProfile, cloneProfile, saveProfile, deleteProfile, toggleProfileSelection, setBalancer, connect, disconnect, clearLogs: () => setLogs([]), resetAllProfiles, buildConfigExport: exportConfiguration, importConfig }), [activeKind, profilesByKind, balancersByKind, status, logs, lastError, hydrated, activeProfiles, selectTunnel, createProfile, cloneProfile, saveProfile, deleteProfile, toggleProfileSelection, setBalancer, connect, disconnect, resetAllProfiles, exportConfiguration, importConfig]);
  return <VpnContext.Provider value={value}>{children}</VpnContext.Provider>;
}

export function useVpn() {
  const value = useContext(VpnContext);
  if (!value) throw new Error("useVpn doit être utilisé dans VpnProvider");
  return value;
}
