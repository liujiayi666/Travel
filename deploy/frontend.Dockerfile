FROM node:24-alpine AS frontend-build

WORKDIR /workspace/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM caddy:2.10-alpine

COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=frontend-build /workspace/frontend/dist /srv

RUN caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

EXPOSE 80 443 443/udp

HEALTHCHECK \
    --interval=10s \
    --timeout=3s \
    --start-period=10s \
    --retries=3 \
    CMD ["wget", "-q", "--spider", "http://127.0.0.1:2019/config/"]
