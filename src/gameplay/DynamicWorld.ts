import type { Platform } from "../modules/world/levels";
/** 移动与陷阱都由时间和种子确定，画面与无画面测试共享同一函数。 */
export function platformX(p: Platform, time: number, seed: number) {
  return (
    p.x +
    (p.motion
      ? Math.sin((time * 2 * Math.PI) / p.motion.period + seed * 0.1) *
        p.motion.amplitude
      : 0)
  );
}
export function trapActive(p: Platform, time: number, seed: number) {
  if (!p.trap) return false;
  const phase =
    (((time + seed * 0.07) % p.trap.period) + p.trap.period) % p.trap.period;
  return phase < p.trap.active;
}
