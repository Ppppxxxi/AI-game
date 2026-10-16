import {
  breakPromise,
  bump,
  clone,
  did,
  getRel,
  grant,
  keepPromise,
  markDid,
  memory,
  personName,
  promise,
  pushEvent,
  revealBond,
  you,
} from "./mutate.ts";
import { confirmTeaCancel, confirmTeaDeliver, confirmTeaOffer } from "./pact.ts";
import type { EndingId, Epilogue, Flags, GameState } from "./types.ts";

function finishScene(s: GameState, msg: string) {
  s.scene = null;
  s.pending = null;
  s.notice = msg;
  if (!s.flags.ending) s.screen = "map";
}

function seeRegister(s: GameState, source: string) {
  s.flags.registerSeen = true;
  grant(s, "names_altered", source, true);
  grant(s, "father_not_saved", source, true);
  grant(s, "register_double", source, true);
}

export function canTestify(s: GameState) {
  const f = s.flags;
  if (!f.registerSeen) return false;
  if (f.registerWith === "lost" || f.registerWith === "contested" || f.registerWith === "none" || f.registerWith === "liu") {
    return false;
  }
  return (f.guWillTestify || f.shenWillTestify) && !!s.clues.names_altered?.known;
}

export function testifyBlock(s: GameState) {
  if (canTestify(s)) return undefined;
  if (!s.flags.registerSeen) return "名册还没有被你亲眼确认";
  if (s.flags.registerWith === "liu") return "名册在柳七处，她不肯把它交公";
  if (s.flags.registerWith === "contested" || s.flags.registerWith === "lost" || s.flags.registerWith === "none") {
    return "证据已经不完整，撑不起当堂的证词";
  }
  if (!(s.flags.guWillTestify || s.flags.shenWillTestify)) return "还没有可信的人愿意当堂作证";
  return "涂改尚未被确认";
}

export function canEvacuate(s: GameState) {
  const know = !!(s.clues.names_altered || s.flags.liuConfessed || s.clues.father_not_saved);
  const liuHelps = getRel(s, "liu", "player").trust >= 0 && !s.flags.survivorLeak;
  const shenHelps = getRel(s, "shen", "player").trust >= 1 && !s.flags.shenInjured && !s.flags.shenDetained;
  return know && (liuHelps || shenHelps);
}

export function evacuateBlock(s: GameState) {
  if (canEvacuate(s)) return undefined;
  if (!(s.clues.names_altered || s.flags.liuConfessed || s.clues.father_not_saved)) return "你还不知道该护送的是谁";
  if (s.flags.survivorLeak && !(getRel(s, "shen", "player").trust >= 1 && !s.flags.shenInjured)) {
    return "藏身处漏过风，没有人再肯为你开路";
  }
  if (s.flags.shenInjured) return "沈砚带伤，柳七也不信任你，走不了";
  return "没有人愿意为你开这条路";
}


export function applyDoor(s: GameState, action: string): string {
  if (s.fired.includes("night-door")) return "门口已经没人了。";
  s.fired.push("night-door");
  const notice =
    action === "door_in"
      ? "你走进去。裴照看了你一眼，没在堂口问你。柳七把杯子放下，什么也没补充。"
      : action === "door_listen"
        ? "你在门口听完。裴照问了人在哪，柳七说镖站白日有人，夜里她不管。他点头走了。"
        : "你离开了。门里的问答你没有听完。";
  pushEvent(s, {
    title: action === "door_leave" ? "从茶肆门口离开" : "门口听见公廨来人",
    summary: notice,
    visible: true,
    who: ["player", "pei", "liu"],
    causes: ["player-told-pei-shen"],
    effects: ["night-door"],
  });
  memory(s, { id: "mem-night-door", text: notice, who: ["pei", "liu"], kind: "secret" });
  s.scene = null;
  s.screen = "map";
  s.notice = notice;
  return notice;
}

