import { NativeModule, requireNativeModule } from "expo-modules-core";
import type { KighmuVpnNativeModuleEvents, NativeVpnStatus } from "./KighmuVpnNative.types";

declare class KighmuVpnNativeModule extends NativeModule<KighmuVpnNativeModuleEvents> {
  getStatus(): NativeVpnStatus;
  prepareVpn(): Promise<boolean>;
  startVpn(host: string, port: string, obfs: string, username: string, password: string): Promise<boolean>;
  stopVpn(): Promise<boolean>;
}

export default requireNativeModule<KighmuVpnNativeModule>("KighmuVpnNative");
