import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// Minimal .env loader (no dependency): KEY=VALUE lines from backend/.env
const envPath = path.join(here, "..", ".env");
if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (match && process.env[match[1]] === undefined) {
            process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
        }
    }
}

const { default: app } = await import("./app.js");

const port = Number(process.env.PORT ?? 4000);
app.listen(port, '0.0.0.0', () => {
    console.log(`Settle Now sync server listening on http://localhost:${port}`);
    console.log(`  (LAN access: http://0.0.0.0:${port})`);
});
