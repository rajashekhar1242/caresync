# CareSync Backend - Production Container Definition
# Multi-stage build for Java 25 Spring Boot

FROM eclipse-temurin:25-jdk-alpine AS builder
WORKDIR /workspace

# Cache Maven dependencies
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN chmod +x ./mvnw && ./mvnw dependency:go-offline -B

# Copy source and package
COPY src ./src
RUN ./mvnw clean package -DskipTests -B

# Production Runtime Image
FROM eclipse-temurin:25-jre-alpine
LABEL maintainer="CareSync Engineering <ops@caresync.health>"

# Security: Create non-root application group and user
RUN addgroup -g 10001 -S caresync && \
    adduser -u 10001 -S caresync -G caresync

WORKDIR /app

# Copy executable jar from builder
COPY --from=builder --chown=caresync:caresync /workspace/target/caresync-backend-0.1.0-SNAPSHOT.jar /app/app.jar

# Switch to non-root user
USER caresync:caresync

EXPOSE 8080

# Production JVM Flags with G1GC and Virtual Threads
ENV JAVA_OPTS="-XX:+UseG1GC -XX:MaxRAMPercentage=75.0 -Djava.security.egd=file:/dev/./urandom"

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-8080}/actuator/health/liveness || exit 1

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar /app/app.jar"]
