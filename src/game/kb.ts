import { CLUE_INFO } from "./content.ts";
import type { CharId, Claim, GameState } from "./types.ts";

const ONTO: Record<string, { subject: string; predicate: string; object: string }> = {
  backyard_closed: { subject: "茶肆后院", predicate: "状态", object: "提前落闩" },
  spare_clothes: { subject: "护送", predicate: "备有", object: "干衣" },
  girl_seeking: { subject: "少女", predicate: "正在寻找", object: "说书人" },
  girl_refuses: { subject: "少女", predicate: "拒绝", object: "上船" },
  dest_gu: { subject: "护送", predicate: "目的地据称", object: "县城" },
  dest_shen: { subject: "护送", predicate: "目的地据称", object: "旧码头" },
  dest_mismatch: { subject: "护送", predicate: "目的地", object: "两种说法冲突" },
  water_route: { subject: "顾晚舟", predicate: "问过", object: "夜间水路与接应" },
  supplies_mismatch: { subject: "物资", predicate: "对不上", object: "上水护送" },
  blade_old: { subject: "沈砚的刀", predicate: "断口", object: "不是新伤" },
  blade_truth: { subject: "断刀", predicate: "来自", object: "中止假落水" },
  shen_low: { subject: "沈砚", predicate: "不愿", object: "见官" },
  accuse_letter: { subject: "袖中信", predicate: "指向", object: "沈砚" },
  motive_truth: { subject: "宋棠", predicate: "身份", object: "宋衡之女" },
  names_rumor: { subject: "名册", predicate: "传闻", object: "有人改过姓名" },
  liu_role: { subject: "柳七", predicate: "参与", object: "布置假死" },
  names_altered: { subject: "名册", predicate: "涂改", object: "一部分姓名" },
  father_not_saved: { subject: "宋衡", predicate: "在册上", object: "未被改掉" },
  register_double: { subject: "名册", predicate: "既能", object: "证明旧案也能交出活人" },
};

const RULES: {
  id: string;
  needs: string[];
  min: number;
  subject: string;
  predicate: string;
  object: string;
  how: string;
}[] = [
  {
    id: "fake_pattern",
    needs: ["spare_clothes", "water_route", "backyard_closed", "supplies_mismatch"],
    min: 2,
    subject: "黎明护送",
    predicate: "并起来更像",
    object: "预先布置的落水",
    how: "两条以上命题并置",
  },
  {
    id: "both_sides",
    needs: ["names_altered", "father_not_saved"],
    min: 2,
    subject: "顾晚舟",
    predicate: "同时",
    object: "改过姓名，也没能改下宋衡",
    how: "册页上的两行并置",
  },
  {
    id: "dest_mismatch",
    needs: ["dest_gu", "dest_shen"],
    min: 2,
    subject: "护送",
    predicate: "目的地",
    object: "两种说法冲突",
    how: "两相对照",
  },
];

const NAMES: [string, string][] = [
  ["顾晚舟", "gu"],
  ["沈砚", "shen"],
  ["柳七", "liu"],
  ["裴照", "pei"],
  ["宋棠", "tang"],
  ["少女", "tang"],
];

function speakers(source: string) {
  return NAMES.filter(([name]) => source.includes(name)).map(([, id]) => id);
}

function row(
  id: string,
  subject: string,
  predicate: string,
  object: string,
  holders: string[],
  how: string,
): Claim {
  const stance: Record<string, "verified" | "rumor"> = {};
  for (const holder of holders) stance[holder] = "verified";
  return {
    id,
    subject,
    predicate,
    object,
    status: "verified",
    sources: [{ who: holders[0] ?? "gu", day: 0, how }],
    holders,
    derivedFrom: [],
    stance,
    contradicts: [],
  };
}

export function freshClaims(): Record<string, Claim> {
  return {
    private_stage: row("private_stage", "黎明护送", "实际是", "预先布置、不必真死的水", ["gu", "liu"], "两人共同的计划"),
    private_register: row("private_register", "名册", "被", "改过一部分姓名，宋衡未改", ["gu", "liu"], "顾晚舟经手"),
    private_tang: row("private_tang", "宋棠", "来意", "找说书人，问旧案证人", ["tang"], "她自己的目的"),
    private_shen: row("private_shen", "沈砚", "态度", "不接来路不清的活，也不见官", ["shen"], "他的立场"),
  };
}

