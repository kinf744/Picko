import { ThemedView } from "@/components/themed-view";
import * as Api from "@/lib/_core/api";
import * as Auth from "@/lib/_core/auth";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function OAuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    code?: string;
    state?: string;
    error?: string;
    sessionToken?: string;
    user?: string;
  }>();
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const complete = () => {
      setStatus("success");
      setTimeout(() => router.replace("/(tabs)"), 1000);
    };

    const storeDecodedUser = async (encodedUser?: string) => {
      if (!encodedUser) return;
      try {
        const userJson = typeof atob !== "undefined"
          ? atob(encodedUser)
          : Buffer.from(encodedUser, "base64").toString("utf-8");
        const userData = JSON.parse(userJson);
        await Auth.setUserInfo({
          id: userData.id,
          openId: userData.openId,
          name: userData.name,
          email: userData.email,
          loginMethod: userData.loginMethod,
          lastSignedIn: new Date(userData.lastSignedIn || Date.now()),
        });
      } catch {
        // Optional user metadata must not reveal OAuth payloads in runtime logs.
      }
    };

    const handleCallback = async () => {
      try {
        if (params.sessionToken) {
          await Auth.setSessionToken(params.sessionToken);
          await storeDecodedUser(params.user);
          complete();
          return;
        }

        let url: string | null = null;
        if (params.code || params.state || params.error) {
          const urlParams = new URLSearchParams();
          if (params.code) urlParams.set("code", params.code);
          if (params.state) urlParams.set("state", params.state);
          if (params.error) urlParams.set("error", params.error);
          url = `?${urlParams.toString()}`;
        } else {
          url = await Linking.getInitialURL();
        }

        const oauthError = params.error || (url ? new URL(url, "http://dummy").searchParams.get("error") : null);
        if (oauthError) {
          setStatus("error");
          setErrorMessage(oauthError);
          return;
        }

        let code = params.code ?? null;
        let state = params.state ?? null;
        let sessionToken: string | null = null;

        if ((!code || !state) && url) {
          try {
            const urlObj = new URL(url);
            code = urlObj.searchParams.get("code");
            state = urlObj.searchParams.get("state");
            sessionToken = urlObj.searchParams.get("sessionToken");
          } catch {
            const match = url.match(/[?&](code|state|sessionToken)=([^&]+)/g);
            match?.forEach((param) => {
              const [key, value] = param.substring(1).split("=");
              if (key === "code") code = decodeURIComponent(value);
              if (key === "state") state = decodeURIComponent(value);
              if (key === "sessionToken") sessionToken = decodeURIComponent(value);
            });
          }
        }

        if (sessionToken) {
          await Auth.setSessionToken(sessionToken);
          complete();
          return;
        }

        if (!code || !state) {
          setStatus("error");
          setErrorMessage("Missing code or state parameter");
          return;
        }

        const result = await Api.exchangeOAuthCode(code, state);
        if (!result.sessionToken) {
          setStatus("error");
          setErrorMessage("No session token received");
          return;
        }

        await Auth.setSessionToken(result.sessionToken);
        if (result.user) {
          await Auth.setUserInfo({
            id: result.user.id,
            openId: result.user.openId,
            name: result.user.name,
            email: result.user.email,
            loginMethod: result.user.loginMethod,
            lastSignedIn: new Date(result.user.lastSignedIn || Date.now()),
          });
        }
        complete();
      } catch (error) {
        setStatus("error");
        setErrorMessage(error instanceof Error ? error.message : "Failed to complete authentication");
      }
    };

    void handleCallback();
  }, [params.code, params.state, params.error, params.sessionToken, params.user, router]);

  return (
    <SafeAreaView className="flex-1" edges={["top", "bottom", "left", "right"]}>
      <ThemedView className="flex-1 items-center justify-center gap-4 p-5">
        {status === "processing" && (
          <>
            <ActivityIndicator size="large" />
            <Text className="mt-4 text-base leading-6 text-center text-foreground">Completing authentication...</Text>
          </>
        )}
        {status === "success" && (
          <>
            <Text className="text-base leading-6 text-center text-foreground">Authentication successful!</Text>
            <Text className="text-base leading-6 text-center text-foreground">Redirecting...</Text>
          </>
        )}
        {status === "error" && (
          <>
            <Text className="mb-2 text-xl font-bold leading-7 text-error">Authentication failed</Text>
            <Text className="text-base leading-6 text-center text-foreground">{errorMessage}</Text>
          </>
        )}
      </ThemedView>
    </SafeAreaView>
  );
}
