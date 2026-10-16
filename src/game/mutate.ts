import { CHARS, CLUE_INFO } from "./content.ts";
import { freshClaims, syncClaim } from "./kb.ts";
import type {
  CharId,
  ClueState,
  Flags,
  GameEvent,
  GameState,
  Letter,
  LocId,
  Memory,
  Metrics,
  Mind,
  Rel,
} from "./types.ts";

export const CHAR_IDS: CharId[] = ["gu", "tang", "shen", "liu", "pei"];
const ZERO: Rel = { close: 0, trust: 0, debt: 0 };

export function clone<T>(v: T): T {
  return structuredClone(v);
}

function clamp(n: number) {
  return Math.max(-3, Math.min(3, n));
}

export function trustWord(n: number) {
  if (n >= 2) return "信赖";
  if (n === 1) return "稍信";
  if (n === 0) return "观望";
  if (n === -1) return "存疑";
  return "不信";
}

export function closeWord(n: number) {
  if (n >= 2) return "亲近";
  if (n === 1) return "愿接近";
  if (n === 0) return "客气";
  if (n === -1) return "疏远";
  return "不愿再见";
}

export function debtWord(n: number) {
  if (n >= 2) return "欠着很重的人情";
  if (n === 1) return "欠着人情";
  if (n <= -1) return "觉得对方有所亏欠";
  return "两清";
}

export function dayLabel(day: number) {
  const names = ["", "第一日", "第二日", "第三日", "第四日", "第五日", "第六日", "第七日"];
  if (day >= 1 && day <= 7) return names[day] ?? `第${day}日`;
  return `风波之后 · 第${day - 7}日`;
}

export function you(s: GameState) {
  return s.flags.name || "旅人";
}

export function personName(s: GameState, id: CharId) {
  if (id === "tang" && !s.flags.knowTangName) return "少女";
  return CHARS[id].name;
}

export function getRel(s: GameState, from: string, to: string): Rel {
  return s.rel[`${from}>${to}`] ?? { ...ZERO };
}

function pairKey(a: string, b: string) {
  return [a, b].sort().join("|");
}

export function pushEvent(
  s: GameState,
  e: Omit<GameEvent, "id" | "day"> & { day?: number; id?: string },
) {
  const id = e.id ?? `e${s.seq++}`;
  s.events.push({
    id,
    day: e.day ?? s.day,
    title: e.title,
    summary: e.summary,
    visible: e.visible,
    who: e.who,
    causes: e.causes,
    effects: e.effects,
  });
  return id;
}

export function bump(
  s: GameState,
  from: string,
  to: string,
  d: Partial<Rel>,
  reason: string,
  note: string,
) {
  const stamp = `rel:${reason}:${from}>${to}`;
  if (s.fired.includes(stamp)) return;
  s.fired.push(stamp);
  const cur = getRel(s, from, to);
  const next = {
    close: clamp(cur.close + (d.close ?? 0)),
    trust: clamp(cur.trust + (d.trust ?? 0)),
    debt: clamp(cur.debt + (d.debt ?? 0)),
  };
  s.rel[`${from}>${to}`] = next;
  s.relNotes[`${from}>${to}`] = note;
  pushEvent(s, {
    title: "关系变化",
    summary: note,
    visible: false,
    who: [from, to],
    causes: [],
    effects: [
      `${from}→${to} 亲近 ${cur.close}→${next.close} 信任 ${cur.trust}→${next.trust} 亏欠 ${cur.debt}→${next.debt}`,
    ],
  });
}

export function revealBond(s: GameState, a: string, b: string) {
  const k = pairKey(a, b);
  if (!s.knownBonds.includes(k)) s.knownBonds.push(k);
}

export function memory(s: GameState, m: Omit<Memory, "day"> & { day?: number }) {
  if (s.memories.some((x) => x.id === m.id)) return;
  s.memories.push({ ...m, day: m.day ?? s.day });
}

export function grant(s: GameState, id: string, source: string, verified: boolean) {
  const prev = s.clues[id];
  if (prev?.verified) return;
  if (prev && !verified) return;
  const c: ClueState = { known: true, verified, source, day: s.day };
  s.clues[id] = c;
  pushEvent(s, {
    title: verified ? "线索核实" : "得到传闻",
    summary: `${CLUE_INFO[id]?.title ?? id} · 来源：${source}`,
    visible: true,
    who: ["player"],
    causes: [],
    effects: [id],
  });
  if ((id === "dest_gu" || id === "dest_shen") && s.clues.dest_gu && s.clues.dest_shen) {
    grant(s, "dest_mismatch", "两相对照", true);
  }
  syncClaim(s, id, source, verified);
}

export function letter(
  s: GameState,
  from: CharId | "anon",
  title: string,
  body: string,
  eventId?: string,
) {
  if (s.letters.some((l) => l.title === title && l.day === s.day && l.from === from)) return;
  const row: Letter = {
    id: title === "未署名" ? `sq${s.seq++}` : `l${s.seq++}`,
    from,
    day: s.day,
    title,
    body,
    unread: true,
    eventId,
  };
  s.letters.unshift(row);
}

export function promise(s: GameState, id: string, to: CharId, text: string, dueDay?: number) {
  if (s.promises.some((p) => p.id === id)) return;
  s.promises.push({ id, to, text, dayMade: s.day, dueDay, status: "open" });
  memory(s, {
    id: `mem-${id}`,
    text: `${you(s)}对${personName(s, to)}承诺：${text}`,
    who: [to],
    kind: "promise",
  });
}