function ensure(s: GameState) {
  if (!s.claims) s.claims = freshClaims();
  for (const claim of Object.values(s.claims)) {
    if (!claim.stance) {
      claim.stance = {};
      for (const holder of claim.holders) claim.stance[holder] = claim.status === "verified" ? "verified" : "rumor";
    }
    if (!claim.contradicts) claim.contradicts = [];
    if (!claim.derivedFrom) claim.derivedFrom = [];
  }
}

export function syncClaim(s: GameState, id: string, source: string, verified: boolean) {
  ensure(s);
  const onto = ONTO[id];
  if (!onto) return;
  const prev = s.claims[id];
  const heard = speakers(source);
  const holders = [...new Set([...(prev?.holders ?? []), "player", ...heard])];
  const sources = [...(prev?.sources ?? [])];
  if (!sources.some((item) => item.how === source && item.day === s.day)) {
    sources.push({ who: heard[0] ?? "player", day: s.day, how: source });
  }
  const stance: Record<string, "verified" | "rumor"> = { ...(prev?.stance ?? {}) };
  stance.player = verified || stance.player === "verified" ? "verified" : "rumor";
  for (const holder of heard) stance[holder] = "verified";
  s.claims[id] = {
    id,
    subject: onto.subject,
    predicate: onto.predicate,
    object: onto.object,
    status: verified || prev?.status === "verified" ? "verified" : "rumor",
    sources,
    holders,
    derivedFrom: id === "dest_mismatch" ? ["dest_gu", "dest_shen"] : (prev?.derivedFrom ?? []),
    stance,
    contradicts: prev?.contradicts ?? [],
  };
  infer(s);
}

export function shareClaim(s: GameState, id: string, holder: string) {
  adopt(s, id, holder, "rumor");
}

export function adopt(s: GameState, id: string, holder: string, status: "verified" | "rumor") {
  ensure(s);
  const claim = s.claims[id];
  if (!claim) return;
  if (!claim.holders.includes(holder)) claim.holders.push(holder);
  if (!claim.stance) claim.stance = {};
  if (claim.stance[holder] === "verified") return;
  claim.stance[holder] = status;
}

function infer(s: GameState) {
  for (const rule of RULES) {
    const have = rule.needs.filter((id) => s.claims[id]);
    if (have.length < rule.min) continue;
    const prev = s.claims[rule.id];
    if (!prev) {
      s.claims[rule.id] = {
        id: rule.id,
        subject: rule.subject,
        predicate: rule.predicate,
        object: rule.object,
        status: "verified",
        sources: [{ who: "player", day: s.day, how: rule.how }],
        holders: ["player"],
        derivedFrom: have,
        stance: { player: "verified" },
        contradicts: [],
      };
    } else {
      prev.derivedFrom = rule.id === "dest_mismatch" ? ["dest_gu", "dest_shen"] : have;
      if (!prev.holders.includes("player")) prev.holders.push("player");
      prev.stance = { ...(prev.stance ?? {}), player: prev.stance?.player === "rumor" ? "rumor" : "verified" };
      if (rule.id !== "dest_mismatch") prev.stance.player = "verified";
    }
  }
  const county = s.claims.dest_gu;
  const dock = s.claims.dest_shen;
  if (county && dock) {
    if (!county.contradicts.includes("dest_shen")) county.contradicts.push("dest_shen");
    if (!dock.contradicts.includes("dest_gu")) dock.contradicts.push("dest_gu");
  }
}

export function claimLine(c: Claim) {
  return `${c.subject} · ${c.predicate} · ${c.object}`;
}

export function playerClaims(s: GameState) {
  ensure(s);
  return Object.values(s.claims).filter((c) => c.holders.includes("player"));
}

export function heldBy(s: GameState, id: CharId) {
  ensure(s);
  return Object.values(s.claims).filter((c) => c.holders.includes(id));
}

export function speakableBeliefs(s: GameState, id: CharId) {
  return heldBy(s, id)
    .filter((c) => c.holders.includes("player") && !c.id.startsWith("private_"))
    .slice(0, 8)
    .map((c) => {
      const tone = c.stance?.[id] === "verified" ? "此人视为已核" : "此人视为传闻";
      return { id: c.id, line: `${claimLine(c)}（${tone}）` };
    });
}

export function claimTitle(id: string) {
  return CLUE_INFO[id]?.title ?? id;
}
