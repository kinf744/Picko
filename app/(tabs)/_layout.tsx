import { Tabs, usePathname, useRouter } from "expo-router";
import { BottomTabBar, type BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { View, Dimensions, PanResponder } from "react-native";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

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
    if (target === "index") router.push("/(tabs)" as any);
    else router.push(`/(tabs)/${target}` as any);
  };

  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 20 && Math.abs(gs.dy) < 15,
    onPanResponderRelease: (_, gs) => {
      const idx = getIndex();
      if (gs.dx < -50 && idx < TAB_ORDER.length - 1) {
        navigateTo(idx + 1);
      } else if (gs.dx > 50 && idx > 0) {
        navigateTo(idx - 1);
      }
    },
  });

  return <View style={{ flex: 1 }} {...panResponder.panHandlers}>{children}</View>;
}

export default function TabLayout() {
  const colors = useColors();

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
            title: "Tunnel",
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
          }}
        />
        <Tabs.Screen
          name="configuration"
          options={{
            title: "Configuration",
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="pencil" color={color} />,
          }}
        />
        <Tabs.Screen
          name="diagnostic"
          options={{
            title: "Diagnostic",
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="doc.text" color={color} />,
          }}
        />
      </Tabs>
    </SwipeWrapper>
  );
}
