package com.caresync.appointment.service;

import java.time.Instant;
import java.util.UUID;

public interface ConsultationLifecyclePort {

    void verifyReadyAndFinalize(UUID appointmentId, Instant finalizedAt);
}
