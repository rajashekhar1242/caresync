/**
 * CareSync / HCMS Phase 22 Doctor Live Integration Test Suite
 * Executes live against real Spring Boot 4.1.2 backend and PostgreSQL database.
 */

const BASE_URL = 'http://localhost:8080/api';

const results = [];

function recordResult(domain, scenario, status, httpCode, evidence, notes = '') {
  results.push({
    domain,
    scenario,
    status,
    httpCode,
    evidence: typeof evidence === 'object' ? JSON.stringify(evidence).slice(0, 150) : String(evidence).slice(0, 150),
    notes,
  });
  console.log(`[${status}] [${domain}] ${scenario} -> HTTP ${httpCode}`);
}

async function run() {
  console.log('=== CareSync Phase 22 Doctor Live Integration Suite ===\n');

  let doctorToken = null;
  let doctorRefreshToken = null;
  let doctorId = null;
  let testPatientId = null;
  let testAppointmentId = null;
  let testConsultationId = null;
  let testPrescriptionId = null;
  let createdLeaveId = null;

  // 1. Doctor Login
  try {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'dr.qa.live.1794563025465@caresync.local',
        password: 'DoctorPassword!123',
      }),
    });
    const data = await res.json();
    if (res.status === 200 && data.user?.role === 'DOCTOR') {
      doctorToken = data.accessToken;
      doctorRefreshToken = data.refreshToken;
      doctorId = data.user.doctorId;
      recordResult('Auth', 'Doctor Login with JWT issuance', 'PASS', res.status, `Logged in as ${data.user.email}, DoctorId: ${doctorId}`);
    } else {
      recordResult('Auth', 'Doctor Login with JWT issuance', 'FAIL', res.status, data);
      process.exit(1);
    }
  } catch (err) {
    recordResult('Auth', 'Doctor Login with JWT issuance', 'FAIL', 0, err.message);
    process.exit(1);
  }

  const authHeaders = {
    'Authorization': `Bearer ${doctorToken}`,
    'Content-Type': 'application/json',
  };

  // 2. Fetch Doctor Profile
  try {
    const res = await fetch(`${BASE_URL}/doctors/${doctorId}`, {
      headers: authHeaders,
    });
    const data = await res.json();
    if (res.status === 200 && data.id === doctorId) {
      recordResult('Doctor Profile', 'Retrieve Doctor Profile', 'PASS', res.status, `Specialization: ${data.specialization?.name}, Clinic: ${data.clinic?.name}`);
    } else {
      recordResult('Doctor Profile', 'Retrieve Doctor Profile', 'FAIL', res.status, data);
    }
  } catch (err) {
    recordResult('Doctor Profile', 'Retrieve Doctor Profile', 'FAIL', 0, err.message);
  }

  // 3. Fetch Doctor Schedules
  try {
    const res = await fetch(`${BASE_URL}/doctors/${doctorId}/schedules`, {
      headers: authHeaders,
    });
    const data = await res.json();
    if (res.status === 200 && Array.isArray(data.entries)) {
      recordResult('Schedule', 'Retrieve Doctor Weekly Timetable', 'PASS', res.status, `Found ${data.entries.length} weekly shifts`);
    } else {
      recordResult('Schedule', 'Retrieve Doctor Weekly Timetable', 'FAIL', res.status, data);
    }
  } catch (err) {
    recordResult('Schedule', 'Retrieve Doctor Weekly Timetable', 'FAIL', 0, err.message);
  }

  // 4. Retrieve Doctor Leaves
  try {
    const res = await fetch(`${BASE_URL}/doctors/${doctorId}/leaves`, {
      headers: authHeaders,
    });
    const data = await res.json();
    if (res.status === 200 && Array.isArray(data)) {
      recordResult('Schedule', 'Retrieve Doctor Existing Leaves', 'PASS', res.status, `Found ${data.length} registered leaves`);
    } else {
      recordResult('Schedule', 'Retrieve Doctor Existing Leaves', 'FAIL', res.status, data);
    }
  } catch (err) {
    recordResult('Schedule', 'Retrieve Doctor Existing Leaves', 'FAIL', 0, err.message);
  }

  // 5. Apply Doctor Leave
  try {
    const res = await fetch(`${BASE_URL}/doctors/${doctorId}/leaves`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        startDate: '2026-12-15',
        endDate: '2026-12-16',
        reason: 'Phase 22 Live Validation Leave Test',
      }),
    });
    const data = await res.json();
    if (res.status === 201 && data.id) {
      createdLeaveId = data.id;
      recordResult('Schedule', 'Apply for Doctor Leave (POST /leaves)', 'PASS', res.status, `Leave Created UUID: ${createdLeaveId}`);
    } else {
      recordResult('Schedule', 'Apply for Doctor Leave (POST /leaves)', 'FAIL', res.status, data);
    }
  } catch (err) {
    recordResult('Schedule', 'Apply for Doctor Leave (POST /leaves)', 'FAIL', 0, err.message);
  }

  // 6. Delete Doctor Leave (clean up)
  if (createdLeaveId) {
    try {
      const res = await fetch(`${BASE_URL}/doctors/${doctorId}/leaves/${createdLeaveId}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      if (res.status === 204 || res.status === 200) {
        recordResult('Schedule', 'Delete Doctor Leave (DELETE /leaves/{id})', 'PASS', res.status, 'Leave deleted cleanly');
      } else {
        recordResult('Schedule', 'Delete Doctor Leave (DELETE /leaves/{id})', 'FAIL', res.status, `Status: ${res.status}`);
      }
    } catch (err) {
      recordResult('Schedule', 'Delete Doctor Leave (DELETE /leaves/{id})', 'FAIL', 0, err.message);
    }
  }

  // 7. Check Doctor Daily Slots
  try {
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch(`${BASE_URL}/doctors/${doctorId}/slots?date=${today}`, {
      headers: authHeaders,
    });
    const data = await res.json();
    if (res.status === 200) {
      recordResult('Schedule', 'Retrieve Doctor Slots for Today', 'PASS', res.status, `Slots payload: ${Array.isArray(data) ? data.length + ' slots' : 'Closed: ' + data.closedReason}`);
    } else {
      recordResult('Schedule', 'Retrieve Doctor Slots for Today', 'FAIL', res.status, data);
    }
  } catch (err) {
    recordResult('Schedule', 'Retrieve Doctor Slots for Today', 'FAIL', 0, err.message);
  }

  // 8. Inspect Doctor Patient Queue
  try {
    const res = await fetch(`${BASE_URL}/queue/doctors/${doctorId}`, {
      headers: authHeaders,
    });
    const data = await res.json();
    if (res.status === 200) {
      recordResult('Queue', 'Inspect Doctor Queue State', 'PASS', res.status, `Waiting: ${data.waitingCount}, Serving: ${data.nowServing?.tokenNumber || 'None'}`);
    } else {
      recordResult('Queue', 'Inspect Doctor Queue State', 'FAIL', res.status, data);
    }
  } catch (err) {
    recordResult('Queue', 'Inspect Doctor Queue State', 'FAIL', 0, err.message);
  }

  // 9. Search Patients Roster
  try {
    const res = await fetch(`${BASE_URL}/patients?size=10`, {
      headers: authHeaders,
    });
    const data = await res.json();
    if (res.status === 200 && Array.isArray(data.content)) {
      if (data.content.length > 0) {
        testPatientId = data.content[0].id;
      }
      recordResult('Patients', 'Browse Authorized Patients List', 'PASS', res.status, `Found ${data.totalElements} patient records. Sample patient: ${testPatientId}`);
    } else {
      recordResult('Patients', 'Browse Authorized Patients List', 'FAIL', res.status, data);
    }
  } catch (err) {
    recordResult('Patients', 'Browse Authorized Patients List', 'FAIL', 0, err.message);
  }

  // 10. Check Formulary Medicine Search (ADMIN / DOCTOR only)
  let testMedicineIds = [];
  try {
    const res = await fetch(`${BASE_URL}/medicines?name=amox`, {
      headers: authHeaders,
    });
    const data = await res.json();
    if (res.status === 200 && Array.isArray(data.content)) {
      testMedicineIds = data.content.map(m => m.id);
      recordResult('Medicines', 'Search Hospital Medicine Formulary (amox)', 'PASS', res.status, `Matched ${data.content.length} medicines`);
    } else {
      recordResult('Medicines', 'Search Hospital Medicine Formulary (amox)', 'FAIL', res.status, data);
    }
  } catch (err) {
    recordResult('Medicines', 'Search Hospital Medicine Formulary (amox)', 'FAIL', 0, err.message);
  }

  // 11. Drug Interaction Safety Check
  if (testPatientId && testMedicineIds.length > 0) {
    try {
      const res = await fetch(`${BASE_URL}/prescriptions/check`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          patientId: testPatientId,
          medicineIds: testMedicineIds.slice(0, 2),
        }),
      });
      const data = await res.json();
      if (res.status === 200) {
        recordResult('Prescriptions', 'Clinical Drug Interaction & Allergy Check', 'PASS', res.status, `Warnings: ${data.warnings?.length || 0}`);
      } else {
        recordResult('Prescriptions', 'Clinical Drug Interaction & Allergy Check', 'FAIL', res.status, data);
      }
    } catch (err) {
      recordResult('Prescriptions', 'Clinical Drug Interaction & Allergy Check', 'FAIL', 0, err.message);
    }
  }

  // 12. Retrieve Doctor's Appointments
  try {
    const res = await fetch(`${BASE_URL}/appointments?doctorId=${doctorId}&size=20`, {
      headers: authHeaders,
    });
    const data = await res.json();
    if (res.status === 200 && Array.isArray(data.content)) {
      const completed = data.content.filter(a => a.status === 'COMPLETED');
      if (completed.length > 0) {
        testAppointmentId = completed[0].id;
      }
      recordResult('Appointments', 'Retrieve Doctor Appointments List', 'PASS', res.status, `Found ${data.totalElements} total appointments, ${completed.length} completed`);
    } else {
      recordResult('Appointments', 'Retrieve Doctor Appointments List', 'FAIL', res.status, data);
    }
  } catch (err) {
    recordResult('Appointments', 'Retrieve Doctor Appointments List', 'FAIL', 0, err.message);
  }

  // 13. Consultation by Appointment
  if (testAppointmentId) {
    try {
      const res = await fetch(`${BASE_URL}/appointments/${testAppointmentId}/consultation`, {
        headers: authHeaders,
      });
      if (res.status === 200) {
        const data = await res.json();
        testConsultationId = data.id;
        recordResult('Consultations', 'Retrieve Consultation for Appointment', 'PASS', res.status, `Diagnosis: ${data.diagnosis}, Finalized: ${data.finalized}`);
      } else if (res.status === 404) {
        recordResult('Consultations', 'Retrieve Consultation for Appointment', 'PASS', res.status, 'Consultation not created for this appointment (404 expected)');
      } else {
        recordResult('Consultations', 'Retrieve Consultation for Appointment', 'FAIL', res.status, `Status: ${res.status}`);
      }
    } catch (err) {
      recordResult('Consultations', 'Retrieve Consultation for Appointment', 'FAIL', 0, err.message);
    }
  }

  // 14. Completed Appointments for History View
  try {
    const res = await fetch(`${BASE_URL}/appointments?doctorId=${doctorId}&status=COMPLETED&size=20`, {
      headers: authHeaders,
    });
    const data = await res.json();
    if (res.status === 200 && Array.isArray(data.content)) {
      recordResult('History', 'Filter Completed Consultations for History Tab', 'PASS', res.status, `Returned ${data.content.length} completed encounters`);
    } else {
      recordResult('History', 'Filter Completed Consultations for History Tab', 'FAIL', res.status, data);
    }
  } catch (err) {
    recordResult('History', 'Filter Completed Consultations for History Tab', 'FAIL', 0, err.message);
  }

  // Summary
  console.log('\n======================================================');
  console.log(`TOTAL SCENARIOS EVALUATED: ${results.length}`);
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(console.error);
