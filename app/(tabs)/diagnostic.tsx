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
  const pingMs = parsePingLatency(log.message);
  const isPing = log.component === "PING" && pingMs !== null;
  const pingColor = !isPing ? null : pingMs < 300 ? colors.success : pingMs < 800 ? colors.warning : colors.error;
  const lineColor = pingColor ?? (tone === "error" ? colors.error : tone === "warning" ? colors.warning : tone === "connection" ? colors.primary : tone === "success" ? colors.success : colors.foreground);
  // Option 1 minimaliste : pastille propre
  let indicator = "●";
  let indicatorColor: string = lineColor;
  const compUpper = log.component.trim().toUpperCase();
  if (serverMessage) {
    const isResponse = log.message.startsWith("Response:");
    indicator = isResponse ? "●" : "┆";
    indicatorColor = isResponse ? colors.primary : colors.warning;
  } else if (banner) {
    indicator = "●";
    indicatorColor = colors.primary;
  } else if (log.message === "Auth complete" || log.message === "Connected") {
    indicator = "✓";
    indicatorColor = colors.success;
  } else if (log.message.startsWith("DNS ")) {
    indicator = "·";
    indicatorColor = colors.muted;
  } else if (compUpper === "TUNNEL") {
    indicator = "■";
    indicatorColor = colors.muted;
  } else if (compUpper === "PING") {
    indicator = "·";
    indicatorColor = lineColor;
  }

  // Message serveur post-auth (banner SSH) : centralisé avec couleurs HTML
  if (serverMessage && !log.message.startsWith("Response:")) {
    const bodySegments = serverSegments.filter((s) => !s.text.includes("Server Message:"));
    return (
      <View style={[styles.line, { borderBottomColor: colors.border }]}>
        <Text style={[styles.lineText, { color: lineColor }]}>
          <Text style={[styles.time, { color: colors.muted }]}>[{formatDiagnosticTime(log.timestamp)}] </Text>
          <Text style={{ color: indicatorColor }}>{indicator}  </Text>
          <Text>Server Message:</Text>
        </Text>
        <View style={[styles.serverMessageCentered, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          <Text style={{ textAlign: "center" }}>
            {bodySegments.map((segment, index) => (
              <Text
                key={`${log.id}-${index}`}
                style={{
                  color: segment.color ?? colors.foreground,
                  fontWeight: segment.bold ? "800" : "500",
                  fontStyle: segment.italic ? "italic" : "normal",
                  textDecorationLine: segment.underline ? "underline" : "none",
                  textAlign: "center",
                }}
              >
                {segment.text}
              </Text>
            ))}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.line, { borderBottomColor: colors.border }]}>
      <Text style={[styles.lineText, { color: lineColor }]}>
        <Text style={[styles.time, { color: colors.muted }]}>[{formatDiagnosticTime(log.timestamp)}] </Text>
        <Text style={{ color: indicatorColor }}>{indicator}  </Text>
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
  // Les logs sont stockés du plus récent au plus ancien ; on affiche du plus ancien au plus récent pour un ordre chronologique
  const displayLogs = [...logs].reverse();
  return <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right", "bottom"]}><FlatList data={displayLogs} keyExtractor={(item) => item.id} renderItem={({ item }) => <JournalLine log={item} />} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} ListHeaderComponent={<><AppHeader /><View style={styles.heading}><View><Text style={[styles.title, { color: colors.foreground }]}>{t("diag.title")}</Text><Text style={[styles.subtitle, { color: colors.muted }]}>{t("diag.subtitle")}</Text></View><Pressable accessibilityLabel={t("diag.clearA11y")} onPress={clearLogs} style={({ pressed }) => [styles.clear, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && styles.pressed]}><MaterialIcons name="delete-outline" size={18} color={colors.error} /></Pressable></View></>} ListEmptyComponent={<View style={styles.empty}><MaterialIcons name="terminal" size={25} color={colors.primary} /><Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t("diag.emptyTitle")}</Text><Text style={[styles.emptyText, { color: colors.muted }]}>{t("diag.emptyText")}</Text></View>} /></ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 32 }, heading: { marginTop: 18, marginBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, title: { fontSize: 18, fontWeight: "900" }, subtitle: { marginTop: 5, fontSize: 12, lineHeight: 17 }, clear: { width: 42, height: 42, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center" }, line: { paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth }, lineText: { fontSize: 12, lineHeight: 18, fontWeight: "500" }, time: { fontVariant: ["tabular-nums"] }, banner: { marginTop: 9, borderLeftWidth: 3, borderRadius: 12, padding: 13 }, serverMessage: { marginTop: 9, borderLeftWidth: 3, borderRadius: 12, padding: 13 }, serverMessageCentered: { marginTop: 8, borderWidth: 1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, alignItems: "center" }, bannerHead: { flexDirection: "row", alignItems: "center", gap: 7 }, bannerTitle: { fontSize: 12, fontWeight: "900" }, bannerText: { marginTop: 8, fontSize: 12, lineHeight: 17, fontWeight: "700" }, serverMessageText: { marginTop: 9, fontSize: 13, lineHeight: 20, fontWeight: "500" }, empty: { paddingTop: 72, alignItems: "center" }, emptyTitle: { marginTop: 12, fontSize: 15, fontWeight: "900" }, emptyText: { marginTop: 7, maxWidth: 260, textAlign: "center", fontSize: 12, lineHeight: 18 }, pressed: { opacity: 0.76, transform: [{ scale: 0.985 }] },
});
