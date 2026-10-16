import type { CharId, LocId } from "./types.ts";

export const CHARS: Record<
  CharId,
  { name: string; role: string; portrait: string; voice: string; you: string }
> = {
  gu: {
    name: "顾晚舟",
    role: "说书人",
    portrait: "/art/portrait-gu.jpg",
    you: "你",
    voice:
      "你是顾晚舟，渡口说书人，约四十岁。话慢，一句事实说完，不讲半个故事。不能说的，直接说不能说，并给出具体原因。不要用比喻代替事实。",
  },
  tang: {
    name: "宋棠",
    role: "行路的少女",
    portrait: "/art/portrait-tang.jpg",
    you: "你",
    voice:
      "你是宋棠，约二十岁，来渡口查旧案。句子短，不谢人，不许别人替你收尾。不能说的，直接说还没打算说。不要打比方。",
  },
  shen: {
    name: "沈砚",
    role: "镖师",
    portrait: "/art/portrait-shen.jpg",
    you: "你",
    voice:
      "你是沈砚，镖师，约三十岁。话硬，答一半就停。问什么答什么，不绕。你厌恶来路不明的委托，也不肯强行带走不肯走的人。不要用比喻代替事实。",
  },
  liu: {
    name: "柳七",
    role: "茶肆主人",
    portrait: "/art/portrait-liu.jpg",
    you: "你",
    voice:
      "你是柳七，渡口茶肆的女主人，三十余岁。热络，但先看对方是不是来打听的。把事情说清楚。不能说的，直接说不能说，并给出具体原因。不要用茶、水、门口打比方来代替事实。",
  },
  pei: {
    name: "裴照",
    role: "临时主事",
    portrait: "/art/portrait-pei.jpg",
    you: "你",
    voice:
      "你是裴照，借祠堂办公的临时主事。先问是谁说的，再决定记不记。不凭传闻定案。不能写的，直接说缺来处。不要暗示。",
  },
};

export const LOCS: Record<LocId, { name: string; desc: string; image: string }> = {
  tea: {
    name: "茶肆",
    desc: "临河两层。醒木挂在柱上，后院的门闩从里面落下。",
    image: "/art/scene-tea.jpg",
  },
  ferry: {
    name: "渡口",
    desc: "雾比水先到。跳板是湿的，新旧船缆绞在一起。",
    image: "/art/scene-ferry.jpg",
  },
  escort: {
    name: "镖站",
    desc: "旗杆空着。架上的刀缠着布，灰里有新脚印。",
    image: "/art/scene-escort.jpg",
  },
  yamen: {
    name: "临时公廨",
    desc: "借的祠堂偏厅。一方印，一叠还没写完的格子。",
    image: "/art/scene-yamen.jpg",
  },
  hide: {
    name: "藏身处",
    desc: "茶肆夹层再往里。油纸窗，一盏不肯太亮的灯。",
    image: "/art/scene-hide.jpg",
  },
};

