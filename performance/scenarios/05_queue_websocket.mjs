import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  buildStompFrame,
  httpRequest,
  parseStompFrames,
  pickEnv,
  round2,
  summarizeLatencies,
} from '../lib/client.mjs';

const BASE_URL = pickEnv('HCMS_BASE_URL', 'http://localhost:18080');
const WS_URL = BASE_URL.replace(/^http/, 'ws') + '/ws/websocket';
const ADMIN_EMAIL = pickEnv('HCMS_ADMIN_EMAIL', 'admin@caresync.local');
const ADMIN_PASSWORD = pickEnv('HCMS_ADMIN_PASSWORD', '');
const RECEPT_EMAIL = pickEnv('HCMS_RECEPTIONIST_EMAIL', 'reception@caresync.local');
const RECEPT_PASSWORD = pickEnv('HCMS_RECEPTIONIST_PASSWORD', '');
const RESULTS_DIR = pickEnv('HCMS_RESULTS_DIR', 'performance/results');

const CLINIC_ID = 'a1b2c3d4-0000-4000-8000-000000000001';
const SPEC_ID = 'b1000000-0000-4000-8000-000000000001';
const DEPT_ID = 'c1000000-0000-4000-8000-000000000001';

function isoToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function connectStompClient(destination) {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const ws = new WebSocket(WS_URL, { headers: { Origin: 'http://localhost:3000' } });
    const received = [];
    const errors = [];
    let connected = false;
    const timer = setTimeout(() => {
      if (!connected) {
        try { ws.close(); } catch {}
        reject(new Error('STOMP connect timeout'));
      }
    }, 10000);

    ws.addEventListener('open', () => {
      ws.send(buildStompFrame('CONNECT', { 'accept-version': '1.2', host: 'localhost' }));
    });
    ws.addEventListener('message', (ev) => {
      const frames = parseStompFrames(ev.data);
      for (const f of frames) {
        if (f.command === 'CONNECTED') {
          connected = true;
          clearTimeout(timer);
          if (destination) {
            ws.send(buildStompFrame('SUBSCRIBE', { id: 'sub-1', destination }));
          }
          resolve({
            ws,
            connectMs: performance.now() - start,
            received,
            errors,
            close: () => { try { ws.close(); } catch {} },
          });
        } else if (f.command === 'MESSAGE') {
          received.push({ at: performance.now(), body: f.body, headers: f.headers });
        } else if (f.command === 'ERROR') {
          errors.push(f);
        }
      }
    });
    ws.addEventListener('error', (err) => {
      if (!connected) {
        clearTimeout(timer);
        reject(new Error(`WS error: ${err?.message || 'unknown'}`));
      }
    });
  });
}

