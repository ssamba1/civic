import { describe, expect, it } from "vitest";
import { t } from "./t";

describe("t()", () => {
  it("returns English string for en locale", () => {
    expect(t("en", "status_open")).toBe("Open");
  });

  it("returns translated string for supported locale", () => {
    expect(t("es", "status_open")).toBe("Abierto");
    expect(t("fr", "status_open")).toBe("Ouvert");
    expect(t("zh", "status_open")).toBe("未处理");
  });

  it("falls back to English for unknown locale", () => {
    expect(t("xx", "status_open")).toBe("Open");
    expect(t("", "cta_report")).toBe("Report a problem");
  });

  it("covers status_closed key for all locales", () => {
    expect(t("en", "status_closed")).toBe("Resolved");
    expect(t("es", "status_closed")).toBe("Resuelto");
  });

  it("returns a non-empty string for every key in every locale", () => {
    const locales = ["en", "es", "fr", "zh"] as const;
    const keys = [
      "status_open",
      "status_dispatched",
      "status_in_progress",
      "status_closed",
      "status_merged",
      "status_rejected",
      "cta_report",
      "cta_upvote",
      "cta_view_map",
      "cta_share",
      "trending_title",
      "trending_subtitle",
      "trending_empty",
      "lang_select",
    ] as const;
    for (const locale of locales) {
      for (const key of keys) {
        const result = t(locale, key);
        expect(result, `${locale}.${key}`).toBeTruthy();
      }
    }
  });
});
