# Resetting the Production Database (Fresh & Clean Vercel App)

This clears **every** ledger, expense, settlement and account from the live
backend so the deployed app looks brand new. Users keep the app, but all data
is gone — like day one.

> ⚠️ **This cannot be undone.** Everyone's ledgers, expenses and settlements
> will be permanently erased. Do it when nobody is mid-entry.

---

## Option A — One-Command Wipe (recommended)

The backend already ships a token-guarded wipe endpoint (from commit `ec8270a`).

1. Choose a strong secret token and add it to your backend host
   (Railway/Render → your backend service → **Variables**):

   ```
   WIPE_TOKEN = <paste-a-long-random-string>
   ```

   Redeploy the backend so the variable takes effect.

2. Wipe from any terminal (replace `<backend-url>` and `<token>`):

   ```bash
   curl -X POST https://<backend-url>/api/admin/wipe \
        -H "x-wipe-token: <token>"
   ```

   Expected response:

   ```json
   {"ok":true,"wiped":true,"at":1789501954367}
   ```

3. **Remove the `WIPE_TOKEN` variable afterwards** (or keep it — the endpoint
   does nothing without it set) and redeploy.

That's it. Tables stay, all rows are gone. New signups create fresh accounts.

---

## Option B — Wipe from the Dashboard (no terminal)

If you used **Neon / Supabase / Railway Postgres** for `DATABASE_URL`:

1. Open the database dashboard → **SQL Editor / Query console**.
2. Run:

   ```sql
   TRUNCATE conflict_log, settlements, expense_participants, expenses,
            room_members, rooms, users CASCADE;
   ```

3. Done. The app recreates nothing by itself — empty tables are exactly what
   the app expects on a fresh start.

---

## Option C — Fresh Database Entirely

1. Create a brand-new Postgres instance on your provider.
2. Copy its connection string into the backend's `DATABASE_URL` variable.
3. Redeploy the backend — on boot it runs `db/schema.sql`, creating all tables
   automatically (zero-config bootstrap already built into `src/server.js`).
4. Optionally delete the old database.

---

## Also clear the devices (recommended after a wipe)

Each browser keeps local cached data in localStorage. After the server wipe,
users should clear it so no stale ledgers show up. On each device:

- **Easiest:** open the app → sign out (if signed in) → press `F12` →
  **Console** tab → paste:

  ```js
  Object.keys(localStorage)
    .filter(k => k.startsWith("settle-now."))
    .forEach(k => localStorage.removeItem(k));
  location.reload();
  ```

- **Or:** Site settings → Clear browsing data / Clear site data for the app URL.

---

## How to verify it's clean

```bash
curl https://<backend-url>/api/health
# → {"ok":true,...}
```

Then open the app: you should land on the sign-in screen with **no saved
accounts**, and creating a new account + ledger should behave like a fresh
install.

---

## Notes specific to this codebase

- All deletes (ledger deletion, clear expenses) are **soft deletes**
  (`is_deleted = TRUE`), so TRUNCATE is the only way to truly empty the tables.
- The wipe endpoint truncates in FK-safe order: `conflict_log → settlements →
  expense_participants → expenses → room_members → rooms → users`.
- After wiping, old invite codes are dead: joining by a previous code returns
  `room_not_found`.
