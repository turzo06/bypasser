# CC Toolkit

## Overview
A multi-tool web app with 3 tab-based tools:
1. **Card Generator** — Generate Luhn-valid card numbers from a BIN or extrap pattern with custom/random month, year, CVV
2. **BIN Extrap Tool** — Paste multiple card numbers to find matching digit patterns (extrapolation) for generating more cards
3. **Card Checker** — Multi-mode card checking with 3 gateways: chkr.cc API, Stripe Auth (WooCommerce Setup Intent), Stripe Checkout (Payment Link hitter) + BIN info from RapidAPI

## Architecture
- **Frontend**: React + TypeScript with Tailwind CSS and shadcn/ui components
- **Backend**: Express.js with proxy routes for chkr.cc API and RapidAPI BIN Lookup
- **No database** — purely client-side logic except the checker/BIN lookup proxies

## Key Files
- `client/src/pages/home.tsx` — Main page with 3-tab layout
- `client/src/components/card-generator.tsx` — Card Generator tab component
- `client/src/components/bin-extrap.tsx` — BIN Extrap tab component
- `client/src/components/card-checker.tsx` — Card Checker tab component
- `client/src/components/proxy-manager.tsx` — Multi-protocol proxy management UI + browser fingerprint toggle
- `server/routes.ts` — Backend routes for card checking, BIN lookup, proxy management, fingerprint toggle

## API Routes
- `POST /api/check-card` — Proxies card data to `https://api.chkr.cc/` via active proxy (if available). Sends Origin/Referer headers mimicking chkr.cc website. Accepts `{ data: "number|month|year|cvv" }`.
- `POST /api/stripe-auth` — WooCommerce Stripe Setup Intent flow (6-step): GET account → register → GET add-payment-method → Stripe elements/sessions → create PM → confirm via admin-ajax. Returns APPROVED/3DS/DECLINED.
- `POST /api/stripe-checkout/grab` — Extract cs_live, pk_live, amount, currency, email, merchantName, merchantCountry, merchantLogo, lineItems from any Stripe checkout URL (checkout.stripe.com, buy.stripe.com, or custom domains like checkout.speedyhub.io). Decodes XOR-5 encoded hash fragments. Uses `/v1/payment_pages/{cs_live}/init` as primary data source for amount/currency/email/line items.
- `POST /api/stripe-checkout` — Stripe Payment Link hitter: Uses `/v1/payment_pages/{cs_live}/init` for session data → create PM → payment_pages confirm. Origin/Referer headers dynamically set per domain. Accepts `{ data, checkoutUrl }`. Returns CHARGED/3DS/DECLINED. Includes Deep 3DS Bypass: when confirm returns `requires_action`, attempts frictionless 3DS by retrieving source → hitting auth URL → calling `3ds2/complete` and `3ds2/authenticate` → re-checking intent status. Session expiry detection auto-stops card hitting (returns `SESSION_EXPIRED` + `sessionExpired: true`). Successful charges also auto-stop remaining cards.
- `POST /api/bin-lookup` — BIN lookup via RapidAPI (Neutrino BIN Lookup), cached in-memory.
- `POST /api/proxy/check` — Test any proxy type by connecting to IP services through it.
- `POST /api/proxy/add` — Add a verified proxy to the active pool.
- `POST /api/proxy/toggle` — Enable/disable proxy globally. When disabled, `getRandomProxy()` returns null (direct connection). Accepts `{ enabled: boolean }`.
- `POST /api/proxy/set-active` — Set a specific proxy as the active one by index. Pass `{ index: -1 }` for round-robin mode.
- `GET /api/proxy/list` — List all configured proxies, active index, and `proxyEnabled` state.
- `DELETE /api/proxy/:index` — Remove a proxy by index (default proxy cannot be removed).
- `POST /api/fingerprint/toggle` — Toggle random browser fingerprint on/off. Accepts `{ enabled: boolean }`.
- `GET /api/fingerprint/status` — Get current fingerprint toggle state.

