/**
 * Automated Responsive Browser Screenshot Capture for CareSync Doctor Portal
 * Uses Chrome DevTools Protocol (CDP) directly via Node.js WebSocket.
 * Authenticates as doctor and uses client-side SPA navigation to capture live, authentic pages.
 */

import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USER_DATA_DIR = 'C:\\Users\\peral\\AppData\\Local\\Temp\\chrome-doctor-session-' + Date.now();
const SCREENSHOT_DIR = 'Z:\\javaproject\\frontend\\docs\\screenshots';
const CDP_PORT = 9223;

const VIEWPORTS = [
  { name: 'desktop', width: 1920, height: 1080, mobile: false, label: 'Desktop (1920x1080)' },
  { name: 'laptop', width: 1366, height: 768, mobile: false, label: 'Laptop (1366x768)' },
  { name: 'tablet', width: 768, height: 1024, mobile: true, label: 'Tablet (768x1024)' },
  { name: 'mobile', width: 390, height: 844, mobile: true, label: 'Mobile (390x844)' },
];

const PAGES = [
  { name: 'overview', path: '/doctor/dashboard', title: 'Physician Clinical Console' },
  { name: 'schedules', path: '/doctor/schedules', title: 'Practice Schedule & Duty Roster' },
  { name: 'queue', path: '/doctor/queue', title: 'Live Consultation Queue' },
  { name: 'patients', path: '/doctor/patients', title: 'Patient Medical Records' },
  { name: 'consultations', path: '/doctor/consultations', title: 'Clinical Encounter Workspace' },
  { name: 'history', path: '/doctor/history', title: 'Consultation History' },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.callbacks = new Map();
  }

  init() {
    return new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data));
          if (msg.id && this.callbacks.has(msg.id)) {
            const cb = this.callbacks.get(msg.id);
            this.callbacks.delete(msg.id);
            if (msg.error) {
              cb.reject(new Error(msg.error.message));
            } else {
              cb.resolve(msg.result);
            }
          }
        } catch (e) {
          console.error('Error handling CDP message:', e);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = this.id++;
      this.callbacks.set(msgId, { resolve, reject });
      this.ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    return res?.result?.value;
  }

  close() {
    try {
      this.ws.close();
    } catch {
      // ignore
    }
  }
}

