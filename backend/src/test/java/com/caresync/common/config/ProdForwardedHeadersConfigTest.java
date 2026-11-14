package com.caresync.common.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.caresync.common.util.RequestIpUtils;
import java.util.List;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.MockHttpServletRequest;

class ProdForwardedHeadersConfigTest {

    @Test
    void prodProfileConfiguresNativeForwardedHeadersWithTrustedPrivateProxies() throws Exception {
        YamlPropertySourceLoader loader = new YamlPropertySourceLoader();
        List<PropertySource<?>> sources = loader.load(
                "application-prod", new ClassPathResource("application-prod.yml"));
        MockEnvironment env = new MockEnvironment();
        sources.forEach(ps -> env.getPropertySources().addLast(ps));

        assertThat(env.getProperty("server.forward-headers-strategy")).isEqualTo("native");
        assertThat(env.getProperty("server.tomcat.remoteip.protocol-header")).isEqualTo("X-Forwarded-Proto");
        assertThat(env.getProperty("server.tomcat.remoteip.remote-ip-header")).isEqualTo("X-Forwarded-For");

        String internalProxies = env.getProperty("server.tomcat.remoteip.internal-proxies");
        assertThat(internalProxies).isNotBlank();
        Pattern trusted = Pattern.compile(internalProxies);
        assertThat(trusted.matcher("127.0.0.1").matches()).isTrue();
        assertThat(trusted.matcher("10.12.34.56").matches()).isTrue();
        assertThat(trusted.matcher("172.16.0.1").matches()).isTrue();
        assertThat(trusted.matcher("192.168.1.5").matches()).isTrue();
        assertThat(trusted.matcher("::1").matches()).isTrue();
        assertThat(trusted.matcher("8.8.8.8").matches()).isFalse();
        assertThat(trusted.matcher("203.0.113.10").matches()).isFalse();
    }

    @Test
    void requestIpUtilsIgnoresRawUntrustedForwardedHeader() {
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.setRemoteAddr("198.51.100.42");
        req.addHeader("X-Forwarded-For", "1.2.3.4");

        assertThat(RequestIpUtils.extractClientIp(req)).isEqualTo("198.51.100.42");
    }
}
