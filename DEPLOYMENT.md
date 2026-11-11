# Cloudflare Worker Deployment

This repository deploys the `dexfuckers-chat` Worker.

## Cloudflare Workers Builds

- Repository: `Adakgunju/dexfuckers-chat`
- Production branch: `main`
- Root directory: `/`
- Build command: leave empty
- Deploy command: `npx wrangler deploy`
- Version command: leave empty

The Worker configuration is in `wrangler.toml`. It declares the `CHAT_HUB` Durable Object binding and the initial SQLite-backed Durable Object migration. Do not remove or rename the binding or migration when deploying.

## Expected deployment

A successful deployment should publish `dexfuckers-chat` and expose:

- Health check: `https://dexfuckers-chat.pcaticom.workers.dev/health`
- WebSocket endpoint: `wss://dexfuckers-chat.pcaticom.workers.dev/ws`

The health endpoint should return JSON with `ok: true`, `service: "dexfuckers-chat"`, and `realtime: "websocket"`.
