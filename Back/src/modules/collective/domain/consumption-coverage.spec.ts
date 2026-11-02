import { consumptionCoverage } from "./consumption-coverage";

describe("consumptionCoverage (F07 seal, F12 estimation)", () => {
  it("counts the Members inside published consumption figures out of the linked Members", () => {
    expect(consumptionCoverage(new Set(["a", "b", "c"]), new Set(["a", "b", "c", "d", "e"]))).toEqual({
      status: "IDENTIFIED",
      linkedMembers: 5,
      membersInPublishedFigures: 3,
    });
  });

  it("is an identified zero when no consumption figure was published", () => {
    expect(consumptionCoverage(new Set(), new Set(["a", "b"]))).toEqual({
      status: "IDENTIFIED",
      linkedMembers: 2,
      membersInPublishedFigures: 0,
    });
  });

  it("records no fraction when a published Member is outside the linked population", () => {
    expect(consumptionCoverage(new Set(["a", "gone"]), new Set(["a", "b", "c"]))).toEqual({
      status: "POPULATION_MISMATCH",
      linkedMembers: null,
      membersInPublishedFigures: null,
    });
  });
});