export function applyDay1(s: GameState, action: string): string {
  if (!s.fired.includes("day1-seen")) s.fired.push("day1-seen");
  let notice = "你先在渡口走走。茶肆的门还开着，冷茶还在柜上。";
  if (action === "day1_ask") {
    grant(s, "girl_seeking", "柳七", false);
    notice = "柳七说，昨晚有个年轻姑娘来打听说书的人，没留名字。人到现在没回来。";
  } else if (action === "day1_door") {
    grant(s, "backyard_closed", "你看见门闩", false);
    notice = "门是从里面落下的，不像今天才动的工。柳七说，里面的事现在不当着堂口讲。";
  }
  s.scene = null;
  s.screen = "map";
  s.notice = notice;
  return notice;
}

export function applyAction(s: GameState, action: string): string {
  const f = s.flags;
  const name = you(s);
  switch (action) {
    case "vouch_accept": {
      if (f.vouch !== "none") return "这纸保你已经处理过了。";
      f.vouch = "accepted";
      markDid(s, action);
      promise(s, "vouch", "gu", "为顾晚舟的黎明护送作保", 3);
      bump(s, "gu", "player", { trust: 1, debt: 1 }, "vouch-acc", "顾晚舟因你作保而欠你一个人情。");
      bump(s, "player", "gu", { trust: 1 }, "vouch-acc-p", "你把名字写进了这趟护送。");
      memory(s, { id: "mem-vouch", text: `${name}为护送作保。`, who: ["gu", "shen"], kind: "help" });
      pushEvent(s, { title: "作保", summary: `${name}为黎明护送画押。`, visible: true, who: ["player", "gu"], causes: [], effects: ["vouch=accepted"] });
      finishScene(s, "你的名字写上了保书。这趟护送，从此与你有关。");
      return "名字我收下了。天亮之前，别反口。";
    }
    case "vouch_refuse": {
      if (f.vouch !== "none") return "你的态度已经明白了。";
      f.vouch = "refused";
      markDid(s, action);
      bump(s, "gu", "player", { trust: -1 }, "vouch-no", "顾晚舟因你拒绝作保而少了一分信任。");
      bump(s, "shen", "player", { trust: 1 }, "vouch-no-shen", "沈砚觉得你没有把浑水推给他。");
      pushEvent(s, { title: "拒绝作保", summary: `${name}拒绝画押，不承担担保责任。`, visible: true, who: ["player", "gu", "shen"], causes: [], effects: ["vouch=refused"] });
      finishScene(s, "你没有作保。说书人会另想办法，你仍可以查。");
      return "那我另找人。你不必愧，也别装没听见。";
    }
    case "hold_vouch": {
      s.scene = null;
      s.screen = "map";
      s.notice = "你先去核对。第二日结束前若不表态，他会当成你拒绝了。";
      return "去查吧。";
    }
    case "promise_girl": {
      if (f.girlWhere !== "none") return "这句你说过了。";
      f.girlWhere = "kept";
      promise(s, "girl-secret", "tang", "不把宋棠的行踪与托付说出去");
      bump(s, "tang", "player", { trust: 1 }, "promise-girl", "宋棠因为你的保密而多信你一分。");
      s.notice = "你答应为她保密。";
      return "我记住了。你若食言，我也记得。";
    }
    case "promise_shen": {
      if (f.shenWhere !== "none") return "你已经给过他答案。";
      f.shenWhere = "kept";
      promise(s, "shen-secret", "shen", "不把沈砚回避公廨的事说出去");
      bump(s, "shen", "player", { trust: 1 }, "promise-shen", "沈砚因你守口而愿意再信你一句。");
      s.notice = "你答应不把他的行踪送到公廨。";
      return "好。就这句。";
    }
    case "promise_decide": {
      promise(s, "not-decide", "tang", "不替宋棠决定她的命运与名册去向");
      bump(s, "tang", "player", { trust: 1, close: 1 }, "not-decide", "宋棠把决定权留在自己手里，因而靠近你。");
      s.notice = "你答应不替她做主。";
      return "这句我收下。";
    }
    case "relay_girl": {
      const to = s.talk;
      if (!to || to === "tang") return "这句没有送到该听的人耳朵里。";
      if (did(s, `relay_girl:${to}`)) return "你已经告诉过这个人。";
      markDid(s, `relay_girl:${to}`);
      pushEvent(s, { title: "传话", summary: `${name}把「少女在追查说书人与旧案」告诉了${personName(s, to)}。`, visible: true, who: ["player", to], causes: [], effects: ["girl shared"] });
      if (f.girlWhere === "kept") {
        f.girlWhere = "broken";
        breakPromise(s, "girl-secret");
        bump(s, "tang", "player", { trust: -2, close: -1 }, "broke-girl", "宋棠发现自己的事被你说了出去。");
      }
      bump(s, to, "player", { trust: 1 }, `relay-girl-${to}`, `${personName(s, to)}收下了这条消息。`);
      memory(s, { id: `mem-relay-girl-${to}`, text: `${name}向${personName(s, to)}转述了少女在查案。`, who: [to], kind: "secret" });
      s.notice = `你把她的事告诉了${personName(s, to)}。`;
      return "我听见了。至于我信不信，得看下一次谁来对质。";
    }
    case "relay_shen": {
      if (did(s, "relay_shen")) return "这件事你已经告诉过裴照。";
      markDid(s, "relay_shen");
      f.toldPeiAboutShen = true;
      pushEvent(s, { id: "player-told-pei-shen", title: "向裴照转述沈砚", summary: `${name}告诉裴照：沈砚不愿见官。裴照尚未核实。`, visible: true, who: ["player", "pei"], causes: [], effects: ["toldPeiAboutShen"] });
      if (f.shenWhere === "kept") {
        f.shenWhere = "broken";
        breakPromise(s, "shen-secret");
      }
      memory(s, { id: "mem-told-pei-shen", text: `${name}向裴照说了沈砚的行踪态度。`, who: ["pei", "shen"], kind: "secret" });
      s.notice = "裴照记下了你的说法，并说夜里会自己去问。";
      return "来源是你。夜里我去镖站，不在这里下判断。";
    }
    case "tip_pei": {
      if (f.peiTipped) return "公廨已经知道护送的事。";
      f.peiTipped = true;
      markDid(s, action);
      bump(s, "pei", "player", { trust: 1 }, "tip-pei", "裴照因你提前报备而更愿意信你的来源。");
      pushEvent(s, { title: "报备护送", summary: `${name}告知裴照黎明有护送。`, visible: true, who: ["player", "pei"], causes: [], effects: ["peiTipped"] });
      s.notice = "裴照会在卯时派人到场，避免物证被围观的人毁掉。";
      return "人我会派。你若作过保，就准备好听他怎么骂。";
    }
    case "accuse_fake": {
      markDid(s, action);
      grant(s, "spare_clothes", "当面对质", true);
      pushEvent(s, { title: "说破假死准备", summary: `${name}指出护送是预谋的水，死亡尚未强演。`, visible: true, who: ["player", "gu", "liu"], causes: [], effects: ["named fake"] });
      s.notice = "你把线头说破了。第三日改为对质，不必看着它演完。";
      return "你既然看见了，明天卯时别在岸上等出殡。来拦，或来夹层。";
    }
    case "stop_quiet": {
      f.fakeDeathExposed = true;
      f.hideoutOpen = true;
      f.guConfessed = true;
      promise(s, "temp-quiet", "liu", "今日之内不在堂口宣扬夹层的事");
      bump(s, "liu", "player", { trust: 1 }, "stop-quiet", "柳七因你肯暂时保密而信你一步。");
      bump(s, "gu", "player", { trust: 1 }, "stop-quiet-gu", "顾晚舟知道你拦下了戏，却没有立刻喊人。");
      revealBond(s, "liu", "gu");
      finishScene(s, "假死停了。人进了夹层。你答应今日不在堂口张扬。");
      return "停了。";
    }
    case "demand_truth": {
      f.fakeDeathExposed = true;
      f.hideoutOpen = true;
      f.guConfessed = true;
      grant(s, "water_route", "顾晚舟当众承认问过水路", true);
      grant(s, "spare_clothes", "当场的油纸包", true);
      bump(s, "gu", "player", { trust: -1, debt: 1 }, "demand", "你逼问顾晚舟，他欠你一句解释，却不再轻易信你。");
      finishScene(s, "他承认水路和干衣是准备好的。幸存者的现址，他仍不肯说。");
      return "我问过水路。衣裳是干的。人我还不能交。";
    }
    case "tell_pei_now": {
      f.fakeDeathExposed = true;
      f.hideoutOpen = true;
      f.peiTipped = true;
      f.evidenceSecured = true;
      bump(s, "gu", "player", { trust: -2 }, "tell-pei-now", "顾晚舟认为你选择了公廨，信任跌落。");
      bump(s, "liu", "player", { trust: -1 }, "tell-pei-liu", "柳七不满你把未演完的局交给官面。");
      bump(s, "pei", "player", { trust: 1 }, "tell-pei-pei", "裴照提前接手，物证得以封存。");
      finishScene(s, "公廨介入。假死没有演完，现场被封存。顾晚舟觉得被你出卖。");
      return "我派人。你最好把已知的和猜测分开写。";
    }
    case "read_sleeve": {
      grant(s, "accuse_letter", "现场袖中书信", true);
      s.notice = "信上写着「若我有失，问沈砚」。字迹平稳，不像临死。这一场还没有结束。";
      return "看完了就说话。";
    }
    case "stand_for_shen": {
      f.sawDrowning = true;
      f.stoodForShen = true;
      grant(s, "accuse_letter", "现场", true);
      grant(s, "blade_old", "你在现场指出断口", true);
      bump(s, "shen", "player", { trust: 1, debt: 1, close: 1 }, "stand-shen", "沈砚欠你一个人情：你在人群里为他开了口。");
      bump(s, "pei", "player", { trust: -1 }, "stand-shen-pei", "裴照认为你在现场偏袒，需要另找来源。");
      finishScene(s, "你说断口不是新的。人群让开一步。信仍在，怀疑仍在，沈砚没有受伤。");
      return "……谢了。这句我记下。";
    }
    case "give_to_pei": {
      f.sawDrowning = true;
      f.evidenceSecured = true;
      grant(s, "accuse_letter", "封存的书信", true);
      grant(s, "blade_old", "封存的断刀", true);
      if (!f.peiTipped) f.shenDetained = true;
      bump(s, "pei", "player", { trust: 1 }, "give-pei", "裴照因物证完整而承认你帮了案。");
      bump(s, "shen", "player", { trust: -1 }, "give-pei-shen", "沈砚觉得你把他连人带刀交给了公廨。");
      finishScene(s, f.shenDetained ? "刀和信进了匣子。沈砚被请去问话，暂时不能离开公廨。" : "裴照的人已经在场。物证封存，秩序没有散。");
      return "匣子我来封。人我按程序问。";
    }
    case "stay_silent": {
      f.sawDrowning = true;
      grant(s, "accuse_letter", "你听见的现场", false);
      if (!f.peiTipped) {
        f.shenInjured = true;
        bump(s, "shen", "player", { trust: -1, close: -1 }, "silent-hurt", "你沉默时人群涌上，沈砚带伤杀出，他认为你见死不救。");
      } else bump(s, "shen", "player", { trust: -1 }, "silent", "沈砚记得你在场，却没有开口。");
      finishScene(s, f.shenInjured ? "你没有说话。沈砚自己挤出人群，左臂伤了。说书人没有被捞上来。" : "你没有说话。公廨的人维持了现场。说书人仍没有回来。");
      return "随你。";
    }
    case "ally_respect": {
      f.motiveDone = true;
      f.girlCoop = "ally";
      f.knowTangName = true;
      f.tangWillTestify = true;
      if (!s.named.includes("tang")) s.named.push("tang");
      promise(s, "not-decide", "tang", "不替宋棠决定她的命运与名册去向");
      grant(s, "motive_truth", "宋棠亲口", true);
      grant(s, "names_rumor", "宋棠听来的幸存者口述", false);
      grant(s, "girl_refuses", "宋棠亲口", true);
      bump(s, "tang", "player", { trust: 1, close: 1 }, "ally", "宋棠与你约定一起查，决定权仍在她。");
      memory(s, { id: "mem-ally", text: `${name}答应不替宋棠做主，并与她一起查旧案。`, who: ["tang"], kind: "promise" });
      finishScene(s, "她告诉你自己是宋衡之女。你们一起查，但下一步不由你写。");
      return "可以。从现在起，叫我宋棠。";
    }
    case "ally_control": {
      f.motiveDone = true;
      f.girlCoop = "ally";
      f.decidedForHer = true;
      f.knowTangName = true;
      if (!s.named.includes("tang")) s.named.push("tang");
      grant(s, "motive_truth", "宋棠亲口", true);
      grant(s, "girl_refuses", "宋棠亲口", true);
      bump(s, "tang", "player", { close: -1 }, "control", "宋棠恨你要替她安排，只勉强与你同行。");
      finishScene(s, "她仍与你同行，但认为你抢走了决定权。她的信任没有增加。");
      return "你又要替我决定。我暂时跟着查。心不跟。";
    }
    case "stay_out": {
      f.motiveDone = true;
      f.girlCoop = "doubt";
      f.knowTangName = true;
      if (!s.named.includes("tang")) s.named.push("tang");
      grant(s, "motive_truth", "宋棠亲口", true);
      grant(s, "girl_refuses", "宋棠亲口", true);
      finishScene(s, "你知道了她是宋衡之女，但没有与她结盟。");
      return "那你就记住名字。别拿它去做交易。";
    }
    case "press_liu": {
      f.layoutDone = true;
      f.hideoutOpen = true;
      f.liuConfessed = true;
      f.fakeDeathExposed = true;
      const full = getRel(s, "liu", "player").trust >= 1;
      grant(s, "liu_role", "柳七坦白", true);
      grant(s, "register_double", "柳七说明名册的两面", true);
      if (full) {
        f.guConfessed = true;
        grant(s, "names_altered", "柳七转述", false);
        bump(s, "liu", "player", { trust: 1 }, "liu-full", "柳七把局说全了，因为她信你不会立刻卖掉活人。");
      } else bump(s, "liu", "player", { trust: -1 }, "liu-half", "柳七只承认一半，她觉得你问得太像盘查。");
      revealBond(s, "liu", "gu");
      const msg = full
        ? "柳七承认：假死是为了把追名册的人引开，护住夹层里的人。顾晚舟改过一部分名字，救过一些人，没救下宋衡。"
        : "柳七只承认自己帮着准备了「一场不必真死的水」。幸存者的名字她不肯说。";
      finishScene(s, msg);
      return full ? "我说完了。人还在，册子也还在。你别一次都要。" : "我承认布置。别的，你还没资格听。";
    }
    case "press_shen": {
      f.layoutDone = true;
      f.hideoutOpen = true;
      f.shenConfessed = true;
      f.shenDetained = false;
      f.fakeDeathExposed = true;
      grant(s, "blade_truth", "沈砚说明", true);
      grant(s, "liu_role", "沈砚指向柳七与说书人", true);
      bump(s, "shen", "player", { trust: 1 }, "shen-confess", "沈砚把断刀的来历告诉了你。");
      revealBond(s, "shen", "gu");
      finishScene(s, "沈砚说：刀是他击断船栏、中止那场假落水时磕断的。袖中的信是说书人自己写的，为了让场面足够响。");
      return "我没杀人。我拦住了一场要演给人看的死。";
    }
    case "mediate": {
      f.layoutDone = true;
      f.hideoutOpen = true;
      f.mediated = true;
      f.liuConfessed = true;
      f.fakeDeathExposed = true;
      grant(s, "liu_role", "对谈", true);
      grant(s, "register_double", "对谈", true);
      bump(s, "tang", "liu", { trust: 1, close: 1 }, "mediate-tl", "在你引见之后，宋棠愿意再听柳七一次。");
      bump(s, "liu", "tang", { trust: 1, close: 1 }, "mediate-lt", "柳七对宋棠放下了一分戒备。");
      bump(s, "tang", "shen", { trust: 1 }, "mediate-ts", "宋棠从这场谈话里开始信任沈砚的判断。");
      revealBond(s, "tang", "liu");
      revealBond(s, "tang", "shen");
      finishScene(s, "两人没有和好，但把假死的目的说通了：引开追名册的人，而不是让宋棠永远不知道父亲为何死。她因此也愿意再信沈砚一次。");
      return "谈完了。不是和解，是终于用的是同一套事实。";
    }
    case "leak_hide": {
      f.layoutDone = true;
      f.survivorLeak = true;
      f.hideoutOpen = true;
      f.fakeDeathExposed = true;
      if (f.girlWhere === "kept") {
        f.girlWhere = "broken";
        breakPromise(s, "girl-secret");
      }
      if (s.promises.some((p) => p.id === "not-decide" && p.status === "open")) breakPromise(s, "not-decide");
      grant(s, "liu_role", "你向裴照描述夹层", true);
      bump(s, "pei", "player", { trust: 1 }, "leak-pei", "裴照得到藏身处的方向。");
      bump(s, "liu", "player", { trust: -2, close: -1 }, "leak-liu", "柳七认为你把她护着的人卖了。");
      bump(s, "tang", "player", { trust: -2, close: -1 }, "leak-tang", "宋棠认为你再次替所有人决定了暴露。");
      pushEvent(s, { title: "泄露藏身处", summary: `${name}告诉裴照幸存者藏在茶肆夹层一带。`, visible: true, who: ["player", "pei", "liu", "tang"], causes: [], effects: ["survivorLeak"] });
      finishScene(s, "裴照知道了夹层。柳七与宋棠都把这视为泄露。");
      return "我去核查。你最好想好怎么面对她们。";
    }
    case "reg_pei_partial":
    case "reg_pei_full":
    case "reg_liu":
    case "reg_tang":
    case "reg_player": {
      seeRegister(s, "你亲眼见过册页");
      const withMap: Record<string, Flags["registerWith"]> = {
        reg_pei_partial: "pei_partial",
        reg_pei_full: "pei_full",
        reg_liu: "liu",
        reg_tang: "tang",
        reg_player: "player",
      };
      f.registerWith = withMap[action] ?? "player";
      if (action === "reg_pei_full") {
        f.survivorLeak = true;
        bump(s, "liu", "player", { trust: -2 }, "full-liu", "全文交公，柳七认为活人被你交了出去。");
        bump(s, "tang", "player", { trust: -1 }, "full-tang", "宋棠愤怒于现名进了档案。");
        bump(s, "pei", "player", { trust: 1 }, "full-pei", "裴照得到完整名册，不会私下销毁。");
        if (s.promises.some((p) => p.id === "not-decide" && p.status === "open")) breakPromise(s, "not-decide");
      } else if (action === "reg_pei_partial") {
        bump(s, "pei", "player", { trust: 1 }, "part-pei", "裴照收到能证明涂改的页面。");
        bump(s, "liu", "player", { trust: 1 }, "part-liu", "柳七见你藏起现名，愿意再信你一次。");
      } else if (action === "reg_liu") {
        bump(s, "liu", "player", { trust: 1, debt: 1 }, "to-liu", "柳七接下名册。公堂会缺原本，活人多一道遮挡。");
      } else if (action === "reg_tang") {
        bump(s, "tang", "player", { trust: 1, close: 1 }, "to-tang", "你把名册交给宋棠，决定权回到她手上。");
        f.tangWillTestify = f.girlCoop === "ally" && !f.decidedForHer;
      } else {
        memory(s, { id: "mem-hold", text: `${name}暂时自己持有名册。`, who: ["gu", "tang", "liu"], kind: "help" });
      }
      const text =
        action === "reg_pei_full"
          ? "全文进了公牍。证据完整，活着的名字也完整。"
          : action === "reg_pei_partial"
            ? "裴照收下涂改的页面。现名没有进档案。"
            : action === "reg_liu"
              ? "名册在柳七处。公堂会缺一份原本，活人多一道遮挡。"
              : action === "reg_tang"
                ? "名册到了宋棠手里。下一步是她的。"
                : "名册在你身上。第七日之前，它还没有主人。";
      finishScene(s, text);
      return "去处我记住了。";
    }
    case "ask_gu_testify": {
      if (getRel(s, "gu", "player").trust < 0 && !f.guConfessed) {
        s.notice = "他拒绝了。信任不够，他不会站到格子纸前。";
        return "我不站。你还没让我相信站出去有用。";
      }
      f.guWillTestify = true;
      f.guConfessed = true;
      bump(s, "gu", "player", { trust: 1 }, "gu-yes", "顾晚舟答应出面，他把这当作在还宋家的债。");
      s.notice = "顾晚舟愿意公开承认：他交过名册，也改过名字。";
      return "我站。宋衡的名字我改不掉，剩下的我可以认。";
    }
    case "ask_shen_testify": {
      if (getRel(s, "shen", "player").trust < 1) {
        s.notice = "沈砚拒绝当堂作证。";
        return "私底下我说。公堂上，不。";
      }
      f.shenWillTestify = true;
      s.notice = "沈砚愿意说明断刀的来历。";
      return "我去。只说刀，不说别人藏在哪儿。";
    }
    case "ending_testify":
    case "ending_evacuate":
    case "ending_rupture":
      return chooseEndingInto(s, action.replace("ending_", "") as EndingId);
    case "pact_tea_offer":
      return confirmTeaOffer(s);
    case "pact_tea_deliver":
      return confirmTeaDeliver(s);
    case "pact_tea_cancel":
      return confirmTeaCancel(s);
    default:
      return "这件事没有发生。";
  }
}

