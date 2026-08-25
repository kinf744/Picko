import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { type ReactNode, useEffect, useState } from "react";
import { Alert, BackHandler, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";
import { useLang } from "@/lib/i18n-provider";

const PRIVACY_POLICY_KEY = "kighmu.vpn.privacy-policy.v1";

const SECTION_KEYS = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"] as const;

export function PrivacyConsentGate({ children }: { children: ReactNode }) {
  const colors = useColors();
  const { t } = useLang();
  const [status, setStatus] = useState<"loading" | "pending" | "accepted" | "refused">("loading");

  useEffect(() => {
    AsyncStorage.getItem(PRIVACY_POLICY_KEY).then((value) => setStatus(value === "accepted" ? "accepted" : "pending")).catch(() => setStatus("pending"));
  }, []);

  const accept = async () => {
    await AsyncStorage.setItem(PRIVACY_POLICY_KEY, "accepted");
    setStatus("accepted");
  };

  const refuse = () => {
    setStatus("refused");
    if (Platform.OS === "android") {
      Alert.alert(t("privacy.refuseAlertTitle"), t("privacy.refuseAlertBody"), [{ text: t("privacy.quit"), onPress: () => BackHandler.exitApp() }]);
    }
  };

  if (status === "accepted") return <>{children}</>;
  if (status === "loading") return <View style={[styles.loading, { backgroundColor: colors.background }]} />;
  if (status === "refused") return <View style={[styles.refused, { backgroundColor: colors.background }]}><SafeAreaView style={styles.safe}><View style={styles.refusedBody}><View style={[styles.refusedIcon, { backgroundColor: colors.surfaceRaised }]}><MaterialIcons name="privacy-tip" size={28} color={colors.error} /></View><Text style={[styles.refusedTitle, { color: colors.foreground }]}>{t("privacy.requiredTitle")}</Text><Text style={[styles.refusedText, { color: colors.muted }]}>{t("privacy.refusedBody")}</Text><Pressable onPress={() => setStatus("pending")} style={({ pressed }) => [styles.returnButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}><Text style={styles.returnButtonText}>{t("privacy.reread")}</Text></Pressable></View></SafeAreaView></View>;

  return <View style={[styles.container, { backgroundColor: colors.background }]}><SafeAreaView style={styles.safe}><View style={styles.topbar}><View style={[styles.logo, { backgroundColor: colors.primary }]}><MaterialIcons name="shield" size={21} color="#FFFFFF" /></View><Text style={[styles.brand, { color: colors.foreground }]}>KIGHMU VPN</Text></View><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}><Text style={[styles.title, { color: colors.foreground }]}>{t("privacy.heroTitle")}</Text><Text style={[styles.intro, { color: colors.muted }]}>{t("privacy.intro")}</Text><View style={[styles.policyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>{SECTION_KEYS.map((section) => <View key={section} style={styles.policySection}><Text style={[styles.policyHeading, { color: colors.foreground }]}>{t(`privacy.${section}.title`)}</Text><Text style={[styles.policyText, { color: colors.muted }]}>{t(`privacy.${section}.body`)}</Text></View>)}<View style={[styles.policyNote, { backgroundColor: colors.surfaceRaised }]}><MaterialIcons name="info-outline" size={18} color={colors.primary} /><Text style={[styles.policyNoteText, { color: colors.muted }]}>{t("privacy.note")}</Text></View></View></ScrollView><View style={[styles.actions, { backgroundColor: colors.background, borderTopColor: colors.border }]}><Pressable onPress={refuse} style={({ pressed }) => [styles.refuseButton, { borderColor: colors.border }, pressed && styles.pressed]}><Text style={[styles.refuseText, { color: colors.error }]}>{t("privacy.refuse")}</Text></Pressable><Pressable onPress={accept} style={({ pressed }) => [styles.acceptButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}><Text style={styles.acceptText}>{t("privacy.accept")}</Text><MaterialIcons name="arrow-forward" size={18} color="#FFFFFF" /></Pressable></View></SafeAreaView></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1 },
  safe: { flex: 1 },
  topbar: { minHeight: 68, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, paddingHorizontal: 20 },
  logo: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  brand: { fontSize: 16, fontWeight: "900", letterSpacing: 0.2 },
  content: { paddingHorizontal: 20, paddingBottom: 18 },
  title: { fontSize: 26, lineHeight: 32, fontWeight: "900", letterSpacing: -0.45 },
  intro: { marginTop: 9, fontSize: 14, lineHeight: 20 },
  policyCard: { marginTop: 20, borderWidth: 1, borderRadius: 20, padding: 16, gap: 18 },
  policySection: { gap: 6 },
  policyHeading: { fontSize: 14, lineHeight: 19, fontWeight: "900" },
  policyText: { fontSize: 13, lineHeight: 19 },
  policyNote: { borderRadius: 14, padding: 13, flexDirection: "row", gap: 9 },
  policyNoteText: { flex: 1, fontSize: 11, lineHeight: 16 },
  actions: { borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: 10, padding: 14, paddingBottom: 16 },
  refuseButton: { flex: 0.78, minHeight: 52, borderRadius: 15, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  refuseText: { fontSize: 14, fontWeight: "900" },
  acceptButton: { flex: 1.7, minHeight: 52, borderRadius: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  acceptText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  refused: { flex: 1 },
  refusedBody: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 32 },
  refusedIcon: { width: 62, height: 62, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  refusedTitle: { marginTop: 18, fontSize: 22, fontWeight: "900" },
  refusedText: { marginTop: 9, textAlign: "center", fontSize: 14, lineHeight: 20 },
  returnButton: { marginTop: 22, minHeight: 50, borderRadius: 15, justifyContent: "center", paddingHorizontal: 18 },
  returnButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
});
