import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// Minimal .env loader (no dependency): KEY=VALUE lines from backend/.env
// Values are trimmed and stripped of CR so Windows CRLF line endings can't poison them.
const envPath = path.join(here, "..", ".env");
if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (match && process.env[match[1]] === undefined) {
            const value = match[2].replace(/["']/g, "").trim();
            if (value) process.env[match[1]] = value;
        }
    }
}

const { default: app } = await import("./app.js");

// Auto-create tables on first boot so a fresh cloud database (Railway/Render/Neon)
// works with zero manual SQL. Safe to run every start: everything is IF NOT EXISTS.
// After the base schema, every migrations/*.sql is applied in filename order —
// they are written idempotent (ADD COLUMN IF NOT EXISTS / guarded constraints),
// so existing deployed databases upgrade in place on boot.
async function ensureSchema() {
    const { query } = await import("./db.js");
    const schemaPath = path.join(here, "..", "db", "schema.sql");
    const sql = fs.readFileSync(schemaPath, "utf8");
    await query(sql);
    const migrationsDir = path.join(here, "..", "migrations");
    if (fs.existsSync(migrationsDir)) {
        const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
        for (const f of files) {
            const mig = fs.readFileSync(path.join(migrationsDir, f), "utf8");
            await query(mig);
            console.log(`[schema] migration applied: ${f}`);
        }
    }
    console.log("[schema] verified/created all tables");
}

// BACKEND_PORT wins (lets the API be co-hosted beside a Vite dev server that
// owns the managed PORT), then PORT, then the historical default 4000.
const port =
  Number(process.env.BACKEND_PORT) > 0 ? Number(process.env.BACKEND_PORT)
  : Number(process.env.PORT) > 0 ? Number(process.env.PORT)
  : 4000;
try {
    await ensureSchema();
} catch (err) {
    console.error("[schema] bootstrap failed:", err.message);
    console.error("[schema] server will start anyway — check DATABASE_URL if queries fail");
}
app.listen(port, '0.0.0.0', () => {
    console.log(`Settle Now sync server listening on http://localhost:${port}`);
    console.log(`  (LAN access: http://0.0.0.0:${port})`);
});
