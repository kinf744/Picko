import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";
import { useVpn } from "@/lib/vpn/vpn-context";

export function ConfigMenu() {
  const colors = useColors();
  const { resetAllProfiles } = useVpn();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const reset = () => Alert.alert("Réinitialiser tous les VPN ?", "Cette action supprime de cet appareil tous les profils, secrets et réglages de balancier. Elle ne peut pas être annulée.", [
    { text: "Annuler", style: "cancel" },
    { text: "Réinitialiser", style: "destructive", onPress: () => resetAllProfiles().catch(() => Alert.alert("Réinitialisation impossible", "Les données locales n’ont pas pu être effacées.")) },
  ]);
  const goTo = (path: "/config-import" | "/config-export") => { close(); router.push(path); };

  return <><Pressable accessibilityRole="button" accessibilityLabel="Options de configuration" onPress={() => setOpen(true)} style={({ pressed }) => [styles.trigger, { backgroundColor: colors.surfaceRaised }, pressed && styles.pressed]}><MaterialIcons name="more-vert" size={23} color={colors.foreground} /></Pressable><Modal visible={open} transparent animationType="fade" statusBarTranslucent onRequestClose={close}><View style={styles.overlay}><Pressable style={StyleSheet.absoluteFill} onPress={close} /><View style={[styles.menu, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={styles.header}><View><Text style={[styles.title, { color: colors.foreground }]}>Configuration</Text><Text style={[styles.subtitle, { color: colors.muted }]}>Gérez les fichiers et les données VPN locales.</Text></View><Pressable onPress={close} style={({ pressed }) => [styles.close, { backgroundColor: colors.surfaceRaised }, pressed && styles.pressed]}><MaterialIcons name="close" size={19} color={colors.foreground} /></Pressable></View><MenuItem icon="file-open" title="Importer une configuration" text="Ouvrir un fichier JSON KIGHMU VPN et examiner son contenu avant application." color={colors.primary} onPress={() => goTo("/config-import")} /><MenuItem icon="file-upload" title="Exporter une configuration" text="Choisir les familles, nommer le fichier et contrôler l’inclusion des secrets." color={colors.primary} onPress={() => goTo("/config-export")} /><MenuItem icon="restart-alt" title="Réinitialiser tous les VPN" text="Supprimer les profils, secrets et réglages locaux après confirmation." color={colors.error} onPress={() => { close(); reset(); }} /></View></View></Modal></>;
}

function MenuItem({ icon, title, text, color, onPress }: { icon: React.ComponentProps<typeof MaterialIcons>["name"]; title: string; text: string; color: string; onPress: () => void }) {
  const colors = useColors();
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.item, { borderColor: colors.border }, pressed && styles.pressed]}><View style={[styles.icon, { backgroundColor: `${color}18` }]}><MaterialIcons name={icon} size={20} color={color} /></View><View style={styles.copy}><Text style={[styles.itemTitle, { color }]}>{title}</Text><Text style={[styles.itemText, { color: colors.muted }]}>{text}</Text></View><MaterialIcons name="chevron-right" size={21} color={colors.muted} /></Pressable>;
}

const styles = StyleSheet.create({
  trigger: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(4, 13, 24, 0.45)" },
  menu: { borderTopWidth: 1, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 30, gap: 10 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 6 },
  title: { fontSize: 19, fontWeight: "900" },
  subtitle: { marginTop: 5, fontSize: 12, lineHeight: 17, maxWidth: 265 },
  close: { width: 36, height: 36, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  item: { minHeight: 86, borderWidth: 1, borderRadius: 17, padding: 13, flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 42, height: 42, borderRadius: 14, justifyContent: "center", alignItems: "center" },
  copy: { flex: 1 },
  itemTitle: { fontSize: 14, fontWeight: "900" },
  itemText: { marginTop: 4, fontSize: 11, lineHeight: 16 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
});
