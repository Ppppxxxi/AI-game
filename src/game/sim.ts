import { canEvacuate, canTestify } from "./apply.ts";
import {
  breakPromise,
  bump,
  clone,
  getRel,
  grant,
  keepPromise,
  letter,
  personName,
  pushEvent,
  revealBond,
  you,
} from "./mutate.ts";
import { tick } from "./mind.ts";
import { settlePacts } from "./pact.ts";
import type { CharId, GameState, LocId, SequelRoute, SequelVM, Step } from "./types.ts";

export function resolveUnfinished(s: GameState) {
  const f = s.flags;
  if (s.day === 2 && f.vouch === "none") {
    f.vouch = "ignored";
    bump(s, "gu", "player", { trust: -1 }, "vouch-ignore", "你直到日终也没有表态，顾晚舟把这当作拒绝。");
    letter(s, "gu", "你没有写", `${you(s)}：\n我没等到你的名字。另找了个肯画押的醉汉。船仍会走。这不怪你。\n顾晚舟`);
    pushEvent(s, { title: "担保悬置", summary: "玩家未作保。说书人另寻他人。", visible: true, who: ["gu", "player"], causes: [], effects: ["vouch=ignored"] });
  }
  if (s.day === 3 && !f.fakeDeathExposed && !f.sawDrowning) {
    if (fakeReady(s)) {
      f.fakeDeathExposed = true;
      f.hideoutOpen = true;
      letter(s, "liu", "戏没收", `${you(s)}：\n他看见你手里那些线头了。护送停了，人在夹层。你没来，所以整句话我没当面说。门我给你留一条缝。\n柳七`);
      s.report.push({ title: "护送停了", body: "你没有当场拦，但准备已经露馅。说书人收了计划，躲进夹层。死亡没有被强演。" });
    } else {
      f.sawDrowning = true;
      grant(s, "accuse_letter", "渡口传闻", false);
      if (!f.peiTipped) f.shenInjured = true;
      else f.evidenceSecured = true;
      letter(s, "anon", "渡口落水", `${you(s)}：\n你不在岸上。说书的在离岸三丈没了影，人没捞着。外衫挂在船桩上，袖里有信，指沈砚。刀是断的。\n一个不愿留名的船夫`);
      s.report.push({
        title: "你错过了现场",
        body: f.shenInjured ? "落水发生时你不在。沈砚带伤离开。指认他的信已经在传闻里走了一圈。" : "落水发生时你不在。裴照的人保住了现场。你只听到转述。",
      });
    }
  }
  if (s.day === 3) {
    const p = s.promises.find((x) => x.id === "vouch");
    if (p && p.status === "open") {
      if (f.vouch === "accepted" && f.peiTipped && !f.fakeDeathExposed) breakPromise(s, "vouch");
      else if (f.vouch === "accepted") keepPromise(s, "vouch");
    }
  }
  if (s.day === 4 && !f.motiveDone) {
    f.motiveDone = true;
    f.knowTangName = true;
    f.girlCoop = "doubt";
    if (!s.named.includes("tang")) s.named.push("tang");
    grant(s, "motive_truth", "宋棠的信", true);
    grant(s, "girl_refuses", "宋棠的信", true);
    letter(s, "tang", "我不让别人写", `${you(s)}：\n我叫宋棠，宋衡的女儿。我来找说书的，不是来上船的。他若安排护送，是怕我问到证人。你今天没来，我就自己写。别替我决定下一步。\n宋棠`);
    s.report.push({ title: "来意送到了信上", body: "你没有去听她当面说。她仍把身份写给你。这是后补的入口，信任不会因此增加。" });
  }
  if (s.day === 5 && !f.layoutDone) {
    f.layoutDone = true;
    f.hideoutOpen = true;
    f.fakeDeathExposed = true;
    const liuFirst = getRel(s, "liu", "player").trust >= getRel(s, "gu", "player").trust;
    if (liuFirst) f.liuConfessed = true;
    else f.guConfessed = true;
    grant(s, "liu_role", "日终来信", true);
    grant(s, "blade_truth", "日终来信", false);
    grant(s, "register_double", "日终来信", true);
    letter(
      s,
      liuFirst ? "liu" : "gu",
      "有句话不能再瞒到明天",
      liuFirst
        ? `${you(s)}：\n假死是我们布置的，为了把追名册的人引开。断刀不是凶案。名册能证旧案，也能害了还藏着的人。你今天没来问，我就写到这里。\n柳七`
        : `${you(s)}：\n我没死。水是准备好的。柳七帮我，是为了护人，不是为了害沈砚。名册上我改过字，没改下宋衡。\n顾晚舟`,
    );
  }
  if (s.day === 6 && !f.registerSeen) {
    f.registerWith = "contested";
    f.registerSeen = true;
    grant(s, "names_altered", "被翻出来的册页", true);
    grant(s, "father_not_saved", "被翻出来的册页", true);
    grant(s, "register_double", "被翻出来的册页", true);
    bump(s, "liu", "player", { trust: -1 }, "contest-liu", "名册在混乱中被翻出，柳七怪你没有及时处置。");
    bump(s, "tang", "player", { trust: -1 }, "contest-tang", "宋棠怪你让名册的去向变成了一场争抢。");
    letter(s, "pei", "册页污损", `${you(s)}：\n茶罐夹层被人翻过。涂改还在，宋衡的名字还在，现名有的已经模糊。这不能算完整证据。\n裴照`);
    s.report.push({ title: "你没有亲手决定名册", body: "册子在争夺里受损。涂改与宋衡的名字仍能辨认，但去向已经不由你选择。" });
  }
  if (s.day === 6) {
    if (!f.guWillTestify && f.registerSeen && !["contested", "lost", "none"].includes(f.registerWith) && (f.guConfessed || f.fakeDeathExposed) && getRel(s, "gu", "player").trust >= 1) {
      f.guWillTestify = true;
      letter(s, "gu", "我可以站出去", `${you(s)}：\n若你要我认那本册子，我认。宋衡的名字我改不掉。\n顾晚舟`);
    }
    if (!f.shenWillTestify && s.clues.blade_truth && getRel(s, "shen", "player").trust >= 1 && !f.shenInjured) {
      f.shenWillTestify = true;
      letter(s, "shen", "刀的事我可以当堂说", `${you(s)}：\n只说刀怎么断的。藏人的地址我不知道，也不编。\n沈砚`);
    }
  }
}

