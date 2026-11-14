package com.caresync.auth.service;

import java.util.Optional;
import java.util.UUID;

/**
 * Port linking auth accounts to doctor and patient profile IDs without cross-module JPA coupling.
 */
public interface ProfileLinkPort {

    UUID createPatientProfile(UUID userId, String fullName, String email, String phone);

    Optional<UUID> findPatientIdByUserId(UUID userId);

    Optional<UUID> findDoctorIdByUserId(UUID userId);
}
