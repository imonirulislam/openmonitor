import { expect, test } from "bun:test";
import { getRegionInfo, groupRegions } from "./index";

test("known codes resolve from the catalogue", () => {
  expect(getRegionInfo("fra").location).toBe("Frankfurt, Germany");
  expect(getRegionInfo("FRA").continent).toBe("Europe");
  expect(getRegionInfo("ap-southeast-1").provider).toBe("aws");
});

// The whole reason this ships without a migration: an operator's own code has
// to read as their name, not a wrong guess.
test("unknown codes fall back to the caller's label under Private", () => {
  const info = getRegionInfo("hetzner-fsn1", { label: "Falkenstein box" });
  expect(info.location).toBe("Falkenstein box");
  expect(info.continent).toBe("Private");
  expect(info.provider).toBe("private");
});

test("unknown code with no label keeps the code", () => {
  expect(getRegionInfo("weird").location).toBe("weird");
});

test("grouping orders continents and puts Private last", () => {
  const groups = groupRegions([
    { region: "custom", name: "My box" },
    { region: "sin" },
    { region: "fra" },
  ]);
  expect(groups.map((g) => g.continent)).toEqual(["Europe", "Asia", "Private"]);
  expect(groups[2]?.items[0]?.info.location).toBe("My box");
});