function fakeReady(s: GameState) {
  return ["spare_clothes", "water_route", "backyard_closed", "supplies_mismatch"].filter((id) => s.clues[id]?.known).length >= 2;
}

export function autonomous(s: GameState) {
  tick(s);
}

export function endDay(s0: GameState): Step {
  if (s0.mode === "daily") return advanceDaily(s0);
  if (s0.day >= 7) return { state: s0, blocked: "第七日不能靠睡觉翻过去。去公廨把路选完。" };
  const s = clone(s0);
  const dropped = s.pending ? { title: "未确认的事搁下了", body: "你没有点头。世界没有因此改变。" } : null;
  s.pending = null;
  s.report = dropped ? [dropped] : [];
  resolveUnfinished(s);
  autonomous(s);
  if (s.fired.includes("night-door") && !s.fired.includes("liu-door-letter")) {
    s.fired.push("liu-door-letter");
    letter(s, "liu", "他问完就走了", `${you(s)}：\n他问完就走了。我没有把后头的人交出去。你要是还有话，自己来。\n柳七`);
  }
  settlePacts(s);
  s.day += 1;
  s.slots = 3;
  s.talk = null;
  s.scene = null;
  s.loc = null;
  s.screen = "dayend";
  if (s.report.length === 0) {
    s.report.push({
      title: "这一夜",
      body: s.letters.some((l) => l.unread) ? "没有当众发生的大事。信匣里有你该看的东西。" : "渡口安静。没有新的误会找上门。",
    });
  }
  return { state: s };
}

