# Supabase setup — step-by-step

Follow these steps **in order** after schema + RLS are in the SQL editor.

---

## Step 1 — Supabase Dashboard (one-time)

1. **Authentication → Providers → Email**  
   - Enable Email provider.  
   - For development: turn **OFF** “Confirm email” (otherwise sign-up won’t get a session until the user clicks the link).

2. **Project Settings → API**  
   - Copy **Project URL** and **anon public** key.

3. **Project Settings → API → Exposed schemas**  
   - Ensure `public` is exposed (default).

---

## Step 2 — Run extra SQL

In **SQL Editor**, run:

`supabase/003_app_functions.sql`

This adds:

- `lookup_group_by_join_code()` — required for **Join Group** before you’re a member  
- Realtime publication on trip tables (for live updates later)

If Realtime lines fail with “already member of publication”, skip them — they’re optional.

---

## Step 3 — Local env file

1. Copy `.env.example` → `.env.local` (same folder as `package.json`).
2. Set:

```env
VITE_DATA_MODE=cloud
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

3. Restart dev server after any env change:

```bash
npm run dev
```

To keep **offline-only** behaviour:

```env
VITE_DATA_MODE=local
```

---

## Step 4 — Code already wired (what changed)

| File | Role |
|------|------|
| `src/js/config.js` | `VITE_DATA_MODE`, Supabase URLs |
| `src/js/supabaseClient.js` | Supabase JS client |
| `src/js/auth.js` | Sign up / sign in / session |
| `src/js/dataLayer.js` | Cache + cloud hydrate/sync |
| `src/js/store.js` | Same API as before; writes to cache + Supabase |
| `src/js/repositories/supabaseSync.js` | SQL ↔ app JSON mappers |
| `src/js/user.js` | Cloud auth user profile |
| `src/ui/onboarding.js` | Email/password when `cloud` mode |
| `src/main.js` | Async init: auth → hydrate → route |
| `src/js/groups.js` | Async join via cloud |

**UI, routing, and business logic (`expenses.js`, balances, analysis) are unchanged.**

---

## Step 5 — Verify the app

1. Open `http://localhost:5173`
2. **Sign up** with email, password, display name.
3. **Create a trip** → check Supabase **Table Editor**:
   - `groups` — one row, `join_code` = Group ID in app  
   - `group_members` — creator row  
4. **Add an expense** → check `expenses`, `expense_payments`, `expense_settlements`.
5. **Second browser / incognito** → sign up as another user → **Join Group** with the Group ID → same trip appears.

---

## Step 6 — Troubleshooting

| Symptom | Fix |
|---------|-----|
| “Supabase env vars missing” | Create `.env.local`, restart `npm run dev` |
| Sign up succeeds but not logged in | Disable email confirmation (Step 1) |
| Join: “Group not found” | Run `003_app_functions.sql`; check `join_code` in DB |
| RLS / permission errors | Confirm user is signed in; check policies match schema |
| `payment_method` / enum errors | Payment `method` must match DB enum (e.g. `Credit Card`) |
| Guest member fails | Guests must have `is_guest = true`, `profile_id` null |

---

## Step 7 — Next (optional)

- **Realtime**: subscribe in `groupView.js` to `expenses` where `group_id = …`  
- **Import old localStorage**: one-time script reading `dutchit_groups` / `dutchit_expenses`  
- **Storage**: move group picture uploads to Supabase Storage instead of base64 in `picture`

---

## Architecture reminder

```
UI → groups.js / expenses.js → store.js → dataLayer → supabaseSync → Postgres
                              ↘ localStorage (when VITE_DATA_MODE=local)
```

Hash routes stay `#group/{groupId}` where `groupId` = `groups.join_code`.
