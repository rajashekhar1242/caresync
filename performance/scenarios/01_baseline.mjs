import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { httpRequest, pickEnv, summarizeLatencies } from '../lib/client.mjs';

const BASE_URL = pickEnv('HCMS_BASE_URL', 'http://localhost:18080');
const ADMIN_EMAIL = pickEnv('HCMS_ADMIN_EMAIL', 'admin@caresync.local');
const ADMIN_PASSWORD = pickEnv('HCMS_ADMIN_PASSWORD', '');
const RECEPT_EMAIL = pickEnv('HCMS_RECEPTIONIST_EMAIL', 'reception@caresync.local');
const RECEPT_PASSWORD = pickEnv('HCMS_RECEPTIONIST_PASSWORD', '');
const RESULTS_DIR = pickEnv('HCMS_RESULTS_DIR', 'performance/results');
const MULTI_IP = pickEnv('HCMS_MULTI_IP', '0') === '1';

const CLINIC_ID = 'a1b2c3d4-0000-4000-8000-000000000001';
const SPEC_ID = 'b1000000-0000-4000-8000-000000000001';
const DEPT_ID = 'c1000000-0000-4000-8000-000000000001';
const MED_1 = '10000000-0000-4000-8000-000000000002'; // Dolo 650
const MED_2 = '10000000-0000-4000-8000-000000000007'; // Cetzine 10

function xff(i) {
  return MULTI_IP ? { 'X-Forwarded-For': `10.10.${Math.floor(i / 250) + 1}.${(i % 250) + 1}` } : {};
}

function isoDateOffset(days) {
  const d = new Date(Date.now() + days * 86400_000);
  // Asia/Kolkata local date YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
}

async function benchSequential(name, count, fn) {
  const samples = [];
  const start = performance.now();
  for (let i = 0; i < count; i++) {
    samples.push(await fn(i));
  }
  return summarizeLatencies(name, samples, performance.now() - start);
}

