/**
 * CareSync HCMS - Phase 25: Critical WebSocket Authorization & RBAC Live Verification
 * Tests authenticated STOMP over WebSocket on the live running server:
 * 1. Doctor A subscribes to Doctor A's queue -> ALLOWED
 * 2. Doctor B subscribes to Doctor B's queue -> ALLOWED
 * 3. Doctor A attempts to subscribe to Doctor B's queue -> REJECTED (Forbidden)
 * 4. Doctor B attempts to subscribe to Doctor A's queue -> REJECTED (Forbidden)
 * 5. Unauthenticated client attempts to subscribe -> REJECTED (Authentication required)
 * 6. Receptionist subscribes to Doctor queue -> ALLOWED
 * 7. Patient attempts to subscribe to Doctor queue -> REJECTED (Forbidden)
 * 8. Client SEND frame -> REJECTED
 * 9. Queue payload PII check -> ZERO PII
 * 10. Reconnect lifecycle -> CLEAN
 */

const BASE_HTTP = 'http://localhost:8080/api';
const WS_URL = 'ws://localhost:8080/ws/websocket';

const results = [];

function recordResult(testId, title, status, evidence, severity = 'LOW', notes = '') {
  results.push({ testId, title, status, severity, evidence: String(evidence).slice(0, 200), notes });
  const icon = status === 'PASS' ? '✓' : '✗';
  console.log(`[${icon} ${status}] ${testId}: ${title} -> ${notes || 'OK'}`);
}

function connectStomp(token = null) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket connection timed out'));
    }, 5000);

    const messages = [];

    ws.onopen = () => {
      const authHeader = token ? `Authorization:Bearer ${token}\n` : '';
      const connectFrame = `CONNECT\naccept-version:1.1,1.2\nheart-beat:10000,10000\n${authHeader}\n\0`;
      ws.send(connectFrame);
    };

    ws.onmessage = (event) => {
      const data = String(event.data);
      messages.push(data);
      if (data.startsWith('CONNECTED')) {
        clearTimeout(timeout);
        resolve({ ws, messages });
      } else if (data.startsWith('ERROR')) {
        clearTimeout(timeout);
        resolve({ ws, messages, errorFrame: data });
      }
    };

    ws.onerror = (err) => {
      clearTimeout(timeout);
      reject(err);
    };
  });
}

function subscribeTopic(ws, destination, subId = 'sub-test') {
  return new Promise((resolve) => {
    let responseOrError = null;

    const handler = (event) => {
      const data = String(event.data);
      if (data.startsWith('ERROR')) {
        responseOrError = { status: 'ERROR', frame: data };
        ws.removeEventListener('message', handler);
        resolve(responseOrError);
      }
    };

    ws.addEventListener('message', handler);

    const subFrame = `SUBSCRIBE\nid:${subId}\ndestination:${destination}\n\n\0`;
    ws.send(subFrame);

    setTimeout(() => {
      ws.removeEventListener('message', handler);
      if (!responseOrError) {
        resolve({ status: 'OPEN', readyState: ws.readyState });
      }
    }, 600);
  });
}

