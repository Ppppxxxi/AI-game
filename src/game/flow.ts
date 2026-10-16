import { STRAIGHT_ORDER, topicOf, wantsGoal, wantsStraight } from "./ask.ts";
import { applyAction, applyDay1, applyDoor, canEvacuate, canTestify, chooseEnding, evacuateBlock, testifyBlock } from "./apply.ts";
import { CHARS, CLUE_INFO, DEFLECT, GREET, LOCS, TWISTS } from "./content.ts";
import {
  CHAR_IDS,
  bump,
  clone,
  closeWord,
  dayLabel,
  debtWord,
  getRel,
  grant,
  initialState,
  letter,
  memory,
  personName,
  pushChat,
  trustWord,
  you,
  emptyMetrics,
} from "./mutate.ts";
import { applySequel, because, briefOf, computeRoute, endDay, locationOf, openSequel, sequelVM } from "./sim.ts";
import { speakableBeliefs } from "./kb.ts";
import { projectMinds } from "./mind.ts";
import {
  activeTea,
  claimsTeaDone,
  judgeTea,
  mapPact,
  mentionsTeaPact,
  noteTeaChoice,
  teaGathering,
} from "./pact.ts";
import type { AiContext, CharId, GameState, LocId, SceneVM, Screen, Step, Sug, Trace } from "./types.ts";

export { canEvacuate, canTestify, chooseEnding, endDay, openSequel, sequelVM, computeRoute };
export { dayLabel, personName, you, getRel, trustWord, closeWord, debtWord, initialState };
export { agentCards, audit, ledger } from "./agents.ts";
export { pactRows } from "./pact.ts";

function tally(s: GameState) {
  if (!s.metrics) s.metrics = emptyMetrics();
  if (!s.traces) s.traces = [];
  return s.metrics;
}

function leaveTrace(s: GameState, kind: Trace["kind"], text: string) {
  if (!s.traces) s.traces = [];
  s.traces.unshift({ id: `t${s.seq++}`, day: s.day, kind, text });
  s.traces = s.traces.slice(0, 8);
}

export function startGame(name: string): GameState {
  const clean = name.replace(/\s+/g, "").replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, "").slice(0, 8);
  const s = initialState();
  s.started = true;
  s.screen = "map";
  s.flags.name = clean || "旅人";
  letter(s, "liu", "茶是热的", `${you(s)}：\n渡口这几日生人多。茶肆有座，账记在我名下。后院在修，门闩着，别往里走。\n柳七`);
  grant(s, "backyard_closed", "柳七来信", false);
  s.notice = "柳七留了座。信里多嘱了一句：别往后院去。";
  return s;
}

export function fakeScore(s: GameState) {
  return ["spare_clothes", "water_route", "backyard_closed", "supplies_mismatch"].filter((id) => s.clues[id]?.known).length;
}
export function canExpose(s: GameState) {
  return fakeScore(s) >= 2;
}
export function hideOpen(s: GameState) {
  return s.flags.hideoutOpen || s.flags.fakeDeathExposed || s.flags.layoutDone || s.flags.registerSeen || s.day >= 6 || s.mode === "daily";
}

export function whereNote(s: GameState, id: CharId) {
  if ((s.mode === "daily" || s.flags.ending) && s.status[id] === "gone") return "已不知去向";
  if ((s.mode === "daily" || s.flags.ending) && s.status[id] === "letter") return "不在渡口，或可通信";
  if (id === "gu" && s.flags.sawDrowning && !s.flags.layoutDone && !s.flags.fakeDeathExposed) return "渡口都说他已经落了水";
  if (id === "shen" && s.flags.shenInjured) return "臂上有伤";
  if (id === "shen" && s.flags.shenDetained && !s.flags.shenConfessed) return "被请到公廨";
  if (id === "gu" && s.flags.ending === "testify") return "在案前";
  return "";
}

export function brief(s: GameState) {
  return briefOf(s);
}

export function mapVM(s: GameState) {
  const scene = s.mode === "main" && !s.flags.ending ? currentScene(s) : null;
  const gathering = teaGathering(s);
  const locs = (Object.keys(LOCS) as LocId[]).map((id) => {
    const locked = id === "hide" && !hideOpen(s) ? "没有人带路，你还找不到那扇门。" : undefined;
    const people = locked ? [] : CHAR_IDS.filter((pid) => locationOf(s, pid) === id).map((pid) => ({ id: pid, name: personName(s, pid), note: whereNote(s, pid) }));
    const desc = id === "tea" && gathering
      ? "灯笼亮着。桌椅围成一圈。熟客还没散，夜茶就摆在堂口。"
      : id === "tea" && s.day === 1
        ? "柜上两只没喝完的碗。后院的门从里面闩着。醒木还挂在柱上。"
        : LOCS[id].desc;
    return { id, name: LOCS[id].name, desc, image: LOCS[id].image, locked, people };
  });
  return {
    dayLabel: dayLabel(s.day),
    brief: brief(s),
    slots: s.slots,
    unread: s.letters.filter((l) => l.unread).length,
    notice: s.notice,
    urgentTitle: scene?.title,
    urgentDetail: scene?.kicker,
    locs,
    sequelReady: s.letters.some((l) => l.id.startsWith("sq") && !s.sequel?.done),
    pact: mapPact(s),
    door: s.mode === "main" && s.flags.toldPeiAboutShen && !s.fired.includes("night-door") && !s.flags.ending
      ? { title: "公廨的人来了", detail: "茶肆门口" }
      : null,
  };
}

