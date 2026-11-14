import fs from 'node:fs';
import path from 'node:path';
import { httpRequest, pickEnv, runConcurrent, summarizeLatencies } from '../lib/client.mjs';

const BASE_URL = pickEnv('HCMS_BASE_URL', 'http://localhost:18080');
const ADMIN_EMAIL = pickEnv('HCMS_ADMIN_EMAIL', 'admin@caresync.local');
const ADMIN_PASSWORD = pickEnv('HCMS_ADMIN_PASSWORD', '');
const RECEPT_EMAIL = pickEnv('HCMS_RECEPTIONIST_EMAIL', 'reception@caresync.local');
const RECEPT_PASSWORD = pickEnv('HCMS_RECEPTIONIST_PASSWORD', '');
const RESULTS_DIR = pickEnv('HCMS_RESULTS_DIR', 'performance/results');

const CLINIC_ID = 'a1b2c3d4-0000-4000-8000-000000000001';
const SPEC_ID = 'b1000000-0000-4000-8000-000000000001';
const DEPT_ID = 'c1000000-0000-4000-8000-000000000001';

function isoDateOffset(days) {
  const d = new Date(Date.now() + days * 86400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
}

function xff(i) {
  return { 'X-Forwarded-For': `10.30.${Math.floor(i / 250) + 1}.${(i % 250) + 1}` };
}

async function main() {
  if (!ADMIN_PASSWORD || !RECEPT_PASSWORD) {
    throw new Error('HCMS_ADMIN_PASSWORD and HCMS_RECEPTIONIST_PASSWORD must be set');
  }
  const runId = Date.now();
  const report = {
    runId,
    contestedSlotRaces: [],
    uncontestedParallelBookings: null,
    cancelVsBookRace: null,
    concurrentCheckInTokens: null,
    sameAppointmentStatusRace: null,
    concurrentCallNextRace: null,
  };

  const adminRes = await httpRequest(BASE_URL, '/api/auth/login', {
    method: 'POST',
    headers: xff(1),
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (adminRes.status !== 200) throw new Error(`Admin login failed: ${adminRes.status}`);
  const adminToken = adminRes.data.accessToken;

  const receptRes = await httpRequest(BASE_URL, '/api/auth/login', {
    method: 'POST',
    headers: xff(2),
    body: { email: RECEPT_EMAIL, password: RECEPT_PASSWORD },
  });
  if (receptRes.status !== 200) throw new Error(`Receptionist login failed: ${receptRes.status}`);
  const receptToken = receptRes.data.accessToken;

  // Create 4 doctors with 24h schedules (15-min slots)
  const doctors = [];
  const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
  for (let d = 0; d < 4; d++) {
    const email = `perf.book.doc${d}.${runId}@perf.local`;
    const dr = await httpRequest(BASE_URL, '/api/doctors', {
      method: 'POST',
      token: adminToken,
      body: {
        fullName: `Dr. Concurrency ${d} ${runId}`,
        email,
        password: 'PerfDocPass!123',
        specializationId: SPEC_ID,
        clinicId: CLINIC_ID,
        departmentId: DEPT_ID,
        consultationFee: '750.00',
        slotMinutes: 5,
      },
    });
    if (dr.status !== 201) throw new Error(`Create doctor ${d} failed: ${dr.status}`);
    const sched = await httpRequest(BASE_URL, `/api/doctors/${dr.data.id}/schedules`, {
      method: 'PUT',
      token: adminToken,
      body: { entries: days.map((dayOfWeek) => ({ dayOfWeek, startTime: '06:00', endTime: '23:55' })) },
    });
    if (sched.status !== 200) throw new Error(`Schedule doctor ${d} failed: ${sched.status}`);
    const login = await httpRequest(BASE_URL, '/api/auth/login', {
      method: 'POST',
      headers: xff(10 + d),
      body: { email, password: 'PerfDocPass!123' },
    });
    if (login.status !== 200) throw new Error(`Doc login ${d} failed: ${login.status}`);
    doctors.push({ id: dr.data.id, token: login.data.accessToken });
  }

  // Create 100 walk-in patients for distinct contention identities
  const patientIds = [];
  for (let p = 0; p < 100; p++) {
    const pr = await httpRequest(BASE_URL, '/api/patients', {
      method: 'POST',
      token: receptToken,
      body: {
        fullName: `Race Patient ${runId} ${p}`,
        gender: 'FEMALE',
        phone: `96000${String(p).padStart(5, '0')}`,
        allergies: [],
      },
    });
    if (pr.status === 201) patientIds.push(pr.data.id);
  }

  // Fetch available future slots (tomorrow + 2 days) per doctor
  const slotsByDoctor = [];
  for (let d = 0; d < doctors.length; d++) {
    const slots = [];
    for (let dayOffset = 1; dayOffset <= 3; dayOffset++) {
      const sr = await httpRequest(BASE_URL, `/api/doctors/${doctors[d].id}/slots?date=${isoDateOffset(dayOffset)}`, { token: adminToken });
      for (const s of (sr.data?.slots || [])) {
        if (s.available) slots.push(s.start);
      }
    }
    slotsByDoctor.push(slots);
  }

  // 1. Contested single-slot races at c = 10, 25, 50, 100
  const raceLevels = [10, 25, 50, 100];
  for (let rIdx = 0; rIdx < raceLevels.length; rIdx++) {
    const c = raceLevels[rIdx];
    const targetDoc = doctors[0].id;
    const targetSlot = slotsByDoctor[0][rIdx];
    const { results, wallMs } = await runConcurrent(c, c, (i) =>
      httpRequest(BASE_URL, '/api/appointments', {
        method: 'POST',
        token: receptToken,
        body: {
          doctorId: targetDoc,
          patientId: patientIds[i % patientIds.length],
          slotStart: targetSlot,
          reason: `Contested race c=${c}`,
        },
      })
    );
    const summary = summarizeLatencies(`Contested Same-Slot Booking (c=${c})`, results, wallMs);
    const created201 = results.filter((r) => r.status === 201);
    const conflict409 = results.filter((r) => r.status === 409 && r.data?.code === 'SLOT_ALREADY_BOOKED');
    report.contestedSlotRaces.push({
      concurrency: c,
      summary,
      created201Count: created201.length,
      slotAlreadyBooked409Count: conflict409.length,
      errors5xxCount: summary.errors5xx,
      winnerAppointmentId: created201[0]?.data?.id || null,
    });
  }

  // 2. Different patients booking different slots across all 4 doctors simultaneously (50 bookings, c=50)
  const uncontestedTargets = [];
  for (let i = 0; i < 50; i++) {
    const dIdx = i % doctors.length;
    const slotIdx = 10 + Math.floor(i / doctors.length);
    uncontestedTargets.push({ doctorId: doctors[dIdx].id, slotStart: slotsByDoctor[dIdx][slotIdx], patientId: patientIds[i % patientIds.length] });
  }
  const { results: multiResults, wallMs: multiWall } = await runConcurrent(50, 50, (i) =>
    httpRequest(BASE_URL, '/api/appointments', {
      method: 'POST',
      token: receptToken,
      body: {
        doctorId: uncontestedTargets[i].doctorId,
        patientId: uncontestedTargets[i].patientId,
        slotStart: uncontestedTargets[i].slotStart,
        reason: 'Parallel uncontested booking',
      },
    })
  );
  report.uncontestedParallelBookings = {
    summary: summarizeLatencies('Parallel Distinct-Slot Bookings (c=50, 4 doctors)', multiResults, multiWall),
    created201Count: multiResults.filter((r) => r.status === 201).length,
  };

  // 3. Concurrent Cancel + Rebook on 10 booked slots
  const cancelRebookTargets = multiResults.filter((r) => r.status === 201).slice(0, 10).map((r) => r.data);
  const { results: crResults, wallMs: crWall } = await runConcurrent(cancelRebookTargets.length * 2, 20, (i) => {
    const target = cancelRebookTargets[Math.floor(i / 2)];
    if (i % 2 === 0) {
      return httpRequest(BASE_URL, `/api/appointments/${target.id}/status`, {
        method: 'PATCH',
        token: receptToken,
        body: { status: 'CANCELLED', reason: 'Concurrent cancel race' },
      });
    }
    return httpRequest(BASE_URL, '/api/appointments', {
      method: 'POST',
      token: receptToken,
      body: {
        doctorId: target.doctorId,
        patientId: patientIds[(i + 7) % patientIds.length],
        slotStart: target.slotStart,
        reason: 'Concurrent rebook race',
      },
    });
  });
  report.cancelVsBookRace = summarizeLatencies('Concurrent Cancel vs Rebook (10 pairs, c=20)', crResults, crWall);

  // 4. Concurrent Check-In across 25 today appointments for doctor 1 (verifying atomic daily tokens!)
  const doc1TodaySlotsRes = await httpRequest(BASE_URL, `/api/doctors/${doctors[1].id}/slots?date=${isoDateOffset(0)}`, { token: adminToken });
  const doc1TodaySlots = (doc1TodaySlotsRes.data?.slots || []).filter((s) => s.available).map((s) => s.start);
  const checkInTargets = [];
  for (let i = 0; i < Math.min(25, doc1TodaySlots.length); i++) {
    const br = await httpRequest(BASE_URL, '/api/appointments', {
      method: 'POST',
      token: receptToken,
      body: {
        doctorId: doctors[1].id,
        patientId: patientIds[i % patientIds.length],
        slotStart: doc1TodaySlots[i],
        reason: 'Check-in token race',
      },
    });
    if (br.status === 201) checkInTargets.push(br.data.id);
  }
  const { results: ciResults, wallMs: ciWall } = await runConcurrent(checkInTargets.length, checkInTargets.length, (i) =>
    httpRequest(BASE_URL, `/api/appointments/${checkInTargets[i]}/status`, {
      method: 'PATCH',
      token: receptToken,
      body: { status: 'CHECKED_IN' },
    })
  );
  const issuedTokens = ciResults
    .filter((r) => r.status === 200 && r.data?.tokenNumber != null)
    .map((r) => r.data.tokenNumber)
    .sort((a, b) => a - b);
  const uniqueTokens = new Set(issuedTokens);
  report.concurrentCheckInTokens = {
    summary: summarizeLatencies(`Concurrent Check-In Token Assignment (c=${checkInTargets.length})`, ciResults, ciWall),
    issuedTokenCount: issuedTokens.length,
    uniqueTokenCount: uniqueTokens.size,
    tokensContiguousFrom1: issuedTokens.length > 0 && issuedTokens[0] === 1 && issuedTokens[issuedTokens.length - 1] === issuedTokens.length,
    minToken: issuedTokens[0] || null,
    maxToken: issuedTokens[issuedTokens.length - 1] || null,
  };

  // 5. Concurrent transition race on SAME appointment (20 concurrent updates: CHECKED_IN vs CANCELLED)
  if (doc1TodaySlots.length > checkInTargets.length) {
    const singleAppt = await httpRequest(BASE_URL, '/api/appointments', {
      method: 'POST',
      token: receptToken,
      body: {
        doctorId: doctors[1].id,
        patientId: patientIds[0],
        slotStart: doc1TodaySlots[checkInTargets.length],
        reason: 'Same-appointment transition race',
      },
    });
    if (singleAppt.status === 201) {
      const targetId = singleAppt.data.id;
      const { results: stResults, wallMs: stWall } = await runConcurrent(20, 20, (i) =>
        httpRequest(BASE_URL, `/api/appointments/${targetId}/status`, {
          method: 'PATCH',
          token: receptToken,
          body: i % 2 === 0
            ? { status: 'CHECKED_IN' }
            : { status: 'CANCELLED', reason: 'Concurrent status race' },
        })
      );
      report.sameAppointmentStatusRace = {
        summary: summarizeLatencies('Same-Appointment Concurrent Status Race (c=20)', stResults, stWall),
        succeeded200Count: stResults.filter((r) => r.status === 200).length,
        conflict409Count: stResults.filter((r) => r.status === 409).length,
      };
    }
  }

  // 6. Concurrent call-next race (c=10 on doctor 1 which already has waiting checked-in patients)
  const { results: cnResults, wallMs: cnWall } = await runConcurrent(10, 10, () =>
    httpRequest(BASE_URL, `/api/queue/doctors/${doctors[1].id}/call-next`, {
      method: 'POST',
      token: doctors[1].token,
    })
  );
  report.concurrentCallNextRace = {
    summary: summarizeLatencies('Concurrent Queue call-next Race (c=10)', cnResults, cnWall),
    succeeded200Count: cnResults.filter((r) => r.status === 200).length,
    conflict409Count: cnResults.filter((r) => r.status === 409).length,
  };

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const outPath = path.join(RESULTS_DIR, '03_booking_races.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Saved ${outPath}`);
  console.table(report.contestedSlotRaces.map((r) => ({
    concurrency: r.concurrency,
    created201: r.created201Count,
    conflict409: r.slotAlreadyBooked409Count,
    err5xx: r.summary.errors5xx,
    p50: r.summary.p50Ms,
    p95: r.summary.p95Ms,
    p99: r.summary.p99Ms,
    rps: r.summary.rps,
  })));
  console.log('Check-in tokens:', report.concurrentCheckInTokens);
  console.log('Same-appt status race:', report.sameAppointmentStatusRace);
  console.log('Call-next race:', report.concurrentCallNextRace);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
