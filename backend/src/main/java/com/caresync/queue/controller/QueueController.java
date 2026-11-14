package com.caresync.queue.controller;

import com.caresync.common.security.SecurityUtils;
import com.caresync.queue.dto.QueueBoardResponse;
import com.caresync.queue.dto.QueueStateResponse;
import com.caresync.queue.service.QueueService;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/queue")
@Validated
public class QueueController {

    private final QueueService queueService;

    public QueueController(QueueService queueService) {
        this.queueService = queueService;
    }

    @GetMapping("/doctors/{doctorId}")
    public QueueStateResponse getDoctorQueue(@PathVariable UUID doctorId) {
        return queueService.getDoctorQueue(SecurityUtils.requireCurrentPrincipal(), doctorId);
    }

    @PostMapping("/doctors/{doctorId}/call-next")
    public QueueStateResponse callNext(@PathVariable UUID doctorId) {
        return queueService.callNext(SecurityUtils.requireCurrentPrincipal(), doctorId);
    }

    @GetMapping("/board")
    public ResponseEntity<QueueBoardResponse> getQueueBoard(@RequestParam UUID clinicId) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(queueService.getQueueBoard(clinicId));
    }
}
