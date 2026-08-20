import type { StyleProp, ViewStyle } from "react-native";

export type NativeVpnStatus = "disconnected" | "connecting" | "connected" | "error";

export type KighmuVpnNativeModuleEvents = {
  onStateChanged: (params: { status: NativeVpnStatus }) => void;
  onLog: (params: { level: string; component: string; message: string; timestamp: string }) => void;
  onChange: (params: ChangeEventPayload) => void;
};

export type ChangeEventPayload = {
  value: string;
};

export type KighmuVpnNativeViewProps = {
  url: string;
  onLoad: (event: { nativeEvent: { url: string } }) => void;
  style?: StyleProp<ViewStyle>;
};

export type KighmuVpnNativeModuleApi = {
  getStatus: () => NativeVpnStatus;
  prepareVpn: () => Promise<boolean>;
  startVpn: (profilesJson: string) => Promise<boolean>;
  stopVpn: () => Promise<boolean>;
};