async function main() {
  if (!ADMIN_PASSWORD || !RECEPT_PASSWORD) {
    throw new Error('HCMS_ADMIN_PASSWORD and HCMS_RECEPTIONIST_PASSWORD must be set');
  }

  const runId = Date.now();
  const summaries = [];

  const adminLogin = await httpRequest(BASE_URL, '/api/auth/login', {
    method: 'POST',
    headers: xff(1),
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (adminLogin.status !== 200) throw new Error(`Admin login failed: ${adminLogin.status} ${JSON.stringify(adminLogin.data)}`);
  const adminToken = adminLogin.data.accessToken;

  const receptLogin = await httpRequest(BASE_URL, '/api/auth/login', {
    method: 'POST',
    headers: xff(2),
    body: { email: RECEPT_EMAIL, password: RECEPT_PASSWORD },
  });
  if (receptLogin.status !== 200) throw new Error(`Receptionist login failed: ${receptLogin.status}`);
  const receptToken = receptLogin.data.accessToken;

  // Create dedicated doctor + full 7-day schedule (00:00..23:55 so any today slot works!)
  const docEmail = `perf.base.doc.${runId}@perf.local`;
  const docPass = 'PerfPass!12345';
  const docRes = await httpRequest(BASE_URL, '/api/doctors', {
    method: 'POST',
    token: adminToken,
    body: {
      fullName: `Dr. Baseline ${runId}`,
      email: docEmail,
      password: docPass,
      phone: '+919900112233',
      specializationId: SPEC_ID,
      clinicId: CLINIC_ID,
      departmentId: DEPT_ID,
      consultationFee: '500.00',
      slotMinutes: 5,
    },
  });
  if (docRes.status !== 201) throw new Error(`Create doctor failed: ${docRes.status} ${JSON.stringify(docRes.data)}`);
  const doctorId = docRes.data.id;

  const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
  const schedRes = await httpRequest(BASE_URL, `/api/doctors/${doctorId}/schedules`, {
    method: 'PUT',
    token: adminToken,
    body: { entries: days.map((dayOfWeek) => ({ dayOfWeek, startTime: '06:00', endTime: '23:55' })) },
  });
  if (schedRes.status !== 200) throw new Error(`Put schedule failed: ${schedRes.status}`);

  // Create a leave 25 days out
  const leaveDate = isoDateOffset(25);
  await httpRequest(BASE_URL, `/api/doctors/${doctorId}/leaves`, {
    method: 'POST',
    token: adminToken,
    body: { startDate: leaveDate, endDate: leaveDate, reason: 'Baseline benchmark leave' },
  });

  const docLogin = await httpRequest(BASE_URL, '/api/auth/login', {
    method: 'POST',
    headers: xff(3),
    body: { email: docEmail, password: docPass },
  });
  if (docLogin.status !== 200) throw new Error(`Doc login failed: ${docLogin.status}`);
  const docToken = docLogin.data.accessToken;

  // --- 1. Authentication Baseline (respecting rate limit unless MULTI_IP simulated behind trusted proxy) ---
  const regCount = MULTI_IP ? 25 : 4;
  const regUsers = [];
  summaries.push(await benchSequential('POST /api/auth/register', regCount, async (i) => {
    const email = `perf.base.pat.${runId}.${i}@perf.local`;
    const r = await httpRequest(BASE_URL, '/api/auth/register', {
      method: 'POST',
      headers: xff(10 + i),
      body: { fullName: `Perf Pat ${i}`, email, password: docPass, phone: `98000${String(i).padStart(5, '0')}` },
    });
    if (r.status === 201) regUsers.push({ email, refreshToken: r.data.refreshToken, patientId: r.data.user.patientId });
    return r;
  }));

  const loginCount = MULTI_IP ? 25 : 5;
  const refreshTokens = [];
  summaries.push(await benchSequential('POST /api/auth/login', loginCount, async (i) => {
    const targetEmail = regUsers[i % regUsers.length].email;
    const r = await httpRequest(BASE_URL, '/api/auth/login', {
      method: 'POST',
      headers: xff(50 + i),
      body: { email: targetEmail, password: docPass },
    });
    if (r.status === 200) refreshTokens.push(r.data.refreshToken);
    return r;
  }));

  const refreshCount = MULTI_IP ? 25 : Math.min(refreshTokens.length, 15);
  const rotatedTokens = [];
  summaries.push(await benchSequential('POST /api/auth/refresh', refreshCount, async (i) => {
    const r = await httpRequest(BASE_URL, '/api/auth/refresh', {
      method: 'POST',
      headers: xff(90 + i),
      body: { refreshToken: refreshTokens[i] },
    });
    if (r.status === 200) rotatedTokens.push(r.data.refreshToken);
    return r;
  }));

  summaries.push(await benchSequential('POST /api/auth/logout', rotatedTokens.length, async (i) =>
    httpRequest(BASE_URL, '/api/auth/logout', {
      method: 'POST',
      headers: xff(130 + i),
      body: { refreshToken: rotatedTokens[i] },
    })
  ));

  // --- 2. Doctors & Schedules ---
  const todayStr = isoDateOffset(0);
  const tomorrowStr = isoDateOffset(1);
  summaries.push(await benchSequential('GET /api/doctors', 30, () =>
    httpRequest(BASE_URL, `/api/doctors?clinicId=${CLINIC_ID}&page=0&size=20`, { token: adminToken })
  ));
  summaries.push(await benchSequential('GET /api/doctors/{id}/schedules', 30, () =>
    httpRequest(BASE_URL, `/api/doctors/${doctorId}/schedules`, { token: adminToken })
  ));
  summaries.push(await benchSequential('GET /api/doctors/{id}/leaves', 30, () =>
    httpRequest(BASE_URL, `/api/doctors/${doctorId}/leaves`, { token: adminToken })
  ));
  summaries.push(await benchSequential('GET /api/doctors/{id}/slots', 30, () =>
    httpRequest(BASE_URL, `/api/doctors/${doctorId}/slots?date=${tomorrowStr}`, { token: adminToken })
  ));

  // --- 3. Patients ---
  const createdPatientIds = [];
  summaries.push(await benchSequential('POST /api/patients', 25, async (i) => {
    const r = await httpRequest(BASE_URL, '/api/patients', {
      method: 'POST',
      token: receptToken,
      body: {
        fullName: `Walkin Perf ${runId} ${i}`,
        dateOfBirth: '1990-05-15',
        gender: 'MALE',
        phone: `97111${String(i).padStart(5, '0')}`,
        email: `walkin.${runId}.${i}@perf.local`,
        address: '123 Clinic Lane',
        allergies: ['Penicillin'],
      },
    });
    if (r.status === 201) createdPatientIds.push(r.data.id);
    return r;
  }));

  summaries.push(await benchSequential('GET /api/patients/{id} (audited)', 25, (i) =>
    httpRequest(BASE_URL, `/api/patients/${createdPatientIds[i % createdPatientIds.length]}`, { token: receptToken })
  ));
  summaries.push(await benchSequential('GET /api/patients?name=...', 30, () =>
    httpRequest(BASE_URL, `/api/patients?name=Walkin&page=0&size=20`, { token: receptToken })
  ));

  // Fetch slots across tomorrow..+3 days for clean non-conflicting booking cycles
  const futureSlots = [];
  for (let d = 1; d <= 5; d++) {
    const sr = await httpRequest(BASE_URL, `/api/doctors/${doctorId}/slots?date=${isoDateOffset(d)}`, { token: adminToken });
    if (sr.status === 200 && Array.isArray(sr.data.slots)) {
      for (const s of sr.data.slots) {
        if (s.available) futureSlots.push(s.start);
      }
    }
  }
  const bookedForCancel = [];
  summaries.push(await benchSequential('POST /api/appointments', 25, async (i) => {
    const r = await httpRequest(BASE_URL, '/api/appointments', {
      method: 'POST',
      token: receptToken,
      body: {
        doctorId,
        patientId: createdPatientIds[i % createdPatientIds.length],
        slotStart: futureSlots[i],
        reason: 'Baseline booking test',
      },
    });
    if (r.status === 201) bookedForCancel.push(r.data.id);
    return r;
  }));

  summaries.push(await benchSequential('GET /api/appointments/{id}', 30, (i) =>
    httpRequest(BASE_URL, `/api/appointments/${bookedForCancel[i % bookedForCancel.length]}`, { token: receptToken })
  ));
  summaries.push(await benchSequential('GET /api/appointments', 30, () =>
    httpRequest(BASE_URL, `/api/appointments?doctorId=${doctorId}&page=0&size=20`, { token: receptToken })
  ));
  summaries.push(await benchSequential('PATCH /api/appointments/{id}/status (CANCELLED)', bookedForCancel.length, (i) =>
    httpRequest(BASE_URL, `/api/appointments/${bookedForCancel[i]}/status`, {
      method: 'PATCH',
      token: receptToken,
      body: { status: 'CANCELLED', reason: 'Baseline cancellation benchmark' },
    })
  ));

  // --- 4 & 5 & 6. Queue + Clinical + Billing end-to-end 15 iterations (today's slots!) ---
  const todaySlotsRes = await httpRequest(BASE_URL, `/api/doctors/${doctorId}/slots?date=${todayStr}`, { token: adminToken });
  const todayAvail = (todaySlotsRes.data?.slots || []).filter((s) => s.available).map((s) => s.start);
  const clinicalCount = Math.min(15, todayAvail.length);
  const checkInSamples = [];
  const callNextSamples = [];
  const createConsultSamples = [];
  const getConsultSamples = [];
  const checkSafetySamples = [];
  const createRxSamples = [];
  const getRxSamples = [];
  const pdfRxSamples = [];
  const completeSamples = [];
  const getInvoiceSamples = [];
  const payInvoiceSamples = [];
  const creditNoteSamples = [];
  const pdfInvoiceSamples = [];
  const completedInvoiceIds = [];

  for (let i = 0; i < clinicalCount; i++) {
    const patientId = createdPatientIds[i % createdPatientIds.length];
    const book = await httpRequest(BASE_URL, '/api/appointments', {
      method: 'POST',
      token: receptToken,
      body: { doctorId, patientId, slotStart: todayAvail[i], reason: 'Clinical baseline' },
    });
    if (book.status !== 201) continue;
    const apptId = book.data.id;

    checkInSamples.push(await httpRequest(BASE_URL, `/api/appointments/${apptId}/status`, {
      method: 'PATCH',
      token: receptToken,
      body: { status: 'CHECKED_IN' },
    }));

    callNextSamples.push(await httpRequest(BASE_URL, `/api/queue/doctors/${doctorId}/call-next`, {
      method: 'POST',
      token: docToken,
    }));

    const consultRes = await httpRequest(BASE_URL, `/api/appointments/${apptId}/consultation`, {
      method: 'POST',
      token: docToken,
      body: {
        vitals: { bloodPressure: '120/80', pulse: 74, temperature: 36.8, weightKg: 70.5, spo2: 99 },
        symptoms: 'Mild headache',
        diagnosis: 'Tension headache',
        notes: 'Hydration and rest',
      },
    });
    createConsultSamples.push(consultRes);
    const consultId = consultRes.data?.id;

    getConsultSamples.push(await httpRequest(BASE_URL, `/api/appointments/${apptId}/consultation`, { token: docToken }));
    checkSafetySamples.push(await httpRequest(BASE_URL, '/api/prescriptions/check', {
      method: 'POST',
      token: docToken,
      body: { patientId, medicineIds: [MED_1, MED_2] },
    }));

    const rxRes = await httpRequest(BASE_URL, '/api/prescriptions', {
      method: 'POST',
      token: docToken,
      body: {
        consultationId: consultId,
        items: [{ medicineId: MED_1, dosage: '650 mg', frequency: 'BID', durationDays: 5, instructions: 'After meals' }],
        acknowledgeSevereWarnings: true,
      },
    });
    createRxSamples.push(rxRes);
    const rxId = rxRes.data?.id;
    if (rxId) {
      getRxSamples.push(await httpRequest(BASE_URL, `/api/prescriptions/${rxId}`, { token: docToken }));
      pdfRxSamples.push(await httpRequest(BASE_URL, `/api/prescriptions/${rxId}/pdf`, { token: docToken, binary: true }));
    }

    completeSamples.push(await httpRequest(BASE_URL, `/api/appointments/${apptId}/status`, {
      method: 'PATCH',
      token: docToken,
      body: { status: 'COMPLETED' },
    }));

    const invRes = await httpRequest(BASE_URL, `/api/appointments/${apptId}/invoice`, { token: receptToken });
    getInvoiceSamples.push(invRes);
    const invId = invRes.data?.id;
    if (invId) {
      completedInvoiceIds.push(invId);
      payInvoiceSamples.push(await httpRequest(BASE_URL, `/api/invoices/${invId}/payments`, {
        method: 'POST',
        token: receptToken,
        body: { amount: '500.00', method: 'CARD', txnRef: `TXN-BASE-${runId}-${i}` },
      }));
      creditNoteSamples.push(await httpRequest(BASE_URL, `/api/invoices/${invId}/credit-notes`, {
        method: 'POST',
        token: adminToken,
        body: { amount: '50.00', reason: 'Baseline credit note' },
      }));
      pdfInvoiceSamples.push(await httpRequest(BASE_URL, `/api/invoices/${invId}/pdf`, { token: receptToken, binary: true }));
    }
  }

  for (const [label, arr] of [
    ['PATCH /api/appointments/{id}/status (CHECKED_IN)', checkInSamples],
    ['POST /api/queue/doctors/{id}/call-next', callNextSamples],
    ['POST /api/appointments/{id}/consultation', createConsultSamples],
    ['GET /api/appointments/{id}/consultation', getConsultSamples],
    ['POST /api/prescriptions/check', checkSafetySamples],
    ['POST /api/prescriptions', createRxSamples],
    ['GET /api/prescriptions/{id}', getRxSamples],
    ['GET /api/prescriptions/{id}/pdf', pdfRxSamples],
    ['PATCH /api/appointments/{id}/status (COMPLETED)', completeSamples],
    ['GET /api/appointments/{id}/invoice', getInvoiceSamples],
    ['POST /api/invoices/{id}/payments', payInvoiceSamples],
    ['POST /api/invoices/{id}/credit-notes', creditNoteSamples],
    ['GET /api/invoices/{id}/pdf', pdfInvoiceSamples],
  ]) {
    if (arr.length > 0) {
      const sumMs = arr.reduce((a, b) => a + b.ms, 0);
      summaries.push(summarizeLatencies(label, arr, sumMs));
    }
  }

  // Queue reads
  summaries.push(await benchSequential('GET /api/queue/doctors/{id}', 30, () =>
    httpRequest(BASE_URL, `/api/queue/doctors/${doctorId}`, { token: docToken })
  ));
  const boardCount = MULTI_IP ? 30 : 20;
  summaries.push(await benchSequential('GET /api/queue/board', boardCount, (i) =>
    httpRequest(BASE_URL, `/api/queue/board?clinicId=${CLINIC_ID}`, { headers: xff(300 + i) })
  ));

  summaries.push(await benchSequential('GET /api/invoices', 30, () =>
    httpRequest(BASE_URL, '/api/invoices?page=0&size=20', { token: receptToken })
  ));

  // --- 7. Reports ---
  const fromDate = isoDateOffset(-30);
  const toDate = isoDateOffset(1);
  summaries.push(await benchSequential('GET /api/reports/revenue?groupBy=DAY', 25, () =>
    httpRequest(BASE_URL, `/api/reports/revenue?from=${fromDate}&to=${toDate}&groupBy=DAY`, { token: adminToken })
  ));
  summaries.push(await benchSequential('GET /api/reports/appointments-by-department', 25, () =>
    httpRequest(BASE_URL, `/api/reports/appointments-by-department?from=${fromDate}&to=${toDate}`, { token: adminToken })
  ));
  summaries.push(await benchSequential('GET /api/reports/no-show-rate', 25, () =>
    httpRequest(BASE_URL, `/api/reports/no-show-rate?from=${fromDate}&to=${toDate}`, { token: adminToken })
  ));
  summaries.push(await benchSequential('GET /api/reports/top-doctors', 25, () =>
    httpRequest(BASE_URL, `/api/reports/top-doctors?from=${fromDate}&to=${toDate}&rankBy=COMPLETED_APPOINTMENTS&limit=10`, { token: adminToken })
  ));
  summaries.push(await benchSequential('GET /api/reports/dashboard', 25, () =>
    httpRequest(BASE_URL, '/api/reports/dashboard', { token: adminToken })
  ));

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const outPath = path.join(RESULTS_DIR, `01_baseline_${MULTI_IP ? 'multiip' : 'singleip'}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ runId, multiIp: MULTI_IP, doctorId, summaries }, null, 2));
  console.log(`Saved ${outPath}`);
  console.table(summaries.map((s) => ({
    endpoint: s.name,
    n: s.count,
    p50: s.p50Ms,
    p90: s.p90Ms,
    p95: s.p95Ms,
    p99: s.p99Ms,
    rps: s.rps,
    statuses: JSON.stringify(s.statusCounts),
  })));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
