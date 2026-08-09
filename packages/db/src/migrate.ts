import "./load-env";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema";
import { installTriggerFunction, installTriggers } from "./triggers";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL must be set");

  const client = postgres(url, { max: 1 });
  const db = drizzle(client, { schema, casing: "snake_case" });

  // Migrations 0013/0014 attach triggers that EXECUTE FUNCTION
  // notify_monitor_changed(), so the function has to exist before they run.
  // On a from-scratch database it otherwise fails with "function ... does not exist".
  console.log("Installing trigger function…");
  await installTriggerFunction(db);

  console.log("Running migrations…");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations complete.");

  console.log("Installing triggers…");
  await installTriggers(db);
  console.log("Triggers installed.");

  await client.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