function advanceDaily(s0: GameState): Step {
  const s = clone(s0);
  s.report = [];
  s.pending = null;
  runDaily(s);
  settlePacts(s);
  if (!s.sequel && !s.letters.some((l) => l.id.startsWith("sq"))) queueSequel(s);
  s.day += 1;
  s.slots = 3;
  s.talk = null;
  s.screen = "dayend";
  s.scene = null;
  if (s.report.length === 0) s.report.push({ title: "平静的一日", body: "没有够格发生的事。旧承诺都还挂在原处，不会被重复触发。" });
  return { state: s };
}

function runDaily(s: GameState) {
  const f = s.flags;
  let count = 0;
  const take = (id: string) => {
    if (count >= 2 || s.fired.includes(id)) return false;
    s.fired.push(id);
    count += 1;
    return true;
  };
  if (f.girlWhere === "kept" && s.status.tang !== "gone" && take("echo-kept")) {
    letter(s, "tang", "你当时没有说", `${you(s)}：\n旧事没有翻篇。我还记得你把该守的话守住了。今日没有新的要求。\n${personName(s, "tang")}`);
    bump(s, "tang", "player", { close: 1 }, "echo-kept", "宋棠因你守过秘密而更愿意接近你。");
    s.report.push({ title: "旧事回响", body: "守口被记住了。这不是新的承诺，是旧的还在生效。" });
  } else if (f.girlWhere === "broken" && s.status.tang !== "gone" && take("echo-broken")) {
    letter(s, "tang", "那句话还在", `${you(s)}：\n你说过不说。后来还是说了。我不是来和好的。\n${f.knowTangName ? "宋棠" : "未署名"}`);
    s.report.push({ title: "旧事回响", body: "违背的承诺没有因为七日结束而注销。" });
  }
  if (f.stoodForShen && s.status.shen !== "gone" && take("favor-shen")) {
    letter(s, "shen", "还你一句", `${you(s)}：\n当日你在人群里开过口。我只能告诉你：西棚近来有生人问姓氏。\n沈砚`);
    s.report.push({ title: "人情往来", body: "沈砚用一条消息还你当日的开口。" });
  }
  if (!f.mediated && f.liuConfessed && f.girlCoop === "ally" && s.status.liu === "present" && s.status.tang !== "gone" && take("conflict-pair")) {
    bump(s, "tang", "liu", { trust: -1 }, "daily-conflict", "宋棠与柳七因名册去向再度争执。");
    bump(s, "liu", "tang", { trust: -1 }, "daily-conflict-2", "柳七觉得宋棠把旧账放在渡口安危之前。");
    revealBond(s, "tang", "liu");
    pushEvent(s, { title: "宋棠与柳七争执", summary: "两人目标冲突。玩家不在场。", visible: true, who: ["tang", "liu"], causes: [], effects: ["trust -1"] });
    letter(s, "liu", "她来问罪", `${you(s)}：\n宋棠夜里来过。我们没有打起来，也没有和好。你若还想掺和，就自己来。\n柳七`);
    s.report.push({ title: "人物冲突", body: "宋棠与柳七起了争执。你能看见的只有柳七愿意告诉你的那部分。" });
  }
  const due = s.promises.find((p) => p.status === "open" && p.dueDay && p.dueDay <= s.day);
  if (due && take(`due-${due.id}`)) {
    due.status = "broken";
    letter(s, due.to, "期限过了", `${you(s)}：\n「${due.text}」的日子过了。你没有来。我把它记成失约。\n${personName(s, due.to)}`);
    bump(s, due.to, "player", { trust: -1 }, `due-${due.id}`, `${personName(s, due.to)}因承诺过期未履而降低信任。`);
    s.report.push({ title: "承诺到期", body: `「${due.text}」过期了。失约被记下，不会明天再触发一次。` });
  }
}