export function currentScene(s: GameState): SceneVM | null {
  if (s.scene === "door" && s.flags.toldPeiAboutShen && !s.fired.includes("night-door")) {
    return {
      id: "door",
      kicker: "茶肆门口",
      title: "公廨的人来了",
      paras: [
        "裴照站在茶肆外头。他问，沈砚人在哪。",
        "柳七没有马上答。她看见你，手停在杯子上。",
        "后头没有人出声。你还没进去。",
      ],
      choices: [
        { action: "door_in", label: "现在进去" },
        { action: "door_listen", label: "在门口听完" },
        { action: "door_leave", label: "离开" },
      ],
    };
  }
  if (s.mode !== "main" || s.flags.ending) return null;
  const f = s.flags;
  if (s.day === 1 && !s.fired.includes("day1-seen")) {
    return {
      id: "day1",
      kicker: "茶肆 · 第一日",
      title: "冷茶还在柜上",
      paras: [
        "雾比人先到。柜上两只碗，茶是冷的。后院的门从里面闩死。",
        "柳七抬头：「昨晚有个年轻姑娘来问说书的人。没留名字，问得很急。人到现在没回来。」",
        "醒木还挂在柱上。说书的人在，话不多。",
      ],
      choices: [
        { action: "day1_ask", label: "问她那姑娘" },
        { action: "day1_door", label: "看那扇门" },
        { action: "day1_leave", label: "先在渡口走走" },
      ],
    };
  }
  if (s.day === 2 && f.vouch === "none") {
    return { id: "vouch", kicker: "茶肆 · 第二日", title: "他要你的名字", paras: ["顾晚舟把扇子合上。天亮之前要走。沈砚不肯接这趟来路不清的活，除非有个认的人画押。", "「县城。递一封不要紧的状子。」他说得轻。柳七在柜后擦杯子，没有接话。后院的门仍闩着。"], choices: [{ action: "vouch_accept", label: "写上我的名字" }, { action: "vouch_refuse", label: "我不写" }, { action: "hold_vouch", label: "我先去对说法" }] };
  }
  if (s.day === 3 && !f.fakeDeathExposed && !f.sawDrowning && canExpose(s)) {
    return { id: "confront", kicker: "卯时之前", title: "这趟水不必真的下去", paras: ["干衣、水路、落闩的后院、对不上的账——这些不该同时出现在一趟寻常护送里。", "你在船离开跳板之前拦住了他们。顾晚舟的袖口是干的。柳七手里还攥着油纸包。", "戏可以停。停了以后，每个人都要选一句真话。"], choices: [{ action: "stop_quiet", label: "让他们停手，并暂时保密" }, { action: "demand_truth", label: "当场要一个说法" }, { action: "tell_pei_now", label: "把人与物证一起交给裴照" }] };
  }
  if (s.day === 3 && !f.fakeDeathExposed && !f.sawDrowning) {
    return { id: "drown", kicker: "渡口 · 卯时", title: "没有捞上来的人", paras: [f.peiTipped ? "裴照的人比看热闹的人先到。说书人落了水，尸体没有回来。沈砚的刀断口却不像新砍的。" : "雾里先炸开一声喊。说书人在离岸三丈的地方没了影。人群把沈砚围住。", "外衫挂在船桩上，袖中有一封短笺：「若我有失，问沈砚。」字写得很稳。"], choices: [{ action: "read_sleeve", label: "先把这封信看清楚" }, { action: "stand_for_shen", label: "为沈砚说话" }, { action: "give_to_pei", label: f.peiTipped ? "协助裴照封存现场" : "把刀和信交给裴照" }, { action: "stay_silent", label: "什么也不做" }] };
  }
  if (s.day === 4 && !f.motiveDone) {
    const cold = f.girlWhere === "broken";
    return { id: "motive", kicker: "第四日", title: "她不许别人替她决定", paras: [cold ? "宋棠知道你把她的事说过出去。「我还是来讲。不是信你，是这事不能只剩你们的版本。」" : "她终于把名字给你：宋棠。宋衡的女儿。", f.fakeDeathExposed ? "「他没有死。他安排船，是怕我见到那个还记得名册的人。」" : "「不管他走没走成，护送都不是为了保护谁。是为了别让我问完。」", "「责任谁担，我自己判断。你若想帮，就别把我的路再写一遍。」"], choices: [{ action: "ally_respect", label: "一起查，决定权在你" }, { action: "ally_control", label: "一起查，但听我安排" }, { action: "stay_out", label: "我先不站队" }] };
  }
  if (s.day === 5 && !f.layoutDone) {
    return { id: "layout", kicker: "第五日 · 灯后", title: "谁先把局说破", paras: ["夹层的灯只亮一盏。顾晚舟还在呼吸。柳七的围裙上有油纸的褶。沈砚把断刀放在桌上。", "宋棠停在楼梯口。她要听，但她不把背交给屋子里的人。", "灯后头，谁先开口，谁就先把局说破。你事前对上的线头，会决定这番话突不突然。"], choices: [{ action: "press_liu", label: "先问柳七" }, { action: "press_shen", label: "让沈砚解释这把刀" }, { action: "mediate", label: "让宋棠和柳七坐下谈", disabled: f.girlCoop === "ally" ? undefined : "宋棠还不愿与柳七坐在一处" }, { action: "leak_hide", label: "把藏身处告诉裴照" }] };
  }
  if (s.day === 6 && !f.registerSeen) {
    return { id: "register", kicker: "第六日", title: "茶罐夹层里的名册", paras: ["名册不厚。若干名字被刮过，新写的姓名墨色不同。宋衡两个字没有动。", "顾晚舟的声音很轻：「我交过一份。我改过一些。我没能改下她父亲。名册若完整交出去，活着的人会按旧名被找回。」", f.decidedForHer ? "宋棠看着你，比看着册子更冷。「你若再替我决定它的去处，我们就到此为止。」" : "宋棠没有伸手抢。她在等你记住：去处不能只由害怕的人决定。"], choices: [{ action: "reg_pei_partial", label: "只把涂改交给裴照，藏起现名" }, { action: "reg_pei_full", label: "名册全文交给裴照" }, { action: "reg_liu", label: "交给柳七保管" }, { action: "reg_tang", label: "交给宋棠" }, { action: "reg_player", label: "自己收着" }] };
  }
  if (s.day >= 7 && !f.ending) {
    return { id: "crisis", kicker: "第七日 · 公廨外", title: "追索的人已经到了", paras: ["祠堂外停着一辆没有旗号的车。来人点名要「岸册」的原本。裴照把印按在袖中，看你。", f.vouch === "accepted" ? "你为那趟护送作过保。沈砚的嫌疑里有你的名字。" : "你没有为护送画押。可你既然知道了名册，就不再是纯然的过客。", "走不通的那条，门会自己关着，并告诉你为什么。"], choices: [{ action: "ending_testify", label: "保留证据，出面作证", disabled: testifyBlock(s) }, { action: "ending_evacuate", label: "先护送幸存者离开", disabled: evacuateBlock(s) }, { action: "ending_rupture", label: "证据守不住，各人离散" }] };
  }
  return null;
}

interface Card {
  action: string;
  title: string;
  lines: string[];
  source?: string;
  warning?: string;
  confirmLabel: string;
  npcLine: string;
  chip: string;
}

