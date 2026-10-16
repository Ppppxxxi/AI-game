import assert from "node:assert/strict";
import { test } from "node:test";
import {
  beginTalk,
  cancel,
  canned,
  confirm,
  currentScene,
  endDay,
  getRel,
  leaveToMap,
  look,
  mapVM,
  openSequel,
  pactRows,
  say,
  stage,
  startGame,
  suggestions,
  toMorning,
  applyProposal,
  noteBadCite,
} from "./engine.ts";
import { computeRoute } from "./sim.ts";
import { speakableBeliefs } from "./kb.ts";

test("沈砚的话会连夜走到公廨再回到镖站", () => {
  let s = startGame("测试");
  s = beginTalk(s, "shen").state;
  s = say(s, "你是不是故意躲着公廨？").state;
  assert.equal(s.flags.shenConfided, true);
  s = stage(s, "promise_shen").state;
  s = confirm(s).state;
  assert.equal(s.flags.shenWhere, "kept");
  s = toMorning({ ...s, screen: "map", talk: null });
  s = beginTalk(s, "pei").state;
  s = say(s, "沈砚躲着不见官").state;
  assert.equal(s.pending?.action, "relay_shen");
  assert.match(s.pending?.warning ?? "", /答应/);
  const before = getRel(s, "shen", "player").trust;
  s = confirm(s).state;
  assert.equal(s.flags.shenWhere, "broken");
  s = endDay(s).state;
  assert.ok(s.letters.some((l) => l.from === "shen"));
  assert.ok(getRel(s, "shen", "player").trust < before);
  assert.ok(s.events.some((e) => e.id === "pei-night-shen"));
  assert.ok(s.events.some((e) => e.causes.includes("player-told-pei-shen")));
  const pei = s.decisions.find((d) => d.agent === "pei");
  assert.equal(pei?.visible, false);
  assert.equal(pei?.rejected, "把玩家的说法直接写进格子");
  assert.ok((pei?.score ?? 0) > (pei?.altScore ?? 0));
  const shen = s.decisions.find((d) => d.agent === "shen");
  assert.equal(shen?.visible, true);
  assert.match(shen?.rejected ?? "", /公廨/);
  s = endDay(toMorning(s)).state;
  assert.equal(s.events.filter((e) => e.id === "pei-night-shen").length, 1);
});

test("未确认的作保不会改世界，取消后再确认只记一次", () => {
  let s = startGame("测试");
  s = endDay(s).state;
  s = toMorning(s);
  assert.equal(s.day, 2);
  s = stage({ ...s, scene: "vouch", screen: "scene" }, "vouch_accept").state;
  s = cancel(s);
  assert.equal(s.flags.vouch, "none");
  s = stage({ ...s, scene: "vouch", screen: "scene" }, "vouch_accept").state;
  s = confirm(s).state;
  assert.equal(s.flags.vouch, "accepted");
  const trust = getRel(s, "gu", "player").trust;
  const again = confirm(s);
  assert.ok(again.blocked);
  assert.equal(getRel(again.state, "gu", "player").trust, trust);
});

test("两条假死线索会改第三日，没有线索则落水", () => {
  let exposed = startGame("甲");
  exposed = endDay(exposed).state;
  exposed = toMorning(exposed);
  exposed = look(exposed, "tea").state;
  assert.ok(exposed.clues.spare_clothes?.known);
  assert.equal(exposed.clues.fake_pattern, undefined);
  assert.ok(exposed.claims.fake_pattern?.derivedFrom.includes("spare_clothes"));
  assert.ok(exposed.claims.fake_pattern?.derivedFrom.includes("backyard_closed"));
  assert.equal(exposed.day, 2);
  assert.equal(currentScene(exposed)?.id, "vouch");
  exposed = endDay(exposed).state;
  exposed = toMorning(exposed);
  assert.equal(exposed.day, 3);
  assert.equal(currentScene(exposed)?.id, "confront");

  let drowned = startGame("乙");
  drowned = endDay(drowned).state;
  drowned = toMorning(drowned);
  drowned = endDay(drowned).state;
  drowned = toMorning(drowned);
  assert.equal(currentScene(drowned)?.id, "drown");
  drowned = endDay(drowned).state;
  assert.equal(drowned.flags.sawDrowning, true);
  assert.equal(drowned.flags.fakeDeathExposed, false);
});