export function computeRoute(s: GameState): SequelRoute {
  if (s.flags.survivorLeak) return "confront";
  const tangTrust = getRel(s, "tang", "player").trust;
  const tangShen = getRel(s, "tang", "shen").trust;
  const shenYou = getRel(s, "shen", "player").trust;
  if (tangTrust >= 1 && s.flags.girlWhere !== "broken") return "direct";
  if (tangTrust < 1 && tangShen >= 1 && shenYou >= 0) return "via_shen";
  return "sidelong";
}

function queuedRoute(s: GameState): SequelRoute | null {
  const tag = [...s.fired].reverse().find((f) => f.startsWith("sequel-queued:"));
  const route = tag?.split(":")[1];
  if (route === "direct" || route === "via_shen" || route === "sidelong" || route === "confront") return route;
  return null;
}

function queueSequel(s: GameState) {
  const route = computeRoute(s);
  const bodies: Record<SequelRoute, { from: CharId | "anon"; body: string }> = {
    direct: { from: "tang", body: `${you(s)}：\n有人按着册子上的刮痕在找还活着的人。西棚今夜有条画了白圈的船。我需要你，但不是替我拿主意。\n如果你还认得我的字，就够了。\n宋棠` },
    via_shen: { from: "shen", body: `${you(s)}：\n有人托我问你，她不落款。今夜西棚有人打听「宋」字。她在哪儿，我还不能告诉你——除非你我之间还担得起这句话。\n沈砚` },
    sidelong: {
      from: s.status.liu !== "gone" ? "liu" : "pei",
      body: s.status.liu !== "gone" ? `${you(s)}：\n有生人拿着旧名问茶，问有没有改过姓的人。这种问法不像找亲戚。你若要来看，从西棚走。\n柳七` : `${you(s)}：\n西棚有人盘问改过姓名的住户。没有状纸，我不能抓。你若知道来源，带来。\n裴照`,
    },
    confront: { from: "tang", body: `${you(s)}：\n你说过的话还在。现在有人顺着你漏出去的方向在找人。先回答我，再谈帮不帮。\n宋棠` },
  };
  const b = bodies[route];
  letter(s, b.from, "未署名", b.body);
  s.fired.push(`sequel-queued:${route}`);
  s.report.push({ title: "一封没有把名字写完的信", body: "后续开始了。不同的旧关系，会把你带进不同的门。" });
}

export function openSequel(s0: GameState): Step {
  const hit = s0.letters.find((l) => l.id.startsWith("sq"));
  if (!hit && !s0.sequel) return { state: s0, blocked: "那封信还没有到。" };
  const s = clone(s0);
  const row = s.letters.find((l) => l.id.startsWith("sq"));
  if (row) row.unread = false;
  if (!s.sequel) s.sequel = { route: queuedRoute(s) ?? computeRoute(s), step: 0, done: false, log: [] };
  if (s.sequel.done) return { state: s0, blocked: "这件事已经有了结果。" };
  s.screen = "sequel";
  s.pending = null;
  return { state: s };
}

