# CareSync Frontend - Production Container Definition
# Multi-stage build: Vite Node.js build -> Alpine Nginx runtime

FROM node:22-alpine AS builder
WORKDIR /workspace

# Install dependencies with lockfile caching
COPY package.json package-lock.json ./
RUN npm ci

# Copy sources and compile production bundle
COPY . .
RUN npm run build

# Production Static File Server
FROM nginx:1.27-alpine
LABEL maintainer="CareSync Engineering <ops@caresync.health>"

# Copy custom Nginx configuration
COPY ./nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled static assets from builder stage
COPY --from=builder /workspace/dist /usr/share/nginx/html

EXPOSE 80 443

HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget --spider -q http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
