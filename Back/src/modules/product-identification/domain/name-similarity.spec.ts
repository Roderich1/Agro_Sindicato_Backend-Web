import {
  CatalogCandidate,
  bigramDice,
  containment,
  nameSimilarity,
  normalizeName,
  similarity,
  similarityLevel,
  tokenJaccard,
} from "./name-similarity";

function product(id: string, name: string, unit = "L", extra: Partial<CatalogCandidate> = {}): CatalogCandidate {
  return { id, name, unit, isActive: true, activeIngredient: null, canonicalProductId: null, ...extra };
}

describe("E1-D7 name similarity", () => {
  it("normalises accents, case and punctuation", () => {
    expect(normalizeName("  Agroquímicos   del SUR, S.A. ")).toBe("agroquimicos del sur s a");
    expect(normalizeName("Glifosato-48%")).toBe("glifosato 48");
    expect(normalizeName("Ñandú")).toBe("nandu");
  });

  it("scores token Jaccard, bigram Dice and containment", () => {
    expect(tokenJaccard("Glifosato 48 SL", "glifosato sl")).toBeCloseTo(2 / 3);
    expect(bigramDice("Belator", "Bellator")).toBeGreaterThan(0.8);
    expect(containment("Glifosato", "Glifosato 480 Agroquímicos del Sur")).toBe(0.85);
    // A short word alone never counts as containment.
    expect(containment("48", "Glifosato 48 SL")).toBe(0);
    expect(nameSimilarity("Glifosato 48 SL", "GLIFOSATO 48 sl.")).toBe(1);
    expect(nameSimilarity("", "Glifosato")).toBe(0);
  });

  it("maps scores to ALTA, MEDIA and BAJA with the contract's thresholds", () => {
    expect(similarityLevel(0.75)).toBe("ALTA");
    expect(similarityLevel(0.7499)).toBe("MEDIA");
    expect(similarityLevel(0.45)).toBe("MEDIA");
    expect(similarityLevel(0.25)).toBe("BAJA");
    expect(similarityLevel(0.2499)).toBeNull();
  });

  it("returns only active products of the same dimension, best first, at most five", () => {
    const catalog = [
      product("p-exact", "Glifosato 480 Agroquímicos del Sur"),
      product("p-close", "Glifosato 48 SL"),
      product("p-solid", "Glifosato granulado", "kg"),
      product("p-other-unit", "Glifosato por unidad", "unidad"),
      product("p-inactive", "Glifosato 480", "L", { isActive: false }),
      product("p-ml", "Glifosato 480 concentrado", "L"),
      product("p-far", "Paraquat 20 SL"),
      product("p-a", "Glifosato A"),
      product("p-b", "Glifosato B"),
      product("p-c", "Glifosato C"),
    ];
    const result = similarity(
      { localName: "Glifosato 480 Agroquimicos del Sur", activeIngredient: null, baseUnit: "ML" },
      catalog,
    );
    expect(result).toHaveLength(5);
    expect(result[0]).toMatchObject({ product_ref: "p-exact", similarity: "ALTA", matched_on: ["name"], base_unit: "ML" });
    const refs = result.map((row) => row.product_ref);
    expect(refs).not.toContain("p-solid");
    expect(refs).not.toContain("p-other-unit");
    expect(refs).not.toContain("p-inactive");
    // Ordered by score, never increasing.
    const order = ["ALTA", "MEDIA", "BAJA"];
    const levels = result.map((row) => order.indexOf(row.similarity));
    expect([...levels].sort((a, b) => a - b)).toEqual(levels);
  });

  it("an equal active ingredient is at least MEDIA and is reported in matched_on", () => {
    const result = similarity(
      { localName: "Mata maleza del vecino", activeIngredient: "Glifosato", baseUnit: "ML" },
      [product("p-1", "Roundup 48", "L", { activeIngredient: "GLIFOSATO" }), product("p-2", "Otro", "L")],
    );
    expect(result).toEqual([
      expect.objectContaining({ product_ref: "p-1", similarity: "MEDIA", matched_on: ["active_ingredient"] }),
    ]);
  });

  it("flags aliases with their canonical product and never mutates its input", () => {
    const catalog = Object.freeze([
      Object.freeze(product("alias", "Belator", "L", { canonicalProductId: "canon" })),
      Object.freeze(product("canon", "Belator 20 SC")),
    ]);
    const result = similarity({ localName: "Bellator", activeIngredient: null, baseUnit: "ML" }, catalog);
    expect(result.find((row) => row.product_ref === "alias")).toMatchObject({
      is_alias: true,
      canonical_product_ref: "canon",
    });
    expect(result.find((row) => row.product_ref === "canon")).toMatchObject({
      is_alias: false,
      canonical_product_ref: null,
    });
  });
});
