import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { NativeModules, Platform } from "react-native";

import { loadAppSettings } from "@/lib/app-settings";
import { setActiveLang, translate, type Lang, type LanguagePreference, type Translator } from "@/lib/i18n";

type LanguageContextValue = {
  lang: Lang;
  languagePreference: LanguagePreference;
  setLanguagePreference: (preference: LanguagePreference) => void;
  t: Translator;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

/** Langue de l'appareil via les APIs natives de React Native (aucune dépendance
 * externe : le lockfile pnpm est gelé). Repli sur « fr », langue historique. */
function detectDeviceLang(): Lang {
  try {
    let raw: string | undefined;
    if (Platform.OS === "ios") {
      const settings = NativeModules.SettingsManager?.settings;
      raw = settings?.AppleLocale ?? settings?.AppleLanguages?.[0];
    } else if (Platform.OS === "android") {
      raw = NativeModules.I18nManager?.localeIdentifier;
    } else if (typeof navigator !== "undefined") {
      raw = navigator.language;
    }
    return /^en\b/i.test(raw ?? "") ? "en" : "fr";
  } catch {
    return "fr";
  }
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [deviceLang] = useState(detectDeviceLang);
  const [preference, setPreferenceState] = useState<LanguagePreference>("system");

  // Restaure la préférence persistée une seule fois au démarrage (lecture
  // seule : seul l'écran Paramètres écrit dans le blob app-settings).
  useEffect(() => {
    let mounted = true;
    void loadAppSettings().then((settings) => {
      if (mounted && settings.language) setPreferenceState(settings.language);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const lang: Lang = preference === "system" ? deviceLang : preference;

  // Publie la langue active pour le code hors React (logs, validation) —
  // synchronisé avant les effets enfants pour limiter les messages tardifs.
  setActiveLang(lang);
  useEffect(() => {
    setActiveLang(lang);
  }, [lang]);

  const setLanguagePreference = useCallback((next: LanguagePreference) => {
    setPreferenceState(next);
  }, []);

  const t = useMemo<Translator>(() => (key, params) => translate(lang, key, params), [lang]);

  const value = useMemo(
    () => ({ lang, languagePreference: preference, setLanguagePreference, t }),
    [lang, preference, setLanguagePreference, t],
  );
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLang(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLang doit être utilisé dans LanguageProvider");
  return ctx;
}
