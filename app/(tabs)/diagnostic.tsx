import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { AppHeader } from "@/components/kighmu-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { diagnosticTone, formatDiagnosticTime, formatSshServerMessage, isSshBanner, isSshServerMessage, parsePingLatency } from "@/lib/vpn/diagnostic-format";
import { useVpn, type DiagnosticLog } from "@/lib/vpn/vpn-context";
import { useLang } from "@/lib/i18n-provider";

function JournalLine({ log }: { log: DiagnosticLog }) {
  const colors = useColors();
  const tone = diagnosticTone(log.level);
  const banner = isSshBanner(log.component);
  const serverMessage = isSshServerMessage(log.component);
  const serverSegments = serverMessage ? formatSshServerMessage(log.message) : [];
  // Couleur du ping : vert si <300ms, orange si 300-800ms, rouge si >=800ms.
  const pingMs = parsePingLatency(log.message);
  const isPing = log.component === "PING" && pingMs !== null;
  const pingColor = !isPing ? null : pingMs < 300 ? colors.success : pingMs < 800 ? colors.warning : colors.error;
  const lineColor = pingColor ?? (tone === "error" ? colors.error : tone === "warning" ? colors.warning : tone === "connection" ? colors.primary : tone === "success" ? colors.success : colors.foreground);
  return (
    <View style={[styles.line, { borderBottomColor: colors.border }]}>
      <Text style={[styles.lineText, { color: lineColor }]}>
        <Text style={[styles.time, { color: colors.muted }]}>[{formatDiagnosticTime(log.timestamp)}] </Text>
        {banner ? (
          <Text>{log.message}</Text>
        ) : serverMessage ? (
          serverSegments.map((segment, index) => (
            <Text key={`${log.id}-${index}`} style={{ color: segment.color ?? colors.foreground, fontWeight: segment.bold ? "800" : "500", fontStyle: segment.italic ? "italic" : "normal", textDecorationLine: segment.underline ? "underline" : "none" }}>{segment.text}</Text>
          ))
        ) : (
          <Text>{log.message}</Text>
        )}
      </Text>
    </View>
  );
}

export default function DiagnosticScreen() {
  const colors = useColors();
  const { t } = useLang();
  const { logs, clearLogs } = useVpn();
  return <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right", "bottom"]}><FlatList data={logs} keyExtractor={(item) => item.id} renderItem={({ item }) => <JournalLine log={item} />} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} ListHeaderComponent={<><AppHeader /><View style={styles.heading}><View><Text style={[styles.title, { color: colors.foreground }]}>{t("diag.title")}</Text><Text style={[styles.subtitle, { color: colors.muted }]}>{t("diag.subtitle")}</Text></View><Pressable accessibilityLabel={t("diag.clearA11y")} onPress={clearLogs} style={({ pressed }) => [styles.clear, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && styles.pressed]}><MaterialIcons name="delete-outline" size={18} color={colors.error} /></Pressable></View></>} ListEmptyComponent={<View style={styles.empty}><MaterialIcons name="terminal" size={25} color={colors.primary} /><Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t("diag.emptyTitle")}</Text><Text style={[styles.emptyText, { color: colors.muted }]}>{t("diag.emptyText")}</Text></View>} /></ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 32 }, heading: { marginTop: 18, marginBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, title: { fontSize: 18, fontWeight: "900" }, subtitle: { marginTop: 5, fontSize: 12, lineHeight: 17 }, clear: { width: 42, height: 42, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center" }, line: { paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth }, lineText: { fontSize: 12, lineHeight: 18, fontWeight: "500" }, time: { fontVariant: ["tabular-nums"] }, banner: { marginTop: 9, borderLeftWidth: 3, borderRadius: 12, padding: 13 }, serverMessage: { marginTop: 9, borderLeftWidth: 3, borderRadius: 12, padding: 13 }, bannerHead: { flexDirection: "row", alignItems: "center", gap: 7 }, bannerTitle: { fontSize: 12, fontWeight: "900" }, bannerText: { marginTop: 8, fontSize: 12, lineHeight: 17, fontWeight: "700" }, serverMessageText: { marginTop: 9, fontSize: 13, lineHeight: 20, fontWeight: "500" }, empty: { paddingTop: 72, alignItems: "center" }, emptyTitle: { marginTop: 12, fontSize: 15, fontWeight: "900" }, emptyText: { marginTop: 7, maxWidth: 260, textAlign: "center", fontSize: 12, lineHeight: 18 }, pressed: { opacity: 0.76, transform: [{ scale: 0.985 }] },
});
