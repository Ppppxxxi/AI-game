import { decide } from "./mind.ts";
import { bump, getRel, letter, memory, pushEvent, you } from "./mutate.ts";
import type { GameState, Pact } from "./types.ts";

const PLAYER_DUTY = "去渡口带回一包新茶，当面交给柳七";
const NPC_DUTY = "张罗茶铺，请熟客过来";

export function mentionsTeaPact(text: string) {
  return /茶会|夜茶|办一场茶|办个茶会|张罗夜茶/.test(text);
}

export function claimsTeaDone(text: string) {
  return /已经办好|茶送到了|茶叶交给|我已经完成|办完了|茶我买了|新茶给你|交给你了|我完成了|茶叶已经|买好了|我说完成了/.test(text);
}

function rows(s: GameState) {
  if (!s.pacts) s.pacts = [];
  return s.pacts;
}

export function activeTea(s: GameState) {
  return rows(s).find((pact) => pact.template === "tea_night" && pact.status === "fulfilling");
}

export function teaBlocked(s: GameState) {
  return rows(s).some((pact) => pact.template === "tea_night" && pact.status !== "cancelled");
}

export function teaGathering(s: GameState) {
  return rows(s).some((pact) => pact.status === "done" && pact.world === "tea_night");
}

export function judgeTea(s: GameState) {
  const trust = getRel(s, "liu", "player").trust;
  const blocked = teaBlocked(s);
  const late = s.day >= 5 || s.flags.ending !== "";
  const cold = trust < 0;
  const met = s.met.includes("liu");
  let accept = 8 + Math.max(0, trust) * 4 + (s.day <= 2 ? 2 : 0) + (met ? 4 : 0);
  let refuse = 2;
  let reason = "茶铺还开着。你带回新茶，我负责张罗桌椅和熟客。";
  if (blocked) {
    accept = 0;
    refuse = 12;
    reason = "这桩我们已经定过了。做成、失约，或是我没办成，都不会再开同样的一桩。";
  } else if (late) {
    accept = 1;
    refuse = 10;
    reason = s.flags.ending ? "这一章已经翻过去了。夜茶我张罗不成。" : "过了第四日，渡口的事压着，我顾不上办夜茶。";
  } else if (cold) {
    accept = 1;
    refuse = 9;
    reason = "我现在信不过你。茶铺不能拿去办一场说着玩的茶会。";
  }
  const ok = !blocked && !late && !cold;
  return {
    ok,
    reason,
    accept,
    refuse,
    rejected: ok ? "推掉这场夜茶" : "答应办夜茶",
  };
}

export function noteTeaChoice(s: GameState, visible: boolean, kind: "answer" | "offer" = "answer") {
  const judged = judgeTea(s);
  const trust = getRel(s, "liu", "player").trust;
  decide(s, {
    agent: "liu",
    goal: "把茶肆的一夜过成自己收得住的事",
    saw: [
      `对你的信任是 ${trust}`,
      s.day >= 5 || s.flags.ending ? "日子已经晚了" : `第${s.day}日还来得及`,
      teaBlocked(s) ? "已经有过一桩夜茶" : "还没有未了的夜茶",
      s.flags.survivorLeak ? "藏身处漏过风" : "茶肆还能开门",
    ],
    chose: judged.ok ? (kind === "offer" ? "先开口约一场夜茶" : "答应共办夜茶") : "拒绝这场夜茶",
    because: judged.reason,
    rejected: judged.ok ? (kind === "offer" ? "自己把夜茶按下" : judged.rejected) : judged.rejected,
    visible,
    score: judged.ok ? judged.accept : judged.refuse,
    altScore: judged.ok ? judged.refuse : judged.accept,
  });
  return judged;
}

