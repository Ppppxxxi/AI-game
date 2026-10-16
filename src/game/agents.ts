import { claimLine, claimTitle, heldBy, playerClaims } from "./kb.ts";
import { projectMinds } from "./mind.ts";
import { CHAR_IDS, getRel, personName, trustWord } from "./mutate.ts";
import type { CharId, GameState, Metrics } from "./types.ts";

export interface AgentCard {
  id: CharId;
  name: string;
  goal: string;
  belief: string;
  memory: string;
  ifIdle: string;
  rule: string;
}

const POLICY = [
  "说得清的行动走规则，不调用模型。",
  "只有开放说法才请求模型。它只能引用你和对方都已持有的命题，也只能从当前合法动作里提议。",
  "引用若超出这份交集，会被剥掉，不能写进手记。意图在你点头之前，不能落子。",
  "打哑谜、用比喻代替事实的句子整句作废。问到能说的事，用白话把事实说完；不能说就说明原因。",
  "口头说一件事做完了，并不能让江湖约定完成。世界只在双方都做到、并被核对过之后才改。",
  "日终时，每人按目标和已持有的命题给选项打分，取得分最高的一条，并记下被放弃的那条。",
];

const WHO: Record<string, string> = {
  player: "你",
  gu: "顾晚舟",
  shen: "沈砚",
  liu: "柳七",
  pei: "裴照",
  tang: "宋棠",
};

function remembered(s: GameState, id: CharId) {
  const rows = s.memories.filter((m) => m.who.includes(id) && m.kind !== "pref");
  if (rows.length === 0) return "还没有一件被单独记住的事。";
  return rows
    .slice(-2)
    .map((m) => m.text)
    .join("");
}

function whoName(s: GameState, id: string) {
  if (id === "tang") return personName(s, "tang");
  return WHO[id] ?? id;
}

function beliefLine(s: GameState, id: CharId) {
  const shared = heldBy(s, id).filter((c) => c.holders.includes("player") && !c.id.startsWith("private_"));
  if (shared.length === 0) return "你和他之间还没有对上同一条命题。";
  return shared
    .slice(0, 2)
    .map((c) => claimLine(c))
    .join("；");
}

export function agentCards(s: GameState) {
  const minds = projectMinds(s);
  return CHAR_IDS.filter((id) => s.met.includes(id) || s.named.includes(id)).map((id) => {
    const open = [...minds[id].goals].sort((a, b) => a.rank - b.rank).find((item) => item.status === "open") ?? minds[id].goals[0];
    const last = (s.decisions ?? []).find((d) => d.agent === id);
    const rule = last
      ? `${last.visible ? "你能得知" : "你不在场"}：选了「${last.chose}」（${last.score}），放弃「${last.rejected}」（${last.altScore}）。`
      : open?.ifIdle ?? "还没有需要取舍的一夜。";
    const card: AgentCard = {
      id,
      name: personName(s, id),
      goal: open?.text ?? "没有尚未完成的目标。",
      belief: beliefLine(s, id),
      memory: remembered(s, id),
      ifIdle: open?.ifIdle ?? "没有新的输入，就不会重复结算同一件事。",
      rule,
    };
    return card;
  });
}

export function ledger(s: GameState) {
  return playerClaims(s)
    .filter((c) => !c.id.startsWith("private_"))
    .map((c) => ({
      id: c.id,
      line: claimLine(c),
      tone: (c.stance?.player ?? c.status) === "verified" ? "已核实" : c.status === "contradicted" ? "已冲突" : "传闻",
      sources: c.sources.map((src) => `${src.how}（第${src.day}日）`).join("；"),
      with: c.holders.filter((holder) => holder !== "player").map((holder) => whoName(s, holder)),
      from: c.derivedFrom.map((id) => (s.claims[id] ? claimLine(s.claims[id]) : claimTitle(id))),
      against: (c.contradicts ?? []).map((id) => (s.claims[id] ? claimLine(s.claims[id]) : id)),
    }))
    .sort((a, b) => b.from.length - a.from.length || a.line.localeCompare(b.line, "zh"));
}

export function audit(s: GameState) {
  const metrics: Metrics = s.metrics ?? {
    talks: 0,
    modelLines: 0,
    fallbackLines: 0,
    rejectedLines: 0,
    confirmed: 0,
    cancelled: 0,
    proposed: 0,
    proposedBlocked: 0,
  };
  const verified = Object.values(s.clues).filter((c) => c.verified).length;
  const rumor = Object.values(s.clues).filter((c) => !c.verified).length;
  const claims = Object.values(s.claims ?? {});
  return {
    policy: POLICY,
    metrics,
    verified,
    rumor,
    autonomous: s.events.filter((e) => !e.visible).length,
    traces: s.traces ?? [],
    agents: agentCards(s),
    hidden: s.events.filter((e) => !e.visible).map((e) => `${e.day} ${e.title}：${e.summary}`),
    stance: agentCards(s).map((a) => `${a.name} ${trustWord(getRel(s, a.id, "player").trust)}`),
    decisions: (s.decisions ?? []).map((d) => ({
      id: d.id,
      visible: d.visible,
      head: `第${d.day}日 · ${whoName(s, d.agent)} · ${d.visible ? "事后可知" : "你不在场"}`,
      chose: `${d.chose}（${d.score}）`,
      rejected: `${d.rejected}（${d.altScore}）`,
      because: d.because,
      goal: d.goal,
      saw: d.saw.join("、"),
    })),
    privates: claims
      .filter((c) => c.id.startsWith("private_") || c.derivedFrom.length > 0)
      .map((c) => `${c.id.startsWith("private_") ? "未公开" : "推出"} · ${claimLine(c)} · ${c.holders.map((holder) => whoName(s, holder)).join("、")}`),
  };
}
