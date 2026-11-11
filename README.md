# DEXFuckers Community Chat

The chat UI remains in the main DEXFuckers Next.js site at `/chat/`. This repository contains only the independent Cloudflare Worker backend.

## Modes

- Public room: all connected visitors in the global room can exchange text messages.
- Random 1:1: visitors are paired FIFO. "Next Person" leaves the current pair and joins the waiting queue.
- No wallet connection, account, media upload, or message history is required.

## Deploy

This repository is the Worker project root. In Cloudflare Workers Builds use:

- Production branch: `main`
- Root directory: `/` (repository root)
- Build command: leave blank
- Deploy command: `npx wrangler deploy`
- Version command: leave blank

Or deploy manually from the repository root:

```bash
npx wrangler deploy
```

The Worker creates a Durable Object binding named `CHAT_HUB` and a SQLite-backed class migration in `wrangler.toml`. Deploy it once to apply the initial migration.

## Health check

```
GET https://<your-chat-worker>.<your-account-subdomain>.workers.dev/health
```

Expected response:

```json
{"ok":true,"service":"dexfuckers-chat","realtime":"websocket"}
```

## WebSocket endpoints

```
wss://<your-chat-worker>.<your-account-subdomain>.workers.dev/ws?mode=public&nickname=Guest
wss://<your-chat-worker>.<your-account-subdomain>.workers.dev/ws?mode=random&nickname=Guest
```

## Frontend configuration

The frontend remains in the main DEXFuckers repository. Set this Cloudflare Pages build environment variable there:

```env
NEXT_PUBLIC_CHAT_WS_URL=wss://<your-chat-worker>.<your-account-subdomain>.workers.dev/ws
```

Changing this variable requires a new Pages build.

## Security and operational notes

- The Worker accepts browser connections from `https://dexfuckers.com`, `https://www.dexfuckers.com`, `http://localhost:3000`, and HTTPS Cloudflare Pages preview hostnames under `dexfuckers.pages.dev`.
- Messages are plain text, limited to 500 characters, and rate-limited per socket.
- The server does not persist public or private chat messages.
- Anonymous 1:1 reports are stored in Durable Object storage. A production moderation workflow and report-review interface are still required before broad public launch.
- Anonymous identity is session-scoped, not proof of a unique person. Users can evade session-level blocks by reconnecting or changing browsers.
- Do not ask users for seed phrases, private keys, or funds. Chat content is user-generated and should not be treated as verified token research.

## MVP limitations

- One global public room and one global matchmaking queue.
- No chat history, attachments, voice, or video.
- No admin moderation dashboard yet.
