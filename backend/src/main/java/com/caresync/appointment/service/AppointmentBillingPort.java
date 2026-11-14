package com.caresync.appointment.service;

import com.caresync.appointment.entity.Appointment;
import java.time.Instant;

public interface AppointmentBillingPort {

    void createConsultationInvoice(Appointment appointment, Instant createdAt);
}
