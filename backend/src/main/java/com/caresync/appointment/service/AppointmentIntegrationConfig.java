package com.caresync.appointment.service;

import com.caresync.audit.service.AuditService;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

@Configuration
public class AppointmentIntegrationConfig {

    @Bean
    @ConditionalOnMissingBean(ConsultationLifecyclePort.class)
    public ConsultationLifecyclePort consultationLifecyclePort(
            JdbcTemplate jdbcTemplate, AuditService auditService) {
        return new JdbcConsultationLifecycleAdapter(jdbcTemplate, auditService);
    }

    @Bean
    @ConditionalOnMissingBean(AppointmentBillingPort.class)
    public AppointmentBillingPort appointmentBillingPort() {
        return (appointment, createdAt) -> {
            // Billing module (Phase 13) supplies the persistent InvoiceService bean.
        };
    }
}