async function runSecurityChecks(doctorId) {
  const results = {};

  // Test 1: Forbidden destination SUBSCRIBE (/topic/admin)
  results.forbiddenDestination = await new Promise((resolve) => {
    const ws = new WebSocket(WS_URL, { headers: { Origin: 'http://localhost:3000' } });
    let closedOrErrored = false;
    const t = setTimeout(() => { try { ws.close(); } catch {}; resolve({ rejected: closedOrErrored }); }, 1500);
    ws.addEventListener('open', () => ws.send(buildStompFrame('CONNECT', { 'accept-version': '1.2', host: 'localhost' })));
    ws.addEventListener('message', (ev) => {
      for (const f of parseStompFrames(ev.data)) {
        if (f.command === 'CONNECTED') {
          ws.send(buildStompFrame('SUBSCRIBE', { id: 'bad-sub', destination: '/topic/admin' }));
        } else if (f.command === 'ERROR') {
          closedOrErrored = true;
          clearTimeout(t);
          try { ws.close(); } catch {}
          resolve({ rejected: true, stompError: f.headers?.message || f.body });
        }
      }
    });
    ws.addEventListener('close', () => {
      if (!closedOrErrored) {
        closedOrErrored = true;
        clearTimeout(t);
        resolve({ rejected: true, reason: 'closed_by_broker' });
      }
    });
  });

  // Test 2: Client SEND frame rejection
  results.clientSendRejected = await new Promise((resolve) => {
    const ws = new WebSocket(WS_URL, { headers: { Origin: 'http://localhost:3000' } });
    let rejected = false;
    const t = setTimeout(() => { try { ws.close(); } catch {}; resolve({ rejected }); }, 1500);
    ws.addEventListener('open', () => ws.send(buildStompFrame('CONNECT', { 'accept-version': '1.2', host: 'localhost' })));
    ws.addEventListener('message', (ev) => {
      for (const f of parseStompFrames(ev.data)) {
        if (f.command === 'CONNECTED') {
          ws.send(buildStompFrame('SEND', { destination: `/app/queue/${doctorId}` }, '{"test":1}'));
        } else if (f.command === 'ERROR') {
          rejected = true;
          clearTimeout(t);
          try { ws.close(); } catch {}
          resolve({ rejected: true, stompError: f.headers?.message || f.body });
        }
      }
    });
    ws.addEventListener('close', () => {
      if (!rejected) {
        rejected = true;
        clearTimeout(t);
        resolve({ rejected: true, reason: 'closed_by_broker' });
      }
    });
  });

  // Note on public zero-PII queue topics
  results.crossDoctorPublicSubscriptionNote =
    'Per WebSocketSecurityConfig & openapi.yaml, /topic/queue/{doctorId} is an unauthenticated public waiting-room channel matching ^[A-Za-z0-9-]+$; zero-PII payload verification runs on delivered MESSAGE frames.';

  return results;
}

