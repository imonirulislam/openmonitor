import path from "node:path";
import { config } from "dotenv";

// Always load .env from the workspace root, regardless of cwd. bun run --filter sets cwd
// to the package dir, which is not where the .env lives.
config({ path: path.resolve(import.meta.dirname, "../../../.env") });
