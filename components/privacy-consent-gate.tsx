import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { type ComponentProps, type ReactNode, useEffect, useState } from "react";
import { ActivityIndicator, Alert, BackHandler, Image, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";
import { useLang } from "@/lib/i18n-provider";

const PRIVACY_POLICY_KEY = "kighmu.vpn.privacy-policy.v1";
const BRAND_LOGO = require("@/assets/images/icon.webp");

const SECTION_KEYS = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"] as const;

type SectionIcon = ComponentProps<typeof MaterialIcons>["name"];

const SECTION_ICONS: Record<(typeof SECTION_KEYS)[number], SectionIcon> = {
  s1: "gpp-good",
  s2: "storage",
  s3: "monitor-heart",
  s4: "router",
  s5: "swap-horiz",
  s6: "person-off",
  s7: "gavel",
  s8: "update",
};

export function PrivacyConsentGate({ children }: { children: ReactNode }) {
  const colors = useColors();
  const { t } = useLang();
  const [status, setStatus] = useState<"loading" | "pending" | "accepted" | "refused">("loading");

  useEffect(() => {
    AsyncStorage.getItem(PRIVACY_POLICY_KEY)
      .then((value) => setStatus(value === "accepted" ? "accepted" : "pending"))
      .catch(() => setStatus("pending"));
  }, []);

  const accept = async () => {
    await AsyncStorage.setItem(PRIVACY_POLICY_KEY, "accepted");
    setStatus("accepted");
  };

  const refuse = () => {
    setStatus("refused");
    if (Platform.OS === "android") {
      Alert.alert(t("privacy.refuseAlertTitle"), t("privacy.refuseAlertBody"), [
        { text: t("privacy.quit"), onPress: () => BackHandler.exitApp() },
      ]);
    }
  };

  if (status === "accepted") return <>{children}</>;
  if (status === "loading") {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }
  if (status === "refused") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.refusedBody}>
            <View style={[styles.refusedIcon, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
              <MaterialIcons name="lock-outline" size={32} color={colors.muted} />
            </View>
            <Text style={[styles.refusedTitle, { color: colors.foreground }]}>{t("privacy.requiredTitle")}</Text>
            <Text style={[styles.refusedText, { color: colors.muted }]}>{t("privacy.refusedBody")}</Text>
            <Pressable
              onPress={() => setStatus("pending")}
              style={({ pressed }) => [styles.returnButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}
            >
              <Text style={styles.returnButtonText}>{t("privacy.reread")}</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.topbar}>
          <View style={[styles.logo, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Image source={BRAND_LOGO} style={styles.logoImage} resizeMode="contain" />
          </View>
          <View style={styles.brandStack}>
            <Text style={[styles.brand, { color: colors.foreground }]}>KIGHMU VPN</Text>
            <Text style={[styles.brandTagline, { color: colors.muted }]}>{t("privacy.tagline")}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={[styles.title, { color: colors.foreground }]}>{t("privacy.heroTitle")}</Text>
          <Text style={[styles.intro, { color: colors.muted }]}>{t("privacy.intro")}</Text>

          <View style={[styles.policyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {SECTION_KEYS.map((section, index) => {
              const isLast = index === SECTION_KEYS.length - 1;
              return (
                <View key={section}>
                  <View style={styles.policySection}>
                    <View style={[styles.sectionIconWrap, { backgroundColor: colors.surfaceRaised }]}>
                      <MaterialIcons name={SECTION_ICONS[section]} size={18} color={colors.primary} />
                    </View>
                    <View style={styles.policySectionBody}>
                      <Text style={[styles.policyHeading, { color: colors.foreground }]}>{t(`privacy.${section}.title`)}</Text>
                      <Text style={[styles.policyText, { color: colors.muted }]}>{t(`privacy.${section}.body`)}</Text>
                    </View>
                  </View>
                  {!isLast ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
                </View>
              );
            })}

            <View style={[styles.policyNote, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
              <MaterialIcons name="info-outline" size={18} color={colors.primary} />
              <Text style={[styles.policyNoteText, { color: colors.muted }]}>{t("privacy.note")}</Text>
            </View>
          </View>
        </ScrollView>

        <View style={[styles.actions, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <View style={styles.actionsRow}>
            <Pressable
              onPress={refuse}
              style={({ pressed }) => [styles.refuseButton, { borderColor: colors.border }, pressed && styles.pressed]}
            >
              <Text style={[styles.refuseText, { color: colors.error }]}>{t("privacy.refuse")}</Text>
            </Pressable>
            <Pressable
              onPress={accept}
              style={({ pressed }) => [styles.acceptButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}
            >
              <Text style={styles.acceptText}>{t("privacy.accept")}</Text>
              <MaterialIcons name="arrow-forward" size={18} color="#FFFFFF" />
            </Pressable>
          </View>
          <Text style={[styles.reassurance, { color: colors.muted }]}>{t("privacy.reassurance")}</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { alignItems: "center", justifyContent: "center" },
  safe: { flex: 1 },
  topbar: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  logoImage: { width: 36, height: 36 },
  brandStack: { flex: 1 },
  brand: { fontSize: 17, fontWeight: "900", letterSpacing: 0.2 },
  brandTagline: { fontSize: 11, fontWeight: "700", marginTop: 2 },
  content: { paddingHorizontal: 22, paddingTop: 4, paddingBottom: 20 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: "900", letterSpacing: -0.4 },
  intro: { marginTop: 10, fontSize: 14, lineHeight: 20 },
  policyCard: { marginTop: 22, borderWidth: 1, borderRadius: 20, padding: 18, gap: 0 },
  policySection: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 14 },
  sectionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  policySectionBody: { flex: 1, gap: 6 },
  policyHeading: { fontSize: 14, lineHeight: 19, fontWeight: "900" },
  policyText: { fontSize: 13, lineHeight: 19 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 46 },
  policyNote: {
    marginTop: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 13,
    flexDirection: "row",
    gap: 9,
  },
  policyNoteText: { flex: 1, fontSize: 11, lineHeight: 16 },
  actions: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 18,
    gap: 8,
  },
  actionsRow: { flexDirection: "row", gap: 10 },
  refuseButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  refuseText: { fontSize: 14, fontWeight: "900" },
  acceptButton: {
    flex: 2,
    minHeight: 52,
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  acceptText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  reassurance: { fontSize: 11, lineHeight: 15, textAlign: "center" },
  refused: { flex: 1 },
  refusedBody: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 32 },
  refusedIcon: {
    width: 68,
    height: 68,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  refusedTitle: { marginTop: 20, fontSize: 22, fontWeight: "900" },
  refusedText: { marginTop: 10, textAlign: "center", fontSize: 14, lineHeight: 20 },
  returnButton: { marginTop: 24, minHeight: 50, borderRadius: 15, justifyContent: "center", paddingHorizontal: 18 },
  returnButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
});
