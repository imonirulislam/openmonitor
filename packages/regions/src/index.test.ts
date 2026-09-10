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

// The catalogue infers "fly" from an IATA code. A self-hosted box reusing that
// code is not on Fly, so a stored provider has to win.
test("a stored provider overrides the catalogue guess", () => {
  expect(getRegionInfo("sin").provider).toBe("fly");
  expect(getRegionInfo("sin", { provider: "contabo" }).provider).toBe("contabo");
  expect(getRegionInfo("sin", { provider: "contabo" }).location).toBe("Singapore");
});

test("a stored provider also applies to unknown codes", () => {
  expect(getRegionInfo("my-box", { provider: "hetzner" }).provider).toBe("hetzner");
});
