import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The JWT carries the workspace and role from sign-in, so an action reading
 * them writes into whatever workspace the user was in when they logged in —
 * not the one they switched to. Guards in ~/lib/workspace re-read both from
 * workspace_members; this keeps the old pattern from creeping back.
 */
const DIR = import.meta.dir;
const FORBIDDEN = ["session.user.workspaceId", "session.user.role"];

describe("server actions scope writes to the current workspace", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

  it("finds the action files", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  for (const file of files) {
    it(`${file} reads the workspace from the session guard`, () => {
      const source = readFileSync(join(DIR, file), "utf8");
      for (const pattern of FORBIDDEN) {
        expect(source).not.toContain(pattern);
      }
    });
  }
});