export function chooseEndingInto(s: GameState, id: EndingId): string {
  if (id === "testify" && !canTestify(s)) return "这条路还走不通。";
  if (id === "evacuate" && !canEvacuate(s)) return "这条路还走不通。";
  s.flags.ending = id;
  s.epilogue = buildEpilogue(s, id);
  s.screen = "ending";
  s.scene = null;
  s.pending = null;
  applyWhereabouts(s, id);
  pushEvent(s, { title: "结局", summary: s.epilogue.title, visible: true, who: ["player"], causes: s.events.slice(-6).map((e) => e.id), effects: [id] });
  return s.epilogue.summary;
}

export function chooseEnding(s0: GameState, id: EndingId) {
  if (s0.flags.ending) return { state: s0, blocked: "结局已经写下。" };
  const s = clone(s0);
  const msg = chooseEndingInto(s, id);
  if (!s.flags.ending) return { state: s0, blocked: msg };
  return { state: s };
}

function applyWhereabouts(s: GameState, id: EndingId) {
  for (const c of ["gu", "tang", "shen", "liu", "pei"] as const) s.status[c] = "present";
  if (id === "testify") {
    s.status.tang = s.flags.girlCoop === "ally" ? "present" : "letter";
  } else if (id === "evacuate") {
    s.status.tang = "letter";
    s.status.liu = "letter";
    s.status.gu = s.flags.guConfessed ? "letter" : "gone";
    s.status.shen = s.flags.shenInjured ? "letter" : "present";
  } else {
    s.status.gu = "gone";
    s.status.tang = getRel(s, "tang", "player").trust <= -2 ? "gone" : "letter";
    s.status.liu = getRel(s, "liu", "player").trust <= -1 ? "letter" : "present";
    s.status.shen = s.flags.shenInjured ? "letter" : "present";
  }
}

