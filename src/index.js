const ALLOWED_ORIGINS = new Set([
  "https://dexfuckers.com",
  "https://www.dexfuckers.com",
  "http://localhost:3000",
]);

function isAllowedOrigin(origin) {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "https:" &&
      (parsed.hostname === "dexfuckers.pages.dev" ||
        parsed.hostname.endsWith(".dexfuckers.pages.dev"));
  } catch {
    return false;
  }
}

const MAX_MESSAGE_LENGTH = 500;
const MESSAGE_WINDOW_MS = 5000;
const MESSAGE_WINDOW_LIMIT = 8;

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function safeNickname(value) {
  const nickname = String(value || "Anonymous")
    .replace(/[<>\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 20);
  return nickname || "Anonymous";
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({ ok: true, service: "dexfuckers-chat", realtime: "websocket" });
    }

    if (url.pathname !== "/ws") {
      return json({ error: "Not found" }, 404);
    }

    const origin = request.headers.get("Origin");
    if (!origin || !isAllowedOrigin(origin)) {
      return json({ error: "Origin not allowed" }, 403);
    }

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return json({ error: "WebSocket upgrade required" }, 426);
    }

    const mode = url.searchParams.get("mode") === "random" ? "random" : "public";
    const nickname = safeNickname(url.searchParams.get("nickname"));
    const hub = env.CHAT_HUB.getByName("global");
    const target = new URL(request.url);
    target.searchParams.set("mode", mode);
    target.searchParams.set("nickname", nickname);
    return hub.fetch(new Request(target, { method: request.method, headers: request.headers }));
  },
};

