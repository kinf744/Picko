import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { type ReactNode, useEffect, useState } from "react";
import { Alert, BackHandler, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";

const PRIVACY_POLICY_KEY = "kighmu.vpn.privacy-policy.v1";

const sections = [
  ["1. Finalité de l’application", "KIGHMU VPN est un outil local de configuration et de contrôle de tunnels VPN. Il permet à l’utilisateur de créer des profils de connexion, de démarrer un service VPN Android et de consulter des diagnostics techniques liés à ces opérations."],
  ["2. Données de configuration", "Les profils, hôtes, ports, plages de ports, réglages de tunnel et préférences sont enregistrés localement sur l’appareil. Les mots de passe, clés, identifiants, valeurs Obfs et autres champs sensibles sont conservés dans le stockage sécurisé fourni par le système lorsque celui-ci est disponible."],
  ["3. Données de diagnostic", "Les journaux servent à expliquer les étapes de validation, de démarrage, de connexion et d’arrêt du tunnel. L’application filtre les valeurs sensibles avant l’affichage et avant le partage d’un rapport, mais l’utilisateur doit toujours vérifier le contenu d’un fichier ou d’un rapport avant de le transmettre."],
  ["4. Trafic réseau", "Lorsque vous activez un tunnel, le trafic configuré par le VPN est dirigé vers le ou les serveurs choisis dans vos profils. KIGHMU VPN ne choisit pas ces serveurs à votre place et ne garantit pas les pratiques de confidentialité, de sécurité ou de disponibilité de ces services tiers."],
  ["5. Import et export", "L’import lit des fichiers JSON KIGHMU VPN sélectionnés explicitement par l’utilisateur. L’export permet de choisir les familles de tunnel à inclure ; par défaut, les secrets sont exclus. L’option d’exporter des secrets exige un avertissement, car un fichier partagé peut divulguer vos accès."],
  ["6. Absence de compte et de collecte publicitaire", "La version actuelle ne demande pas de compte utilisateur, n’affiche pas de publicité et ne met pas en place de profilage commercial. Elle n’envoie pas automatiquement vos profils ou journaux à un service cloud de KIGHMU VPN."],
  ["7. Responsabilités de l’utilisateur", "Vous êtes responsable de la légalité de l’utilisation de vos accès VPN, des serveurs configurés et des fichiers que vous importez ou exportez. Vous devez protéger votre appareil, vos sauvegardes et toute configuration contenant des secrets."],
  ["8. Évolutions de la politique", "Cette politique est liée à la version actuelle de l’application et pourra être mise à jour lorsqu’une fonctionnalité modifie le traitement local ou le partage des données. Une nouvelle version de politique pourra alors demander une nouvelle acceptation avant l’accès aux fonctionnalités VPN."],
];

export function PrivacyConsentGate({ children }: { children: ReactNode }) {
  const colors = useColors();
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
      Alert.alert("Accès non autorisé", "L’acceptation de la politique de confidentialité est nécessaire pour utiliser KIGHMU VPN.", [{ text: "Quitter", onPress: () => BackHandler.exitApp() }]);
    }
  };

  if (status === "accepted") return <>{children}</>;
  if (status === "loading") return <View style={[styles.loading, { backgroundColor: colors.background }]} />;
  if (status === "refused") return <View style={[styles.refused, { backgroundColor: colors.background }]}><SafeAreaView style={styles.safe}><View style={styles.refusedBody}><View style={[styles.refusedIcon, { backgroundColor: colors.surfaceRaised }]}><MaterialIcons name="privacy-tip" size={28} color={colors.error} /></View><Text style={[styles.refusedTitle, { color: colors.foreground }]}>Consentement requis</Text><Text style={[styles.refusedText, { color: colors.muted }]}>Vous avez refusé la politique de confidentialité. L’application ne peut pas ouvrir les profils ni les fonctions VPN sans votre acceptation.</Text><Pressable onPress={() => setStatus("pending")} style={({ pressed }) => [styles.returnButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}><Text style={styles.returnButtonText}>Relire la politique</Text></Pressable></View></SafeAreaView></View>;

  return <View style={[styles.container, { backgroundColor: colors.background }]}><SafeAreaView style={styles.safe}><View style={styles.topbar}><View style={[styles.logo, { backgroundColor: colors.primary }]}><MaterialIcons name="shield" size={21} color="#FFFFFF" /></View><Text style={[styles.brand, { color: colors.foreground }]}>KIGHMU VPN</Text></View><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}><Text style={[styles.title, { color: colors.foreground }]}>Votre confidentialité, votre contrôle.</Text><Text style={[styles.intro, { color: colors.muted }]}>Avant d’utiliser les profils, l’import/export ou le service VPN, veuillez lire et accepter la présente politique de confidentialité.</Text><View style={[styles.policyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>{sections.map(([heading, body]) => <View key={heading} style={styles.policySection}><Text style={[styles.policyHeading, { color: colors.foreground }]}>{heading}</Text><Text style={[styles.policyText, { color: colors.muted }]}>{body}</Text></View>)}<View style={[styles.policyNote, { backgroundColor: colors.surfaceRaised }]}><MaterialIcons name="info-outline" size={18} color={colors.primary} /><Text style={[styles.policyNoteText, { color: colors.muted }]}>Document d’information applicatif : il ne remplace pas une consultation juridique adaptée à votre pays, à vos services VPN ou à vos obligations professionnelles.</Text></View></View></ScrollView><View style={[styles.actions, { backgroundColor: colors.background, borderTopColor: colors.border }]}><Pressable onPress={refuse} style={({ pressed }) => [styles.refuseButton, { borderColor: colors.border }, pressed && styles.pressed]}><Text style={[styles.refuseText, { color: colors.error }]}>Refuser</Text></Pressable><Pressable onPress={accept} style={({ pressed }) => [styles.acceptButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}><Text style={styles.acceptText}>Accepter et continuer</Text><MaterialIcons name="arrow-forward" size={18} color="#FFFFFF" /></Pressable></View></SafeAreaView></View>;
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
