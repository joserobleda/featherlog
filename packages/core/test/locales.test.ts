import { describe, expect, it } from "vitest";
import { slugify } from "../src/ids";
import { negotiateLocale } from "../src/locales";

describe("locales", () => {
  it("negotiates locales from language tags", () => {
    expect(negotiateLocale("es-MX", ["en", "es"], "en")).toBe("es");
    expect(negotiateLocale("fr-FR,es;q=0.8", ["en", "es"], "en")).toBe("es");
    expect(negotiateLocale("de", ["en", "es"], "en")).toBe("en");
    expect(negotiateLocale(null, ["en"], "en")).toBe("en");
  });
  it("slugifies titles", () => {
    expect(slugify("¡Nuevo modo oscuro! 🌙")).toBe("nuevo-modo-oscuro");
    expect(slugify("Ça marche très bien")).toBe("ca-marche-tres-bien");
    expect(slugify("🎉")).toBe("post");
  });
});
