import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";
import { useLang } from "@/lib/i18n-provider";

/** Menu ouvert par l'icône engrenage : deux destinations distinctes. */
export function SettingsMenu() {
  const colors = useColors();
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const goTo = (path: "/settings" | "/hotspot") => {
    close();
    router.push(path);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("menu.triggerA11y")}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.headerButton, { backgroundColor: colors.surfaceRaised }, pressed && styles.pressed]}
      >
        <MaterialIcons name="settings" size={19} color={colors.foreground} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} />
          <View style={[styles.menu, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.foreground }]}>{t("smenu.title")}</Text>
              <Pressable onPress={close} style={({ pressed }) => [styles.close, { backgroundColor: colors.surfaceRaised }, pressed && styles.pressed]}>
                <MaterialIcons name="close" size={19} color={colors.foreground} />
              </Pressable>
            </View>
            <MenuItem icon="tune" title={t("smenu.vpn.title")} text={t("smenu.vpn.text")} color={colors.primary} onPress={() => goTo("/settings")} />
            <MenuItem icon="wifi-tethering" title={t("smenu.hotspot.title")} text={t("smenu.hotspot.text")} color={colors.primary} onPress={() => goTo("/hotspot")} />
          </View>
        </View>
      </Modal>
    </>
  );
}

function MenuItem({ icon, title, text, color, onPress }: { icon: React.ComponentProps<typeof MaterialIcons>["name"]; title: string; text: string; color: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.item, { borderColor: colors.border }, pressed && styles.pressed]}>
      <View style={[styles.icon, { backgroundColor: `${color}18` }]}>
        <MaterialIcons name={icon} size={20} color={color} />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.itemTitle, { color }]}>{title}</Text>
        <Text style={[styles.itemText, { color: colors.muted }]}>{text}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={21} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerButton: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(4, 13, 24, 0.45)" },
  menu: { borderTopWidth: 1, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 30, gap: 10 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  title: { fontSize: 19, fontWeight: "900" },
  close: { width: 36, height: 36, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  item: { minHeight: 86, borderWidth: 1, borderRadius: 17, padding: 13, flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 42, height: 42, borderRadius: 14, justifyContent: "center", alignItems: "center" },
  copy: { flex: 1 },
  itemTitle: { fontSize: 14, fontWeight: "900" },
  itemText: { marginTop: 4, fontSize: 11, lineHeight: 16 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
});
