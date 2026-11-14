package com.caresync.common.exception;

public class ForbiddenException extends CareSyncException {

    public ForbiddenException() {
        super(ErrorCode.ACCESS_DENIED, "You do not have permission to perform this action");
    }

    public ForbiddenException(String message) {
        super(ErrorCode.ACCESS_DENIED, message);
    }
}
