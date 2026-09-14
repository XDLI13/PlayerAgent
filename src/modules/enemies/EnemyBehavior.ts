import type { Platform } from "../world/levels";
/** 三种敌人使用同一碰撞接口，但运动规律和踩踏结果不同。 */
export function enemyPosition(p: Platform, time: number, seed: number) {
  const rate = p.enemyType === "armored" ? 0.9 : 1.6;
  const x =
    p.x +
    p.w / 2 +
    Math.sin(time * rate + p.id + seed * 0.1) * Math.max(0, p.w / 2 - 20);
  // 弹跳怪以周期性起落改变接触时机；普通怪和装甲怪在地面巡逻。
  const hop =
    p.enemyType === "hopper" ? Math.max(0, Math.sin(time * 3 + p.id)) * 34 : 0;
  return { x, feetY: p.y - hop };
}
