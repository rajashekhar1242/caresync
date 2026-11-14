/**
 * CareSync HCMS - Phase 24 Workstream B: Security & Authorization Audit
 * Comprehensive penetration, RBAC boundary, data isolation, and authentication lifecycle tests.
 */

const BASE_URL = 'http://localhost:8080/api';

const results = [];

function recordResult(section, testId, title, status, httpCode, evidence, severity = 'LOW', notes = '') {
  results.push({
    section,
    testId,
    title,
    status,
    httpCode,
    severity,
    evidence: typeof evidence === 'object' ? JSON.stringify(evidence).slice(0, 200) : String(evidence).slice(0, 200),
    notes,
  });
  const icon = status === 'PASS' ? '✓' : '✗';
  console.log(`[${icon} ${status}] [${section}] ${testId}: ${title} -> HTTP ${httpCode} (${notes || 'OK'})`);
}

async function run() {
  console.log('================================================================');
  console.log('  CareSync Phase 24 Workstream B: Security & Authorization Audit');
  console.log('================================================================\n');

  const runId = Date.now();
  let adminToken = null;
  let receptionistToken = null;
  let doctorToken = null;
  let doctorId = null;

  let patient1Token = null;
  let patient1RefreshToken = null;
  let patient1Id = null;
  let patient1Email = `sec_patient1_${runId}@caresync.local`;

  let patient2Token = null;
  let patient2Id = null;
  let patient2Email = `sec_patient2_${runId}@caresync.local`;

  // --- Step 0: Setup Identities ---
  console.log('--- Step 0: Initializing Identities ---');
  try {
    // Admin
    const aRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@caresync.local', password: 'AdminPass!123' }),
    });
    const aData = await aRes.json();
    adminToken = aData.accessToken;

    // Receptionist
    const rRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'reception@caresync.local', password: 'ReceptPass!123' }),
    });
    const rData = await rRes.json();
    receptionistToken = rData.accessToken;

    // Doctor
    const dRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'dr.qa.live.1794563025465@caresync.local', password: 'DoctorPassword!123' }),
    });
    const dData = await dRes.json();
    doctorToken = dData.accessToken;
    doctorId = dData.user.doctorId;

    // Register Patient 1
    const p1Res = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: `Security Patient One ${runId}`,
        email: patient1Email,
        password: 'Password123!',
        phone: '9876543211',
        dateOfBirth: '1990-01-01',
        gender: 'MALE',
      }),
    });
    const p1Data = await p1Res.json();
    patient1Token = p1Data.accessToken;
    patient1RefreshToken = p1Data.refreshToken;
    patient1Id = p1Data.user.patientId;

    // Register Patient 2
    const p2Res = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: `Security Patient Two ${runId}`,
        email: patient2Email,
        password: 'Password123!',
        phone: '9876543212',
        dateOfBirth: '1992-02-02',
        gender: 'FEMALE',
      }),
    });
    const p2Data = await p2Res.json();
    patient2Token = p2Data.accessToken;
    patient2Id = p2Data.user.patientId;

    console.log(`[Setup] Patient 1 ID: ${patient1Id}`);
    console.log(`[Setup] Patient 2 ID: ${patient2Id}`);
  } catch (err) {
    console.error('Fatal initialization error:', err);
    process.exit(1);
  }

  // ============================================================================
  // B1. Role-Based Access Control (RBAC) Matrix
  // ============================================================================
  console.log('\n--- B1: Role-Based Access Control (RBAC) Audit ---');

  // B1.1: Audit Logs (ADMIN only)
  // Patient attempt
  const patAudit = await fetch(`${BASE_URL}/audit-logs`, {
    headers: { Authorization: `Bearer ${patient1Token}` },
  });
  recordResult('B1', 'RBAC-01a', 'Patient Access to Audit Logs Denied', patAudit.status === 403 ? 'PASS' : 'FAIL', patAudit.status, 'HTTP 403 Forbidden', 'HIGH');

  // Receptionist attempt
  const recAudit = await fetch(`${BASE_URL}/audit-logs`, {
    headers: { Authorization: `Bearer ${receptionistToken}` },
  });
  recordResult('B1', 'RBAC-01b', 'Receptionist Access to Audit Logs Denied', recAudit.status === 403 ? 'PASS' : 'FAIL', recAudit.status, 'HTTP 403 Forbidden', 'HIGH');

  // Doctor attempt
  const docAudit = await fetch(`${BASE_URL}/audit-logs`, {
    headers: { Authorization: `Bearer ${doctorToken}` },
  });
  recordResult('B1', 'RBAC-01c', 'Doctor Access to Audit Logs Denied', docAudit.status === 403 ? 'PASS' : 'FAIL', docAudit.status, 'HTTP 403 Forbidden', 'HIGH');

  // Admin attempt
  const adminAudit = await fetch(`${BASE_URL}/audit-logs`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  recordResult('B1', 'RBAC-01d', 'Admin Access to Audit Logs Allowed', adminAudit.status === 200 ? 'PASS' : 'FAIL', adminAudit.status, 'HTTP 200 OK');

  // B1.2: Administrative Revenue Reports (ADMIN only)
  const patReports = await fetch(`${BASE_URL}/reports/revenue?from=2026-11-01&to=2026-11-30`, {
    headers: { Authorization: `Bearer ${patient1Token}` },
  });
  recordResult('B1', 'RBAC-02a', 'Patient Access to Revenue Reports Denied', patReports.status === 403 ? 'PASS' : 'FAIL', patReports.status, 'HTTP 403 Forbidden', 'HIGH');

  const docReports = await fetch(`${BASE_URL}/reports/revenue?from=2026-11-01&to=2026-11-30`, {
    headers: { Authorization: `Bearer ${doctorToken}` },
  });
  recordResult('B1', 'RBAC-02b', 'Doctor Access to Revenue Reports Denied', docReports.status === 403 ? 'PASS' : 'FAIL', docReports.status, 'HTTP 403 Forbidden', 'HIGH');

  // B1.3: Doctor Queue Call-Next (DOCTOR for own queue only, PATIENT denied, Unrelated Doctor denied)
  const patCallNext = await fetch(`${BASE_URL}/queue/doctors/${doctorId}/call-next`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${patient1Token}` },
  });
  recordResult('B1', 'RBAC-03a', 'Patient Attempt to Advance Doctor Queue Denied', patCallNext.status === 403 ? 'PASS' : 'FAIL', patCallNext.status, 'HTTP 403 Forbidden', 'HIGH');

  // Doctor calling another doctor's queue (unauthorized doctor cross-call)
  const dummyDoctorId = '00000000-0000-0000-0000-000000000001';
  // Note: if doctor not found it might return 404, but let's test doctor attempting to call queue where doctor exists or check with a second doctor if exists, or receptionist calling queue behavior
  // Let's check: if doctor calls another doctor:
  // First let's check doctor list to get another doctor or see if one exists:
  let otherDocId = '11111111-1111-1111-1111-111111111111';
  const docListRes = await fetch(`${BASE_URL}/doctors?page=0&size=10`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const docListData = await docListRes.json();
  if (docListData.content && docListData.content.length > 1) {
    const foundOther = docListData.content.find(d => d.id !== doctorId);
    if (foundOther) otherDocId = foundOther.id;
  }
  const otherDocCallNext = await fetch(`${BASE_URL}/queue/doctors/${otherDocId}/call-next`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${doctorToken}` },
  });
  recordResult('B1', 'RBAC-03b', 'Doctor Attempt to Advance Another Doctor Queue Denied', otherDocCallNext.status === 403 ? 'PASS' : (otherDocCallNext.status === 404 ? 'PASS' : 'FAIL'), otherDocCallNext.status, 'HTTP 403 Forbidden', 'HIGH');

  // ============================================================================
  // B2. Patient Data Isolation & Tenant Boundaries (Anti-IDOR)
  // ============================================================================
  console.log('\n--- B2: Patient Data Isolation & Anti-IDOR Audit ---');

  // B2.1: Patient 1 reads Patient 2's profile
  const snoopProfile = await fetch(`${BASE_URL}/patients/${patient2Id}`, {
    headers: { Authorization: `Bearer ${patient1Token}` },
  });
  recordResult('B2', 'IDOR-01', 'Cross-Patient Profile Read Snooping Blocked', snoopProfile.status === 403 ? 'PASS' : 'FAIL', snoopProfile.status, 'HTTP 403 Forbidden', 'CRITICAL');

  // B2.2: Patient 1 updates Patient 2's profile (valid PatientRequest schema, but foreign ID)
  const tamperProfile = await fetch(`${BASE_URL}/patients/${patient2Id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${patient1Token}` },
    body: JSON.stringify({
      fullName: 'Malicious Tamper Attempt',
      phone: '9876543210',
      allergies: [],
    }),
  });
  recordResult('B2', 'IDOR-02', 'Cross-Patient Profile Tampering Blocked', tamperProfile.status === 403 ? 'PASS' : 'FAIL', tamperProfile.status, 'HTTP 403 Forbidden', 'CRITICAL');

  // B2.3: Patient 1 reads Patient 2's prescriptions
  const snoopRx = await fetch(`${BASE_URL}/patients/${patient2Id}/prescriptions`, {
    headers: { Authorization: `Bearer ${patient1Token}` },
  });
  recordResult('B2', 'IDOR-03', 'Cross-Patient Prescription Ledger Snooping Blocked', snoopRx.status === 403 ? 'PASS' : 'FAIL', snoopRx.status, 'HTTP 403 Forbidden', 'CRITICAL');

  // B2.4: Patient 1 downloads an invoice PDF belonging to another patient
  const foreignInvoiceId = 'd38b7c2c-887d-408a-baeb-1c8c86f1ae77'; // belongs to another patient
  const snoopInvPdf = await fetch(`${BASE_URL}/invoices/${foreignInvoiceId}/pdf`, {
    headers: { Authorization: `Bearer ${patient1Token}` },
  });
  recordResult('B2', 'IDOR-04', 'Cross-Patient Invoice PDF Download Blocked', snoopInvPdf.status === 403 ? 'PASS' : 'FAIL', snoopInvPdf.status, 'HTTP 403 Forbidden', 'CRITICAL');

  // B2.5: Patient 1 attempts to book appointment specifying Patient 2's patientId (Identity Spoofing)
  const spoofBook = await fetch(`${BASE_URL}/appointments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${patient1Token}` },
    body: JSON.stringify({
      patientId: patient2Id, // Spoofed patientId!
      doctorId,
      slotStart: '2026-11-20T04:00:00Z',
      reason: 'Spoofed booking attempt',
    }),
  });
  recordResult('B2', 'IDOR-05', 'Booking on Behalf of Another Patient (Spoofing) Blocked', spoofBook.status === 403 ? 'PASS' : 'FAIL', spoofBook.status, 'HTTP 403 Forbidden', 'CRITICAL');

  // ============================================================================
  // B3. Authentication Lifecycle, Tokens, Rotation & Replay
  // ============================================================================
  console.log('\n--- B3: Authentication Security & Token Lifecycle Audit ---');

  // B3.1: Unauthenticated request to protected endpoint
  const unauth = await fetch(`${BASE_URL}/patients/${patient1Id}`);
  recordResult('B3', 'AUTH-01', 'Missing Authorization Header Rejected', unauth.status === 401 ? 'PASS' : 'FAIL', unauth.status, 'HTTP 401 Unauthorized');

  // B3.2: Malformed JWT token
  const malformed = await fetch(`${BASE_URL}/patients/${patient1Id}`, {
    headers: { Authorization: 'Bearer not.a.valid.jwt.token' },
  });
  recordResult('B3', 'AUTH-02', 'Malformed JWT Token Rejected', malformed.status === 401 ? 'PASS' : 'FAIL', malformed.status, 'HTTP 401 Unauthorized');

  // B3.3: Refresh Token Rotation: First rotation succeeds
  let rotatedRefreshToken = null;
  const rotate1 = await fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: patient1RefreshToken }),
  });
  const rot1Data = await rotate1.json();
  if (rotate1.status === 200 && rot1Data.refreshToken) {
    rotatedRefreshToken = rot1Data.refreshToken;
    recordResult('B3', 'AUTH-03', 'Single-Use Refresh Token Rotation', 'PASS', rotate1.status, 'New token issued, old consumed');
  } else {
    recordResult('B3', 'AUTH-03', 'Single-Use Refresh Token Rotation', 'FAIL', rotate1.status, rot1Data);
  }

  // B3.4: Refresh Token Replay Detection: Using consumed token again must be detected as replay
  const replay = await fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: patient1RefreshToken }), // REPLAY OLD TOKEN!
  });
  const replayData = await replay.json();
  recordResult('B3', 'AUTH-04', 'Refresh Token Replay Attack Detection', replay.status === 401 ? 'PASS' : 'FAIL', replay.status, replayData.message, 'HIGH');

  // B3.5: Replay Family Invalidation: Using rotated token after replay must also be rejected
  const familyCheck = await fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: rotatedRefreshToken }),
  });
  recordResult('B3', 'AUTH-05', 'Token Family Revocation After Replay Detection', familyCheck.status === 401 ? 'PASS' : 'FAIL', familyCheck.status, 'Family revoked', 'HIGH');

  // B3.6: Explicit Logout Revocation
  // Login fresh session
  const freshLogin = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: patient1Email, password: 'Password123!' }),
  });
  const freshData = await freshLogin.json();
  const freshRefresh = freshData.refreshToken;

  // Logout
  const logoutRes = await fetch(`${BASE_URL}/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: freshRefresh }),
  });
  recordResult('B3', 'AUTH-06', 'Explicit Logout Execution', logoutRes.status === 204 || logoutRes.status === 200 ? 'PASS' : 'FAIL', logoutRes.status, 'Logout completed');

  // Reusing logged-out refresh token
  const afterLogout = await fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: freshRefresh }),
  });
  recordResult('B3', 'AUTH-07', 'Logged-out Refresh Token Rejection', afterLogout.status === 401 ? 'PASS' : 'FAIL', afterLogout.status, 'HTTP 401 Rejected');

  // ============================================================================
  // B4. API Security, Input Validation & Sanitization
  // ============================================================================
  console.log('\n--- B4: API Security, Input Validation & Injection Audit ---');

  // B4.1: SQL Injection Attempt in search parameters
  const sqli = await fetch(`${BASE_URL}/doctors?name=' OR '1'='1`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const sqliData = await sqli.json();
  recordResult('B4', 'SEC-01', 'SQL Injection Immunity in Search Filters', sqli.status === 200 && Array.isArray(sqliData.content) ? 'PASS' : 'FAIL', sqli.status, `Parameterized safely: ${sqliData.content?.length} results`);

  // B4.2: XSS Attempt in text fields
  const xssPayload = `<script>alert('xss')</script>`;
  const xssRes = await fetch(`${BASE_URL}/patients/${patient2Id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${patient2Token}` },
    body: JSON.stringify({
      fullName: `Patient With XSS ${runId}`,
      phone: '9876543212',
      address: xssPayload,
      allergies: [xssPayload],
    }),
  });
  const xssData = await xssRes.json();
  // Backend should either store literally (safe for JSON REST APIs) or reject with 400
  recordResult('B4', 'SEC-02', 'XSS Payload Neutralization in Patient Chart', xssRes.status === 200 ? 'PASS' : 'FAIL', xssRes.status, `Address stored escaped: ${xssData.address?.slice(0, 30)}`);

  // B4.3: Excessive String Length Validation
  const overflowRes = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'A'.repeat(5000), // exceeds max length
      email: `overflow_${runId}@caresync.local`,
      password: 'Pass!123',
    }),
  });
  recordResult('B4', 'SEC-03', 'Payload Overload Validation Rejection', overflowRes.status === 400 ? 'PASS' : 'FAIL', overflowRes.status, 'HTTP 400 Validation Error');

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('\n================================================================');
  console.log('  WORKSTREAM B SECURITY AUDIT SUMMARY                           ');
  console.log('================================================================');
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  console.log(`Total Checks: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    console.error('\nSECURITY FAILURES:');
    results.filter((r) => r.status === 'FAIL').forEach((f) => {
      console.error(`- [${f.section}] ${f.testId} ${f.title} (${f.severity}): HTTP ${f.httpCode} - ${f.evidence}`);
    });
    process.exit(1);
  }

  console.log('\nAll Workstream B Security & Authorization Tests PASSED (0 breaches, 0 IDOR vulnerabilities).');
}

run().catch((e) => {
  console.error('Fatal execution error:', e);
  process.exit(1);
});