export function confirmTeaOffer(s: GameState) {
  const judged = judgeTea(s);
  if (!judged.ok) return judged.reason;
  const pact: Pact = {
    id: `tea${s.seq++}`,
    template: "tea_night",
    with: "liu",
    title: "与柳七共办夜茶",
    playerDuty: PLAYER_DUTY,
    npcDuty: NPC_DUTY,
    dueDay: s.day + 1,
    status: "fulfilling",
    playerDone: false,
    npcDone: false,
    heldTea: false,
    world: "",
    note: "说定了。新茶还没到你手里。",
  };
  rows(s).push(pact);
  pushEvent(s, {
    title: "说定夜茶",
    summary: `${you(s)}与柳七说定：带回新茶，她张罗茶铺。嘴里说完成了不算。`,
    visible: true,
    who: ["player", "liu"],
    causes: [],
    effects: ["pact tea_night fulfilling"],
  });
  s.notice = "夜茶说定了。你去渡口带回新茶，当面交给柳七。她负责张罗茶铺。";
  return `说定了。你去渡口买一包新茶，当面交给我。茶铺和熟客我来张罗。期限到第${pact.dueDay}日夜里。你嘴里说完成了，我不算。`;
}

export function confirmTeaDeliver(s: GameState) {
  const pact = activeTea(s);
  if (!pact || !pact.heldTea || pact.playerDone) return "茶叶不在你手里。你说交过，不算。";
  pact.playerDone = true;
  pact.note = "新茶已经交到柜上。她张罗不张罗，要到今夜才见分晓。";
  pushEvent(s, {
    title: "新茶交到",
    summary: `${you(s)}把渡口的新茶当面交给柳七。茶铺还没有摆开。`,
    visible: true,
    who: ["player", "liu"],
    causes: [],
    effects: ["playerDone"],
  });
  s.notice = "茶叶交到了柳七手里。她今夜张罗不张罗，明天看茶肆，也看信。";
  return "茶叶我看见了，收下。今夜我来张罗。摆没摆上，你看茶肆，也看信。";
}

export function confirmTeaCancel(s: GameState) {
  const pact = activeTea(s);
  if (!pact || pact.playerDone) return "没有可以收回的夜茶。";
  pact.status = "cancelled";
  pact.note = "还没做完，你把它收回了。还可以再提一次。";
  pushEvent(s, {
    title: "收回夜茶",
    summary: `${you(s)}收回了和柳七的夜茶。不算失约。`,
    visible: true,
    who: ["player", "liu"],
    causes: [],
    effects: ["pact cancelled"],
  });
  s.notice = "夜茶收回了。还可以再提一次。";
  return "收回可以。还没做的事，不算你失约。你若改主意，还可以再提。";
}

function succeed(s: GameState, pact: Pact) {
  const trust = getRel(s, "liu", "player").trust;
  decide(s, {
    agent: "liu",
    goal: "兑现答应过的夜茶",
    saw: ["新茶已经交到柜上", `对你的信任是 ${trust}`, "茶肆还能开门请客"],
    chose: "张罗茶铺，请熟客",
    because: "茶叶到了，人也还信得过，茶铺我开得了。",
    rejected: "推说今晚不开门",
    visible: true,
    score: 11,
    altScore: 3,
  });
  pact.status = "done";
  pact.npcDone = true;
  pact.world = "tea_night";
  pact.note = "茶叶是你带的，桌子是她摆的。";
  s.claims.tea_night = {
    id: "tea_night",
    subject: "夜茶",
    predicate: "由",
    object: "你带回新茶、柳七张罗茶铺",
    status: "verified",
    sources: [{ who: "柳七", day: s.day, how: "双方履约" }],
    holders: ["player", "liu"],
    derivedFrom: [],
    stance: { player: "verified", liu: "verified" },
    contradicts: [],
  };
  letter(s, "liu", "夜茶摆上了", `${you(s)}：\n茶叶是你带回来的，桌子是我摆的，熟客也来了。灯笼亮着。这是我们一起做成的。\n柳七`);
  memory(s, {
    id: "tea-night-shared",
    text: "昨夜的夜茶是你们一起办成的。茶叶是你带回的，桌子是柳七摆的。",
    who: ["liu"],
    kind: "help",
  });
  bump(s, "liu", "player", { trust: 1, close: 1 }, "tea-night-done", "柳七和你一起办成了夜茶，因而更信你，也更亲近。");
  pushEvent(s, {
    title: "夜茶摆上了",
    summary: "柳七张罗了茶铺，熟客还在。灯笼亮着。",
    visible: true,
    who: ["player", "liu"],
    causes: ["新茶交到"],
    effects: ["world tea_night"],
  });
  s.report.push({ title: "夜茶摆上了", body: "柳七把桌子摆开，熟客还在。灯笼亮着。这是你们一起做成的，不是嘴上说的。" });
  s.notice = "夜茶摆上了。灯笼亮着，熟客还没散。";
}

