# Cloudflare Worker Deployment Guide

## Chart Proxy Worker Setup

This guide walks you through deploying the airport chart proxy worker.

---

## Club Aircraft Status Worker Setup

This worker proxies OpenSky state vectors and returns tail-number keyed results for the dashboard.

### Step 1: Create Worker

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Workers & Pages**
3. Click **Create Application** → **Create Worker**
4. Name it: `aircraft-status` (or any name you prefer)
5. Click **Deploy**

### Step 2: Edit Worker Code

1. After deployment, click **Edit Code**
2. Delete all existing code in the editor
3. Copy the contents of `cloudflare-workers/aircraft-status-worker.js`
4. Paste into the editor
5. Click **Save and Deploy**

### Step 3: Update ICAO24 Mappings

1. Run the lookup script to generate ICAO24 mappings:
   ```bash
   python3 scripts/lookup-icao24.py N172WF N519ER N73753 N5232K
   ```
2. Copy the output object into `TAIL_TO_ICAO24` in `aircraft-status-worker.js`
3. Save and redeploy the worker

### Step 4: Update Dashboard Endpoint

Update `js/api.js`:

```javascript
aircraftStatusEndpoint: 'https://aircraft-status.YOUR-USERNAME.workers.dev/aircraft-status',
```

### Step 5: Test It

Visit your worker URL in a browser:
- `https://aircraft-status.YOUR-USERNAME.workers.dev/health`
- `https://aircraft-status.YOUR-USERNAME.workers.dev/aircraft-status?tails=N172WF`

---

## Prerequisites

1. **Cloudflare Account** (free tier works fine)
2. **wrangler CLI** (optional, but recommended)

Install wrangler:
```bash
npm install -g wrangler
```

---

## Option 1: Deploy via Cloudflare Dashboard (Easiest)

### Step 1: Create Worker

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Workers & Pages**
3. Click **Create Application** → **Create Worker**
4. Name it: `chart-proxy` (or any name you prefer)
5. Click **Deploy**

### Step 2: Edit Worker Code

1. After deployment, click **Edit Code**
2. **Delete all existing code** in the editor
3. Copy the contents of `cloudflare-workers/chart-proxy-worker.js`
4. Paste into the editor
5. Click **Save and Deploy**

### Step 3: Get Your Worker URL

Your worker will be available at:
```
https://chart-proxy.YOUR-USERNAME.workers.dev
```

Copy this URL - you'll need it!

### Step 4: Update Dashboard Code

Update `js/airport-diagram.js`:

```javascript
// Find this line (around line 33):
chartUrl: 'https://weather-proxy.ian-284.workers.dev/chart',

// Replace with your new worker URL:
chartUrl: 'https://chart-proxy.YOUR-USERNAME.workers.dev/chart/KUGN',
```

### Step 5: Test It

Visit your worker URL in a browser:
- `https://chart-proxy.YOUR-USERNAME.workers.dev/health` - Should show JSON status
- `https://chart-proxy.YOUR-USERNAME.workers.dev/chart/KUGN` - Should download PDF

---

## Option 2: Deploy via Wrangler CLI (Advanced)

### Step 1: Initialize Project

```bash
cd cloudflare-workers
wrangler init chart-proxy
```

### Step 2: Configure wrangler.toml

Create/edit `wrangler.toml`:

```toml
name = "chart-proxy"
main = "chart-proxy-worker.js"
compatibility_date = "2024-01-01"

[build]
command = ""

[env.production]
name = "chart-proxy"
```

### Step 3: Authenticate

```bash
wrangler login
```

### Step 4: Deploy

```bash
wrangler deploy chart-proxy-worker.js
```

### Step 5: Get Worker URL

Wrangler will output your worker URL:
```
https://chart-proxy.YOUR-USERNAME.workers.dev
```

---

## Testing Your Worker

### Health Check
```bash
curl https://chart-proxy.YOUR-USERNAME.workers.dev/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "Airport Chart Proxy",
  "version": "1.0.0",
  "endpoints": {
    "/chart/KUGN": "Get KUGN airport diagram PDF",
    "/health": "Health check"
  }
}
```

### Get Chart
```bash
curl -I https://chart-proxy.YOUR-USERNAME.workers.dev/chart/KUGN
```

Expected headers:
```
HTTP/2 200
content-type: application/pdf
access-control-allow-origin: *
cache-control: public, max-age=86400
```

---

## Update Your Dashboard

Once deployed, update your dashboard to use the new worker:

1. Open `js/airport-diagram.js`
2. Find line ~33:
   ```javascript
   chartUrl: 'https://weather-proxy.ian-284.workers.dev/chart',
   ```
3. Replace with:
   ```javascript
   chartUrl: 'https://chart-proxy.YOUR-USERNAME.workers.dev/chart/KUGN',
   ```
4. Save and reload your dashboard

---

## Monitoring & Limits

### Free Tier Limits
- **100,000 requests/day**
- **10ms CPU time per request**
- Plenty for personal use!

### View Analytics
1. Go to Cloudflare Dashboard
2. Workers & Pages → Your Worker
3. Click **Metrics** tab

---

## Troubleshooting

### Chart doesn't load?

1. **Check worker status:**
   ```bash
   curl https://chart-proxy.YOUR-USERNAME.workers.dev/health
   ```

2. **Check browser console:**
   - Open DevTools (F12)
   - Look for errors in Console tab

3. **Verify URL:**
   - Make sure you updated `chartUrl` in `airport-diagram.js`
   - URL should be: `https://chart-proxy.YOUR-USERNAME.workers.dev/chart/KUGN`

4. **Check CORS:**
   - Worker should return `Access-Control-Allow-Origin: *`
   - Test with: `curl -I https://chart-proxy.YOUR-USERNAME.workers.dev/chart/KUGN`

### Worker returns 404?

Make sure you're using the correct path:
- ✅ `/chart/KUGN` (correct)
- ❌ `/chart` (wrong)
- ❌ `/KUGN` (wrong)

### PDF returns 404 from FAA?

The chart cycle may have expired. Update the chart URL in the worker:

1. Visit: https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/dtpp/search/
2. Search for **KUGN**
3. Find current chart URL
4. Update line in worker:
   ```javascript
   const chartUrl = 'https://aeronav.faa.gov/d-tpp/XXXX/05324AD.PDF'
   //                                                ^^^^ Update cycle number
   ```
5. Save and deploy

---

## Future Enhancements

Want to support multiple airports? Extend the worker:

```javascript
// Add airport mappings
const AIRPORT_CHARTS = {
  'KUGN': '05324AD',
  'KORD': '00285AD',
  'KMDW': '00495AD'
  // Add more airports...
}

// Use in handleGenericChart()
const chartId = AIRPORT_CHARTS[icao]
const chartUrl = `https://aeronav.faa.gov/d-tpp/2501/${chartId}.PDF`
```

---

## Questions?

- **Cloudflare Workers Docs:** https://developers.cloudflare.com/workers/
- **Wrangler CLI Docs:** https://developers.cloudflare.com/workers/wrangler/
- **FAA Chart Search:** https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/dtpp/search/
