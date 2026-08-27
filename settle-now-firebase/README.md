# Settle Now — Android (Firebase Firestore edition)

Offline-first room-based expense splitter. Kotlin + Jetpack Compose + **Firebase Firestore** (no custom server, no Room, no WorkManager — Firestore snapshot listeners + native offline persistence handle everything).

## Features

- Rooms (2–10 members) with 6-char invite codes; join requires internet exactly once
- Expenses with subset participants and three split types: equal / custom amounts / percentage — deterministic integer-cent allocation everywhere
- Immutable events: "editing" an expense creates a corrected document and flags the old one `is_deleted + superseded_by` in one atomic batch; security rules forbid any other field mutation
- Client-side balance math + greedy debt simplification → minimal settlements
- Ledger tab: chronological audit trail of expenses + settlements with member & date-range filters, tap to expand per-participant shares
- Weekly/monthly totals + per-person averages computed from the local cache (works offline)
- Per-row sync status via `SnapshotMetadata.hasPendingWrites()`, persistent offline banner via ConnectivityManager

## Firebase setup (one-time)

1. Create a project at https://console.firebase.google.com
2. Add an Android app with package **`com.settlenow.firebase`**, download `google-services.json` and replace the placeholder at `app/google-services.json`.
3. **Authentication → Sign-in method → enable Phone.** For testing without SMS costs, add your numbers under *Phone numbers for testing* (any fixed 6-digit code works for them).
4. **Firestore Database → Create database** (production mode).
5. Deploy rules: paste `firestore.rules` into Console → Firestore → Rules → Publish, or use the CLI:
   ```bash
   npm i -g firebase-tools && firebase login
   firebase deploy --only firestore:rules   # firebase.json: {"firestore": {"rules": "firestore.rules"}}
   ```
6. Open the folder in Android Studio (AGP 8.7.3 / Kotlin 2.0.21), let Gradle sync, run.

## Data model

```
/users/{uid}                     name, avatar_initials, phone, rooms[]
/rooms/{roomId}                  name, invite_code, created_by, created_at
/invites/{code}                  room_id                       ← public lookup for join flow
/rooms/{roomId}/members/{uid}    user_id, name, joined_at
/rooms/{roomId}/expenses/{id}    paid_by, amount_cents, description, split_type,
                                 participants: [{user_id, share_cents}],
                                 created_at, is_deleted, superseded_by
/rooms/{roomId}/settlements/{id} from_user, to_user, amount_cents, created_at
```

Money is stored as integer **cents** (`amount_cents` / `share_cents`) instead of a float `amount` — avoids floating-point drift across devices; same shape otherwise as specified.

## Security rules (firestore.rules)

- Everything requires sign-in
- Room reads/writes require a `/members/{uid}` doc (membership-scoped)
- Expense create: `paid_by == request.auth.uid` (no impersonating payments); new docs start alive/un-superseded
- Expense update: only `is_deleted` / `superseded_by` keys may change (immutability enforced server-side)
- Settlement create: `from_user == request.auth.uid` (you can only record debts you pay)
- Join authorization = knowing an unguessable invite code (`/invites/{code}` read gate)

## Edge cases handled

- Member leaves room: own member doc removed + room unlinked from profile; historical shares stay in immutable expenses, live balances/simplification cover current members only
- Supersede flow: edit icon on any expense opens a prefilled correction form; saving atomically links old → new via `superseded_by`
- Offline writes queue automatically in Firestore's local cache and flush on reconnect; pending rows show the "Pending" badge until acknowledged