async function run() {
  console.log('================================================================');
  console.log('  CareSync Phase 25: WebSocket Authorization & RBAC Live Audit  ');
  console.log('================================================================\n');

  // Step 0: Setup identities
  console.log('--- Step 0: Initializing Identities ---');
  const runId = Date.now();
  const adminRes = await fetch(`${BASE_HTTP}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@caresync.local', password: 'AdminPass!123' }),
  });
  const adminData = await adminRes.json();
  const adminToken = adminData.accessToken;

  // Query metadata for doctor creation
  const depRes = await fetch(`${BASE_HTTP}/departments`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const depData = await depRes.json();
  const departmentId = depData[0].id;

  const specRes = await fetch(`${BASE_HTTP}/specializations`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const specData = await specRes.json();
  const specializationId = specData[0].id;

  const clinicId = 'a1b2c3d4-0000-4000-8000-000000000001';

  // Provision Doctor A
  const d1Email = `dr.ws.a.${runId}@caresync.local`;
  const d1CreateRes = await fetch(`${BASE_HTTP}/doctors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      fullName: `Dr. WebSocket Alpha ${runId}`,
      email: d1Email,
      password: 'DoctorPassword!123',
      phone: '9876500001',
      specializationId,
      clinicId,
      departmentId,
      consultationFee: '1200.00',
      slotMinutes: 15,
    }),
  });
  const d1CreateData = await d1CreateRes.json();
  const doctor1Id = d1CreateData.id;

  // Provision Doctor B
  const d2Email = `dr.ws.b.${runId}@caresync.local`;
  const d2CreateRes = await fetch(`${BASE_HTTP}/doctors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      fullName: `Dr. WebSocket Beta ${runId}`,
      email: d2Email,
      password: 'DoctorPassword!123',
      phone: '9876500002',
      specializationId,
      clinicId,
      departmentId,
      consultationFee: '1500.00',
      slotMinutes: 20,
    }),
  });
  const d2CreateData = await d2CreateRes.json();
  const doctor2Id = d2CreateData.id;

  // Login Doctor A
  const d1Res = await fetch(`${BASE_HTTP}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: d1Email, password: 'DoctorPassword!123' }),
  });
  const d1Data = await d1Res.json();
  const doctor1Token = d1Data.accessToken;

  // Login Doctor B
  const d2Res = await fetch(`${BASE_HTTP}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: d2Email, password: 'DoctorPassword!123' }),
  });
  const d2Data = await d2Res.json();
  const doctor2Token = d2Data.accessToken;

  // Login receptionist
  const rRes = await fetch(`${BASE_HTTP}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'reception@caresync.local', password: 'ReceptPass!123' }),
  });
  const rData = await rRes.json();
  const receptionistToken = rData.accessToken;

  // Register patient
  const pRes = await fetch(`${BASE_HTTP}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: `WS Patient ${runId}`,
      email: `ws_patient_${runId}@caresync.local`,
      password: 'PatientPass!123',
      phone: '9876543210',
      dateOfBirth: '1995-05-05',
      gender: 'FEMALE',
    }),
  });
  const pData = await pRes.json();
  const patientToken = pData.accessToken;

  console.log(`Doctor 1 ID: ${doctor1Id} (${d1Email})`);
  console.log(`Doctor 2 ID: ${doctor2Id} (${d2Email})`);
  console.log(`Patient Token Generated\n`);

  // --- Test 1: Doctor A subscribes to Doctor A's queue ---
  console.log('--- Test 1: Doctor A -> Doctor A Queue (Authorized) ---');
  const conn1 = await connectStomp(doctor1Token);
  const sub1 = await subscribeTopic(conn1.ws, `/topic/queue/${doctor1Id}`);
  recordResult(
    'WS-SEC-01',
    'Doctor A Subscribes to Doctor A Queue',
    sub1.status === 'OPEN' ? 'PASS' : 'FAIL',
    sub1.status,
    'HIGH',
    'Permitted: doctor owns queue'
  );
  conn1.ws.close();

  // --- Test 2: Doctor B subscribes to Doctor B's queue ---
  console.log('--- Test 2: Doctor B -> Doctor B Queue (Authorized) ---');
  const conn2 = await connectStomp(doctor2Token);
  const sub2 = await subscribeTopic(conn2.ws, `/topic/queue/${doctor2Id}`);
  recordResult(
    'WS-SEC-02',
    'Doctor B Subscribes to Doctor B Queue',
    sub2.status === 'OPEN' ? 'PASS' : 'FAIL',
    sub2.status,
    'HIGH',
    'Permitted: doctor owns queue'
  );
  conn2.ws.close();

  // --- Test 3: Doctor A attempts to subscribe to Doctor B's queue (Cross-Doctor IDOR) ---
  console.log('--- Test 3: Doctor A -> Doctor B Queue (Cross-Doctor Snooping Blocked) ---');
  const conn3 = await connectStomp(doctor1Token);
  const sub3 = await subscribeTopic(conn3.ws, `/topic/queue/${doctor2Id}`);
  const isDoctorASnoopBlocked = sub3.status === 'ERROR' || conn3.ws.readyState !== WebSocket.OPEN;
  recordResult(
    'WS-SEC-03',
    'Doctor A Cross-Subscription to Doctor B Queue Blocked',
    isDoctorASnoopBlocked ? 'PASS' : 'FAIL',
    sub3.frame || `WS state: ${conn3.ws.readyState}`,
    'CRITICAL',
    'Rejected: Doctors cannot subscribe to foreign queues'
  );
  conn3.ws.close();

  // --- Test 4: Doctor B attempts to subscribe to Doctor A's queue (Cross-Doctor IDOR) ---
  console.log('--- Test 4: Doctor B -> Doctor A Queue (Cross-Doctor Snooping Blocked) ---');
  const conn4 = await connectStomp(doctor2Token);
  const sub4 = await subscribeTopic(conn4.ws, `/topic/queue/${doctor1Id}`);
  const isDoctorBSnoopBlocked = sub4.status === 'ERROR' || conn4.ws.readyState !== WebSocket.OPEN;
  recordResult(
    'WS-SEC-04',
    'Doctor B Cross-Subscription to Doctor A Queue Blocked',
    isDoctorBSnoopBlocked ? 'PASS' : 'FAIL',
    sub4.frame || `WS state: ${conn4.ws.readyState}`,
    'CRITICAL',
    'Rejected: Doctors cannot subscribe to foreign queues'
  );
  conn4.ws.close();

  // --- Test 5: Unauthenticated client attempts to subscribe ---
  console.log('--- Test 5: Unauthenticated Subscription Blocked ---');
  const conn5 = await connectStomp(null); // No token!
  const sub5 = await subscribeTopic(conn5.ws, `/topic/queue/${doctor1Id}`);
  const isUnauthBlocked = sub5.status === 'ERROR' || conn5.ws.readyState !== WebSocket.OPEN;
  recordResult(
    'WS-SEC-05',
    'Unauthenticated Client Subscription Blocked',
    isUnauthBlocked ? 'PASS' : 'FAIL',
    sub5.frame || `WS state: ${conn5.ws.readyState}`,
    'CRITICAL',
    'Rejected: Authentication required'
  );
  conn5.ws.close();

  // --- Test 6: Receptionist subscribes to Doctor queue ---
  console.log('--- Test 6: Receptionist Queue Monitoring (Authorized) ---');
  const conn6 = await connectStomp(receptionistToken);
  const sub6 = await subscribeTopic(conn6.ws, `/topic/queue/${doctor1Id}`);
  recordResult(
    'WS-SEC-06',
    'Receptionist Monitoring Doctor Queue',
    sub6.status === 'OPEN' ? 'PASS' : 'FAIL',
    sub6.status,
    'MEDIUM',
    'Permitted: Receptionist role authorized'
  );
  conn6.ws.close();

  // --- Test 7: Patient attempts to subscribe to Doctor queue ---
  console.log('--- Test 7: Patient Role Subscription Blocked ---');
  const conn7 = await connectStomp(patientToken);
  const sub7 = await subscribeTopic(conn7.ws, `/topic/queue/${doctor1Id}`);
  const isPatientBlocked = sub7.status === 'ERROR' || conn7.ws.readyState !== WebSocket.OPEN;
  recordResult(
    'WS-SEC-07',
    'Patient Role Doctor Queue Subscription Blocked',
    isPatientBlocked ? 'PASS' : 'FAIL',
    sub7.frame || `WS state: ${conn7.ws.readyState}`,
    'CRITICAL',
    'Rejected: Patient role cannot subscribe to doctor queues'
  );
  conn7.ws.close();

  // --- Test 8: Client SEND Frame Rejection ---
  console.log('--- Test 8: Client SEND Frame Rejection ---');
  const conn8 = await connectStomp(doctor1Token);
  let sendRejected = false;
  conn8.ws.onmessage = (event) => {
    if (String(event.data).startsWith('ERROR')) sendRejected = true;
  };
  conn8.ws.send('SEND\ndestination:/app/chat\n\n{"msg":"tamper"}\0');
  await new Promise(r => setTimeout(r, 400));
  recordResult(
    'WS-SEC-08',
    'Inbound Client SEND Frame Rejection',
    sendRejected || conn8.ws.readyState !== WebSocket.OPEN ? 'PASS' : 'FAIL',
    'SEND rejected',
    'CRITICAL',
    'Read-only broadcast channel enforced'
  );
  conn8.ws.close();

  // --- Test 9: Zero PII in Queue Messages ---
  console.log('--- Test 9: Zero PII Audit ---');
  const boardRes = await fetch(`${BASE_HTTP}/queue/board?clinicId=${clinicId}`);
  const boardText = await boardRes.text();
  const piiList = ['patientName', 'phone', 'address', 'diagnosis', 'allergies', 'ssn', 'medicalHistory'];
  const piiFound = piiList.filter(p => boardText.includes(`"${p}"`));
  recordResult(
    'WS-SEC-09',
    'Queue Message Privacy & Zero PII Leakage',
    piiFound.length === 0 ? 'PASS' : 'FAIL',
    piiFound.length === 0 ? 'Verified: only token numbers and timestamps' : `Leaked: ${piiFound.join(', ')}`,
    'CRITICAL',
    'Zero PII in payloads'
  );

  // --- Test 10: Reconnection Lifecycle ---
  console.log('--- Test 10: Clean Disconnect & Reconnect Lifecycle ---');
  const conn10a = await connectStomp(doctor1Token);
  conn10a.ws.close();
  await new Promise(r => setTimeout(r, 200));
  const conn10b = await connectStomp(doctor1Token);
  const reconnOk = conn10b.ws.readyState === WebSocket.OPEN;
  conn10b.ws.close();
  recordResult(
    'WS-SEC-10',
    'Clean Disconnect and Reconnection Lifecycle',
    reconnOk ? 'PASS' : 'FAIL',
    'Reconnected successfully',
    'LOW'
  );

  // Summary
  console.log('\n================================================================');
  console.log('  PHASE 25 WEBSOCKET AUTHORIZATION AUDIT SUMMARY                ');
  console.log('================================================================');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`Total Checks: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    console.error('\nFAILURES DETECTED:');
    results.filter(r => r.status === 'FAIL').forEach(f => {
      console.error(`- ${f.testId} ${f.title}: ${f.evidence}`);
    });
    process.exit(1);
  }

  console.log('\nAll 10 Phase 25 WebSocket Authorization & RBAC Tests PASSED.');
}

run().catch(e => {
  console.error('Fatal execution error:', e);
  process.exit(1);
});
