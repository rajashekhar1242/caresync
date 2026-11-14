package com.caresync.patient.service;

import com.caresync.patient.entity.Patient;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import java.util.UUID;

/**
 * Encapsulates doctor-patient ownership checks backed by non-cancelled appointments without introducing a
 * package dependency from {@code patient} to {@code appointment}.
 */
public interface DoctorPatientScopePort {

    boolean hasNonCancelledAppointment(UUID doctorId, UUID patientId);

    Predicate doctorOwnPatientPredicate(
            Root<Patient> root,
            CriteriaQuery<?> query,
            CriteriaBuilder cb,
            UUID doctorId);
}
