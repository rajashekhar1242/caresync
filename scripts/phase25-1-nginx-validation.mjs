/**
 * CareSync HCMS - Phase 25.1: Nginx Reverse Proxy, TLS & Production Routing Validation Suite
 * Tests the complete production routing, security header, REST proxy, and STOMP WebSocket matrix
 * through the live local Nginx container (ports 80 and 443).
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const WebSocket = require('../frontend/node_modules/ws');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const BASE_HTTP = 'http://127.0.0.1:80';
const BASE_HTTPS = 'https://127.0.0.1:443';
const WS_URL = 'wss://127.0.0.1:443/ws/websocket';
const HOST_HEADER = 'hospital.caresync.health';

const results = [];

function recordTest(id, name, passed, notes = '') {
  results.push({ id, name, passed, notes });
  const status = passed ? '[✓ PASS]' : '[✗ FAIL]';
  console.log(`${status} Test ${id}: ${name} - ${notes}`);
}

async function request(path, options = {}, isHttp = false) {
  const base = isHttp ? BASE_HTTP : BASE_HTTPS;
  const headers = {
    Host: HOST_HEADER,
    ...(options.headers || {}),
  };
  return fetch(`${base}${path}`, {
    ...options,
    headers,
    redirect: options.redirect || 'manual',
  });
}

function connectStomp(token, timeoutMs = 7000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL, {
      headers: { Host: HOST_HEADER },
      rejectUnauthorized: false,
    });

    const timer = setTimeout(() => {
      try { ws.close(); } catch (_) {}
      reject(new Error(`WebSocket STOMP handshake timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    ws.on('open', () => {
      const authHeader = token ? `Authorization:Bearer ${token}\n` : '';
      const connectFrame = `CONNECT\naccept-version:1.1,1.2\nheart-beat:10000,10000\n${authHeader}\n\0`;
      ws.send(connectFrame);
    });

    ws.on('message', (data) => {
      const str = data.toString();
      if (str.startsWith('CONNECTED')) {
        clearTimeout(timer);
        resolve(ws);
      } else if (str.startsWith('ERROR')) {
        clearTimeout(timer);
        resolve({ errorFrame: str, ws });
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function run() {
  console.log('================================================================');
  console.log('  CareSync Phase 25.1: Nginx Reverse Proxy & TLS Validation     ');
  console.log('================================================================\n');

  const runId = Date.now();
  let adminToken, receptionistToken, doctorToken, doctorBToken, patientToken;
  let doctorId, doctorBId, patientId, refreshToken;

  // ---------------------------------------------------------------------------
  // SECTION 1: HTTP Port 80 & ACME Routing
  // ---------------------------------------------------------------------------
  console.log('--- SECTION 1: Port 80 & ACME Challenge Routing ---');
  
  // 1.1 HTTP to HTTPS 301 Redirect
  const r80 = await request('/test/path?foo=bar', {}, true);
  const loc80 = r80.headers.get('location');
  const redirectOk = r80.status === 301 && loc80 === 'https://hospital.caresync.health/test/path?foo=bar';
  recordTest('1.1', 'HTTP Port 80 Redirects to HTTPS', redirectOk, `Status ${r80.status}, Location: ${loc80}`);

  // 1.2 ACME Challenge Passthrough
  const rAcme = await request('/.well-known/acme-challenge/test-token-12345', {}, true);
  const acmeText = await rAcme.text();
  const acmeOk = rAcme.status === 200 && acmeText.includes('test-challenge-response-content-phase25-1');
  recordTest('1.2', 'Port 80 ACME Challenge Route Passthrough', acmeOk, `Status ${rAcme.status}, Body verified`);

  // ---------------------------------------------------------------------------
  // SECTION 2: HTTPS Security Headers & Inheritance
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 2: Security Headers & Header Inheritance ---');

  const rRoot = await request('/');
  const rootText = await rRoot.text();
  const hsts = rRoot.headers.get('strict-transport-security');
  const xfo = rRoot.headers.get('x-frame-options');
  const xcto = rRoot.headers.get('x-content-type-options');
  const rp = rRoot.headers.get('referrer-policy');
  const pp = rRoot.headers.get('permissions-policy');
  const csp = rRoot.headers.get('content-security-policy');
  const ccRoot = rRoot.headers.get('cache-control');

  const headersOk = (
    hsts?.includes('max-age=15724800') &&
    xfo === 'DENY' &&
    xcto === 'nosniff' &&
    rp?.includes('strict-origin') &&
    pp?.includes('camera=()') &&
    csp?.includes("default-src 'self'") &&
    csp?.includes('https://fonts.googleapis.com') &&
    csp?.includes('https://fonts.gstatic.com')
  );
  recordTest('2.1', 'Server-level Security Headers & CSP (Google Fonts)', headersOk, `HSTS: ${hsts}, XFO: ${xfo}`);

  const spaCacheOk = ccRoot?.includes('no-cache') && ccRoot?.includes('no-store');
  recordTest('2.2', 'SPA Root Cache-Control (no-cache, no-store)', spaCacheOk, `Cache-Control: ${ccRoot}`);

  // ---------------------------------------------------------------------------
  // SECTION 3: Static Asset Serving & SPA Direct Navigation
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 3: Static Asset Serving & SPA Navigation ---');

  // 3.1 SPA Direct Route Navigation (/doctor/queue)
  const rSpa = await request('/doctor/queue');
  const spaText = await rSpa.text();
  const spaDirectOk = rSpa.status === 200 && spaText.includes('<div id="root"></div>') && rSpa.headers.get('x-frame-options') === 'DENY';
  recordTest('3.1', 'SPA Direct Route Fallback (/doctor/queue)', spaDirectOk, `Status ${rSpa.status}, Served index.html`);

  // 3.2 SPA Direct Route Navigation (/patient/medical-history)
  const rSpa2 = await request('/patient/medical-history');
  const spa2Ok = rSpa2.status === 200 && (await rSpa2.text()).includes('<div id="root"></div>');
  recordTest('3.2', 'SPA Direct Route Fallback (/patient/medical-history)', spa2Ok, `Status ${rSpa2.status}, Served index.html`);

  // 3.3 Immutable Asset Caching
  const assetMatch = rootText.match(/\/assets\/[A-Za-z0-9_-]+\.js/);
  const assetPath = assetMatch ? assetMatch[0] : '/assets/index-DI243QWA.js';
  const rAsset = await request(assetPath);
  const ccAsset = rAsset.headers.get('cache-control');
  const xfoAsset = rAsset.headers.get('x-frame-options');
  const assetOk = rAsset.status === 200 && ccAsset?.includes('immutable') && ccAsset?.includes('max-age=31536000') && xfoAsset === 'DENY';
  recordTest('3.3', 'Static Asset Immutable Caching & Header Inheritance', assetOk, `Cache-Control: ${ccAsset}, XFO: ${xfoAsset}`);

  // 3.4 Missing Asset 404 (does NOT fall back to index.html)
  const r404Asset = await request('/assets/non-existent-script-xyz.js');
  const asset404Ok = r404Asset.status === 404;
  recordTest('3.4', 'Missing Static Asset Returns 404 (Not index.html)', asset404Ok, `Status ${r404Asset.status}`);

  // ---------------------------------------------------------------------------
  // SECTION 4: Actuator Endpoint Protection
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 4: Actuator Protection ---');

  const rActRoot = await request('/actuator');
  const rActHealth = await request('/actuator/health');
  const rActEnv = await request('/actuator/env');
  const actOk = rActRoot.status === 404 && rActHealth.status === 404 && rActEnv.status === 404;
  recordTest('4.1', 'Spring Boot Actuator Publicly Forbidden (404)', actOk, `/actuator: ${rActRoot.status}, /health: ${rActHealth.status}`);

  // ---------------------------------------------------------------------------
  // SECTION 5: REST API Proxying through Nginx
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 5: REST API Proxying ---');

  // 5.1 Admin Login
  const rLogin = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@caresync.local', password: 'AdminPass!123' }),
  });
  const loginData = await rLogin.json();
  adminToken = loginData.accessToken;
  refreshToken = loginData.refreshToken;
  const loginOk = rLogin.status === 200 && adminToken && rLogin.headers.get('x-frame-options') === 'DENY';
  recordTest('5.1', 'REST API Login via Nginx (/api/auth/login)', loginOk, `Status ${rLogin.status}, JWT received`);

  // 5.2 Token Refresh
  const rRefresh = await request('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  const refreshData = await rRefresh.json();
  const refreshOk = rRefresh.status === 200 && refreshData.accessToken;
  recordTest('5.2', 'REST API Token Refresh via Nginx (/api/auth/refresh)', refreshOk, `Status ${rRefresh.status}`);

  // 5.3 Current User Profile
  const rMe = await request('/api/auth/me', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const meData = await rMe.json();
  const meOk = rMe.status === 200 && meData.email === 'admin@caresync.local';
  recordTest('5.3', 'REST API /api/auth/me via Nginx', meOk, `Status ${rMe.status}, Email: ${meData.email}`);

  // 5.4 Structured Error Response Preservation (Malformed login)
  const rBadLogin = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'nonexistent@caresync.local', password: 'Wrong' }),
  });
  const badLoginData = await rBadLogin.json();
  const errPreservedOk = rBadLogin.status === 401 && badLoginData.code === 'INVALID_CREDENTIALS' && badLoginData.path === '/api/auth/login';
  recordTest('5.4', 'Structured ErrorResponse & Status Preserved', errPreservedOk, `Status ${rBadLogin.status}, Code: ${badLoginData.code}`);

  // 5.5 Provision Doctors & Patient for WebSocket and domain checks
  const depRes = await request('/api/departments', { headers: { Authorization: `Bearer ${adminToken}` } });
  const depData = await depRes.json();
  const specRes = await request('/api/specializations', { headers: { Authorization: `Bearer ${adminToken}` } });
  const specData = await specRes.json();
  const clinicId = 'a1b2c3d4-0000-4000-8000-000000000001';

  // Doctor A
  const docEmailA = `dr.nginx.a.${runId}@caresync.local`;
  const docARes = await request('/api/doctors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      fullName: `Dr. Nginx Alpha ${runId}`,
      email: docEmailA,
      password: 'DoctorPassword!123',
      phone: '9876543301',
      specializationId: specData[0].id,
      clinicId,
      departmentId: depData[0].id,
      consultationFee: '1000.00',
      slotMinutes: 15,
    }),
  });
  doctorId = (await docARes.json()).id;

  const docALogin = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: docEmailA, password: 'DoctorPassword!123' }),
  });
  doctorToken = (await docALogin.json()).accessToken;

  // Doctor B
  const docEmailB = `dr.nginx.b.${runId}@caresync.local`;
  const docBRes = await request('/api/doctors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      fullName: `Dr. Nginx Beta ${runId}`,
      email: docEmailB,
      password: 'DoctorPassword!123',
      phone: '9876543302',
      specializationId: specData[0].id,
      clinicId,
      departmentId: depData[0].id,
      consultationFee: '1000.00',
      slotMinutes: 15,
    }),
  });
  doctorBId = (await docBRes.json()).id;

  const docBLogin = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: docEmailB, password: 'DoctorPassword!123' }),
  });
  doctorBToken = (await docBLogin.json()).accessToken;

  // Receptionist Login
  const rReceptLogin = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'reception@caresync.local', password: 'ReceptPass!123' }),
  });
  receptionistToken = (await rReceptLogin.json()).accessToken;

  // Patient Registration & Login
  const patRegRes = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: `Nginx Patient ${runId}`,
      email: `nginx.pat.${runId}@caresync.local`,
      password: 'PatientPassword!123',
      phone: '9876543303',
      dateOfBirth: '1990-05-10',
      gender: 'MALE',
    }),
  });
  const patRegData = await patRegRes.json();
  patientToken = patRegData.accessToken;
  patientId = patRegData.user?.patientId;

  // 5.6 Domain Endpoints Validation (/api/doctors, /api/appointments, /api/patients, /api/invoices, /api/reports)
  const rDocs = await request('/api/doctors', { headers: { Authorization: `Bearer ${adminToken}` } });
  const rAppts = await request('/api/appointments?page=0&size=5', { headers: { Authorization: `Bearer ${receptionistToken}` } });
  const rPats = await request('/api/patients?page=0&size=5', { headers: { Authorization: `Bearer ${receptionistToken}` } });
  const rInvs = await request('/api/invoices?page=0&size=5', { headers: { Authorization: `Bearer ${adminToken}` } });
  const rRep = await request('/api/reports/revenue?from=2026-11-01&to=2026-11-30', { headers: { Authorization: `Bearer ${adminToken}` } });

  const domainEndpointsOk = (
    rDocs.status === 200 &&
    rAppts.status === 200 &&
    rPats.status === 200 &&
    rInvs.status === 200 &&
    rRep.status === 200
  );
  recordTest('5.5', 'Domain APIs Proxied (/doctors, /appointments, /patients, /invoices, /reports)', domainEndpointsOk, 'All 5 endpoints returned HTTP 200');

  // ---------------------------------------------------------------------------
  // SECTION 6: WebSocket / STOMP Proxying through Nginx
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 6: WebSocket STOMP Proxying & Security ---');

  // 6.1 Doctor A subscribes to Doctor A's queue (Permitted)
  let docASubOk = false;
  try {
    const wsA = await connectStomp(doctorToken);
    const subPromise = new Promise((resolve) => {
      wsA.on('message', (msg) => {
        const str = msg.toString();
        if (str.startsWith('ERROR')) resolve(false);
      });
      wsA.send(`SUBSCRIBE\nid:sub-a\ndestination:/topic/queue/${doctorId}\n\n\0`);
      setTimeout(() => resolve(true), 600);
    });
    docASubOk = await subPromise;
    wsA.close();
  } catch (e) {
    docASubOk = false;
  }
  recordTest('6.1', "Doctor A Subscribes to Doctor A's Queue (Permitted)", docASubOk, 'Subscription accepted');

  // 6.2 Doctor A attempts to subscribe to Doctor B's queue (Forbidden Cross-Doctor IDOR)
  let docACrossDocBOk = false;
  try {
    const wsA2 = await connectStomp(doctorToken);
    const crossPromise = new Promise((resolve) => {
      wsA2.on('message', (msg) => {
        const str = msg.toString();
        if (str.startsWith('ERROR')) {
          resolve(true); // Must receive ERROR frame
        }
      });
      wsA2.send(`SUBSCRIBE\nid:sub-cross\ndestination:/topic/queue/${doctorBId}\n\n\0`);
      setTimeout(() => resolve(false), 1200);
    });
    docACrossDocBOk = await crossPromise;
    wsA2.close();
  } catch (e) {
    docACrossDocBOk = false;
  }
  recordTest('6.2', "Doctor A Cross-Subscribe to Doctor B's Queue Blocked (IDOR)", docACrossDocBOk, 'STOMP ERROR frame emitted');

  // 6.3 Doctor B subscribes to Doctor B's queue (Permitted)
  let docBSubOk = false;
  try {
    const wsB = await connectStomp(doctorBToken);
    const subPromise = new Promise((resolve) => {
      wsB.on('message', (msg) => {
        if (msg.toString().startsWith('ERROR')) resolve(false);
      });
      wsB.send(`SUBSCRIBE\nid:sub-b\ndestination:/topic/queue/${doctorBId}\n\n\0`);
      setTimeout(() => resolve(true), 600);
    });
    docBSubOk = await subPromise;
    wsB.close();
  } catch (e) {
    docBSubOk = false;
  }
  recordTest('6.3', "Doctor B Subscribes to Doctor B's Queue (Permitted)", docBSubOk, 'Subscription accepted');

  // 6.4 Receptionist subscribes to Doctor queue (Permitted for front-desk coordination)
  let receptSubOk = false;
  try {
    const wsRec = await connectStomp(receptionistToken);
    const subPromise = new Promise((resolve) => {
      wsRec.on('message', (msg) => {
        if (msg.toString().startsWith('ERROR')) resolve(false);
      });
      wsRec.send(`SUBSCRIBE\nid:sub-rec\ndestination:/topic/queue/${doctorId}\n\n\0`);
      setTimeout(() => resolve(true), 600);
    });
    receptSubOk = await subPromise;
    wsRec.close();
  } catch (e) {
    receptSubOk = false;
  }
  recordTest('6.4', 'Receptionist Subscribes to Doctor Queue (Permitted)', receptSubOk, 'Front desk coordination permitted');

  // 6.5 Patient attempts to subscribe to Doctor queue (Forbidden)
  let patientBlocked = false;
  try {
    const wsPat = await connectStomp(patientToken);
    const patPromise = new Promise((resolve) => {
      wsPat.on('message', (msg) => {
        if (msg.toString().startsWith('ERROR')) resolve(true);
      });
      wsPat.send(`SUBSCRIBE\nid:sub-pat\ndestination:/topic/queue/${doctorId}\n\n\0`);
      setTimeout(() => resolve(false), 1200);
    });
    patientBlocked = await patPromise;
    wsPat.close();
  } catch (e) {
    patientBlocked = false;
  }
  recordTest('6.5', 'Patient Queue Subscription Strictly Forbidden', patientBlocked, 'STOMP ERROR frame emitted');

  // 6.6 Unauthenticated WebSocket connection rejected
  let unauthBlocked = false;
  try {
    const wsUnauth = await connectStomp(null);
    if (wsUnauth.errorFrame) {
      unauthBlocked = true;
    } else {
      const subPromise = new Promise((resolve) => {
        wsUnauth.on('message', (msg) => {
          if (msg.toString().startsWith('ERROR')) resolve(true);
        });
        wsUnauth.send(`SUBSCRIBE\nid:sub-unauth\ndestination:/topic/queue/${doctorId}\n\n\0`);
        setTimeout(() => resolve(false), 1200);
      });
      unauthBlocked = await subPromise;
      wsUnauth.close();
    }
  } catch (e) {
    unauthBlocked = true;
  }
  recordTest('6.6', 'Unauthenticated WebSocket Subscription Blocked', unauthBlocked, 'Access denied on CONNECT/SUBSCRIBE');

  // 6.7 Client SEND frame blocked
  let sendBlocked = false;
  try {
    const wsSend = await connectStomp(doctorToken);
    const sendPromise = new Promise((resolve) => {
      wsSend.on('message', (msg) => {
        if (msg.toString().startsWith('ERROR')) resolve(true);
      });
      wsSend.send(`SEND\ndestination:/topic/queue/${doctorId}\n\n{"injected":"exploit"}\0`);
      setTimeout(() => resolve(false), 1200);
    });
    sendBlocked = await sendPromise;
    wsSend.close();
  } catch (e) {
    sendBlocked = false;
  }
  recordTest('6.7', 'Client Inbound SEND Frame Strictly Blocked', sendBlocked, 'MessageDeliveryException triggered');

  // 6.8 WebSocket Reconnection Works
  let reconnectOk = false;
  try {
    const wsFirst = await connectStomp(doctorToken);
    wsFirst.close();
    await new Promise(r => setTimeout(r, 200));
    const wsSecond = await connectStomp(doctorToken);
    reconnectOk = wsSecond && !wsSecond.errorFrame;
    wsSecond.close();
  } catch (e) {
    reconnectOk = false;
  }
  recordTest('6.8', 'WebSocket Reconnection Handshake Works', reconnectOk, 'Second connection handshake succeeded');

  // 6.9 Live Queue Event Delivery & Zero PII Verification
  // Book appointment -> Check in -> Listen to queue event over Nginx
  let eventReceived = null;
  try {
    // Configure weekly schedule for doctor A
    await request(`/api/doctors/${doctorId}/schedules`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        entries: [
          { dayOfWeek: 'MONDAY', startTime: '08:00', endTime: '20:00' },
          { dayOfWeek: 'TUESDAY', startTime: '08:00', endTime: '20:00' },
          { dayOfWeek: 'WEDNESDAY', startTime: '08:00', endTime: '20:00' },
          { dayOfWeek: 'THURSDAY', startTime: '08:00', endTime: '20:00' },
          { dayOfWeek: 'FRIDAY', startTime: '08:00', endTime: '20:00' },
          { dayOfWeek: 'SATURDAY', startTime: '08:00', endTime: '20:00' },
          { dayOfWeek: 'SUNDAY', startTime: '08:00', endTime: '20:00' },
        ],
      }),
    });

    // Query slots
    const clinicTodayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const slotsRes = await request(`/api/doctors/${doctorId}/slots?date=${clinicTodayStr}`, {
      headers: { Authorization: `Bearer ${patientToken}` },
    });
    const slotsData = await slotsRes.json();
    const availableSlot = slotsData.slots?.find(s => s.available);

    if (availableSlot) {
      // Connect Doctor A to queue over Nginx
      const wsDocA = await connectStomp(doctorToken);
      const eventPromise = new Promise((resolve) => {
        wsDocA.on('message', (msg) => {
          const str = msg.toString();
          if (str.startsWith('MESSAGE')) {
            const bodyIdx = str.indexOf('\n\n');
            if (bodyIdx !== -1) {
              const rawJson = str.substring(bodyIdx + 2).replace(/\0$/, '');
              try {
                resolve(JSON.parse(rawJson));
              } catch (_) {
                resolve(rawJson);
              }
            }
          }
        });
        setTimeout(() => resolve(null), 3500);
      });

      wsDocA.send(`SUBSCRIBE\nid:sub-live\ndestination:/topic/queue/${doctorId}\n\n\0`);
      await new Promise(r => setTimeout(r, 300));

      // Book appointment
      const bookRes = await request('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${patientToken}` },
        body: JSON.stringify({
          patientId,
          doctorId,
          slotStart: availableSlot.start,
          reason: 'Nginx Live Queue Event Test',
        }),
      });
      const bookData = await bookRes.json();

      // Check-in via receptionist to trigger QueueUpdateMessage
      await request(`/api/appointments/${bookData.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${receptionistToken}` },
        body: JSON.stringify({ status: 'CHECKED_IN' }),
      });

      eventReceived = await eventPromise;
      wsDocA.close();
    }
  } catch (err) {
    console.error('Error during live queue event test:', err);
  }

  const liveEventOk = eventReceived && eventReceived.doctorId === doctorId && typeof eventReceived.waitingCount === 'number';
  recordTest('6.9', 'Real Queue Domain Event Delivered via Nginx', liveEventOk, `Event: ${JSON.stringify(eventReceived)}`);

  // 6.10 Zero PII Verification
  const zeroPiiOk = (
    liveEventOk &&
    !JSON.stringify(eventReceived).includes('patientName') &&
    !JSON.stringify(eventReceived).includes('phone') &&
    !JSON.stringify(eventReceived).includes('diagnosis')
  );
  recordTest('6.10', 'Queue Event Payloads Contain Zero PII', zeroPiiOk, 'Only doctorId, waitingCount, tokenNumber, status');

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('  PHASE 25.1 NGINX & TLS VALIDATION SUMMARY                     ');
  console.log('================================================================');
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;
  console.log(`Total Scenarios: ${results.length}`);
  console.log(`Passed:          ${passedCount}`);
  console.log(`Failed:          ${failedCount}`);

  if (failedCount > 0) {
    console.error('\nFAILED SCENARIOS:');
    results.filter(r => !r.passed).forEach(f => {
      console.error(`- Test ${f.id}: ${f.name} (${f.notes})`);
    });
    process.exit(1);
  }

  console.log('\nAll Phase 25.1 Nginx Reverse Proxy Validation Tests PASSED (100% Success).');
}

run().catch(e => {
  console.error('Fatal execution error:', e);
  process.exit(1);
});
