export type Topic = "dest" | "water" | "backyard" | "supplies" | "blade" | "shen" | "girl_refuse" | "girl_seek";

const TOPICS: { topic: Topic; clues: string[]; kw: RegExp }[] = [
  { topic: "dest", clues: ["dest_gu", "dest_shen"], kw: /去哪|去哪儿|去哪里|目的地|送到哪|送去哪|县城|旧码头|何处|往哪|什么地方|终点|码头/ },
  { topic: "water", clues: ["water_route"], kw: /水路|接应|湿衣|落水|水势|换衣|下水/ },
  { topic: "backyard", clues: ["backyard_closed"], kw: /后院|门闩|后门/ },
  { topic: "supplies", clues: ["supplies_mismatch"], kw: /物资|账单|货单|干衣|盘缠|清单|对账|账目/ },
  { topic: "blade", clues: ["blade_old", "blade_truth"], kw: /刀|断口|磕/ },
  { topic: "shen", clues: ["shen_low"], kw: /公廨|见官|躲着|躲不躲|在躲|行踪|回避/ },
  { topic: "girl_refuse", clues: ["girl_refuses"], kw: /上船|一起走|同行|肯走|的船/ },
  { topic: "girl_seek", clues: ["girl_seeking"], kw: /姑娘|少女|生人|找谁|找人|来意|来做什么|打听/ },
];

export const STRAIGHT_ORDER = [
  "girl_seeking",
  "backyard_closed",
  "shen_low",
  "blade_old",
  "dest_gu",
  "dest_shen",
  "water_route",
  "girl_refuses",
  "supplies_mismatch",
];

export function topicOf(text: string) {
  return TOPICS.find((item) => item.kw.test(text)) ?? null;
}

export function wantsStraight(text: string) {
  return /直说|说清楚|说明白|别绕|别打哑谜|别卖关子|别瞒|你知道什么|你知道些什么|还有呢|继续说|还有什么|明白话|别兜圈子/.test(text);
}

export function wantsGoal(text: string) {
  return /想干什么|想做什么|要干什么|要做什么|你的目的|你图什么|准备怎么|打算做什么|想要什么/.test(text);
}
