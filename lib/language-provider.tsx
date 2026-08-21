import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type AppLanguage = "fr" | "en";
export type LanguagePreference = "system" | AppLanguage;
type InterpolationValues = Record<string, string | number>;

type LanguageContextValue = {
  language: AppLanguage;
  languagePreference: LanguagePreference;
  locale: "fr-FR" | "en-US";
  setLanguagePreference: (preference: LanguagePreference) => void;
  t: (source: string, values?: InterpolationValues) => string;
};

const LANGUAGE_PREFERENCE_KEY = "picko.language.preference.v1";
const LanguageContext = createContext<LanguageContextValue | null>(null);

const english: Record<string, string> = {
  "Système": "System",
  "Chargement…": "Loading…",
  "Indisponible": "Unavailable",
  "Indisponible dans cet environnement": "Unavailable in this environment",
  "Français": "French",
  "Langue": "Language",
  "Langue de l’application": "App language",
  "Utilise la langue définie sur votre appareil lorsque le choix Système est actif.": "Uses the language set on your device when System is selected.",
  "Paramètres": "Settings",
  "Préférences de l’application et du moteur VPN": "Application and VPN engine preferences",
  "Retour": "Back",
  "Connexion en cours": "Connection in progress",
  "Les réglages de service seront appliqués à la prochaine connexion VPN. L’apparence est appliquée immédiatement.": "Service settings will be applied on the next VPN connection. Appearance changes apply immediately.",
  "Apparence": "Appearance",
  "Thème": "Theme",
  "Clair": "Light",
  "Sombre": "Dark",
  "VPN": "VPN",
  "Taille maximale des paquets VPN, de 1280 à 1500.": "Maximum VPN packet size, from 1280 to 1500.",
  "Maintient le processeur actif tant que le VPN est connecté.": "Keeps the processor active while the VPN is connected.",
  "Nom du profil dans la notification": "Profile name in notification",
  "Affiche le premier profil actif dans la notification Android.": "Displays the first active profile in the Android notification.",
  "Proxy et ports locaux": "Proxy and local ports",
  "Automatiques par profil": "Automatic per profile",
  "Les ports SOCKS et DNSTT sont attribués dynamiquement pour préserver le multi-profil et éviter les collisions.": "SOCKS and DNSTT ports are allocated dynamically to preserve multi-profile use and avoid collisions.",
  "Accès depuis le réseau local": "Local network access",
  "Désactivé": "Disabled",
  "Les proxys locaux restent privés sur l’appareil ; aucune ouverture LAN non authentifiée n’est exposée.": "Local proxies remain private to the device; no unauthenticated LAN access is exposed.",
  "DNS personnalisé": "Custom DNS",
  "Remplace les DNS du VPN par les deux adresses ci-dessous.": "Replaces VPN DNS with the two addresses below.",
  "DNS primaire": "Primary DNS",
  "Adresse IP ou nom de serveur DNS.": "IP address or DNS server name.",
  "DNS secondaire": "Secondary DNS",
  "Utilisé comme secours si le DNS primaire échoue.": "Used as a fallback if primary DNS fails.",
  "Vérification HTTP et reconnexion": "HTTP check and reconnection",
  "Vérification HTTP": "HTTP check",
  "Teste l’URL via le balancier SOCKS après la connexion VPN.": "Tests the URL through the SOCKS balancer after VPN connection.",
  "URL de vérification": "Check URL",
  "Adresse HTTP ou HTTPS attendue par le contrôle de connectivité.": "HTTP or HTTPS address expected by connectivity checking.",
  "Intervalle (ms)": "Interval (ms)",
  "De 1000 à 120000 ms.": "From 1000 to 120000 ms.",
  "Délai maximal (ms)": "Timeout (ms)",
  "De 1000 à 60000 ms par vérification.": "From 1000 to 60000 ms per check.",
  "Échecs avant reconnexion": "Failures before reconnection",
  "0 désactive la relance par vérification ; maximum 20.": "0 disables check-triggered reconnection; maximum 20.",
  "Toujours tenter de reconnecter": "Always try to reconnect",
  "Conserve le VPN actif et relance les tunnels récupérables après une perte de connectivité.": "Keeps VPN active and restarts recoverable tunnels after a loss of connectivity.",
  "Diagnostic": "Diagnostics",
  "Mode diagnostic détaillé": "Detailed diagnostic mode",
  "Ajoute les événements techniques non critiques dans l’écran Diagnostic. Les erreurs et changements de connexion restent toujours visibles.": "Adds non-critical technical events to the Diagnostics screen. Errors and connection changes always remain visible.",
  "Appareil": "Device",
  "Identifiant Android affiché localement pour cet appareil ; Picko ne le transmet à aucun serveur.": "Android ID displayed locally for this device; Picko never sends it to any server.",
  "Fonctions de sécurité": "Security features",
  "Les commandes root, le partage automatique du VPN et l’exposition réseau local ne sont volontairement pas ajoutés : ils demandent des privilèges externes ou réduisent la sécurité de l’appareil. Les options présentées ici sont toutes prises en charge par Picko.": "Root commands, automatic VPN sharing and local network exposure are intentionally not provided: they require external privileges or reduce device security. Every option shown here is supported by Picko.",
  "Restaurer les valeurs par défaut": "Restore default values",
  "Tunnel": "Tunnel",
  "Configuration": "Configuration",
  "Choisir les tunnels": "Choose tunnels",
  "Créer un profil dans Configuration": "Create a profile in Configuration",
  "{enabled}/{total} profil(s) sélectionné(s)": "{enabled}/{total} selected profile(s)",
  "CONNECTER": "CONNECT",
  "DÉCONNECTER": "DISCONNECT",
  "ANNULER": "CANCEL",
  "Gérer les profils dans Configuration": "Manage profiles in Configuration",
  "Ouvrir le menu de configuration": "Open configuration menu",
  "Ouvrir les paramètres VPN": "Open VPN settings",
  "CONFIGURATION": "CONFIGURATION",
  "Importer config": "Import config",
  "Fichier .kmu ou lien kighmu:// du presse-papiers": ".kmu file or kighmu:// link from clipboard",
  "Exporter config": "Export config",
  "Créer un fichier .kmu ou copier un lien kighmu://": "Create a .kmu file or copy a kighmu:// link",
  "Réinitialiser": "Reset",
  "Supprimer tous les profils et réglages locaux": "Delete all local profiles and settings",
  "Profils de tunnel": "Tunnel profiles",
  "Retour vers Tunnel": "Back to Tunnel",
  "Sélectionnez les profils que vous souhaitez activer.": "Select the profiles you want to enable.",
  "Actions du profil": "Profile actions",
  "Clonage impossible": "Unable to clone",
  "Le profil n’a pas pu être dupliqué. Réessayez après avoir vérifié l’espace de stockage de l’application.": "The profile could not be duplicated. Please try again after checking the app storage space.",
  "Supprimer ce profil ?": "Delete this profile?",
  "« {name} » et ses secrets seront supprimés de l’appareil.": "“{name}” and its secrets will be removed from this device.",
  "Créez vos profils ZiVPN UDP, SSH SlowDNS, Hysteria UDP, Xray, V2Ray DNS, HTTP Proxy payload ou SSH SSL/TLS, puis activez ceux que vous souhaitez équilibrer. Les secrets restent uniquement sur l’appareil.": "Create ZiVPN UDP, SSH SlowDNS, Hysteria UDP, Xray, V2Ray DNS, HTTP Proxy payload or SSH SSL/TLS profiles, then enable the ones you want to balance. Secrets remain only on the device.",
  "Ajouter un profil": "Add profile",
  "Aucun profil": "No profiles",
  "Utilisez « Ajouter un profil » pour créer un tunnel ZiVPN UDP, SSH SlowDNS, Hysteria UDP, Xray, V2Ray DNS, HTTP Proxy payload ou SSH SSL/TLS.": "Use “Add profile” to create a ZiVPN UDP, SSH SlowDNS, Hysteria UDP, Xray, V2Ray DNS, HTTP Proxy payload or SSH SSL/TLS tunnel.",
  "Actif : inclus dans l’équilibrage": "Active: included in balancing",
  "Inactif : conservé sans connexion": "Inactive: saved without connection",
  "Modifier": "Edit",
  "Cloner": "Clone",
  "Supprimer": "Delete",
  "Nouveau profil": "New profile",
  "Choisissez la méthode du tunnel à configurer.": "Choose the tunnel method to configure.",
  "Tunnel UDP avec Obfs et mot de passe": "UDP tunnel with Obfs and password",
  "SSH transporté par DNSTT / DNS": "SSH transported through DNSTT / DNS",
  "UDP rapide, avec port hopping facultatif": "Fast UDP with optional port hopping",
  "Lien VMess, VLESS ou Trojan, ou JSON Xray": "VMess, VLESS or Trojan link, or Xray JSON",
  "Xray/V2Ray transporté par DNSTT / DNS": "Xray/V2Ray transported through DNSTT / DNS",
  "SSH transporté au travers d’un proxy HTTP personnalisé": "SSH transported through a custom HTTP proxy",
  "SSH encapsulé dans une connexion SSL/TLS avec SNI": "SSH encapsulated in an SSL/TLS connection with SNI",
  "Annuler": "Cancel",
  "Configurer le profil": "Configure profile",
  "Fermer": "Close",
  "Nom du profil": "Profile name",
  "Ex. Réseau mobile": "e.g. Mobile network",
  "Hôte ou adresse IP": "Host or IP address",
  "Port ou plage": "Port or range",
  "Mot de passe": "Password",
  "Serveur SSH": "SSH server",
  "Port SSH": "SSH port",
  "Utilisateur SSH": "SSH user",
  "Mot de passe SSH": "SSH password",
  "Résolveur DNS": "DNS resolver",
  "Port DNS": "DNS port",
  "Domaine SlowDNS": "SlowDNS domain",
  "Clé publique DNSTT": "DNSTT public key",
  "Serveur Hysteria": "Hysteria server",
  "Port ou plage Hysteria": "Hysteria port or range",
  "Mot de passe Hysteria": "Hysteria password",
  "Débit montant (Mbps)": "Upload rate (Mbps)",
  "Débit descendant (Mbps)": "Download rate (Mbps)",
  "Obfs Hysteria (facultatif)": "Hysteria Obfs (optional)",
  "Clé d’obfuscation": "Obfuscation key",
  "Lien V2Ray / Xray (vmess / vless / trojan)": "V2Ray / Xray link (vmess / vless / trojan)",
  "Configuration JSON Xray (facultatif)": "Xray JSON configuration (optional)",
  "Mode Xray actif": "Active Xray mode",
  "Lien": "Link",
  "Serveur SSH cible": "Target SSH server",
  "Port SSH cible": "Target SSH port",
  "Serveur du proxy HTTP": "HTTP proxy server",
  "Port du proxy HTTP": "HTTP proxy port",
  "Payload HTTP": "HTTP payload",
  "Variables disponibles : [host], [port], [proxy_host], [proxy_port], [crlf], [split] et [delay]. Le payload reste entièrement visible après enregistrement.": "Available variables: [host], [port], [proxy_host], [proxy_port], [crlf], [split] and [delay]. The payload remains fully visible after saving.",
  "Serveur SSL/TLS": "SSL/TLS server",
  "Port SSL/TLS": "SSL/TLS port",
  "SNI (facultatif)": "SNI (optional)",
  "Version TLS": "TLS version",
  "Utilisez le SNI attendu par le serveur. Le certificat est accepté comme dans l’implémentation de référence.": "Use the SNI expected by the server. The certificate is accepted as in the reference implementation.",
  "Lien Xray (vmess / vless / trojan)": "Xray link (vmess / vless / trojan)",
  "Pour une configuration avancée, collez directement le JSON Xray ci-dessous. Le mode JSON est prioritaire lorsque vous le sélectionnez dans le nom du profil.": "For advanced configuration, paste the Xray JSON directly below. JSON mode takes priority when you select it in the profile.",
  "Mode actif": "Active mode",
  "Enregistrement…": "Saving…",
  "Enregistrer le profil": "Save profile",
  "Tous": "All",
  "Erreurs": "Errors",
  "Avertissements": "Warnings",
  "Connexion": "Connection",
  "Aucun événement enregistré.": "No event recorded.",
  "Rapport KIGHMU VPN": "KIGHMU VPN report",
  "Les secrets sont filtrés avant affichage et partage.": "Secrets are filtered before display and sharing.",
  "Partager": "Share",
  "Session actuelle": "Current session",
  "{count} événement": "{count} event",
  "{count} événements": "{count} events",
  "Journal local, limité aux 300 dernières entrées.": "Local log, limited to the last 300 entries.",
  "Aucun événement dans ce filtre": "No event in this filter",
  "Les étapes du tunnel apparaîtront ici.": "Tunnel steps will appear here.",
  "Effacer le journal local": "Clear local log",
};

