# syntax=docker/dockerfile:1

# The exported web app is architecture-independent. Build it once on the
# native GitHub runner instead of repeating npm/Next.js under arm64 QEMU.
FROM --platform=$BUILDPLATFORM node:22-alpine AS builder

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV STATIC_EXPORT=true

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && npm run verify:static-worker-assets

FROM nginx:stable-alpine AS runner

COPY deploy/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/.next-export /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O - http://127.0.0.1/healthz | grep -q '^ok$' || exit 1

CMD ["nginx", "-g", "daemon off;"]