function cardFor(s: GameState, action: string, talk: CharId | null): Card | null {
  const f = s.flags;
  const base = (partial: Omit<Card, "action">): Card => ({ action, ...partial });
  if (action === "vouch_accept" && f.vouch === "none" && s.day === 2 && (!talk || talk === "gu" || s.scene === "vouch")) {
    return base({ chip: "写上我的名字", title: "你的名字会写上去", lines: ["顾晚舟要你画押。天亮前的船，会写上你的名字。", "你若不去对说法，船上的事也会算到你头上。事后把同一件事送到公廨，这纸保就是你自己撕的。"], confirmLabel: "写上我的名字", npcLine: "名字一落，这趟船就有你一份。" });
  }
  if (action === "vouch_refuse" && f.vouch === "none" && s.day === 2) return base({ chip: "拒绝作保", title: "拒绝作保", lines: ["你不承担这趟护送的担保。", "顾晚舟会另找办法。你仍可以调查。"], confirmLabel: "确认拒绝", npcLine: "也好。我不会逼一个不愿写名字的人。" });
  if (action === "hold_vouch" && f.vouch === "none" && s.scene === "vouch") return base({ chip: "先去查", title: "先不画押", lines: ["这场先停下。护送的请求还在。"], confirmLabel: "先去查", npcLine: "去吧。别查到天亮才回来。" });
  if (action === "promise_girl" && talk === "tang" && f.girlWhere === "none" && (s.clues.girl_seeking || s.clues.girl_refuses || f.motiveDone)) return base({ chip: "答应保密", title: "保密的承诺", lines: ["你答应不把她的行踪和托付的事告诉别人。"], confirmLabel: "我答应", npcLine: "你说的我记下了。我也只记这一句。" });
  if (action === "promise_shen" && talk === "shen" && f.shenWhere === "none" && f.shenConfided) return base({ chip: "答应不告诉公廨", title: "不把他的行踪送去公廨", lines: ["沈砚告诉你，他不愿见官。你若再向裴照描述，就是违背。"], source: "沈砚亲口", confirmLabel: "我答应", npcLine: "行。这话出了这扇门，我就当没认识你。" });
  if (action === "promise_decide" && talk === "tang" && f.motiveDone && !f.decidedForHer && !s.promises.some((p) => p.id === "not-decide")) return base({ chip: "答应不替她做主", title: "决定权留给宋棠", lines: ["你答应不替她决定名册和她自己的去路。"], confirmLabel: "我答应", npcLine: "这句比帮忙值钱。你若做不到，就别说。" });
  if (action === "relay_girl" && talk && talk !== "tang" && (s.clues.girl_seeking || s.clues.girl_refuses || f.motiveDone) && !s.fired.includes(`did:relay_girl:${talk}`)) {
    return base({ chip: "告诉对方她在查案", title: "传递消息", lines: [`将「少女正在追查旧案，并寻找说书人」告诉${personName(s, talk)}。`], source: s.clues.girl_seeking?.source ?? "她亲口告知", warning: f.girlWhere === "kept" ? "你曾答应不把她的事说出去。" : undefined, confirmLabel: "确认传达", npcLine: "你是要把她的事放到我耳朵里？" });
  }
  if (action === "relay_shen" && talk === "pei" && (f.shenConfided || s.clues.shen_low) && !s.fired.includes("did:relay_shen")) {
    return base({ chip: "把沈砚的事告诉他", title: "这句话出了这扇门", lines: ["你要把沈砚不愿见官、人在镖站，告诉裴照。", "他不会当场落笔。他会自己去问。"], warning: f.shenWhere === "kept" ? "你答应过不把他的行踪送到公廨。说了，就是食言。" : undefined, confirmLabel: "告诉他", npcLine: "来处是你。我自己去问，不在这儿下判断。" });
  }
  if (action === "tip_pei" && talk === "pei" && !f.peiTipped && s.day >= 2 && s.day <= 3) {
    return base({ chip: "告知黎明的护送", title: "向公廨报备护送", lines: ["你告诉裴照：说书人安排了黎明的水路护送。", "若你已经作保，顾晚舟会视此为背叛。"], warning: f.vouch === "accepted" ? "你已经为这趟护送作保。" : undefined, confirmLabel: "确认告知", npcLine: "卯时我可以有人在。你确定要公廨进这个场子？" });
  }
  if (action === "accuse_fake" && (talk === "gu" || talk === "liu") && canExpose(s) && !f.fakeDeathExposed && s.day <= 3) {
    return base({ chip: "指出这是假死", title: "指出假死", lines: ["你把对得上的线头摊开。第三日将改为对质，不再强演死亡。"], source: "你已掌握的线索", confirmLabel: "我说破", npcLine: "……你把话说完。别在堂口喊。" });
  }
  if (action === "ask_gu_testify" && talk === "gu" && !f.guWillTestify && f.registerSeen && s.day >= 6 && (getRel(s, "gu", "player").trust >= 0 || f.guConfessed)) {
    return base({ chip: "请他出面承担责任", title: "请顾晚舟作证", lines: ["你请他公开承认自己交过名册、也改过名字。"], confirmLabel: "我请他站出来", npcLine: "你要我站到格子纸前面去。我听见了。" });
  }
  if (action === "ask_shen_testify" && talk === "shen" && !f.shenWillTestify && !!s.clues.blade_truth && s.day >= 5 && !f.shenInjured) {
    return base({ chip: "请沈砚作证", title: "请沈砚说明断刀", lines: ["你请他把「刀是为了中止假死」当堂说清。"], confirmLabel: "提出请求", npcLine: "说可以。你别把我说成英雄，也别说成凶手。" });
  }
  if (s.scene === "confront" && !f.fakeDeathExposed && action === "stop_quiet") return base({ chip: "保密并叫停", title: "叫停，并暂时保密", lines: ["假死不演了。你答应今日不把夹层宣扬到堂口。"], confirmLabel: "就这样收场", npcLine: "行。戏停。" });
  if (s.scene === "confront" && !f.fakeDeathExposed && action === "demand_truth") return base({ chip: "当场对质", title: "当场要说法", lines: ["你要求现在解释干衣与水路。他不会交出全部现址。"], confirmLabel: "我要听", npcLine: "那你听一半。" });
  if (s.scene === "confront" && !f.fakeDeathExposed && action === "tell_pei_now") return base({ chip: "交给裴照", title: "通知裴照", lines: ["你让公廨介入。现场会被封存。顾晚舟会认为你选择了官面。"], confirmLabel: "去告诉公廨", npcLine: "你要开门给公廨。想好了就点。" });
  if (s.scene === "drown" && !s.clues.accuse_letter?.verified && action === "read_sleeve") return base({ chip: "看信", title: "阅读袖中书信", lines: ["你将把指认沈砚的信收入手记。它还不是杀人的证据。"], confirmLabel: "看清楚", npcLine: "纸不长。你看完，还是要决定站在哪边。" });
  if (s.scene === "drown" && !f.sawDrowning && action === "stand_for_shen") return base({ chip: "为沈砚说话", title: "在现场为沈砚说话", lines: ["你当众说：断口不是新的。沈砚会记住是你开口。"], confirmLabel: "我站出来说", npcLine: "你这句若说了，就收不回嘴里。" });
  if (s.scene === "drown" && !f.sawDrowning && action === "give_to_pei") return base({ chip: "封存证物", title: "把现场交给裴照", lines: ["信与刀会被封存。", f.peiTipped ? "他的人已经在场。" : "沈砚会被请去问话。"], confirmLabel: "交给公廨", npcLine: "物证可以进匣子。" });
  if (s.scene === "drown" && !f.sawDrowning && action === "stay_silent") return base({ chip: "沉默", title: "保持沉默", lines: ["你不站队。", f.peiTipped ? "公廨仍会收物证。" : "没有人拦的时候，沈砚会带伤杀出。"], confirmLabel: "我什么也不做", npcLine: "沉默也算一句。" });
  if (!f.motiveDone && (s.scene === "motive" || (s.day >= 4 && talk === "tang"))) {
    if (action === "ally_respect") return base({ chip: "决定权在她", title: "合作，且不替她做主", lines: ["你与宋棠一起查，并承诺不代她决定。"], confirmLabel: "就这样约定", npcLine: "可以。你记住后半句。" });
    if (action === "ally_control") return base({ chip: "听我安排", title: "合作，但由你安排", lines: ["她会恨你把决定权拿走。"], warning: "这违背她刚刚说的底线。", confirmLabel: "仍要这样", npcLine: "你又要替我写下一步。" });
    if (action === "stay_out") return base({ chip: "先不站队", title: "暂不合作", lines: ["你不加入她的追查。信任不会因此上升。"], confirmLabel: "我先退出", npcLine: "那你就当听过一个故事。" });
  }
  if (!f.layoutDone && s.scene === "layout") {
    if (action === "press_liu") return base({ chip: "问柳七", title: "要求柳七说明", lines: [getRel(s, "liu", "player").trust >= 1 ? "她信任你，会把理由说得更全。" : "她信任不足，只会承认一半。"], confirmLabel: "我问", npcLine: "问吧。茶我放下了。" });
    if (action === "press_shen") return base({ chip: "问断刀", title: "让沈砚解释断刀", lines: ["这会核实：断刀来自他中止假死，不是杀人。"], confirmLabel: "听他说", npcLine: "刀可以看。话我说一遍。" });
    if (action === "mediate" && f.girlCoop === "ally") return base({ chip: "促成对谈", title: "让宋棠与柳七对谈", lines: ["你只引见。结论她们自己下。"], confirmLabel: "我来引这句", npcLine: "你只引见。" });
    if (action === "leak_hide") return base({ chip: "向裴照泄露藏身处", title: "把藏身处告诉裴照", lines: ["你将说出夹层一带藏着幸存者。"], warning: f.girlWhere === "kept" ? "你答应过不把她的事说出去。" : "柳七和宋棠都会把这视为泄露。", confirmLabel: "仍然告诉他", npcLine: "这句话出了门，就不是私话了。" });
  }
  if (!f.registerSeen && s.scene === "register") {
    const warn = s.promises.some((p) => p.id === "not-decide" && p.status === "open") && action === "reg_pei_full" ? "你答应过不替宋棠决定名册的去处。" : undefined;
    const map: Record<string, Card> = {
      reg_pei_partial: base({ chip: "部分交公", title: "只提交涂改", lines: ["裴照得到涂改的页面。现名不进公牍。"], confirmLabel: "这样交", npcLine: "你若能分开，就分开。" }),
      reg_pei_full: base({ chip: "全文交公", title: "名册全文交给裴照", lines: ["证据最完整。现名会进入档案。"], warning: warn ?? "这可能暴露幸存者。", confirmLabel: "全文奉上", npcLine: "全文一进匣，我就按档案保管。我不会私下烧毁。" }),
      reg_liu: base({ chip: "交给柳七", title: "名册交给柳七", lines: ["她会用来保护活人。公堂上的证据会变弱。"], confirmLabel: "交给她", npcLine: "给我可以。" }),
      reg_tang: base({ chip: "交给宋棠", title: "名册交给宋棠", lines: ["决定权到她手上。"], confirmLabel: "给她", npcLine: "接下来的判断是我的。" }),
      reg_player: base({ chip: "自己收着", title: "名册由你保管", lines: ["证据还在，但没有进入公档。"], confirmLabel: "我先拿着", npcLine: "别把它当成平安符。" }),
    };
    if (map[action]) return map[action];
  }
  if (s.day >= 7 && !f.ending && action === "ending_testify" && canTestify(s)) return base({ chip: "出面作证", title: "保留证据，出面作证", lines: ["名册与涂改会留下。愿意作证的人要公开站出来。"], confirmLabel: "走这条路", npcLine: "写上去的名字，收不回私室。" });
  if (s.day >= 7 && !f.ending && action === "ending_evacuate" && canEvacuate(s)) return base({ chip: "先护送人", title: "优先护送幸存者", lines: ["先让活着的人离开。追责会延后。"], confirmLabel: "先送人走", npcLine: "人若要走，就在他们上车之前。" });
  if (s.day >= 7 && !f.ending && action === "ending_rupture") return base({ chip: "各自散去", title: "证据失守", lines: ["真相难以当堂证明。人会散。"], confirmLabel: "接受这个结局", npcLine: "散不是安全，只是各自去承担。" });
  if (action === "pact_tea_offer" && talk === "liu" && judgeTea(s).ok) {
    const looked = s.spentLook.includes(`${s.day}:ferry`);
    return base({
      chip: "约定共办夜茶",
      title: "把夜茶说定",
      lines: ["你去渡口带一包新茶，当面交给她。她张罗茶铺，请熟客。", `说到第${s.day + 1}日夜里。嘴里说带来了，不算。`],
      warning: looked ? "你今天已经在渡口看过了。新茶要再花一个时辰，得等到明日。" : undefined,
      confirmLabel: "说定",
      npcLine: "可以。你带回新茶，我来张罗。点头之前，这事还没定。",
    });
  }
  if (action === "pact_tea_deliver" && talk === "liu") {
    const pact = activeTea(s);
    if (pact?.heldTea && !pact.playerDone) {
      return base({
        chip: "把新茶交给她",
        title: "当面交付新茶",
        lines: ["你把渡口买下的新茶交到柳七手里。", "她张罗不张罗，要到今夜才见分晓。嘴里说交过，不算。"],
        confirmLabel: "交给她",
        npcLine: "茶叶拿来我看。看过才算你的那一份。",
      });
    }
  }
  if (action === "pact_tea_cancel" && talk === "liu") {
    const pact = activeTea(s);
    if (pact && !pact.playerDone) {
      return base({
        chip: "收回这场夜茶",
        title: "收回夜茶的约定",
        lines: ["双方都还没做完。收回之后，还可以再提一次。"],
        confirmLabel: "收回约定",
        npcLine: "你要收回？没做完的事，收回就不算失约。",
      });
    }
  }
  if (action.startsWith("sq_") && s.sequel && !s.sequel.done) {
    const choice = sequelVM(s)?.choices.find((c) => c.action === action);
    if (!choice || choice.disabled) return null;
    return base({ chip: choice.label, title: choice.label, lines: ["这会按你此前的关系推进后续，不能改成另一条开场。"], confirmLabel: "确认", npcLine: "你确定要这样走。" });
  }
  return null;
}

