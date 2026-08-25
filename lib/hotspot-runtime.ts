import { getNativeVpn, type DeviceSecurityInfo } from "@/lib/vpn/native";

/** Aides écran Hotspot Share — 100 % sans root. */

export async function getDeviceSecurityInfo(): Promise<DeviceSecurityInfo | null> {
  const native = getNativeVpn();
  if (!native?.getDeviceSecurityInfo) return null;
  try { return await native.getDeviceSecurityInfo(); } catch { return null; }
}

/** IP publique vue PAR LE TUNNEL (HTTP via le SOCKS local du balancier) ; "" si tunnel inactif. */
export async function probeVpnExitIp(): Promise<string> {
  const native = getNativeVpn();
  if (!native?.probeVpnExitIp) return "";
  try { return (await native.probeVpnExitIp()) || ""; } catch { return ""; }
}

export function getTrafficTotals(): { rx: number; tx: number } {
  const native = getNativeVpn();
  if (!native?.getTrafficTotals) return { rx: 0, tx: 0 };
  try { return native.getTrafficTotals(); } catch { return { rx: 0, tx: 0 }; }
}
