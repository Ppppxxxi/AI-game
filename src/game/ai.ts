import { createServerFn } from "@tanstack/react-start";
import type { AiContext } from "./types.ts";

function parsePayload(raw: string) {
  const read = (value: string) => {
    const parsed = JSON.parse(value) as { reply?: unknown; intent?: unknown; cites?: unknown };
    const reply = typeof parsed.reply === "string" ? parsed.reply.trim() : "";
    const intent = typeof parsed.intent === "string" ? parsed.intent.trim() : "";
    const cites = Array.isArray(parsed.cites) ? parsed.cites.filter((item): item is string => typeof item === "string") : [];
    if (!reply) return null;
    return { reply, intent, cites };
  };
  const trimmed = raw.trim();
  try {
    const direct = read(trimmed);
    if (direct) return direct;
  } catch {
    /* fall through */
  }
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return read(match[0]);
  } catch {
    return null;
  }
}

async function complete(apiKey: string, data: AiContext, repair: boolean) {
  const system = [
    data.voice,
    "你在对话里说话。用白话，一两句把意思说完。禁止比喻、影射、说书腔、半句话和故弄玄虚。问到下面的已知或共享命题，就按那个意思直接回答，可以改成口语，不能改事实。不知道就说「我不知道」。不能说就说「这事我现在不说」，并给出具体原因。不要编造旧案、死亡或人名。",
    `已知：${data.known.join("；")}`,
    `不可说：${data.forbidden.join("；")}`,
    data.memories.length ? `你记得：${data.memories.join("；")}` : "你没有更多共同回忆。",
    data.relationship,
    data.situation,
    data.offers.length
      ? `玩家若明显在做其中一件事，把编号写入 intent，否则 intent 为空。只能从这份清单里选：${data.offers.map((item) => `${item.id}=${item.label}`).join("；")}`
      : "此刻没有可以提议的行动。intent 必须是空字符串。",
    data.beliefs.length
      ? `你与对方都已持有的命题，cites 只能从这些编号里选，不知道就给空数组：${data.beliefs.map((item) => `${item.id}=${item.line}`).join("；")}`
      : "此刻没有可以引用的共享命题。cites 必须是空数组。不要引用你单方面知道、对方还没听到的事。",
    "你只能提议，不能把事情说成已经发生。用中文说 20 到 80 字。只输出 JSON：{\"reply\":\"...\",\"intent\":\"\",\"cites\":[]}",
    repair ? "上一次没有输出合法 JSON。这次只输出 JSON。" : "",
  ]
    .filter(Boolean)
    .join("\n");
  const messages = [
    { role: "system", content: system },
    ...data.history.slice(0, -1).map((m) => ({ role: m.role, content: m.text })),
    { role: "user", content: data.playerLine },
  ];
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "grok-4.5", temperature: 0.4, max_tokens: 320, messages }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return { ok: false as const, error: `status ${res.status}` };
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const parsed = parsePayload(body.choices?.[0]?.message?.content ?? "");
  if (!parsed) return { ok: false as const, error: "bad-json" };
  const intent = /^[a-z0-9_]+$/.test(parsed.intent) ? parsed.intent : "";
  const allowed = new Set(data.offers.map((item) => item.id));
  const dropped = Boolean(intent && !allowed.has(intent));
  const beliefIds = new Set((data.beliefs ?? []).map((item) => item.id));
  const droppedCites = parsed.cites.map((item) => item.trim()).filter((item) => item && !beliefIds.has(item));
  return {
    ok: true as const,
    text: parsed.reply.slice(0, 400),
    intent: dropped ? "" : intent,
    dropped,
    droppedCites,
  };
}

export const converse = createServerFn({ method: "POST" })
  .validator((data: AiContext) => {
    if (!data || typeof data.playerLine !== "string" || typeof data.character !== "string") {
      throw new Error("invalid");
    }
    return {
      character: data.character,
      playerLine: data.playerLine.slice(0, 400),
      history: (data.history ?? []).slice(-6).map((m) => ({
        role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        text: String(m.text ?? "").slice(0, 400),
      })),
      known: (data.known ?? []).slice(0, 16).map((x) => String(x).slice(0, 200)),
      forbidden: (data.forbidden ?? []).slice(0, 12).map((x) => String(x).slice(0, 200)),
      memories: (data.memories ?? []).slice(0, 8).map((x) => String(x).slice(0, 200)),
      relationship: String(data.relationship ?? "").slice(0, 300),
      situation: String(data.situation ?? "").slice(0, 800),
      voice: String(data.voice ?? "").slice(0, 500),
      offers: (Array.isArray(data.offers) ? data.offers : [])
        .slice(0, 6)
        .map((item) => ({ id: String(item?.id ?? "").slice(0, 40), label: String(item?.label ?? "").slice(0, 40) }))
        .filter((item) => /^[a-z0-9_]+$/.test(item.id)),
      beliefs: (Array.isArray(data.beliefs) ? data.beliefs : [])
        .slice(0, 8)
        .map((item) => ({ id: String(item?.id ?? "").slice(0, 40), line: String(item?.line ?? "").slice(0, 160) }))
        .filter((item) => /^[a-z0-9_]+$/.test(item.id) && !item.id.startsWith("private_")),
    } satisfies AiContext;
  })
  .handler(async ({ data }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false as const, error: "off" };
    try {
      const first = await complete(apiKey, data, false);
      if (first.ok) return first;
      if (first.error === "bad-json") return await complete(apiKey, data, true);
      return first;
    } catch {
      return { ok: false as const, error: "failed" };
    }
  });
