package com.caresync.queue;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.caresync.auth.entity.Role;
import com.caresync.common.config.RateLimitFilter;
import com.caresync.common.config.RequestLoggingFilter;
import com.caresync.common.security.JwtService;
import com.caresync.common.security.UserPrincipal;
import com.caresync.testsupport.BaseIntegrationTest;
import jakarta.persistence.EntityManagerFactory;
import jakarta.persistence.PersistenceUnit;
import java.lang.reflect.Type;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import java.nio.charset.StandardCharsets;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageHeaders;
import org.springframework.messaging.converter.MessageConverter;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompFrameHandler;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;
import org.springframework.web.socket.sockjs.client.SockJsClient;
import org.springframework.web.socket.sockjs.client.Transport;
import org.springframework.web.socket.sockjs.client.WebSocketTransport;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class QueueIT extends BaseIntegrationTest {

    @LocalServerPort
    private int port;

    @Autowired
    private WebApplicationContext context;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private JsonMapper jsonMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private RateLimitFilter rateLimitFilter;

    @Autowired
    private RequestLoggingFilter requestLoggingFilter;

    @PersistenceUnit
    private EntityManagerFactory entityManagerFactory;

    @Autowired(required = false)
    @Qualifier("queueBroadcastExecutor")
    private ThreadPoolTaskExecutor queueBroadcastExecutor;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.webAppContextSetup(context)
                .addFilters(requestLoggingFilter, rateLimitFilter)
                .apply(springSecurity())
                .build();
        rateLimitFilter.clearBuckets();
    }

    @Test
    void queueLifecycleCallNextConcurrencyPublicBoardAndStompBroadcastWithoutPii() throws Exception {
        String adminJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.fromString("00000000-0000-4000-8000-000000000001"),
                "admin-test@caresync.local", "Admin", Role.ADMIN, null, null));
        String receptionistJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.fromString("00000000-0000-4000-8000-000000000002"),
                "receptionist-test@caresync.local", "Receptionist", Role.RECEPTIONIST, null, null));

        String unique = UUID.randomUUID().toString().substring(0, 8);
        UUID specId = jdbcTemplate.queryForObject("SELECT id FROM specializations ORDER BY name LIMIT 1", UUID.class);
        UUID clinicId = jdbcTemplate.queryForObject("SELECT id FROM clinics ORDER BY name LIMIT 1", UUID.class);
        String clinicTz = jdbcTemplate.queryForObject(
                "SELECT time_zone FROM clinics WHERE id = ?", String.class, clinicId);
        ZoneId zone = ZoneId.of(clinicTz);
        LocalDate clinicToday = LocalDate.now(zone);

        MvcResult deptRes = mockMvc.perform(post("/api/departments")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"QueueDept-%s"}
                                """.formatted(unique)))
                .andExpect(status().isCreated())
                .andReturn();
        UUID deptId = UUID.fromString(jsonMapper.readTree(deptRes.getResponse().getContentAsString()).get("id").asString());

        MvcResult docRes = mockMvc.perform(post("/api/doctors")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "fullName": "Dr. Queue %s",
                                  "email": "doc.queue.%s@caresync.local",
                                  "password": "Password!123",
                                  "specializationId": "%s",
                                  "clinicId": "%s",
                                  "departmentId": "%s",
                                  "consultationFee": "500.00",
                                  "slotMinutes": 15
                                }
                                """.formatted(unique, unique, specId, clinicId, deptId)))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode docJson = jsonMapper.readTree(docRes.getResponse().getContentAsString());
        UUID doctorId = UUID.fromString(docJson.get("id").asString());

        mockMvc.perform(put("/api/doctors/{doctorId}/schedules", doctorId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "entries": [
                                    {"dayOfWeek": "%s", "startTime": "09:00", "endTime": "12:00"}
                                  ]
                                }
                                """.formatted(clinicToday.getDayOfWeek())))
                .andExpect(status().isOk());

        // Create two walk-in patients with distinctive PII names to assert zero leakage on public channel/board
        String secretPat1Name = "SecretPatientOne-" + unique;
        String secretPat2Name = "SecretPatientTwo-" + unique;
        UUID pat1Id = createWalkIn(receptionistJwt, secretPat1Name);
        UUID pat2Id = createWalkIn(receptionistJwt, secretPat2Name);

        Instant slot1 = clinicToday.atTime(LocalTime.of(9, 0)).atZone(zone).toInstant();
        Instant slot2 = clinicToday.atTime(LocalTime.of(9, 15)).atZone(zone).toInstant();
        UUID appt1 = UUID.randomUUID();
        UUID appt2 = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO appointments (id, doctor_id, patient_id, clinic_id, slot_start, slot_end, status) VALUES (?, ?, ?, ?, ?, ?, 'BOOKED')",
                appt1, doctorId, pat1Id, clinicId, Timestamp.from(slot1), Timestamp.from(slot1.plusSeconds(900)));
        jdbcTemplate.update(
                "INSERT INTO appointments (id, doctor_id, patient_id, clinic_id, slot_start, slot_end, status) VALUES (?, ?, ?, ?, ?, ?, 'BOOKED')",
                appt2, doctorId, pat2Id, clinicId, Timestamp.from(slot2), Timestamp.from(slot2.plusSeconds(900)));

        // Connect live STOMP client over SockJS raw websocket endpoint and subscribe to /topic/queue/{doctorId}
        WebSocketStompClient stompClient = new WebSocketStompClient(new StandardWebSocketClient());
        stompClient.setMessageConverter(new MessageConverter() {
            @Override
            public Object fromMessage(Message<?> message, Class<?> targetClass) {
                return new String((byte[]) message.getPayload(), StandardCharsets.UTF_8);
            }

            @Override
            public Message<?> toMessage(Object payload, MessageHeaders headers) {
                return null;
            }
        });
        BlockingQueue<String> receivedMessages = new LinkedBlockingQueue<>();
        BlockingQueue<Throwable> stompErrors = new LinkedBlockingQueue<>();
        StompHeaders connectHeaders = new StompHeaders();
        connectHeaders.add("Authorization", "Bearer " + receptionistJwt);
        StompSession session = stompClient.connectAsync(
                        "ws://localhost:" + port + "/ws",
                        new WebSocketHttpHeaders(),
                        connectHeaders,
                        new StompSessionHandlerAdapter() {
                            @Override
                            public void handleException(
                                    StompSession s, StompCommand cmd, StompHeaders h, byte[] p, Throwable ex) {
                                stompErrors.offer(ex);
                            }

                            @Override
                            public void handleTransportError(StompSession s, Throwable ex) {
                                stompErrors.offer(ex);
                            }
                        })
                .get(5, TimeUnit.SECONDS);

        try {
            session.subscribe("/topic/queue/" + doctorId, new StompFrameHandler() {
                @Override
                public Type getPayloadType(StompHeaders headers) {
                    return String.class;
                }

                @Override
                public void handleFrame(StompHeaders headers, Object payload) {
                    receivedMessages.offer((String) payload);
                }
            });
            Thread.sleep(200);

            // Check in pat1 and pat2
            mockMvc.perform(patch("/api/appointments/{id}/status", appt1)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"status":"CHECKED_IN"}
                                    """))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.tokenNumber").value(1));

            mockMvc.perform(patch("/api/appointments/{id}/status", appt2)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"status":"CHECKED_IN"}
                                    """))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.tokenNumber").value(2));

            assertThat(stompErrors).isEmpty();
            String wsMsg1 = receivedMessages.poll(5, TimeUnit.SECONDS);
            String wsMsg2 = receivedMessages.poll(5, TimeUnit.SECONDS);
            assertThat(wsMsg1).isNotNull().contains("TOKEN_ISSUED");
            assertThat(wsMsg2).isNotNull().contains("TOKEN_ISSUED");
            assertThat(wsMsg2).doesNotContain(secretPat1Name, secretPat2Name, pat1Id.toString(), appt1.toString());

            // Concurrent call-next -> 1 wins (200), 1 gets 409 CONSULTATION_IN_PROGRESS
            ExecutorService pool = Executors.newFixedThreadPool(2);
            CountDownLatch gate = new CountDownLatch(1);
            List<Integer> callStatuses = Collections.synchronizedList(new ArrayList<>());
            try {
                Future<?> f1 = pool.submit(() -> {
                    gate.await();
                    callStatuses.add(mockMvc.perform(post("/api/queue/doctors/{id}/call-next", doctorId)
                                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt))
                            .andReturn().getResponse().getStatus());
                    return null;
                });
                Future<?> f2 = pool.submit(() -> {
                    gate.await();
                    callStatuses.add(mockMvc.perform(post("/api/queue/doctors/{id}/call-next", doctorId)
                                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt))
                            .andReturn().getResponse().getStatus());
                    return null;
                });
                gate.countDown();
                f1.get();
                f2.get();
            } finally {
                pool.shutdownNow();
            }
            assertThat(callStatuses).containsExactlyInAnyOrder(200, 409);

            String wsCalled = receivedMessages.poll(5, TimeUnit.SECONDS);
            assertThat(wsCalled).isNotNull();
            JsonNode calledNode = jsonMapper.readTree(wsCalled);
            assertThat(calledNode.get("type").asString()).isEqualTo("QUEUE_UPDATED");
            assertThat(calledNode.get("event").asString()).isEqualTo("PATIENT_CALLED");
            assertThat(calledNode.get("nowServing").asInt()).isEqualTo(1);
            assertThat(calledNode.get("waitingCount").asInt()).isEqualTo(1);
            assertThat(wsCalled).doesNotContain(secretPat1Name, secretPat2Name, pat1Id.toString(), pat2Id.toString());

            // Staff queue view includes patientName
            mockMvc.perform(get("/api/queue/doctors/{id}", doctorId)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.nowServing.tokenNumber").value(1))
                    .andExpect(jsonPath("$.nowServing.patientName").value(secretPat1Name))
                    .andExpect(jsonPath("$.next[0].tokenNumber").value(2));

            // Public board returns no-store and ZERO PII
            MvcResult boardRes = mockMvc.perform(get("/api/queue/board").param("clinicId", clinicId.toString()))
                    .andExpect(status().isOk())
                    .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                    .andExpect(jsonPath("$.doctors[?(@.doctorId=='%s')].nowServing".formatted(doctorId)).value(1))
                    .andReturn();
            assertThat(boardRes.getResponse().getContentAsString())
                    .doesNotContain(secretPat1Name, secretPat2Name, pat1Id.toString(), pat2Id.toString(), appt1.toString());
        } finally {
            if (session.isConnected()) {
                session.disconnect();
            }
            stompClient.stop();
        }

        // Client SEND on /ws is rejected with STOMP ERROR
        CountDownLatch errorLatch = new CountDownLatch(1);
        WebSocketStompClient sendClient = new WebSocketStompClient(new StandardWebSocketClient());
        StompHeaders sendConnectHeaders = new StompHeaders();
        sendConnectHeaders.add("Authorization", "Bearer " + receptionistJwt);
        StompSession sendSession = sendClient.connectAsync(
                        "ws://localhost:" + port + "/ws",
                        new WebSocketHttpHeaders(),
                        sendConnectHeaders,
                        new StompSessionHandlerAdapter() {
                            @Override
                            public void handleFrame(StompHeaders headers, Object payload) {
                                errorLatch.countDown();
                            }

                            @Override
                            public void handleException(
                                    StompSession s, StompCommand cmd, StompHeaders h, byte[] p, Throwable ex) {
                                errorLatch.countDown();
                            }

                            @Override
                            public void handleTransportError(StompSession s, Throwable ex) {
                                errorLatch.countDown();
                            }
                        })
                .get(5, TimeUnit.SECONDS);
        try {
            sendSession.send("/app/forbidden", "hello".getBytes());
            assertThat(errorLatch.await(5, TimeUnit.SECONDS)).isTrue();
        } finally {
            sendClient.stop();
        }

        // Bounded query count for GET /api/queue/board as clinic doctors grow from 1 to 5
        Statistics stats = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        boolean previousStatsEnabled = stats.isStatisticsEnabled();
        stats.setStatisticsEnabled(true);
        try {
            stats.clear();
            MvcResult initialBoardRes = mockMvc.perform(get("/api/queue/board").param("clinicId", clinicId.toString()))
                    .andExpect(status().isOk())
                    .andReturn();
            int initialDoctorCount = jsonMapper.readTree(initialBoardRes.getResponse().getContentAsString())
                    .get("doctors")
                    .size();
            assertThat(initialDoctorCount).isGreaterThanOrEqualTo(1);
            long initialStatements = stats.getPrepareStatementCount();
            assertThat(initialStatements).isLessThanOrEqualTo(6L);

            for (int i = 1; i <= 4; i++) {
                MvcResult extraDocRes = mockMvc.perform(post("/api/doctors")
                                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                        {
                                          "fullName": "Dr. Scale %d %s",
                                          "email": "doc.scale.%d.%s@caresync.local",
                                          "password": "Password!123",
                                          "specializationId": "%s",
                                          "clinicId": "%s",
                                          "departmentId": "%s",
                                          "consultationFee": "400.00",
                                          "slotMinutes": 15
                                        }
                                        """.formatted(i, unique, i, unique, specId, clinicId, deptId)))
                        .andExpect(status().isCreated())
                        .andReturn();
                UUID extraDocId = UUID.fromString(
                        jsonMapper.readTree(extraDocRes.getResponse().getContentAsString()).get("id").asString());
                mockMvc.perform(put("/api/doctors/{doctorId}/schedules", extraDocId)
                                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                        {"entries":[{"dayOfWeek":"%s","startTime":"09:00","endTime":"12:00"}]}
                                        """.formatted(clinicToday.getDayOfWeek())))
                        .andExpect(status().isOk());
                UUID extraApptId = UUID.randomUUID();
                jdbcTemplate.update(
                        "INSERT INTO appointments (id, doctor_id, patient_id, clinic_id, slot_start, slot_end, status) VALUES (?, ?, ?, ?, ?, ?, 'BOOKED')",
                        extraApptId, extraDocId, pat1Id, clinicId,
                        Timestamp.from(slot1.plusSeconds(900L * i)), Timestamp.from(slot1.plusSeconds(900L * (i + 1))));
                mockMvc.perform(patch("/api/appointments/{id}/status", extraApptId)
                                .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                        {"status":"CHECKED_IN"}
                                        """))
                        .andExpect(status().isOk());
            }

            if (queueBroadcastExecutor != null) {
                for (int w = 0; w < 50 && (queueBroadcastExecutor.getActiveCount() > 0 || queueBroadcastExecutor.getQueueSize() > 0); w++) {
                    Thread.sleep(50);
                }
            }
            Thread.sleep(200);

            stats.clear();
            MvcResult expandedBoardRes = mockMvc.perform(get("/api/queue/board").param("clinicId", clinicId.toString()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.doctors.length()").value(initialDoctorCount + 4))
                    .andReturn();
            long expandedStatements = stats.getPrepareStatementCount();
            assertThat(expandedStatements).isLessThanOrEqualTo(6L);
            assertThat(expandedStatements).isEqualTo(initialStatements);
            assertThat(expandedBoardRes.getResponse().getContentAsString())
                    .doesNotContain(secretPat1Name, secretPat2Name, pat1Id.toString(), pat2Id.toString());
        } finally {
            stats.setStatisticsEnabled(previousStatsEnabled);
        }
    }

    @Test
    void concurrentCheckIn25AppointmentsIssuesUniqueTokensWithoutPoolDeadlock() throws Exception {
        String receptionistJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.fromString("00000000-0000-4000-8000-000000000002"),
                "reception-test@caresync.local", "Receptionist", Role.RECEPTIONIST, null, null));

        UUID specId = jdbcTemplate.queryForObject("SELECT id FROM specializations LIMIT 1", UUID.class);
        UUID clinicId = jdbcTemplate.queryForObject(
                "SELECT id FROM clinics WHERE time_zone = 'Asia/Kolkata' LIMIT 1", UUID.class);
        UUID deptId = jdbcTemplate.queryForObject("SELECT id FROM departments LIMIT 1", UUID.class);
        String unique = UUID.randomUUID().toString().substring(0, 8);

        UUID docUserId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO users (id, email, password_hash, full_name, role, created_at)
                VALUES (?, ?, 'hash', 'Dr. ConcCheckIn', 'DOCTOR', NOW())
                """, docUserId, "doc-conc-" + unique + "@caresync.local");
        UUID doctorId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO doctors (id, user_id, specialization_id, clinic_id, department_id, consultation_fee, slot_minutes, active)
                VALUES (?, ?, ?, ?, ?, 500.00, 15, true)
                """, doctorId, docUserId, specId, clinicId, deptId);

        ZoneId zone = ZoneId.of("Asia/Kolkata");
        LocalDate clinicToday = LocalDate.now(zone);
        jdbcTemplate.update("""
                INSERT INTO schedule_entries (id, doctor_id, day_of_week, start_time, end_time)
                VALUES (?, ?, ?, '00:00:00'::time, '23:55:00'::time)
                """, UUID.randomUUID(), doctorId, clinicToday.getDayOfWeek().name());

        int count = 25;
        List<UUID> appointmentIds = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            UUID patId = UUID.randomUUID();
            jdbcTemplate.update("INSERT INTO patients (id, full_name) VALUES (?, ?)", patId, "Pat-" + i + "-" + unique);
            UUID apptId = UUID.randomUUID();
            Instant slot = clinicToday.atTime(0, 0).plusMinutes(i * 15L).atZone(zone).toInstant();
            jdbcTemplate.update("""
                    INSERT INTO appointments (id, doctor_id, patient_id, clinic_id, slot_start, slot_end, status)
                    VALUES (?, ?, ?, ?, ?, ?, 'BOOKED')
                    """, apptId, doctorId, patId, clinicId, Timestamp.from(slot), Timestamp.from(slot.plusSeconds(900)));
            appointmentIds.add(apptId);
        }

        ExecutorService pool = Executors.newFixedThreadPool(count);
        CountDownLatch gate = new CountDownLatch(1);
        List<Integer> statuses = Collections.synchronizedList(new ArrayList<>());
        List<Integer> tokens = Collections.synchronizedList(new ArrayList<>());

        try {
            List<Future<?>> futures = new ArrayList<>();
            for (UUID apptId : appointmentIds) {
                futures.add(pool.submit(() -> {
                    gate.await();
                    MvcResult res = mockMvc.perform(patch("/api/appointments/{id}/status", apptId)
                                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt)
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content("""
                                            {"status":"CHECKED_IN"}
                                            """))
                            .andReturn();
                    statuses.add(res.getResponse().getStatus());
                    if (res.getResponse().getStatus() == 200) {
                        tokens.add(jsonMapper.readTree(res.getResponse().getContentAsString()).get("tokenNumber").asInt());
                    }
                    return null;
                }));
            }
            gate.countDown();
            for (Future<?> f : futures) {
                f.get(15, TimeUnit.SECONDS);
            }
        } finally {
            pool.shutdownNow();
        }

        assertThat(statuses).hasSize(count);
        assertThat(statuses).allMatch(s -> s == 200);
        assertThat(tokens).hasSize(count);
        assertThat(tokens.stream().distinct().count()).isEqualTo(count);
        assertThat(tokens).containsExactlyInAnyOrderElementsOf(
                java.util.stream.IntStream.rangeClosed(1, count).boxed().toList());
    }

    private UUID createWalkIn(String receptionistJwt, String fullName) throws Exception {
        MvcResult res = mockMvc.perform(post("/api/patients")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fullName":"%s","allergies":[]}
                                """.formatted(fullName)))
                .andExpect(status().isCreated())
                .andReturn();
        return UUID.fromString(jsonMapper.readTree(res.getResponse().getContentAsString()).get("id").asString());
    }

    @Test
    void doctorCannotSubscribeToAnotherDoctorQueueOverWebSocket() throws Exception {
        UUID doctorA = UUID.randomUUID();
        UUID doctorB = UUID.randomUUID();

        String doctorAJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.randomUUID(), "docA@caresync.local", "Doctor A", Role.DOCTOR, null, doctorA));

        WebSocketStompClient stompClient = new WebSocketStompClient(new StandardWebSocketClient());
        stompClient.setMessageConverter(new MessageConverter() {
            @Override
            public Object fromMessage(Message<?> message, Class<?> targetClass) {
                return new String((byte[]) message.getPayload(), StandardCharsets.UTF_8);
            }

            @Override
            public Message<?> toMessage(Object payload, MessageHeaders headers) {
                return null;
            }
        });

        BlockingQueue<Throwable> stompErrors = new LinkedBlockingQueue<>();
        StompHeaders connectHeaders = new StompHeaders();
        connectHeaders.add("Authorization", "Bearer " + doctorAJwt);

        StompSession session = stompClient.connectAsync(
                        "ws://localhost:" + port + "/ws",
                        new WebSocketHttpHeaders(),
                        connectHeaders,
                        new StompSessionHandlerAdapter() {
                            @Override
                            public void handleException(StompSession s, StompCommand cmd, StompHeaders h, byte[] p, Throwable ex) {
                                stompErrors.offer(ex);
                            }

                            @Override
                            public void handleTransportError(StompSession s, Throwable ex) {
                                stompErrors.offer(ex);
                            }
                        })
                .get(5, TimeUnit.SECONDS);

        try {
            // Doctor A attempts to subscribe to Doctor B's queue
            session.subscribe("/topic/queue/" + doctorB, new StompFrameHandler() {
                @Override
                public Type getPayloadType(StompHeaders headers) {
                    return String.class;
                }

                @Override
                public void handleFrame(StompHeaders headers, Object payload) {
                }
            });

            Throwable err = stompErrors.poll(5, TimeUnit.SECONDS);
            assertThat(err).isNotNull();
        } finally {
            try {
                session.disconnect();
            } catch (Exception ignored) {
            }
        }
    }

    @Test
    void nativeWebSocketEndpointAndPatientRejectionAndSendRejectionAndReconnect() throws Exception {
        UUID doctorId = UUID.randomUUID();
        UUID patientId = UUID.randomUUID();

        String patientJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.randomUUID(), "patient@caresync.local", "Patient One", Role.PATIENT, patientId, null));
        String doctorJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.randomUUID(), "doctor@caresync.local", "Doctor One", Role.DOCTOR, null, doctorId));

        WebSocketStompClient stompClient = new WebSocketStompClient(new StandardWebSocketClient());
        stompClient.setMessageConverter(new org.springframework.messaging.converter.StringMessageConverter());

        // 1. Verify Patient connecting to native /ws endpoint
        BlockingQueue<Throwable> patientErrors = new LinkedBlockingQueue<>();
        StompHeaders patientHeaders = new StompHeaders();
        patientHeaders.add("Authorization", "Bearer " + patientJwt);

        StompSession patientSession = stompClient.connectAsync(
                        "ws://localhost:" + port + "/ws",
                        new WebSocketHttpHeaders(),
                        patientHeaders,
                        new StompSessionHandlerAdapter() {
                            @Override
                            public void handleException(StompSession s, StompCommand cmd, StompHeaders h, byte[] p, Throwable ex) {
                                patientErrors.offer(ex);
                            }

                            @Override
                            public void handleTransportError(StompSession s, Throwable ex) {
                                patientErrors.offer(ex);
                            }
                        })
                .get(5, TimeUnit.SECONDS);

        assertThat(patientSession.isConnected()).isTrue();

        try {
            // 1a. Verify client SEND frame is immediately rejected
            patientSession.send("/app/queue/" + doctorId, "payload");
            Throwable sendErr = patientErrors.poll(5, TimeUnit.SECONDS);
            assertThat(sendErr).isNotNull();
        } finally {
            try {
                patientSession.disconnect();
            } catch (Exception ignored) {
            }
        }

        // 1b. Verify Patient subscription is rejected on fresh connection
        BlockingQueue<Throwable> patientSubErrors = new LinkedBlockingQueue<>();
        StompSession patientSubSession = stompClient.connectAsync(
                        "ws://localhost:" + port + "/ws",
                        new WebSocketHttpHeaders(),
                        patientHeaders,
                        new StompSessionHandlerAdapter() {
                            @Override
                            public void handleException(StompSession s, StompCommand cmd, StompHeaders h, byte[] p, Throwable ex) {
                                patientSubErrors.offer(ex);
                            }

                            @Override
                            public void handleTransportError(StompSession s, Throwable ex) {
                                patientSubErrors.offer(ex);
                            }
                        })
                .get(5, TimeUnit.SECONDS);

        assertThat(patientSubSession.isConnected()).isTrue();

        try {
            patientSubSession.subscribe("/topic/queue/" + doctorId, new StompFrameHandler() {
                @Override
                public Type getPayloadType(StompHeaders headers) {
                    return String.class;
                }

                @Override
                public void handleFrame(StompHeaders headers, Object payload) {
                }
            });

            Throwable subErr = patientSubErrors.poll(5, TimeUnit.SECONDS);
            assertThat(subErr).isNotNull();
        } finally {
            try {
                patientSubSession.disconnect();
            } catch (Exception ignored) {
            }
        }

        // 2. Verify Reconnection as Doctor subscribing to own queue on /ws
        BlockingQueue<Throwable> doctorErrors = new LinkedBlockingQueue<>();
        StompHeaders docHeaders = new StompHeaders();
        docHeaders.add("Authorization", "Bearer " + doctorJwt);

        StompSession doctorSession = stompClient.connectAsync(
                        "ws://localhost:" + port + "/ws",
                        new WebSocketHttpHeaders(),
                        docHeaders,
                        new StompSessionHandlerAdapter() {
                            @Override
                            public void handleException(StompSession s, StompCommand cmd, StompHeaders h, byte[] p, Throwable ex) {
                                doctorErrors.offer(ex);
                            }

                            @Override
                            public void handleTransportError(StompSession s, Throwable ex) {
                                doctorErrors.offer(ex);
                            }
                        })
                .get(5, TimeUnit.SECONDS);

        assertThat(doctorSession.isConnected()).isTrue();

        try {
            doctorSession.subscribe("/topic/queue/" + doctorId, new StompFrameHandler() {
                @Override
                public Type getPayloadType(StompHeaders headers) {
                    return String.class;
                }

                @Override
                public void handleFrame(StompHeaders headers, Object payload) {
                }
            });

            // Subscription to own queue succeeds without error
            Throwable docErr = doctorErrors.poll(1, TimeUnit.SECONDS);
            assertThat(docErr).isNull();
        } finally {
            try {
                doctorSession.disconnect();
            } catch (Exception ignored) {
            }
        }
    }

    @Test
    void sockJsEndpointAcceptsInfoProbeAndEstablishesStompSession() throws Exception {
        // 1. Verify SockJS /ws/info HTTP GET endpoint
        mockMvc.perform(get("/ws/info"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.websocket").value(true));

        // 2. Verify SockJS client transport handshake & STOMP subscription
        UUID doctorId = UUID.randomUUID();
        String doctorJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.randomUUID(), "doc.sockjs@caresync.local", "Dr. SockJS", Role.DOCTOR, null, doctorId));

        List<Transport> transports = List.of(new WebSocketTransport(new StandardWebSocketClient()));
        SockJsClient sockJsClient = new SockJsClient(transports);
        WebSocketStompClient stompClient = new WebSocketStompClient(sockJsClient);
        stompClient.setMessageConverter(new org.springframework.messaging.converter.StringMessageConverter());

        StompHeaders connectHeaders = new StompHeaders();
        connectHeaders.add("Authorization", "Bearer " + doctorJwt);

        StompSession session = stompClient.connectAsync(
                        "http://localhost:" + port + "/ws",
                        new WebSocketHttpHeaders(),
                        connectHeaders,
                        new StompSessionHandlerAdapter() {})
                .get(5, TimeUnit.SECONDS);

        assertThat(session.isConnected()).isTrue();

        try {
            session.subscribe("/topic/queue/" + doctorId, new StompFrameHandler() {
                @Override
                public Type getPayloadType(StompHeaders headers) {
                    return String.class;
                }

                @Override
                public void handleFrame(StompHeaders headers, Object payload) {
                }
            });
        } finally {
            try {
                session.disconnect();
            } catch (Exception ignored) {
            }
            sockJsClient.stop();
        }
    }

    @Test
    void webSocketAllowedOriginsEnforcedForNativeAndSockJsEndpoints() throws Exception {
        // 1. SockJS origin checks on /ws/info
        // Allowed local origin
        mockMvc.perform(get("/ws/info").header("Origin", "http://localhost:5173"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:5173"));

        // Configured production origin
        mockMvc.perform(get("/ws/info").header("Origin", "https://test.pages.dev"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "https://test.pages.dev"));

        // Unapproved origin rejected with HTTP 403
        mockMvc.perform(get("/ws/info").header("Origin", "https://unauthorized-domain.com"))
                .andExpect(status().isForbidden());

        // 2. Native WebSocket handshake origin checks
        WebSocketStompClient stompClient = new WebSocketStompClient(new StandardWebSocketClient());
        stompClient.setMessageConverter(new org.springframework.messaging.converter.StringMessageConverter());

        UUID doctorId = UUID.randomUUID();
        String doctorJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.randomUUID(), "doc.origin@caresync.local", "Dr. Origin", Role.DOCTOR, null, doctorId));
        StompHeaders connectHeaders = new StompHeaders();
        connectHeaders.add("Authorization", "Bearer " + doctorJwt);

        // 2a. Allowed local origin connects successfully
        WebSocketHttpHeaders localOriginHeaders = new WebSocketHttpHeaders();
        localOriginHeaders.setOrigin("http://localhost:5173");
        StompSession localSession = stompClient.connectAsync(
                        "ws://localhost:" + port + "/ws",
                        localOriginHeaders,
                        connectHeaders,
                        new StompSessionHandlerAdapter() {})
                .get(5, TimeUnit.SECONDS);
        assertThat(localSession.isConnected()).isTrue();
        localSession.disconnect();

        // 2b. Configured production origin connects successfully
        WebSocketHttpHeaders prodOriginHeaders = new WebSocketHttpHeaders();
        prodOriginHeaders.setOrigin("https://test.pages.dev");
        StompSession prodSession = stompClient.connectAsync(
                        "ws://localhost:" + port + "/ws",
                        prodOriginHeaders,
                        connectHeaders,
                        new StompSessionHandlerAdapter() {})
                .get(5, TimeUnit.SECONDS);
        assertThat(prodSession.isConnected()).isTrue();
        prodSession.disconnect();

        // 2c. Unapproved origin handshake is rejected
        WebSocketHttpHeaders unapprovedOriginHeaders = new WebSocketHttpHeaders();
        unapprovedOriginHeaders.setOrigin("https://unauthorized-domain.com");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> {
            stompClient.connectAsync(
                            "ws://localhost:" + port + "/ws",
                            unapprovedOriginHeaders,
                            connectHeaders,
                            new StompSessionHandlerAdapter() {})
                    .get(5, TimeUnit.SECONDS);
        }).isInstanceOf(java.util.concurrent.ExecutionException.class);
    }

    @Test
    void stompConnectRequiresValidJwtToken() {
        WebSocketStompClient stompClient = new WebSocketStompClient(new StandardWebSocketClient());
        stompClient.setMessageConverter(new org.springframework.messaging.converter.StringMessageConverter());

        // 1. Missing Authorization header rejected
        StompHeaders emptyHeaders = new StompHeaders();
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> {
            stompClient.connectAsync(
                            "ws://localhost:" + port + "/ws",
                            new WebSocketHttpHeaders(),
                            emptyHeaders,
                            new StompSessionHandlerAdapter() {})
                    .get(5, TimeUnit.SECONDS);
        }).isInstanceOf(java.util.concurrent.ExecutionException.class);

        // 2. Malformed / invalid JWT rejected
        StompHeaders invalidHeaders = new StompHeaders();
        invalidHeaders.add("Authorization", "Bearer invalid.jwt.token");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> {
            stompClient.connectAsync(
                            "ws://localhost:" + port + "/ws",
                            new WebSocketHttpHeaders(),
                            invalidHeaders,
                            new StompSessionHandlerAdapter() {})
                    .get(5, TimeUnit.SECONDS);
        }).isInstanceOf(java.util.concurrent.ExecutionException.class);
    }

    @Test
    void doctorCannotSubscribeToPeerDoctorQueueAndStaffCanSubscribe() throws Exception {
        WebSocketStompClient stompClient = new WebSocketStompClient(new StandardWebSocketClient());
        stompClient.setMessageConverter(new org.springframework.messaging.converter.StringMessageConverter());

        UUID doctorA = UUID.randomUUID();
        UUID doctorB = UUID.randomUUID();

        String doctorAJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.randomUUID(), "docA@caresync.local", "Dr. A", Role.DOCTOR, null, doctorA));
        String receptionistJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.randomUUID(), "reception@caresync.local", "Desk Clerk", Role.RECEPTIONIST, null, null));

        // 1. Doctor A attempts to subscribe to Doctor B's queue -> rejected
        BlockingQueue<Throwable> doctorAErrors = new LinkedBlockingQueue<>();
        StompHeaders docAHeaders = new StompHeaders();
        docAHeaders.add("Authorization", "Bearer " + doctorAJwt);

        StompSession docASession = stompClient.connectAsync(
                        "ws://localhost:" + port + "/ws",
                        new WebSocketHttpHeaders(),
                        docAHeaders,
                        new StompSessionHandlerAdapter() {
                            @Override
                            public void handleException(StompSession s, StompCommand cmd, StompHeaders h, byte[] p, Throwable ex) {
                                doctorAErrors.offer(ex);
                            }

                            @Override
                            public void handleTransportError(StompSession s, Throwable ex) {
                                doctorAErrors.offer(ex);
                            }
                        })
                .get(5, TimeUnit.SECONDS);

        assertThat(docASession.isConnected()).isTrue();
        try {
            docASession.subscribe("/topic/queue/" + doctorB, new StompFrameHandler() {
                @Override
                public Type getPayloadType(StompHeaders headers) {
                    return String.class;
                }

                @Override
                public void handleFrame(StompHeaders headers, Object payload) {}
            });

            Throwable err = doctorAErrors.poll(5, TimeUnit.SECONDS);
            assertThat(err).isNotNull();
        } finally {
            try {
                docASession.disconnect();
            } catch (Exception ignored) {}
        }

        // 2. Receptionist subscribes to Doctor B's queue -> permitted
        BlockingQueue<Throwable> recErrors = new LinkedBlockingQueue<>();
        StompHeaders recHeaders = new StompHeaders();
        recHeaders.add("Authorization", "Bearer " + receptionistJwt);

        StompSession recSession = stompClient.connectAsync(
                        "ws://localhost:" + port + "/ws",
                        new WebSocketHttpHeaders(),
                        recHeaders,
                        new StompSessionHandlerAdapter() {
                            @Override
                            public void handleException(StompSession s, StompCommand cmd, StompHeaders h, byte[] p, Throwable ex) {
                                recErrors.offer(ex);
                            }

                            @Override
                            public void handleTransportError(StompSession s, Throwable ex) {
                                recErrors.offer(ex);
                            }
                        })
                .get(5, TimeUnit.SECONDS);

        assertThat(recSession.isConnected()).isTrue();
        try {
            recSession.subscribe("/topic/queue/" + doctorB, new StompFrameHandler() {
                @Override
                public Type getPayloadType(StompHeaders headers) {
                    return String.class;
                }

                @Override
                public void handleFrame(StompHeaders headers, Object payload) {}
            });

            Throwable err = recErrors.poll(1, TimeUnit.SECONDS);
            assertThat(err).isNull();
        } finally {
            try {
                recSession.disconnect();
            } catch (Exception ignored) {}
        }
    }
}
