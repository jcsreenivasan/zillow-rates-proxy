# zillow-rates-proxy — Project Context

## What this is
A Cloudflare Worker that proxies the Zillow mortgage rate API, plus a self-contained HTML embed for Webflow. The Worker handles CORS, caching, and multi-query rate fetching. The embed renders a live mortgage rate widget with a Purchase/Refinance toggle, loan type tabs, and rate cards.

---

## Architecture

```
zillow-rates-proxy/
├── src/index.js          ← Cloudflare Worker (deployed)
├── webflow-embed.html    ← Self-contained Webflow embed (paste into Custom Code block)
├── wrangler.toml         ← Wrangler config
└── package.json          ← devDependencies: wrangler ^4.70.0
```

---

## Cloudflare Worker (`src/index.js`)

**Live URL:** `https://zillow-rates-proxy.testmesreeni.workers.dev/`

**What it does:**
- Accepts `GET ?program=&loanType=&refinance=` params
- Builds a single multi-query request to Zillow's API using dot-notation params
- Returns JSON with CORS headers (`Access-Control-Allow-Origin: *`) and `Cache-Control: public, max-age=300`

**Zillow API endpoint:** `https://mortgageapi.zillow.com/getCurrentRates`

**Partner ID:** `RD-PLYQVHG`

**Key discovery — Zillow API query format:**
The API requires dot-notation for multi-query requests:
```
queries.p1.program=Fixed30Year
queries.p1.loanType=Conventional
queries.p1.refinance=false
queries.p1.creditScoreBucket=VeryHigh
queries.p1.loanToValueBucket=Normal
```
- JSON string format → fails ("expected type 'dict'")
- Bracket notation `queries[q][program]` → fails ("Unknown member")
- Top-level `program=Fixed30Year` → fails ("Unknown member 'program'")
- Dot-notation → works ✓

**Valid enum values (confirmed):**
- `creditScoreBucket`: `VeryHigh`, `High`, `Low` (others like AboveAverage, Average, Medium are invalid)
- `loanToValueBucket`: `Normal`, `High`, `VeryHigh`
- `program`: `Fixed30Year`, `Fixed15Year`
- `loanType`: `Conventional`, `VA`

**5 price point tiers (PRICE_POINTS array):**
| key | creditScoreBucket | loanToValueBucket |
|-----|-------------------|-------------------|
| p1  | VeryHigh          | Normal            |
| p2  | VeryHigh          | High              |
| p3  | High              | Normal            |
| p4  | High              | High              |
| p5  | Low               | VeryHigh          |

**Points calculation** (API doesn't return points data, so it's approximated):
```js
Math.max(0.001, (parRate - rate) * 4.5).toFixed(3)
// parRate = highest rate in the returned set
```

---

## Webflow Embed (`webflow-embed.html`)

**How to use:** Paste the entire file contents into a Webflow Custom Code Embed block.

**UI structure:**
1. **Purchase / Refinance toggle** — pill with blue ring shadow; active = gradient fill
2. **Loan type tabs** — outlined pill chips (30 Yr Fixed, 15 Yr Fixed, VA)
3. **Rate cards** — one per price point (5 cards), each with 4 columns:
   - Loan Type (label + program name)
   - Interest (hero number — large blue, font-weight 800)
   - APR
   - Points (amber pill badge)
4. **Footer** — "Rates sourced from Zillow" left, "Rates as of [date · time]" right

**JS TABS config:**
```js
var TABS = {
  "30yr": { label: "30 Yr Fixed", program: "Fixed30Year", loanType: "Conventional" },
  "15yr": { label: "15 Yr Fixed", program: "Fixed15Year", loanType: "Conventional" },
  "va":   { label: "VA",          program: "Fixed30Year", loanType: "VA"           }
};
```

**Responsive breakpoints:**
- `≤ 720px` — tablet: reduced padding/gaps
- `≤ 520px` — mobile: card breaks into 2 rows (loan type full-width top row; Interest/APR/Points below)

**Design system:**
- Primary color: `#4361ee`
- Gradient: `linear-gradient(135deg, #4361ee, #6366f1)`
- Card: `border-radius: 20px`, `box-shadow` (no border), hover lift `translateY(-2px)`
- Toggle: white bg + `box-shadow: 0 0 0 2px #4361ee`
- Tabs: outlined pills, `border: 1.5px solid #d0d5e8`
- Interest hero: `1.35rem / font-weight 800 / #4361ee`
- Points badge: full pill, amber (`#fff8e6 / #f0c850 / #b87a00`)

---

## Commands

```bash
# Local dev (runs worker at localhost:8787)
npm run dev

# Deploy to Cloudflare
npm run deploy

# Tail live logs
npm run tail
```

Wrangler is installed as a local dev dependency (not global) — use `npx wrangler` or the npm scripts above.

---

## Known issues / gotchas
- The Zillow API URL must NOT include `/api/` — correct: `mortgageapi.zillow.com/getCurrentRates` (not `/api/getCurrentRates`)
- The worker returns the raw Zillow response structure: `data.rates` is an object keyed by price-point key (`p1`–`p5`), each having `rate` and `apr` fields
- If Zillow changes its API or the partner ID expires, all tabs will show an error state
