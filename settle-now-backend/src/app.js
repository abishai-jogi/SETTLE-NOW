import express from "express";

const app = express();
app.use(express.json({ limit: "2mb" }));

// CORS — allow all origins for LAN development
app.use((_req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    res.header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
    if (_req.method === "OPTIONS") return res.sendStatus(204);
    next();
});

app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "settle-now", time_ms: Date.now() });
});

app.use("/api", (await import("./routes/sync.js")).default);
app.use("/api", (await import("./routes/rooms.js")).default);

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
    console.error("[http]", err.message);
    res.status(500).json({ error: "internal" });
});

export default app;
