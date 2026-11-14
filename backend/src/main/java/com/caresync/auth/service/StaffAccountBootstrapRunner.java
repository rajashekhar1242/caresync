package com.caresync.auth.service;

import com.caresync.auth.entity.Role;
import com.caresync.auth.entity.User;
import com.caresync.auth.repository.UserRepository;
import com.caresync.common.config.CareSyncProperties;
import java.time.Clock;
import java.time.Instant;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Bootstraps initial ADMIN and RECEPTIONIST accounts when environment-supplied passwords are present.
 * Leaves seeded accounts locked if no password is provided, avoiding predictable credentials.
 */
@Component
public class StaffAccountBootstrapRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(StaffAccountBootstrapRunner.class);
    private static final String LOCKED_SENTINEL = "!LOCKED_REQUIRES_BOOTSTRAP!";
    private static final UUID ADMIN_SEED_ID = UUID.fromString("00000000-0000-4000-8000-000000000001");
    private static final UUID RECEPTIONIST_SEED_ID = UUID.fromString("00000000-0000-4000-8000-000000000002");

    private final CareSyncProperties properties;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final Clock clock;

    public StaffAccountBootstrapRunner(
            CareSyncProperties properties,
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            Clock clock) {
        this.properties = properties;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.clock = clock;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        CareSyncProperties.Bootstrap bootstrap = properties.bootstrap();
        if (bootstrap == null) {
            log.warn("StaffAccountBootstrapRunner: bootstrap configuration is null; skipping staff bootstrap");
            return;
        }
        log.info("StaffAccountBootstrapRunner executing: admin seed present={}, receptionist seed present={}",
                bootstrap.admin() != null, bootstrap.receptionist() != null);
        bootstrapAccount(
                bootstrap.admin(),
                ADMIN_SEED_ID,
                Role.ADMIN,
                "System Administrator");
        bootstrapAccount(
                bootstrap.receptionist(),
                RECEPTIONIST_SEED_ID,
                Role.RECEPTIONIST,
                "Front Desk Receptionist");

        if (bootstrap.demo() != null) {
            bootstrapDemoRole(Role.DOCTOR, bootstrap.demo().doctorPassword());
            bootstrapDemoRole(Role.PATIENT, bootstrap.demo().patientPassword());
        }
    }

    private void bootstrapDemoRole(Role role, String password) {
        if (password == null || password.isBlank()) {
            log.info("Demo password not configured for role={}; seeded accounts remain locked", role);
            return;
        }

        java.util.List<User> lockedUsers = userRepository.findAll().stream()
                .filter(u -> u.getRole() == role && LOCKED_SENTINEL.equals(u.getPasswordHash()))
                .toList();
        if (!lockedUsers.isEmpty()) {
            String encoded = passwordEncoder.encode(password);
            for (User user : lockedUsers) {
                user.setPasswordHash(encoded);
                userRepository.save(user);
                log.info("Bootstrapped credentials for seeded role={} userId={}", role, user.getId());
            }
        }
    }

    private void bootstrapAccount(
            CareSyncProperties.Bootstrap.StaffSeed seed,
            UUID seedId,
            Role role,
            String defaultFullName) {
        if (seed == null || seed.email() == null || seed.email().isBlank()) {
            return;
        }
        if (seed.password() == null || seed.password().isBlank()) {
            log.info("Bootstrap password not configured for role={}; account remains locked", role);
            return;
        }

        String normalizedEmail = seed.email().trim().toLowerCase(Locale.ROOT);
        String encoded = passwordEncoder.encode(seed.password());

        Optional<User> existingByEmail = userRepository.findByEmailIgnoreCase(normalizedEmail);
        if (existingByEmail.isPresent()) {
            User user = existingByEmail.get();
            if (LOCKED_SENTINEL.equals(user.getPasswordHash())) {
                user.setPasswordHash(encoded);
                userRepository.save(user);
                log.info("Bootstrapped credentials for seeded role={} userId={}", role, user.getId());
            }
            return;
        }

        Optional<User> existingSeed = userRepository.findById(seedId);
        if (existingSeed.isPresent() && LOCKED_SENTINEL.equals(existingSeed.get().getPasswordHash())) {
            User seedUser = existingSeed.get();
            seedUser.setEmail(normalizedEmail);
            seedUser.setPasswordHash(encoded);
            userRepository.save(seedUser);
            log.info("Bootstrapped seeded role={} userId={} with configured email", role, seedUser.getId());
            return;
        }

        User created = new User(
                UUID.randomUUID(),
                normalizedEmail,
                encoded,
                defaultFullName,
                role,
                Instant.now(clock));
        userRepository.save(created);
        log.info("Created bootstrapped staff account role={} userId={}", role, created.getId());
    }
}
