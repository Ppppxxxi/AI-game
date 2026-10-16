import { shareClaim, adopt } from "./kb.ts";
import {
  breakPromise,
  bump,
  getRel,
  letter,
  pushEvent,
  revealBond,
  you,
} from "./mutate.ts";
import type { CharId, Decision, GameState, GoalState, Mind } from "./types.ts";

function goal(
  id: string,
  rank: number,
  text: string,
  status: GoalState["status"],
  ifIdle: string,
): GoalState {
  return { id, rank, text, status, ifIdle };
}

export function projectMinds(s: GameState): Record<CharId, Mind> {
  const f = s.flags;
  const beliefs = (id: CharId) =>
    Object.values(s.claims ?? {})
      .filter((c) => c.holders.includes(id))
      .map((c) => c.id);
  const guOpen = s.day <= 3 && !f.fakeDeathExposed && !f.sawDrowning;
  const minds: Record<CharId, Mind> = {
    gu: {
      beliefs: beliefs("gu"),
      goals: [
        goal(
          "gu-escort",
          1,
          "把黎明护送办完",
          guOpen ? "open" : "done",
          "你若不表态，他会把沉默当成拒绝，另找人画押。",
        ),
        goal(
          "gu-hide",
          2,
          "不把还活着的人交出去",
          f.fakeDeathExposed || f.layoutDone ? "open" : "blocked",
          "他会把人留在夹层，不会主动把现址送去公廨。",
        ),
      ],
    },
    tang: {
      beliefs: beliefs("tang"),
      goals: [
        goal(
          "tang-ask",
          1,
          "自己问完说书人，不许别人代她决定",
          f.motiveDone && f.girlCoop === "ally" && !f.decidedForHer ? "done" : "open",
          f.motiveDone && getRel(s, "tang", "player").trust < 1
            ? "她不信你时，会绕过你去找沈砚。"
            : "你不去听，她会自己写信。名字你会知道，信任不会增加。",
        ),
      ],
    },
    shen: {
      beliefs: beliefs("shen"),
      goals: [
        goal(
          "shen-job",
          1,
          "不接来路不清的委托",
          f.shenInjured ? "blocked" : f.vouch === "accepted" ? "done" : "open",
          "没有你的担保，他可以不接这趟活。",
        ),
        goal("shen-avoid", 2, "躲开公廨，除非被人拿着他亲口的话来问", f.shenDetained ? "blocked" : "open", "他不会自己跑去公廨对质。"),
      ],
    },
    liu: {
      beliefs: beliefs("liu"),
      goals: [
        goal("liu-keep", 1, "护住茶肆里的人，秘密不在堂口说完", "open", "你若把少女的追查告诉她，她会转告顾晚舟。"),
      ],
    },
    pei: {
      beliefs: beliefs("pei"),
      goals: [
        goal("pei-source", 1, "先核验来源，再落笔", "open", "没有来源，他就不动笔。有转述，他夜里自己去问。"),
      ],
    },
  };
  return minds;
}

function goalPull(s: GameState, agent: CharId, goalId: string) {
  const row = projectMinds(s)[agent].goals.find((item) => item.id === goalId);
  if (!row || row.status === "blocked") return 0;
  return (5 - row.rank) * 2;
}

function holds(s: GameState, agent: CharId, id: string, kind: "verified" | "rumor" | "any") {
  const claim = s.claims?.[id];
  if (!claim?.holders.includes(agent)) return 0;
  const tone = claim.stance?.[agent] ?? (claim.status === "verified" ? "verified" : "rumor");
  if (kind === "any") return tone === "verified" ? 3 : 1;
  if (kind === "verified") return tone === "verified" ? 3 : 0;
  return tone === "rumor" ? 1 : 0;
}

export function decide(s: GameState, d: Omit<Decision, "id" | "day">) {
  if (!s.decisions) s.decisions = [];
  s.decisions.unshift({ ...d, id: `d${s.seq++}`, day: s.day });
  s.decisions = s.decisions.slice(0, 12);
  s.minds = projectMinds(s);
}

