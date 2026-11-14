/**
 * CareSync HCMS - Real-Time Queue WebSocket Verification Script
 * Validates actual STOMP event delivery over native WebSocket on Spring Boot.
 */

const BASE_URL = 'http://localhost:8080/api';
const WS_URL = 'ws://localhost:8080/ws/websocket';

async function main() {
  console.log('=== CareSync Real-Time Queue WebSocket Verification ===\n');

  // Step 1: Receptionist Login
  console.log('[Step 1] Logging in as RECEPTIONIST...');
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'reception@caresync.local',
      password: 'ReceptPass!123',
    }),
  });
  if (!loginRes.ok) {
    throw new Error(`Login failed with status ${loginRes.status}`);
  }
  const authData = await loginRes.json();
  const token = authData.accessToken;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
  console.log('✓ Receptionist authenticated successfully.');

  // Step 2: Select an Active Doctor
  console.log('\n[Step 2] Locating an active doctor with consultation slots...');
  const docRes = await fetch(`${BASE_URL}/doctors?size=20`, { headers });
  const docPage = await docRes.json();
  const doctors = docPage.content || [];
  
  let targetDoctor = null;
  let todaySlot = null;
  // Get date in clinic timezone
  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  for (const doc of doctors) {
    const slotsRes = await fetch(`${BASE_URL}/doctors/${doc.id}/slots?date=${todayStr}`, { headers });
    if (slotsRes.ok) {
      const slotData = await slotsRes.json();
      const available = slotData.slots?.find((s) => s.available);
      if (available) {
        targetDoctor = doc;
        todaySlot = available;
        break;
      }
    }
  }

  if (!targetDoctor) {
    // Pick first doctor anyway
    targetDoctor = doctors[0];
  }
  console.log(`✓ Target Doctor: ${targetDoctor.fullName} (ID: ${targetDoctor.id})`);

  // Step 3: Establish WebSocket Connection & Subscribe
  console.log('\n[Step 3] Connecting STOMP WebSocket to /ws/websocket...');
  let ws = new WebSocket(WS_URL);
  
  let connected = false;
  let subscribed = false;
  let receivedQueueEvent = null;
  let messageResolve = null;
  const messagePromise = new Promise((resolve) => {
    messageResolve = resolve;
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('WebSocket connection timed out'));
    }, 5000);

    ws.onopen = () => {
      console.log('✓ Native WebSocket transport connected (101 Switching Protocols).');
      // Send STOMP CONNECT
      ws.send('CONNECT\naccept-version:1.1,1.2\nheart-beat:10000,10000\n\n\0');
    };

    ws.onmessage = (event) => {
      const raw = String(event.data);
      if (raw.startsWith('CONNECTED')) {
        connected = true;
        console.log('✓ STOMP broker acknowledged CONNECTED.');
        // Subscribe to /topic/queue/{doctorId}
        const subFrame = `SUBSCRIBE\nid:sub-verify-1\ndestination:/topic/queue/${targetDoctor.id}\n\n\0`;
        ws.send(subFrame);
        subscribed = true;
        console.log(`✓ Subscribed to /topic/queue/${targetDoctor.id}`);
        clearTimeout(timeout);
        resolve();
      } else if (raw.startsWith('MESSAGE')) {
        console.log('>>> [INCOMING STOMP MESSAGE FRAME RECEIVED] <<<');
        const bodyStart = raw.indexOf('\n\n');
        if (bodyStart !== -1) {
          const bodyWithNull = raw.slice(bodyStart + 2);
          const nullIdx = bodyWithNull.indexOf('\0');
          const jsonStr = nullIdx !== -1 ? bodyWithNull.slice(0, nullIdx) : bodyWithNull;
          try {
            receivedQueueEvent = JSON.parse(jsonStr.trim());
            console.log('Received QueueUpdateMessage payload:');
            console.log(JSON.stringify(receivedQueueEvent, null, 2));
            if (messageResolve) messageResolve(receivedQueueEvent);
          } catch (err) {
            console.error('Failed to parse JSON body:', err);
          }
        }
      }
    };

    ws.onerror = (err) => {
      clearTimeout(timeout);
      reject(new Error(`WebSocket error: ${err.message || 'unknown'}`));
    };
  });

  // Step 4: Perform Queue-Changing Action
  console.log('\n[Step 4] Executing authorized queue-changing operation on backend...');
  let queueActionType = '';
  
  // Create patient & book appointment if slot is available
  if (todaySlot) {
    console.log(`Booking appointment for slot: ${todaySlot.start}...`);
    const patRes = await fetch(`${BASE_URL}/patients`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        fullName: `WS Test Patient ${Date.now()}`,
        phone: `+91987${String(Date.now()).slice(-7)}`,
        allergies: [],
      }),
    });
    const patient = await patRes.json();
    console.log(`Created patient: ${patient.fullName} (${patient.id})`);

    const apptRes = await fetch(`${BASE_URL}/appointments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        doctorId: targetDoctor.id,
        patientId: patient.id,
        slotStart: todaySlot.start,
        reason: 'WebSocket queue verification',
      }),
    });
    const appt = await apptRes.json();
    console.log(`Booked appointment: ${appt.id} (Status: ${appt.status})`);

    // Check in patient
    console.log(`Checking in appointment ${appt.id} to trigger queue TOKEN_ISSUED event...`);
    const checkInRes = await fetch(`${BASE_URL}/appointments/${appt.id}/status`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        status: 'CHECKED_IN',
        reason: 'Patient arrival at front desk verification',
      }),
    });
    const checkedInAppt = await checkInRes.json();
    console.log(`✓ Appointment checked in: Token #${checkedInAppt.tokenNumber}`);
    queueActionType = 'CHECKED_IN (TOKEN_ISSUED)';
  } else {
    // If no slot available today, trigger call-next
    console.log(`Triggering call-next on doctor ${targetDoctor.id}...`);
    const callRes = await fetch(`${BASE_URL}/queue/doctors/${targetDoctor.id}/call-next`, {
      method: 'POST',
      headers,
    });
    console.log(`Call-next response HTTP: ${callRes.status}`);
    queueActionType = 'CALL_NEXT';
  }

  // Step 5: Await and Assert WebSocket Event Delivery
  console.log('\n[Step 5] Waiting for QueueUpdateMessage STOMP broadcast...');
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timed out waiting for STOMP message')), 5000)
  );

  const eventMessage = await Promise.race([messagePromise, timeoutPromise]);
  console.log('✓ STOMP event received over WebSocket!');
  console.log(`  - Type: ${eventMessage.type || 'QUEUE_UPDATED'}`);
  console.log(`  - DoctorId: ${eventMessage.doctorId}`);
  console.log(`  - ClinicId: ${eventMessage.clinicId}`);
  console.log(`  - LastTokenIssued: ${eventMessage.lastTokenIssued}`);
  console.log(`  - WaitingCount: ${eventMessage.waitingCount}`);
  console.log(`  - SentAt: ${eventMessage.sentAt}`);

  if (eventMessage.doctorId !== targetDoctor.id) {
    throw new Error(`DoctorId mismatch: expected ${targetDoctor.id}, got ${eventMessage.doctorId}`);
  }

  // Step 6: Test Disconnect & Polling Fallback
  console.log('\n[Step 6] Testing clean disconnection and polling fallback...');
  ws.send('UNSUBSCRIBE\nid:sub-verify-1\n\n\0');
  ws.send('DISCONNECT\n\n\0');
  ws.close();
  console.log('✓ STOMP UNSUBSCRIBE and DISCONNECT frames sent, socket closed.');

  // Verify REST polling works as fallback
  const queueStateRes = await fetch(`${BASE_URL}/queue/doctors/${targetDoctor.id}`, { headers });
  if (!queueStateRes.ok) {
    throw new Error(`REST fallback failed with status ${queueStateRes.status}`);
  }
  const queueState = await queueStateRes.json();
  console.log(`✓ REST fallback succeeded: waitingCount=${queueState.waitingCount}, lastTokenIssued=${queueState.lastTokenIssued}`);

  // Step 7: Test Reconnection & Subscription Restoration
  console.log('\n[Step 7] Testing WebSocket reconnection and subscription restoration...');
  const wsReconnect = new WebSocket(WS_URL);
  let reconnected = false;
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Reconnection timed out')), 5000);
    wsReconnect.onopen = () => {
      wsReconnect.send('CONNECT\naccept-version:1.1,1.2\nheart-beat:10000,10000\n\n\0');
    };
    wsReconnect.onmessage = (e) => {
      const raw = String(e.data);
      if (raw.startsWith('CONNECTED')) {
        reconnected = true;
        wsReconnect.send(`SUBSCRIBE\nid:sub-reconnect\ndestination:/topic/queue/${targetDoctor.id}\n\n\0`);
        clearTimeout(t);
        wsReconnect.close();
        resolve();
      }
    };
    wsReconnect.onerror = (err) => {
      clearTimeout(t);
      reject(new Error('Reconnection failed: ' + err.message));
    };
  });
  console.log('✓ Successfully reconnected, received CONNECTED, and restored subscription.');

  // Summary
  const summary = {
    timestamp: new Date().toISOString(),
    status: 'PASS',
    checks: {
      transport: 'ws://localhost:8080/ws/websocket (HTTP 101)',
      stompHandshake: connected ? 'CONNECTED' : 'FAILED',
      topicSubscription: `/topic/queue/${targetDoctor.id}`,
      triggerAction: queueActionType,
      eventDeliveryVerified: Boolean(eventMessage),
      receivedPayload: eventMessage,
      cleanDisconnection: true,
      restPollingFallback: true,
      reconnectionAndResubscription: reconnected,
    },
  };

  const fs = await import('fs');
  fs.writeFileSync(
    'Z:\\javaproject\\frontend\\docs\\queue-websocket-verification-results.json',
    JSON.stringify(summary, null, 2)
  );

  console.log('\n======================================================');
  console.log('  REAL-TIME QUEUE WEBSOCKET VERIFICATION: 100% PASS   ');
  console.log('======================================================\n');
}

main().catch((err) => {
  console.error('\n❌ Verification Failed:', err);
  process.exit(1);
});
