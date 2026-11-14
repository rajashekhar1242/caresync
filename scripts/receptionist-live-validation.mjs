/**
 * CareSync / HCMS Phase 21 Receptionist Live Integration Test Suite
 * Executes live against real Spring Boot 4.1.2 backend and PostgreSQL database.
 */

const BASE_URL = 'http://localhost:8080/api';
const WS_URL = 'ws://localhost:8080/ws/websocket';

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
  console.log('=== CareSync Phase 21 Receptionist Live Integration Suite ===');
  const timestamp = Date.now();

  let receptionistToken = null;
  let receptionistRefreshToken = null;
  let testPatientId = null;
  let testDoctorId = null;
  let testClinicId = null;
  let testAppointmentId = null;
  let issuedTokenNumber = null;
  let chosenSlotStart = null;

  let testSpecializationId = null;
  let testDepartmentId = null;

  // 1. Receptionist Login
  try {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'reception@caresync.local',
        password: 'ReceptPass!123',
      }),
    });
    const data = await res.json();
    if (res.status === 200 && data.user?.role === 'RECEPTIONIST') {
      receptionistToken = data.accessToken;
      receptionistRefreshToken = data.refreshToken;
      recordResult('Auth', 'Receptionist Login', 'PASS', res.status, `Logged in as ${data.user.email}`);
    } else {
      recordResult('Auth', 'Receptionist Login', 'FAIL', res.status, data);
      process.exit(1);
    }
  } catch (err) {
    recordResult('Auth', 'Receptionist Login', 'FAIL', 0, err.message);
    process.exit(1);
  }

  const authHeaders = {
    Authorization: `Bearer ${receptionistToken}`,
    'Content-Type': 'application/json',
  };

  // 2. /api/auth/me Session Hydration
  try {
    const res = await fetch(`${BASE_URL}/auth/me`, { headers: authHeaders });
    const data = await res.json();
    if (res.status === 200 && data.role === 'RECEPTIONIST') {
      recordResult('Auth', 'Session Restoration (/auth/me)', 'PASS', res.status, `role=${data.role}, id=${data.id}`);
    } else {
      recordResult('Auth', 'Session Restoration (/auth/me)', 'FAIL', res.status, data);
    }
  } catch (err) {
    recordResult('Auth', 'Session Restoration (/auth/me)', 'FAIL', 0, err.message);
  }

  // 3. Token Refresh Rotation
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: receptionistRefreshToken }),
    });
    const data = await res.json();
    if (res.status === 200 && data.accessToken) {
      receptionistToken = data.accessToken;
      authHeaders.Authorization = `Bearer ${receptionistToken}`;
      receptionistRefreshToken = data.refreshToken;
      recordResult('Auth', 'Token Rotation (/auth/refresh)', 'PASS', res.status, 'Rotated accessToken issued');
    } else {
      recordResult('Auth', 'Token Rotation (/auth/refresh)', 'FAIL', res.status, data);
    }
  } catch (err) {
    recordResult('Auth', 'Token Rotation (/auth/refresh)', 'FAIL', 0, err.message);
  }

  // 4. Reference Data: Departments, Specializations, Clinics
  try {
    const depRes = await fetch(`${BASE_URL}/departments`, { headers: authHeaders });
    const depData = await depRes.json();
    const specRes = await fetch(`${BASE_URL}/specializations`, { headers: authHeaders });
    const specData = await specRes.json();
    const clinRes = await fetch(`${BASE_URL}/clinics`, { headers: authHeaders });
    const clinData = await clinRes.json();

    if (depRes.status === 200 && specRes.status === 200 && clinRes.status === 200) {
      testClinicId = clinData[0]?.id;
      testSpecializationId = specData[0]?.id;
      testDepartmentId = depData[0]?.id;
      recordResult(
        'Reference Data',
        'Directory Lookups (Departments, Specializations, Clinics)',
        'PASS',
        200,
        `Depts: ${depData.length}, Specs: ${specData.length}, Clinics: ${clinData.length}`
      );
    } else {
      recordResult('Reference Data', 'Directory Lookups', 'FAIL', depRes.status, 'Failed reference lookups');
    }
  } catch (err) {
    recordResult('Reference Data', 'Directory Lookups', 'FAIL', 0, err.message);
  }

  // 5. Patient Search
  try {
    const res = await fetch(`${BASE_URL}/patients?page=0&size=10`, { headers: authHeaders });
    const data = await res.json();
    if (res.status === 200 && Array.isArray(data.content)) {
      recordResult('Patients', 'Search & Directory Listing (/api/patients)', 'PASS', res.status, `total=${data.totalElements}`);
    } else {
      recordResult('Patients', 'Search & Directory Listing (/api/patients)', 'FAIL', res.status, data);
    }
  } catch (err) {
    recordResult('Patients', 'Search & Directory Listing (/api/patients)', 'FAIL', 0, err.message);
  }

  // 6. Patient Registration (Walk-in Intake)
  try {
    const patientPayload = {
      fullName: `QA Receptionist Patient ${timestamp}`,
      dateOfBirth: '1991-03-22',
      gender: 'MALE',
      phone: `+91987${String(timestamp).slice(-7)}`,
      email: `patient_${timestamp}@caresync.local`,
      address: '77 Health Blvd, Bangalore',
      allergies: ['Penicillin', 'Sulfonamides'],
    };
    const res = await fetch(`${BASE_URL}/patients`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(patientPayload),
    });
    const data = await res.json();
    if (res.status === 201 && data.id) {
      testPatientId = data.id;
      recordResult('Patients', 'Walk-in Registration (POST /api/patients)', 'PASS', res.status, `id=${data.id}, name=${data.fullName}`);
    } else {
      recordResult('Patients', 'Walk-in Registration (POST /api/patients)', 'FAIL', res.status, data);
    }
  } catch (err) {
    recordResult('Patients', 'Walk-in Registration (POST /api/patients)', 'FAIL', 0, err.message);
  }

  // 7. Patient Profile Inspection & Audit
  if (testPatientId) {
    try {
      const res = await fetch(`${BASE_URL}/patients/${testPatientId}`, { headers: authHeaders });
      const data = await res.json();
      if (res.status === 200 && data.id === testPatientId) {
        recordResult('Patients', 'Patient Profile Retrieval (/api/patients/{id})', 'PASS', res.status, `allergies=${data.allergies?.join(',')}`);
      } else {
        recordResult('Patients', 'Patient Profile Retrieval (/api/patients/{id})', 'FAIL', res.status, data);
      }
    } catch (err) {
      recordResult('Patients', 'Patient Profile Retrieval (/api/patients/{id})', 'FAIL', 0, err.message);
    }
  }

  // 8. Doctors Listing & Schedule Selection
  try {
    const res = await fetch(`${BASE_URL}/doctors?page=0&size=20`, { headers: authHeaders });
    const data = await res.json();
    if (res.status === 200 && data.content?.length > 0) {
      // Find a doctor that has active schedule entries
      let selectedDoc = null;
      for (const doc of data.content) {
        const sRes = await fetch(`${BASE_URL}/doctors/${doc.id}/schedules`, { headers: authHeaders });
        const sData = await sRes.json();
        if (sData.entries && sData.entries.length > 0) {
          selectedDoc = doc;
          break;
        }
      }
      if (!selectedDoc) selectedDoc = data.content[0];
      testDoctorId = selectedDoc.id;
      recordResult('Doctors', 'Physicians Directory (/api/doctors)', 'PASS', res.status, `Selected=${selectedDoc.fullName} (id=${selectedDoc.id})`);
    } else {
      recordResult('Doctors', 'Physicians Directory (/api/doctors)', 'FAIL', res.status, data);
    }
  } catch (err) {
    recordResult('Doctors', 'Physicians Directory (/api/doctors)', 'FAIL', 0, err.message);
  }

  // 9. Doctor Weekly Schedules
  if (testDoctorId) {
    try {
      const res = await fetch(`${BASE_URL}/doctors/${testDoctorId}/schedules`, { headers: authHeaders });
      const data = await res.json();
      if (res.status === 200) {
        recordResult('Doctors', 'Weekly Schedule Retrieval (/api/doctors/{id}/schedules)', 'PASS', res.status, `Entries=${data.entries?.length || 0}`);
      } else {
        recordResult('Doctors', 'Weekly Schedule Retrieval (/api/doctors/{id}/schedules)', 'FAIL', res.status, data);
      }
    } catch (err) {
      recordResult('Doctors', 'Weekly Schedule Retrieval (/api/doctors/{id}/schedules)', 'FAIL', 0, err.message);
    }
  }

  // 10. Doctor Leaves
  if (testDoctorId) {
    try {
      const res = await fetch(`${BASE_URL}/doctors/${testDoctorId}/leaves`, { headers: authHeaders });
      const data = await res.json();
      if (res.status === 200) {
        recordResult('Doctors', 'Doctor Leaves Listing (/api/doctors/{id}/leaves)', 'PASS', res.status, `Leaves=${data.length}`);
      } else {
        recordResult('Doctors', 'Doctor Leaves Listing (/api/doctors/{id}/leaves)', 'FAIL', res.status, data);
      }
    } catch (err) {
      recordResult('Doctors', 'Doctor Leaves Listing (/api/doctors/{id}/leaves)', 'FAIL', 0, err.message);
    }
  }

  // 11. Authoritative Slot Generation
  const todayStr = new Date().toISOString().split('T')[0];
  if (testDoctorId) {
    try {
      // Ensure doctor has schedule for today
      const todayDayOfWeek = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][new Date().getDay()];
      // Check slots
      const res = await fetch(`${BASE_URL}/doctors/${testDoctorId}/slots?date=${todayStr}`, { headers: authHeaders });
      const data = await res.json();
      if (res.status === 200) {
        const availableSlot = data.slots?.find((s) => s.available);
        if (availableSlot) {
          chosenSlotStart = availableSlot.start;
        }
        recordResult(
          'Scheduling',
          'Authoritative Slot Generation (/api/doctors/{id}/slots)',
          'PASS',
          res.status,
          `Slots=${data.slots?.length || 0}, Available=${data.slots?.filter((s) => s.available).length || 0}`
        );
      } else {
        recordResult('Scheduling', 'Authoritative Slot Generation (/api/doctors/{id}/slots)', 'FAIL', res.status, data);
      }
    } catch (err) {
      recordResult('Scheduling', 'Authoritative Slot Generation (/api/doctors/{id}/slots)', 'FAIL', 0, err.message);
    }
  }

  // If no slot available on today, we can book for tomorrow or check slots
  if (!chosenSlotStart && testDoctorId) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    try {
      const res = await fetch(`${BASE_URL}/doctors/${testDoctorId}/slots?date=${tomorrowStr}`, { headers: authHeaders });
      const data = await res.json();
      if (res.status === 200 && data.slots?.find((s) => s.available)) {
        chosenSlotStart = data.slots.find((s) => s.available).start;
      }
    } catch {
      // ignore
    }
  }

  // 12. Book Appointment
  if (testDoctorId && testPatientId && chosenSlotStart) {
    try {
      const res = await fetch(`${BASE_URL}/appointments`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          doctorId: testDoctorId,
          patientId: testPatientId,
          slotStart: chosenSlotStart,
          reason: 'General consultation booked at reception desk',
        }),
      });
      const data = await res.json();
      if (res.status === 201 && data.id) {
        testAppointmentId = data.id;
        recordResult('Appointments', 'Book Appointment (POST /api/appointments)', 'PASS', res.status, `id=${data.id}, status=${data.status}`);
      } else {
        recordResult('Appointments', 'Book Appointment (POST /api/appointments)', 'FAIL', res.status, data);
      }
    } catch (err) {
      recordResult('Appointments', 'Book Appointment (POST /api/appointments)', 'FAIL', 0, err.message);
    }
  } else {
    recordResult('Appointments', 'Book Appointment (POST /api/appointments)', 'BLOCKED', 0, 'No available slot start time found');
  }

  // 13. Appointment Search & Retrieval
  if (testAppointmentId) {
    try {
      const res = await fetch(`${BASE_URL}/appointments/${testAppointmentId}`, { headers: authHeaders });
      const data = await res.json();
      if (res.status === 200 && data.id === testAppointmentId) {
        recordResult('Appointments', 'Appointment Retrieval (/api/appointments/{id})', 'PASS', res.status, `patientName=${data.patientName}`);
      } else {
        recordResult('Appointments', 'Appointment Retrieval (/api/appointments/{id})', 'FAIL', res.status, data);
      }
    } catch (err) {
      recordResult('Appointments', 'Appointment Retrieval (/api/appointments/{id})', 'FAIL', 0, err.message);
    }
  }

  // 14. Patient Check-In (Arrival & Token Issuance)
  if (testAppointmentId) {
    try {
      const res = await fetch(`${BASE_URL}/appointments/${testAppointmentId}/status`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({
          status: 'CHECKED_IN',
        }),
      });
      const data = await res.json();
      if (res.status === 200 && data.status === 'CHECKED_IN') {
        issuedTokenNumber = data.tokenNumber;
        recordResult('Check-In', 'Patient Arrival Check-In (PATCH status CHECKED_IN)', 'PASS', res.status, `Token=#${data.tokenNumber}, status=${data.status}`);
      } else if (res.status === 409 && data.code === 'TRANSITION_TOO_EARLY') {
        recordResult(
          'Check-In',
          'Patient Arrival Check-In (PATCH status CHECKED_IN)',
          'PASS',
          res.status,
          'Correctly enforced: cannot check in before slot date'
        );
      } else {
        recordResult('Check-In', 'Patient Arrival Check-In (PATCH status CHECKED_IN)', 'FAIL', res.status, data);
      }
    } catch (err) {
      recordResult('Check-In', 'Patient Arrival Check-In (PATCH status CHECKED_IN)', 'FAIL', 0, err.message);
    }
  }

  // 15. Queue State Inspection (/api/queue/doctors/{id})
  if (testDoctorId) {
    try {
      const res = await fetch(`${BASE_URL}/queue/doctors/${testDoctorId}`, { headers: authHeaders });
      const data = await res.json();
      if (res.status === 200 && typeof data.waitingCount === 'number') {
        recordResult('Queue', 'Doctor Queue State (/api/queue/doctors/{id})', 'PASS', res.status, `waiting=${data.waitingCount}, lastToken=${data.lastTokenIssued}`);
      } else {
        recordResult('Queue', 'Doctor Queue State (/api/queue/doctors/{id})', 'FAIL', res.status, data);
      }
    } catch (err) {
      recordResult('Queue', 'Doctor Queue State (/api/queue/doctors/{id})', 'FAIL', 0, err.message);
    }
  }

  // 16. Clinic Queue Board (/api/queue/board)
  if (testClinicId) {
    try {
      const res = await fetch(`${BASE_URL}/queue/board?clinicId=${testClinicId}`);
      const data = await res.json();
      if (res.status === 200 && Array.isArray(data.doctors)) {
        recordResult('Queue', 'Public Queue Board (/api/queue/board)', 'PASS', res.status, `Doctors on board: ${data.doctors.length}`);
      } else {
        recordResult('Queue', 'Public Queue Board (/api/queue/board)', 'FAIL', res.status, data);
      }
    } catch (err) {
      recordResult('Queue', 'Public Queue Board (/api/queue/board)', 'FAIL', 0, err.message);
    }
  }

  // 17. WebSocket STOMP Connection & Subscription Check
  try {
    const wsResult = await new Promise((resolve) => {
      const ws = new WebSocket(WS_URL);
      const timer = setTimeout(() => {
        ws.close();
        resolve({ ok: false, error: 'WebSocket timeout' });
      }, 5000);

      ws.onopen = () => {
        ws.send('CONNECT\naccept-version:1.1,1.2\nheart-beat:10000,10000\n\n\0');
      };

      ws.onmessage = (e) => {
        const str = String(e.data);
        if (str.startsWith('CONNECTED')) {
          if (testDoctorId) {
            ws.send(`SUBSCRIBE\nid:sub-rec\ndestination:/topic/queue/${testDoctorId}\n\n\0`);
            clearTimeout(timer);
            setTimeout(() => {
              ws.close();
              resolve({ ok: true, detail: 'STOMP CONNECTED and subscribed to /topic/queue/' + testDoctorId });
            }, 300);
          } else {
            clearTimeout(timer);
            ws.close();
            resolve({ ok: true, detail: 'STOMP CONNECTED' });
          }
        }
      };

      ws.onerror = (err) => {
        clearTimeout(timer);
        resolve({ ok: false, error: err.message || 'WS error' });
      };
    });

    if (wsResult.ok) {
      recordResult('WebSocket', 'STOMP Queue Channel Subscription (/ws)', 'PASS', 101, wsResult.detail);
    } else {
      recordResult('WebSocket', 'STOMP Queue Channel Subscription (/ws)', 'FAIL', 0, wsResult.error);
    }
  } catch (err) {
    recordResult('WebSocket', 'STOMP Queue Channel Subscription (/ws)', 'FAIL', 0, err.message);
  }

  // 18. RBAC Enforcements (Forbidden endpoints for RECEPTIONIST)
  const forbiddenChecks = [
    { name: 'Admin Reports Forbidden', path: '/reports/dashboard', method: 'GET' },
    { name: 'Admin Audit Logs Forbidden', path: '/audit-logs', method: 'GET' },
    {
      name: 'Doctor Account Creation Forbidden',
      path: '/doctors',
      method: 'POST',
      body: {
        fullName: 'Dr. Forbidden RBAC',
        email: `forbid_${timestamp}@caresync.local`,
        password: 'DoctorPass!123',
        phone: '+919876543299',
        specializationId: testSpecializationId,
        clinicId: testClinicId,
        departmentId: testDepartmentId,
        consultationFee: '600.00',
        slotMinutes: 15,
      },
    },
    {
      name: 'Department Creation Forbidden',
      path: '/departments',
      method: 'POST',
      body: {
        name: `Forbidden Dept ${timestamp}`,
        description: 'Testing receptionist 403',
      },
    },
  ];

  for (const check of forbiddenChecks) {
    try {
      const res = await fetch(`${BASE_URL}${check.path}`, {
        method: check.method,
        headers: authHeaders,
        body: check.body ? JSON.stringify(check.body) : undefined,
      });
      if (res.status === 403) {
        recordResult('RBAC Enforcement', `${check.name} (${check.method} ${check.path})`, 'PASS', res.status, 'HTTP 403 Forbidden properly returned');
      } else {
        recordResult('RBAC Enforcement', `${check.name} (${check.method} ${check.path})`, 'FAIL', res.status, `Unexpected status code: ${res.status}`);
      }
    } catch (err) {
      recordResult('RBAC Enforcement', `${check.name} (${check.method} ${check.path})`, 'FAIL', 0, err.message);
    }
  }

  // 19. Receptionist Logout
  try {
    const res = await fetch(`${BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: receptionistRefreshToken }),
    });
    if (res.status === 204) {
      recordResult('Auth', 'Receptionist Logout (POST /api/auth/logout)', 'PASS', res.status, 'Session invalidated cleanly');
    } else {
      recordResult('Auth', 'Receptionist Logout (POST /api/auth/logout)', 'FAIL', res.status, `Status: ${res.status}`);
    }
  } catch (err) {
    recordResult('Auth', 'Receptionist Logout (POST /api/auth/logout)', 'FAIL', 0, err.message);
  }

  // 20. Post-Logout Token Replay Rejection
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: receptionistRefreshToken }),
    });
    if (res.status === 401) {
      recordResult('Auth', 'Post-Logout Refresh Token Rejection', 'PASS', res.status, 'HTTP 401 INVALID_REFRESH_TOKEN');
    } else {
      recordResult('Auth', 'Post-Logout Refresh Token Rejection', 'FAIL', res.status, `Status: ${res.status}`);
    }
  } catch (err) {
    recordResult('Auth', 'Post-Logout Refresh Token Rejection', 'FAIL', 0, err.message);
  }

  console.log('\n=== Live Validation Summary ===');
  const passCount = results.filter((r) => r.status === 'PASS').length;
  const failCount = results.filter((r) => r.status === 'FAIL').length;
  const blockedCount = results.filter((r) => r.status === 'BLOCKED').length;
  console.log(`Total Operations: ${results.length}`);
  console.log(`PASS: ${passCount}`);
  console.log(`FAIL: ${failCount}`);
  console.log(`BLOCKED: ${blockedCount}`);

  // Write results JSON to frontend/docs/receptionist-live-results.json
  const fs = await import('fs');
  fs.writeFileSync(
    'Z:/javaproject/frontend/docs/receptionist-live-results.json',
    JSON.stringify(results, null, 2),
    'utf-8'
  );
  console.log('Results written to frontend/docs/receptionist-live-results.json');
}

run().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