async function startChrome() {
  console.log('[CDP] Launching Google Chrome with remote debugging on port', CDP_PORT);
  const chromeProcess = spawn(
    CHROME_PATH,
    [
      '--headless=new',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${USER_DATA_DIR}`,
      '--disable-gpu',
      '--no-sandbox',
      '--disable-extensions',
      '--disable-background-networking',
      'about:blank',
    ],
    { detached: false, stdio: 'ignore' }
  );

  let ready = false;
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`http://localhost:${CDP_PORT}/json/version`);
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {
      await sleep(300);
    }
  }

  if (!ready) {
    chromeProcess.kill();
    throw new Error('Chrome remote debugging port failed to respond');
  }

  console.log('[CDP] Chrome remote debugger active on port', CDP_PORT);
  return chromeProcess;
}

async function main() {
  console.log('=== CareSync Doctor Portal Responsive Browser Validation ===\n');

  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const chromeProc = await startChrome();

  try {
    const targetRes = await fetch(`http://localhost:${CDP_PORT}/json/new?http://localhost:5173/login`, {
      method: 'PUT',
    });
    const targetData = await targetRes.json();
    const wsUrl = targetData.webSocketDebuggerUrl;
    console.log('[CDP] Connected target tab:', wsUrl);

    const client = new CDPClient(wsUrl);
    await client.init();

    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('DOM.enable');

    // Wait for login inputs to mount
    for (let i = 0; i < 20; i++) {
      const hasInputs = await client.eval(`Boolean(document.querySelector('input[type="password"]'))`);
      if (hasInputs) break;
      await sleep(300);
    }

    console.log('[CDP] Logging in as Doctor: dr.qa.live.1794563025465@caresync.local...');
    await client.eval(`
      (() => {
        const emailInput = document.querySelector('input[type="email"]') || document.querySelector('input[name="email"]');
        const passInput = document.querySelector('input[type="password"]') || document.querySelector('input[name="password"]');
        const setVal = (input, val) => {
          if (!input) return;
          const proto = Object.getPrototypeOf(input);
          const set = Object.getOwnPropertyDescriptor(proto, 'value')?.set || Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (set) set.call(input, val);
          else input.value = val;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        };
        setVal(emailInput, 'dr.qa.live.1794563025465@caresync.local');
        setVal(passInput, 'DoctorPassword!123');
        const btn = document.querySelector('button[type="submit"]');
        if (btn) btn.click();
      })()
    `);

    // Wait for redirect to /doctor/dashboard
    console.log('[CDP] Awaiting authentication & navigation to Doctor Console...');
    let authed = false;
    for (let i = 0; i < 20; i++) {
      await sleep(500);
      const url = await client.eval('window.location.pathname');
      if (url && url.includes('/doctor/dashboard')) {
        authed = true;
        console.log(`[CDP] Successfully authenticated. Current pathname: ${url}`);
        break;
      }
    }

    if (!authed) {
      throw new Error('Authentication to /doctor/dashboard failed');
    }

    // Wait for initial dashboard data to mount
    await sleep(2000);

    const resultsLog = [];
    const hashInventory = new Map();

    // Loop through each viewport
    for (const vp of VIEWPORTS) {
      console.log(`\n------------------------------------------------------`);
      console.log(`Testing Viewport: ${vp.label}`);
      console.log(`------------------------------------------------------`);

      await client.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 1,
        mobile: vp.mobile,
      });

      for (const page of PAGES) {
        process.stdout.write(`  Capturing ${page.title} (${page.path})... `);

        // Client-side SPA navigation
        await client.eval(`
          (() => {
            const link = document.querySelector('a[href="${page.path}"]');
            if (link) {
              link.click();
            } else {
              window.history.pushState({}, '', '${page.path}');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }
          })()
        `);

        // Wait for page queries and UI to render
        await sleep(1500);

        // Verify pathname, authentication, document overflow, and intentional container scroll
        const pageStatus = await client.eval(`
          (() => {
            const curPath = window.location.pathname;
            const main = document.querySelector('main');
            const hasMain = Boolean(main);
            const heading = document.querySelector('h1, h2, h3, [role="heading"]')?.textContent?.trim() || '';
            const isLoginPage = curPath.includes('/login') || Boolean(document.querySelector('input[type="password"]'));
            const isAuthDoctor = !isLoginPage && Boolean(document.querySelector('header'));

            // Document-level overflow: window/document horizontal scrollbar
            const doc = document.documentElement;
            const body = document.body;
            const docScrollWidth = doc.scrollWidth;
            const bodyScrollWidth = body.scrollWidth;
            const windowWidth = window.innerWidth;
            const docClientWidth = doc.clientWidth;
            const documentLevelOverflow = docScrollWidth > windowWidth + 1 || bodyScrollWidth > windowWidth + 1;

            // Intentional container scrolling (e.g. data tables, duty roster cards with overflow-x-auto)
            const scrollContainers = Array.from(document.querySelectorAll('.overflow-x-auto, [class*="overflow-x"]'));
            const activeScrollContainers = scrollContainers.filter(el => el.scrollWidth > el.clientWidth).length;

            return {
              curPath,
              hasMain,
              heading,
              isAuthDoctor,
              isLoginPage,
              windowWidth,
              docClientWidth,
              docScrollWidth,
              bodyScrollWidth,
              documentLevelOverflow,
              activeScrollContainers,
              totalScrollContainers: scrollContainers.length,
            };
          })()
        `);

        // Capture screenshot
        const screenshotRes = await client.send('Page.captureScreenshot', {
          format: 'png',
          fromSurface: true,
        });

        const filename = `doctor-${vp.name}-${page.name}.png`;
        const filepath = path.join(SCREENSHOT_DIR, filename);
        const buf = Buffer.from(screenshotRes.data, 'base64');
        fs.writeFileSync(filepath, buf);

        const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
        const imgWidth = buf.readUInt32BE(16);
        const imgHeight = buf.readUInt32BE(20);

        if (!hashInventory.has(sha256)) {
          hashInventory.set(sha256, []);
        }
        hashInventory.get(sha256).push(filename);

        console.log(
          `✓ Saved (${(buf.length / 1024).toFixed(1)} KB | ${imgWidth}x${imgHeight} | SHA: ${sha256.slice(0, 8)}) | Heading: "${pageStatus?.heading?.slice(0, 20)}" | DocOverflow: ${
            pageStatus?.documentLevelOverflow ? 'WARN' : 'NONE'
          } | TableScroll: ${pageStatus?.activeScrollContainers}/${pageStatus?.totalScrollContainers} | Auth: ${pageStatus?.isAuthDoctor ? 'YES' : 'NO'}`
        );

        resultsLog.push({
          viewport: vp.name,
          viewportLabel: vp.label,
          page: page.name,
          title: page.title,
          path: page.path,
          filename,
          sizeBytes: buf.length,
          sha256,
          dimensions: `${imgWidth}x${imgHeight}`,
          heading: pageStatus?.heading || '',
          documentLevelOverflow: pageStatus?.documentLevelOverflow || false,
          activeScrollContainers: pageStatus?.activeScrollContainers || 0,
          totalScrollContainers: pageStatus?.totalScrollContainers || 0,
          isAuthenticatedDoctor: pageStatus?.isAuthDoctor || false,
        });
      }
    }

    client.close();

    // Write validation manifest
    fs.writeFileSync(
      'Z:\\javaproject\\frontend\\docs\\doctor-browser-validation-manifest.json',
      JSON.stringify(resultsLog, null, 2)
    );

    console.log('\n======================================================');
    console.log(`  ALL ${resultsLog.length} DOCTOR SCREENSHOTS CAPTURED SUCCESSFULLY  `);
    console.log(`  Total Unique Hashes: ${hashInventory.size} / ${resultsLog.length}`);
    console.log('======================================================\n');

    for (const [hash, files] of hashInventory.entries()) {
      if (files.length > 1) {
        console.warn(`[DUPLICATE DETECTED] Hash ${hash.slice(0, 8)}: ${files.join(', ')}`);
      }
    }
  } finally {
    try {
      chromeProc.kill();
    } catch {
      // ignore
    }
  }
}

main().catch((err) => {
  console.error('\n❌ Doctor Browser Validation Failed:', err);
  process.exit(1);
});
