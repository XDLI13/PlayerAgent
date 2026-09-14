import type { Platform } from "../modules/world/levels";

/** 所有画像和所有跳跃共用这些物理参数；修改这里即可统一调整角色能力。 */
export const MOTION = {
  gravity: 1200,
  jumpSpeed: 480,
  walkSpeed: 120,
  jumpDistance: 140,
};
export interface JumpPlan {
  takeoffX: number;
  velocityX: number;
  duration: number;
}

/**
 * 固定竖直力度后，不再靠“跳高一点/低一点”避开平台。
 * 执行器需要先左右平移到合适起跳点，再使用同一条竖直抛物线。
 * 每次水平总位移固定 140 像素；目标高差决定飞行时间，水平速度据此计算。
 * 最大高度始终是 v²/(2g)，约 96 像素。此处是固定距离的游戏动作模板。
 */
export function findJump(
  support: Platform,
  x: number,
  target: Platform,
  observed: Platform[],
  xAt: (p: Platform, time: number) => number = (p) => p.x,
): JumpPlan | null {
  const { gravity, jumpSpeed, jumpDistance } = MOTION;
  const d = jumpSpeed * jumpSpeed + 2 * gravity * (target.y - support.y);
  if (d < 0) return null;
  const duration = (jumpSpeed + Math.sqrt(d)) / gravity;
  const left = support.x + 8,
    right = support.x + support.w - 8;
  const clamp = (value: number) => Math.max(left, Math.min(right, value));
  // 优先小幅向前准备；弧线被拦截时尝试后退及其他起跳点。
  const direction = target.x + target.w / 2 < x ? -1 : 1;
  const ideal = target.x + target.w / 2 - direction * jumpDistance;
  const starts = [
    clamp(ideal),
    clamp(x + 24),
    right,
    left,
    clamp(x - 24),
    clamp(x),
  ];
  for (let position = left; position <= right; position += 8)
    starts.push(position);
  for (const takeoffX of starts) {
    // 起点到落点严格相差固定距离；只接受落在目标平台内部的起跳位置。
    const landingX = takeoffX + direction * jumpDistance;
    if (landingX < target.x + 4 || landingX > target.x + target.w - 4) continue;
    const velocityX = (direction * jumpDistance) / duration;
    const blocked = observed.some((other) => {
      if (other.id === target.id) return false;
      const od = jumpSpeed * jumpSpeed + 2 * gravity * (other.y - support.y);
      if (od < 0) return false;
      const t = (jumpSpeed + Math.sqrt(od)) / gravity;
      const px = takeoffX + velocityX * t;
      const otherX = xAt(other, t);
      return (
        t < duration - 0.005 && px >= otherX - 3 && px <= otherX + other.w + 3
      );
    });
    if (!blocked) return { takeoffX, velocityX, duration };
  }
  return null;
}
