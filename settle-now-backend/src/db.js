import pg from "pg";

let pool;

export function getPool() {
    if (!pool) {
        pool = new pg.Pool({
            connectionString: process.env.DATABASE_URL,
            max: 10,
            idleTimeoutMillis: 30_000,
        });
        pool.on("error", (err) => {
            console.error("[pg] idle client error", err.message);
        });
    }
    return pool;
}

export async function query(text, params) {
    return getPool().query(text, params);
}

/**
 * Run `fn` inside a transaction; rolls back on throw.
 * Used so a rejected expense allocation writes NOTHING (acceptance #12).
 */
export async function withTransaction(fn) {
    const client = await getPool().connect();
    try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
    } catch (err) {
        try { await client.query("ROLLBACK"); } catch { /* already ended */ }
        throw err;
    } finally {
        client.release();
    }
}
