package com.caresync.doctor.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.caresync.appointment.controller.SlotController;
import com.caresync.appointment.dto.SlotListResponse;
import com.caresync.appointment.service.SlotService;
import com.caresync.auth.entity.Role;
import com.caresync.common.config.RateLimitFilter;
import com.caresync.common.security.JwtService;
import com.caresync.common.security.UserPrincipal;
import com.caresync.doctor.dto.LeaveResponse;
import com.caresync.doctor.dto.WeeklyScheduleResponse;
import com.caresync.doctor.service.LeaveService;
import com.caresync.doctor.service.ScheduleService;
import com.caresync.testsupport.SecuritySliceTestConfig;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest({ScheduleController.class, LeaveController.class, SlotController.class})
@ActiveProfiles("test")
@Import(SecuritySliceTestConfig.class)
class ScheduleLeaveSlotControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private RateLimitFilter rateLimitFilter;

    @MockitoBean
    private ScheduleService scheduleService;

    @MockitoBean
    private LeaveService leaveService;

    @MockitoBean
    private SlotService slotService;

    @BeforeEach
    void resetLimits() {
        rateLimitFilter.clearBuckets();
    }

    @Test
    void enforcesRoleMatrixAndValidationAcrossSchedulesLeavesAndSlots() throws Exception {
        UUID doctorId = UUID.randomUUID();
        UUID leaveId = UUID.randomUUID();
        String patientJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.randomUUID(), "pat@caresync.local", "Pat", Role.PATIENT, UUID.randomUUID(), null));
        String receptionistJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.randomUUID(), "rec@caresync.local", "Rec", Role.RECEPTIONIST, null, null));
        String doctorJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.randomUUID(), "dr@caresync.local", "Dr. Rao", Role.DOCTOR, null, doctorId));

        mockMvc.perform(get("/api/doctors/{id}/schedules", doctorId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + patientJwt))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

        mockMvc.perform(put("/api/doctors/{id}/schedules", doctorId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"entries":[]}
                                """))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/api/doctors/{id}/leaves", doctorId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"startDate":"2026-11-20","endDate":"2026-11-21"}
                                """))
                .andExpect(status().isForbidden());

        when(scheduleService.replaceSchedule(any(), any(), any()))
                .thenReturn(new WeeklyScheduleResponse(doctorId, List.of()));
        mockMvc.perform(put("/api/doctors/{id}/schedules", doctorId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + doctorJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"entries":[{"dayOfWeek":"MONDAY","startTime":"25:00","endTime":"13:00"}]}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));

        when(leaveService.createLeave(any(), any(), any()))
                .thenReturn(new LeaveResponse(leaveId, doctorId, LocalDate.of(2026, 11, 20), LocalDate.of(2026, 11, 21), "Conf", Instant.now()));
        mockMvc.perform(post("/api/doctors/{id}/leaves", doctorId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + doctorJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"startDate":"2026-11-20","endDate":"2026-11-21","reason":"Conf"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(leaveId.toString()));

        mockMvc.perform(delete("/api/doctors/{id}/leaves/{leaveId}", doctorId, leaveId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + doctorJwt))
                .andExpect(status().isNoContent());

        // /slots requires ?date=
        mockMvc.perform(get("/api/doctors/{id}/slots", doctorId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + patientJwt))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));

        when(slotService.listDoctorSlots(any(), any(), any()))
                .thenReturn(new SlotListResponse(doctorId, UUID.randomUUID(), "Asia/Kolkata", LocalDate.of(2026, 11, 20), 15, null, List.of()));
        mockMvc.perform(get("/api/doctors/{id}/slots", doctorId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + patientJwt)
                        .param("date", "2026-11-20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.timeZone").value("Asia/Kolkata"));
    }

    @Test
    void validatesWeeklyScheduleNullListNullElementsEmptyAndValidPayloads() throws Exception {
        UUID doctorId = UUID.randomUUID();
        String doctorJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.randomUUID(), "dr2@caresync.local", "Dr. Rao", Role.DOCTOR, null, doctorId));

        // 1. Null entries list -> 400 VALIDATION_FAILED
        mockMvc.perform(put("/api/doctors/{id}/schedules", doctorId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + doctorJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("entries"));

        // 2. List containing a null element -> 400 VALIDATION_FAILED (no NPE)
        mockMvc.perform(put("/api/doctors/{id}/schedules", doctorId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + doctorJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"entries":[null]}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("entries[0]"));

        // 3. Invalid nested schedule entry -> 400 VALIDATION_FAILED
        mockMvc.perform(put("/api/doctors/{id}/schedules", doctorId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + doctorJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"entries":[{"dayOfWeek":"MONDAY","startTime":"bad","endTime":"12:00"}]}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));

        // 4. Empty entries list -> 200 OK
        when(scheduleService.replaceSchedule(any(), any(), any()))
                .thenReturn(new WeeklyScheduleResponse(doctorId, List.of()));
        mockMvc.perform(put("/api/doctors/{id}/schedules", doctorId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + doctorJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"entries":[]}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.doctorId").value(doctorId.toString()));

        // 5. Valid entry -> 200 OK
        mockMvc.perform(put("/api/doctors/{id}/schedules", doctorId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + doctorJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"entries":[{"dayOfWeek":"MONDAY","startTime":"09:00","endTime":"12:00"}]}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.doctorId").value(doctorId.toString()));
    }
}
