import { useEffect, useRef, useState } from "react";
import { BookOpen, ChevronLeft, Mail, Moon, ScrollText, Send, Users } from "lucide-react";
import { CHARS, LOCS } from "@/game/content";
import {
  agentCards,
  allClues,
  audit,
  bondRows,
  currentScene,
  insights,
  ledger,
  mapVM,
  pactRows,
  personName,
  sequelVM,
  suggestions,
} from "@/game/engine";
import { useGame } from "@/game/store";
import type { CharId, LocId } from "@/game/types";

function chime() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 392;
    gain.gain.setValueAtTime(0.03, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);
    osc.onended = () => void ctx.close();
  } catch {
    /* silent */
  }
}

export function Game() {
  const hydrate = useGame((s) => s.hydrate);
  useEffect(() => {
    hydrate();
  }, [hydrate]);
  return <Shell />;
}

function Shell() {
  const screen = useGame((s) => s.state.screen);
  const debug = useGame((s) => s.state.debug);
  const banner = useGame((s) => s.banner);
  const clear = useGame((s) => s.clearBanner);
  return (
    <div className="min-h-dvh bg-ink text-paper">
      <div className="mx-auto flex min-h-dvh w-full max-w-6xl md:flex-row">
        <aside className="hidden w-24 shrink-0 flex-col items-center justify-between border-r border-line/30 py-8 md:flex">
          <p className="font-brush text-3xl leading-none [writing-mode:vertical-rl]">江湖有信</p>
          <p className="text-xs tracking-[0.35em] text-mist [writing-mode:vertical-rl]">渡口无归人</p>
        </aside>
        <main className="relative min-w-0 flex-1">
          {screen === "title" && <Title />}
          {screen === "map" && <MapScreen />}
          {screen === "talk" && <TalkScreen />}
          {screen === "scene" && <SceneScreen />}
          {screen === "mail" && <MailScreen />}
          {screen === "journal" && <JournalScreen />}
          {screen === "bonds" && <BondScreen />}
          {screen === "dayend" && <DayEnd />}
          {screen === "ending" && <EndingScreen />}
          {screen === "sequel" && <SequelScreen />}
          {banner && (
            <button type="button" onClick={clear} className="sheet absolute right-4 bottom-24 left-4 z-20 border border-line px-4 py-3 text-left text-sm shadow-lg md:right-auto md:bottom-8 md:left-8 md:max-w-md">
              {banner}
            </button>
          )}
          {debug && screen !== "title" && <Debug />}
        </main>
      </div>
    </div>
  );
}

