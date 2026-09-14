import type { Profile } from "../personality/profiles";
import { MOTION } from "../../gameplay/Motion";
import type { Platform } from "../../modules/world/levels";

/**
 * 规则规划器只负责“选哪个落点”，不控制角色，也不读取整张地图。
 * 调用方先筛选可到达的局部平台，再把候选项交给这里。
 * 四项分数分别代表时间收益、金币收益、安全代价和支路探索收益。
 * 权重只是可检验的模拟假设，不能保证高安全权重一定获得最高通关率。
 */
export function chooseTarget(
  options: Platform[],
  x: number,
  profile: Profile,
  deadEnemies: Set<number>,
  transitRisks: Map<number, number> = new Map(),
  adjustments: Map<number, number> = new Map(),
): Platform | null {
  const score = (platform: Platform): number => {
    // 用标准地图尺度评价偏好，缩小跳跃不会意外改变画像含义。
    const distance =
      (platform.x + platform.w / 2 - x) / (MOTION.jumpDistance / 180);
    const width = platform.w / (MOTION.jumpDistance / 180);
    const height = (365 - platform.y) / (MOTION.jumpSpeed / 560) ** 2;
    const risk =
      (platform.enemy && !deadEnemies.has(platform.id) ? 1 : 0) +
      (transitRisks.get(platform.id) ?? 0) +
      Math.max(0, (100 - width) / 80) +
      Math.max(0, height / 100) +
      distance / 500;
    return (
      (adjustments.get(platform.id) ?? 0) +
      (profile.speed * distance) / 140 -
      profile.speed * 0.5 * Math.max(0, height / 100) +
      (profile.reward * platform.coins) / 4 -
      profile.safety * risk +
      (profile.exploration ** 2 / 100) * platform.novelty * 1.8
    );
  };
  // 创建新数组再排序，不修改调用方的观测快照；同分时按编号稳定选择。
  return (
    [...options].sort((a, b) => score(b) - score(a) || a.id - b.id)[0] ?? null
  );
}
