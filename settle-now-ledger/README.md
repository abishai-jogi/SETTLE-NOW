# Settle Now — Phase 1 (local-only)

Offline-first group expense ledger for Android. Kotlin + Jetpack Compose + Room.

## Phase 1 scope (this build)

- **Login / Signup** — name + password (salted hash in Room). Signup assigns a solid identity color at random from a broad palette, keeping ≥40° hue distance from colors already in use.
- **Home** — Create Ledger / Join Ledger front and center; list of your ledgers. Never auto-opens a ledger after login.
- **Ledger Detail** — invite code chip pinned under the app bar (tap to copy); chat-style expense feed; docked numeric keypad + quick chips (₹32/60/50/75/90); Record / chip opens **Split** (never posts directly).
- **Split** — Equal only (Phase 4 adds Custom / Percentage). Participant checkboxes, editable per-person shares that rebalance, Confirm posts the bubble.
- **Balances** — simplified settlements (greedy debt simplifier), tappable pay-lines → Settle Up, fixed bottom averages (monthly prioritized, weekly below).
- **Local members** — add household members offline from the Members dialog (cross-device invite join is Phase 2).

Sync tables (`sync_queue`, `conflict_log`) and SyncEngine stubs exist for Phase 2, but the UI does not depend on a network.

## Open in Android Studio

1. Open the `settle-now-ledger` folder (AGP 8.7.3 / Kotlin 2.0.21, compileSdk 35, minSdk 24).
2. Let Gradle sync, then run the `app` configuration on an emulator or device.
3. Smoke test: signup → Home → Create Ledger → add a local member → Record amount → Split → Confirm → Balances.

## Next phases (paused — check in before starting)

| Phase | Focus |
|-------|--------|
| **2** | Backend + push/pull sync + realtime channel; verify same invite code → identical data on two devices |
| **3** | Conflict handling, join hardening, sync-status UI |
| **4** | Custom / Percentage splits, settle-up polish |

### Backend choice for Phase 2

Before scaffolding Phase 2, pick one:

1. **Node.js + Express + PostgreSQL** (REST + optional WebSocket) — matches the original stack plan.
2. **Firebase Firestore** — offline persistence + realtime listeners out of the box; usually simpler for cross-device linking.

Say which you want when you’re ready for Phase 2.
