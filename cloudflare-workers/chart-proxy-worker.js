/**
 * Cloudflare Worker - Airport Chart Proxy
 * Proxies FAA airport diagrams to bypass CORS restrictions
 *
 * Deploy URL: https://chart-proxy.YOUR-SUBDOMAIN.workers.dev
 */

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return handleCORS()
  }

  // Route handling
  if (url.pathname === '/' || url.pathname === '/health') {
    return handleHealth()
  }

  if (url.pathname === '/chart/KUGN' || url.pathname === '/chart/kugn') {
    return handleKUGNChart()
  }

  if (url.pathname.startsWith('/chart/')) {
    const icao = url.pathname.split('/')[2]?.toUpperCase()
    return handleGenericChart(icao)
  }

  return new Response('Not Found', { status: 404 })
}

/**
 * Handle KUGN airport chart
 */
async function handleKUGNChart() {
  try {
    // KUGN Chart: Cycle 2501, Chart ID 05324
    const chartUrl = 'https://aeronav.faa.gov/d-tpp/2501/05324AD.PDF'

    const response = await fetch(chartUrl, {
      cf: {
        cacheTtl: 86400, // Cache for 24 hours
        cacheEverything: true
      }
    })

    if (!response.ok) {
      return new Response(`Chart unavailable: ${response.status}`, {
        status: response.status,
        headers: getCORSHeaders()
      })
    }

    const pdf = await response.arrayBuffer()

    return new Response(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="KUGN-Airport-Diagram.pdf"',
        'Cache-Control': 'public, max-age=86400', // 24 hours
        ...getCORSHeaders()
      }
    })

  } catch (error) {
    return new Response(`Error fetching chart: ${error.message}`, {
      status: 500,
      headers: getCORSHeaders()
    })
  }
}

/**
 * Handle generic airport chart (future expansion)
 */
async function handleGenericChart(icao) {
  return new Response(
    JSON.stringify({
      error: 'Generic chart lookup not implemented',
      message: `Chart lookup for ${icao} is not available. Currently only KUGN is supported.`,
      supported: ['KUGN']
    }),
    {
      status: 501,
      headers: {
        'Content-Type': 'application/json',
        ...getCORSHeaders()
      }
    }
  )
}

/**
 * Health check endpoint
 */
function handleHealth() {
  return new Response(
    JSON.stringify({
      status: 'healthy',
      service: 'Airport Chart Proxy',
      version: '1.0.0',
      endpoints: {
        '/chart/KUGN': 'Get KUGN airport diagram PDF',
        '/health': 'Health check'
      },
      cache: {
        ttl: '24 hours',
        type: 'Cloudflare edge cache'
      }
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        ...getCORSHeaders()
      }
    }
  )
}

/**
 * Handle CORS preflight
 */
function handleCORS() {
  return new Response(null, {
    status: 204,
    headers: getCORSHeaders()
  })
}

/**
 * Get CORS headers
 */
function getCORSHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  }
}
