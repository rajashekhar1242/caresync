package com.caresync.common.exception;

import org.springframework.http.HttpStatus;

public enum ErrorCode {

    // 400 Bad Request
    VALIDATION_FAILED(HttpStatus.BAD_REQUEST),
    MALFORMED_REQUEST(HttpStatus.BAD_REQUEST),
    INVALID_SCHEDULE(HttpStatus.BAD_REQUEST),
    INVALID_SLOT(HttpStatus.BAD_REQUEST),
    OUTSIDE_BOOKING_WINDOW(HttpStatus.BAD_REQUEST),
    OVERPAYMENT(HttpStatus.BAD_REQUEST),
    CREDIT_EXCEEDS_INVOICE(HttpStatus.BAD_REQUEST),

    // 401 Unauthorized
    INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED),
    TOKEN_EXPIRED(HttpStatus.UNAUTHORIZED),
    INVALID_REFRESH_TOKEN(HttpStatus.UNAUTHORIZED),
    UNAUTHORIZED(HttpStatus.UNAUTHORIZED),

    // 403 Forbidden
    ACCESS_DENIED(HttpStatus.FORBIDDEN),

    // 404 Not Found
    RESOURCE_NOT_FOUND(HttpStatus.NOT_FOUND),

    // 409 Conflict
    EMAIL_ALREADY_EXISTS(HttpStatus.CONFLICT),
    DEPARTMENT_NAME_EXISTS(HttpStatus.CONFLICT),
    LEAVE_OVERLAP(HttpStatus.CONFLICT),
    LEAVE_HAS_BOOKED_APPOINTMENTS(HttpStatus.CONFLICT),
    SLOT_ALREADY_BOOKED(HttpStatus.CONFLICT),
    DOCTOR_UNAVAILABLE(HttpStatus.CONFLICT),
    ILLEGAL_STATE_TRANSITION(HttpStatus.CONFLICT),
    CANCELLATION_WINDOW_CLOSED(HttpStatus.CONFLICT),
    TRANSITION_TOO_EARLY(HttpStatus.CONFLICT),
    CONSULTATION_INCOMPLETE(HttpStatus.CONFLICT),
    CONSULTATION_IN_PROGRESS(HttpStatus.CONFLICT),
    QUEUE_EMPTY(HttpStatus.CONFLICT),
    APPOINTMENT_NOT_IN_CONSULTATION(HttpStatus.CONFLICT),
    CONSULTATION_ALREADY_EXISTS(HttpStatus.CONFLICT),
    CONSULTATION_FINALIZED(HttpStatus.CONFLICT),
    PRESCRIPTION_ALREADY_EXISTS(HttpStatus.CONFLICT),
    SEVERE_WARNING_NOT_ACKNOWLEDGED(HttpStatus.CONFLICT),
    INVOICE_IMMUTABLE(HttpStatus.CONFLICT),
    INVOICE_NOT_PAID(HttpStatus.CONFLICT),
    INVOICE_HAS_PAYMENTS(HttpStatus.CONFLICT),
    DUPLICATE_TXN_REF(HttpStatus.CONFLICT),

    // 429 Too Many Requests
    TOO_MANY_REQUESTS(HttpStatus.TOO_MANY_REQUESTS),

    // 500 Internal Server Error
    INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR);

    private final HttpStatus httpStatus;

    ErrorCode(HttpStatus httpStatus) {
        this.httpStatus = httpStatus;
    }

    public HttpStatus getHttpStatus() {
        return httpStatus;
    }
}