export const CLUE_INFO: Record<string, { title: string; text: string }> = {
  backyard_closed: {
    title: "后院提前落闩",
    text: "茶肆后院在你到来之前就关死了，不像临时修缮。",
  },
  spare_clothes: {
    title: "预备的干衣",
    text: "有人备下一身不沾水的衣裳，像是算准了要落水。",
  },
  girl_seeking: {
    title: "少女在找说书人",
    text: "渡口新来的少女打听说书人，不肯把理由说完。",
  },
  girl_refuses: {
    title: "少女拒绝上船",
    text: "她明确不肯同行。她说有人想在她见到证人之前把她送走。",
  },
  dest_gu: {
    title: "说书人声称去县城",
    text: "顾晚舟说天亮前去县城，递一封不要紧的状子。",
  },
  dest_shen: {
    title: "镖师听到的是旧码头",
    text: "沈砚听到的目的地是上游旧码头，不是县城。",
  },
  dest_mismatch: {
    title: "目的地说法对不上",
    text: "同一趟护送，委托双方说出的地方不是一处。",
  },
  water_route: {
    title: "预先打听的水路",
    text: "说书人问过夜间水势和接应的位置，还问过衣裳湿了怎么办。",
  },
  supplies_mismatch: {
    title: "对不上的物资",
    text: "账上是下水小船和干衣，不是上水护送的盘缠。",
  },
  blade_old: {
    title: "断口不是新伤",
    text: "沈砚的刀昨日已磕缺，断口发暗，不像今朝砍人。",
  },
  blade_truth: {
    title: "断刀来自中止冲突",
    text: "刀是沈砚中止那场假落水时磕断的，不是杀人的证据。",
  },
  shen_low: {
    title: "沈砚不愿见官",
    text: "沈砚承认自己躲开公廨，因为委托来路不清。",
  },
  accuse_letter: {
    title: "袖中指认镖师的信",
    text: "落水现场的信写成「若我有失，问沈砚」。笔迹太从容。",
  },
  motive_truth: {
    title: "宋棠的来意",
    text: "她是宋衡之女。家人因旧案名册被捕，她来找说书人，也不许别人再替她做主。",
  },
  names_rumor: {
    title: "有人改过姓名",
    text: "宋棠听幸存者说过：册上有的名字被刮去，她父亲的没有。",
  },
  liu_role: {
    title: "柳七参与了布置",
    text: "柳七协助假死，是要把追名册的人引开，护住藏在渡口的人。",
  },
  names_altered: {
    title: "名册上的涂改",
    text: "名册若干姓名被刮改。留下来的人因此逃过一劫。",
  },
  father_not_saved: {
    title: "宋衡的名字还在",
    text: "宋衡三字清晰未改。说书人救下过一些人，没有救下她的父亲。",
  },
  register_double: {
    title: "名册的两面",
    text: "这本名册能证明旧案如何发生，也能把还活着的人重新交出去。",
  },
};

export const TWISTS: { id: string; title: string; clues: string[] }[] = [
  { id: "escort", title: "护送并非单纯保护", clues: ["girl_refuses", "dest_mismatch"] },
  { id: "fake", title: "落水是预谋假死", clues: ["spare_clothes", "water_route"] },
  { id: "liu", title: "柳七参与安排", clues: ["backyard_closed", "supplies_mismatch"] },
  { id: "both", title: "说书人既有罪，也曾救人", clues: ["names_altered", "father_not_saved"] },
];

export const GREET: Record<CharId, string> = {
  gu: "醒木先挂着。这几日我不一定还在。你问得具体，我答得具体。问我旧案和名册，我现在不说——不是忘了，是还不能当众讲。",
  tang: "我不是来听书的。我在找一个说书的人，他欠我们家一句实话。名字现在不告诉你。你也别替我去喊他，别替我做决定。",
  shen: "刀在架上，断口不是今天的。这趟活来路不清，我还不想接。你有事就直说。",
  liu: "坐。茶是冷的，昨晚没人喝完。有个年轻姑娘来问说书的人，没留名字，问得很急。后院今天别进，门是我提前闩上的。你要问，就问。",
  pei: "案上还是空的。你要报事，先说从谁那儿听来的，再说内容。没有来处的话，我不会写进格子。",
};

export const DEFAULT_LINES: Record<CharId, string[]> = {
  gu: ["这句我没接上。你是问我去哪，问人，还问旧案？", "已经说过的，我按原话再说一遍。没有新的，我就不编。"],
  tang: ["你问具体的。我没说的，就是还没打算说。别补。", "别替我把意思收尾。"],
  shen: ["你问直的。我答直的。别让我猜你想听哪句。", "没有要补的。刀的事，只认断口。"],
  liu: ["这句我没听明白。你是问人，问门，还问昨晚？", "堂口人多的事，我不会在这儿补半句。不能说的，我会告诉你原因。"],
  pei: ["你把听到的和猜的分开再说。", "没有来处的话，我不会写下来。"],
};

export const DEFLECT: Record<CharId, string> = {
  gu: "旧案和名册，我现在不能说。不是忘了，是还不能当众讲。说出来会害还没见上面的人。",
  tang: "这事我现在不答。等我自己决定要说的时候，我会说完。你别补。",
  shen: "这句你要是带到公廨，我就当你没来过。我知道，但现在说出来会害人。",
  liu: "这事我现在不当着堂口说。你要问这个，换个时候。",
  pei: "没有来处，这句我不能写成事实。你把是谁告诉你的说出来。",
};