export function sequelVM(s: GameState): SequelVM | null {
  if (!s.sequel || s.sequel.done) return null;
  const { route, step, log } = s.sequel;
  if (route === "direct" && step === 0) {
    return { kicker: "她直接来信 · 因为她信任你", title: "白圈小船", paras: ["宋棠把猎人说清楚了：船舷一圈新漆的白，问的是「被刮过的姓」。她要你一起去通知阿禾，但走不走由阿禾自己答。", "你能看见船的记号和阿禾这个称呼。这是只有她信任你时才有的入口。"], choices: [{ action: "sq_direct_go", label: "跟她去，决定权给阿禾" }, { action: "sq_direct_pei", label: "把白圈船告诉裴照" }, { action: "sq_direct_no", label: "让她自己去" }] };
  }
  if (route === "direct") {
    return { kicker: "西棚之后", title: "阿禾的问题", paras: ["阿禾不肯连夜离开，除非有人说明：为什么宋衡的名字还在册上。", s.clues.names_altered ? "你见过涂改。你可以说，也可以把这句还给宋棠。" : "你没有见过可以负责的涂改细节。编一句，只会变成你声称的事实。"], choices: [{ action: "sq_direct_truth", label: "说出涂改与宋衡", disabled: s.clues.names_altered ? undefined : "你没有掌握可以负责的细节" }, { action: "sq_direct_her", label: "请宋棠自己说" }, { action: "sq_direct_hide", label: "把这段藏起来" }] };
  }
  if (route === "via_shen" && step === 0) {
    const deep = getRel(s, "shen", "player").trust >= 2;
    return { kicker: "沈砚转托 · 因为她信他，不信你", title: "不落款的请求", paras: ["信是沈砚写的。宋棠没有出现。他只确认有人按「宋」字在西棚打听。", deep ? "他补了一句地址：人在茶肆后的渔棚。这是信任够了才给的。" : "地址他不给。你和他之间还没到可以替她暴露落脚点的地步。", "你的同伴是沈砚，不是宋棠。你得不到白圈船的记号。"], choices: [{ action: "sq_via_meet", label: "请沈砚安排一次见面", disabled: getRel(s, "shen", "player").trust >= 1 ? undefined : "沈砚不愿替一个他不信的人引见" }, { action: "sq_via_shed", label: "自己去西棚" }, { action: "sq_via_no", label: "这事交给沈砚" }] };
  }
  if (route === "via_shen") {
    const met = log.some((l) => l.includes("见面"));
    return { kicker: "见了，或没见着", title: "过滤过的消息", paras: met ? ["宋棠在渔棚见了你，话很少。她不告诉你船的记号，也不让你跟去见阿禾。", "解决办法只剩：你去把打听的人引开，或让沈砚连夜移人。"] : ["你没有见到宋棠。西棚只有打听的人，和后脚赶到的沈砚。"], choices: [{ action: "sq_via_decoy", label: "你去把打听的人引开" }, { action: "sq_via_shenmove", label: "让沈砚移人，你不跟" }] };
  }
  if (route === "confront" && step === 0) {
    return { kicker: "她先来问罪 · 因为你泄露过", title: "合作之前的质问", paras: ["宋棠没有把困境当请求。她把你泄露藏身处或现名的事放在第一句。", "在这句被回答之前，没有阿禾的地址，也没有沈砚的转托。入口本身就不同。"], choices: [{ action: "sq_cf_admit", label: "承认，并由你去引开猎人" }, { action: "sq_cf_deflect", label: "推说那不是泄露" }, { action: "sq_cf_pei", label: "道歉，但仍要裴照介入" }] };
  }
  if (route === "confront") {
    return { kicker: "引开，不是同行", title: "她仍不告诉你人在哪", paras: ["她接受你去当诱饵，条件是你不知道人往哪移。", "这和被信任时一起见阿禾，不是同一件事。"], choices: [{ action: "sq_cf_bait", label: "去做诱饵" }, { action: "sq_cf_back", label: "临时退缩" }] };
  }
  if (step === 0) {
    return { kicker: "你不在她们的信任里", title: "西棚的盘问", paras: [s.status.liu !== "gone" ? "柳七只告诉你有人拿旧名问茶。她没有把人指认给你。" : "裴照只给你一条公务：有人盘问改姓的住户。", s.flags.knowTangName && s.met.includes("tang") ? "如果你亲自去看，你也许认得出那条旧红绳。" : "你若从没真正认识她，暗处也叫不出她的名字。"], choices: [{ action: "sq_side_watch", label: "去西棚看，先不插手" }, { action: "sq_side_warn", label: "提醒柳七收人", disabled: s.status.liu === "gone" ? "柳七已经不在，信送不到今夜" : undefined }, { action: "sq_side_pei", label: "请裴照加派巡查" }] };
  }
  const saw = log.some((l) => l.includes("红绳"));
  return { kicker: "看过之后", title: saw ? "你认出了红绳" : "你没有认出人", paras: saw ? ["红绳是宋棠的。她在自己行动。你可以退出，或上前只说你看见的。"] : ["你看见有人与问话的人错开。你不能确定是谁。乱认，就会把错误的名字送进公廨。"], choices: [{ action: "sq_side_leave", label: "退出，不把猜测说出去" }, { action: "sq_side_approach", label: "上前，只说你看见的" }] };
}

