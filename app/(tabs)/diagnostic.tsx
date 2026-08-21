import { useMemo, useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useVpn, type LogLevel } from "@/lib/vpn/vpn-context";

const filters: { key: "all" | LogLevel; label: string }[] = [
  { key: "all", label: "Tous" },
  { key: "error", label: "Erreurs" },
  { key: "warning", label: "Avertissements" },
  { key: "connection", label: "Connexion" },
];

const levelColor = (level: LogLevel, colors: ReturnType<typeof useColors>) => level === "error" ? colors.error : level === "warning" ? colors.warning : level === "connection" ? colors.primary : colors.success;

export default function DiagnosticScreen() {
  const colors = useColors();
  const { logs, clearLogs } = useVpn();
  const [filter, setFilter] = useState<"all" | LogLevel>("all");
  const visibleLogs = useMemo(() => filter === "all" ? logs : logs.filter((log) => log.level === filter), [filter, logs]);
  const report = logs.map((log) => `[${log.timestamp}] ${log.level.toUpperCase()} ${log.component}: ${log.message}`).join("\n") || "Aucun événement enregistré.";

  const shareReport = async () => {
    await Share.share({ title: "Diagnostic KIGHMU VPN", message: `Rapport KIGHMU VPN\n\n${report}` });
  };

  return <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right", "bottom"]} swipeTabs>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}><View><Text className="text-3xl font-bold text-foreground">Diagnostic</Text><Text className="mt-2 text-sm text-muted">Les secrets sont filtrés avant affichage et partage.</Text></View><Pressable onPress={shareReport} style={({ pressed }) => [styles.iconButton, { borderColor: colors.border }, pressed && styles.pressed]}><Text style={{ color: colors.primary, fontSize: 13, fontWeight: "700" }}>Partager</Text></Pressable></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{filters.map((item) => <Pressable key={item.key} onPress={() => setFilter(item.key)} style={[styles.filter, { backgroundColor: filter === item.key ? colors.primary : colors.surface, borderColor: filter === item.key ? colors.primary : colors.border }]}><Text style={{ color: filter === item.key ? "#FFFFFF" : colors.muted, fontSize: 12, fontWeight: "700" }}>{item.label}</Text></Pressable>)}</ScrollView>
      <View style={[styles.sessionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text className="text-xs font-semibold uppercase text-muted">Session actuelle</Text><Text className="mt-1 text-sm font-bold text-foreground">{logs.length} événement{logs.length > 1 ? "s" : ""}</Text><Text className="mt-1 text-xs text-muted">Journal local, limité aux 300 dernières entrées.</Text></View>
      <View style={styles.logList}>{visibleLogs.length === 0 ? <View style={[styles.empty, { borderColor: colors.border }]}><Text className="text-sm font-semibold text-foreground">Aucun événement dans ce filtre</Text><Text className="mt-1 text-xs text-muted">Les étapes du tunnel apparaîtront ici.</Text></View> : visibleLogs.map((log) => <View key={log.id} style={[styles.logCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.dot, { backgroundColor: levelColor(log.level, colors) }]} /><View style={styles.logBody}><View style={styles.logMeta}><Text className="text-xs font-bold text-foreground">{log.component}</Text><Text className="text-[10px] text-muted">{new Date(log.timestamp).toLocaleTimeString()}</Text></View><Text className="mt-1 text-xs leading-4 text-muted">{log.message}</Text></View></View>)}</View>
      <Pressable onPress={clearLogs} style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}><Text className="text-sm font-semibold text-error">Effacer le journal local</Text></Pressable>
    </ScrollView>
  </ScreenContainer>;
}

const styles = StyleSheet.create({ content: { paddingBottom: 28 }, header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }, iconButton: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }, filters: { gap: 8, paddingVertical: 20 }, filter: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9 }, sessionCard: { borderWidth: 1, borderRadius: 18, padding: 16 }, logList: { gap: 9, marginTop: 16 }, logCard: { borderWidth: 1, borderRadius: 16, padding: 13, flexDirection: "row" }, dot: { width: 8, height: 8, borderRadius: 8, marginTop: 4, marginRight: 10 }, logBody: { flex: 1 }, logMeta: { flexDirection: "row", justifyContent: "space-between" }, empty: { borderWidth: 1, borderRadius: 16, padding: 24, alignItems: "center" }, clearButton: { minHeight: 48, alignItems: "center", justifyContent: "center" }, pressed: { opacity: 0.72 } });
