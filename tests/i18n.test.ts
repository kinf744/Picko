import { describe, expect, it } from "vitest";
import { en, fr, getActiveLang, setActiveLang, translate, type DictKey } from "../lib/i18n";
import { DEFAULT_APP_SETTINGS } from "../lib/app-settings";

describe("i18n", () => {
  it("couverture complète : chaque clé française existe en anglais (et réciproquement)", () => {
    const frKeys = Object.keys(fr) as DictKey[];
    const enKeys = Object.keys(en) as DictKey[];
    expect(enKeys.length).toBe(frKeys.length);
    frKeys.forEach((key) => expect(typeof en[key]).toBe("string"));
  });

  it("traduit en français et en anglais", () => {
    expect(translate("fr", "home.connect")).toBe("Connecter");
    expect(translate("en", "home.connect")).toBe("Connect");
    expect(translate("fr", "settings.lang.section")).toBe("Langue");
    expect(translate("en", "settings.lang.section")).toBe("Language");
  });

  it("interpole les paramètres {n}", () => {
    expect(translate("fr", "home.profilesSelected", { n: 3 })).toBe("3 profil(s) sélectionné(s)");
    expect(translate("en", "import.doneBody", { n: 5 })).toBe("5 profile(s) were saved.");
  });

  it("retombe sur la clé brute si inconnue (clés dynamiques tunnels.*) tolérées", () => {
    expect(translate("fr", "cle.inconnue" as DictKey)).toBe("cle.inconnue");
  });

  it("langue active par défaut = français et modifiable hors React (logs/validation)", () => {
    expect(getActiveLang()).toBe("fr");
    setActiveLang("en");
    expect(getActiveLang()).toBe("en");
    setActiveLang("fr");
  });

  it("la préférence de langue par défaut est « system » (suit l'appareil)", () => {
    expect(DEFAULT_APP_SETTINGS.language).toBe("system");
  });
});
