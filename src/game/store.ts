import { create } from "zustand";
import { converse } from "./ai.ts";
import { freshClaims, syncClaim } from "./kb.ts";
import { projectMinds } from "./mind.ts";
import { emptyMetrics } from "./mutate.ts";
import {
  appendNpc,
  applyProposal,
  beginTalk,
  cancel,
  canned,
  confirm,
  dismissNotice,
  endDay,
  enterDaily,
  goScreen,
  initialState,
  leaveToMap,
  look,
  noteBadCite,
  noteDroppedIntent,
  openDoor,
  openScene,
  openSequel,
  readLetter,
  recordLine,
  replyAllowed,
  say,
  stage,
  startGame,
  toMorning,
  toggleDebug,
} from "./engine.ts";
import type { CharId, GameState, LocId, Screen, Step } from "./types.ts";

const KEY = "jianghu-youxin-v1";

function isStep(value: Step | GameState): value is Step {
  return "state" in value && !("version" in value);
}

interface Store {
  hydrated: boolean;
  busy: boolean;
  banner: string | null;
  epoch: number;
  state: GameState;
  hydrate: () => void;
  start: (name: string) => void;
  reset: () => void;
  commit: (result: Step | GameState) => void;
  say: (text: string) => Promise<void>;
  stage: (action: string) => void;
  confirm: () => void;
  cancel: () => void;
  begin: (id: CharId) => void;
  lookAt: (id: LocId) => void;
  openScene: () => void;
  openDoor: () => void;
  finishDay: () => void;
  morning: () => void;
  toDaily: () => void;
  openSequel: () => void;
  leave: () => void;
  go: (screen: Screen) => void;
  read: (id: string) => void;
  dismiss: () => void;
  debug: () => void;
  clearBanner: () => void;
}

function repair(parsed: GameState): GameState {
  if (!parsed.metrics) parsed.metrics = emptyMetrics();
  if (!parsed.traces) parsed.traces = [];
  if (!parsed.fired) parsed.fired = [];
  if (!parsed.decisions) parsed.decisions = [];
  if (!parsed.claims) {
    parsed.claims = freshClaims();
    for (const [id, clue] of Object.entries(parsed.clues ?? {})) {
      syncClaim(parsed, id, clue.source, clue.verified);
    }
  }
  for (const claim of Object.values(parsed.claims)) {
    if (!claim.stance) {
      claim.stance = {};
      for (const holder of claim.holders ?? []) claim.stance[holder] = claim.status === "verified" ? "verified" : "rumor";
    }
    if (!claim.contradicts) claim.contradicts = [];
    if (!claim.derivedFrom) claim.derivedFrom = [];
  }
  if (!parsed.minds) parsed.minds = projectMinds(parsed);
  if (!Array.isArray(parsed.pacts)) parsed.pacts = [];
  return parsed;
}

function persist(state: GameState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore quota */
  }
}

export const useGame = create<Store>((set, get) => ({
  hydrated: false,
  busy: false,
  banner: null,
  epoch: 0,
  state: initialState(),
  hydrate: () => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as GameState;
        if (parsed?.version === 1 && parsed.started && parsed.flags && parsed.chats) {
          set({ state: repair(parsed), hydrated: true });
          return;
        }
      }
    } catch {
      /* fresh */
    }
    set({ hydrated: true });
  },
  commit: (result) => {
    if (isStep(result)) {
      if (result.blocked) {
        set({ banner: result.blocked });
        return;
      }
      set({ state: result.state, banner: null });
      persist(result.state);
      return;
    }
    set({ state: result, banner: null });
    persist(result);
  },
  start: (name) => {
    const state = startGame(name);
    set((s) => ({ state, banner: null, epoch: s.epoch + 1 }));
    persist(state);
  },
  reset: () => {
    const state = initialState();
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    set((s) => ({ state, banner: null, epoch: s.epoch + 1, busy: false }));
  },
  say: async (text) => {
    if (get().busy) return;
    const step = say(get().state, text);
    if (step.blocked || !step.ai) {
      get().commit(step);
      return;
    }
    const epoch = get().epoch;
    const char = step.ai.character;
    const line = step.ai.playerLine;
    set({ state: step.state, busy: true, banner: null });
    persist(step.state);
    let reply = "";
    let live = false;
    let intent = "";
    let dropped = false;
    let leaked = false;
    let droppedCites: string[] = [];
    try {
      const res = await converse({ data: step.ai });
      if (get().epoch !== epoch) return;
      if (res.ok && replyAllowed(get().state, char, res.text)) {
        reply = res.text;
        live = true;
        intent = res.intent;
        dropped = res.dropped;
        droppedCites = res.droppedCites ?? [];
      } else if (res.ok) leaked = true;
    } catch {
      reply = "";
    }
    if (get().epoch !== epoch) return;
    if (!reply) reply = canned(get().state, char, line);
    let next = appendNpc(get().state, char, reply, live);
    next = recordLine(next, live ? "model" : leaked ? "reject" : "fallback");
    if (live && droppedCites.length) next = noteBadCite(next, droppedCites);
    if (live && dropped) next = noteDroppedIntent(next);
    else if (live && intent) next = applyProposal(next, intent).state;
    set({ state: next, busy: false });
    persist(next);
  },
  stage: (action) => get().commit(stage(get().state, action)),
  confirm: () => get().commit(confirm(get().state)),
  cancel: () => get().commit(cancel(get().state)),
  begin: (id) => get().commit(beginTalk(get().state, id)),
  lookAt: (id) => get().commit(look(get().state, id)),
  openScene: () => get().commit(openScene(get().state)),
  openDoor: () => get().commit(openDoor(get().state)),
  finishDay: () => get().commit(endDay(get().state)),
  morning: () => get().commit(toMorning(get().state)),
  toDaily: () => get().commit(enterDaily(get().state)),
  openSequel: () => get().commit(openSequel(get().state)),
  leave: () => get().commit(leaveToMap(get().state)),
  go: (screen) => get().commit(goScreen(get().state, screen)),
  read: (id) => get().commit(readLetter(get().state, id)),
  dismiss: () => get().commit(dismissNotice(get().state)),
  debug: () => get().commit(toggleDebug(get().state)),
  clearBanner: () => set({ banner: null }),
}));
