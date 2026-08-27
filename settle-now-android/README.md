# Settle Now — Android

Offline-first room-based expense splitter. Kotlin + Jetpack Compose + Room (MVVM, Repository pattern). Syncs to a Node/Express/PostgreSQL API.

## What's in the app

- **Login / Signup** — name + password (salted hash stored locally, synced to the backend so other devices can log in). On signup each user is auto-assigned a solid, distinct color from a 12-hue palette; that color is their identity everywhere: avatar, expense rows, ledger lines, net-balance names, and the Add-Expense keypad's send button.
- Rooms (2–10 members) with invite codes; expenses with subset participants; equal/custom/percentage splits with deterministic cent math.
- Balances tab: **Ledger block** ("A owes B ₹X" directional pay-lines from the greedy simplifier — tap a line to settle it), raw net balances, and a **pinned averages block** at the bottom (per-person monthly average emphasized, weekly below, your own row highlighted in your color).
- Immutable events + soft deletes + outbox (`sync_queue`) + WorkManager push/pull sync + LWW conflict handling with local `conflict_log`.

## Build

1. Open in Android Studio (Ladybug+), let Gradle sync (AGP 8.7.3 / Kotlin 2.0.21, compileSdk 35, minSdk 24).
2. Start the backend (`../settle-now-backend`; apply `db/schema.sql` first) and set `SYNC_BASE_URL` in `SettleNowApp.kt`:
   - Emulator: `http://10.0.2.2:4000/` · Physical device: your LAN IP.
3. Run the `app` configuration. DB version 4 — older installs reset once (destructive migration).

## Phases

1. Local-only: auth + colors, rooms, subset-participant expenses, balances, ledger block, pinned averages ✅
2. Backend + push/pull sync (WorkManager: periodic 15 min + foreground) ✅
3. Conflict log (LWW by `updated_at`, losers preserved locally & server-side), invite-code join, sync-status UI ✅
4. Custom/percentage splits, settle-up flow with confirmation, colored keypad send, UI polish ✅
