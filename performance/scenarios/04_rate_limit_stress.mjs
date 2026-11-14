import fs from 'node:fs';
import path from 'node:path';
import { httpRequest, pickEnv, runConcurrent, summarizeLatencies } from '../lib/client.mjs';

const BASE_URL = pickEnv('HCMS_BASE_URL', 'http://localhost:18080');
const RESULTS_DIR = pickEnv('HCMS_RESULTS_DIR', 'performance/results');
const MULTI_IP = pickEnv('HCMS_MULTI_IP', '0') === '1';
const CLINIC_ID = 'a1b2c3d4-0000-4000-8000-000000000001';

async function main() {
  const report = {
    multiIpTrustedProxyMode: MULTI_IP,
    singleIpBurst: null,
    spoofAttemptCheck: null,
    malformedHeadersCheck: null,
    manyIpCacheEvictionStress: null,
    unrelatedIpAfterSaturation: null,
    nonLimitedVsLimitedComparison: null,
  };

  // 1. Single-IP burst on GET /api/queue/board (limit = 30/min)
  const { results: burstRes, wallMs: burstWall } = await runConcurrent(60, 20, () =>
    httpRequest(BASE_URL, `/api/queue/board?clinicId=${CLINIC_ID}`, {
      headers: { 'X-Forwarded-For': '10.88.1.1' },
    })
  );
  const retryAfterHeadersPresent = burstRes.filter((r) => r.status === 429 && Number(r.headers['retry-after']) >= 1).length;
  report.singleIpBurst = {
    summary: summarizeLatencies('Single-IP Queue Board Burst (60 reqs, limit=30/min)', burstRes, burstWall),
    ok200Count: burstRes.filter((r) => r.status === 200).length,
    throttled429Count: burstRes.filter((r) => r.status === 429).length,
    retryAfterHeadersPresent,
  };

  // 2. Spoofing / mode verification with varying X-Forwarded-For right after 10.88.1.1 burst
  const { results: diffIpRes, wallMs: diffIpWall } = await runConcurrent(10, 5, (i) =>
    httpRequest(BASE_URL, `/api/queue/board?clinicId=${CLINIC_ID}`, {
      headers: { 'X-Forwarded-For': `10.88.2.${i + 1}` },
    })
  );
  report.spoofAttemptCheck = {
    mode: MULTI_IP ? 'prod_trusted_proxy' : 'dev_ignores_xff',
    summary: summarizeLatencies('Different XFF IPs check (n=10)', diffIpRes, diffIpWall),
  };

  // 3. Malformed forwarding headers
  const malformedValues = ['', 'unknown', 'not-an-ip', '999.999.999.999', '10.1.1.1, bad_ip, 127.0.0.1'];
  const { results: malRes, wallMs: malWall } = await runConcurrent(malformedValues.length, 5, (i) =>
    httpRequest(BASE_URL, `/api/queue/board?clinicId=${CLINIC_ID}`, {
      headers: { 'X-Forwarded-For': malformedValues[i] },
    })
  );
  report.malformedHeadersCheck = {
    summary: summarizeLatencies('Malformed X-Forwarded-For checks', malRes, malWall),
    perHeaderStatuses: malformedValues.map((v, idx) => ({ xff: v, status: malRes[idx].status })),
  };

  if (MULTI_IP) {
    // 4. Saturation & LRU eviction test: 11,500 unique client IPs > DEFAULT_MAX_BUCKET_CACHE_SIZE (10,000)
    const totalDistinct = 11500;
    const { results: satRes, wallMs: satWall } = await runConcurrent(totalDistinct, 64, (i) => {
      const a = 11 + Math.floor(i / 65025);
      const b = Math.floor((i % 65025) / 255);
      const c = (i % 255) + 1;
      return httpRequest(BASE_URL, `/api/queue/board?clinicId=${CLINIC_ID}`, {
        headers: { 'X-Forwarded-For': `${a}.50.${b}.${c}` },
      });
    });
    report.manyIpCacheEvictionStress = summarizeLatencies(
      `11,500 Distinct Client IPs LRU Eviction Stress (c=64)`,
      satRes,
      satWall
    );

    // 5. Verify fresh unrelated client IP succeeds after cache saturation
    const freshCheck = await httpRequest(BASE_URL, `/api/queue/board?clinicId=${CLINIC_ID}`, {
      headers: { 'X-Forwarded-For': '198.51.100.77' },
    });
    report.unrelatedIpAfterSaturation = { status: freshCheck.status, ms: Math.round(freshCheck.ms * 100) / 100 };

    // 6. Lightweight comparison: RateLimit-evaluated endpoint vs pass-through (401/health)
    const { results: passRes, wallMs: passWall } = await runConcurrent(200, 20, () =>
      httpRequest(BASE_URL, '/actuator/health')
    );
    const { results: limRes, wallMs: limWall } = await runConcurrent(200, 20, (i) =>
      httpRequest(BASE_URL, `/api/queue/board?clinicId=${CLINIC_ID}`, {
        headers: { 'X-Forwarded-For': `172.25.1.${(i % 250) + 1}` },
      })
    );
    report.nonLimitedVsLimitedComparison = {
      actuatorHealthPassThrough: summarizeLatencies('GET /actuator/health (no RateLimit rule, n=200, c=20)', passRes, passWall),
      rateLimitedQueueBoard: summarizeLatencies('GET /api/queue/board (RateLimit active, n=200, c=20)', limRes, limWall),
    };
  }

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const outPath = path.join(RESULTS_DIR, `04_rate_limit_stress_${MULTI_IP ? 'multiip' : 'singleip'}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Saved ${outPath}`);
  console.log('Single-IP burst:', report.singleIpBurst);
  console.log('Malformed headers:', report.malformedHeadersCheck?.perHeaderStatuses);
  if (report.manyIpCacheEvictionStress) {
    console.log('11.5k distinct IP saturation:', report.manyIpCacheEvictionStress);
    console.log('Unrelated IP post-eviction:', report.unrelatedIpAfterSaturation);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
