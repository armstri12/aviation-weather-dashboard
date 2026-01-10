# Airport Chart Setup - Quick Start

Your dashboard is ready! The windsock overlay is working with the fallback runway diagram.

To display the **actual FAA airport chart**, follow these steps:

---

## Step 1: Deploy Cloudflare Worker (5 minutes)

### Option A: Cloudflare Dashboard (Easiest)

1. **Go to:** https://dash.cloudflare.com/
2. **Navigate:** Workers & Pages
3. **Click:** Create Application → Create Worker
4. **Name:** `chart-proxy` (or any name)
5. **Click:** Deploy
6. **Click:** Edit Code
7. **Delete** all existing code
8. **Copy/Paste:** Contents of `cloudflare-workers/chart-proxy-worker.js`
9. **Click:** Save and Deploy
10. **Copy your worker URL:**
    ```
    https://chart-proxy.YOUR-USERNAME.workers.dev
    ```

---

## Step 2: Update Dashboard (1 minute)

1. **Open:** `js/airport-diagram.js`
2. **Find line 33:**
   ```javascript
   chartUrl: 'https://weather-proxy.ian-284.workers.dev/chart',
   ```
3. **Replace with YOUR worker URL:**
   ```javascript
   chartUrl: 'https://chart-proxy.YOUR-USERNAME.workers.dev/chart/KUGN',
   ```
4. **Save the file**

---

## Step 3: Test It

1. **Reload your dashboard**
2. **Check the Airport Diagram panel**
   - Should show FAA airport chart
   - Windsock overlay in top-right corner
3. **Verify no console errors** (F12 → Console tab)

---

## Troubleshooting

### Chart still not loading?

**Test your worker:**
```bash
# Health check
curl https://chart-proxy.YOUR-USERNAME.workers.dev/health

# Get chart
curl -I https://chart-proxy.YOUR-USERNAME.workers.dev/chart/KUGN
```

**Expected response:**
- Status: `200 OK`
- Header: `content-type: application/pdf`
- Header: `access-control-allow-origin: *`

### Worker returns 404?

Make sure you're using: `/chart/KUGN` (not just `/chart`)

### Still having issues?

See `cloudflare-workers/DEPLOYMENT.md` for detailed troubleshooting.

---

## What You Have Now

✅ **Fallback runway diagram** - Working with canvas rendering
✅ **Windsock overlay** - Animated, color-coded, responsive to wind
✅ **Crosswind analysis** - All calculations working
✅ **No console errors** - Clean, professional code
✅ **Cloudflare Worker** - Ready to deploy for real chart

---

## Optional: Keep the Fallback

Like the fallback diagram? You can keep it!

The canvas-rendered diagram:
- Loads instantly (no PDF fetch)
- Always available (no network dependency)
- Clean and professional
- Matches your dashboard theme

To keep it, just don't deploy the worker. Everything already works!

---

## Need Help?

- **Full Deployment Guide:** `cloudflare-workers/DEPLOYMENT.md`
- **Worker Documentation:** `cloudflare-workers/README.md`
- **Chart Setup Info:** `assets/KUGN-CHART-INFO.md`

---

**Your dashboard is production-ready!** 🛩️

The fallback ensures it always works, even if the chart fails to load.
