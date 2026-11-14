import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { httpRequest, pickEnv, runConcurrent, summarizeLatencies } from '../lib/client.mjs';

const BASE_URL = pickEnv('HCMS_BASE_URL', 'http://localhost:18080');
const ADMIN_EMAIL = pickEnv('HCMS_ADMIN_EMAIL', 'admin@caresync.local');
const ADMIN_PASSWORD = pickEnv('HCMS_ADMIN_PASSWORD', '');
const RECEPT_EMAIL = pickEnv('HCMS_RECEPTIONIST_EMAIL', 'reception@caresync.local');
const RECEPT_PASSWORD = pickEnv('HCMS_RECEPTIONIST_PASSWORD', '');
const RESULTS_DIR = pickEnv('HCMS_RESULTS_DIR', 'performance/results');

const CLINIC_1 = 'a1b2c3d4-0000-4000-8000-000000000001';
const SCALE_DOC_1 = 'e0000004-0000-4000-8000-000000000001';
const SCALE_INV_2 = 'e0000008-0000-4000-8000-000000000002';

function isoDateOffset(days) {
  const d = new Date(Date.now() + days * 86400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
}

async function bench(name, count, concurrency, fn) {
  const { results, wallMs } = await runConcurrent(count, concurrency, fn);
  return summarizeLatencies(name, results, wallMs);
}

async function main() {
  if (!ADMIN_PASSWORD || !RECEPT_PASSWORD) {
    throw new Error('HCMS_ADMIN_PASSWORD and HCMS_RECEPTIONIST_PASSWORD must be set');
  }

  const adminRes = await httpRequest(BASE_URL, '/api/auth/login', {
    method: 'POST',
    headers: { 'X-Forwarded-For': '10.90.0.1' },
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (adminRes.status !== 200) throw new Error(`Admin login failed: ${adminRes.status}`);
  const adminToken = adminRes.data.accessToken;

  const receptRes = await httpRequest(BASE_URL, '/api/auth/login', {
    method: 'POST',
    headers: { 'X-Forwarded-For': '10.90.0.2' },
    body: { email: RECEPT_EMAIL, password: RECEPT_PASSWORD },
  });
  const receptToken = receptRes.data.accessToken;

  const docRes = await httpRequest(BASE_URL, '/api/auth/login', {
    method: 'POST',
    headers: { 'X-Forwarded-For': '10.90.0.3' },
    body: { email: 'scale.doc.1@perf.local', password: ADMIN_PASSWORD },
  });
  const scaleDocToken = docRes.status === 200 ? docRes.data.accessToken : null;

  const summaries = [];

  // Phase H: Scale queries under 50k appts / 10k patients / 30k invoices / 100k audit logs
  summaries.push(await bench('Scale Patient Search: phone prefix (c=10, n=30)', 30, 10, () =>
    httpRequest(BASE_URL, '/api/patients?phone=910001&page=0&size=20', { token: receptToken })
  ));
  summaries.push(await bench('Scale Patient Search: name substring (c=10, n=30)', 30, 10, () =>
    httpRequest(BASE_URL, '/api/patients?name=Pat005&page=0&size=20', { token: receptToken })
  ));
  if (scaleDocToken) {
    summaries.push(await bench('Scale Patient Search: DOCTOR EXISTS scoped (c=10, n=30)', 30, 10, () =>
      httpRequest(BASE_URL, '/api/patients?name=Pat&page=0&size=20', { token: scaleDocToken })
    ));
  }
  summaries.push(await bench('Scale Doctor List (100+ doctors, c=10, n=30)', 30, 10, () =>
    httpRequest(BASE_URL, '/api/doctors?page=0&size=20', { token: adminToken })
  ));
  summaries.push(await bench('Scale Appointment List: all (50k rows, c=10, n=30)', 30, 10, () =>
    httpRequest(BASE_URL, '/api/appointments?page=0&size=20', { token: adminToken })
  ));
  summaries.push(await bench('Scale Appointment List: doctor scoped (c=10, n=30)', 30, 10, () =>
    httpRequest(BASE_URL, `/api/appointments?doctorId=${SCALE_DOC_1}&page=0&size=20`, { token: adminToken })
  ));
  summaries.push(await bench('Scale Queue Board: Clinic 1 (20+ doctors, c=10, n=30)', 30, 10, (i) =>
    httpRequest(BASE_URL, `/api/queue/board?clinicId=${CLINIC_1}`, {
      headers: { 'X-Forwarded-For': `10.91.1.${(i % 250) + 1}` },
    })
  ));
  summaries.push(await bench('Scale Invoice List (30k rows, c=10, n=30)', 30, 10, () =>
    httpRequest(BASE_URL, '/api/invoices?status=PAID&page=0&size=20', { token: receptToken })
  ));
  summaries.push(await bench('Scale Invoice Detail GET (c=10, n=30)', 30, 10, () =>
    httpRequest(BASE_URL, `/api/invoices/${SCALE_INV_2}`, { token: receptToken })
  ));
  summaries.push(await bench('Scale Invoice PDF Render (c=5, n=15)', 15, 5, () =>
    httpRequest(BASE_URL, `/api/invoices/${SCALE_INV_2}/pdf`, { token: receptToken, binary: true })
  ));
  summaries.push(await bench('Scale Audit Logs Paginated (100k rows, c=10, n=30)', 30, 10, () =>
    httpRequest(BASE_URL, '/api/audit-logs?page=0&size=20', { token: adminToken })
  ));
  summaries.push(await bench('Scale Audit Logs by Action + Page (c=10, n=30)', 30, 10, () =>
    httpRequest(BASE_URL, '/api/audit-logs?action=PATIENT_READ&page=0&size=20', { token: adminToken })
  ));

  // Phase I: Reporting benchmarks across DAY / MONTH across 30d, 180d, and max 366d windows
  const from30 = isoDateOffset(-30);
  const from180 = isoDateOffset(-180);
  const from365 = isoDateOffset(-365);
  const today = isoDateOffset(0);
  const futureFrom = isoDateOffset(40);
  const futureTo = isoDateOffset(50);

  for (const [label, url] of [
    ['Report Revenue DAY (30d)', `/api/reports/revenue?from=${from30}&to=${today}&groupBy=DAY`],
    ['Report Revenue DAY (180d)', `/api/reports/revenue?from=${from180}&to=${today}&groupBy=DAY`],
    ['Report Revenue DAY (366d max)', `/api/reports/revenue?from=${from365}&to=${today}&groupBy=DAY`],
    ['Report Revenue MONTH (180d)', `/api/reports/revenue?from=${from180}&to=${today}&groupBy=MONTH`],
    ['Report Revenue MONTH (366d max)', `/api/reports/revenue?from=${from365}&to=${today}&groupBy=MONTH`],
    ['Report Dept Appointments (180d, all clinics)', `/api/reports/appointments-by-department?from=${from180}&to=${today}`],
    ['Report Dept Appointments (180d, clinic 1)', `/api/reports/appointments-by-department?from=${from180}&to=${today}&clinicId=${CLINIC_1}`],
    ['Report No-Show Rate (180d)', `/api/reports/no-show-rate?from=${from180}&to=${today}`],
    ['Report Top Doctors: COMPLETED_APPOINTMENTS (180d)', `/api/reports/top-doctors?from=${from180}&to=${today}&rankBy=COMPLETED_APPOINTMENTS&limit=10`],
    ['Report Top Doctors: COLLECTED_REVENUE (180d)', `/api/reports/top-doctors?from=${from180}&to=${today}&rankBy=COLLECTED_REVENUE&limit=10`],
    ['Report Dashboard (all clinics)', '/api/reports/dashboard'],
    ['Report Dashboard (clinic 1)', `/api/reports/dashboard?clinicId=${CLINIC_1}`],
  ]) {
    summaries.push(await bench(label, 20, 4, () => httpRequest(BASE_URL, url, { token: adminToken })));
  }

  // Verify Report correctness invariants explicitly
  const zeroDenom = await httpRequest(BASE_URL, `/api/reports/no-show-rate?from=${futureFrom}&to=${futureTo}`, { token: adminToken });
  const badRange = await httpRequest(BASE_URL, `/api/reports/revenue?from=${today}&to=${from30}&groupBy=DAY`, { token: adminToken });
  const revMonth = await httpRequest(BASE_URL, `/api/reports/revenue?from=${from180}&to=${today}&groupBy=MONTH`, { token: adminToken });

  const invariants = {
    zeroDenominatorNoShowRateStatus: zeroDenom.status,
    zeroDenominatorRatePercentIsNull: zeroDenom.data?.ratePercent === null,
    invertedDateRangeStatus: badRange.status,
    invertedDateRangeCode: badRange.data?.code || null,
    revenue180dTotals: revMonth.data?.totals || null,
    revenue180dBucketsCount: revMonth.data?.buckets?.length || 0,
  };

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const outPath = path.join(RESULTS_DIR, '06_scale_and_reports.json');
  fs.writeFileSync(outPath, JSON.stringify({ summaries, invariants }, null, 2));
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
  console.log('Report invariants:', invariants);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
