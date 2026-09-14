/** 路线类型是地形属性，不指定哪个画像必须走哪条路。 */
export type RouteKind =
  "start" | "safe" | "reward" | "explore" | "shortcut" | "merge";
export const routeNames: Record<RouteKind, string> = {
  start: "起点",
  safe: "安全绕行",
  reward: "金币支路",
  explore: "遗迹探索",
  shortcut: "危险捷径",
  merge: "汇合点",
};
export interface Platform {
  id: number;
  x: number;
  y: number;
  w: number;
  coins: number;
  enemy: boolean;
  enemyType?: "walker" | "hopper" | "armored";
  branch: boolean;
  kind: RouteKind;
  /** 新区域的信息价值独立于金币，探索型因此不再等同于收集型。 */
  novelty: number;
  /** 动态地形按配置运动，不改变角色自身的跳高、跳距。 */
  motion?: { amplitude: number; period: number };
  trap?: { period: number; active: number };
}
export interface Level {
  name: string;
  subtitle: string;
  width: number;
  platforms: Platform[];
  version: string;
  /** 任务路标给出关键平台编号；宝箱是可选支线，不强制所有画像收集。 */
  quest?: { key: number; door: number; chest: number };
}
/** 每个区段均有低处安全路、奖励台、高处无金币遗迹和窄桥捷径。
 * 多个区段重新汇合，允许同一画像在不同局部条件下改变选择。
 * 所有坐标都参与真实物理碰撞，不通过画像 ID 指定固定路径。
 */
function buildLevel(index: number): Level {
  const platforms: Platform[] = [];
  const add = (
    center: number,
    y: number,
    w: number,
    kind: RouteKind,
    coins = 0,
    enemy = false,
    novelty = 0,
  ) => {
    platforms.push({
      id: platforms.length,
      x: center - w / 2,
      y,
      w,
      kind,
      coins,
      enemy,
      novelty,
      branch: kind === "explore" || kind === "reward",
    });
  };
  add(80, 365, 240, "start");
  const count = [4, 5, 6, 7][index];
  for (let section = 0; section < count; section++) {
    const base = 80 + section * 380;
    // 后面的关卡改变平台宽度、奖励和守卫，而不是简单延长直路。
    add(base + 190, 430, 100, "safe");
    add(base + 315, 430, 80, "safe");
    add(
      base + 120,
      340,
      68,
      "reward",
      index === 2 ? 8 : 5,
      index > 0 && section % 2 === 1,
    );
    add(base + 300, 245, 64, "explore", 0, false, 1 + (section % 2) * 0.2);
    add(base + 265, 340, index === 3 ? 40 : 48, "shortcut", 0, false);
    add(base + 380, 365, 240, "merge", 1);
  }
  return {
    name: [
      "01 · 四路岔口",
      "02 · 守卫与捷径",
      "03 · 宝藏与遗迹",
      "04 · 峡谷远征",
    ][index],
    subtitle: [
      "安全 / 速度 / 奖励 / 探索",
      "金币守卫与窄桥捷径",
      "金币收益与未知区域冲突",
      "连续多路线决策挑战",
    ][index],
    width: 80 + count * 380 + 180,
    platforms,
    version: "branching-v4-fixed-distance",
  };
}
export const levels = Array.from({ length: 4 }, (_, i) => buildLevel(i));

// 原有四关保留为行为基线，新增三关按任务链、移动平台、周期陷阱逐步引入。
for (let i = 0; i < 3; i++) {
  const level = structuredClone(levels[2]);
  level.name = ["05 · 钥匙与秘藏", "06 · 浮桥运输线", "07 · 潮汐机关城"][i];
  level.subtitle = [
    "拾取钥匙 → 开启机关门 → 解锁宝箱",
    "任务链与移动平台的到达时机",
    "任务链、移动平台与周期陷阱",
  ][i];
  level.version = "quest-v1";
  level.quest = { key: 3, door: 6, chest: 9 };
  // 门和宝箱平台扩大，保留固定180像素跳跃所需的起跳空间。
  level.platforms[9].w = 110;
  level.platforms[9].x -= 21;
  level.platforms[9].enemy = false;
  if (i >= 1)
    for (const p of level.platforms) {
      if (p.kind === "explore" || p.id === 9)
        p.motion = { amplitude: 16, period: 4.5 };
    }
  if (i >= 2)
    for (const p of level.platforms) {
      if (p.kind === "shortcut" || p.id === 6)
        p.trap = { period: 3.6, active: 1.5 };
    }
  levels.push(level);
}

/** 整体按新运动尺度调整地图，避免缩短跳跃后原来的路线变成不可达。 */
for (const [index, level] of levels.entries()) {
  for (const p of level.platforms) {
    p.x = 80 + ((p.x - 80) * 140) / 180;
    p.w *= 140 / 180;
    p.y = 365 + (p.y - 365) * (480 / 560) ** 2;
    if (p.motion) p.motion.amplitude *= 140 / 180;
    // 敌人主要布置在宽地面上，支路留作取舍，不再挤在金币小平台。
    p.enemy = false;
    if (
      index > 0 &&
      p.kind === "merge" &&
      p.id > 12 &&
      p.id !== level.platforms.at(-1)!.id
    ) {
      p.enemy = true;
      p.enemyType = ["walker", "hopper", "armored"][
        Math.floor(p.id / 6) % 3
      ] as Platform["enemyType"];
    }
  }
  level.width = 80 + ((level.width - 80) * 140) / 180;
  level.version += "-compact-enemies-v2";
}

/** 独立的双线矿道：上层是连续三步宝藏支线，下层是有陷阱的短路。 */
const mine: Level = {
  name: "08 · 矿道双线",
  subtitle: "上层：钥匙—门—宝箱｜下层：窄桥捷径｜出口汇合",
  width: 1080,
  version: "mine-branches-v1",
  quest: { key: 1, door: 2, chest: 3 },
  platforms: [],
};
const mineNodes: Array<[number, number, number, RouteKind, number]> = [
  [80, 365, 180, "start", 0],
  [180, 290, 80, "reward", 4],
  [310, 285, 90, "reward", 3],
  [450, 280, 100, "reward", 8],
  [300, 390, 70, "shortcut", 0],
  [450, 390, 70, "shortcut", 0],
  [590, 285, 80, "explore", 10],
  [650, 365, 260, "merge", 1],
  [900, 365, 260, "merge", 1],
];
mine.platforms = mineNodes.map(([x, y, w, kind, coins], id) => ({
  id,
  x: x - w / 2,
  y,
  w,
  kind,
  coins,
  branch: kind === "reward" || kind === "explore",
  novelty: kind === "explore" ? 1 : 0,
  enemy: id >= 7,
  enemyType: id === 7 ? "walker" : "hopper",
}));
mine.platforms[4].trap = { period: 4, active: 1.4 };
mine.platforms[5].trap = { period: 4, active: 1.4 };
mine.platforms[6].motion = { amplitude: 10, period: 5 };
levels.push(mine);
