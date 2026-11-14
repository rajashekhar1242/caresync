package com.caresync.common.exception;

import com.caresync.common.dto.FieldError;
import java.util.List;
import org.springframework.http.HttpStatus;

public abstract class CareSyncException extends RuntimeException {

    private final ErrorCode errorCode;
    private final List<FieldError> fieldErrors;

    protected CareSyncException(ErrorCode errorCode, String message) {
        this(errorCode, message, List.of());
    }

    protected CareSyncException(ErrorCode errorCode, String message, List<FieldError> fieldErrors) {
        super(message);
        this.errorCode = errorCode;
        this.fieldErrors = fieldErrors == null ? List.of() : List.copyOf(fieldErrors);
    }

    public ErrorCode getErrorCode() {
        return errorCode;
    }

    public HttpStatus getHttpStatus() {
        return errorCode.getHttpStatus();
    }

    public List<FieldError> getFieldErrors() {
        return fieldErrors;
    }
}
