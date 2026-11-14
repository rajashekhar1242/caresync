package com.caresync.common.exception;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class ErrorResponseWriterTest {

    @Test
    void writesExactOpenApiErrorResponseShape() throws Exception {
        JsonMapper mapper = JsonMapper.builder().build();
        Clock clock = Clock.fixed(Instant.parse("2026-11-11T12:00:00Z"), ZoneOffset.UTC);
        ErrorResponseWriter writer = new ErrorResponseWriter(mapper, clock);

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/auth/me");
        MockHttpServletResponse response = new MockHttpServletResponse();

        writer.write(request, response, HttpStatus.UNAUTHORIZED, ErrorCode.TOKEN_EXPIRED, "Access token has expired");

        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(response.getContentType()).startsWith("application/json");
        JsonNode root = mapper.readTree(response.getContentAsString());
        assertThat(root.get("timestamp").asString()).isEqualTo("2026-11-11T12:00:00Z");
        assertThat(root.get("status").asInt()).isEqualTo(401);
        assertThat(root.get("code").asString()).isEqualTo("TOKEN_EXPIRED");
        assertThat(root.get("message").asString()).isEqualTo("Access token has expired");
        assertThat(root.get("path").asString()).isEqualTo("/api/auth/me");
        assertThat(root.get("fieldErrors").isArray()).isTrue();
        assertThat(root.get("fieldErrors")).isEmpty();
    }
}
