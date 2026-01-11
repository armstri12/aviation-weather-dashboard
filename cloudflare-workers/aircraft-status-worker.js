/**
 * Cloudflare Worker - Club Aircraft Status Proxy
 * Fetches aircraft state vectors from OpenSky and maps by tail number.
 *
 * Deploy URL: https://aircraft-status.YOUR-SUBDOMAIN.workers.dev
 */

const OPEN_SKY_URL = 'https://opensky-network.org/api/states/all';

const TAIL_TO_ICAO24 = {
  N172WF: 'A12295',
  N519ER: 'A68352',
  N73753: 'A9E82F',
  N5232K: 'A696BB'
};

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return handleCORS();
  }

  if (url.pathname === '/' || url.pathname === '/health') {
    return handleHealth();
  }

  if (url.pathname === '/aircraft-status') {
    return handleAircraftStatus(url);
  }

  return new Response('Not Found', { status: 404 });
}

async function handleAircraftStatus(url) {
  const tailsParam = url.searchParams.get('tails') || '';
  const tails = tailsParam
    .split(',')
    .map(tail => tail.trim().toUpperCase())
    .filter(Boolean);

  if (tails.length === 0) {
    return jsonResponse({
      error: 'No tail numbers provided',
      message: 'Provide comma-separated tail numbers via ?tails=N12345,N54321'
    }, 400);
  }

  const missing = tails.filter(tail => !TAIL_TO_ICAO24[tail] || TAIL_TO_ICAO24[tail] === 'TODO');
  if (missing.length > 0) {
    return jsonResponse({
      error: 'ICAO24 mapping missing',
      message: 'Update TAIL_TO_ICAO24 with ICAO24 hex codes from the FAA registry.',
      missing
    }, 400);
  }

  const icao24List = tails
    .map(tail => TAIL_TO_ICAO24[tail])
    .map(code => code.toLowerCase())
    .join(',');

  const openSkyUrl = new URL(OPEN_SKY_URL);
  openSkyUrl.searchParams.set('icao24', icao24List);
  const response = await fetch(openSkyUrl.toString());
  if (!response.ok) {
    return jsonResponse({
      error: 'OpenSky request failed',
      status: response.status
    }, response.status);
  }

  const data = await response.json();
  const states = Array.isArray(data.states) ? data.states : [];
  const stateByIcao = new Map(states.map(state => [state[0], state]));

  const results = tails.map(tail => {
    const icao24 = TAIL_TO_ICAO24[tail].toLowerCase();
    const state = stateByIcao.get(icao24);

    if (!state) {
      return {
        tailNumber: tail,
        status: 'No Signal',
        lastSeenTime: data.time || null
      };
    }

    return {
      tailNumber: tail,
      icao24,
      callsign: state[1]?.trim() || null,
      originCountry: state[2] || null,
      lastSeenTime: state[4] || data.time || null,
      longitude: state[5],
      latitude: state[6],
      baroAltitude: state[7],
      onGround: state[8],
      velocity: state[9],
      trueTrack: state[10],
      verticalRate: state[11],
      geoAltitude: state[13],
      squawk: state[14]
    };
  });

  return jsonResponse(results);
}

function handleHealth() {
  return jsonResponse({
    status: 'healthy',
    service: 'Club Aircraft Status Proxy',
    version: '1.0.0',
    endpoints: {
      '/aircraft-status': 'Fetch OpenSky status for club aircraft'
    },
    mapping: Object.keys(TAIL_TO_ICAO24)
  });
}

function handleCORS() {
  return new Response(null, {
    status: 204,
    headers: getCORSHeaders()
  });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...getCORSHeaders()
    }
  });
}

function getCORSHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}
