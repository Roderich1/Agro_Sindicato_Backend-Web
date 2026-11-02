import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Checks a response body against a schema of docs/api/openapi-f12-estimation.json,
 * the INT-09 contract (paths relative to Back/, where Jest runs). It covers the subset that specification uses ($ref,
 * allOf, oneOf with a discriminator, nullable, closed objects, arrays, enums,
 * patterns, uuid and date-time formats, minimums) and returns every mismatch.
 */
type Schema = Record<string, unknown>;
const spec = JSON.parse(readFileSync(resolve("../docs/api/openapi-f12-estimation.json"), "utf8")) as {
  components: { schemas: Record<string, Schema> };
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function shapeErrors(schemaName: string, value: unknown): string[] {
  const errors: string[] = [];
  check({ $ref: `#/components/schemas/${schemaName}` }, value, "$", errors);
  return errors;
}

function resolveRef(schema: Schema): Schema {
  const ref = schema["$ref"] as string | undefined;
  return ref ? resolveRef(spec.components.schemas[ref.replace("#/components/schemas/", "")]!) : schema;
}

function check(raw: Schema, value: unknown, at: string, errors: string[]): void {
  const schema = resolveRef(raw);
  if (value === null) {
    if (!schema["nullable"]) errors.push(`${at}: null no admitido`);
    return;
  }
  if (Array.isArray(schema["allOf"])) {
    for (const part of schema["allOf"] as Schema[]) check(part, value, at, errors);
    return;
  }
  if (Array.isArray(schema["oneOf"])) {
    const discriminator = schema["discriminator"] as { propertyName: string; mapping: Record<string, string> } | undefined;
    if (discriminator) {
      const key = (value as Record<string, unknown>)[discriminator.propertyName] as string;
      const target = discriminator.mapping[key];
      if (!target) errors.push(`${at}: discriminador desconocido ${key}`);
      else check({ $ref: target }, value, at, errors);
      return;
    }
    const matches = (schema["oneOf"] as Schema[]).filter((option) => {
      const local: string[] = [];
      check(option, value, at, local);
      return local.length === 0;
    });
    if (matches.length === 0) errors.push(`${at}: ninguna alternativa de oneOf`);
    return;
  }
  const enumeration = schema["enum"] as unknown[] | undefined;
  if (enumeration && !enumeration.includes(value)) errors.push(`${at}: ${JSON.stringify(value)} fuera de ${JSON.stringify(enumeration)}`);
  switch (schema["type"]) {
    case "object": {
      if (typeof value !== "object" || Array.isArray(value)) return void errors.push(`${at}: se esperaba un objeto`);
      const properties = (schema["properties"] ?? {}) as Record<string, Schema>;
      for (const key of (schema["required"] ?? []) as string[]) if (!(key in (value as object))) errors.push(`${at}: falta ${key}`);
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (properties[key]) check(properties[key]!, child, `${at}.${key}`, errors);
        else if (schema["additionalProperties"] === false) errors.push(`${at}: propiedad no especificada ${key}`);
      }
      return;
    }
    case "array": {
      if (!Array.isArray(value)) return void errors.push(`${at}: se esperaba una lista`);
      if (typeof schema["minItems"] === "number" && value.length < (schema["minItems"] as number)) errors.push(`${at}: menos de ${schema["minItems"]}`);
      value.forEach((item, i) => check(schema["items"] as Schema, item, `${at}[${i}]`, errors));
      return;
    }
    case "string": {
      if (typeof value !== "string") return void errors.push(`${at}: se esperaba texto`);
      if (schema["pattern"] && !new RegExp(schema["pattern"] as string).test(value)) errors.push(`${at}: ${value} no cumple ${schema["pattern"]}`);
      if (schema["format"] === "uuid" && !UUID.test(value)) errors.push(`${at}: ${value} no es uuid`);
      if (schema["format"] === "date-time" && Number.isNaN(Date.parse(value))) errors.push(`${at}: ${value} no es fecha`);
      if (typeof schema["maxLength"] === "number" && value.length > (schema["maxLength"] as number)) errors.push(`${at}: demasiado largo`);
      return;
    }
    case "integer":
    case "number": {
      if (typeof value !== "number" || (schema["type"] === "integer" && !Number.isInteger(value))) return void errors.push(`${at}: se esperaba ${schema["type"]}`);
      if (typeof schema["minimum"] === "number" && value < (schema["minimum"] as number)) errors.push(`${at}: menor que ${schema["minimum"]}`);
      return;
    }
    case "boolean":
      if (typeof value !== "boolean") errors.push(`${at}: se esperaba booleano`);
      return;
    default:
      return;
  }
}
