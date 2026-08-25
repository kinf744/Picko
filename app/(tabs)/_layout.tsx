import { Tabs, usePathname, useRouter } from "expo-router";
import { BottomTabBar, type BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { View, Dimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useLang } from "@/lib/i18n-provider";

const TAB_ORDER = ["index", "configuration", "diagnostic"] as const;

function CustomTabBar(props: BottomTabBarProps) {
  const colors = useColors();
  const activeIndex = props.state.index;
  const width = Dimensions.get("window").width;
  const tabWidth = width / props.state.routes.length;

  return (
    <View style={{ position: "relative" }}>
      {/* Ligne horizontale 3px au-dessus de l'onglet actif */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: activeIndex * tabWidth,
          width: tabWidth,
          height: 3,
          backgroundColor: colors.primary,
          borderRadius: 2,
          zIndex: 10,
        }}
      />
      <BottomTabBar {...props} />
    </View>
  );
}

function SwipeWrapper({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const getIndex = () => {
    if (pathname.includes("configuration")) return 1;
    if (pathname.includes("diagnostic")) return 2;
    return 0;
  };

  const navigateTo = (index: number) => {
    const target = TAB_ORDER[index];
    // navigate (et non push) : bascule vers l'onglet sans empiler l'historique.
    // Évite que le bouton Retour Android reparcoure les onglets balayés un par un.
    if (target === "index") router.navigate("/(tabs)" as any);
    else router.navigate(`/(tabs)/${target}` as any);
  };

  // Toute la logique (lecture de pathname via getIndex + navigation router) doit tourner
  // sur le thread JS. Le callback .onEnd de RNGH est un worklet (thread UI) car Reanimated
  // est actif : y appeler getIndex()/router directement plante en build release.
  const handleSwipe = (dx: number) => {
    const idx = getIndex();
    if (dx < -50 && idx < TAB_ORDER.length - 1) {
      navigateTo(idx + 1);
    } else if (dx > 50 && idx > 0) {
      navigateTo(idx - 1);
    }
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-15, 15])
    .onEnd((e) => {
      runOnJS(handleSwipe)(e.translationX);
    });

  return (
    <GestureDetector gesture={pan}>
      <View style={{ flex: 1 }}>{children}</View>
    </GestureDetector>
  );
}

export default function TabLayout() {
  const colors = useColors();
  const { t } = useLang();

  return (
    <SwipeWrapper>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.tint,
          tabBarInactiveTintColor: colors.muted,
          headerShown: false,
          tabBarButton: HapticTab,
          tabBarLabelStyle: { fontSize: 11, fontWeight: "700", marginTop: 1 },
          tabBarItemStyle: { paddingTop: 3 },
          tabBarStyle: {
            // Couleur de la barre alignée sur le thème de l'app (bleu-gris en clair,
            // navy surélevé en sombre) au lieu du blanc par défaut de React Navigation.
            backgroundColor: colors.surfaceRaised,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            elevation: 0,
            shadowOpacity: 0,
          },
        }}
        tabBar={(props) => <CustomTabBar {...props} />}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t("tabs.tunnel"),
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
          }}
        />
        <Tabs.Screen
          name="configuration"
          options={{
            title: t("tabs.configuration"),
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="pencil" color={color} />,
          }}
        />
        <Tabs.Screen
          name="diagnostic"
          options={{
            title: t("tabs.diagnostic"),
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="doc.text" color={color} />,
          }}
        />
      </Tabs>
    </SwipeWrapper>
  );
}
