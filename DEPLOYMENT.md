# Cloudflare Worker Deployment

Cloudflare Workers Builds settings for this repository:

- Repository: `Adakgunju/dexfuckers-chat`
- Production branch: `main`
- Root directory: `/`
- Build command: leave blank
- Deploy command: `npm run deploy`
- Version command: leave blank

The repository now contains a `package.json` with a local Wrangler dependency and a deploy script. Workers Builds should install project dependencies and use the local Wrangler version rather than downloading an unpinned CLI at deploy time.

The Wrangler configuration is `wrangler.toml`. It declares the `CHAT_HUB` Durable Object binding and the initial SQLite-backed Durable Object migration. Do not rename or remove either.

Expected endpoints after a successful deployment:

- Health check: `https://dexfuckers-chat.pcaticom.workers.dev/health`
- WebSocket: `wss://dexfuckers-chat.pcaticom.workers.dev/ws`

The health endpoint should return JSON with `ok: true`, `service: "dexfuckers-chat"`, and `realtime: "websocket"`.