function buildEpilogue(s: GameState, id: EndingId): Epilogue {
  const f = s.flags;
  const titles = { testify: "保留证据，出面作证", evacuate: "优先护送幸存者", rupture: "证据失守，人各离散" } as const;
  const summary = {
    testify: "岸册的涂改被当堂写下。至少有一人把知道的事说完。追索的人没有抢走原本，但站出去的人从此不能装作与旧案无关。",
    evacuate: "活人先被送走了。公堂上缺了原本或缺了证人。旧案没有在今日结案，渡口的夹层空了。",
    rupture: "名册没有形成可以当堂使用的证据，合作也没有合拢。追索的人带走了能带走的，剩下的人连夜散开。真相还在，只是难以被证明。",
  } as const;
  const cost = {
    testify: "公开作证的人承担风险。因「把事情说出去」而裂开的关系，不会因为赢了公堂就自动长好。",
    evacuate: "追责延后。你也许保住了人，也放过了让宋衡的名字被正式写下的那一天。",
    rupture: "各人离开时都带着未完成的承诺。渡口还会有茶，只是不再有这场能问完的局。",
  } as const;
  const fates = [
    {
      name: personName(s, "gu"),
      text:
        id === "testify"
          ? f.guWillTestify
            ? "他站在格子纸前，承认自己交过名单，也承认改过字。宋衡的名字他没有改口。"
            : "他没有亲自出庭，但册页留在了公廨。他在侧室里听完，没有再逃。"
          : id === "evacuate"
            ? f.guConfessed
              ? "他跟着离开的人走了。他说自己没资格再讲这本册子，可也不肯留在车夫手里。"
              : "没有人再看见他。"
            : "他在混乱里失踪。留下的只有残页。",
    },
    {
      name: personName(s, "tang"),
      text:
        id === "testify"
          ? f.girlCoop === "ally" && !f.decidedForHer
            ? "她以宋衡之女的身份出面，但拒绝让你替她润色证词。"
            : "她没有站到你身边。她说真相可以留，她的命运不由这场公堂分配。"
          : id === "evacuate"
            ? "她与幸存者一起离开。走之前她只问：这一次，是不是我自己点的头。"
            : getRel(s, "tang", "player").trust <= -2
              ? "她不再给你留地址。"
              : "她独自走了。信如果还来，也不会再称呼你为同伴。",
    },
    {
      name: personName(s, "shen"),
      text: f.shenInjured
        ? "臂伤让他没法再护送任何人。他留在能养伤的地方，刀仍缠着布。"
        : f.shenWillTestify && id === "testify"
          ? "他当堂说明断刀来自中止冲突。嫌疑卸下，他也因此不能再假装与公廨无关。"
          : "他记得你在场时开过口，或没有开口。旗仍不挂。",
    },
    {
      name: personName(s, "liu"),
      text:
        id === "evacuate"
          ? "茶肆暂时关了门。她在路上，不在柜后。"
          : f.survivorLeak
            ? "她还在渡口的影子里，但不给你留座。"
            : "她继续煮茶。门闩还在，只是里面未必还有必须藏的人。",
    },
    {
      name: personName(s, "pei"),
      text:
        id === "testify"
          ? "他保住了证据，也拒绝为任何人销毁副本。"
          : id === "evacuate"
            ? "他不拦活路，但在卷宗里写下：证人与原本均未齐。"
            : "他没能在期限内把证据留全。他把失败记在卷末。",
    },
  ];
  const promises = s.promises.map((p) => {
    const who = personName(s, p.to);
    if (p.status === "kept") return `对${who}的承诺「${p.text}」兑现了。`;
    if (p.status === "broken") return `对${who}的承诺「${p.text}」违背了。`;
    return `对${who}的承诺「${p.text}」还悬着。`;
  });
  if (promises.length === 0) promises.push("你没有留下可以兑现的诺言。这也是一种结果。");
  return {
    title: titles[id],
    summary: summary[id],
    cost: cost[id],
    fates,
    promises,
    hook: `${you(s)}在这七日里改过的，不只是结局的名字。往后若还有信来，信上的态度会按你已经做过的事，而不是按你希望被记住的样子。`,
  };
}
