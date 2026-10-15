/**
 * Strict RFC 8259 parser for Sync v1 requests (contract §4).
 *
 * `JSON.parse` silently keeps the last of duplicated keys, which makes a
 * request ambiguous. This parser rejects duplicates at every level, keeps
 * numbers as their raw text so that `1` and `1.0` are not coerced into each
 * other, and builds objects without a prototype. Errors never contain input
 * values: the caller only learns that the body is not admitted.
 */
export class StrictJsonError extends Error {
  constructor(readonly reason: "SYNTAX" | "DUPLICATE_KEY" | "TOO_DEEP") {
    super(`Strict JSON rejected: ${reason}`);
  }
}

/** A JSON number exactly as written, never converted implicitly. */
export class JsonNumber {
  constructor(readonly raw: string) {}

  /** True for `0` or `[1-9][0-9]*` with an optional minus sign. */
  get isIntegerLiteral(): boolean {
    return /^-?(0|[1-9][0-9]*)$/.test(this.raw);
  }
}

export type StrictJsonValue =
  | null
  | boolean
  | string
  | JsonNumber
  | StrictJsonValue[]
  | { [key: string]: StrictJsonValue };

const MAX_DEPTH = 16;
const NUMBER = /-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/y;

export function parseStrictJson(text: string): StrictJsonValue {
  let index = 0;

  const fail = (reason: StrictJsonError["reason"] = "SYNTAX"): never => {
    throw new StrictJsonError(reason);
  };

  const skipWhitespace = () => {
    while (index < text.length) {
      const c = text.charCodeAt(index);
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) index++;
      else break;
    }
  };

  const parseString = (): string => {
    // Precondition: text[index] === '"'.
    index++;
    let out = "";
    while (true) {
      if (index >= text.length) fail();
      const c = text.charCodeAt(index);
      if (c === 0x22) {
        index++;
        return out;
      }
      if (c < 0x20) fail();
      if (c !== 0x5c) {
        out += text[index++];
        continue;
      }
      index++;
      const escape = text[index++];
      switch (escape) {
        case '"':
          out += '"';
          break;
        case "\\":
          out += "\\";
          break;
        case "/":
          out += "/";
          break;
        case "b":
          out += "\b";
          break;
        case "f":
          out += "\f";
          break;
        case "n":
          out += "\n";
          break;
        case "r":
          out += "\r";
          break;
        case "t":
          out += "\t";
          break;
        case "u": {
          const hex = text.slice(index, index + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail();
          out += String.fromCharCode(parseInt(hex, 16));
          index += 4;
          break;
        }
        default:
          fail();
      }
    }
  };

  const parseValue = (depth: number): StrictJsonValue => {
    if (depth > MAX_DEPTH) fail("TOO_DEEP");
    skipWhitespace();
    const c = text[index];
    if (c === "{") {
      index++;
      const object: { [key: string]: StrictJsonValue } = Object.create(null);
      const seen = new Set<string>();
      skipWhitespace();
      if (text[index] === "}") {
        index++;
        return object;
      }
      while (true) {
        skipWhitespace();
        if (text[index] !== '"') fail();
        const key = parseString();
        if (seen.has(key)) fail("DUPLICATE_KEY");
        seen.add(key);
        skipWhitespace();
        if (text[index++] !== ":") fail();
        object[key] = parseValue(depth + 1);
        skipWhitespace();
        const next = text[index++];
        if (next === "}") return object;
        if (next !== ",") fail();
      }
    }
    if (c === "[") {
      index++;
      const array: StrictJsonValue[] = [];
      skipWhitespace();
      if (text[index] === "]") {
        index++;
        return array;
      }
      while (true) {
        array.push(parseValue(depth + 1));
        skipWhitespace();
        const next = text[index++];
        if (next === "]") return array;
        if (next !== ",") fail();
      }
    }
    if (c === '"') return parseString();
    if (text.startsWith("true", index)) {
      index += 4;
      return true;
    }
    if (text.startsWith("false", index)) {
      index += 5;
      return false;
    }
    if (text.startsWith("null", index)) {
      index += 4;
      return null;
    }
    NUMBER.lastIndex = index;
    const match = NUMBER.exec(text);
    if (match) {
      index += match[0].length;
      return new JsonNumber(match[0]);
    }
    return fail();
  };

  const value = parseValue(0);
  skipWhitespace();
  if (index !== text.length) fail();
  return value;
}

export function isJsonObject(
  value: StrictJsonValue,
): value is { [key: string]: StrictJsonValue } {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof JsonNumber)
  );
}