test("三条路与三种后续入口", () => {
  const base = startGame("丙");
  base.day = 7;
  base.flags.registerSeen = true;
  base.flags.registerWith = "player";
  base.flags.guWillTestify = true;
  base.flags.liuConfessed = true;
  base.clues.names_altered = { known: true, verified: true, source: "册", day: 6 };
  base.clues.father_not_saved = { known: true, verified: true, source: "册", day: 6 };
  assert.equal(currentScene(base)?.choices.find((c) => c.action === "ending_testify")?.disabled, undefined);
  assert.equal(currentScene(base)?.choices.find((c) => c.action === "ending_evacuate")?.disabled, undefined);

  const loved = structuredClone(base);
  loved.flags.girlCoop = "ally";
  loved.flags.girlWhere = "kept";
  loved.rel["tang>player"] = { close: 1, trust: 2, debt: 0 };
  assert.equal(computeRoute(loved), "direct");

  const via = structuredClone(base);
  via.flags.girlCoop = "doubt";
  via.rel["tang>player"] = { close: 0, trust: 0, debt: 0 };
  via.rel["tang>shen"] = { close: 1, trust: 2, debt: 0 };
  via.rel["shen>player"] = { close: 0, trust: 1, debt: 0 };
  assert.equal(computeRoute(via), "via_shen");

  const leak = structuredClone(base);
  leak.flags.survivorLeak = true;
  leak.rel["tang>player"] = { close: 1, trust: 2, debt: 0 };
  assert.equal(computeRoute(leak), "confront");

  const side = structuredClone(base);
  side.flags.girlCoop = "doubt";
  side.rel["tang>player"] = { close: 0, trust: -1, debt: 0 };
  side.rel["tang>shen"] = { close: 0, trust: 0, debt: 0 };
  assert.equal(computeRoute(side), "sidelong");

  leak.mode = "daily";
  leak.letters.unshift({ id: "sq1", from: "tang", day: 8, title: "未署名", body: "问", unread: true });
  leak.fired.push("sequel-queued:confront");
  const opened = openSequel(leak).state;
  assert.equal(opened.sequel?.route, "confront");
});

test("模型只能把合法意图送进确认卡", () => {
  let s = startGame("测");
  s = beginTalk(s, "shen").state;
  s = say(s, "你是不是故意躲着公廨？").state;
  const bad = applyProposal(s, "ending_testify");
  assert.equal(bad.state.pending, null);
  assert.equal(bad.state.flags.ending, "");
  assert.equal(bad.state.metrics.proposedBlocked, 1);
  const good = applyProposal(s, "promise_shen");
  assert.equal(good.state.pending?.action, "promise_shen");
  assert.equal(good.state.flags.shenWhere, "none");
  assert.equal(good.state.metrics.proposed, 1);
  const done = confirm(good.state).state;
  assert.equal(done.flags.shenWhere, "kept");
  assert.equal(done.metrics.confirmed, 1);
});

test("两种目的地会推出冲突命题，私下的命题不能被引用进手记", () => {
  const fresh = startGame("戊");
  const liu = speakableBeliefs(fresh, "liu");
  assert.ok(liu.some((b) => b.id === "backyard_closed"));
  assert.equal(liu.some((b) => b.id.startsWith("private_")), false);

  let s = startGame("丁");
  s = endDay(s).state;
  s = toMorning(s);
  s = beginTalk(s, "gu").state;
  s = say(s, "这趟你要去哪里？").state;
  s = beginTalk(s, "shen").state;
  s = say(s, "他让你送到哪个码头？").state;
  const claim = s.claims.dest_mismatch;
  assert.ok(claim);
  assert.deepEqual(claim.derivedFrom, ["dest_gu", "dest_shen"]);
  assert.ok(claim.holders.includes("player"));
  assert.ok(s.claims.dest_gu?.contradicts.includes("dest_shen"));
  assert.equal(s.clues.fake_pattern, undefined);
  const heard = speakableBeliefs(s, "gu");
  assert.ok(heard.some((b) => b.id === "dest_gu"));
  assert.equal(heard.some((b) => b.id.startsWith("private_")), false);
  const cited = noteBadCite(s, ["private_stage"]);
  assert.equal(cited.claims.private_stage?.holders.includes("player"), false);
  assert.equal(cited.clues.dest_mismatch?.verified, s.clues.dest_mismatch?.verified);
  assert.ok(cited.traces.some((t) => t.kind === "cite"));
});

function lastNpc(s: { chats: Record<string, { role: string; text: string }[]> }, id: string) {
  return [...s.chats[id]].reverse().find((m) => m.role === "npc")?.text ?? "";
}

