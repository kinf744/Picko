import { NativeModule, requireNativeModule } from "expo-modules-core";
import type { KighmuVpnNativeModuleEvents, NativeVpnStatus } from "./KighmuVpnNative.types";

declare class KighmuVpnNativeModule extends NativeModule<KighmuVpnNativeModuleEvents> {
  getStatus(): NativeVpnStatus;
  getHardwareId(): string;
  prepareVpn(): Promise<boolean>;
  startVpn(profilesJson: string): Promise<boolean>;
  stopVpn(): Promise<boolean>;
  probeVpnExitIp(): Promise<string>;
  getTrafficTotals(): { rx: number; tx: number };
  startWifiDirect(): Promise<{ ok: boolean }>;
  stopWifiDirect(): Promise<boolean>;
  getWifiDirectInfo(): Promise<{ active: boolean; ssid: string; passphrase: string; ip: string }>;
  startLanShare(preferredPort: number): Promise<{ port: number; running: boolean }>;
  stopLanShare(): Promise<boolean>;
  getLanShareStatus(): Promise<{ running: boolean; port: number; balancerPort: number }>;
  getPhoneLanIps(): { ips: string[] };
}

export default requireNativeModule<KighmuVpnNativeModule>("KighmuVpnNative");