export function applySequel(s: GameState, action: string): string {
  const q = s.sequel;
  if (!q) return "没有后续。";
  const done = (text: string) => {
    q.done = true;
    q.step = 9;
    return text;
  };
  if (action === "sq_direct_go") {
    q.step = 1;
    q.log.push("见面");
    return "你和宋棠一起到了西棚。阿禾在，白圈船也在。她要一个解释才肯走。";
  }
  if (action === "sq_direct_pei") {
    s.flags.survivorLeak = true;
    bump(s, "tang", "player", { trust: -1 }, "sq-pei", "你把她给你的船讯交给了公廨。");
    bump(s, "pei", "player", { trust: 1 }, "sq-pei2", "裴照拦住了白圈船。");
    if (s.promises.some((p) => p.id === "not-decide" && p.status === "open")) breakPromise(s, "not-decide");
    return done("裴照拦住了白圈船。阿禾不肯在官差面前露面，连夜自己消失。宋棠认为你又替她做了主。证据多了一条，人没有按她的方式离开。");
  }
  if (action === "sq_direct_no") {
    bump(s, "tang", "player", { close: -1 }, "sq-no", "你让她独自面对。");
    return done("宋棠自己去了。阿禾走成了，她的肩上添了一道划伤。她没有再叫你。");
  }
  if (action === "sq_direct_truth") {
    bump(s, "tang", "player", { trust: 1 }, "sq-truth", "你把涂改说给阿禾，没有接管决定。");
    return done("阿禾听完宋衡为何留在册上，自己点头离开。此前你保住的信任，让你站在棚里，而不是门外。决定仍是阿禾的。");
  }
  if (action === "sq_direct_her") {
    bump(s, "tang", "player", { trust: 1, close: 1 }, "sq-her", "你把解释权还给宋棠。");
    return done("宋棠自己讲述父亲的名字为何还在。阿禾跟她走。你在场，但没有成为那句话的主人。");
  }
  if (action === "sq_direct_hide") {
    bump(s, "tang", "player", { trust: -1 }, "sq-hide", "你隐瞒涂改，阿禾不走。");
    return done("阿禾留下了。天亮前白圈船的人又来了一次。隐瞒没有保护任何人。");
  }
  if (action === "sq_via_meet") {
    q.step = 1;
    q.log.push("见面");
    bump(s, "shen", "player", { debt: -1 }, "sq-meet", "沈砚用他与宋棠的信任，替你换到一次见面。");
    return "沈砚把你带到渔棚。宋棠见了你，冷淡，但肯说话。地址仍不给你。";
  }
  if (action === "sq_via_shed") {
    q.step = 1;
    q.log.push("西棚独自");
    return "你在西棚看见打听的人，没有看见宋棠。沈砚后脚才到。";
  }
  if (action === "sq_via_no") {
    s.flags.shenInjured = true;
    bump(s, "shen", "player", { debt: 1 }, "sq-via-no", "沈砚独自移人，受了伤。");
    bump(s, "tang", "shen", { trust: 1 }, "sq-via-no2", "宋棠更信沈砚，而不是你。");
    return done("你退出之后，沈砚连夜把人移走，自己臂上再添一伤。宋棠的下一封信会先到镖站。你看见了他们如何绕开你。");
  }
  if (action === "sq_via_decoy") {
    bump(s, "shen", "player", { trust: 1 }, "sq-decoy", "你按沈砚给的范围引开了打听的人。");
    return done("你把打听的人引向空仓库。阿禾由沈砚移走。你始终不知道落点。同伴是沈砚，不是宋棠领你进棚。");
  }
  if (action === "sq_via_shenmove") {
    return done("沈砚移走了人。你保持距离。宋棠知道是他做的。你与这件事的关系，停在「被问过，但没有进门」。");
  }
  if (action === "sq_side_watch") {
    q.step = 1;
    if (s.flags.knowTangName && s.met.includes("tang")) q.log.push("红绳");
    return s.flags.knowTangName && s.met.includes("tang") ? "你在暗处看见红绳。是宋棠。她没有叫你。" : "你看见一个女人与问话的人错开。你无法确认身份。";
  }
  if (action === "sq_side_warn") {
    bump(s, "liu", "player", { trust: 1 }, "sq-warn", "你提醒柳七，她连夜收了人。");
    return done("柳七连夜让人离开西棚。你没有见到宋棠，也不知道阿禾是谁。这条路靠的是茶肆，不是谁的信任托付。猎人扑了空，明天还会再来。");
  }
  if (action === "sq_side_pei") {
    bump(s, "pei", "player", { trust: 1 }, "sq-side-pei", "裴照加派巡查。");
    bump(s, "tang", "player", { trust: -1 }, "sq-side-tang", "官差的灯把宋棠的行动打乱了。");
    return done("巡查使西棚亮了一夜。问话的人走了，藏着的人也在慌乱中丢了一袋旧纸。你是从公务口进去的。");
  }
  if (action === "sq_side_leave") return done("你退出了。猜测没有变成供词。你至少没有把认错的名字送进公廨。");
  if (action === "sq_side_approach") {
    if (q.log.some((l) => l.includes("红绳"))) {
      bump(s, "tang", "player", { close: 1 }, "sq-approach", "你上前，只说看见的，宋棠勉强听完。");
      return done("宋棠发现你认出了她。因为你在首章认识过她，这条旁路才变成一次迟到的会合，而不是一场误认。");
    }
    bump(s, "pei", "player", { trust: -1 }, "sq-wrong", "你把不确定的身份说了出去。");
    return done("你把不确定的描述送去公廨。人不是你以为的方向。不认识她的代价，在这里变成了错误的行动。");
  }
  if (action === "sq_cf_admit") {
    q.step = 1;
    bump(s, "tang", "player", { trust: 1 }, "sq-admit", "你承认泄露，她允许你用行动补，但不恢复同行。");
    return "她接受你去引开猎人。地址仍然不给你。这不是和解，是补救的条件。";
  }
  if (action === "sq_cf_deflect") {
    bump(s, "tang", "player", { trust: -1, close: -1 }, "sq-deflect", "你推诿，她结束了对话。");
    return done("宋棠不再跟你说话。她自行转移，途中丢了信物。你连开头那句质问都没有接住。");
  }
  if (action === "sq_cf_pei") {
    bump(s, "tang", "player", { trust: -1 }, "sq-cf-pei", "你在质问之后仍把官面叫来。");
    bump(s, "pei", "player", { trust: 1 }, "sq-cf-pei2", "裴照接到了可核查的方向。");
    return done("裴照的人赶到时，宋棠已经不在。她留下四个字：不必再找。泄露过的人再喊官面，在她那里不是补救。");
  }
  if (action === "sq_cf_bait") {
    bump(s, "tang", "player", { trust: 1 }, "sq-bait", "你按她的条件做了诱饵。信任只修补了一点。");
    return done("你假装持有残页，把猎人拖住两个时辰。人由她移走，落点你不知道。因为你曾经泄露，你被允许做的是诱饵，而不是同伴。");
  }
  if (action === "sq_cf_back") {
    bump(s, "tang", "player", { trust: -1 }, "sq-back", "你临时退缩，补救失败。");
    return done("你退了。她自己移人，险些被追上。此前的泄露还在，新的亏欠又添了一笔。");
  }
  return "这一步没有发生。";
}

