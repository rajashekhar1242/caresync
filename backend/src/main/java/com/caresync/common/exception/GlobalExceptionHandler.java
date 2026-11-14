package com.caresync.common.exception;

import com.caresync.common.dto.ErrorResponse;
import com.caresync.common.dto.FieldError;
import com.caresync.common.security.JwtAuthenticationFilter;
import com.caresync.common.security.SecurityEventLogger;
import com.caresync.common.security.SecurityUtils;
import com.caresync.common.util.RequestIpUtils;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    private final Clock clock;
    private final SecurityEventLogger securityEventLogger;

    public GlobalExceptionHandler(Clock clock, SecurityEventLogger securityEventLogger) {
        this.clock = clock;
        this.securityEventLogger = securityEventLogger;
    }

    @ExceptionHandler(CareSyncException.class)
    public ResponseEntity<ErrorResponse> handleCareSyncException(
            CareSyncException ex, HttpServletRequest request) {
        if (ex instanceof ForbiddenException || ex.getErrorCode() == ErrorCode.ACCESS_DENIED) {
            securityEventLogger.accessDenied(
                    SecurityUtils.getCurrentPrincipal().orElse(null),
                    request.getMethod(),
                    request.getRequestURI(),
                    RequestIpUtils.extractClientIp(request));
        }
        HttpHeaders headers = new HttpHeaders();
        if (ex instanceof TooManyRequestsException tooMany) {
            headers.set(HttpHeaders.RETRY_AFTER, String.valueOf(tooMany.getRetryAfterSeconds()));
        }
        ErrorResponse body = new ErrorResponse(
                Instant.now(clock),
                ex.getHttpStatus().value(),
                ex.getErrorCode().name(),
                ex.getMessage(),
                request.getRequestURI(),
                ex.getFieldErrors());
        return new ResponseEntity<>(body, headers, ex.getHttpStatus());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleMethodArgumentNotValid(
            MethodArgumentNotValidException ex, HttpServletRequest request) {
        List<FieldError> fieldErrors = new ArrayList<>();
        ex.getBindingResult().getFieldErrors().forEach(fe ->
                fieldErrors.add(new FieldError(fe.getField(), fe.getDefaultMessage())));
        ex.getBindingResult().getGlobalErrors().forEach(ge ->
                fieldErrors.add(new FieldError(ge.getObjectName(), ge.getDefaultMessage())));
        fieldErrors.sort(Comparator.comparing(FieldError::field).thenComparing(FieldError::message));

        return buildResponse(
                HttpStatus.BAD_REQUEST,
                ErrorCode.VALIDATION_FAILED,
                "Request validation failed",
                request,
                fieldErrors);
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    public ResponseEntity<ErrorResponse> handleHandlerMethodValidation(
            HandlerMethodValidationException ex, HttpServletRequest request) {
        List<FieldError> fieldErrors = new ArrayList<>();
        ex.getParameterValidationResults().forEach(result -> {
            String paramName = result.getMethodParameter().getParameterName();
            String field = paramName != null ? paramName : "parameter";
            result.getResolvableErrors().forEach(err ->
                    fieldErrors.add(new FieldError(field, err.getDefaultMessage())));
        });
        fieldErrors.sort(Comparator.comparing(FieldError::field).thenComparing(FieldError::message));

        return buildResponse(
                HttpStatus.BAD_REQUEST,
                ErrorCode.VALIDATION_FAILED,
                "Request validation failed",
                request,
                fieldErrors);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ErrorResponse> handleConstraintViolation(
            ConstraintViolationException ex, HttpServletRequest request) {
        List<FieldError> fieldErrors = ex.getConstraintViolations().stream()
                .map(v -> new FieldError(extractLeafField(v), v.getMessage()))
                .sorted(Comparator.comparing(FieldError::field).thenComparing(FieldError::message))
                .toList();

        return buildResponse(
                HttpStatus.BAD_REQUEST,
                ErrorCode.VALIDATION_FAILED,
                "Request validation failed",
                request,
                fieldErrors);
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ErrorResponse> handleMissingParam(
            MissingServletRequestParameterException ex, HttpServletRequest request) {
        return buildResponse(
                HttpStatus.BAD_REQUEST,
                ErrorCode.VALIDATION_FAILED,
                "Request validation failed",
                request,
                List.of(new FieldError(ex.getParameterName(), "is required")));
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
    public ResponseEntity<ErrorResponse> handleMalformedRequest(
            Exception ex, HttpServletRequest request) {
        return buildResponse(
                HttpStatus.BAD_REQUEST,
                ErrorCode.MALFORMED_REQUEST,
                "Request body or parameter is missing or malformed",
                request,
                List.of());
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(
            NoResourceFoundException ex, HttpServletRequest request) {
        return buildResponse(
                HttpStatus.NOT_FOUND,
                ErrorCode.RESOURCE_NOT_FOUND,
                "Resource not found",
                request,
                List.of());
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ErrorResponse> handleAccessDenied(
            AccessDeniedException ex, HttpServletRequest request) {
        securityEventLogger.accessDenied(
                SecurityUtils.getCurrentPrincipal().orElse(null),
                request.getMethod(),
                request.getRequestURI(),
                RequestIpUtils.extractClientIp(request));
        return buildResponse(
                HttpStatus.FORBIDDEN,
                ErrorCode.ACCESS_DENIED,
                "You do not have permission to perform this action",
                request,
                List.of());
    }

    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<ErrorResponse> handleAuthenticationException(
            AuthenticationException ex, HttpServletRequest request) {
        Object attr = request.getAttribute(JwtAuthenticationFilter.AUTH_ERROR_CODE_ATTR);
        ErrorCode code = attr instanceof ErrorCode c ? c : ErrorCode.UNAUTHORIZED;
        String message = code == ErrorCode.TOKEN_EXPIRED
                ? "Access token has expired"
                : "Authentication required";
        securityEventLogger.unauthorizedAccess(
                request.getMethod(),
                request.getRequestURI(),
                code.name(),
                RequestIpUtils.extractClientIp(request));
        return buildResponse(
                HttpStatus.UNAUTHORIZED,
                code,
                message,
                request,
                List.of());
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ErrorResponse> handleMethodNotSupported(
            HttpRequestMethodNotSupportedException ex, HttpServletRequest request) {
        return buildResponse(
                HttpStatus.METHOD_NOT_ALLOWED,
                ErrorCode.MALFORMED_REQUEST,
                "HTTP method not supported for this endpoint",
                request,
                List.of());
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<ErrorResponse> handleUnsupportedMediaType(
            HttpMediaTypeNotSupportedException ex, HttpServletRequest request) {
        return buildResponse(
                HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                ErrorCode.MALFORMED_REQUEST,
                "Unsupported content type",
                request,
                List.of());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleUnexpected(
            Exception ex, HttpServletRequest request) {
        Throwable rootCause = unwrapRootCause(ex);
        log.error(
                "Unhandled exception method={} path={} type={} rootCauseType={} location={}",
                sanitizeLogToken(request.getMethod()),
                sanitizeLogToken(request.getRequestURI()),
                ex.getClass().getName(),
                rootCause == ex ? "none" : rootCause.getClass().getName(),
                formatDiagnosticFrame(ex));
        return buildResponse(
                HttpStatus.INTERNAL_SERVER_ERROR,
                ErrorCode.INTERNAL_ERROR,
                "An unexpected internal error occurred",
                request,
                List.of());
    }

    private Throwable unwrapRootCause(Throwable throwable) {
        Throwable current = throwable;
        int depth = 0;
        while (current.getCause() != null && current.getCause() != current && depth < 16) {
            current = current.getCause();
            depth++;
        }
        return current;
    }

    private String formatDiagnosticFrame(Throwable throwable) {
        StackTraceElement[] frames = throwable.getStackTrace();
        if (frames == null || frames.length == 0) {
            return "unknown";
        }
        for (StackTraceElement frame : frames) {
            if (frame.getClassName().startsWith("com.caresync.")) {
                return frame.getClassName() + "#" + frame.getMethodName() + ":" + frame.getLineNumber();
            }
        }
        StackTraceElement top = frames[0];
        return top.getClassName() + "#" + top.getMethodName() + ":" + top.getLineNumber();
    }

    private String sanitizeLogToken(String value) {
        if (value == null || value.isBlank()) {
            return "unknown";
        }
        return value.replaceAll("[\\r\\n\\s]", "");
    }

    private ResponseEntity<ErrorResponse> buildResponse(
            HttpStatus status,
            ErrorCode code,
            String message,
            HttpServletRequest request,
            List<FieldError> fieldErrors) {
        ErrorResponse body = new ErrorResponse(
                Instant.now(clock),
                status.value(),
                code.name(),
                message,
                request.getRequestURI(),
                fieldErrors);
        return ResponseEntity.status(status).body(body);
    }

    private String extractLeafField(ConstraintViolation<?> violation) {
        String path = violation.getPropertyPath().toString();
        int idx = path.lastIndexOf('.');
        return idx >= 0 ? path.substring(idx + 1) : path;
    }
}
