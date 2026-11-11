# DEXFuckers Community Chat

The chat UI remains in the main DEXFuckers Next.js site at `/chat/`. This repository contains only the independent Cloudflare Worker backend.

## Deploy

This repository is a standalone npm Worker project. Cloudflare Workers Builds settings:

- Production branch: `main`
- Root directory: `/`
- Build command: leave blank
- Deploy command: `npm run deploy`
- Version command: leave blank

The repository includes `package.json` with a local Wrangler dependency and a deploy script. Workers Builds should install the declared dependency and run the script; do not rely on an unpinned transient `npx wrangler` install.

The Worker configuration is `wrangler.toml`. It declares the `CHAT_HUB` Durable Object binding and the initial SQLite-backed class migration. Keep the binding and migration names stable.

## Health check

`GET https://dexfuckers-chat.pcaticom.workers.dev/health`

Expected response:

```json
{"ok":true,"service":"dexfuckers-chat","realtime":"websocket"}
```

## WebSocket endpoints

```
wss://dexfuckers-chat.pcaticom.workers.dev/ws?mode=public&nickname=Guest
wss://dexfuckers-chat.pcaticom.workers.dev/ws?mode=random&nickname=Guest
```

## Frontend

The frontend remains in the main DEXFuckers repository. Its WebSocket URL is configured with `NEXT_PUBLIC_CHAT_WS_URL`.

## Operational notes

- Messages are plain text, limited to 500 characters, and rate-limited per socket.
- Public and private chat messages are not persisted.
- Anonymous 1:1 reports are stored in Durable Object storage.
- A production moderation workflow and report-review interface are still required before broad public launch.
- Anonymous identity is session-scoped, not proof of a unique person.
- Do not ask users for seed phrases, private keys, or funds.
- MVP provides one global public room and one global random matchmaking queue; no history, attachments, voice, or video.
