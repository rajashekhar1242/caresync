/**
 * CareSync HCMS - Phase 25: Production-Mode End-to-End Smoke Test Suite
 * Validates the complete 20-step production clinical, financial, and security lifecycle:
 * 1. Admin login
 * 2. Receptionist login
 * 3. Doctor login & isolated schedule setup
 * 4. Patient login
 * 5. Patient appointment booking
 * 6. Receptionist patient lookup and check-in
 * 7. Queue token generation
 * 8. Doctor queue access and call-next
 * 9. Consultation creation
 * 10. Diagnosis validation
 * 11. Prescription creation and drug safety validation
 * 12. Consultation completion
 * 13. Automatic invoice generation
 * 14. Patient invoice and PDF access
 * 15. Prescription PDF access
 * 16. Receptionist partial payment
 * 17. Final payment and PAID status
 * 18. Admin audit-log inspection
 * 19. Unauthorized role access checks
 * 20. Cross-patient IDOR checks
 */

const BASE_URL = 'http://localhost:8080/api';
const results = [];

function recordStep(stepNumber, title, status, httpStatus, notes = '') {
  results.push({ stepNumber, title, status, httpStatus, notes });
  const icon = status === 'PASS' ? '✓' : '✗';
  console.log(`[${icon} ${status}] Step ${stepNumber}: ${title} -> HTTP ${httpStatus} (${notes})`);
}

