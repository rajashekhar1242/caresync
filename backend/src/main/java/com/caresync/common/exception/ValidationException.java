package com.caresync.common.exception;

import com.caresync.common.dto.FieldError;
import java.util.List;

public class ValidationException extends CareSyncException {

    public ValidationException(String message) {
        super(ErrorCode.VALIDATION_FAILED, message);
    }

    public ValidationException(String field, String fieldMessage) {
        super(ErrorCode.VALIDATION_FAILED, "Request validation failed", List.of(new FieldError(field, fieldMessage)));
    }

    public ValidationException(ErrorCode errorCode, String message) {
        super(errorCode, message);
    }

    public ValidationException(ErrorCode errorCode, String message, List<FieldError> fieldErrors) {
        super(errorCode, message, fieldErrors);
    }
}
