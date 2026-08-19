import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { AppHeader } from "@/components/kighmu-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { diagnosticTone, formatDiagnosticTime, isSshBanner } from "@/lib/vpn/diagnostic-format";
import { useVpn, type DiagnosticLog } from "@/lib/vpn/vpn-context";

function JournalLine({ log }: { log: DiagnosticLog }) {
  const colors = useColors();
  const tone = diagnosticTone(log.level);
  const lineColor = tone === "error" ? colors.error : tone === "warning" ? colors.warning : tone === "connection" ? colors.primary : colors.foreground;
  const banner = isSshBanner(log.component);
  return <View style={[styles.line, { borderBottomColor: colors.border }]}><Text style={[styles.lineText, { color: lineColor }]}><Text style={[styles.time, { color: colors.muted }]}>[{formatDiagnosticTime(log.timestamp)}] </Text>{banner ? "Message serveur SSH" : log.message}</Text>{banner ? <View style={[styles.banner, { borderColor: colors.primary, backgroundColor: colors.surfaceRaised }]}><View style={styles.bannerHead}><MaterialIcons name="dns" size={17} color={colors.primary} /><Text style={[styles.bannerTitle, { color: colors.foreground }]}>Bannière SSH reçue</Text></View><Text selectable style={[styles.bannerText, { color: colors.foreground }]}>{log.message || "Aucune bannière exploitable n’a été reçue."}</Text></View> : null}</View>;
}

export default function DiagnosticScreen() {
  const colors = useColors();
  const { logs, clearLogs } = useVpn();
  return <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right", "bottom"]}><FlatList data={logs} keyExtractor={(item) => item.id} renderItem={({ item }) => <JournalLine log={item} />} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} ListHeaderComponent={<><AppHeader /><View style={styles.heading}><View><Text style={[styles.title, { color: colors.foreground }]}>Journal de connexion</Text><Text style={[styles.subtitle, { color: colors.muted }]}>Étapes réelles du tunnel et messages SSH reçus.</Text></View><Pressable accessibilityLabel="Effacer le journal" onPress={clearLogs} style={({ pressed }) => [styles.clear, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && styles.pressed]}><MaterialIcons name="delete-outline" size={18} color={colors.error} /></Pressable></View></>} ListEmptyComponent={<View style={styles.empty}><MaterialIcons name="terminal" size={25} color={colors.primary} /><Text style={[styles.emptyTitle, { color: colors.foreground }]}>En attente d’une connexion</Text><Text style={[styles.emptyText, { color: colors.muted }]}>Les étapes réseau et SSH s’afficheront ici pendant la prochaine tentative.</Text></View>} /></ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 32 }, heading: { marginTop: 18, marginBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, title: { fontSize: 18, fontWeight: "900" }, subtitle: { marginTop: 5, fontSize: 12, lineHeight: 17 }, clear: { width: 42, height: 42, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center" }, line: { paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth }, lineText: { fontSize: 14, lineHeight: 21, fontWeight: "500" }, time: { fontVariant: ["tabular-nums"] }, banner: { marginTop: 9, borderLeftWidth: 3, borderRadius: 12, padding: 13 }, bannerHead: { flexDirection: "row", alignItems: "center", gap: 7 }, bannerTitle: { fontSize: 13, fontWeight: "900" }, bannerText: { marginTop: 9, fontSize: 14, lineHeight: 20, fontWeight: "700" }, empty: { paddingTop: 72, alignItems: "center" }, emptyTitle: { marginTop: 12, fontSize: 16, fontWeight: "900" }, emptyText: { marginTop: 7, maxWidth: 260, textAlign: "center", fontSize: 12, lineHeight: 18 }, pressed: { opacity: 0.76, transform: [{ scale: 0.985 }] },
});