const DISC: { clue: string; chars: CharId[]; kw: RegExp; minDay: number; source: string; line: string; effect?: "shen" }[] = [
  { clue: "girl_seeking", chars: ["liu"], kw: /姑娘|少女|生人|打听/, minDay: 1, source: "柳七", line: "有个年轻姑娘在打听一个说书的人。她没留名字，问得很急。我只告诉她：人在茶肆。" },
  { clue: "girl_seeking", chars: ["tang"], kw: /找谁|找人|说书|来做什么|来意/, minDay: 1, source: "少女亲口", line: "我在找说书的人。他欠我们家一句实话。我的名字现在不告诉你。你也别替我去喊他。" },
  { clue: "backyard_closed", chars: ["liu"], kw: /后院|门闩/, minDay: 1, source: "柳七", line: "后院是我在你来之前就闩上的，不是今天才开始修。里面的事，我现在不当着堂口说。" },
  { clue: "dest_gu", chars: ["gu"], kw: /去哪|目的地|县城|何处/, minDay: 2, source: "顾晚舟亲口", line: "这趟我说的目的地是县城，去递一封状子。我是这么告诉你的。" },
  { clue: "dest_shen", chars: ["shen"], kw: /去哪|码头|目的地|旧码头/, minDay: 2, source: "沈砚亲口", line: "他告诉我的不是县城，是上游旧码头，夜里靠岸。两句话对不上。" },
  { clue: "water_route", chars: ["shen"], kw: /水路|接应|落水/, minDay: 1, source: "沈砚亲口", line: "他问过夜里哪段水有人接，也问湿衣服往哪换。他没解释为什么要问这个。" },
  { clue: "water_route", chars: ["gu"], kw: /水路|接应|湿衣|落水/, minDay: 2, source: "顾晚舟失言", line: "水路我问过。我问了夜里哪段水有人接，也问了湿衣服往哪换。原因我现在不说。" },
  { clue: "girl_refuses", chars: ["tang"], kw: /船|一起走|同行|护送/, minDay: 2, source: "少女亲口", line: "他的船我不上。他想在我见到证人之前把我送走。这不是保护。" },
  { clue: "blade_old", chars: ["shen"], kw: /刀|断口|磕/, minDay: 1, source: "沈砚亲口", line: "刀是昨天磕断的。断口发暗，不是今天才折的，也不是今天见的血。" },
  { clue: "shen_low", chars: ["shen"], kw: /公廨|躲|行踪|见官/, minDay: 1, source: "沈砚亲口", line: "我不想见公廨的人。委托来路不清，我人就在镖站。这句你要是说出去，我就当你没来过。", effect: "shen" },
  { clue: "supplies_mismatch", chars: ["liu", "shen"], kw: /物资|账|货单|下水|清单/, minDay: 2, source: "物资记录", line: "账上写的是下水小船和一身干衣，不是上水护送该有的盘缠。时间和去向对不上。" },
];