test("换种问法也能问到，答话不打哑谜", () => {
  let early = startGame("己");
  early = beginTalk(early, "gu").state;
  early = say(early, "你这趟究竟要去哪里").state;
  assert.equal(early.clues.dest_gu, undefined);
  assert.match(lastNpc(early, "gu"), /第二日/);
  assert.doesNotMatch(lastNpc(early, "gu"), /半本|认灯|茶凉/);

  let asked = startGame("庚");
  asked = endDay(asked).state;
  asked = toMorning(asked);
  asked = beginTalk(asked, "gu").state;
  asked = say(asked, "护送到底要送到什么地方").state;
  assert.ok(asked.clues.dest_gu?.known);
  assert.match(lastNpc(asked, "gu"), /县城/);

  let liu = startGame("辛");
  liu = beginTalk(liu, "liu").state;
  liu = say(liu, "别绕了，你知道什么就直说").state;
  assert.ok(liu.clues.girl_seeking?.known);
  assert.match(lastNpc(liu, "liu"), /姑娘/);
  assert.doesNotMatch(lastNpc(liu, "liu"), /茶渣|修缮也可以|书不一定讲/);
  liu = say(liu, "还有呢").state;
  assert.ok(liu.clues.backyard_closed?.known);
  assert.match(lastNpc(liu, "liu"), /闩/);

  let shen = startGame("壬");
  shen = beginTalk(shen, "shen").state;
  shen = say(shen, "你现在到底想干什么").state;
  assert.equal(shen.flags.shenConfided, false);
  assert.match(lastNpc(shen, "shen"), /不接/);
  assert.doesNotMatch(canned(shen, "gu", "今天这雾真大"), /半本|茶渣|认灯|茶凉/);
});

function teaDesc(s: { day: number } & Parameters<typeof mapVM>[0]) {
  return mapVM(s).locs.find((loc) => loc.id === "tea")?.desc ?? "";
}

test("嘴里说茶会完成了，不会变成履约", () => {
  let s = startGame("茶一");
  s = beginTalk(s, "liu").state;
  const offered = say(s, "咱们办一场夜茶");
  assert.equal(offered.ai, undefined);
  s = offered.state;
  assert.equal(s.pending?.action, "pact_tea_offer");
  assert.equal(s.pacts.length, 0);
  const yes = s.decisions.find((d) => d.chose === "答应共办夜茶");
  assert.equal(yes?.score, 14);
  assert.equal(yes?.altScore, 2);
  assert.ok((yes?.score ?? 0) > (yes?.altScore ?? 0));
  s = confirm(s).state;
  assert.equal(s.pacts[0]?.status, "fulfilling");
  assert.equal(s.pacts[0]?.playerDone, false);
  assert.equal(s.pacts[0]?.world, "");
  assert.equal(s.pacts[0]?.dueDay, 2);
  assert.doesNotMatch(teaDesc(s), /灯笼/);
  assert.match(mapVM(s).pact?.you ?? "", /新茶/);
  assert.match(mapVM(s).pact?.hers ?? "", /熟客/);
  const claimed = say(s, "茶叶已经交给你了");
  assert.equal(claimed.ai, undefined);
  s = claimed.state;
  assert.equal(s.pending, null);
  assert.equal(s.pacts[0]?.playerDone, false);
  assert.equal(s.pacts[0]?.heldTea, false);
  assert.match(lastNpc(s, "liu"), /我没看见茶叶/);
  assert.doesNotMatch(teaDesc(s), /灯笼/);
});

