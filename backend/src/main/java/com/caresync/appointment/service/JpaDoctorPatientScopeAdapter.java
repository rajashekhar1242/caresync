package com.caresync.appointment.service;

import com.caresync.appointment.entity.Appointment;
import com.caresync.appointment.entity.AppointmentStatus;
import com.caresync.appointment.repository.AppointmentRepository;
import com.caresync.patient.entity.Patient;
import com.caresync.patient.service.DoctorPatientScopePort;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Subquery;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
class JpaDoctorPatientScopeAdapter implements DoctorPatientScopePort {

    private final AppointmentRepository appointmentRepository;

    JpaDoctorPatientScopeAdapter(AppointmentRepository appointmentRepository) {
        this.appointmentRepository = appointmentRepository;
    }

    @Override
    public boolean hasNonCancelledAppointment(UUID doctorId, UUID patientId) {
        return appointmentRepository.existsByDoctor_IdAndPatient_IdAndStatusNot(
                doctorId, patientId, AppointmentStatus.CANCELLED);
    }

    @Override
    public Predicate doctorOwnPatientPredicate(
            Root<Patient> root,
            CriteriaQuery<?> query,
            CriteriaBuilder cb,
            UUID doctorId) {
        Subquery<Integer> subquery = query.subquery(Integer.class);
        Root<Appointment> appointment = subquery.from(Appointment.class);
        subquery.select(cb.literal(1)).where(
                cb.equal(appointment.get("doctor").get("id"), doctorId),
                cb.equal(appointment.get("patient").get("id"), root.get("id")),
                cb.notEqual(appointment.get("status"), AppointmentStatus.CANCELLED));
        return cb.exists(subquery);
    }
}
