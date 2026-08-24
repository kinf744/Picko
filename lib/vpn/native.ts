import { Platform } from "react-native";

type NativeSubscription = { remove: () => void };
type NativeVpnModule = {
  getStatus: () => string;
  getHardwareId?: () => string;
  prepareVpn: () => Promise<boolean>;
  startVpn: (profilesJson: string) => Promise<boolean>;
  stopVpn: () => Promise<boolean>;
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
