export type CharId = "gu" | "tang" | "shen" | "liu" | "pei";
export type LocId = "tea" | "ferry" | "escort" | "yamen" | "hide";
export type Screen =
  | "title"
  | "map"
  | "talk"
  | "mail"
  | "journal"
  | "bonds"
  | "scene"
  | "dayend"
  | "ending"
  | "sequel";
export type EndingId = "testify" | "evacuate" | "rupture";
export type SequelRoute = "direct" | "via_shen" | "sidelong" | "confront";

export interface Rel {
  close: number;
  trust: number;
  debt: number;
}

export interface ClueState {
  known: boolean;
  verified: boolean;
  source: string;
  day: number;
}

export interface PromiseRec {
  id: string;
  to: CharId;
  text: string;
  dayMade: number;
  dueDay?: number;
  status: "open" | "kept" | "broken";
}

export type PactStatus = "fulfilling" | "done" | "cancelled" | "broken" | "npc_failed";

export interface Pact {
  id: string;
  template: "tea_night";
  with: CharId;
  title: string;
  playerDuty: string;
  npcDuty: string;
  dueDay: number;
  status: PactStatus;
  playerDone: boolean;
  npcDone: boolean;
  heldTea: boolean;
  world: "" | "tea_night";
  note: string;
}

export interface Letter {
  id: string;
  from: CharId | "anon";
  day: number;
  title: string;
  body: string;
  unread: boolean;
  eventId?: string;
}

export interface GameEvent {
  id: string;
  day: number;
  title: string;
  summary: string;
  visible: boolean;
  who: string[];
  causes: string[];
  effects: string[];
}

export interface ChatMsg {
  id: string;
  role: "player" | "npc";
  text: string;
  day: number;
  live?: boolean;
}

export interface Claim {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  status: "rumor" | "verified" | "contradicted";
  sources: { who: string; day: number; how: string }[];
  holders: string[];
  derivedFrom: string[];
  stance: Record<string, "verified" | "rumor">;
  contradicts: string[];
}

export interface GoalState {
  id: string;
  rank: number;
  text: string;
  status: "open" | "done" | "blocked";
  ifIdle: string;
}

export interface Mind {
  goals: GoalState[];
  beliefs: string[];
}

export interface Decision {
  id: string;
  day: number;
  agent: CharId;
  goal: string;
  saw: string[];
  chose: string;
  because: string;
  rejected: string;
  visible: boolean;
  score: number;
  altScore: number;
}

export interface Memory {
  id: string;
  day: number;
  text: string;
  who: CharId[];
  kind: "promise" | "secret" | "harm" | "help" | "pref";
}

export interface Pending {
  id: string;
  action: string;
  title: string;
  lines: string[];
  source?: string;
  warning?: string;
  confirmLabel: string;
  npcLine: string;
}

export interface Flags {
  name: string;
  vouch: "none" | "accepted" | "refused" | "ignored";
  peiTipped: boolean;
  fakeDeathExposed: boolean;
  sawDrowning: boolean;
  girlWhere: "none" | "kept" | "broken";
  shenWhere: "none" | "kept" | "broken";
  shenConfided: boolean;
  girlCoop: "none" | "ally" | "doubt" | "refused";
  decidedForHer: boolean;
  liuConfessed: boolean;
  shenConfessed: boolean;
  guConfessed: boolean;
  registerSeen: boolean;
  registerWith: "none" | "pei_partial" | "pei_full" | "liu" | "tang" | "player" | "contested" | "lost";
  survivorLeak: boolean;
  shenInjured: boolean;
  shenDetained: boolean;
  mediated: boolean;
  guWillTestify: boolean;
  shenWillTestify: boolean;
  tangWillTestify: boolean;
  hideoutOpen: boolean;
  toldPeiAboutShen: boolean;
  stoodForShen: boolean;
  motiveDone: boolean;
  layoutDone: boolean;
  knowTangName: boolean;
  ending: "" | EndingId;
  evidenceSecured: boolean;
}

export interface SequelState {
  route: SequelRoute;
  step: number;
  done: boolean;
  log: string[];
}

export interface Metrics {
  talks: number;
  modelLines: number;
  fallbackLines: number;
  rejectedLines: number;
  confirmed: number;
  cancelled: number;
  proposed: number;
  proposedBlocked: number;
}

export interface Trace {
  id: string;
  day: number;
  kind: "fallback" | "reject" | "propose" | "block" | "cite";
  text: string;
}

export interface Epilogue {
  title: string;
  summary: string;
  cost: string;
  fates: { name: string; text: string }[];
  promises: string[];
  hook: string;
}

export interface GameState {
  version: 1;
  started: boolean;
  screen: Screen;
  mode: "main" | "daily";
  day: number;
  slots: number;
  loc: LocId | null;
  talk: CharId | null;
  scene: string | null;
  rounds: Record<string, number>;
  pending: Pending | null;
  flags: Flags;
  rel: Record<string, Rel>;
  relNotes: Record<string, string>;
  clues: Record<string, ClueState>;
  promises: PromiseRec[];
  pacts: Pact[];
  letters: Letter[];
  events: GameEvent[];
  chats: Record<CharId, ChatMsg[]>;
  memories: Memory[];
  fired: string[];
  met: CharId[];
  named: CharId[];
  knownBonds: string[];
  spentLook: string[];
  notice: string | null;
  report: { title: string; body: string }[];
  debug: boolean;
  seq: number;
  sequel: SequelState | null;
  epilogue: Epilogue | null;
  status: Record<CharId, "present" | "letter" | "gone">;
  metrics: Metrics;
  traces: Trace[];
  claims: Record<string, Claim>;
  minds: Record<CharId, Mind>;
  decisions: Decision[];
}

export interface Step {
  state: GameState;
  blocked?: string;
  ai?: AiContext;
}

export interface AiContext {
  character: CharId;
  playerLine: string;
  history: { role: "user" | "assistant"; text: string }[];
  known: string[];
  forbidden: string[];
  memories: string[];
  relationship: string;
  situation: string;
  voice: string;
  offers: { id: string; label: string }[];
  beliefs: { id: string; line: string }[];
}

export interface SceneVM {
  id: string;
  kicker: string;
  title: string;
  paras: string[];
  foot?: string;
  choices: { action: string; label: string; disabled?: string }[];
}

export interface SequelVM {
  kicker: string;
  title: string;
  paras: string[];
  choices: { action: string; label: string; disabled?: string }[];
}

export interface Sug {
  label: string;
  text?: string;
  action?: string;
}
