# Cloudflare Workers

This directory contains Cloudflare Workers for the Aviation Weather Dashboard.

## Workers

### 1. Chart Proxy Worker (`chart-proxy-worker.js`)

Proxies FAA airport diagrams to bypass CORS restrictions.

**Purpose:**
- Fetches PDF airport charts from FAA's aeronav.faa.gov
- Adds CORS headers for browser access
- Caches charts for 24 hours
- Provides clean REST API

**Endpoints:**
- `GET /health` - Health check and service info
- `GET /chart/KUGN` - Get KUGN airport diagram PDF

**Features:**
- ✅ CORS support
- ✅ 24-hour edge caching
- ✅ Proper PDF headers
- ✅ Error handling
- ✅ Health monitoring

**Deployment:**
See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete setup instructions.

**Quick Start:**
1. Log into [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Go to Workers & Pages
3. Create new Worker
4. Copy code from `chart-proxy-worker.js`
5. Deploy
6. Update `chartUrl` in `js/airport-diagram.js` with your worker URL

---

## Why Cloudflare Workers?

**The Problem:**
FAA's aeronav.faa.gov doesn't send CORS headers, so browsers block direct PDF access from web apps.

**The Solution:**
Cloudflare Workers act as a proxy:
1. Your dashboard → Worker (✅ allowed)
2. Worker → FAA server (✅ allowed, server-to-server)
3. Worker → Your dashboard (✅ allowed, with CORS headers)

**Benefits:**
- 🚀 **Fast:** Edge caching worldwide
- 💰 **Free:** 100k requests/day on free tier
- 🔒 **Reliable:** Cloudflare's global network
- 🎯 **Simple:** Just a few lines of code

---

## Cost

**Free Tier Includes:**
- 100,000 requests per day
- Unlimited bandwidth
- Global edge caching
- 10ms CPU time per request

For personal use, you'll **never hit these limits**.

---

## Architecture

```
┌─────────────────┐
│  Web Browser    │
│  (Dashboard)    │
└────────┬────────┘
         │ GET /chart/KUGN
         ↓
┌─────────────────┐
│ Cloudflare      │
│ Worker (Proxy)  │ ← Adds CORS headers
└────────┬────────┘   Caches for 24h
         │
         ↓
┌─────────────────┐
│ FAA Server      │
│ aeronav.faa.gov │
└─────────────────┘
```

---

## Updating Chart Cycles

FAA charts update every 28 days. When a new cycle is released:

1. Edit `chart-proxy-worker.js`
2. Update the cycle number:
   ```javascript
   const chartUrl = 'https://aeronav.faa.gov/d-tpp/2501/05324AD.PDF'
   //                                                ^^^^ Change this
   ```
3. Save and redeploy

**Finding the current cycle:**
1. Visit: https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/dtpp/search/
2. Search for your airport (KUGN)
3. Note the cycle number in the URL

---

## Local Development

To test the worker locally:

```bash
# Install wrangler
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Run locally
cd cloudflare-workers
wrangler dev chart-proxy-worker.js
```

Worker will be available at: `http://localhost:8787`

---

## Monitoring

**View metrics:**
1. Cloudflare Dashboard → Workers & Pages
2. Select your worker
3. Click "Metrics" tab

**Monitor:**
- Request count
- Error rate
- CPU time
- Cache hit rate

---

## Extending the Worker

### Support Multiple Airports

```javascript
const AIRPORT_CHARTS = {
  'KUGN': '05324AD',
  'KORD': '00285AD',
  'KMDW': '00495AD'
}

async function handleChart(icao) {
  const chartId = AIRPORT_CHARTS[icao]
  if (!chartId) {
    return new Response('Airport not supported', { status: 404 })
  }

  const url = `https://aeronav.faa.gov/d-tpp/2501/${chartId}.PDF`
  // ... fetch and return
}
```

### Add Authentication

```javascript
const API_KEY = 'your-secret-key'

async function handleRequest(request) {
  const key = request.headers.get('X-API-Key')

  if (key !== API_KEY) {
    return new Response('Unauthorized', { status: 401 })
  }

  // ... process request
}
```

### Add Rate Limiting

```javascript
const RATE_LIMIT = 100 // requests per minute

async function rateLimit(ip) {
  const key = `rate:${ip}`
  const count = await KV.get(key) || 0

  if (count > RATE_LIMIT) {
    return new Response('Rate limit exceeded', { status: 429 })
  }

  await KV.put(key, count + 1, { expirationTtl: 60 })
  return null
}
```

---

## Troubleshooting

See [DEPLOYMENT.md](./DEPLOYMENT.md#troubleshooting) for common issues and solutions.

---

## Resources

- **Cloudflare Workers Docs:** https://developers.cloudflare.com/workers/
- **Wrangler CLI:** https://developers.cloudflare.com/workers/wrangler/
- **FAA Charts:** https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/dtpp/
- **Airport Diagram Search:** https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/dtpp/search/