export function because(s: GameState) {
  const route = s.sequel?.route;
  if (route === "direct") return "此前的选择如何影响了后续：宋棠信任你，所以求援直接到来，你能看见白圈船和阿禾。若你把决定权留给他，结尾就由他们点头，而不是由公廨收场。";
  if (route === "via_shen") return "此前的选择如何影响了后续：宋棠不信任你，但她信任沈砚。信先到镖站。你见不见得着她，取决于你和沈砚的关系。";
  if (route === "confront") return "此前的选择如何影响了后续：你泄露过幸存者的消息，所以开场是质问。即便补救，你也只能做诱饵，不能知道人被送到哪里。";
  return "此前的选择如何影响了后续：她们都不把你算作同伴，你只能从柳七或裴照的异常里摸进西棚。认不认得出她，取决于你在首章有没有真正认识她。";
}

export function locationOf(s: GameState, id: CharId): LocId | null {
  if ((s.mode === "daily" || s.flags.ending) && s.status[id] !== "present") return null;
  if (id === "gu") {
    if (s.mode === "daily" || s.flags.ending) return s.flags.ending === "testify" ? "yamen" : null;
    if (s.day < 3) return "tea";
    if (s.flags.fakeDeathExposed || s.flags.layoutDone) return "hide";
    if (s.flags.sawDrowning && !s.flags.layoutDone) return null;
    if (s.day >= 5) return "hide";
    return "tea";
  }
  if (id === "tang") {
    if (s.mode === "daily" || s.flags.ending) return s.status.tang === "present" ? "ferry" : null;
    if (s.flags.girlCoop === "ally" && s.day >= 4) return "tea";
    return "ferry";
  }
  if (id === "shen") {
    if (s.flags.shenDetained && !s.flags.shenConfessed && s.mode === "main") return "yamen";
    return "escort";
  }
  if (id === "liu") return "tea";
  return "yamen";
}