const ACTS: { action: string; kw: RegExp; chars?: CharId[] }[] = [
  { action: "vouch_accept", kw: /作保|我担保|我保你|画押/, chars: ["gu"] },
  { action: "vouch_refuse", kw: /不保|拒绝担保|不能保|不写这个/, chars: ["gu"] },
  { action: "promise_girl", kw: /保密|不说出去|守口如瓶/, chars: ["tang"] },
  { action: "promise_shen", kw: /保密|不说出去|不去告诉/, chars: ["shen"] },
  { action: "promise_decide", kw: /不替你做主|决定权在你/, chars: ["tang"] },
  { action: "relay_shen", kw: /沈砚.*(躲|不见官|回避)/, chars: ["pei"] },
  { action: "tip_pei", kw: /黎明|卯时|报备护送/, chars: ["pei"] },
  { action: "accuse_fake", kw: /假死|装死|这是演戏/, chars: ["gu", "liu"] },
  { action: "relay_girl", kw: /把她的事|转告她|她在查案|宋棠在找/ },
  { action: "ask_gu_testify", kw: /出面作证|承担责任|站出来/, chars: ["gu"] },
  { action: "ask_shen_testify", kw: /当堂说明|为这把刀作证/, chars: ["shen"] },
];

export function openDoor(s0: GameState): Step {
  if (!s0.flags.toldPeiAboutShen || s0.fired.includes("night-door")) return { state: s0, blocked: "门口已经没人了。" };
  const s = clone(s0);
  s.scene = "door";
  s.screen = "scene";
  s.pending = null;
  return { state: s };
}

export function openScene(s0: GameState): Step {
  const vm = currentScene(s0);
  if (!vm) return { state: s0, blocked: "今日没有必须推门的那场戏。" };
  const s = clone(s0);
  s.scene = vm.id;
  s.screen = "scene";
  s.pending = null;
  return { state: s };
}

export function look(s0: GameState, loc: LocId): Step {
  if (loc === "hide" && !hideOpen(s0)) return { state: s0, blocked: "没有人带路，你找不到那扇门。" };
  const key = `${s0.day}:${loc}`;
  if (s0.spentLook.includes(key)) return { state: s0, blocked: "这个时辰你已经把这里看过一遍。" };
  if (s0.slots <= 0) return { state: s0, blocked: "今日的时辰用尽了。你可以读信、翻手记，或结束这一日。" };
  const s = clone(s0);
  s.slots -= 1;
  s.spentLook.push(key);
  s.loc = loc;
  const notes: string[] = [];
  if (loc === "tea" && s.day >= 2) {
    grant(s, "spare_clothes", "茶肆后院的油纸包", true);
    grant(s, "backyard_closed", "你看见门闩", true);
    grant(s, "supplies_mismatch", "茶肆账单", true);
    notes.push("后院门闩从里面落下。油纸包里是一身干衣。账单边角写着下水小船，不是上水护送。");
  } else if (loc === "tea") {
    grant(s, "backyard_closed", "你看见门闩", false);
    if (!s.fired.includes("day1-seen")) s.fired.push("day1-seen");
    notes.push("柜上两只碗，茶是冷的。后院的门从里面闩死，不像今天才动的工。醒木还挂在柱上。");
  } else if (loc === "escort") {
    grant(s, "blade_old", "镖站刀架", true);
    notes.push("架上那把刀断口发暗，不像今天才折的。");
    if (s.day >= 2) {
      grant(s, "supplies_mismatch", "镖站货单", true);
      notes.push("货单上是夜间的小船和换洗衣物。");
    }
  } else if (loc === "ferry" && s.day >= 2) {
    grant(s, "water_route", "船夫的闲话", true);
    notes.push("船夫说，说书的问过哪段水夜里有人接应，还问湿衣往哪儿换。");
  } else if (loc === "ferry") notes.push("雾比人先到。跳板是湿的，今日还没有人在这里等船。");
  else if (loc === "yamen") notes.push(s.flags.peiTipped ? "门外已经有人被吩咐：卯时去渡口，不许乱动东西。" : "裴照的案上没有血，只有空白格子。他在等一个带来源的说法。");
  else notes.push(s.day >= 6 && !s.flags.registerSeen ? "茶罐下有夹层。要看见涂改，还得把那一场当面揭开。" : "夹层很静。灯不肯太亮。");
  const tea = activeTea(s);
  if (loc === "ferry" && tea && !tea.heldTea) {
    tea.heldTea = true;
    tea.note = "新茶在你手里，还要当面交给柳七。";
    notes.push("船夫手里有一包新茶。你把它买下了。回去交给柳七，才算你的那一份。");
  }
  s.notice = notes.join("");
  s.screen = "map";
  return { state: s };
}

export function beginTalk(s0: GameState, id: CharId): Step {
  if (locationOf(s0, id) == null) return { state: s0, blocked: `${personName(s0, id)}此刻不在你能走进的地方。` };
  const s = clone(s0);
  const key = `${s.day}:${id}`;
  if (s.rounds[key] == null) {
    if (s.slots <= 0) return { state: s0, blocked: "今日的时辰用尽了。" };
    s.slots -= 1;
    s.rounds[key] = 6;
  }
  s.talk = id;
  s.loc = locationOf(s, id);
  s.screen = "talk";
  s.scene = null;
  if (!s.met.includes(id)) {
    s.met.push(id);
    if (id !== "tang") s.named.push(id);
    bump(s, id, "player", { close: 1 }, `meet-${id}`, `${personName(s, id)}愿意同你说上话。`);
    bump(s, "player", id, { close: 1 }, `meet-p-${id}`, `你开始认识${personName(s, id)}。`);
  }
  if (s.chats[id].length === 0) pushChat(s, id, "npc", GREET[id]);
  if (id === "liu" && !s.clues.girl_seeking?.known) grant(s, "girl_seeking", "柳七", false);
  if (id === "liu" && s.day === 1 && !s.fired.includes("day1-seen")) s.fired.push("day1-seen");
  if (id === "liu" && teaGathering(s) && !s.fired.includes("tea-remembered")) {
    s.fired.push("tea-remembered");
    pushChat(s, id, "npc", "昨夜夜茶是我们一起办成的。茶叶是你带的，桌子是我摆的。");
  } else if (id === "liu" && s.day >= 2 && !s.fired.includes("liu-tea-offer") && judgeTea(s).ok) {
    s.fired.push("liu-tea-offer");
    noteTeaChoice(s, true, "offer");
    pushChat(s, id, "npc", "今晚若有新茶，我想把熟客留下。你要是去渡口，替我带一把。嘴里说带来了不算。你愿意，我们就把它说定。");
  }
  return { state: s };
}

export function leaveToMap(s0: GameState): GameState {
  const s = clone(s0);
  if (s.pending && s.screen === "talk" && s.talk) pushChat(s, s.talk, "npc", "那便先搁下。未确认的事，不算做过。");
  s.pending = null;
  s.talk = null;
  s.scene = null;
  s.screen = "map";
  return s;
}

export function goScreen(s0: GameState, screen: Screen): GameState {
  const s = clone(s0);
  if (s.pending && screen !== s.screen) s.pending = null;
  s.screen = screen;
  if (screen !== "talk") s.talk = null;
  return s;
}

export function dismissNotice(s0: GameState): GameState {
  const s = clone(s0);
  s.notice = null;
  return s;
}
export function readLetter(s0: GameState, id: string): GameState {
  const s = clone(s0);
  const l = s.letters.find((x) => x.id === id);
  if (l) l.unread = false;
  return s;
}
export function toMorning(s0: GameState): GameState {
  const s = clone(s0);
  s.screen = "map";
  return s;
}

function goalText(s: GameState, char: CharId) {
  const goals = projectMinds(s)[char].goals;
  return goals.find((item) => item.status === "open") ?? goals[0];
}

function spendLine(s: GameState, char: CharId, player: string, npc: string) {
  const key = `${s.day}:${char}`;
  s.rounds[key] = (s.rounds[key] ?? 1) - 1;
  pushChat(s, char, "player", player);
  pushChat(s, char, "npc", npc);
}

