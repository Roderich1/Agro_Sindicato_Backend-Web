import { JsonNumber, parseStrictJson, StrictJsonError } from "./strict-json";

describe("parseStrictJson (contract §4: no duplicated keys, no coercion)", () => {
  it("parses objects, arrays, strings, literals and keeps numbers raw", () => {
    const value = parseStrictJson(
      ' { "a": [1, -2.5e3, true, false, null], "b": "x\\u00e1\\n\\"" } ',
    ) as Record<string, unknown>;
    const array = value["a"] as unknown[];
    expect((array[0] as JsonNumber).raw).toBe("1");
    expect((array[1] as JsonNumber).raw).toBe("-2.5e3");
    expect(array.slice(2)).toEqual([true, false, null]);
    expect(value["b"]).toBe('xá\n"');
    expect(Object.getPrototypeOf(value)).toBeNull();
  });

  it.each([
    ['{"a":1,"a":1}'],
    ['{"a":{"b":1,"b":2}}'],
    ['[{"x":1,"x":1}]'],
  ])("rejects duplicated keys at any level: %s", (text) => {
    expect(() => parseStrictJson(text)).toThrow(
      expect.objectContaining({ reason: "DUPLICATE_KEY" }),
    );
  });

  it.each([
    [""],
    ["{"],
    ['{"a":1,}'],
    ["[1,]"],
    ["01"],
    ['{"a":01}'],
    ["NaN"],
    ["'x'"],
    ['"\u0001"'],
    ['"\\x"'],
    ['{"a":1} trailing'],
    ["{ }"],
  ])("rejects malformed JSON: %j", (text) => {
    expect(() => parseStrictJson(text)).toThrow(StrictJsonError);
  });

  it("limits nesting depth", () => {
    expect(() => parseStrictJson("[".repeat(40) + "]".repeat(40))).toThrow(
      expect.objectContaining({ reason: "TOO_DEEP" }),
    );
  });

  it("distinguishes integer literals from other numbers", () => {
    for (const raw of ["1", "0", "-3", "42"])
      expect(new JsonNumber(raw).isIntegerLiteral).toBe(true);
    for (const raw of ["1.0", "1e0", "-0.5"])
      expect(new JsonNumber(raw).isIntegerLiteral).toBe(false);
  });

  it("never includes input values in its errors", () => {
    try {
      parseStrictJson('{"secret":"s3cr3t","secret":"other"}');
      throw new Error("expected rejection");
    } catch (error) {
      expect(String(error)).not.toContain("s3cr3t");
    }
  });
});