export function breakPromise(s: GameState, id: string) {
  const p = s.promises.find((x) => x.id === id);
  if (!p || p.status !== "open") return;
  p.status = "broken";
  pushEvent(s, {
    title: "承诺违背",
    summary: p.text,
    visible: true,
    who: ["player", p.to],
    causes: [],
    effects: [id],
  });
}

export function keepPromise(s: GameState, id: string) {
  const p = s.promises.find((x) => x.id === id);
  if (!p || p.status !== "open") return;
  p.status = "kept";
}

export function did(s: GameState, action: string) {
  return s.fired.includes(`did:${action}`);
}

export function markDid(s: GameState, action: string) {
  if (!did(s, action)) s.fired.push(`did:${action}`);
}

export function pushChat(
  s: GameState,
  char: CharId,
  role: "player" | "npc",
  text: string,
  live = false,
) {
  s.chats[char].push({ id: `c${s.seq++}`, role, text, day: s.day, live });
}

function blankFlags(name: string): Flags {
  return {
    name,
    vouch: "none",
    peiTipped: false,
    fakeDeathExposed: false,
    sawDrowning: false,
    girlWhere: "none",
    shenWhere: "none",
    shenConfided: false,
    girlCoop: "none",
    decidedForHer: false,
    liuConfessed: false,
    shenConfessed: false,
    guConfessed: false,
    registerSeen: false,
    registerWith: "none",
    survivorLeak: false,
    shenInjured: false,
    shenDetained: false,
    mediated: false,
    guWillTestify: false,
    shenWillTestify: false,
    tangWillTestify: false,
    hideoutOpen: false,
    toldPeiAboutShen: false,
    stoodForShen: false,
    motiveDone: false,
    layoutDone: false,
    knowTangName: false,
    ending: "",
    evidenceSecured: false,
  };
}

function baseRels(): Record<string, Rel> {
  const rel: Record<string, Rel> = {};
  const set = (a: string, b: string, r: Rel) => {
    rel[`${a}>${b}`] = { ...r };
  };
  for (const id of CHAR_IDS) {
    set("player", id, { ...ZERO });
    set(id, "player", { ...ZERO });
  }
  set("liu", "gu", { close: 2, trust: 2, debt: 1 });
  set("gu", "liu", { close: 1, trust: 2, debt: 0 });
  set("tang", "gu", { close: -1, trust: -2, debt: 0 });
  set("gu", "tang", { close: -1, trust: 0, debt: 2 });
  set("tang", "liu", { close: 0, trust: -1, debt: 0 });
  set("liu", "tang", { close: 0, trust: 0, debt: 0 });
  set("shen", "gu", { close: 0, trust: -1, debt: 0 });
  set("gu", "shen", { close: 0, trust: 0, debt: 0 });
  set("shen", "pei", { close: -1, trust: 0, debt: 0 });
  set("pei", "shen", { close: 0, trust: 0, debt: 0 });
  set("liu", "pei", { close: 0, trust: 0, debt: 0 });
  set("pei", "liu", { close: 0, trust: 0, debt: 0 });
  set("tang", "shen", { close: 0, trust: 0, debt: 0 });
  set("shen", "tang", { close: 0, trust: 0, debt: 0 });
  set("pei", "gu", { close: 0, trust: 0, debt: 0 });
  set("gu", "pei", { close: -1, trust: -1, debt: 0 });
  set("pei", "tang", { close: 0, trust: 0, debt: 0 });
  set("tang", "pei", { close: 0, trust: -1, debt: 0 });
  set("liu", "shen", { close: 1, trust: 1, debt: 0 });
  set("shen", "liu", { close: 1, trust: 1, debt: 0 });
  return rel;
}

export function emptyMetrics(): Metrics {
  return {
    talks: 0,
    modelLines: 0,
    fallbackLines: 0,
    rejectedLines: 0,
    confirmed: 0,
    cancelled: 0,
    proposed: 0,
    proposedBlocked: 0,
  };
}

export function initialState(): GameState {
  const chats = {} as GameState["chats"];
  for (const id of CHAR_IDS) chats[id] = [];
  const status = {} as GameState["status"];
  for (const id of CHAR_IDS) status[id] = "present";
  return {
    version: 1,
    started: false,
    screen: "title",
    mode: "main",
    day: 1,
    slots: 3,
    loc: null,
    talk: null,
    scene: null,
    rounds: {},
    pending: null,
    flags: blankFlags("旅人"),
    rel: baseRels(),
    relNotes: {},
    clues: {},
    promises: [],
    pacts: [],
    letters: [],
    events: [],
    chats,
    memories: [],
    fired: [],
    met: [],
    named: ["liu"],
    knownBonds: [],
    spentLook: [],
    notice: null,
    report: [],
    debug: false,
    seq: 1,
    sequel: null,
    epilogue: null,
    status,
    metrics: emptyMetrics(),
    traces: [],
    claims: freshClaims(),
    minds: blankMinds(),
    decisions: [],
  };
}

function blankMinds(): Record<CharId, Mind> {
  const minds = {} as Record<CharId, Mind>;
  for (const id of CHAR_IDS) minds[id] = { goals: [], beliefs: [] };
  return minds;
}