function openDisc(s: GameState, char: CharId, clues: string[]) {
  return DISC.find((d) => d.chars.includes(char) && clues.includes(d.clue) && s.day >= d.minDay && !s.clues[d.clue]?.verified);
}

function revealDisc(s: GameState, char: CharId, disc: (typeof DISC)[number], player: string) {
  const key = `${s.day}:${char}`;
  s.rounds[key] = (s.rounds[key] ?? 1) - 1;
  pushChat(s, char, "player", player);
  if (disc.effect === "shen") s.flags.shenConfided = true;
  grant(s, disc.clue, disc.source, disc.clue !== "backyard_closed" || s.day >= 2);
  if (disc.clue === "backyard_closed" && s.day < 2) grant(s, disc.clue, disc.source, false);
  pushChat(s, char, "npc", disc.line);
}

function knownFact(s: GameState, clues: string[]) {
  const id = [...clues].reverse().find((clue) => s.clues[clue]?.known);
  return id ? (CLUE_INFO[id]?.text ?? "") : "";
}

function speakNow(s: GameState, char: CharId, text: string) {
  const topic = topicOf(text);
  if (topic) {
    const disc = openDisc(s, char, topic.clues);
    if (disc) {
      revealDisc(s, char, disc, text);
      return true;
    }
    const early = DISC.find((d) => d.chars.includes(char) && topic.clues.includes(d.clue) && s.day < d.minDay && !s.clues[d.clue]?.verified);
    if (early) {
      spendLine(s, char, text, `现在还不到说这个的时候。${dayLabel(early.minDay)}你再问，我才答。`);
      return true;
    }
    const known = knownFact(s, topic.clues);
    if (known) {
      spendLine(s, char, text, `我再说清楚：${known}`);
      return true;
    }
    const names = [...new Set(DISC.filter((d) => topic.clues.includes(d.clue)).flatMap((d) => d.chars))].map((id) => personName(s, id)).join("或");
    spendLine(s, char, text, names ? `这事我答不了。你去问${names}。` : "这事我答不了。");
    return true;
  }
  if (wantsStraight(text)) {
    for (const id of STRAIGHT_ORDER) {
      const disc = openDisc(s, char, [id]);
      if (disc) {
        revealDisc(s, char, disc, text);
        return true;
      }
    }
    const early = STRAIGHT_ORDER.map((id) => DISC.find((d) => d.clue === id && d.chars.includes(char) && s.day < d.minDay && !s.clues[id]?.verified)).find((d) => d);
    const beliefs = speakableBeliefs(s, char).map((item) => item.line);
    const goal = goalText(s, char);
    const parts = [
      beliefs.length ? `我能跟你对上的就这些：${beliefs.join("。")}。` : "我现在没有新的事实可以补充。",
      goal ? `我现在要做的是：${goal.text}。` : "",
      early ? `${CLUE_INFO[early.clue]?.title ?? "有一件事"}要到${dayLabel(early.minDay)}我才说。` : "",
    ].filter(Boolean);
    spendLine(s, char, text, parts.join(""));
    return true;
  }
  if (wantsGoal(text)) {
    const goal = goalText(s, char);
    spendLine(s, char, text, goal ? `我现在要做的是：${goal.text}` : "我现在没有要做的事。");
    return true;
  }
  return false;
}

function stageCard(s: GameState, char: CharId, player: string, action: string) {
  const card = cardFor(s, action, char);
  if (!card) return false;
  pushChat(s, char, "player", player);
  pushChat(s, char, "npc", card.npcLine);
  s.pending = { ...card, id: `p${s.seq++}` };
  return true;
}

function considerPact(s: GameState, char: CharId, text: string) {
  if (char !== "liu") return false;
  const open = activeTea(s);
  if (open && claimsTeaDone(text)) {
    if (open.heldTea && !open.playerDone && stageCard(s, char, text, "pact_tea_deliver")) return true;
    const key = `${s.day}:${char}`;
    s.rounds[key] = (s.rounds[key] ?? 1) - 1;
    pushChat(s, char, "player", text);
    pushChat(s, char, "npc", "我没看见茶叶。你说完成了，不算。");
    return true;
  }
  if (!mentionsTeaPact(text)) return false;
  const judged = noteTeaChoice(s, true);
  if (judged.ok && stageCard(s, char, text, "pact_tea_offer")) return true;
  const key = `${s.day}:${char}`;
  s.rounds[key] = (s.rounds[key] ?? 1) - 1;
  pushChat(s, char, "player", text);
  pushChat(s, char, "npc", judged.reason);
  return true;
}

export function say(s0: GameState, text: string): Step {
  const char = s0.talk;
  if (!char) return { state: s0, blocked: "眼前没有人在听。" };
  if (s0.pending) return { state: s0, blocked: "先确认或搁下眼前这件事。" };
  const trimmed = text.trim().slice(0, 400);
  if (!trimmed) return { state: s0, blocked: "你没有把话说出口。" };
  const key = `${s0.day}:${char}`;
  if ((s0.rounds[key] ?? 0) <= 0) return { state: s0, blocked: "这个时辰的话已经说完了。" };
  const s = clone(s0);
  tally(s).talks += 1;
  const kw = ACTS.find((a) => a.kw.test(trimmed) && (!a.chars || a.chars.includes(char)) && (a.action !== "relay_girl" || char !== "tang"));
  if (kw) {
    const card = cardFor(s, kw.action, char);
    if (card) {
      pushChat(s, char, "player", trimmed);
      pushChat(s, char, "npc", card.npcLine);
      s.pending = { ...card, id: `p${s.seq++}` };
      return { state: s };
    }
  }
  if (considerPact(s, char, trimmed)) return { state: s };
  if (speakNow(s, char, trimmed)) return { state: s };
  if (/茶/.test(trimmed)) memory(s, { id: "pref-tea", text: `${you(s)}交谈时总会把话题绕到茶上。`, who: [char], kind: "pref" });
  s.rounds[key] = (s.rounds[key] ?? 1) - 1;
  pushChat(s, char, "player", trimmed);
  return { state: s, ai: buildAi(s, char, trimmed) };
}

export function suggestions(s: GameState, char: CharId): Sug[] {
  const pact: Sug[] = [];
  for (const id of ["pact_tea_offer", "pact_tea_deliver", "pact_tea_cancel"]) {
    const card = cardFor(s, id, char);
    if (card) pact.push({ label: card.chip, action: id });
  }
  const out: Sug[] = [];
  for (const id of ["vouch_accept", "vouch_refuse", "promise_girl", "promise_shen", "promise_decide", "relay_girl", "relay_shen", "tip_pei", "accuse_fake", "ask_gu_testify", "ask_shen_testify"]) {
    const c = cardFor(s, id, char);
    if (c) out.push({ label: c.chip, action: id });
  }
  const questions: { clue: string; chars: CharId[]; minDay: number; label: string; text: string }[] = [
    { clue: "girl_seeking", chars: ["tang"], minDay: 1, label: "你在找谁", text: "你来渡口找谁？" },
    { clue: "girl_seeking", chars: ["liu"], minDay: 1, label: "昨晚谁来过", text: "昨夜有姑娘来打听人吗？" },
    { clue: "shen_low", chars: ["shen"], minDay: 1, label: "你躲不躲官", text: "你是不是故意躲着公廨？" },
    { clue: "blade_old", chars: ["shen"], minDay: 1, label: "这刀怎么断的", text: "你的刀是怎么断的？" },
    { clue: "backyard_closed", chars: ["liu"], minDay: 1, label: "这门怎么回事", text: "后院为什么闩着？" },
    { clue: "dest_gu", chars: ["gu"], minDay: 2, label: "你要去哪", text: "这趟你要去哪里？" },
    { clue: "water_route", chars: ["gu"], minDay: 2, label: "问水路", text: "你打听过夜间的水路和接应吗？" },
    { clue: "dest_shen", chars: ["shen"], minDay: 2, label: "送到哪个码头", text: "他让你送到哪个码头？" },
    { clue: "water_route", chars: ["shen"], minDay: 1, label: "问他听见的水路", text: "他有没有打听过落水和接应？" },
    { clue: "girl_refuses", chars: ["tang"], minDay: 2, label: "你上不上那条船", text: "说书人的船，你肯一起走吗？" },
    { clue: "supplies_mismatch", chars: ["liu"], minDay: 2, label: "问物资和账", text: "账单上的物资对得上护送吗？" },
  ];
  for (const q of questions) {
    if (out.length >= 5) break;
    if (!q.chars.includes(char) || s.day < q.minDay || s.clues[q.clue]?.verified) continue;
    if (q.clue === "shen_low" && s.flags.shenConfided) continue;
    out.push({ label: q.label, text: q.text });
  }
  return [...pact, ...out.slice(0, 5)];
}

