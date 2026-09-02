/**
 * Manus Runtime - Communication layer between Expo web app and parent container (next-agent-webapp)
 *
 * Simplified flow:
 * 1. initManusRuntime() called
 * 2. Send 'appDevServerReady' to parent to signal app is ready
 *
 * User will manually login via the app's login page - no automatic cookie injection.
 */

import { Platform } from "react-native";
import type { Metrics } from "react-native-safe-area-context";
import { secureLog } from "./log";

// Debug logging with timestamps
const DEBUG = false;
const log = (msg: string) => {
  if (!DEBUG) return;
  secureLog.dev(`[ManusRuntime ${new Date().toISOString()}] ${msg}`);
};

type MessageType = "appDevServerReady";
type SafeAreaInsets = { top: number; right: number; bottom: number; left: number };
type SafeAreaCallback = (metrics: Metrics) => void;

const TRUSTED_PARENT_ORIGINS: readonly string[] = [
  "https://manus.im",
  "https://www.manus.im",
  "https://manus.space",
  "https://www.manus.space",
  "http://localhost:3000",
];

function isTrustedOrigin(origin: string): boolean {
  return TRUSTED_PARENT_ORIGINS.includes(origin);
}

interface SpacePreviewerMessage {
  type: "SpacePreviewerChannel";
  payload: {
    type: string;
    from: "container" | "content";
    to: "container" | "content";
    payload: Record<string, unknown>;
  };
}

function isInIframe(): boolean {
  if (Platform.OS !== "web") return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function isWeb(): boolean {
  return Platform.OS === "web";
}

function sendToParent(type: MessageType, payload: Record<string, unknown> = {}): void {
  // NOTE: Validate parent origin if we need to transfer sensitive data
  if (!isWeb() || !isInIframe()) return;

  const parentOrigin = (() => {
    try {
      return new URL(document.referrer).origin;
    } catch {
      return "*";
    }
  })();

  const targetOrigin =
    parentOrigin !== "*" && isTrustedOrigin(parentOrigin) ? parentOrigin : "*";

  const message: SpacePreviewerMessage = {
    type: "SpacePreviewerChannel",
    payload: { type, from: "content", to: "container", payload },
  };
  window.parent.postMessage(message, targetOrigin);
  log(`Sent to parent: ${type} (origin=${targetOrigin})`);
}

let initialized = false;
let safeAreaCallback: SafeAreaCallback | null = null;

function isValidInsets(payload: Record<string, unknown>): payload is SafeAreaInsets {
  return (
    typeof payload.top === "number" &&
    typeof payload.bottom === "number" &&
    typeof payload.left === "number" &&
    typeof payload.right === "number"
  );
}

function handleMessage(event: MessageEvent<unknown>): void {
  if (!isTrustedOrigin(event.origin)) return;
  const data = event.data as SpacePreviewerMessage | undefined;
  if (!data || data.type !== "SpacePreviewerChannel") return;

  const { payload } = data;
  if (!payload || payload.to !== "content") return;

  if (payload.type === "setSafeAreaInsets" && isValidInsets(payload.payload) && safeAreaCallback) {
    const insets = payload.payload;
    const frame = { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
    safeAreaCallback({ insets, frame });
    log(
      `Received safe area insets from parent: top=${insets.top}, bottom=${insets.bottom}, left=${insets.left}, right=${insets.right}`,
    );
  }
}

/**
 * Subscribe to safe area updates from the parent container.
 */
export function subscribeSafeAreaInsets(callback: SafeAreaCallback): () => void {
  safeAreaCallback = callback;
  return () => {
    if (safeAreaCallback === callback) {
      safeAreaCallback = null;
    }
  };
}

/**
 * Initialize Manus Runtime - just notifies parent that app is ready
 */
export function initManusRuntime(): void {
  if (!isWeb() || !isInIframe()) return;
  if (initialized) return;
  initialized = true;

  log("initManusRuntime called");
  window.addEventListener("message", handleMessage);
  sendToParent("appDevServerReady", {});
}

/**
 * Check if running inside preview iframe
 */
export function isRunningInPreviewIframe(): boolean {
  return isWeb() && isInIframe();
}