function failNpc(s: GameState, pact: Pact) {
  const trust = getRel(s, "liu", "player").trust;
  const leaked = s.flags.survivorLeak;
  const because = leaked ? "藏身处漏了风，我不能在堂口聚人。" : "我现在信不过你，熟客我请不来。";
  decide(s, {
    agent: "liu",
    goal: "兑现答应过的夜茶",
    saw: ["新茶已经交到柜上", `对你的信任是 ${trust}`, leaked ? "藏身处已经漏过风" : "茶肆还能开门，但人不肯来"],
    chose: "说明今晚张罗不成",
    because,
    rejected: "硬撑着把桌子摆上",
    visible: true,
    score: 10,
    altScore: 2,
  });
  pact.status = "npc_failed";
  pact.npcDone = false;
  pact.world = "";
  pact.note = because;
  letter(
    s,
    "liu",
    "茶会我没张罗成",
    `${you(s)}：\n${because}夜茶办不成。茶叶你交了，这不是你失约，是我没能做到。\n柳七`,
  );
  pushEvent(s, {
    title: "茶会没有张罗成",
    summary: because,
    visible: true,
    who: ["player", "liu"],
    causes: ["新茶交到"],
    effects: ["npc_failed"],
  });
  s.report.push({ title: "茶会没有办成", body: `${because}茶铺没有改样。这不是你失约。` });
  s.notice = "柳七没有把夜茶张罗起来。茶铺还是老样子。";
}

function breakPlayer(s: GameState, pact: Pact) {
  decide(s, {
    agent: "liu",
    goal: "兑现答应过的夜茶",
    saw: ["新茶没有当面交到", `期限是第${pact.dueDay}日夜里`],
    chose: "记下你失约",
    because: "说到的夜里，新茶没有到我手里。桌子我也不摆了。",
    rejected: "再空等一夜",
    visible: true,
    score: 8,
    altScore: 2,
  });
  pact.status = "broken";
  pact.note = "期限过了，新茶没有当面交到。";
  letter(s, "liu", "新茶没有到", `${you(s)}：\n说到第${pact.dueDay}日夜里。渡口没有新茶送到我手里。这场夜茶我记下你失约，桌子我也不摆了。\n柳七`);
  bump(s, "liu", "player", { trust: -1 }, "tea-night-broken", "柳七因夜茶失约而少信你一分。");
  pushEvent(s, {
    title: "夜茶失约",
    summary: `${you(s)}没有在期限前把新茶交给柳七。`,
    visible: true,
    who: ["player", "liu"],
    causes: [],
    effects: ["pact broken"],
  });
  s.report.push({ title: "新茶没有到", body: "期限过了。你没有把新茶当面交上，夜茶没有发生。" });
  s.notice = "夜茶的期限过了。新茶没交到，茶铺没有改样。";
}

export function settlePacts(s: GameState) {
  for (const pact of rows(s)) {
    if (pact.template !== "tea_night" || pact.status !== "fulfilling") continue;
    if (pact.playerDone) {
      const trust = getRel(s, "liu", "player").trust;
      if (trust >= 0 && !s.flags.survivorLeak) succeed(s, pact);
      else failNpc(s, pact);
    } else if (s.day >= pact.dueDay) breakPlayer(s, pact);
  }
}

export function mapPact(s: GameState) {
  const pact = activeTea(s);
  if (!pact) return null;
  const progress = pact.playerDone ? "你的新茶已经交上，等她今夜张罗" : pact.heldTea ? "新茶在你手里，还没当面交给她" : "你还没从渡口带回新茶";
  return {
    title: pact.title,
    you: pact.playerDuty,
    hers: pact.npcDuty,
    due: `第${pact.dueDay}日夜里`,
    progress,
  };
}

const STATUS_WORD: Record<Pact["status"], string> = {
  fulfilling: "还在做",
  done: "做成了",
  cancelled: "收回了",
  broken: "你失约了",
  npc_failed: "她没做成",
};

export function pactRows(s: GameState) {
  return rows(s).map((pact) => ({
    id: pact.id,
    title: pact.title,
    player: pact.playerDuty,
    npc: pact.npcDuty,
    due: `第${pact.dueDay}日夜里`,
    status: STATUS_WORD[pact.status],
    note: pact.note,
  }));
}
