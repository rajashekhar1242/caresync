package com.caresync.common.exception;

public class UnauthorizedException extends CareSyncException {

    public UnauthorizedException(ErrorCode errorCode, String message) {
        super(errorCode, message);
    }
}