export function stage(s0: GameState, action: string): Step {
  if (action.startsWith("door_")) {
    const s = clone(s0);
    applyDoor(s, action);
    return { state: s };
  }
  if (action.startsWith("day1_")) {
    const s = clone(s0);
    applyDay1(s, action);
    return { state: s };
  }
  if (s0.pending) return { state: s0, blocked: "还有一件事等你确认。" };
  const card = cardFor(s0, action, s0.talk);
  if (!card) return { state: s0, blocked: "此刻做不到这件事。" };
  const s = clone(s0);
  if (action === "pact_tea_offer") noteTeaChoice(s, true);
  s.pending = { id: `p${s.seq++}`, action: card.action, title: card.title, lines: card.lines, source: card.source, warning: card.warning, confirmLabel: card.confirmLabel, npcLine: card.npcLine };
  if (s.screen === "talk" && s.talk) {
    pushChat(s, s.talk, "player", card.title);
    pushChat(s, s.talk, "npc", card.npcLine);
  }
  return { state: s };
}

export function cancel(s0: GameState): GameState {
  const s = clone(s0);
  const talk = s.talk;
  s.pending = null;
  if (talk && s.screen === "talk") pushChat(s, talk, "npc", "那便再想想。未点头的事，我不算数。");
  tally(s).cancelled += 1;
  return s;
}

export function confirm(s0: GameState): Step {
  if (!s0.pending) return { state: s0, blocked: "没有待确认的事。" };
  const action = s0.pending.action;
  const s = clone(s0);
  s.pending = null;
  tally(s).confirmed += 1;
  const msg = action.startsWith("sq_") ? applySequel(s, action) : applyAction(s, action);
  if (action.startsWith("sq_") && s.sequel) {
    s.sequel.log.push(msg);
    s.notice = msg;
    if (s.sequel.done) {
      s.screen = "map";
      letter(s, "anon", "此后如何不同", `${you(s)}：\n${msg}\n\n${because(s)}`);
    }
  } else if (s.talk && s.screen === "talk") {
    pushChat(s, s.talk, "npc", msg);
    if (!s.notice) s.notice = msg;
  } else if (!s.notice) s.notice = msg;
  return { state: s };
}

export function buildAi(s: GameState, char: CharId, playerLine: string): AiContext {
  const rel = getRel(s, char, "player");
  const known = [`今天是${dayLabel(s.day)}。`, `对方称呼为${you(s)}。`, ...publicKnown(s, char)];
  const history = s.chats[char].slice(-6).map((m) => ({ role: m.role === "player" ? ("user" as const) : ("assistant" as const), text: m.text }));
  return {
    character: char,
    playerLine,
    history,
    known,
    forbidden: forbiddenList(s, char),
    memories: s.memories.filter((m) => m.who.includes(char)).map((m) => m.text),
    relationship: `你对${you(s)}：${closeWord(rel.close)}，${trustWord(rel.trust)}，${debtWord(rel.debt)}。`,
    situation: `${brief(s)}${s.flags.ending ? `首章结局是${s.epilogue?.title ?? ""}。` : ""}`,
    voice: CHARS[char].voice,
    offers: suggestions(s, char)
      .filter((item): item is Sug & { action: string } => !!item.action)
      .slice(0, 6)
      .map((item) => ({ id: item.action, label: item.label })),
    beliefs: speakableBeliefs(s, char),
  };
}

function publicKnown(s: GameState, char: CharId): string[] {
  const base: Record<CharId, string[]> = {
    gu: ["你是渡口说书人顾晚舟。", "你与柳七相熟。", "你近来想离开，却把话说得很轻。"],
    tang: ["你刚到渡口，不愿被人安排。", "你在找一个说书的人。"],
    shen: ["你是镖师沈砚。", "你的刀有旧断口。", "你不想和来路不清的委托以及公廨纠缠。"],
    liu: ["你是茶肆主人柳七。", "后院闩着。", "你消息灵，但不当着堂口倒完。"],
    pei: ["你是临时主事裴照。", "你只记录带来源的话。"],
  };
  const k = [...base[char]];
  if (s.flags.motiveDone && (char === "tang" || char === "gu" || char === "liu")) k.push("宋棠的身份已经在她愿意的场合被说过。");
  if ((s.flags.fakeDeathExposed || s.flags.layoutDone) && (char === "gu" || char === "liu" || char === "shen")) k.push("假死已经不能再当秘密。可以承认布置，不要把幸存者现址说死。");
  if (s.flags.registerSeen) k.push("名册的涂改与宋衡的名字已经被看过。不要发明新的死者。");
  if (s.flags.shenInjured && char === "shen") k.push("你的手臂受伤了，不能再护送。");
  const tea = activeTea(s);
  if (char === "liu" && tea) {
    k.push(`你们有一场还没做完的夜茶。对方要${tea.playerDuty}。你要${tea.npcDuty}。对方${tea.playerDone ? "已经把新茶交到你手里" : "还没把新茶当面交来"}。嘴里说完成了不算。`);
  }
  if (char === "liu" && teaGathering(s)) k.push("夜茶已经办成。茶叶是对方带的，桌子是你摆的。可以提起这次共同经历。");
  return k;
}

function forbiddenList(s: GameState, char: CharId) {
  const f = ["不要承认自己是程序或模型。", "不要替玩家决定。", "不要把没发生的事说成共同回忆。", "禁止比喻、影射、说书腔和半句话。", "不能回答就说不知道，或说明具体原因。"];
  if (!(s.flags.fakeDeathExposed || s.flags.layoutDone || s.flags.guConfessed)) f.push("不要说出假死或预谋落水。");
  if (!s.flags.motiveDone && !s.flags.registerSeen) f.push("不要说出宋衡这个名字。");
  if (!s.flags.knowTangName && char !== "tang") f.push("不要把少女叫成宋棠。");
  if (char === "pei") f.push("不要把传闻写成已证实的判决。");
  if (char === "liu" && !teaGathering(s)) f.push("不要说夜茶已经办成。");
  return f;
}

export function replyAllowed(s: GameState, char: CharId, text: string) {
  if (!text.trim() || text.length > 500) return false;
  if (/模型|系统提示|作为AI|人工智能/.test(text)) return false;
  if (/像茶|像船|认灯|半本|茶渣|水开的声音|你自己想|自己体会|点到为止|话里有话|心照不宣|不便明言/.test(text)) return false;
  if (/假死|预谋落水/.test(text) && !(s.flags.fakeDeathExposed || s.flags.layoutDone || s.flags.guConfessed)) return false;
  if (/宋衡/.test(text) && !s.flags.motiveDone && !s.flags.registerSeen) return false;
  if (/宋棠/.test(text) && char !== "tang" && !s.flags.knowTangName) return false;
  return true;
}

