import { NativeModule, requireNativeModule } from "expo-modules-core";
import type { KighmuVpnNativeModuleEvents, NativeVpnStatus } from "./KighmuVpnNative.types";

declare class KighmuVpnNativeModule extends NativeModule<KighmuVpnNativeModuleEvents> {
  getStatus(): NativeVpnStatus;
  prepareVpn(): Promise<boolean>;
  startVpn(profilesJson: string): Promise<boolean>;
  stopVpn(): Promise<boolean>;
}

export default requireNativeModule<KighmuVpnNativeModule>("KighmuVpnNative");
