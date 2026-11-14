package com.caresync.common.exception;

public class ConflictException extends CareSyncException {

    public ConflictException(ErrorCode errorCode, String message) {
        super(errorCode, message);
    }
}
