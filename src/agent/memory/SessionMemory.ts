/** 单局记忆：重试时重新创建；不把上一次实验的经验偷偷带进下一次。 */
export class SessionMemory {
  visits = new Map<number, number>();
  injuries = new Map<number, number>();
  blockedUntil = new Map<number, number>();
  switches = 0;
  visit(id: number) {
    this.visits.set(id, (this.visits.get(id) ?? 0) + 1);
  }
  hurt(id: number) {
    this.injuries.set(id, (this.injuries.get(id) ?? 0) + 1);
  }
  /** 暂时走不通并非永久不可达，冷却后允许重新尝试。 */
  block(id: number, time: number) {
    this.blockedUntil.set(id, time + 3);
  }
  blocked(id: number, time: number) {
    return (this.blockedUntil.get(id) ?? 0) > time;
  }
}
