import "./load-env";
import { ensureSchema } from "./schema";

const url = process.env.CLICKHOUSE_URL;
if (!url) throw new Error("CLICKHOUSE_URL must be set");

const retentionDays = Number(process.env.RETENTION_RUN_DAYS ?? 180);

console.log(`Ensuring ClickHouse schema (retention ${retentionDays}d)…`);
await ensureSchema(url, retentionDays);
console.log("ClickHouse schema ready.");