async function run() {
  console.log('================================================================');
  console.log('  CareSync Phase 25: Production-Mode End-to-End Smoke Test      ');
  console.log('================================================================\n');

  const runId = Date.now();
  let adminToken, receptionistToken, doctorToken, patientToken, patient2Token;
  let doctorId, patientId, patient2Id, clinicId;
  let appointmentId, tokenNumber, consultationId, invoiceId, prescriptionId;

  // 1. Admin login
  const adminRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@caresync.local', password: 'AdminPass!123' }),
  });
  const adminData = await adminRes.json();
  adminToken = adminData.accessToken;
  recordStep(1, 'Admin Login', adminRes.status === 200 ? 'PASS' : 'FAIL', adminRes.status, 'Admin JWT received');

  // 2. Receptionist login
  const receptRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'reception@caresync.local', password: 'ReceptPass!123' }),
  });
  const receptData = await receptRes.json();
  receptionistToken = receptData.accessToken;
  recordStep(2, 'Receptionist Login', receptRes.status === 200 ? 'PASS' : 'FAIL', receptRes.status, 'Receptionist JWT received');

  // 3. Provision a fresh isolated doctor for pristine queue & schedule isolation
  const depRes = await fetch(`${BASE_URL}/departments`, { headers: { Authorization: `Bearer ${adminToken}` } });
  const depData = await depRes.json();
  const specRes = await fetch(`${BASE_URL}/specializations`, { headers: { Authorization: `Bearer ${adminToken}` } });
  const specData = await specRes.json();

  clinicId = 'a1b2c3d4-0000-4000-8000-000000000001';
  const doctorEmail = `dr.smoke.${runId}@caresync.local`;
  const dCreateRes = await fetch(`${BASE_URL}/doctors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      fullName: `Dr. Smoke Test ${runId}`,
      email: doctorEmail,
      password: 'DoctorPassword!123',
      phone: '9876543219',
      specializationId: specData[0].id,
      clinicId,
      departmentId: depData[0].id,
      consultationFee: '1200.00',
      slotMinutes: 15,
    }),
  });
  const dCreateData = await dCreateRes.json();
  doctorId = dCreateData.id;

  // Configure weekly schedule for doctor via /api/doctors/{id}/schedules
  const schedRes = await fetch(`${BASE_URL}/doctors/${doctorId}/schedules`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      entries: [
        { dayOfWeek: 'MONDAY', startTime: '08:00', endTime: '20:00' },
        { dayOfWeek: 'TUESDAY', startTime: '08:00', endTime: '20:00' },
        { dayOfWeek: 'WEDNESDAY', startTime: '08:00', endTime: '20:00' },
        { dayOfWeek: 'THURSDAY', startTime: '08:00', endTime: '20:00' },
        { dayOfWeek: 'FRIDAY', startTime: '08:00', endTime: '20:00' },
        { dayOfWeek: 'SATURDAY', startTime: '08:00', endTime: '20:00' },
        { dayOfWeek: 'SUNDAY', startTime: '08:00', endTime: '20:00' },
      ],
    }),
  });

  // Login doctor
  const dLogin = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: doctorEmail, password: 'DoctorPassword!123' }),
  });
  const dLoginData = await dLogin.json();
  doctorToken = dLoginData.accessToken;
  recordStep(3, 'Doctor Login & Shift Setup', doctorToken && schedRes.status === 200 ? 'PASS' : 'FAIL', 200, `Doctor ID: ${doctorId}`);

  // 4. Patient login (register fresh patient)
  const patEmail = `smoke_patient_${runId}@caresync.local`;
  const patRegRes = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: `Smoke Patient ${runId}`,
      email: patEmail,
      password: 'PatientPassword!123',
      phone: '9876543210',
      dateOfBirth: '1992-06-15',
      gender: 'MALE',
    }),
  });
  const patRegData = await patRegRes.json();
  patientToken = patRegData.accessToken;
  patientId = patRegData.user.patientId;
  recordStep(4, 'Patient Login / Registration', patRegRes.status === 201 ? 'PASS' : 'FAIL', patRegRes.status, `Patient ID: ${patientId}`);

  // Register Patient 2 for cross-patient IDOR checks
  const p2Res = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: `Smoke Patient Two ${runId}`,
      email: `smoke_p2_${runId}@caresync.local`,
      password: 'PatientPassword!123',
      phone: '9876543218',
      dateOfBirth: '1994-08-20',
      gender: 'FEMALE',
    }),
  });
  const p2Data = await p2Res.json();
  patient2Token = p2Data.accessToken;
  patient2Id = p2Data.user.patientId;

  // 5. Patient appointment booking
  const clinicTodayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const slotsRes = await fetch(`${BASE_URL}/doctors/${doctorId}/slots?date=${clinicTodayStr}`, {
    headers: { Authorization: `Bearer ${patientToken}` },
  });
  const slotsData = await slotsRes.json();
  const availableSlot = slotsData.slots?.find(s => s.available);
  if (!availableSlot) {
    throw new Error('No available slot found for doctor today: ' + JSON.stringify(slotsData));
  }
  const slotStart = availableSlot.start;

  const bookRes = await fetch(`${BASE_URL}/appointments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${patientToken}` },
    body: JSON.stringify({
      patientId,
      doctorId,
      slotStart,
      reason: 'Production Smoke Test Consultation',
    }),
  });
  const bookData = await bookRes.json();
  appointmentId = bookData.id;
  recordStep(5, 'Patient Appointment Booking', bookRes.status === 201 ? 'PASS' : 'FAIL', bookRes.status, `Appt ID: ${appointmentId}`);

  // 6. Receptionist patient lookup and check-in
  const lookupRes = await fetch(`${BASE_URL}/patients?phone=9876543210`, {
    headers: { Authorization: `Bearer ${receptionistToken}` },
  });
  const lookupData = await lookupRes.json();
  const lookupOk = lookupData.content && lookupData.content.some(p => p.id === patientId);

  const checkInRes = await fetch(`${BASE_URL}/appointments/${appointmentId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${receptionistToken}` },
    body: JSON.stringify({ status: 'CHECKED_IN' }),
  });
  const checkInData = await checkInRes.json();
  recordStep(6, 'Receptionist Patient Lookup & Check-In', lookupOk && checkInRes.status === 200 ? 'PASS' : 'FAIL', checkInRes.status, `Status: ${checkInData.status}`);

  // 7. Queue token generation
  tokenNumber = checkInData.tokenNumber;
  recordStep(7, 'Queue Token Generation', typeof tokenNumber === 'number' && tokenNumber > 0 ? 'PASS' : 'FAIL', 200, `Token Number: ${tokenNumber}`);

  // 8. Doctor queue access and call-next
  const qRes = await fetch(`${BASE_URL}/queue/doctors/${doctorId}`, {
    headers: { Authorization: `Bearer ${doctorToken}` },
  });
  const qData = await qRes.json();

  const callNextRes = await fetch(`${BASE_URL}/queue/doctors/${doctorId}/call-next`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${doctorToken}` },
  });
  const callNextData = await callNextRes.json();
  recordStep(8, 'Doctor Queue Access & Call-Next', callNextRes.status === 200 ? 'PASS' : 'FAIL', callNextRes.status, `Now Serving: ${callNextData.nowServing?.tokenNumber}`);

  // 9. Consultation creation
  const consultCreateRes = await fetch(`${BASE_URL}/appointments/${appointmentId}/consultation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${doctorToken}` },
    body: JSON.stringify({
      vitals: { bloodPressure: '120/80', pulse: 72, temperature: 37.0, weightKg: 70.0, spo2: 98 },
      symptoms: 'Fever, sore throat, and fatigue for 2 days',
      notes: 'Patient advised warm fluids, salt water gargles, and rest.',
      followUpDate: '2026-11-20',
    }),
  });
  const consultCreateData = await consultCreateRes.json();
  consultationId = consultCreateData.id;
  recordStep(9, 'Consultation Record Creation', consultCreateRes.status === 201 ? 'PASS' : 'FAIL', consultCreateRes.status, `Consultation ID: ${consultationId}`);

  // 10. Diagnosis validation (attempt completion without diagnosis -> MUST FAIL with 409 CONSULTATION_INCOMPLETE)
  const prematureComplete = await fetch(`${BASE_URL}/appointments/${appointmentId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${doctorToken}` },
    body: JSON.stringify({ status: 'COMPLETED' }),
  });
  const prematureData = await prematureComplete.json();
  const diagValidationOk = prematureComplete.status === 409 && prematureData.code === 'CONSULTATION_INCOMPLETE';
  recordStep(10, 'Mandatory Diagnosis Validation Guard', diagValidationOk ? 'PASS' : 'FAIL', prematureComplete.status, 'HTTP 409 CONSULTATION_INCOMPLETE strictly enforced');

  // Now record diagnosis on the consultation
  await fetch(`${BASE_URL}/consultations/${consultationId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${doctorToken}` },
    body: JSON.stringify({
      diagnosis: 'Acute Viral Pharyngitis (ICD-10 J02.9)',
      notes: 'Prescribed antipyretic and oral hydration',
    }),
  });

  // 11. Prescription creation and drug safety validation
  const medRes = await fetch(`${BASE_URL}/medicines?name=Paracetamol&size=5`, {
    headers: { Authorization: `Bearer ${doctorToken}` },
  });
  const medData = await medRes.json();
  const medicineId = medData.content?.[0]?.id || 'd1000000-0000-4000-8000-000000000001';

  const safetyCheckRes = await fetch(`${BASE_URL}/prescriptions/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${doctorToken}` },
    body: JSON.stringify({
      patientId,
      medicineIds: [medicineId],
    }),
  });
  const safetyCheckData = await safetyCheckRes.json();
  recordStep(11, 'Drug Safety Interaction Check', safetyCheckRes.status === 200 ? 'PASS' : 'FAIL', safetyCheckRes.status, `Warnings: ${safetyCheckData.warnings?.length || 0}`);

  const rxRes = await fetch(`${BASE_URL}/prescriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${doctorToken}` },
    body: JSON.stringify({
      consultationId,
      items: [{ medicineId, dosage: '500mg', frequency: 'TWICE_DAILY', durationDays: 3, instructions: 'After meals' }],
      acknowledgeSevereWarnings: true,
    }),
  });
  const rxData = await rxRes.json();
  prescriptionId = rxData.id;

  // 12. Consultation completion
  const completeRes = await fetch(`${BASE_URL}/appointments/${appointmentId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${doctorToken}` },
    body: JSON.stringify({ status: 'COMPLETED' }),
  });
  const completeData = await completeRes.json();
  recordStep(12, 'Consultation Completion', completeRes.status === 200 && completeData.status === 'COMPLETED' ? 'PASS' : 'FAIL', completeRes.status, 'Status moved to COMPLETED');

  // 13. Automatic invoice generation
  const invRes = await fetch(`${BASE_URL}/appointments/${appointmentId}/invoice`, {
    headers: { Authorization: `Bearer ${receptionistToken}` },
  });
  const invData = await invRes.json();
  invoiceId = invData.id;
  recordStep(13, 'Automatic Invoice Generation', invRes.status === 200 && invoiceId ? 'PASS' : 'FAIL', invRes.status, `Invoice ID: ${invoiceId} (Total: ${invData.total})`);

  // 14. Patient invoice and PDF access
  const patInvPdf = await fetch(`${BASE_URL}/invoices/${invoiceId}/pdf`, {
    headers: { Authorization: `Bearer ${patientToken}` },
  });
  const patInvOk = patInvPdf.status === 200 && patInvPdf.headers.get('content-type')?.includes('pdf');
  recordStep(14, 'Patient Invoice & PDF Stream Access', patInvOk ? 'PASS' : 'FAIL', patInvPdf.status, 'Binary PDF stream delivered');

  // 15. Prescription PDF access
  const patRxPdf = await fetch(`${BASE_URL}/prescriptions/${prescriptionId}/pdf`, {
    headers: { Authorization: `Bearer ${patientToken}` },
  });
  const rxPdfOk = patRxPdf.status === 200 && patRxPdf.headers.get('content-type')?.includes('pdf');
  recordStep(15, 'Patient Prescription PDF Access', rxPdfOk ? 'PASS' : 'FAIL', patRxPdf.status, 'Binary signed PDF stream delivered');

  // 16. Receptionist partial payment
  const partialPayRes = await fetch(`${BASE_URL}/invoices/${invoiceId}/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${receptionistToken}` },
    body: JSON.stringify({
      amount: '500.00',
      method: 'CASH',
      notes: 'Initial cash deposit at desk',
    }),
  });
  const partialPayData = await partialPayRes.json();
  const invAfterPartialRes = await fetch(`${BASE_URL}/invoices/${invoiceId}`, {
    headers: { Authorization: `Bearer ${receptionistToken}` },
  });
  const invAfterPartial = await invAfterPartialRes.json();
  recordStep(16, 'Receptionist Partial Payment (500.00 INR)', partialPayRes.status === 201 && invAfterPartial.status === 'PARTIALLY_PAID' ? 'PASS' : 'FAIL', partialPayRes.status, `Status: ${invAfterPartial.status}, Balance: ${invAfterPartial.balance}`);

  // 17. Final payment and PAID status
  const finalPayRes = await fetch(`${BASE_URL}/invoices/${invoiceId}/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${receptionistToken}` },
    body: JSON.stringify({
      amount: invAfterPartial.balance,
      method: 'UPI',
      txnRef: `UPI-SMOKE-${runId}`,
      notes: 'Final digital settlement',
    }),
  });
  const finalPayData = await finalPayRes.json();
  const invAfterFinalRes = await fetch(`${BASE_URL}/invoices/${invoiceId}`, {
    headers: { Authorization: `Bearer ${receptionistToken}` },
  });
  const invAfterFinal = await invAfterFinalRes.json();
  recordStep(17, 'Final Payment & PAID Settlement', finalPayRes.status === 201 && invAfterFinal.status === 'PAID' ? 'PASS' : 'FAIL', finalPayRes.status, `Status: ${invAfterFinal.status}`);

  // 18. Admin audit-log inspection
  const auditRes = await fetch(`${BASE_URL}/audit-logs?page=0&size=10`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const auditData = await auditRes.json();
  const auditOk = auditData.content && auditData.content.length > 0;
  recordStep(18, 'Admin Audit-Log Inspection', auditOk ? 'PASS' : 'FAIL', auditRes.status, `Recent audit entries: ${auditData.content?.length}`);

  // 19. Unauthorized role access checks
  const patAuditAttempt = await fetch(`${BASE_URL}/audit-logs`, {
    headers: { Authorization: `Bearer ${patientToken}` },
  });
  const docRevenueAttempt = await fetch(`${BASE_URL}/reports/revenue?from=2026-11-01&to=2026-11-30`, {
    headers: { Authorization: `Bearer ${doctorToken}` },
  });
  const rbacOk = patAuditAttempt.status === 403 && docRevenueAttempt.status === 403;
  recordStep(19, 'Unauthorized Role Access Checks (RBAC)', rbacOk ? 'PASS' : 'FAIL', 403, 'Patient and Doctor access denied to admin endpoints');

  // 20. Cross-patient IDOR checks
  const idorProfileSnoop = await fetch(`${BASE_URL}/patients/${patient2Id}`, {
    headers: { Authorization: `Bearer ${patientToken}` },
  });
  const idorInvoiceSnoop = await fetch(`${BASE_URL}/invoices/${invoiceId}/pdf`, {
    headers: { Authorization: `Bearer ${patient2Token}` },
  });
  const idorOk = idorProfileSnoop.status === 403 && idorInvoiceSnoop.status === 403;
  recordStep(20, 'Cross-Patient Tenant Isolation (Anti-IDOR)', idorOk ? 'PASS' : 'FAIL', 403, 'Cross-patient profile and PDF access strictly blocked');

  // Summary
  console.log('\n================================================================');
  console.log('  PHASE 25 PRODUCTION SMOKE TEST SUMMARY                        ');
  console.log('================================================================');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`Total Steps: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    console.error('\nSMOKE TEST FAILURES:');
    results.filter(r => r.status === 'FAIL').forEach(f => {
      console.error(`- Step ${f.stepNumber} ${f.title}: HTTP ${f.httpStatus} - ${f.notes}`);
    });
    process.exit(1);
  }

  console.log('\nAll 20 Phase 25 Production Smoke Test Steps PASSED (100% Success).');
}

run().catch(e => {
  console.error('Fatal execution error:', e);
  process.exit(1);
});