## Proxy Support
- **SOCKS5** (port 10800): Uses `socks-proxy-agent` with Node.js `http`/`https` modules
- **HTTP** (port 10080): Uses `undici` ProxyAgent for proper CONNECT tunneling
- **HTTPS** (port 10443): Uses `undici` ProxyAgent for proper CONNECT tunneling
- **Plain IP:port**: Treated as HTTP proxy (auto-prefixed with `http://`)
- FloppyData proxy format: `socks5://user-XXX-type-residential-country-XX:pass@geo.g-w.info:PORT`
- Proxies stored in-memory; re-add after server restart
- Proxy check verifies connectivity via HTTPS IP services (ipify, myip.com) with 15s timeout

## Browser Fingerprint (Advanced Spoof)
- Toggle on/off via UI switch in Proxy & Fingerprint section
- **Auto-randomizes on every single card check** — each request gets a unique identity
- **Geo-matched**: timezone, language, Accept-Language automatically match proxy country (40+ countries supported)
- Country auto-detected from proxy URL pattern (`country-XX`)
- Randomizes: User-Agent (27+ Chrome versions, 6 OS profiles), Accept-Language, Sec-Ch-Ua, Platform, Sec-Fetch headers, DNT
- Meta display: MAC address (real OUI prefixes), device name, screen resolution, GPU renderer/vendor, hardware concurrency, device memory, canvas/audio/font/ClientRects hashes, media devices, speech voices
- Fingerprint meta returned per card check result for frontend display
- Preview endpoint supports `?country=XX` query param, auto-detects from active proxy
- Always includes Origin/Referer headers for chkr.cc compatibility

## Key Dependencies
- `socks-proxy-agent` — SOCKS5 proxy support
- `undici` — HTTP/HTTPS proxy support via ProxyAgent (handles CONNECT tunneling correctly)
- `http-proxy-agent` / `https-proxy-agent` — installed but not used (undici handles it better)

## Environment Variables
- `RAPIDAPI_KEY` — RapidAPI key for Neutrino BIN Lookup API
- `SESSION_SECRET` — Express session secret

## IP/Location Tracking
- Stripe Auth and Stripe Checkout checkers return IP geolocation info (ip, country, city, ISP) with each result
- IP lookup runs in parallel with the check (via `fetchIpLocation`) using ip-api.com → ipify.org fallback
- Displayed in result rows with Wifi icon

## Currency Override
- Stripe Checkout mode has a currency override dropdown with 40+ currencies
- Default is "Auto (from session)" — uses the currency detected from the checkout session
- Override forces a specific currency in the confirm request, useful when auto-detection returns wrong currency

## Rate Limiting
- Frontend: 3s delay between card checks
- Backend: 3s retry delay on rate limits, 2s retry on errors, max 3 attempts
- chkr.cc requires Origin/Referer headers (`https://chkr.cc`) to avoid 429 rate limits

## Luhn Algorithm & Card Type Detection
- Input validation: each pasted card shows Luhn valid/invalid status
- Card generation: last digit computed as Luhn check digit
- Card type detection from BIN prefix:
  - AMEX (34/37): 15 digits, 4-digit CVV
  - Diners Club (300-305, 36, 38): 14 digits, 3-digit CVV
  - Visa/MC/Discover/default: 16 digits, 3-digit CVV
- CVV determined per-card from actual generated number (not template)
- Output format: `number|MM|YY|CVV` with pipe separators

## Extrap Methods
1. Best Extrap — full comparison across all cards
2. Pair Extrap — comparing specific card pairs
3. SoFIA Patterns — alternating position digit patterns
4. Math Extrap — digit-pair arithmetic method
5. Base BIN — 6-digit BIN fallback

## Running
- `npm run dev` starts Express backend + Vite frontend
- Standalone HTML at `/bin-extrap-tool.html`
