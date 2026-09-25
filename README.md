# KenRho Park Tennis Club — member portal & accounting

A complete club website: a public marketing site, Google sign-in with an
approval workflow, self-service membership payments with proof-of-payment
uploads, auto-generated PDF invoices/receipts, and full double-entry
bookkeeping (T-accounts, trial balance, income statement, balance sheet) —
all running on **Supabase** (database, auth, file storage) and deployable as
a static site to **Vercel**, versioned on **GitHub**.

No backend server to run — this is a plain HTML/CSS/JS site that talks to
Supabase directly from the browser, protected by Row Level Security (RLS).

---

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project**. Note your
   project's **Project URL** and **anon public key** (Project Settings → API).
2. Open the **SQL Editor** and run these three files from `supabase/`, **in
   order**, each as its own query:
   1. `01_schema.sql` — tables, triggers, the double-entry posting logic, and
      the reporting functions/views.
   2. `02_policies.sql` — Row Level Security so members only ever see their
      own data, and creates the private `receipts` storage bucket.
   3. `03_seed_accounts.sql` — a starter chart of accounts (cash, accounts
      receivable, membership revenue, common club expenses, etc.). Edit or
      extend this list any time — just keep account `code`s unique.

### Enable Google sign-in
1. In Supabase: **Authentication → Providers → Google** → toggle it on.
2. You'll need a Google OAuth Client ID/Secret from
   [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   (OAuth consent screen + "Web application" credentials). Set the
   **Authorized redirect URI** Google asks for to the callback URL Supabase
   shows on that same screen (looks like
   `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`).
3. Back in Supabase, paste the Google Client ID and Secret in and save.
4. In **Authentication → URL Configuration**, add your site's URL (and
   `http://localhost:3000` while testing) to **Redirect URLs**.

### Make yourself an admin
Sign in to the site once with Google so your profile row is created, then
run this in the SQL Editor (swap in your email):

```sql
update public.profiles
set role = 'admin', status = 'approved'
where email = 'you@example.com';
```

Everyone who signs up after that starts as a regular `member` with
`status = 'pending'`, exactly as intended.

---

## 2. Configure the site

Edit `js/config.js`:

```js
window.KENRHO_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT-REF.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-ANON-PUBLIC-KEY",
  CLUB_NAME: "KenRho Park Tennis Club",
};
```

The anon key is meant to be public — Row Level Security in
`02_policies.sql` is what actually keeps data safe, not this key.

Swap `assets/logo.png` for a higher-resolution version of the crest any
time — every page reads the logo from that one file, including generated
PDFs.

---

## 3. Push to GitHub, deploy on Vercel

```bash
git init
git add .
git commit -m "KenRho Park Tennis Club site"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/kenrho-tennis-club.git
git push -u origin main
```

