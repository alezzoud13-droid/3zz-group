# Smoke tests (golden master)

Characterization tests for «أداء فريق العز». They drive the real `index.html` / `intake.html` in headless Chromium
against an in-memory fake of Supabase and record **every database write, RPC and Excel export** each user flow produces.
`baseline.json` was recorded from the production code before the restyle; after the restyle the same flows must
produce the same log. A difference in a scenario's writes/exports = functional regression.

## Run

```bash
# 1. serve the app you want to check (any static server)
cd <app folder> && python3 -m http.server 8801

# 2. compare against the baseline (exit code 0 = no regression)
node tests/smoke/smoke.js
APP_URL=http://localhost:9000/ node tests/smoke/smoke.js     # other port/path

node tests/smoke/smoke.js --only shipper        # subset: name contains "shipper"
node tests/smoke/smoke.js --only render:admin   # subset of the render checks
node tests/smoke/smoke.js --show                # also print the recorded writes
node tests/smoke/smoke.js --strict-render       # render-summary differences fail too
SMOKE_DEBUG=1 node tests/smoke/smoke.js ...     # full stack traces for failed steps

# re-record the baseline — ONLY from known-good code
node tests/smoke/smoke.js --update
```

Needs the globally installed Playwright (`require('playwright')`); nothing to install, no package.json. Runs in ~25 s.

## Files

| file | what |
|---|---|
| `smoke.js` | runner: network interception, render checks, scenarios, compare/update |
| `fake-supabase.js` | `window.supabase.createClient()` backed by an in-memory DB + `window.XLSX` stub. Records `window.__writes` / `window.__exports` |
| `fixtures.js` | fake members, campaigns, quotas, influencers, deals in every stage, requests, daily reports, settings |
| `baseline.json` | the recorded contract (one line per write, so `git diff` is readable) |

## How it works

- The supabase-js CDN script is answered with `fixtures.js + fake-supabase.js`, the SheetJS CDN script with a stub.
  `localhost` passes; Google Fonts and **every other host is aborted** — the real Supabase project is never contacted
  (an attempt is a failure).
- The signed-in person is `window.__PERSONA` (admin, approver, creator, shipper, media, snap, anon, pending…).
  The fake applies the same row visibility as the RLS policies (creator sees own deals, shipper sees approved ones, …),
  column defaults, `updated_at`, the `request_events → requests` trigger and the RPCs
  `infl_lookup`, `quota_grant`, `intake_get`, `intake_submit`.
- The browser clock is pinned (`FROZEN_NOW` in `smoke.js`, Asia/Riyadh) and fixture dates are relative to it, so
  late/soon states and every result are the same on any day. The log is normalised anyway:
  timestamps → `<ts>`, today → `<today>`, generated ids → `<uuid>`, key material → `<blob>`, fixture ids → aliases
  such as `@deal.pending1`.
- Each scenario starts from a fresh page and a fresh DB, so scenarios are independent.
- **Selectors are ids and `data-*` attributes only** (enforced by `lint()` in `smoke.js`). Classes, tags and visible
  text may change freely.

## What is covered

**Part A – render (53 checks):** 6 personas × 8 routes, plus login view, "waiting for activation" view, admin team
summary, intake page (valid / bad token). Asserts: no page error, no console error, the right view visible and
non-empty, the other views hidden, nothing written. Also stores a structural summary (counts per id / per data
attribute, queue sizes, badge numbers) — differences are printed but informational unless `--strict-render`.

**Part B – actions (62 scenarios → writes):** approver bulk approve / reject / send back / backup (list and deal
modal); acquisition approve / send back / reject; raw video approve / return; admin bulk pay approval, pay-go
"تم الدفع" (bulk and modal, undo); shipper bulk shipped / delivered and modal shipped / failed / delivered; media and
snap launch (list and modal); creator: new acquisition (draft, send, duplicate + colleague checks), fix & resend,
contacts + agreement, campaign nomination (draft, send, from an agreed file, delete draft, fix & resend), quota
request, flags + address, raw video link, posting per platform + code edit, close file; admin reopen, admin approving
the approver's own work; requests: create, start, deliver, redeliver, approve, return, comment, edit, cancel, reopen,
quota approve / reject; daily report; quotas (admin, approver, cap, even split); campaign create / edit; SLA, member
roles, KPI, daily task lists, bank key generation; Excel exports (dashboard, shipping, Salasil, pay, tracker — file,
sheets, row counts, columns, content digest); intake submit / resubmit / bad token; sign in / out / up / resend;
a read-only browsing tour that must write nothing.

## What is NOT covered

- Looks: no screenshots, no layout/RTL/dark-mode/mobile checks.
- The real database: guard triggers (approver-only, pay approval, quota cap), constraints, audit log, real auth and
  e-mail confirmation. The fake accepts any write and just records it.
- Bank details: encrypting on the intake page (fixtures have no `bank_pub`), decrypting / loading the private key file.
- Clipboard buttons (`data-copy`), WhatsApp / account links, browser notifications, the 30 s / 90 s background polling.
- Controls without id / data-attribute: the «هل واجهت مشكلة» radios (`name="i_prob"` only) are not exercised.
  `<summary>` toggles have none either, so the runner opens collapsed `<details>` itself (`t.reveal`) instead of
  clicking them; platform checkboxes share one `data-plat` and are told apart by their `.value`.

## Known production bug kept in the baseline

`approver_acquisition_reject_KNOWN_BUG`: «رفض» inside an influencer file writes `acq_status: "reject"` (not
`"rejected"`) and then throws `Cannot read properties of undefined (reading '0')`. The scenario allows exactly that
page error (`knownPageError`); if it gets fixed, re-record that scenario from the fixed code.

## Adding a scenario

Add an `A('name', 'persona', '#route', async t => { … })` entry to `SCENARIOS` in `smoke.js`. Wrap the click that
must hit the database in `t.write(() => …)`, clicks that must not in `t.quiet(() => …)`, exports in `t.exported(…)`.
Then `node tests/smoke/smoke.js --update --only name` against known-good code.
