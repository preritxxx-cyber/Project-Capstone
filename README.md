# DutchIT — International Trip Expense Splitter

**DutchIT** is a browser-based web application that helps groups of travellers split shared expenses across **multiple currencies**. It tracks who paid for what, calculates fair balances between members, supports **currency conversion** for settlement in a single base (local) currency, and includes a quick **FX Calculator** for on-the-go conversions during a trip.

This document is written for **beginners**, **reviewers**, and **auditors** who need to understand what the application does, how it is built, and how its financial logic works—without reading every source file first.

---

## Table of Contents

1. [Context & Purpose](#1-context--purpose)
2. [Who It Is For](#2-who-it-is-for)
3. [Core Capabilities](#3-core-capabilities)
4. [Getting Started](#4-getting-started)
5. [User Guide (End-to-End)](#5-user-guide-end-to-end)
6. [Application Design & Navigation](#6-application-design--navigation)
7. [Technical Architecture](#7-technical-architecture)
8. [Project Structure](#8-project-structure)
9. [Data Model & Persistence](#9-data-model--persistence)
10. [Business Logic (For Auditors)](#10-business-logic-for-auditors)
11. [FX Calculator](#11-fx-calculator)
12. [Analysis Module](#12-analysis-module)
13. [UI & Visual Design](#13-ui--visual-design)
14. [Security, Privacy & Limitations](#14-security-privacy--limitations)
15. [Auditor Checklist](#15-auditor-checklist)
16. [Scripts & Build Output](#16-scripts--build-output)

---

## 1. Context & Purpose

### The problem

When friends travel internationally, expenses often happen in **foreign currencies** (cash, cards, local shops), while settlement may happen later in **home/local currency** (e.g. INR). Typical challenges:

- Different people pay at different times.
- One bill is split among several members.
- Exchange rates vary by day and by transaction.
- “Who owes whom?” must be fair and traceable.

### What DutchIT solves

DutchIT provides a **single place per trip (group)** to:

| Need | How DutchIT addresses it |
|------|---------------------------|
| Record expenses | Multi-step expense form with category, amount, payers, and split |
| Multi-currency | Amounts and payments can use any supported ISO currency |
| Fair balances | Pairwise ledger: paid for others’ shares vs owed on others’ expenses |
| Settlement currency | Group **base currency** — all balances normalize to this |
| Real exchange rates | Log conversion trades; app uses **volume-weighted** averages |
| Quick mental math | **FX Calculator** with saved preset rates or trip averages |
| Spending insights | **Analysis** tab with filters and charts (category, person, date) |

### Deployment model

- **Client-only**: no backend server in this project.
- All data lives in the browser **`localStorage`** on the user’s device.
- Suitable for demos, capstone projects, and offline-first prototypes—not for multi-device sync without additional infrastructure.

---

## 2. Who It Is For

| Audience | Use |
|----------|-----|
| **Travellers / students** | Create a trip group, add expenses, see who owes what |
| **Group organisers** | Invite via Group ID, manage members, log currency exchanges |
| **Beginner developers** | Learn SPA routing, modular JS, and local persistence |
| **Auditors / faculty** | Verify balance formulas, conversion math, and data flows |

---

## 3. Core Capabilities

### Trips (Groups)

- Create/edit trips with name, picture (emoji or image), **base (local) currency**, optional **intermediate currency** (e.g. USD as bridge).
- Add **guest members** (no account) or **joined members** (same app, different user ID).
- Share **Group ID** so others can join from their dashboard.

### Expenses

- **4-step wizard**: Details → Amount → Payment → Settlement.
- Categories: food, accommodation, transport, shopping, entertainment, other.
- **Multiple payers** on one expense (split payment).
- **Split types**: equal, percentage, or absolute amounts.
- Optional invoice number/date and transaction charges.

### Balances

- **Pairwise net balance** between every pair of members (in base currency).
- **Overall net** per member and **suggested settlements** (simplified pay flows).
- Dashboard snippet: “You are owed” / “You owe” per trip.

### Conversions (within a trip)

- Record real exchange trades: amount sold (source) + amount bought (target).
- **Average rate** = sum of bought amounts ÷ sum of sold amounts (not average of per-trade rates).
- Supports paths through **intermediate currency** via graph traversal (BFS).
- Fallback rates to USD if no logged trades exist.

### FX Calculator (global)

- Accessible from **header “FX” button** or **bottom-left FAB** on any screen after login.
- **Preset rate** stored on device (e.g. 1 INR = 180 IDR).
- Optional **trip average** when viewing a group.
- Instant convert foreign ↔ local with formula shown.

### Analysis (per trip)

- **Filters**: date range, category, member — combine any filters.
- **Summary KPIs**: total spend, expense count, average per expense (all in base currency).
- **Charts** (Chart.js):
  - **Category** — doughnut chart + table with % share
  - **Person** — bar chart of amount **paid** vs **share (owed)** per member
  - **Date** — line chart of daily spend over invoice dates
- Amounts are converted to the group **base currency** using the same rate engine as balances.

---

## 4. Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+ recommended)
- npm (comes with Node.js)

### Install dependencies

```bash
npm install
```

### Run locally (development)

```bash
npm run dev
```

Open the URL shown in the terminal (typically `http://localhost:5173`).

### Production build

```bash
npm run build
npm run preview
```

Built files are output to the `dist/` folder.

### First launch

1. Enter your **display name** (onboarding).
2. **Create a group** (trip) with base currency.
3. Add expenses and open **Balances** / **Conversions** tabs as needed.
4. Use **FX** anytime for quick currency math.

---

## 5. User Guide (End-to-End)

### 5.1 Onboarding

- User profile: `userId`, `displayName`, `createdAt`.
- Stored under `dutchit_user` in localStorage.
- No password; identity is device-local.

### 5.2 Dashboard (“My Trips”)

- Lists all groups where the current user is a member.
- Actions: **Create group**, **Join group** (paste Group ID), open a trip card.
- Each card shows member count, expense count, base currency, and balance summary.

### 5.3 Creating a group

| Field | Meaning |
|-------|---------|
| Group name | Trip label (unique per creator) |
| Picture | Emoji or uploaded image |
| Base / local currency | Currency used to **settle all balances** |
| Intermediate currency (optional) | Bridge currency (e.g. USD) for conversion chains |
| Members | Creator + optional guest names |

### 5.4 Adding an expense

| Step | Content |
|------|---------|
| 1. Details | Particulars, category, invoice #/date |
| 2. Amount | Total amount + currency; optional transaction charges |
| 3. Payment | Who paid how much (can be multiple people/currencies) |
| 4. Settlement | Who shares the cost (equal / % / fixed); must balance to total |

### 5.5 Viewing balances

Open group → **Balances** tab:

1. **Your summary** — paid for others’ shares, owes on others’ expenses, net.
2. **Per-member breakdown** — same metrics for everyone.
3. **Pairwise matrix** — net between each pair.
4. **Suggested settlements** — who should pay whom in base currency.

### 5.6 Logging conversions

Open group → **Conversions** tab → **Record Conversion**:

- Enter source currency + amount sold.
- Enter target currency + amount bought.
- Implied rate for that trade = bought ÷ sold.
- Trip-wide average aggregates **all** trades for that pair (both directions).

### 5.7 Using FX Calculator

- Tap **FX** (header or floating button).
- Set local + foreign currency.
- Choose **Preset rate** or **Trip average** (inside a trip).
- Type an amount; result updates live with formula.

### 5.8 Using Analysis

1. Open a trip → **Analysis** tab.
2. Use **filters** (optional):
   - **From / To date** — limits by invoice date
   - **Category** — one category or all
   - **Member** — expenses where that member paid or has a settlement share
3. Review **summary cards** at the top (total, count, average).
4. Inspect three sections:
   - **By category** — where money went (food, transport, etc.)
   - **By person** — who paid vs whose share of costs
   - **By date** — spending trend across the trip timeline
5. Click **Reset** to clear all filters.

---

## 6. Application Design & Navigation

### Routing (hash-based)

| URL hash | Screen |
|----------|--------|
| `#` (empty) | Dashboard |
| `#group/{groupId}` | Trip detail (tabs) |
| `#join/{groupId}` | Auto-join then redirect to group |

Router: `src/main.js` — listens to `hashchange`, renders the appropriate view, closes modals on navigation.

### Trip detail tabs

| Tab | Purpose |
|-----|---------|
| **Expenses** | List, add (FAB), edit, delete |
| **Analysis** | Filters, KPIs, charts (category / person / date) |
| **Balances** | Net balances and settlements |
| **Conversions** | Exchange log and average rates |
| **Members** | List, invite ID, remove guests |

### Global UI elements

- **App header** — branding, join, FX, user menu.
- **FAB (bottom-right)** — add expense (inside a trip) or create group (dashboard).
- **FAB FX (bottom-left)** — FX Calculator everywhere after login.
- **Modals** — forms and confirmations.
- **Toasts** — success/error feedback.

---

## 7. Technical Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser (Client)                        │
├─────────────────────────────────────────────────────────────┤
│  index.html → main.js (router)                              │
│       │                                                     │
│       ├── UI Layer (src/ui/*)                               │
│       │     dashboard, groupView, expenseForm, modals, …    │
│       │                                                     │
│       ├── Business Logic (src/js/*)                         │
│       │     groups, expenses, user, fxCalculator, currencies  │
│       │                                                     │
│       └── Persistence (store.js → localStorage)             │
│             dutchit_user | dutchit_groups | dutchit_expenses│
│             dutchit_fx_calculator (FX presets)              │
└─────────────────────────────────────────────────────────────┘
```

### Layer responsibilities

| Layer | Role |
|-------|------|
| **UI** | HTML strings, events, modals; no direct localStorage except via stores |
| **Business logic** | Validation, splits, balances, rates, IDs |
| **Store** | CRUD for user, groups, expenses |
| **CSS** | Design tokens, layout, components |

### Key dependencies

- **Vite** — dev server and production bundler.
- **Chart.js** — analysis charts (doughnut, bar, line).
- **Inter** (Google Fonts) — typography.
- **Lucide** (CDN) — icons (optional enhancement).

No React/Vue; **vanilla ES modules**.

---

## 8. Project Structure

```
Hello/
├── index.html              # Shell, toast & modal containers
├── package.json
├── README.md               # This file
├── dist/                   # Production build (generated)
└── src/
    ├── main.js             # App entry, hash router
    ├── css/
    │   ├── variables.css   # Colors, spacing, z-index
    │   ├── base.css        # Reset, typography
    │   ├── components.css  # Buttons, cards, FAB, forms
    │   ├── layout.css      # Header, modals, trip layout
    │   └── animations.css
    ├── js/
    │   ├── store.js        # localStorage API
    │   ├── user.js         # Current user session
    │   ├── groups.js       # Group CRUD rules
    │   ├── expenses.js     # Splits, balances, FX rates
    │   ├── analysis.js     # Expense aggregations & filters
    │   ├── fxCalculator.js # FX preset store & math
    │   ├── currencies.js   # ISO 4217 list & formatting
    │   └── utils.js        # IDs, dates, categories
    └── ui/
        ├── onboarding.js
        ├── dashboard.js
        ├── groupView.js
        ├── groupForm.js
        ├── expenseForm.js
        ├── conversionForm.js
        ├── analysisTab.js    # Analysis tab UI & Chart.js
        ├── fxCalculator.js   # FX modal UI
        ├── globalFx.js       # Global FX button wiring
        └── modals.js         # Modal stack & toasts
```

---

## 9. Data Model & Persistence

### localStorage keys

| Key | Contents |
|-----|----------|
| `dutchit_user` | Single user object |
| `dutchit_groups` | Array of group objects |
| `dutchit_expenses` | Array of all expenses (all groups) |
| `dutchit_fx_calculator` | FX Calculator presets & last inputs |

### User

```json
{
  "userId": "usr_xxxxxxxxxx",
  "displayName": "Priya",
  "createdAt": "2026-05-25T10:00:00.000Z"
}
```

### Group (trip)

```json
{
  "groupId": "usr_xxx_ABCDEFGHIJ",
  "name": "Bali 2026",
  "picture": "✈️",
  "pictureType": "emoji",
  "baseCurrency": "INR",
  "intermediateCurrency": "USD",
  "creatorId": "usr_xxx",
  "members": [
    {
      "memberId": "usr_xxx",
      "name": "Priya",
      "isCreator": true,
      "isDummy": false,
      "joinedAt": "..."
    }
  ],
  "conversionRates": [],
  "createdAt": "...",
  "updatedAt": "..."
}
```

### Conversion rate entry (inside group)

```json
{
  "rateId": "rate_xxxxxxxxxx",
  "from": "USD",
  "fromAmount": 100,
  "to": "IDR",
  "toAmount": 1800000,
  "addedBy": "usr_xxx",
  "createdAt": "..."
}
```

### Expense

```json
{
  "expenseId": "exp_xxxxxxxxxx",
  "groupId": "usr_xxx_ABCDEFGHIJ",
  "particulars": "Dinner",
  "category": "food",
  "invoiceNumber": "",
  "invoiceDate": "2026-05-20",
  "amount": { "value": 500000, "currency": "IDR" },
  "transactionCharges": { "value": 0, "currency": "IDR" },
  "payments": [
    {
      "memberId": "usr_xxx",
      "amount": { "value": 500000, "currency": "IDR" },
      "method": "Cash",
      "proportion": 100
    }
  ],
  "settlements": [
    {
      "memberId": "usr_xxx",
      "name": "Priya",
      "splitType": "equal",
      "percentage": 50,
      "calculatedAmount": { "value": 250000, "currency": "IDR" }
    }
  ],
  "createdBy": "usr_xxx",
  "createdAt": "...",
  "updatedAt": "...",
  "editHistory": []
}
```

---

## 10. Business Logic (For Auditors)

### 10.1 Expense split validation

| Split type | Rule |
|------------|------|
| **Equal** | Total divided by included members; rounding remainder to first member |
| **Percentage** | Sum of percentages must equal 100% |
| **Absolute** | Sum of entered amounts must equal expense total |

### 10.2 Currency conversion for balances

All monetary amounts are converted to the group **base currency** using `getAverageRate(group, fromCurrency, toCurrency)`:

1. **Logged trades** — build a graph of currency pairs with edge rate = `Σ target amounts ÷ Σ source amounts` per direction.
2. **Path finding** — BFS from foreign currency to base; multiply rates along path (supports intermediate currency hops).
3. **Fallback** — if no path, derive from built-in USD cross-rates (approximate; marked as default).

**Important for auditors:** Volume-weighted average uses **sums of amounts**, not the average of per-trade implied rates.

**Example:**

| Trade | Sold | Bought |
|-------|------|--------|
| 1 | 100 USD | 1,800,000 IDR |
| 2 | 200 USD | 4,000,000 IDR |

Average USD→IDR = (1,800,000 + 4,000,000) ÷ (100 + 200) = **19,333.33 IDR per USD**  
(not (18,000 + 20,000) / 2 = 19,000).

### 10.3 Pairwise balance (core rule)

For member **Y** relative to member **X** (amounts in base currency):

```
Net(Y vs X) = PaidForXByY − OwedByYOnXExpenses
```

| Term | Meaning |
|------|---------|
| **PaidForXByY** | Portion of Y’s payments that cover X’s settlement share |
| **OwedByYOnXExpenses** | Portion of Y’s settlement share on expenses where X paid |

**Allocation per expense:** For each payment by P and each settlement by S (P ≠ S):

```
portion = paymentAmount × (settlementShare / totalSettlementShares)
```

- Increases `paidFor[P][S]` and `owedOn[S][P]`.

**Interpretation:**

| Net sign | Meaning |
|----------|---------|
| **Positive** | X owes Y |
| **Negative** | Y owes X |
| **~0** | Settled between Y and X |

### 10.4 Overall member balance

For each member M:

```
paid  = Σ (paidFor[M][other])   over all other members
owed  = Σ (owedOn[M][other])
net   = Σ (net[M][other])       = paid − owed (pairwise sum)
```

### 10.5 Suggested settlements

Greedy algorithm on overall net balances:

1. Split members into **creditors** (net > 0) and **debtors** (net < 0).
2. Match largest debtor to largest creditor; transfer minimum of the two.
3. Repeat until balances are cleared (standard debt simplification).

Output: list of `{ from, to, amount, currency: baseCurrency }`.

---

## 11. FX Calculator

Separate from trip accounting; for **quick conversions** while travelling.

| Setting | Storage | Description |
|---------|---------|-------------|
| Local currency | `dutchit_fx_calculator` | Home/settlement currency (e.g. INR) |
| Foreign currency | same | Trip spending currency (e.g. IDR) |
| Preset rate | same | User-defined; persists until changed |
| Rate meaning | same | “1 local = X foreign” or “1 foreign = X local” |
| Rate source | same | `preset` or `average` (trip only) |

**Preset example (India → Indonesia):**

- Rate = **180**, meaning **1 INR = 180 IDR**
- Foreign → local: `INR = IDR ÷ 180`
- 180,000 IDR → 1,000 INR

**Trip average:** Uses the same `getConversionStats` / `getAverageRate` logic as the Conversions module for the active trip.

---

## 12. Analysis Module

### Purpose

Help trip organisers and auditors **understand spending patterns** without exporting data. All analytics use the same expense records as balances, normalized to **base currency**.

### Filters (`src/js/analysis.js`)

| Filter | Field used | Behaviour |
|--------|------------|-----------|
| Date from / to | `invoiceDate` (fallback: `createdAt`) | Inclusive range |
| Category | `expense.category` | Exact match; empty = all |
| Member | payments + settlements | Expense included if member paid **or** has a share |

### Aggregations

| View | Metrics | Chart type |
|------|---------|------------|
| **Category** | Sum of expense total (+ charges) per category | Doughnut |
| **Person** | Per member: **paid** (sum of payments), **share** (sum of settlements) | Grouped bar |
| **Date** | Sum per invoice date | Line (filled area) |

**Category total formula** (per expense, in base currency):

```
total = convert(amount) + convert(transactionCharges)
```

**Person paid** — each payment line converted from its currency to base.  
**Person share** — each settlement `calculatedAmount` converted to base.

### UI files

- `src/js/analysis.js` — pure data: filter, aggregate, summary.
- `src/ui/analysisTab.js` — HTML, Chart.js mount/destroy, filter events.

Charts are destroyed and recreated when filters change to avoid memory leaks.

### Example audit questions Analysis answers

- “How much did we spend on food?” → Category filter + chart.
- “Who paid the most upfront?” → Person chart, **Paid** bars.
- “Which day was most expensive?” → Date line chart peak.
- “What did Priya spend in March?” → Member + date filters.

---

## 13. UI & Visual Design

### Design language

- **Primary**: deep blue (`#1E3A8A` family) — trust, travel.
- **Accent**: orange (`#F97316`) — CTAs, FAB, highlights.
- **Semantic**: green (owed to you), red (you owe), neutral gray.
- **Font**: Inter, weights 300–800.
- **Components**: cards with hover lift, gradient headers on trip view, step wizard for expenses.

### Accessibility notes

- Buttons use `aria-label` on FX FAB.
- Form labels tied to inputs where applicable.
- Color is supplemented with text (“You are owed”, “owes”) for balance states.

### Responsive behaviour

- CSS adapts padding and grids on smaller viewports (`layout.css` media queries).
- Tables (conversion history) scroll horizontally on narrow screens.

---

## 14. Security, Privacy & Limitations

### Privacy

- Data never leaves the browser unless the user exports/shares manually (e.g. copying Group ID).
- Clearing site data removes all trips and expenses.

### Security

- **No authentication** — anyone with device access can use the app.
- **No server-side validation** — business rules enforced only in client JS.
- **No encryption** of localStorage.

### Known limitations

| Limitation | Impact |
|------------|--------|
| Single browser / device | No sync between phone and laptop |
| Guest members | Cannot log in separately; organiser enters for them |
| Fallback FX rates | Approximate when no conversions logged |
| Rounding | Small cent-level differences possible on splits |
| No export/PDF | Balances and analysis visible in UI only |
| No audit log | Expense edit history stores snapshots but no dedicated audit UI |

---

## 15. Auditor Checklist

Use this when reviewing the capstone or conducting a functional audit:

- [ ] **Onboarding** creates user and persists after refresh.
- [ ] **Group creation** enforces unique name per creator.
- [ ] **Join by ID** adds user to `members` without duplicating.
- [ ] **Expense wizard** blocks save if split does not match total.
- [ ] **Multi-payer expense** updates pairwise balances for all non-self pairs.
- [ ] **Pairwise matrix** cell (Y,X) matches manual calculation for a sample expense.
- [ ] **Sign convention**: positive net = column member owes row member (documented on UI).
- [ ] **Conversion log** changes balance amounts when expense currency ≠ base.
- [ ] **Volume-weighted rate** matches Σbought/Σsold for test trades.
- [ ] **Intermediate currency** path used when direct base pair not logged.
- [ ] **FX Calculator** preset persists after reload.
- [ ] **FX trip average** disabled on dashboard; enabled inside trip.
- [ ] **Analysis** category totals match sum of filtered expense amounts (base currency).
- [ ] **Analysis** person “paid” matches sum of that member’s payment lines (converted).
- [ ] **Analysis** date chart updates when date filters applied.
- [ ] **Analysis** member filter only includes expenses where member paid or has share.
- [ ] **Delete expense** recalculates balances.
- [ ] **Delete group** removes linked expenses from store.

### Suggested test scenario

1. Create group: base **INR**, members A, B, C.
2. Expense 900 INR, paid by A, split equally → B and C each owe A 300 INR pairwise.
3. Log conversion 100 USD → 8,300 INR; add expense 100 USD with split; verify INR equivalent uses 83 INR/USD average from log (if no other trades).
4. Open FX: preset 1 INR = 190 IDR; enter 19,000 IDR → expect 100 INR.

---

## 16. Scripts & Build Output

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server with hot reload |
| `npm run build` | Bundle to `dist/` for static hosting |
| `npm run preview` | Serve production build locally |

### Hosting

Deploy the `dist/` folder to any static host (GitHub Pages, Netlify, etc.). Ensure SPA fallback routes hashes to `index.html` if using clean URLs (current app uses hash routing, so no server rewrite required).

---

## Summary

**DutchIT** is a **local-first, multi-currency expense splitter** for international group travel. Its distinguishing features for reviewers are:

1. **Pairwise balance engine** tied to who paid and who shared each expense.  
2. **Volume-weighted conversion rates** from real exchange logs.  
3. **Base-currency settlement** with optional intermediate currency.  
4. **Global FX Calculator** for quick preset or trip-average conversions.
5. **Analysis dashboard** with filters and Chart.js visualizations.

For questions about a specific calculation, see `src/js/expenses.js` (balances & rates), `src/js/analysis.js` (aggregations), and `src/js/fxCalculator.js` (standalone FX tool).

---

*DutchIT — Level 2 Capstone · ICAI AI Class*