interface Option {
  text: (s: GameState) => string;
  because: (s: GameState) => string;
  visible: boolean;
  score: (s: GameState) => number;
  act: (s: GameState) => void;
}

interface Agenda {
  stamp: string;
  agent: CharId;
  goal: string;
  when: (s: GameState) => boolean;
  saw: (s: GameState) => string[];
  options: Option[];
}

function nightAsked(s: GameState) {
  return s.events.some((event) => event.id === "pei-night-shen");
}

function agendas(): Agenda[] {
  return [
    {
      stamp: "chain_pei_shen",
      agent: "pei",
      goal: "先核验来源，再落笔",
      when: (s) => s.flags.toldPeiAboutShen,
      saw: (s) => ["player-told-pei-shen", s.flags.shenConfided ? "shen_low" : "转述尚无亲口来源"],
      options: [
        {
          text: () => "夜访镖站，向沈砚本人求证",
          because: () => "转述还不是事实。他只记录带来源的话。",
          visible: false,
          score: (s) => goalPull(s, "pei", "pei-source") + (s.flags.toldPeiAboutShen ? 3 : 0) + (holds(s, "pei", "shen_low", "verified") ? 0 : 2),
          act: (s) => {
            const night = pushEvent(s, {
              id: "pei-night-shen",
              title: "裴照夜访镖站",
              summary: "裴照依据玩家的转述，夜里向沈砚求证他是否回避公廨。",
              visible: false,
              who: ["pei", "shen"],
              causes: ["player-told-pei-shen"],
              effects: ["questioned"],
            });
            pushEvent(s, {
              id: "shen-infers",
              title: "沈砚推断来源",
              summary: s.flags.shenConfided
                ? "沈砚记得自己只向玩家提过不愿见官，因而认定是玩家说出去的。"
                : "沈砚并未细说，仍怀疑是玩家在外面编他的行踪。",
              visible: false,
              who: ["shen", "player"],
              causes: [night],
              effects: ["trust"],
            });
            shareClaim(s, "shen_low", "pei");
            shareClaim(s, "private_shen", "pei");
            if (s.flags.shenConfided) {
              adopt(s, "shen_low", "pei", "verified");
              adopt(s, "private_shen", "pei", "verified");
            }
          },
        },
        {
          text: () => "把玩家的说法直接写进格子",
          because: () => "这样最快，但来源仍是转述。",
          visible: false,
          score: (s) => 3 + holds(s, "pei", "shen_low", "verified") * 2 - (holds(s, "pei", "shen_low", "verified") ? 0 : 6),
          act: () => undefined,
        },
      ],
    },
    {
      stamp: "shen-answers-known",
      agent: "shen",
      goal: "躲开公廨，除非被人拿着他亲口的话来问",
      when: (s) => nightAsked(s) && s.flags.shenConfided && !s.fired.includes("rel:shen-chain:shen>player"),
      saw: () => ["pei-night-shen", "private_shen"],
      options: [
        {
          text: (s) => (s.flags.shenWhere === "broken" ? "认定玩家食言，并写信追问" : "认定话从玩家处漏出，写信追问"),
          because: () => "不愿见官这句话，他只对玩家说过。来源不必再猜第二个人。",
          visible: true,
          score: (s) => goalPull(s, "shen", "shen-avoid") + (s.flags.shenConfided ? 4 : 0) + holds(s, "shen", "private_shen", "verified"),
          act: (s) => {
            bump(
              s,
              "pei",
              "player",
              { trust: 1 },
              "pei-verified",
              "裴照核实了沈砚的回避，承认你的来源可靠。",
            );
            bump(
              s,
              "shen",
              "player",
              { trust: s.flags.shenWhere === "broken" ? -2 : -1 },
              "shen-chain",
              s.flags.shenWhere === "broken" ? "沈砚认定你违背约定，信任明显下降。" : "沈砚认定话从你这里漏出，信任下降。",
            );
            letter(
              s,
              "shen",
              "这话只有你知道",
              s.flags.shenWhere === "broken"
                ? `${you(s)}：\n公廨的人来问我躲不躲。这话我只跟你说过。你还答应不说。明日你来，当面解释。\n沈砚`
                : `${you(s)}：\n裴照来核对我的行踪。这话像是从你嘴里走的。你来，或者你别来。\n沈砚`,
            );
            s.report.push({
              title: s.fired.includes("night-door") ? "你在门口听见了" : "有一封你不在场时写下的信",
              body: s.fired.includes("night-door")
                ? "你在门口听见他来问。沈砚的信会告诉你，他怎么判断是谁说的。"
                : "夜里的问答你没有看见。沈砚的信会告诉你，他如何判断消息从谁而来。",
            });
          },
        },
        {
          text: () => "当夜去公廨对质",
          because: () => "对质能当面拆穿，但会把自己送进他一直躲开的地方。",
          visible: true,
          score: (s) => 2 - goalPull(s, "shen", "shen-avoid"),
          act: () => undefined,
        },
      ],
    },
    {
      stamp: "shen-answers-rumor",
      agent: "shen",
      goal: "躲开公廨，除非被人拿着他亲口的话来问",
      when: (s) => nightAsked(s) && !s.flags.shenConfided && !s.fired.includes("rel:shen-rumor:shen>player"),
      saw: () => ["pei-night-shen"],
      options: [
        {
          text: () => "否认藏匿，并怀疑最近在打听的人",
          because: () => "他没有把这句话交给玩家。求证对不上，来源就还是传闻。",
          visible: true,
          score: (s) => goalPull(s, "shen", "shen-avoid") + holds(s, "shen", "private_shen", "verified") + 2,
          act: (s) => {
            bump(s, "pei", "player", { trust: -1 }, "pei-mismatch", "裴照发现沈砚并不像你说的那样藏匿。");
            bump(s, "shen", "player", { trust: -1 }, "shen-rumor", "沈砚被无端问话，迁怒于最近总在打听的你。");
            letter(
              s,
              "shen",
              "谁在外面编我",
              `${you(s)}：\n公廨夜里来问我是不是藏了。我人在镖站。这话不是我透的。你若在外面编我的行踪，明日说清楚。\n沈砚`,
            );
            s.report.push({
              title: s.fired.includes("night-door") ? "你在门口听见了" : "有一封你不在场时写下的信",
              body: s.fired.includes("night-door")
                ? "你在门口听见他来问。沈砚的信会告诉你，他怎么判断是谁说的。"
                : "夜里的问答你没有看见。沈砚的信会告诉你，他如何判断消息从谁而来。",
            });
          },
        },
        {
          text: () => "承认自己藏了",
          because: () => "承认能结束问话，但和他持有的立场相反。",
          visible: true,
          score: () => 1 - 5,
          act: () => undefined,
        },
      ],
    },
    {
      stamp: "shen-takes-job",
      agent: "shen",
      goal: "不接来路不清的委托",
      when: (s) => s.day === 2 && s.flags.vouch === "accepted",
      saw: () => ["vouch=accepted"],
      options: [
        {
          text: () => "接下护送",
          because: () => "担保把他从「可以不接」推进到「已经接了，得自己收场」。",
          visible: true,
          score: (s) => (s.flags.vouch === "accepted" ? 8 : 0) + 3 - (s.flags.shenInjured ? 10 : 0),
          act: (s) => {
            bump(s, "shen", "player", { trust: 1 }, "takes-job", "因你作保，沈砚接下了这趟他本不想接的护送。");
            letter(
              s,
              "shen",
              "我接了",
              `${you(s)}：\n既然名字是你写的，这趟我接。目的地我仍只听过旧码头那一说。明日卯时，你若在，就在。\n沈砚`,
            );
          },
        },
        {
          text: () => "继续拒接",
          because: () => "没有担保时，拒接更符合他的目标。",
          visible: true,
          score: (s) => (s.flags.vouch === "accepted" ? 2 : 9),
          act: () => undefined,
        },
      ],
    },
    {
      stamp: "drunk-seal",
      agent: "gu",
      goal: "把黎明护送办完",
      when: (s) => s.day === 2 && (s.flags.vouch === "refused" || s.flags.vouch === "ignored"),
      saw: (s) => [`vouch=${s.flags.vouch}`],
      options: [
        {
          text: () => "另找一个肯画押的人",
          because: () => "护送的目标还在。玩家的拒绝或沉默只关掉这一条担保，关不掉船。",
          visible: false,
          score: (s) => goalPull(s, "gu", "gu-escort") + 2,
          act: (s) => {
            pushEvent(s, {
              title: "另寻担保",
              summary: "说书人找到一个醉汉画押。玩家不承担担保责任。",
              visible: false,
              who: ["gu"],
              causes: [],
              effects: ["another guarantor"],
            });
          },
        },
        {
          text: () => "放弃这趟护送",
          because: () => "没人画押就停船。这会直接放弃他排在前面的目标。",
          visible: false,
          score: (s) => 1 - goalPull(s, "gu", "gu-escort"),
          act: () => undefined,
        },
      ],
    },
    {
      stamp: "runners",
      agent: "pei",
      goal: "先核验来源，再落笔",
      when: (s) => s.flags.peiTipped && s.day === 2,
      saw: () => ["peiTipped"],
      options: [
        {
          text: () => "卯时派人看着现场",
          because: () => "报备是来源，不是判决。他保物证，不先定谁有罪。",
          visible: true,
          score: (s) => goalPull(s, "pei", "pei-source") + (s.flags.peiTipped ? 3 : 0),
          act: (s) => {
            letter(
              s,
              "pei",
              "卯时有人",
              `${you(s)}：\n我派了人。现场的东西，不许围观者拿走。你的报备我记为来源，不记为定论。\n裴照`,
            );
          },
        },
        {
          text: () => "按报备直接拘人",
          because: () => "拘人快，但报备还没有被核成判决。",
          visible: true,
          score: () => 2 - 5,
          act: () => undefined,
        },
      ],
    },
    {
      stamp: "gu-void-vouch",
      agent: "gu",
      goal: "把黎明护送办完",
      when: (s) => s.fired.includes("runners") && s.flags.vouch === "accepted" && !s.fired.includes("rel:betray-vouch:gu>player"),
      saw: () => ["runners", "vouch=accepted"],
      options: [
        {
          text: () => "认定作保与报备不能算同一句诺言",
          because: () => "名字是玩家写的，公廨也是玩家叫的。护送还要办，但这句承诺作废。",
          visible: true,
          score: (s) => goalPull(s, "gu", "gu-escort") + 4,
          act: (s) => {
            breakPromise(s, "vouch");
            bump(s, "gu", "player", { trust: -2 }, "betray-vouch", "顾晚舟得知你既作保又通知公廨。");
            letter(s, "gu", "你保了我，又送了信", `${you(s)}：\n名字是你写的。公廨的人也是你叫的。这两件不能算同一句诺言。\n顾晚舟`);
          },
        },
        {
          text: () => "当作没看见",
          because: () => "不追究能少伤关系，但等于承认两件相反的事可以算一句。",
          visible: true,
          score: () => 2,
          act: () => undefined,
        },
      ],
    },
    {
      stamp: "liu-tells-gu",
      agent: "liu",
      goal: "护住茶肆里的人，秘密不在堂口说完",
      when: (s) => s.day <= 4 && s.events.some((event) => event.summary.includes("告诉了柳七")),
      saw: (s) => {
        const told = s.events.find((event) => event.summary.includes("告诉了柳七"));
        return [told?.id ?? "relay", "girl_seeking"];
      },
      options: [
        {
          text: () => "把「少女在追查」转告顾晚舟",
          because: () => "她和说书人护的是同一批人。堂口不说，夹层里的人要说。",
          visible: false,
          score: (s) => goalPull(s, "liu", "liu-keep") + 3,
          act: (s) => {
            const told = s.events.find((event) => event.summary.includes("告诉了柳七"));
            shareClaim(s, "girl_seeking", "liu");
            shareClaim(s, "girl_seeking", "gu");
            shareClaim(s, "private_tang", "gu");
            pushEvent(s, {
              title: "柳七转告顾晚舟",
              summary: "柳七把「少女在追查」告诉了顾晚舟。说书人因此更急于在她见到证人前行动。",
              visible: false,
              who: ["liu", "gu"],
              causes: told ? [told.id] : [],
              effects: ["gu hurries"],
            });
            revealBond(s, "liu", "gu");
            if (s.flags.girlWhere === "broken") {
              letter(
                s,
                "tang",
                "你说出去了",
                `${you(s)}：\n柳七看我的眼神变了。她不会无故知道我在查谁。话是从你那边走的。\n${s.flags.knowTangName ? "宋棠" : "未署名"}`,
              );
            }
          },
        },
        {
          text: () => "把这件事留在自己这儿，不转告",
          because: () => "不传能让堂口更静，但夹层里的人就不知道危险已经近了。",
          visible: false,
          score: () => 4,
          act: () => undefined,
        },
      ],
    },
    {
      stamp: "tang-asks-shen",
      agent: "tang",
      goal: "自己问完说书人，不许别人代她决定",
      when: (s) =>
        s.day === 4 &&
        s.flags.motiveDone &&
        s.flags.girlCoop !== "ally" &&
        getRel(s, "tang", "player").trust < 1 &&
        Boolean(s.clues.blade_old || s.flags.shenConfessed) &&
        !s.flags.survivorLeak,
      saw: (s) => ["trust<1", s.clues.blade_old ? "blade_old" : "shenConfessed"],
      options: [
        {
          text: () => "夜间去求证沈砚，不经过玩家",
          because: () => "她的目标是问完，不是等一个她不信任的中间人。",
          visible: false,
          score: (s) => goalPull(s, "tang", "tang-ask") + (getRel(s, "tang", "player").trust < 1 ? 3 : 0),
          act: (s) => {
            bump(s, "tang", "shen", { trust: 2, close: 1 }, "tang-to-shen", "宋棠不信任你，转而去求证沈砚。她开始信他。");
            bump(s, "shen", "tang", { trust: 1 }, "shen-to-tang", "沈砚接受了宋棠的求证。");
            revealBond(s, "tang", "shen");
            shareClaim(s, "blade_old", "tang");
            pushEvent(s, {
              title: "宋棠绕过你去找沈砚",
              summary: "因不信任玩家，宋棠夜间向沈砚求证。两人建立联系。",
              visible: false,
              who: ["tang", "shen"],
              causes: [],
              effects: ["tang trusts shen"],
            });
            s.report.push({ title: "有人绕过你", body: "你没有成为宋棠的同伴。夜里她去找了沈砚。" });
          },
        },
        {
          text: () => "继续把下一步交给玩家",
          because: () => "交给玩家省事，但她并不信任这个中间人。",
          visible: false,
          score: (s) => (getRel(s, "tang", "player").trust < 1 ? -1 : 6),
          act: () => undefined,
        },
      ],
    },
  ];
}

export function tick(s: GameState) {
  if (!s.decisions) s.decisions = [];
  if (!s.fired) s.fired = [];
  const board = agendas();
  for (let pass = 0; pass < 4; pass += 1) {
    let moved = false;
    for (const agenda of board) {
      if (s.fired.includes(agenda.stamp) || !agenda.when(s)) continue;
      const saw = agenda.saw(s);
      const ranked = agenda.options
        .map((option) => ({ option, score: option.score(s) }))
        .sort((a, b) => b.score - a.score || a.option.text(s).localeCompare(b.option.text(s), "zh"));
      const best = ranked[0];
      const alt = ranked[1] ?? ranked[0];
      if (!best) continue;
      s.fired.push(agenda.stamp);
      best.option.act(s);
      decide(s, {
        agent: agenda.agent,
        goal: agenda.goal,
        saw,
        chose: best.option.text(s),
        because: best.option.because(s),
        rejected: alt.option.text(s),
        visible: best.option.visible,
        score: best.score,
        altScore: alt.score,
      });
      moved = true;
    }
    if (!moved) break;
  }
  s.minds = projectMinds(s);
}
