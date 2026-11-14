package com.caresync.auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.caresync.auth.entity.Role;
import com.caresync.auth.entity.User;
import com.caresync.auth.repository.UserRepository;
import com.caresync.common.config.CareSyncProperties;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

@ExtendWith(MockitoExtension.class)
class StaffAccountBootstrapRunnerTest {

    private static final Instant FIXED_NOW = Instant.parse("2026-11-11T10:00:00Z");

    @Mock
    private UserRepository userRepository;

    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder(4);
    private final Clock clock = Clock.fixed(FIXED_NOW, ZoneOffset.UTC);

    @Test
    void leavesAccountsLockedWhenPasswordsAreUnset() {
        CareSyncProperties props = new CareSyncProperties(
                null,
                new CareSyncProperties.Cors(List.of()),
                null,
                null,
                new CareSyncProperties.Bootstrap(
                        new CareSyncProperties.Bootstrap.StaffSeed("admin@caresync.local", ""),
                        new CareSyncProperties.Bootstrap.StaffSeed("reception@caresync.local", null),
                        null));

        StaffAccountBootstrapRunner runner = new StaffAccountBootstrapRunner(
                props, userRepository, passwordEncoder, clock);

        runner.run(new DefaultApplicationArguments());

        verify(userRepository, never()).save(any());
    }

    @Test
    void replacesLockedSentinelWithBcryptHashWhenPasswordProvided() {
        UUID adminSeedId = UUID.fromString("00000000-0000-4000-8000-000000000001");
        User seededAdmin = new User(
                adminSeedId,
                "admin@caresync.local",
                "!LOCKED_REQUIRES_BOOTSTRAP!",
                "System Administrator",
                Role.ADMIN,
                FIXED_NOW);
        when(userRepository.findByEmailIgnoreCase("admin@caresync.local")).thenReturn(Optional.of(seededAdmin));

        CareSyncProperties props = new CareSyncProperties(
                null,
                new CareSyncProperties.Cors(List.of()),
                null,
                null,
                new CareSyncProperties.Bootstrap(
                        new CareSyncProperties.Bootstrap.StaffSeed("admin@caresync.local", "CustomStrong!Pass1"),
                        new CareSyncProperties.Bootstrap.StaffSeed("reception@caresync.local", ""),
                        null));

        StaffAccountBootstrapRunner runner = new StaffAccountBootstrapRunner(
                props, userRepository, passwordEncoder, clock);

        runner.run(new DefaultApplicationArguments());

        verify(userRepository).save(seededAdmin);
        assertThat(seededAdmin.getPasswordHash()).startsWith("$2");
        assertThat(passwordEncoder.matches("CustomStrong!Pass1", seededAdmin.getPasswordHash())).isTrue();
    }

    @Test
    void bootstrapsDemoAccountsWhenPasswordsProvided() {
        UUID docUserId = UUID.fromString("00000000-0000-4000-8000-000000000101");
        User lockedDoc = new User(
                docUserId,
                "dr.jenkins@caresync.local",
                "!LOCKED_REQUIRES_BOOTSTRAP!",
                "Dr. Sarah Jenkins",
                Role.DOCTOR,
                FIXED_NOW);
        when(userRepository.findAll()).thenReturn(List.of(lockedDoc));

        CareSyncProperties props = new CareSyncProperties(
                null,
                new CareSyncProperties.Cors(List.of()),
                null,
                null,
                new CareSyncProperties.Bootstrap(
                        new CareSyncProperties.Bootstrap.StaffSeed("admin@caresync.local", ""),
                        new CareSyncProperties.Bootstrap.StaffSeed("reception@caresync.local", ""),
                        new CareSyncProperties.Bootstrap.DemoSeed("CustomDocPass!123", "")));

        StaffAccountBootstrapRunner runner = new StaffAccountBootstrapRunner(
                props, userRepository, passwordEncoder, clock);

        runner.run(new DefaultApplicationArguments());

        verify(userRepository).save(lockedDoc);
        assertThat(lockedDoc.getPasswordHash()).startsWith("$2");
        assertThat(passwordEncoder.matches("CustomDocPass!123", lockedDoc.getPasswordHash())).isTrue();
    }
}
