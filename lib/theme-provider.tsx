import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Appearance, View, useColorScheme as useSystemColorScheme } from "react-native";
import { colorScheme as nativewindColorScheme, vars } from "nativewind";

import { SchemeColors, type ColorScheme } from "@/constants/theme";
import { loadAppSettings, type ThemePreference } from "@/lib/app-settings";

type ThemeContextValue = {
  colorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme) => void;
  themePreference: ThemePreference;
  setThemePreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useSystemColorScheme() ?? "light";
  const [preference, setPreference] = useState<ThemePreference>("system");
  // Schéma résolu : la préférence gagne sur l'OS sauf en mode « system ».
  const colorScheme: ColorScheme = preference === "system" ? systemScheme : preference;

  // Restaure la préférence persistée une seule fois au démarrage. Lecture seule :
  // seul l'écran Paramètres écrit dans le blob app-settings (une seule source
  // d'écriture → pas de course d'écrasement).
  useEffect(() => {
    let mounted = true;
    void loadAppSettings().then((settings) => {
      if (mounted && settings.theme) setPreference(settings.theme);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const applyScheme = useCallback((scheme: ColorScheme, effectivePreference: ThemePreference) => {
    nativewindColorScheme.set(scheme);
    // En mode « system », `null` rend la main à l'OS : sans lui, React Native
    // se fige sur la dernière valeur explicite et ne suit plus les changements
    // système (thème live cassé). C'est le point critique du mode Système.
    Appearance.setColorScheme?.(effectivePreference === "system" ? null : scheme);
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      root.dataset.theme = scheme;
      root.classList.toggle("dark", scheme === "dark");
      const palette = SchemeColors[scheme];
      Object.entries(palette).forEach(([token, value]) => {
        root.style.setProperty(`--color-${token}`, value);
      });
    }
  }, []);

  useEffect(() => {
    applyScheme(colorScheme, preference);
  }, [applyScheme, colorScheme, preference]);

  // Garde dev/theme-lab fonctionnel : force directement clair/sombre.
  const setColorScheme = useCallback((scheme: ColorScheme) => {
    setPreference(scheme);
  }, []);

  const setThemePreference = useCallback((next: ThemePreference) => {
    setPreference(next);
  }, []);

  const themeVariables = useMemo(
    () =>
      vars({
        "color-primary": SchemeColors[colorScheme].primary,
        "color-background": SchemeColors[colorScheme].background,
        "color-surface": SchemeColors[colorScheme].surface,
        "color-surfaceRaised": SchemeColors[colorScheme].surfaceRaised,
        "color-foreground": SchemeColors[colorScheme].foreground,
        "color-muted": SchemeColors[colorScheme].muted,
        "color-border": SchemeColors[colorScheme].border,
        "color-success": SchemeColors[colorScheme].success,
        "color-warning": SchemeColors[colorScheme].warning,
        "color-error": SchemeColors[colorScheme].error,
      }),
    [colorScheme],
  );

  const value = useMemo(
    () => ({
      colorScheme,
      setColorScheme,
      themePreference: preference,
      setThemePreference,
    }),
    [colorScheme, preference, setColorScheme, setThemePreference],
  );
  return (
    <ThemeContext.Provider value={value}>
      <View style={[{ flex: 1 }, themeVariables]}>{children}</View>
    </ThemeContext.Provider>
  );
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useThemeContext must be used within ThemeProvider");
  }
  return ctx;
}
