import { afterEach, expect, test } from "bun:test";
import { signupsEnabled } from "./signups";

const original = process.env.SIGNUPS_ENABLED;
afterEach(() => {
  process.env.SIGNUPS_ENABLED = original;
});

test.each(["on", "true", "1", "yes", "ON", " True "])("%p opens signups", (v) => {
  process.env.SIGNUPS_ENABLED = v;
  expect(signupsEnabled()).toBe(true);
});

test.each(["off", "false", "0", "", "nope"])("%p keeps them closed", (v) => {
  process.env.SIGNUPS_ENABLED = v;
  expect(signupsEnabled()).toBe(false);
});

test("unset keeps them closed", () => {
  delete process.env.SIGNUPS_ENABLED;
  expect(signupsEnabled()).toBe(false);
});