function detectSystemLanguage(): AppLanguage {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale?.toLowerCase() ?? "";
    return locale.startsWith("fr") ? "fr" : "en";
  } catch {
    return "en";
  }
}

function interpolate(value: string, values?: InterpolationValues): string {
  if (!values) return value;
  return value.replace(/\{(\w+)\}/g, (token, key) => values[key] === undefined ? token : String(values[key]));
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [languagePreference, setLanguagePreferenceState] = useState<LanguagePreference>("system");
  const [systemLanguage, setSystemLanguage] = useState<AppLanguage>(detectSystemLanguage);
  const language = languagePreference === "system" ? systemLanguage : languagePreference;

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(LANGUAGE_PREFERENCE_KEY).then((value) => {
      if (!active || !value) return;
      if (value === "system" || value === "fr" || value === "en") setLanguagePreferenceState(value);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") setSystemLanguage(detectSystemLanguage());
    });
    return () => subscription.remove();
  }, []);

  const setLanguagePreference = useCallback((preference: LanguagePreference) => {
    setLanguagePreferenceState(preference);
    void AsyncStorage.setItem(LANGUAGE_PREFERENCE_KEY, preference);
  }, []);

  const t = useCallback((source: string, values?: InterpolationValues) => {
    const translated = language === "en" ? english[source] ?? source : source;
    return interpolate(translated, values);
  }, [language]);

  const value = useMemo(() => ({
    language,
    languagePreference,
    locale: language === "fr" ? "fr-FR" as const : "en-US" as const,
    setLanguagePreference,
    t,
  }), [language, languagePreference, setLanguagePreference, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
}