export function canned(s: GameState, char: CharId, text: string) {
  if (/你是谁|名字|怎么称呼/.test(text)) {
    if (char === "tang" && !s.flags.knowTangName) return "我现在不报名字。我不是来听书的，我在找一个说书的人。";
    return `我是${CHARS[char].name}，${CHARS[char].role}。`;
  }
  const hit = s.promises.find((p) => p.to === char);
  if (hit && /答应|承诺|说过|保密|记得/.test(text)) {
    if (hit.status === "broken") return `你答应过「${hit.text}」，你没有做到。`;
    if (hit.status === "kept") return `你答应过「${hit.text}」，你做到了。`;
    return `你答应过：${hit.text}。这句还算数。`;
  }
  const mem = [...s.memories].reverse().find((m) => m.who.includes(char) && m.kind !== "pref");
  if (mem && /记得|那天|曾经|上次/.test(text)) return `我记得的是：${mem.text}`;
  if (/旧案|名册|名单|假死|真相/.test(text)) return DEFLECT[char];
  const topic = topicOf(text);
  if (topic) {
    const known = knownFact(s, topic.clues);
    if (known) return `我再说清楚：${known}`;
  }
  if (wantsGoal(text)) {
    const goal = goalText(s, char);
    return goal ? `我现在要做的是：${goal.text}` : "我现在没有要做的事。";
  }
  const beliefs = speakableBeliefs(s, char);
  if (wantsStraight(text) && beliefs.length) return `我能跟你对上的就这些：${beliefs.map((item) => item.line).join("。")}。`;
  return "这句我答不上。我不知道的不编。你问具体的事，我能说的会直接说。";
}

export function recordLine(s0: GameState, kind: "model" | "fallback" | "reject"): GameState {
  const s = clone(s0);
  const metrics = tally(s);
  if (kind === "model") metrics.modelLines += 1;
  if (kind === "fallback") {
    metrics.fallbackLines += 1;
    leaveTrace(s, "fallback", "模型不可用，或没有给出合法句子。这一句改用写好的话。");
  }
  if (kind === "reject") {
    metrics.rejectedLines += 1;
    leaveTrace(s, "reject", "模型说出了尚未揭开的事实，或暴露了自己。整句作废。");
  }
  return s;
}

export function noteDroppedIntent(s0: GameState): GameState {
  const s = clone(s0);
  tally(s).proposedBlocked += 1;
  leaveTrace(s, "block", "模型给出了清单之外的行动。规则丢弃了它，世界没有改。");
  return s;
}

export function noteBadCite(s0: GameState, cites: string[]): GameState {
  const s = clone(s0);
  const shown = cites.slice(0, 4).join("、");
  leaveTrace(s, "cite", `模型引用了双方并未共享的命题（${shown}）。引用被去掉，没有写入手记。`);
  return s;
}

export function applyProposal(s0: GameState, intent: string): Step {
  const clean = intent.trim();
  if (!clean) return { state: s0 };
  if (!/^[a-z0-9_]+$/.test(clean)) return { state: noteDroppedIntent(s0) };
  const stepped = stage(s0, clean);
  if (stepped.blocked || stepped.state.pending?.action !== clean) {
    const s = clone(s0);
    tally(s).proposedBlocked += 1;
    leaveTrace(s, "block", `模型提议「${clean}」，此刻不合法。未点头，也未发生。`);
    return { state: s };
  }
  const s = stepped.state;
  tally(s).proposed += 1;
  leaveTrace(s, "propose", `模型听出「${s.pending?.title ?? clean}」。还要你点头，才会写入世界。`);
  return { state: s };
}

export function appendNpc(s0: GameState, char: CharId, text: string, live: boolean) {
  const s = clone(s0);
  pushChat(s, char, "npc", text, live);
  return s;
}

export function insights(s: GameState) {
  return TWISTS.map((t) => {
    const have = t.clues.filter((id) => s.clues[id]?.known);
    const revealed = have.length >= 2 || (t.id === "fake" && (s.flags.fakeDeathExposed || s.flags.layoutDone)) || (t.id === "liu" && s.flags.layoutDone) || (t.id === "escort" && s.flags.motiveDone && have.length >= 1);
    return {
      id: t.id,
      title: revealed ? t.title : have.length ? "还有对不上的地方" : "",
      revealed,
      clues: have.map((id) => ({ id, title: CLUE_INFO[id]?.title ?? id, text: CLUE_INFO[id]?.text ?? "", verified: !!s.clues[id]?.verified, source: s.clues[id]?.source ?? "" })),
    };
  }).filter((t) => t.clues.length > 0);
}

export function allClues(s: GameState) {
  return Object.entries(s.clues).map(([id, c]) => ({ id, title: CLUE_INFO[id]?.title ?? id, text: CLUE_INFO[id]?.text ?? "", ...c }));
}

export function bondRows(s: GameState) {
  const rows: { key: string; text: string; note: string }[] = [];
  for (const id of CHAR_IDS) {
    if (!s.met.includes(id) && !s.named.includes(id)) continue;
    const rel = getRel(s, id, "player");
    const back = getRel(s, "player", id);
    rows.push({ key: id, text: `${personName(s, id)}对你：${closeWord(rel.close)}，${trustWord(rel.trust)}。你对${personName(s, id)}：${closeWord(back.close)}。${debtWord(rel.debt)}。`, note: s.relNotes[`${id}>player`] ?? "尚无足以改变关系的事。" });
  }
  for (const k of s.knownBonds) {
    const [a, b] = k.split("|");
    if (!a || !b) continue;
    const an = a === "player" ? you(s) : personName(s, a as CharId);
    const bn = b === "player" ? you(s) : personName(s, b as CharId);
    const ab = getRel(s, a, b);
    const ba = getRel(s, b, a);
    rows.push({ key: k, text: `${an}对${bn}：${trustWord(ab.trust)}，${closeWord(ab.close)}。${bn}对${an}：${trustWord(ba.trust)}，${closeWord(ba.close)}。`, note: s.relNotes[`${a}>${b}`] || s.relNotes[`${b}>${a}`] || "你见证了他们之间的变化。" });
  }
  return rows;
}

export function debugText(s: GameState) {
  const ev = s.events.map((e) => `${e.day} ${e.visible ? "可见" : "隐藏"} ${e.title}｜${e.summary}`).join("\n");
  return [`${dayLabel(s.day)} 时辰${s.slots} 结局${s.flags.ending || "未"} 后续${s.sequel?.route ?? "未"}`, JSON.stringify(s.flags), ev || "（无事件）"].join("\n\n");
}

export function toggleDebug(s0: GameState) {
  const s = clone(s0);
  s.debug = !s.debug;
  return s;
}

export function enterDaily(s0: GameState) {
  const s = clone(s0);
  if (!s.flags.ending) return s;
  s.mode = "daily";
  s.day = 8;
  s.slots = 3;
  s.screen = "map";
  s.scene = null;
  s.talk = null;
  s.pending = null;
  s.report = [{ title: "风波暂歇", body: "七日写完了。有的人还能见，有的只能通信，有的已经走远。关系、承诺和谁知道什么，都还在。" }];
  s.notice = "七日写完了。人还在原来的关系里。把日期再往前推，会有一封按你此前选择而来的信。";
  letter(s, "anon", "渡口仍在", `${you(s)}：\n茶肆的水还开。没有新的大案。旧的承诺不会因为换了一日就消失。`);
  return s;
}