function Title() {
  const started = useGame((s) => s.state.started);
  const start = useGame((s) => s.start);
  const reset = useGame((s) => s.reset);
  const morning = useGame((s) => s.morning);
  const [name, setName] = useState("旅人");
  const [askReset, setAskReset] = useState(false);
  return (
    <div className="sheet relative min-h-dvh">
      <img src={LOCS.ferry.image} alt="" className="h-64 w-full object-cover md:h-80" />
      <div className="mx-auto max-w-xl px-5 py-8 md:px-8">
        <p className="text-sm tracking-[0.4em] text-cinnabar">首章</p>
        <h1 className="font-brush mt-2 text-6xl text-balance text-ink">江湖有信</h1>
        <p className="mt-2 text-xl text-tea">渡口无归人</p>
        <p className="mt-6 text-pretty leading-7 text-ink">
          渡口上少了一个该回来的人。茶肆后院的门从里面闩着。有人在找说书的，有人准备天亮就走。你是路过的。你说出去的话，会有人当真。
        </p>
        <p className="mt-4 text-sm leading-6 text-mist">每日三个时辰。读信和手记不耗时辰。</p>
        <label className="mt-8 block text-sm text-tea">
          如何称呼你
          <input
            value={name}
            maxLength={8}
            onChange={(e) => setName(e.target.value)}
            className="mt-2 w-full border border-line bg-paper-deep px-3 py-3 text-ink outline-none"
          />
        </label>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={() => start(name)} className="min-h-11 bg-cinnabar px-5 py-3 text-paper">
            {started ? "重新开局" : "进入渡口"}
          </button>
          {started && (
            <button type="button" onClick={() => morning()} className="min-h-11 border border-line px-5 py-3">
              继续这一局
            </button>
          )}
        </div>
        {started && !askReset && (
          <button type="button" onClick={() => setAskReset(true)} className="mt-6 text-sm text-mist underline-offset-4 hover:underline">
            清除存档
          </button>
        )}
        {askReset && (
          <div className="mt-6 border border-line p-4">
            <p>存档会消失，包括关系与承诺。</p>
            <div className="mt-3 flex gap-3">
              <button type="button" className="min-h-11 bg-ink px-4 text-paper" onClick={reset}>
                确认清除
              </button>
              <button type="button" className="min-h-11 px-4" onClick={() => setAskReset(false)}>
                留下
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TopBar({ title, onBack }: { title: string; onBack?: () => void }) {
  const day = useGame((s) => s.state.day);
  const slots = useGame((s) => s.state.slots);
  const mode = useGame((s) => s.state.mode);
  const finish = useGame((s) => s.finishDay);
  const names = ["", "一", "二", "三", "四", "五", "六", "七"];
  const label = mode === "daily" ? `此后 ${day - 7}` : `第${names[day] ?? day}日`;
  return (
    <header className="sheet sticky top-0 z-10 flex items-center gap-3 border-b border-line px-4 py-3">
      {onBack ? (
        <button type="button" onClick={onBack} className="grid size-11 place-items-center border border-line" aria-label="返回">
          <ChevronLeft className="size-5" />
        </button>
      ) : (
        <p className="font-brush text-2xl md:hidden">江湖有信</p>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-tea">{label}</p>
        <p className="truncate font-semibold">{title}</p>
      </div>
      <div className="flex items-center gap-1" aria-label={`剩余时辰 ${slots}`}>
        {[0, 1, 2].map((i) => (
          <span key={i} className={`size-2.5 rounded-full ${i < slots ? "bg-cinnabar" : "bg-line"}`} />
        ))}
      </div>
      {mode === "main" && day < 7 && (
        <button type="button" onClick={finish} className="hidden min-h-11 items-center gap-1 border border-line px-3 text-sm sm:flex">
          <Moon className="size-4" />
          结束今日
        </button>
      )}
      {mode === "daily" && (
        <button type="button" onClick={finish} className="hidden min-h-11 border border-line px-3 text-sm sm:flex">
          推进日期
        </button>
      )}
    </header>
  );
}

function MapScreen() {
  const state = useGame((s) => s.state);
  const lookAt = useGame((s) => s.lookAt);
  const begin = useGame((s) => s.begin);
  const open = useGame((s) => s.openScene);
  const openDoor = useGame((s) => s.openDoor);
  const go = useGame((s) => s.go);
  const dismiss = useGame((s) => s.dismiss);
  const finish = useGame((s) => s.finishDay);
  const openSq = useGame((s) => s.openSequel);
  const vm = mapVM(state);
  return (
    <div className="sheet min-h-dvh pb-24">
      <TopBar title="渡口" />
      <div className="mx-auto max-w-3xl px-4 py-5">
        <p className="text-pretty leading-7">{vm.brief}</p>
        {vm.notice && (
          <div className="mt-4 border border-gold bg-paper-deep p-4">
            <p className="text-pretty leading-7">{vm.notice}</p>
            <button type="button" className="mt-2 text-sm text-tea" onClick={dismiss}>
              收起
            </button>
          </div>
        )}
        {vm.urgentTitle && (
          <button type="button" onClick={open} className="mt-4 w-full border border-cinnabar bg-paper-deep p-4 text-left">
            <p className="text-xs tracking-[0.2em] text-cinnabar">今日这一场</p>
            <p className="mt-1 text-lg">{vm.urgentTitle}</p>
            <p className="mt-1 text-sm text-tea">{vm.urgentDetail}</p>
          </button>
        )}
        {vm.door && (
          <button type="button" onClick={openDoor} className="mt-4 w-full border border-cinnabar bg-paper-deep p-4 text-left">
            <p className="text-xs tracking-[0.2em] text-cinnabar">茶肆门口</p>
            <p className="mt-1 text-lg">{vm.door.title}</p>
            <p className="mt-1 text-sm text-tea">{vm.door.detail}</p>
          </button>
        )}
        {vm.pact && (
          <div className="mt-4 border border-gold bg-paper-deep p-4">
            <p className="text-xs tracking-[0.2em] text-cinnabar">江湖约定</p>
            <p className="mt-1 text-lg">{vm.pact.title}</p>
            <p className="mt-2 text-sm leading-6">你的承诺：{vm.pact.you}</p>
            <p className="mt-1 text-sm leading-6">她的承诺：{vm.pact.hers}</p>
            <p className="mt-1 text-sm leading-6 text-tea">
              期限：{vm.pact.due} · {vm.pact.progress}
            </p>
          </div>
        )}
        {vm.sequelReady && (
          <button type="button" onClick={openSq} className="mt-4 w-full border border-ink p-4 text-left">
            <p className="text-xs tracking-[0.2em] text-tea">后续</p>
            <p className="mt-1 text-lg">一封未署名的求援信</p>
          </button>
        )}
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {vm.locs.map((loc) => (
            <article key={loc.id} className="overflow-hidden border border-line">
              <img src={loc.image} alt="" className="h-36 w-full object-cover" />
              <div className="p-4">
                <h2 className="text-xl">{loc.name}</h2>
                <p className="mt-1 text-sm leading-6 text-tea">{loc.desc}</p>
                {loc.locked ? (
                  <p className="mt-3 text-sm text-mist">{loc.locked}</p>
                ) : (
                  <>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {loc.people.length === 0 && <span className="text-sm text-mist">此刻没有你认得的人。</span>}
                      {loc.people.map((p) => (
                        <button key={p.id} type="button" onClick={() => begin(p.id as CharId)} className="flex min-h-11 items-center gap-2 border border-line pr-3 text-left">
                          <img src={CHARS[p.id as CharId].portrait} alt="" className="size-11 object-cover object-top" />
                          <span>
                            <span className="block">{p.name}</span>
                            {p.note && <span className="block text-xs text-mist">{p.note}</span>}
                          </span>
                        </button>
                      ))}
                    </div>
                    <button type="button" onClick={() => lookAt(loc.id as LocId)} className="mt-3 min-h-11 text-sm text-cinnabar">
                      花一个时辰四处看看
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
        <button type="button" onClick={finish} className="mt-4 min-h-11 w-full border border-line sm:hidden">
          {state.mode === "daily" ? "推进日期" : state.day >= 7 ? "今日要去公廨了断" : "结束今日"}
        </button>
        <Restart />
      </div>
      <Nav current="map" unread={vm.unread} onGo={go} />
    </div>
  );
}

function Nav({ current, unread, onGo }: { current: string; unread: number; onGo: (s: "map" | "mail" | "journal" | "bonds") => void }) {
  const items = [
    { id: "map" as const, label: "渡口", icon: ScrollText },
    { id: "mail" as const, label: "来信", icon: Mail },
    { id: "journal" as const, label: "手记", icon: BookOpen },
    { id: "bonds" as const, label: "人情", icon: Users },
  ];
  return (
        <nav className="sheet fixed inset-x-0 bottom-0 z-20 border-t border-line">
      <ul className="mx-auto grid max-w-3xl grid-cols-4">
        {items.map((item) => {
          const Icon = item.icon;
          const on = current === item.id;
          return (
            <li key={item.id}>
              <button type="button" onClick={() => onGo(item.id)} className={`flex min-h-14 w-full flex-col items-center justify-center gap-1 text-xs ${on ? "text-cinnabar" : "text-tea"}`}>
                <Icon className="size-5" />
                {item.label}
                {item.id === "mail" && unread > 0 ? ` ${unread}` : ""}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function TalkScreen() {
  const state = useGame((s) => s.state);
  const busy = useGame((s) => s.busy);
  const send = useGame((s) => s.say);
  const stageAct = useGame((s) => s.stage);
  const leave = useGame((s) => s.leave);
  const ok = useGame((s) => s.confirm);
  const no = useGame((s) => s.cancel);
  const id = state.talk;
  const box = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [state.chats, state.pending, busy]);
  if (!id) return null;
  const meta = CHARS[id];
  const rounds = state.rounds[`${state.day}:${id}`] ?? 0;
  const chips = suggestions(state, id);
  return (
    <div className="sheet flex min-h-dvh flex-col">
      <TopBar title={personName(state, id)} onBack={leave} />
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4">
        <div className="flex items-center gap-3 py-3">
          <img src={meta.portrait} alt="" className="size-14 object-cover object-top" />
          <div>
            <p className="text-lg">{personName(state, id)}</p>
            <p className="text-sm text-tea">{meta.role} · 这个时辰还剩 {rounds} 轮</p>
          </div>
        </div>
        <div ref={box} className="flex max-h-[48dvh] flex-1 flex-col gap-3 overflow-y-auto pb-3 md:max-h-[56dvh]">
          {state.chats[id].map((m) => (
            <p key={m.id} className={`max-w-[40rem] text-pretty leading-7 ${m.role === "player" ? "ml-8 border border-line bg-paper-deep px-3 py-2" : ""}`}>
              {m.role === "player" ? "你" : personName(state, id)}：{m.text}
            </p>
          ))}
          {busy && <p className="text-sm text-mist">正在回答……</p>}
        </div>
        {state.pending && <ConfirmCard onOk={() => { chime(); ok(); }} onNo={no} />}
        <div className="flex flex-wrap gap-2 py-2">
          {chips.map((c) => (
            <button
              key={c.label}
              type="button"
              disabled={busy || !!state.pending}
              className="min-h-11 border border-line px-3 text-sm"
              onClick={() => (c.action ? stageAct(c.action) : c.text && void send(c.text))}
            >
              {c.label}
            </button>
          ))}
        </div>
        <p className="pt-2 text-xs leading-5 text-mist">想问什么就问。能说的会说完，不能说的会告诉你为什么。</p>
        <form
          className="flex gap-2 pb-4"
          onSubmit={(e) => {
            e.preventDefault();
            const value = text;
            setText("");
            void send(value);
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={busy || rounds <= 0 || !!state.pending}
            placeholder={rounds <= 0 ? "这个时辰的话已经说完" : "说你想说的"}
            className="min-h-11 min-w-0 flex-1 border border-line bg-paper px-3"
          />
          <button type="submit" className="grid size-11 place-items-center bg-cinnabar text-paper" aria-label="发送" disabled={busy}>
            <Send className="size-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

function Restart() {
  const reset = useGame((s) => s.reset);
  const [ask, setAsk] = useState(false);
  if (!ask) {
    return (
      <button type="button" onClick={() => setAsk(true)} className="mt-6 mb-2 text-sm text-mist">
        重开这一局
      </button>
    );
  }
  return (
    <div className="mt-6 mb-4 border border-line p-4">
      <p>重开会抹掉关系、承诺和已经写下的信。</p>
      <div className="mt-3 flex gap-3">
        <button type="button" className="min-h-11 bg-ink px-4 text-paper" onClick={reset}>
          确认重开
        </button>
        <button type="button" className="min-h-11 px-4" onClick={() => setAsk(false)}>
          留下
        </button>
      </div>
    </div>
  );
}

const SCENE_ART: Record<string, string> = {
  day1: LOCS.tea.image,
  door: LOCS.tea.image,
  vouch: LOCS.tea.image,
  confront: LOCS.ferry.image,
  drown: LOCS.ferry.image,
  motive: LOCS.ferry.image,
  layout: LOCS.hide.image,
  register: LOCS.tea.image,
  crisis: LOCS.yamen.image,
};

function ConfirmCard({ onOk, onNo }: { onOk: () => void; onNo: () => void }) {
  const pending = useGame((s) => s.state.pending);
  if (!pending) return null;
  return (
    <div className="border border-cinnabar bg-paper-deep p-4">
      <p className="text-xs tracking-[0.25em] text-cinnabar">{pending.action.startsWith("pact_") ? "江湖约定" : "这一句说出去"}</p>
      <h3 className="mt-1 text-lg">{pending.title}</h3>
      {pending.lines.map((line) => (
        <p key={line} className="mt-2 text-pretty leading-7">
          {line}
        </p>
      ))}
      {pending.source && <p className="mt-2 text-sm text-tea">这是从{pending.source}听来的。</p>}
      {pending.warning && <p className="mt-2 text-sm text-cinnabar">{pending.warning}</p>}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={onOk} className="min-h-11 bg-cinnabar px-4 text-paper">
          {pending.confirmLabel}
        </button>
        <button type="button" onClick={onNo} className="min-h-11 border border-line px-4">
          先不这样
        </button>
      </div>
    </div>
  );
}

function SceneScreen() {
  const state = useGame((s) => s.state);
  const stageAct = useGame((s) => s.stage);
  const leave = useGame((s) => s.leave);
  const ok = useGame((s) => s.confirm);
  const no = useGame((s) => s.cancel);
  const dismiss = useGame((s) => s.dismiss);
  const vm = currentScene(state);
  return (
    <div className="sheet min-h-dvh">
      <TopBar title={vm?.title ?? "这一场"} onBack={leave} />
      {vm && SCENE_ART[vm.id] && <img src={SCENE_ART[vm.id]} alt="" className="h-40 w-full object-cover md:h-52" />}
      <div className="mx-auto max-w-2xl px-4 py-6">
        <p className="text-sm tracking-[0.2em] text-cinnabar">{vm?.kicker}</p>
        {vm?.paras.map((p) => (
          <p key={p} className="mt-4 text-pretty leading-8">
            {p}
          </p>
        ))}
        {vm?.foot && <p className="mt-4 text-sm text-tea">{vm.foot}</p>}
        {state.notice && (
          <div className="mt-4 border border-gold p-3">
            <p>{state.notice}</p>
            <button type="button" className="mt-2 text-sm text-tea" onClick={dismiss}>
              知道了
            </button>
          </div>
        )}
        <div className="mt-6 flex flex-col gap-3">
          {state.pending ? (
            <ConfirmCard onOk={() => { chime(); ok(); }} onNo={no} />
          ) : (
            vm?.choices.map((c) => (
              <button key={c.action} type="button" disabled={!!c.disabled} onClick={() => stageAct(c.action)} className="min-h-11 border border-line px-4 py-3 text-left disabled:text-mist">
                <span className="block">{c.label}</span>
                {c.disabled && <span className="mt-1 block text-sm text-mist">{c.disabled}</span>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function MailScreen() {
  const state = useGame((s) => s.state);
  const go = useGame((s) => s.go);
  const read = useGame((s) => s.read);
  const openSq = useGame((s) => s.openSequel);
  const [id, setId] = useState<string | null>(state.letters[0]?.id ?? null);
  const letter = state.letters.find((l) => l.id === id) ?? state.letters[0];
  const from = letter ? (letter.from === "anon" ? "未署名" : personName(state, letter.from)) : "";
  return (
    <div className="sheet min-h-dvh pb-24">
      <TopBar title="来信" onBack={() => go("map")} />
      <div className="mx-auto grid max-w-3xl gap-4 px-4 py-5 md:grid-cols-[16rem_1fr]">
        <ul className="flex gap-2 overflow-x-auto md:flex-col">
          {state.letters.length === 0 && <li className="text-mist">信匣是空的。</li>}
          {state.letters.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => {
                  setId(l.id);
                  read(l.id);
                }}
                className={`min-h-11 min-w-36 border px-3 text-left ${letter?.id === l.id ? "border-cinnabar" : "border-line"}`}
              >
                <span className="block text-sm">{l.title}</span>
                <span className="text-xs text-mist">{l.unread ? "未读 · " : ""}第{l.day}日</span>
              </button>
            </li>
          ))}
        </ul>
        {letter && (
          <article>
            <p className="text-sm text-tea">{from}</p>
            <h2 className="mt-1 text-2xl">{letter.title}</h2>
            <p className="mt-4 text-pretty leading-8 whitespace-pre-wrap">{letter.body}</p>
            {letter.id.startsWith("sq") && !state.sequel?.done && (
              <button type="button" onClick={openSq} className="mt-4 min-h-11 bg-cinnabar px-4 text-paper">
                展开这件事
              </button>
            )}
          </article>
        )}
      </div>
      <Nav current="mail" unread={state.letters.filter((l) => l.unread).length} onGo={go} />
    </div>
  );
}

function JournalScreen() {
  const state = useGame((s) => s.state);
  const go = useGame((s) => s.go);
  const clues = allClues(state);
  const twists = insights(state);
  const props = ledger(state);
  const agreed = pactRows(state);
  const verified = clues.filter((c) => c.verified).length;
  return (
    <div className="sheet min-h-dvh pb-24">
      <TopBar title="江湖手记" onBack={() => go("map")} />
      <div className="mx-auto max-w-3xl px-4 py-5">
        <p className="text-pretty leading-7">记下你听见的、看见的。两条对得上，才写在一起。</p>
        <p className="mt-2 text-sm text-tea">
          对得上的 {verified} · 还只是听见的 {clues.length - verified}
        </p>
        <h2 className="mt-8 text-lg">记下的</h2>
        {clues.length === 0 && <p className="mt-2 text-mist">还没有写下来的事。</p>}
        <ul className="mt-3 grid gap-3">
          {clues.map((c) => (
            <li key={c.id} className="border-b border-line pb-3">
              <p className="leading-7">{c.text}</p>
              <p className="mt-1 text-sm text-tea">
                {c.verified ? "这句已经对得上" : "还只是听见"} · {c.source} · 第{c.day}日
              </p>
            </li>
          ))}
        </ul>
        <h2 className="mt-8 text-lg">对得上的地方</h2>
        {twists.length === 0 && <p className="mt-2 text-mist">还没有能并排放下的线头。</p>}
        <div className="mt-3 grid gap-3">
          {twists.map((t) => (
            <article key={t.id} className="border border-line p-4">
              <p className="text-cinnabar">{t.revealed ? t.title : "线头还缺一条"}</p>
              {t.clues.map((c) => (
                <p key={c.id} className="mt-2 leading-7">
                  {c.text}
                  <span className="mt-1 block text-sm text-tea">{c.verified ? "对得上" : "还只是听见"} · {c.source}</span>
                </p>
              ))}
            </article>
          ))}
        </div>
        <details className="mt-8 border border-line p-4">
          <summary className="cursor-pointer text-sm text-tea">对照</summary>
          {props.length === 0 && <p className="mt-3 text-sm text-mist">还没有能并排放下的句子。</p>}
          <ul className="mt-3 grid gap-3">
            {props.map((c) => (
              <li key={c.id}>
                <p className="text-sm leading-6">{c.line}</p>
                <p className="mt-1 text-xs text-mist">
                  {c.tone}
                  {c.with.length > 0 ? ` · 也在 ${c.with.join("、")} 那里` : ""} · {c.sources}
                </p>
                {c.from.length > 0 && <p className="mt-1 text-xs leading-5">由这些并出：{c.from.join("；")}</p>}
                {c.against.length > 0 && <p className="mt-1 text-xs leading-5 text-cinnabar">对不上：{c.against.join("；")}</p>}
              </li>
            ))}
          </ul>
        </details>
        <h2 className="mt-8 text-lg">江湖约定</h2>
        <ul className="mt-3 grid gap-2">
          {agreed.length === 0 && <li className="text-mist">还没有和谁一起约定要做成的事。</li>}
          {agreed.map((pact) => (
            <li key={pact.id} className="border border-line p-3">
              <p>{pact.title}</p>
              <p className="mt-2 text-sm leading-6">你的承诺：{pact.player}</p>
              <p className="mt-1 text-sm leading-6">她的承诺：{pact.npc}</p>
              <p className="mt-1 text-sm text-tea">
                期限：{pact.due} · {pact.status}
              </p>
              {pact.note && <p className="mt-1 text-sm leading-6 text-mist">{pact.note}</p>}
            </li>
          ))}
        </ul>
        <h2 className="mt-8 text-lg">承诺</h2>
        <ul className="mt-3 grid gap-2">
          {state.promises.length === 0 && <li className="text-mist">你还没有许下会被记住的诺言。</li>}
          {state.promises.map((p) => (
            <li key={p.id} className="border border-line p-3">
              <p>{p.text}</p>
              <p className="text-sm text-tea">
                对{personName(state, p.to)} · {p.status === "open" ? "未了" : p.status === "kept" ? "已兑现" : "已违背"}
                {p.dueDay ? ` · 约在第${p.dueDay}日` : ""}
              </p>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => useGame.getState().debug()} className="mt-8 text-sm text-mist underline-offset-4 hover:underline">
          关于这一局
        </button>
      </div>
      <Nav current="journal" unread={0} onGo={go} />
    </div>
  );
}

function BondScreen() {
  const state = useGame((s) => s.state);
  const go = useGame((s) => s.go);
  const rows = bondRows(state);
  const agents = agentCards(state);
  return (
    <div className="sheet min-h-dvh pb-24">
      <TopBar title="人情" onBack={() => go("map")} />
      <div className="mx-auto max-w-3xl px-4 py-5">
        <h2 className="text-lg">他们此刻要什么</h2>
        <p className="mt-2 text-sm leading-6 text-tea">他们还没做完的事。写在这里的，是你们都已经知道的，不包括他们瞒着你的。</p>
        <ul className="mt-4 grid gap-3">
          {agents.map((a) => (
            <li key={a.id} className="border border-line p-4">
              <p className="text-cinnabar">{a.name}</p>
              <p className="mt-2 leading-7">所求：{a.goal}</p>
              <p className="mt-2 leading-7">相信：{a.belief}</p>
              <p className="mt-2 text-sm leading-6 text-tea">记得：{a.memory}</p>
              <p className="mt-2 text-sm leading-6">若你袖手：{a.ifIdle}</p>
            </li>
          ))}
        </ul>
        <h2 className="mt-8 text-lg">关系</h2>
        <p className="mt-2 text-sm leading-6 text-tea">只写你已经遇见，或从信里知道的变化。隐藏的打算不摊在这一页。</p>
        <ul className="mt-4 grid gap-3">
          {rows.map((r) => (
            <li key={r.key} className="border border-line p-4">
              <p className="leading-7">{r.text}</p>
              <p className="mt-2 text-sm text-mist">{r.note}</p>
            </li>
          ))}
        </ul>
      </div>
      <Nav current="bonds" unread={0} onGo={go} />
    </div>
  );
}

function DayEnd() {
  const state = useGame((s) => s.state);
  const morning = useGame((s) => s.morning);
  return (
    <div className="sheet min-h-dvh">
      <div className="mx-auto max-w-2xl px-5 py-12">
        <p className="text-sm tracking-[0.3em] text-cinnabar">夜</p>
        <h1 className="mt-2 font-brush text-5xl">这一夜过去了</h1>
        <div className="mt-6 grid gap-4">
          {state.report.map((r) => (
            <article key={r.title} className="border-t border-line pt-4">
              <h2>{r.title}</h2>
              <p className="mt-2 text-pretty leading-7">{r.body}</p>
            </article>
          ))}
        </div>
        <p className="mt-6 text-sm text-tea">你不在场的事，只会以你能得知的方式到来。其余留在笺注里。</p>
        <button type="button" onClick={morning} className="mt-8 min-h-11 bg-cinnabar px-5 text-paper">
          到了次日
        </button>
      </div>
    </div>
  );
}

function EndingScreen() {
  const epi = useGame((s) => s.state.epilogue);
  const toDaily = useGame((s) => s.toDaily);
  if (!epi) return null;
  return (
    <div className="sheet min-h-dvh">
      <div className="mx-auto max-w-2xl px-5 py-12">
        <p className="text-sm tracking-[0.3em] text-cinnabar">结局</p>
        <h1 className="mt-2 text-3xl text-balance">{epi.title}</h1>
        <p className="mt-4 text-pretty leading-8">{epi.summary}</p>
        <p className="mt-4 text-pretty leading-7 text-tea">{epi.cost}</p>
        <h2 className="mt-8 text-lg">后日谈</h2>
        <ul className="mt-3 grid gap-3">
          {epi.fates.map((f) => (
            <li key={f.name} className="border-t border-line pt-3">
              <p className="text-cinnabar">{f.name}</p>
              <p className="mt-1 leading-7">{f.text}</p>
            </li>
          ))}
        </ul>
        <h2 className="mt-8 text-lg">承诺</h2>
        <ul className="mt-2 grid gap-2">
          {epi.promises.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <p className="mt-6 leading-7">{epi.hook}</p>
        <button type="button" onClick={toDaily} className="mt-8 min-h-11 bg-ink px-5 text-paper">
          走进此后的日子
        </button>
      </div>
    </div>
  );
}

function SequelScreen() {
  const state = useGame((s) => s.state);
  const stageAct = useGame((s) => s.stage);
  const ok = useGame((s) => s.confirm);
  const no = useGame((s) => s.cancel);
  const leave = useGame((s) => s.leave);
  const vm = sequelVM(state);
  if (!vm) return null;
  return (
    <div className="sheet min-h-dvh">
      <TopBar title={vm.title} onBack={leave} />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <p className="text-sm tracking-[0.2em] text-cinnabar">{vm.kicker}</p>
        {vm.paras.map((p) => (
          <p key={p} className="mt-4 leading-8">
            {p}
          </p>
        ))}
        <div className="mt-6 flex flex-col gap-3">
          {state.pending ? (
            <ConfirmCard onOk={() => { chime(); ok(); }} onNo={no} />
          ) : (
            vm.choices.map((c) => (
              <button key={c.action} type="button" disabled={!!c.disabled} onClick={() => stageAct(c.action)} className="min-h-11 border border-line px-4 py-3 text-left disabled:text-mist">
                {c.label}
                {c.disabled && <span className="mt-1 block text-sm">{c.disabled}</span>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Debug() {
  const state = useGame((s) => s.state);
  const off = useGame((s) => s.debug);
  const note = audit(state);
  const m = note.metrics;
  return (
    <aside className="sheet fixed right-3 bottom-20 z-30 max-h-[58dvh] w-[min(32rem,calc(100%-1.5rem))] overflow-x-hidden overflow-y-auto border border-ink p-4 break-words shadow-lg">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-cinnabar">笺注 · 调用、驳回与自主行动</p>
        <button type="button" onClick={off} className="min-h-11 px-2">
          关闭
        </button>
      </div>
      <ul className="grid gap-1 text-tea">
        {note.policy.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="mt-3">
        模型接话 {m.modelLines} · 回退 {m.fallbackLines} · 驳回 {m.rejectedLines}
        <br />
        听出意图 {m.proposed} · 被规则拦住 {m.proposedBlocked} · 确认 {m.confirmed} · 搁下 {m.cancelled}
        <br />
        事实 {note.verified} · 传闻 {note.rumor} · 你不在场的事 {note.autonomous}
      </p>
      <h3 className="mt-4 text-cinnabar">最近的边界</h3>
      {note.traces.length === 0 && <p className="text-mist">还没有需要拦截或回退的一句。</p>}
      <ul className="mt-1 grid gap-2">
        {note.traces.map((t) => (
          <li key={t.id}>
            第{t.day}日 · {t.text}
          </li>
        ))}
      </ul>
      <h3 className="mt-4 text-cinnabar">夜里的取舍</h3>
      {note.decisions.length === 0 && <p className="text-mist">还没有人在你不在场时做过选择。</p>}
      <ul className="mt-1 grid gap-3">
        {note.decisions.map((d) => (
          <li key={d.id}>
            <p className="text-ink">{d.head}</p>
            <p>目标：{d.goal}</p>
            <p>所见：{d.saw}</p>
            <p>选了：{d.chose}</p>
            <p>放弃：{d.rejected}</p>
            <p className="text-tea">{d.because}</p>
          </li>
        ))}
      </ul>
      <h3 className="mt-4 text-cinnabar">命题与未公开的事</h3>
      {note.privates.length === 0 && <p className="text-mist">还没有推出的命题。</p>}
      <ul className="mt-1 grid gap-2">
        {note.privates.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <h3 className="mt-4 text-cinnabar">最近一次理由</h3>
      <ul className="mt-1 grid gap-2">
        {note.agents.map((a) => (
          <li key={a.id}>
            <span className="text-ink">{a.name}</span> · {a.rule}
          </li>
        ))}
      </ul>
      <h3 className="mt-4 text-cinnabar">你看不见的链</h3>
      {note.hidden.length === 0 && <p className="text-mist">夜里还没有发生过你不在场的事。</p>}
      <ul className="mt-1 grid gap-2">
        {note.hidden.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </aside>
  );
}
