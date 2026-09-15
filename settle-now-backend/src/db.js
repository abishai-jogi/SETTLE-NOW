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
