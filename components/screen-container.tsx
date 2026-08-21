import { useMemo } from "react";
import { View, type ViewProps } from "react-native";
import { router, usePathname } from "expo-router";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

import { cn } from "@/lib/utils";

export interface ScreenContainerProps extends ViewProps {
  /**
   * SafeArea edges to apply. Defaults to ["top", "left", "right"].
   * Bottom is typically handled by Tab Bar.
   */
  edges?: Edge[];
  /**
   * Tailwind className for the content area.
   */
  className?: string;
  /**
   * Additional className for the outer container (background layer).
   */
  containerClassName?: string;
  /**
   * Additional className for the SafeAreaView (content layer).
   */
  safeAreaClassName?: string;
  /** Active le balayage horizontal uniquement entre les trois onglets principaux. */
  swipeTabs?: boolean;
}

/**
 * A container component that properly handles SafeArea and background colors.
 *
 * The outer View extends to full screen (including status bar area) with the background color,
 * while the inner SafeAreaView ensures content is within safe bounds.
 *
 * Usage:
 * ```tsx
 * <ScreenContainer className="p-4">
 *   <Text className="text-2xl font-bold text-foreground">
 *     Welcome
 *   </Text>
 * </ScreenContainer>
 * ```
 */
export function ScreenContainer({
  children,
  edges = ["top", "left", "right"],
  className,
  containerClassName,
  safeAreaClassName,
  swipeTabs = false,
  style,
  ...props
}: ScreenContainerProps) {
  const pathname = usePathname();
  const tabIndex = pathname === "/configuration" ? 1 : pathname === "/diagnostic" ? 2 : 0;
  const tabRoutes = ["/", "/configuration", "/diagnostic"] as const;
  const swipeGesture = useMemo(() => Gesture.Pan()
    .activeOffsetX([-22, 22])
    .failOffsetY([-38, 38])
    .runOnJS(true)
    .onEnd((event) => {
      const isHorizontalSwipe = Math.abs(event.translationX) >= 72 || Math.abs(event.velocityX) >= 500;
      if (!isHorizontalSwipe) return;
      const nextIndex = event.translationX < 0 ? tabIndex + 1 : tabIndex - 1;
      if (nextIndex >= 0 && nextIndex < tabRoutes.length) router.replace(tabRoutes[nextIndex]);
    }), [tabIndex]);

  const content = <View
    className={cn("flex-1", "bg-background", containerClassName)}
    {...props}
  >
    <SafeAreaView edges={edges} className={cn("flex-1", safeAreaClassName)} style={style}>
      <View className={cn("flex-1", className)}>{children}</View>
    </SafeAreaView>
  </View>;

  return swipeTabs ? <GestureDetector gesture={swipeGesture}>{content}</GestureDetector> : content;
}
