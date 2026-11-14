package com.caresync;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class Phase1BootstrapTest {

    @Test
    void javaRuntimeIsJava25() {
        assertThat(Runtime.version().feature()).isGreaterThanOrEqualTo(25);
        assertThat(CareSyncApplication.class).isNotNull();
    }
}
