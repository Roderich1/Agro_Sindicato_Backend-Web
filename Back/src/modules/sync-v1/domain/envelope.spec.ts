import { quantityInRange, validateEnvelope } from "./envelope";
import { parseStrictJson } from "./strict-json";

const CAMPAIGN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PRODUCT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OPERATION = "11111111-1111-4111-8111-111111111111";

function body(overrides: Record<string, unknown> = {}, payload?: unknown) {
  return {
    contractVersion: 1,
    operationId: OPERATION,
    projectionType: "DECLARED_NEED",
    action: "PUBLISH",
    causal: { predecessorOperationId: null, reconciliationReference: null },
    payload: payload ?? {
      campaign_ref: CAMPAIGN,
      product_ref: PRODUCT,
      base_unit: "ML",
      quantity_base: "1250",
    },
    ...overrides,
  };
}

const validate = (value: unknown) =>
  validateEnvelope(parseStrictJson(JSON.stringify(value)));

describe("validateEnvelope (contract §4 and §9)", () => {
  it("accepts the three synthetic examples of the contract", () => {
    expect(validate(body())).toEqual({
      ok: true,
      envelope: expect.objectContaining({
        contractVersion: 1,
        operationId: OPERATION,
        payload: expect.objectContaining({ quantity_base: "1250" }),
      }),
    });
    const supersede = validate(
      body({
        operationId: "22222222-2222-4222-8222-222222222222",
        action: "SUPERSEDE",
        causal: { predecessorOperationId: OPERATION, reconciliationReference: null },
      }),
    );
    expect(supersede.ok).toBe(true);
    const cancel = validate(
      body(
        {
          operationId: "33333333-3333-4333-8333-333333333333",
          action: "CANCEL",
          causal: {
            predecessorOperationId: "22222222-2222-4222-8222-222222222222",
            reconciliationReference: null,
          },
        },
        { campaign_ref: CAMPAIGN, product_ref: PRODUCT, base_unit: "ML" },
      ),
    );
    expect(cancel).toEqual({
      ok: true,
      envelope: expect.objectContaining({
        payload: expect.objectContaining({ quantity_base: null }),
      }),
    });
  });

  it("treats key order and whitespace as irrelevant", () => {
    const text =
      '{ "payload": {"quantity_base":"1250","base_unit":"ML","product_ref":"' +
      PRODUCT +
      '","campaign_ref":"' +
      CAMPAIGN +
      '"}, "causal":{"reconciliationReference":null,"predecessorOperationId":null},' +
      '"action":"PUBLISH","projectionType":"DECLARED_NEED","operationId":"' +
      OPERATION +
      '","contractVersion":1 }';
    expect(validateEnvelope(parseStrictJson(text)).ok).toBe(true);
  });

  it.each([2, 0, 7])("contractVersion %s is a 422 before any shape check", (v) => {
    expect(validate({ contractVersion: v, anything: true })).toEqual({
      ok: false,
      status: 422,
      errorCode: "CONTRACT_VERSION_MISMATCH",
    });
  });

  it.each([
    ["string version", body({ contractVersion: "1" })],
    ["missing version", (({ contractVersion: _v, ...rest }) => rest)(body())],
    ["batch array", [body()]],
    ["operationId uppercase", body({ operationId: "abcdefab-cdef-4abc-8def-abcdefabcdef".toUpperCase() })],
    ["operationId not v4", body({ operationId: "11111111-1111-1111-8111-111111111111" })],
    ["unknown projection", body({ projectionType: "STOCK" })],
    ["unknown action", body({ action: "UPSERT" })],
    ["causal missing key", body({ causal: { predecessorOperationId: null } })],
    ["causal not uuid", body({ causal: { predecessorOperationId: "x", reconciliationReference: null } })],
    ["quantity 01", body({}, { campaign_ref: CAMPAIGN, product_ref: PRODUCT, base_unit: "ML", quantity_base: "01" })],
    ["quantity -1", body({}, { campaign_ref: CAMPAIGN, product_ref: PRODUCT, base_unit: "ML", quantity_base: "-1" })],
    ["quantity 1.5", body({}, { campaign_ref: CAMPAIGN, product_ref: PRODUCT, base_unit: "ML", quantity_base: "1.5" })],
    ["quantity 1e3", body({}, { campaign_ref: CAMPAIGN, product_ref: PRODUCT, base_unit: "ML", quantity_base: "1e3" })],
    ["quantity number", body({}, { campaign_ref: CAMPAIGN, product_ref: PRODUCT, base_unit: "ML", quantity_base: 1250 })],
    ["quantity null", body({}, { campaign_ref: CAMPAIGN, product_ref: PRODUCT, base_unit: "ML", quantity_base: null })],
    ["missing quantity", body({}, { campaign_ref: CAMPAIGN, product_ref: PRODUCT, base_unit: "ML" })],
    ["unit L", body({}, { campaign_ref: CAMPAIGN, product_ref: PRODUCT, base_unit: "L", quantity_base: "1" })],
    ["campaign integer id", body({}, { campaign_ref: 12, product_ref: PRODUCT, base_unit: "ML", quantity_base: "1" })],
  ])("400 INVALID_REQUEST: %s", (_label, value) => {
    expect(validate(value)).toEqual({ ok: false, status: 400, errorCode: "INVALID_REQUEST" });
  });

  it.each([
    ["extra envelope key", body({ tenantId: CAMPAIGN })],
    ["extra causal key", body({ causal: { predecessorOperationId: null, reconciliationReference: null, at: 1 } })],
    ["extra payload key", body({}, { campaign_ref: CAMPAIGN, product_ref: PRODUCT, base_unit: "ML", quantity_base: "1", notes: "x" })],
    ["quantity on CANCEL", body({ action: "CANCEL", causal: { predecessorOperationId: OPERATION, reconciliationReference: null } }, { campaign_ref: CAMPAIGN, product_ref: PRODUCT, base_unit: "ML", quantity_base: "0" })],
  ])("400 FIELD_NOT_ALLOWED: %s", (_label, value) => {
    expect(validate(value)).toEqual({ ok: false, status: 400, errorCode: "FIELD_NOT_ALLOWED" });
  });

  it("keeps an in-format quantity above int64 for the QUANTITY_INVALID result", () => {
    const value = body({}, {
      campaign_ref: CAMPAIGN,
      product_ref: PRODUCT,
      base_unit: "G",
      quantity_base: "9223372036854775808",
    });
    expect(validate(value).ok).toBe(true);
    expect(quantityInRange("9223372036854775807")).toBe(true);
    expect(quantityInRange("9223372036854775808")).toBe(false);
    expect(quantityInRange("0")).toBe(true);
  });
});
