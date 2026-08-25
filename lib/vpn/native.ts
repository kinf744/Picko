import { Platform } from "react-native";

type NativeSubscription = { remove: () => void };
export type DeviceSecurityInfo = { hardwareId: string; mobileOperator: string; rooted: boolean };
export type TrafficTotals = { rx: number; tx: number };

type NativeVpnModule = {
  getStatus: () => string;
  prepareVpn: () => Promise<boolean>;
  startVpn: (configJson: string) => Promise<boolean>;
  stopVpn: () => Promise<boolean>;
  getDeviceSecurityInfo: () => Promise<DeviceSecurityInfo>;
  probeVpnExitIp?: () => Promise<string>;
  getTrafficTotals?: () => TrafficTotals;
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
