import { performance } from 'node:perf_hooks';

export function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

export function summarizeLatencies(name, samples, wallMs) {
  const durations = samples.map((s) => s.ms).sort((a, b) => a - b);
  const statusCounts = {};
  let errors5xx = 0;
  let transportErrors = 0;
  for (const s of samples) {
    const key = String(s.status);
    statusCounts[key] = (statusCounts[key] || 0) + 1;
    if (s.status === 'ERR' || s.status === 'TIMEOUT') {
      transportErrors++;
    } else if (Number(s.status) >= 500) {
      errors5xx++;
    }
  }
  const sum = durations.reduce((a, b) => a + b, 0);
  const avg = durations.length ? sum / durations.length : 0;
  const rps = wallMs > 0 ? (samples.length / (wallMs / 1000)) : 0;
  return {
    name,
    count: samples.length,
    wallMs: round2(wallMs),
    rps: round2(rps),
    minMs: round2(durations[0] || 0),
    avgMs: round2(avg),
    p50Ms: round2(percentile(durations, 50)),
    p90Ms: round2(percentile(durations, 90)),
    p95Ms: round2(percentile(durations, 95)),
    p99Ms: round2(percentile(durations, 99)),
    maxMs: round2(durations[durations.length - 1] || 0),
    errors5xx,
    transportErrors,
    statusCounts,
  };
}

export function round2(n) {
  return Math.round(n * 100) / 100;
}

export async function httpRequest(baseUrl, path, {
  method = 'GET',
  token = null,
  body = null,
  headers = {},
  timeoutMs = 15000,
  binary = false,
} = {}) {
  const url = path.startsWith('http') ? path : `${baseUrl}${path}`;
  const reqHeaders = { ...headers };
  if (token) {
    reqHeaders.Authorization = `Bearer ${token}`;
  }
  let payload;
  if (body !== null && body !== undefined) {
    reqHeaders['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = performance.now();
  try {
    const res = await fetch(url, {
      method,
      headers: reqHeaders,
      body: payload,
      signal: controller.signal,
    });
    let data = null;
    let bytes = 0;
    if (binary) {
      const buf = await res.arrayBuffer();
      bytes = buf.byteLength;
    } else {
      const text = await res.text();
      bytes = Buffer.byteLength(text, 'utf8');
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }
    }
    const ms = performance.now() - start;
    return { status: res.status, ms, data, bytes, headers: Object.fromEntries(res.headers.entries()) };
  } catch (err) {
    const ms = performance.now() - start;
    return {
      status: err?.name === 'AbortError' ? 'TIMEOUT' : 'ERR',
      ms,
      data: { error: err?.message || String(err) },
      bytes: 0,
      headers: {},
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function runConcurrent(total, concurrency, fn) {
  const results = new Array(total);
  let nextIdx = 0;
  const start = performance.now();
  async function worker() {
    while (true) {
      const idx = nextIdx++;
      if (idx >= total) break;
      results[idx] = await fn(idx);
    }
  }
  const workers = Array.from({ length: Math.min(total, concurrency) }, () => worker());
  await Promise.all(workers);
  const wallMs = performance.now() - start;
  return { results, wallMs };
}

export function buildStompFrame(command, headers = {}, body = '') {
  const lines = [command];
  for (const [k, v] of Object.entries(headers)) {
    lines.push(`${k}:${v}`);
  }
  lines.push('');
  lines.push(body);
  return `${lines.join('\n')}\0`;
}

export function parseStompFrames(raw) {
  const frames = [];
  const parts = String(raw).split('\0');
  for (const part of parts) {
    const cleaned = part.replace(/^\n+/, '');
    if (!cleaned) continue;
    const sepIdx = cleaned.indexOf('\n\n');
    const headerBlock = sepIdx >= 0 ? cleaned.slice(0, sepIdx) : cleaned;
    const body = sepIdx >= 0 ? cleaned.slice(sepIdx + 2) : '';
    const lines = headerBlock.split('\n');
    const command = lines[0]?.trim();
    const headers = {};
    for (let i = 1; i < lines.length; i++) {
      const colon = lines[i].indexOf(':');
      if (colon > 0) {
        headers[lines[i].slice(0, colon)] = lines[i].slice(colon + 1);
      }
    }
    frames.push({ command, headers, body });
  }
  return frames;
}

export function pickEnv(name, fallback = '') {
  const val = process.env[name];
  return val !== undefined && val !== '' ? val : fallback;
}
