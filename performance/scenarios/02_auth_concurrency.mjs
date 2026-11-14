import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { httpRequest, pickEnv, runConcurrent, summarizeLatencies } from '../lib/client.mjs';

const BASE_URL = pickEnv('HCMS_BASE_URL', 'http://localhost:18080');
const ADMIN_EMAIL = pickEnv('HCMS_ADMIN_EMAIL', 'admin@caresync.local');
const ADMIN_PASSWORD = pickEnv('HCMS_ADMIN_PASSWORD', '');
const RESULTS_DIR = pickEnv('HCMS_RESULTS_DIR', 'performance/results');
const MULTI_IP = pickEnv('HCMS_MULTI_IP', '0') === '1';

function xff(i) {
  return MULTI_IP ? { 'X-Forwarded-For': `10.20.${Math.floor(i / 250) + 1}.${(i % 250) + 1}` } : {};
}

async function seedUser(idx, runId) {
  const email = `perf.auth.${runId}.${idx}@perf.local`;
  const password = 'PerfAuthPass!123';
  const r = await httpRequest(BASE_URL, '/api/auth/register', {
    method: 'POST',
    headers: { 'X-Forwarded-For': `10.21.${Math.floor(idx / 250) + 1}.${(idx % 250) + 1}` },
    body: {
      fullName: `Auth Perf ${idx}`,
      email,
      password,
      phone: `99110${String(idx).padStart(5, '0')}`,
    },
  });
  return { email, password, status: r.status, refreshToken: r.data?.refreshToken, userId: r.data?.user?.id };
}

async function main() {
  if (!ADMIN_PASSWORD) throw new Error('HCMS_ADMIN_PASSWORD must be set');
  const runId = Date.now();
  const report = { runId, multiIp: MULTI_IP, concurrencyLevels: [], refreshRace: null, replayCheck: null, logoutRace: null };

  // Seed a pool of 20 users in MULTI_IP mode (or 4 in single-IP mode due to 5/min register limit)
  const poolSize = MULTI_IP ? 25 : 4;
  const users = [];
  for (let i = 0; i < poolSize; i++) {
    const u = await seedUser(i, runId);
    if (u.status === 201) users.push(u);
  }
  if (users.length === 0) {
    throw new Error('Failed to seed any test users (possibly single-IP register bucket exhausted)');
  }

  // Simultaneous login waves: 10, 25, 50, 100
  const levels = [10, 25, 50, 100];
  for (const n of levels) {
    const { results, wallMs } = await runConcurrent(n, n, (i) => {
      const u = users[i % users.length];
      return httpRequest(BASE_URL, '/api/auth/login', {
        method: 'POST',
        headers: xff(1000 + n * 200 + i),
        body: { email: u.email, password: u.password },
      });
    });
    const summary = summarizeLatencies(`POST /api/auth/login (c=${n}, ${MULTI_IP ? 'multi-ip' : 'single-ip'})`, results, wallMs);
    report.concurrencyLevels.push(summary);
  }

  if (MULTI_IP) {
    // Seed a fresh user specifically for concurrent single-token refresh race (c=25)
    const raceUser = await seedUser(9901, runId);
    const initialRefresh = raceUser.refreshToken;
    const { results: raceResults, wallMs: raceWall } = await runConcurrent(25, 25, (i) =>
      httpRequest(BASE_URL, '/api/auth/refresh', {
        method: 'POST',
        headers: xff(5000 + i),
        body: { refreshToken: initialRefresh },
      })
    );
    const raceSummary = summarizeLatencies('POST /api/auth/refresh (same-token 25x race)', raceResults, raceWall);
    const won200 = raceResults.filter((r) => r.status === 200);
    const rotatedToken = won200[0]?.data?.refreshToken || null;

    // Replay check: try using BOTH the old token and the newly issued replacement token!
    // Because AuthService.refresh revokes all active tokens on replay detection, the replacement token may ALREADY be revoked!
    const oldReplayRes = await httpRequest(BASE_URL, '/api/auth/refresh', {
      method: 'POST',
      headers: xff(5100),
      body: { refreshToken: initialRefresh },
    });
    const newReplayAfterCompromise = rotatedToken
      ? await httpRequest(BASE_URL, '/api/auth/refresh', {
          method: 'POST',
          headers: xff(5101),
          body: { refreshToken: rotatedToken },
        })
      : null;

    report.refreshRace = {
      summary: raceSummary,
      succeeded200Count: won200.length,
      rejected401Count: raceResults.filter((r) => r.status === 401).length,
      errors5xxCount: raceSummary.errors5xx,
    };
    report.replayCheck = {
      oldTokenReplayStatus: oldReplayRes.status,
      oldTokenReplayCode: oldReplayRes.data?.code || null,
      rotatedTokenStatusAfterReplayRevocation: newReplayAfterCompromise?.status || null,
      rotatedTokenCode: newReplayAfterCompromise?.data?.code || null,
    };

    // Concurrent refresh + logout race across 10 pairs on fresh user
    const logoutUser = await seedUser(9902, runId);
    const tok = logoutUser.refreshToken;
    const { results: mixResults, wallMs: mixWall } = await runConcurrent(20, 20, (i) =>
      httpRequest(BASE_URL, i % 2 === 0 ? '/api/auth/logout' : '/api/auth/refresh', {
        method: 'POST',
        headers: xff(6000 + i),
        body: { refreshToken: tok },
      })
    );
    // Verify subsequent refresh with tok is rejected
    const postLogoutRefresh = await httpRequest(BASE_URL, '/api/auth/refresh', {
      method: 'POST',
      headers: xff(6100),
      body: { refreshToken: tok },
    });
    report.logoutRace = {
      summary: summarizeLatencies('Concurrent refresh + logout race (c=20)', mixResults, mixWall),
      postRaceRefreshStatus: postLogoutRefresh.status,
      postRaceRefreshCode: postLogoutRefresh.data?.code || null,
    };
  }

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const outPath = path.join(RESULTS_DIR, `02_auth_concurrency_${MULTI_IP ? 'multiip' : 'singleip'}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Saved ${outPath}`);
  console.table(report.concurrencyLevels.map((s) => ({
    name: s.name,
    p50: s.p50Ms,
    p90: s.p90Ms,
    p95: s.p95Ms,
    p99: s.p99Ms,
    rps: s.rps,
    statuses: JSON.stringify(s.statusCounts),
  })));
  if (report.refreshRace) console.log('Refresh race:', report.refreshRace, 'Replay:', report.replayCheck, 'Logout race:', report.logoutRace);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