Then in [vercel.com](https://vercel.com): **Add New → Project → Import**
your GitHub repo. It's a static site (no framework, no build command) —
Vercel will detect that automatically from `vercel.json`. Deploy.

Once you have your live Vercel URL, add it to Supabase's **Redirect URLs**
(Authentication → URL Configuration) so Google sign-in can return to it.

---

## 4. How the money side works

**Chart of accounts** (`accounts` table) — standard club categories: Cash,
Accounts Receivable, Membership Revenue, Court Maintenance Expense, etc.
Add more from a SQL query or a future admin screen; just keep `type`
(`asset`/`liability`/`equity`/`revenue`/`expense`) and `normal_balance`
(`debit`/`credit`) correct.

**Every transaction is double-entry.** You never edit account balances
directly — everything flows through `journal_entries` + `journal_lines`:

- **Admin creates an invoice** → a trigger automatically posts
  *Dr Accounts Receivable / Cr Membership Revenue*.
- **Admin verifies a member's uploaded receipt** → posts
  *Dr Cash / Cr Accounts Receivable*, marks the invoice paid (or partially
  paid), stamps a receipt number, and — if the invoice's member was still
  `pending` — approves their membership.
- **Anything else** (court maintenance, sponsorship, bank charges, an
  equipment purchase) → the admin posts a **manual journal entry** from the
  Journal tab, picking any two or more accounts; the app blocks posting
  until debits equal credits.

**Reports** (Admin → Financial reports) are computed live from the journal,
never stored separately, so they're always up to date:
- **T-accounts** — every account's running debit/credit history.
- **Trial balance** — every account's balance as of a chosen date.
- **Income statement** — revenue less expenses for a date range.
- **Balance sheet** — assets, liabilities and equity as of a date.

**Period close:** at each financial year-end, post one manual journal entry
that closes the year's net income into "Club Equity / Retained Funds"
(account 3000), the same way a treasurer would in a paper cashbook. This
keeps the balance sheet accurate going into the new year without the app
needing to guess your financial year-end.

**Approval modes** (Admin → Settings): choose whether new members need an
admin to approve them by hand, or are approved automatically the moment
they upload a payment proof (their receipt still shows as "pending" until
an admin verifies it against the bank statement — only the *membership*
status is auto-approved, not the accounting).

---

## 5. What members and admins can each do

**Members** (once signed in with Google):
- See their membership status (pending / approved / rejected / suspended).
- See invoices raised for them and download a branded PDF of each.
- Upload proof of payment (file goes to a private Supabase Storage bucket
  only they and staff can read) against a specific invoice or as a general
  payment.
- Download a PDF receipt once an admin verifies their payment.

**Admins / treasurers**:
- Approve, reject or suspend members.
- Verify or reject uploaded payment proofs (with a one-click "view file").
- Generate invoices for any approved member.
- Post manual journal entries for non-membership income and expenses.
- View T-accounts, trial balance, income statement and balance sheet.
- Edit club settings: fee amount, banking details, currency, approval mode.

To give someone treasurer access without full admin rights, use the "Make
treasurer" button on the Members tab — treasurers can do everything above
except nothing is currently restricted further between admin/treasurer;
extend the `is_staff()` policy in `02_policies.sql` if you want a finer
split later.

---

## 6. Court booking

`booking.html` lets approved members book any of the six courts up to a
configurable number of days ahead (default 14, set in Admin → Settings).
Every booking is one of:

- **Free** — holds the slot for casual play, no payment needed.
- **Paid** — guarantees the slot, at the configured hourly court fee, and
  **can bump an existing free booking off that slot**. A paid booking can
  never be bumped by anything.

All of this is enforced server-side in a single Postgres function
(`create_booking` in `supabase/04_courts_and_bookings.sql`), not just in the
frontend, so it can't be bypassed. Paid bookings go through the same
upload-proof → admin-verifies → journal-entry flow as membership fees,
posting to the **Court Hire Revenue** account (4200) instead of Membership
Revenue. The homepage shows a public, identity-free "what's booked today"
grid via a `get_availability()` function that never exposes who booked a
slot — only whether it's free, paid, or open.

Admins can also book on behalf of a walk-in / day visitor with no account
(Admin → Court bookings), and cancel any booking.

**Run `supabase/04_courts_and_bookings.sql` after the other three SQL
files** to add this feature to an existing project.

---

## 7. Installable app (PWA)

The site is a installable Progressive Web App: `manifest.webmanifest` +
`sw.js` (service worker) let a visitor "Add to Home Screen" / "Install" it
on desktop or mobile, with an icon generated from the club crest. The
service worker only ever caches the static shell (HTML/CSS/JS/icons) for
fast loads and an offline fallback page — it never caches Supabase data, so
members always see live membership, booking and payment information when
online.

---

## 8. Read-aloud announcements

The homepage's "Club news" section includes a 🔊 **Read aloud** button on
each announcement, using the browser's built-in Web Speech API
(`js/read-aloud.js`) — no external service or API key required. Add a new
announcement by copying one of the `<div class="card">` blocks in the
"Club news" section of `index.html`; any block with a `data-read-aloud`
attribute pointing at a paragraph's `id` gets the button's play/pause
behaviour automatically.

> **Note on the reference repo:** I read `weafrica/efootball-leagues` via
> the alphaXiv GitHub connector. Its "Stories" feature turned out to be a
> branching multilingual text-adventure game with *pre-recorded* narration
> (an offline Piper text-to-speech pipeline, audio files stored per
> story/per language) — a mute/unmute toggle, not a live reader, and not
> something that fits a club announcements page. The repo's actual **live**
> read-aloud feature lives elsewhere (on comments and a rules page), and
> its core idea — actively picking the best natural-sounding voice a
> visitor's browser happens to have installed, instead of settling for
> whatever robotic voice the browser defaults to — is genuinely useful, so
> `js/read-aloud.js` now does that (written fresh for this club site, not
> copied code).

---

## 9. Ideas for next steps

- **Scheduled invoicing**: add a Supabase Edge Function on a cron schedule
  to auto-generate the next period's invoices for every approved member.
- **Email notifications**: trigger a Supabase Edge Function (or a service
  like Resend) on receipt verification to email the PDF receipt.
- **CSV export** of the trial balance / ledger for your accountant, using
  the same `get_trial_balance` / `v_ledger_detail` queries this app already
  uses.
- **Court booking calendar** as a further module, using the same auth and
  approved-member gate already in place.