test("渡口带回的新茶要当面交，一夜之后茶肆才变", () => {
  let s = startGame("茶二");
  s = beginTalk(s, "liu").state;
  s = say(s, "张罗夜茶").state;
  s = confirm(s).state;
  const before = getRel(s, "liu", "player").trust;
  s = leaveToMap(s);
  s = look(s, "ferry").state;
  assert.equal(s.pacts[0]?.heldTea, true);
  assert.equal(s.pacts[0]?.playerDone, false);
  assert.match(s.notice ?? "", /新茶/);
  s = beginTalk(s, "liu").state;
  const handed = say(s, "新茶给你");
  assert.equal(handed.ai, undefined);
  s = handed.state;
  assert.equal(s.pending?.action, "pact_tea_deliver");
  assert.equal(s.pacts[0]?.playerDone, false);
  s = confirm(s).state;
  assert.equal(s.pacts[0]?.playerDone, true);
  assert.equal(s.pacts[0]?.status, "fulfilling");
  assert.equal(s.pacts[0]?.world, "");
  assert.doesNotMatch(teaDesc(s), /灯笼/);
  s = endDay(s).state;
  assert.equal(s.pacts[0]?.status, "done");
  assert.equal(s.pacts[0]?.world, "tea_night");
  assert.equal(s.pacts[0]?.npcDone, true);
  assert.ok(s.letters.some((l) => l.title === "夜茶摆上了"));
  assert.match(teaDesc(s), /灯笼亮着/);
  assert.equal(mapVM(s).pact, null);
  assert.equal(s.claims.tea_night?.status, "verified");
  assert.ok(s.claims.tea_night?.holders.includes("player"));
  assert.ok(s.claims.tea_night?.holders.includes("liu"));
  assert.equal(getRel(s, "liu", "player").trust, before + 1);
  const hosted = s.decisions.find((d) => d.chose === "张罗茶铺，请熟客");
  assert.ok((hosted?.score ?? 0) > (hosted?.altScore ?? 0));
  assert.equal(pactRows(s)[0]?.status, "做成了");
  s = toMorning(s);
  s = beginTalk(s, "liu").state;
  assert.match(lastNpc(s, "liu"), /昨夜夜茶是我们一起办成的/);
  const remembered = s.chats.liu.filter((m) => m.text.includes("昨夜夜茶")).length;
  s = beginTalk(s, "liu").state;
  assert.equal(s.chats.liu.filter((m) => m.text.includes("昨夜夜茶")).length, remembered);
});

test("到期没把茶交上就是失约，茶肆不变", () => {
  let s = startGame("茶三");
  s = beginTalk(s, "liu").state;
  s = say(s, "办个茶会").state;
  s = confirm(s).state;
  const before = getRel(s, "liu", "player").trust;
  s = endDay(s).state;
  assert.equal(s.day, 2);
  assert.equal(s.pacts[0]?.status, "fulfilling");
  s = endDay(s).state;
  assert.equal(s.pacts[0]?.status, "broken");
  assert.equal(s.pacts[0]?.world, "");
  assert.ok(getRel(s, "liu", "player").trust < before);
  assert.ok(s.letters.some((l) => l.title === "新茶没有到"));
  assert.equal(s.letters.some((l) => l.title === "夜茶摆上了"), false);
  assert.doesNotMatch(teaDesc(s), /灯笼/);
});

test("茶交了她仍可以办不成，而且不罚你", () => {
  let cold = startGame("茶四");
  cold = beginTalk(cold, "liu").state;
  cold = say(cold, "办一场夜茶").state;
  cold = confirm(cold).state;
  cold = leaveToMap(cold);
  cold = look(cold, "ferry").state;
  cold = beginTalk(cold, "liu").state;
  cold = say(cold, "新茶给你").state;
  cold = confirm(cold).state;
  assert.equal(cold.pacts[0]?.playerDone, true);
  cold.rel["liu>player"]!.trust = -1;
  const trust = getRel(cold, "liu", "player").trust;
  cold = endDay(cold).state;
  assert.equal(cold.pacts[0]?.status, "npc_failed");
  assert.equal(cold.pacts[0]?.world, "");
  assert.equal(getRel(cold, "liu", "player").trust, trust);
  assert.ok(cold.letters.some((l) => l.title === "茶会我没张罗成"));
  assert.equal(cold.letters.some((l) => l.title === "夜茶摆上了"), false);
  assert.doesNotMatch(teaDesc(cold), /灯笼/);
  assert.match(cold.pacts[0]?.note ?? "", /信不过/);

  let leaked = startGame("茶五");
  leaked = beginTalk(leaked, "liu").state;
  leaked = say(leaked, "办一场夜茶").state;
  leaked = confirm(leaked).state;
  leaked = leaveToMap(leaked);
  leaked = look(leaked, "ferry").state;
  leaked = beginTalk(leaked, "liu").state;
  leaked = say(leaked, "交给你了").state;
  leaked = confirm(leaked).state;
  leaked.flags.survivorLeak = true;
  const kept = getRel(leaked, "liu", "player").trust;
  leaked = endDay(leaked).state;
  assert.equal(leaked.pacts[0]?.status, "npc_failed");
  assert.equal(leaked.pacts[0]?.world, "");
  assert.equal(getRel(leaked, "liu", "player").trust, kept);
  assert.match(leaked.letters.find((l) => l.title === "茶会我没张罗成")?.body ?? "", /藏身处/);
});

