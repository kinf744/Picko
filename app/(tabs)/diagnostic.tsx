import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";

import { AppHeader, IconAction, Panel, SectionLabel, StatusPill } from "@/components/kighmu-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useVpn, type LogLevel } from "@/lib/vpn/vpn-context";

const filters: { key: "all" | LogLevel; label: string }[] = [
  { key: "all", label: "Tous" },
  { key: "error", label: "Erreurs" },
  { key: "warning", label: "Alertes" },
  { key: "connection", label: "Connexion" },
];

const levelLabel: Record<LogLevel, string> = { error: "Erreur", warning: "Alerte", connection: "Connexion", info: "Information" };

export default function DiagnosticScreen() {
  const colors = useColors();
  const { logs, clearLogs } = useVpn();
  const [filter, setFilter] = useState<"all" | LogLevel>("all");
  const visibleLogs = useMemo(() => filter === "all" ? logs : logs.filter((log) => log.level === filter), [filter, logs]);
  const report = logs.map((log) => `[${log.timestamp}] ${log.level.toUpperCase()} ${log.component}: ${log.message}`).join("\n") || "Aucun événement enregistré.";
  const errorCount = useMemo(() => logs.filter((log) => log.level === "error").length, [logs]);

  const shareReport = async () => { await Share.share({ title: "Diagnostic KIGHMU VPN", message: `Rapport KIGHMU VPN\n\n${report}` }); };

  return <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right", "bottom"]}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <AppHeader eyebrow="KIGHMU VPN" title="Diagnostic" subtitle="Les secrets sont exclus avant affichage et partage." action={<IconAction label="Partager" icon="share" onPress={shareReport} />} />
      <Panel raised style={styles.summaryPanel}><View style={styles.summaryTop}><View><Text style={[styles.summaryCount, { color: colors.foreground }]}>{logs.length}</Text><Text style={[styles.summaryCaption, { color: colors.muted }]}>événement{logs.length > 1 ? "s" : ""} dans la session locale</Text></View><StatusPill label={errorCount > 0 ? `${errorCount} erreur${errorCount > 1 ? "s" : ""}` : "Journal sain"} tone={errorCount > 0 ? "error" : "success"} /></View><View style={[styles.summaryFooter, { borderTopColor: colors.border }]}><MaterialIcons name="visibility-off" size={16} color={colors.success} /><Text style={[styles.summaryFooterText, { color: colors.muted }]}>Rapport limité aux 300 entrées et nettoyé des valeurs sensibles.</Text></View></Panel>
      <View><SectionLabel trailing={<Text style={[styles.filterHint, { color: colors.muted }]}>{visibleLogs.length} affiché{visibleLogs.length > 1 ? "s" : ""}</Text>}>Filtrer les événements</SectionLabel><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{filters.map((item) => <Pressable key={item.key} onPress={() => setFilter(item.key)} style={({ pressed }) => [styles.filter, { backgroundColor: filter === item.key ? colors.primary : colors.surface, borderColor: filter === item.key ? colors.primary : colors.border }, pressed && styles.pressed]}><Text style={[styles.filterText, { color: filter === item.key ? "#FFFFFF" : colors.foreground }]}>{item.label}</Text></Pressable>)}</ScrollView></View>
      <View><SectionLabel>Chronologie</SectionLabel>{visibleLogs.length === 0 ? <Panel style={styles.empty}><MaterialIcons name="fact-check" size={25} color={colors.primary} /><Text style={[styles.emptyTitle, { color: colors.foreground }]}>Aucun événement dans ce filtre</Text><Text style={[styles.emptyText, { color: colors.muted }]}>Les étapes du tunnel apparaîtront ici lors de la prochaine connexion.</Text></Panel> : <View style={styles.logList}>{visibleLogs.map((log) => <Panel key={log.id} style={styles.logCard}><View style={styles.logTop}><StatusPill label={levelLabel[log.level]} tone={log.level === "error" ? "error" : log.level === "warning" ? "warning" : log.level === "connection" ? "primary" : "success"} /><Text style={[styles.logTime, { color: colors.muted }]}>{new Date(log.timestamp).toLocaleTimeString()}</Text></View><Text style={[styles.logComponent, { color: colors.foreground }]}>{log.component}</Text><Text style={[styles.logMessage, { color: colors.muted }]}>{log.message}</Text></Panel>)}</View>}</View>
      <Pressable onPress={clearLogs} style={({ pressed }) => [styles.clearButton, { borderColor: colors.border }, pressed && styles.pressed]}><MaterialIcons name="delete-outline" size={18} color={colors.error} /><Text style={[styles.clearText, { color: colors.error }]}>Effacer le journal local</Text></Pressable>
    </ScrollView>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 32, gap: 20 },
  summaryPanel: { padding: 17 },
  summaryTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  summaryCount: { fontSize: 30, lineHeight: 34, fontWeight: "800", letterSpacing: -0.6 },
  summaryCaption: { marginTop: 3, fontSize: 12, lineHeight: 17 },
  summaryFooter: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, marginTop: 16, flexDirection: "row", alignItems: "center", gap: 8 },
  summaryFooterText: { flex: 1, fontSize: 11, lineHeight: 16 },
  filterHint: { fontSize: 11, fontWeight: "700" },
  filters: { gap: 8, paddingRight: 20 },
  filter: { minHeight: 40, borderWidth: 1, borderRadius: 13, justifyContent: "center", paddingHorizontal: 13 },
  filterText: { fontSize: 12, fontWeight: "800" },
  logList: { gap: 10 },
  logCard: { padding: 14 },
  logTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  logTime: { fontSize: 11, fontWeight: "700" },
  logComponent: { marginTop: 13, fontSize: 13, fontWeight: "800" },
  logMessage: { marginTop: 5, fontSize: 12, lineHeight: 18 },
  empty: { alignItems: "center", paddingVertical: 28 },
  emptyTitle: { marginTop: 11, fontSize: 15, fontWeight: "800" },
  emptyText: { marginTop: 6, maxWidth: 250, textAlign: "center", fontSize: 12, lineHeight: 18 },
  clearButton: { minHeight: 50, borderWidth: 1, borderRadius: 15, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 2 },
  clearText: { fontSize: 13, fontWeight: "800" },
  pressed: { opacity: 0.76, transform: [{ scale: 0.985 }] },
});
