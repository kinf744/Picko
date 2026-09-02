import { Platform } from "react-native";

type NativeSubscription = { remove: () => void };
export type DeviceSecurityInfo = { hardwareId: string; mobileOperator: string; rooted: boolean; tamperRisk?: boolean };
export type TrafficTotals = { rx: number; tx: number };

type NativeVpnModule = {
  getStatus: () => string;
  prepareVpn: () => Promise<boolean>;
  startVpn: (configJson: string) => Promise<boolean>;
  stopVpn: () => Promise<boolean>;
  getDeviceSecurityInfo: () => Promise<DeviceSecurityInfo>;
  probeVpnExitIp?: () => Promise<string>;
  getTrafficTotals?: () => TrafficTotals;
  setLanShareMode?: (direct: boolean) => boolean;
  isVpnActive?: () => boolean;
  probeDirectExitIp?: () => Promise<string>;
  startWifiDirect?: () => Promise<{ ok: boolean }>;
  stopWifiDirect?: () => Promise<boolean>;
  getWifiDirectInfo?: () => Promise<{ active: boolean; ssid: string; passphrase: string; ip: string }>;
  startLanShare?: (preferredPort: number) => Promise<{ port: number; running: boolean }>;
  stopLanShare?: () => Promise<boolean>;
  getLanShareStatus?: () => Promise<{ running: boolean; port: number; balancerPort: number }>;
  getPhoneLanIps?: () => { ips: string[] };
  addListener?: (event: "onLog" | "onStateChanged", listener: (payload: any) => void) => NativeSubscription;
};

let cached: NativeVpnModule | null | undefined;

export function getNativeVpn(): NativeVpnModule | null {
  if (cached !== undefined) return cached;
  if (Platform.OS !== "android") {
    cached = null;
    return cached;
  }
  try {
    cached = require("../../modules/kighmu-vpn-native/src/KighmuVpnNativeModule").default as NativeVpnModule;
  } catch {
    cached = null;
  }
  return cached;
}

export function subscribeNativeVpn(onLog: (payload: { level: string; component: string; message: string; timestamp: string }) => void, onStateChanged: (payload: { status: string }) => void) {
  const native = getNativeVpn();
  if (!native?.addListener) return () => undefined;
  const logSubscription = native.addListener("onLog", onLog);
  const stateSubscription = native.addListener("onStateChanged", onStateChanged);
  return () => {
    logSubscription?.remove();
    stateSubscription?.remove();
  };
}

// --- Hotspot Share (100 % sans root) ---------------------------------------

/** IP publique vue par le tunnel (via SOCKS local) — "" si tunnel inactif. */
export async function probeVpnExitIp(): Promise<string> {
  const native = getNativeVpn();
  if (!native?.probeVpnExitIp) return "";
  try { return (await native.probeVpnExitIp()) || ""; } catch { return ""; }
}

/** Compteurs globaux de l'appareil (0 en preview/web). */
export function getTrafficTotals(): TrafficTotals {
  const native = getNativeVpn();
  if (!native?.getTrafficTotals) return { rx: 0, tx: 0 };
  try { return native.getTrafficTotals(); } catch { return { rx: 0, tx: 0 }; }
}

// --- Source du partage : tunnels KIGHMU ou routage système (VPN tiers) ------

/** true = la passerelle sort en direct (VPN tiers / Internet) ; false = via nos tunnels. */
export function setLanShareMode(direct: boolean): boolean {
  const native = getNativeVpn();
  if (!native?.setLanShareMode) return false;
  try { return native.setLanShareMode(direct) === true; } catch { return false; }
}

/** Un réseau VPN est-il actif sur l'appareil (le nôtre ou un tiers) ? */
export function isVpnActive(): boolean {
  const native = getNativeVpn();
  if (!native?.isVpnActive) return false;
  try { return native.isVpnActive() === true; } catch { return false; }
}

/** IP publique vue par le routage système (suit le VPN tiers actif). */
export async function probeDirectExitIp(): Promise<string> {
  const native = getNativeVpn();
  if (!native?.probeDirectExitIp) return "";
  try { return (await native.probeDirectExitIp()) || ""; } catch { return ""; }
}

// --- Wi-Fi Direct (réseau créé par l'app, technique PdaNet) -----------------

export type WifiDirectInfo = { active: boolean; ssid: string; passphrase: string; ip: string };

/** Crée le groupe Wi-Fi Direct (réseau DIRECT-xx, IP fixe du téléphone). */
export async function startWifiDirect(): Promise<WifiDirectInfo | null> {
  const native = getNativeVpn();
  if (!native?.startWifiDirect) return null;
  try { return { ...(await native.startWifiDirect()), active: true, ssid: "", passphrase: "", ip: "" } as WifiDirectInfo; } catch { return null; }
}

export async function stopWifiDirect(): Promise<boolean> {
  const native = getNativeVpn();
  if (!native?.stopWifiDirect) return false;
  try { return (await native.stopWifiDirect()) === true; } catch { return false; }
}

export async function getWifiDirectInfo(): Promise<WifiDirectInfo | null> {
  const native = getNativeVpn();
  if (!native?.getWifiDirectInfo) return null;
  try { return await native.getWifiDirectInfo(); } catch { return null; }
}

/** Démarre la passerelle proxy LAN (HTTP + SOCKS5 sur un seul port). */
export async function startLanShare(preferredPort: number): Promise<{ port: number; running: boolean } | null> {
  const native = getNativeVpn();
  if (!native?.startLanShare) return null;
  try { return await native.startLanShare(preferredPort); } catch { return null; }
}

export async function stopLanShare(): Promise<boolean> {
  const native = getNativeVpn();
  if (!native?.stopLanShare) return false;
  try { return await native.stopLanShare(); } catch { return false; }
}

export async function getLanShareStatus(): Promise<{ running: boolean; port: number; supported: boolean }> {
  const native = getNativeVpn();
  if (!native?.getLanShareStatus) return { running: false, port: -1, supported: false };
  try {
    const status = await native.getLanShareStatus();
    return { ...status, supported: true };
  } catch { return { running: false, port: -1, supported: true }; }
}

/** IPv4 site-local du téléphone visibles par les clients du hotspot. */
export function getPhoneLanIps(): string[] {
  const native = getNativeVpn();
  if (!native?.getPhoneLanIps) return [];
  try { return native.getPhoneLanIps().ips.filter(Boolean); } catch { return []; }
}