export function briefOf(s: GameState) {
  const f = s.flags;
  if (s.mode === "daily") {
    if (s.sequel?.done) return "风波有了后续。渡口还在。你可以把日期再往前推，也可以去见还见得到的人。";
    if (s.letters.some((l) => l.id.startsWith("sq") && l.unread)) return "信匣里有一封新的。落款不像是随便写的。";
    return "七日已经翻过去。承诺、隐瞒和担保还在。你可以走动、交谈，也可以把日子往前推。";
  }
  if (s.day === 1) return "茶肆的茶是冷的。后院的门从里面闩着。有人昨夜来找说书的，人到现在没回来。";
  if (s.day === 2 && f.vouch === "none") return "顾晚舟把扇子合上了。他要你的名字，天亮前的船才肯走。";
  if (s.day === 2 && f.vouch === "accepted") return "你的名字已经写在保书上。天亮前的那趟船，与你有关。";
  if (s.day === 2) return "你没有作保。说书人仍会找别的办法。你若想插手，还来得及查。";
  if (s.day === 3 && f.fakeDeathExposed) return "假死没有演成。人藏进了夹层。今日要谈的是怎么收场。";
  if (s.day === 3 && fakeReady(s)) return "你手里的线已经对上。船还没离跳板。";
  if (s.day === 3) return "卯时有一趟船。你不去，岸上也会有人喊。";
  if (s.day === 4) return "宋棠说，有些事她要自己讲。她不接受别人替她决定。";
  if (s.day === 5) return "还活着的人，和帮忙布置的人，都在灯后头。今日能问出谁在利用谁。";
  if (s.day === 6) return "名册就在渡口。它能证明旧案，也能把还活着的人重新送出去。";
  return "追名册的人到了渡口外。今日要有个了断。没有准备好的路，会自己关上。";
}

export { canTestify, canEvacuate };