async function main() {
  if (!ADMIN_PASSWORD || !RECEPT_PASSWORD) {
    throw new Error('HCMS_ADMIN_PASSWORD and HCMS_RECEPTIONIST_PASSWORD must be set');
  }
  const runId = Date.now();
  const report = { runId, securityChecks: null, clientWaveBenchmarks: [] };

  const adminRes = await httpRequest(BASE_URL, '/api/auth/login', {
    method: 'POST',
    headers: { 'X-Forwarded-For': '10.60.0.1' },
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (adminRes.status !== 200) throw new Error(`Admin login failed: ${adminRes.status}`);
  const adminToken = adminRes.data.accessToken;
  const receptRes = await httpRequest(BASE_URL, '/api/auth/login', {
    method: 'POST',
    headers: { 'X-Forwarded-For': '10.60.0.2' },
    body: { email: RECEPT_EMAIL, password: RECEPT_PASSWORD },
  });
  if (receptRes.status !== 200) throw new Error(`Receptionist login failed: ${receptRes.status}`);
  const receptToken = receptRes.data.accessToken;

  // Create doctor & patient for live WS check-in events
  const docEmail = `perf.ws.doc.${runId}@perf.local`;
  const docRes = await httpRequest(BASE_URL, '/api/doctors', {
    method: 'POST',
    token: adminToken,
    body: {
      fullName: `Dr. WebSocket ${runId}`,
      email: docEmail,
      password: 'PerfWsPass!123',
      specializationId: SPEC_ID,
      clinicId: CLINIC_ID,
      departmentId: DEPT_ID,
      consultationFee: '400.00',
      slotMinutes: 5,
    },
  });
  if (docRes.status !== 201) throw new Error(`Create WS doctor failed: ${docRes.status}`);
  const doctorId = docRes.data.id;
  const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
  const schedRes = await httpRequest(BASE_URL, `/api/doctors/${doctorId}/schedules`, {
    method: 'PUT',
    token: adminToken,
    body: { entries: days.map((dayOfWeek) => ({ dayOfWeek, startTime: '06:00', endTime: '23:55' })) },
  });
  if (schedRes.status !== 200) throw new Error(`Put WS schedule failed: ${schedRes.status}`);

  const patRes = await httpRequest(BASE_URL, '/api/patients', {
    method: 'POST',
    token: receptToken,
    body: { fullName: 'WS Secret PII Patient Name', gender: 'OTHER', phone: '9555512345', allergies: ['Sulfa'] },
  });
  if (patRes.status !== 201) throw new Error(`Create WS patient failed: ${patRes.status}`);
  const patientId = patRes.data.id;

  const todaySlotsRes = await httpRequest(BASE_URL, `/api/doctors/${doctorId}/slots?date=${isoToday()}`, { token: adminToken });
  const availSlots = (todaySlotsRes.data?.slots || []).filter((s) => s.available).map((s) => s.start);
  const appts = [];
  for (let i = 0; i < 6 && i < availSlots.length; i++) {
    const b = await httpRequest(BASE_URL, '/api/appointments', {
      method: 'POST',
      token: receptToken,
      body: { doctorId, patientId, slotStart: availSlots[i], reason: 'WS broadcast benchmark' },
    });
    if (b.status === 201) appts.push(b.data.id);
  }

  report.securityChecks = await runSecurityChecks(doctorId);

  const clientCounts = [10, 25, 50, 100];
  for (let w = 0; w < clientCounts.length; w++) {
    const n = clientCounts[w];
    const clients = await Promise.all(
      Array.from({ length: n }, () => connectStompClient(`/topic/queue/${doctorId}`))
    );
    // Allow STOMP SUBSCRIBE frames to register in SimpleBroker
    await new Promise((r) => setTimeout(r, 150));

    const connectSummary = summarizeLatencies(
      `STOMP Connect+Subscribe (clients=${n})`,
      clients.map((c) => ({ status: 101, ms: c.connectMs })),
      Math.max(...clients.map((c) => c.connectMs))
    );

    let deliverySummary = null;
    let httpCheckInMs = null;
    let piiLeaked = false;
    let deliveredClients = 0;
    let duplicateCount = 0;

    if (w < appts.length) {
      const startCounts = clients.map((c) => c.received.length);
      const triggerTime = performance.now();
      const checkInRes = await httpRequest(BASE_URL, `/api/appointments/${appts[w]}/status`, {
        method: 'PATCH',
        token: receptToken,
        body: { status: 'CHECKED_IN' },
      });
      httpCheckInMs = round2(checkInRes.ms);

      // Wait up to 2000ms for all subscribers to receive the broadcast
      const deadline = performance.now() + 2000;
      while (performance.now() < deadline) {
        const allGotIt = clients.every((c, idx) => c.received.length > startCounts[idx]);
        if (allGotIt) break;
        await new Promise((r) => setTimeout(r, 10));
      }

      const deliverySamples = [];
      for (let i = 0; i < clients.length; i++) {
        const newMsgs = clients[i].received.slice(startCounts[i]);
        if (newMsgs.length > 0) deliveredClients++;
        if (newMsgs.length > 1) duplicateCount += (newMsgs.length - 1);
        for (const msg of newMsgs) {
          deliverySamples.push({ status: 200, ms: Math.max(0, msg.at - triggerTime) });
          if (msg.body.includes('WS Secret PII') || msg.body.includes('9555512345') || msg.body.includes('Sulfa') || msg.body.includes(patientId)) {
            piiLeaked = true;
          }
        }
      }
      deliverySummary = summarizeLatencies(
        `STOMP Fanout Delivery (clients=${n})`,
        deliverySamples,
        deliverySamples.length ? Math.max(...deliverySamples.map((s) => s.ms)) : 0
      );
    }

    report.clientWaveBenchmarks.push({
      clients: n,
      connectSummary,
      httpCheckInMs,
      deliveredClients,
      lostEvents: n - deliveredClients,
      duplicateCount,
      piiLeaked,
      deliverySummary,
    });

    for (const c of clients) c.close();
    await new Promise((r) => setTimeout(r, 100));
  }

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const outPath = path.join(RESULTS_DIR, '05_queue_websocket.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Saved ${outPath}`);
  console.log('Security checks:', report.securityChecks);
  console.table(report.clientWaveBenchmarks.map((w) => ({
    clients: w.clients,
    connectP95Ms: w.connectSummary.p95Ms,
    httpCheckInMs: w.httpCheckInMs,
    delivered: `${w.deliveredClients}/${w.clients}`,
    dups: w.duplicateCount,
    deliveryP50Ms: w.deliverySummary?.p50Ms,
    deliveryP95Ms: w.deliverySummary?.p95Ms,
    piiLeaked: w.piiLeaked,
  })));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
