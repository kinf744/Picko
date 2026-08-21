import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { SESSION_TOKEN_KEY, USER_INFO_KEY } from "@/constants/oauth";

export type User = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  lastSignedIn: Date;
};

export async function getSessionToken(): Promise<string | null> {
  try {
    if (Platform.OS === "web") return null;
    return await SecureStore.getItemAsync(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setSessionToken(token: string): Promise<void> {
  if (Platform.OS === "web") return;
  await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
}

export async function removeSessionToken(): Promise<void> {
  try {
    if (Platform.OS === "web") return;
    await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
  } catch {
    // A failed cleanup must not expose authentication details in application logs.
  }
}

export async function getUserInfo(): Promise<User | null> {
  try {
    const info = Platform.OS === "web"
      ? window.localStorage.getItem(USER_INFO_KEY)
      : await SecureStore.getItemAsync(USER_INFO_KEY);
    return info ? JSON.parse(info) as User : null;
  } catch {
    return null;
  }
}

export async function setUserInfo(user: User): Promise<void> {
  try {
    const serialized = JSON.stringify(user);
    if (Platform.OS === "web") {
      window.localStorage.setItem(USER_INFO_KEY, serialized);
      return;
    }
    await SecureStore.setItemAsync(USER_INFO_KEY, serialized);
  } catch {
    // User metadata is optional for UI rendering; do not log personal data on failure.
  }
}

export async function clearUserInfo(): Promise<void> {
  try {
    if (Platform.OS === "web") {
      window.localStorage.removeItem(USER_INFO_KEY);
      return;
    }
    await SecureStore.deleteItemAsync(USER_INFO_KEY);
  } catch {
    // Best-effort removal without sensitive runtime logging.
  }
}
