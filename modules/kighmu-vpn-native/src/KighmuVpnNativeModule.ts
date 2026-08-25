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
}

export default requireNativeModule<KighmuVpnNativeModule>("KighmuVpnNative");