test("太晚或信不过，柳七拒绝夜茶，也不会记下一桩", () => {
  let late = startGame("茶六");
  late.day = 5;
  late = beginTalk(late, "liu").state;
  assert.equal(late.fired.includes("liu-tea-offer"), false);
  const refused = say(late, "办一场夜茶");
  assert.equal(refused.ai, undefined);
  late = refused.state;
  assert.equal(late.pending, null);
  assert.equal(late.pacts.length, 0);
  assert.match(lastNpc(late, "liu"), /顾不上/);
  const no = late.decisions.find((d) => d.chose === "拒绝这场夜茶");
  assert.equal(no?.score, 10);
  assert.equal(no?.altScore, 1);
  assert.equal(no?.rejected, "答应办夜茶");
  assert.ok((no?.score ?? 0) > (no?.altScore ?? 0));
  assert.equal(suggestions(late, "liu").some((item) => item.action === "pact_tea_offer"), false);

  let cold = startGame("茶七");
  cold = beginTalk(cold, "liu").state;
  cold.rel["liu>player"]!.trust = -1;
  cold = say(cold, "办个茶会").state;
  assert.equal(cold.pacts.length, 0);
  assert.equal(cold.pending, null);
  assert.match(lastNpc(cold, "liu"), /信不过/);
  const turned = cold.decisions.find((d) => d.chose === "拒绝这场夜茶");
  assert.ok((turned?.score ?? 0) > (turned?.altScore ?? 0));
});

test("寻常说茶不是约定，收回之后还可以再约", () => {
  let s = startGame("茶八");
  s = beginTalk(s, "liu").state;
  const casual = say(s, "来一壶茶");
  assert.ok(casual.ai);
  assert.equal(casual.state.pacts.length, 0);
  assert.equal(casual.state.pending, null);
  s = casual.state;
  s = say(s, "办一场夜茶").state;
  s = confirm(s).state;
  s = stage(s, "pact_tea_cancel").state;
  s = confirm(s).state;
  assert.equal(s.pacts[0]?.status, "cancelled");
  s = say(s, "再办一场夜茶").state;
  assert.equal(s.pending?.action, "pact_tea_offer");
  s = confirm(s).state;
  assert.equal(s.pacts.filter((p) => p.status === "fulfilling").length, 1);
});

test("第二日她会先开口，第三日的戏不会吞掉已经交上的茶", () => {
  let s = startGame("茶九");
  s = endDay(s).state;
  s = toMorning(s);
  s = beginTalk(s, "liu").state;
  assert.ok(s.fired.includes("liu-tea-offer"));
  assert.match(lastNpc(s, "liu"), /新茶|熟客/);
  assert.equal(s.pacts.length, 0);
  assert.ok(suggestions(s, "liu").some((item) => item.action === "pact_tea_offer"));
  const offered = s.decisions.find((d) => d.chose === "先开口约一场夜茶");
  assert.ok((offered?.score ?? 0) > (offered?.altScore ?? 0));
  s = say(s, "办一场夜茶").state;
  s = confirm(s).state;
  assert.equal(s.pacts[0]?.dueDay, 3);
  s = endDay(s).state;
  s = toMorning(s);
  assert.equal(s.day, 3);
  assert.equal(s.pacts[0]?.status, "fulfilling");
  s = look(s, "ferry").state;
  s = beginTalk(s, "liu").state;
  s = say(s, "新茶给你").state;
  s = confirm(s).state;
  s = endDay(s).state;
  assert.equal(s.flags.fakeDeathExposed, true);
  assert.equal(s.flags.sawDrowning, false);
  assert.equal(s.pacts[0]?.status, "done");
  assert.equal(s.pacts[0]?.world, "tea_night");
  assert.match(teaDesc(s), /灯笼/);
});


test("第一日开场是茶肆，看过或问过之后不再挡路", () => {
  const fresh = startGame("开场");
  assert.equal(currentScene(fresh)?.id, "day1");
  const asked = stage(fresh, "day1_ask").state;
  assert.equal(asked.scene, null);
  assert.ok(asked.clues.girl_seeking?.known);
  assert.equal(currentScene(asked), null);
  const looked = look(startGame("看门"), "tea").state;
  assert.ok(looked.fired.includes("day1-seen"));
  assert.equal(currentScene(looked), null);
});