export class ChatHub {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sessions = new Map();

    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment();
      if (attachment?.id) this.sessions.set(ws, attachment);
    }

    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );
  }

  async fetch(request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const url = new URL(request.url);
    const mode = url.searchParams.get("mode") === "random" ? "random" : "public";
    const session = {
      id: crypto.randomUUID(),
      nickname: safeNickname(url.searchParams.get("nickname")),
      mode,
      waiting: mode === "random",
      partnerId: null,
      blockedIds: [],
      joinedAt: Date.now(),
      messageTimes: [],
      reportCount: 0,
    };

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(session);
    this.sessions.set(server, session);

    this.send(server, { type: "ready", id: session.id, mode });
    if (mode === "public") {
      this.broadcastPublic({
        type: "system",
        text: session.nickname + " joined the chat",
        at: Date.now(),
      }, server);
      this.sendPresence();
    } else {
      this.matchWaitingUsers();
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  send(ws, payload) {
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      // A disconnected socket is removed by the close/error lifecycle callback.
    }
  }

  publicSockets(except) {
    return [...this.sessions.entries()]
      .filter(([ws, session]) => ws !== except && session.mode === "public");
  }

  broadcastPublic(payload, except) {
    for (const [ws] of this.publicSockets(except)) this.send(ws, payload);
  }

  sendPresence() {
    const count = [...this.sessions.values()].filter((session) => session.mode === "public").length;
    this.broadcastPublic({ type: "presence", count });
  }

  updateSession(ws, session) {
    this.sessions.set(ws, session);
    ws.serializeAttachment(session);
  }

  findSocketById(id) {
    for (const [ws, session] of this.sessions.entries()) {
      if (session.id === id) return ws;
    }
    return null;
  }

  matchWaitingUsers() {
    const waiting = [...this.sessions.entries()]
      .filter(([, session]) => session.mode === "random" && session.waiting && !session.partnerId);

    // Search the whole queue for a compatible pair. A blocked first user must
    // not prevent two later users from being matched with each other.
    while (waiting.length >= 2) {
      let pair = null;
      for (let i = 0; i < waiting.length && !pair; i += 1) {
        const [, a] = waiting[i];
        for (let j = i + 1; j < waiting.length; j += 1) {
          const [, b] = waiting[j];
          if (!a.blockedIds.includes(b.id) && !b.blockedIds.includes(a.id)) {
            pair = [i, j];
            break;
          }
        }
      }

      if (!pair) break;
      const [indexA, indexB] = pair;
      const [wsB, b] = waiting.splice(indexB, 1)[0];
      const [wsA, a] = waiting.splice(indexA, 1)[0];
      const nextA = { ...a, waiting: false, partnerId: b.id };
      const nextB = { ...b, waiting: false, partnerId: a.id };
      this.updateSession(wsA, nextA);
      this.updateSession(wsB, nextB);
      this.send(wsA, { type: "matched", nickname: b.nickname });
      this.send(wsB, { type: "matched", nickname: a.nickname });
    }

    for (const [ws, session] of waiting) {
      if (session.waiting && !session.partnerId) {
        this.send(ws, { type: "waiting", text: "Finding someone to chat with…" });
      }
    }
  }

  detachPartner(session, notice = "The other person left the chat.") {
    if (!session.partnerId) return;
    const partnerWs = this.findSocketById(session.partnerId);
    if (partnerWs) {
      const partner = this.sessions.get(partnerWs);
      if (partner) {
        this.updateSession(partnerWs, { ...partner, partnerId: null, waiting: false });
        this.send(partnerWs, { type: "partner-left", text: notice });
      }
    }
  }

  async webSocketMessage(ws, raw) {
    const session = this.sessions.get(ws);
    if (!session) return;

    let payload;
    try {
      payload = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
    } catch {
      this.send(ws, { type: "error", text: "Invalid message format." });
      return;
    }

    if (!payload || typeof payload.type !== "string") return;

    if (payload.type === "message") {
      const text = String(payload.text || "").trim();
      if (!text || text.length > MAX_MESSAGE_LENGTH) {
        this.send(ws, { type: "error", text: "Messages must be between 1 and 500 characters." });
        return;
      }

      const now = Date.now();
      const recent = session.messageTimes.filter((time) => now - time < MESSAGE_WINDOW_MS);
      if (recent.length >= MESSAGE_WINDOW_LIMIT) {
        this.send(ws, { type: "error", text: "You're sending messages too quickly. Please slow down." });
        return;
      }
      const updated = { ...session, messageTimes: [...recent, now] };
      this.updateSession(ws, updated);

      const message = {
        type: "message",
        id: crypto.randomUUID(),
        nickname: session.nickname,
        text,
        at: now,
      };

      if (session.mode === "public") {
        this.send(ws, message);
        this.broadcastPublic(message, ws);
      } else if (session.mode === "random" && session.partnerId) {
        this.send(ws, message);
        const partnerWs = this.findSocketById(session.partnerId);
        if (partnerWs) this.send(partnerWs, message);
        else this.send(ws, { type: "partner-left", text: "The other person disconnected." });
      }
      return;
    }

    if (payload.type === "find" && session.mode === "random") {
      this.detachPartner(session, "The other person moved to the next chat.");
      const next = { ...session, waiting: true, partnerId: null };
      this.updateSession(ws, next);
      this.send(ws, { type: "waiting", text: "Finding someone to chat with…" });
      this.matchWaitingUsers();
      return;
    }

    if (payload.type === "stop") {
      this.detachPartner(session);
      const next = { ...session, mode: "idle", waiting: false, partnerId: null };
      this.updateSession(ws, next);
      this.send(ws, { type: "stopped" });
      if (session.mode === "public") this.sendPresence();
      return;
    }

    if (payload.type === "block" && session.mode === "random" && session.partnerId) {
      const blockedId = session.partnerId;
      this.detachPartner(session, "The other person is no longer available.");
      const next = { ...session, blockedIds: [...new Set([...session.blockedIds, blockedId])], waiting: true, partnerId: null };
      this.updateSession(ws, next);
      this.send(ws, { type: "waiting", text: "User blocked. Finding another person…" });
      this.matchWaitingUsers();
      return;
    }

    if (payload.type === "report" && session.mode === "random" && session.partnerId) {
      if (session.reportCount >= 5) {
        this.send(ws, { type: "error", text: "Report limit reached for this session." });
        return;
      }
      const report = {
        reporterId: session.id,
        reportedId: session.partnerId,
        reason: String(payload.reason || "other").slice(0, 40),
        createdAt: Date.now(),
      };
      await this.ctx.storage.put("report:" + report.createdAt + ":" + crypto.randomUUID(), report);
      this.detachPartner(session, "The other person is no longer available.");
      const updated = {
        ...session,
        reportCount: session.reportCount + 1,
        blockedIds: [...new Set([...session.blockedIds, session.partnerId])],
        partnerId: null,
        waiting: true,
      };
      this.updateSession(ws, updated);
      this.send(ws, { type: "reported", text: "Report received. The user has been blocked." });
      this.matchWaitingUsers();
      return;
    }
  }

  webSocketClose(ws) {
    this.removeSession(ws);
  }

  webSocketError(ws) {
    this.removeSession(ws);
  }

  removeSession(ws) {
    const session = this.sessions.get(ws);
    if (!session) return;
    this.detachPartner(session);
    this.sessions.delete(ws);
    if (session.mode === "public") {
      this.broadcastPublic({
        type: "system",
        text: session.nickname + " left the chat",
        at: Date.now(),
      });
      this.sendPresence();
    }
    this.matchWaitingUsers();
  }
}
