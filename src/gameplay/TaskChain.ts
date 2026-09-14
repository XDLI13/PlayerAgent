import type { Level } from "../modules/world/levels";
/** 显式任务状态机：只有先拿钥匙、开门，才能领取一次宝箱奖励。 */
export class TaskChain {
  hasKey = false;
  doorOpen = false;
  chestOpen = false;
  events: string[] = [];
  constructor(private level: Level) {}
  get stage() {
    return this.chestOpen
      ? "任务完成"
      : this.doorOpen
        ? "寻找宝箱"
        : this.hasKey
          ? "前往机关门"
          : "寻找钥匙";
  }
  get objective() {
    const q = this.level.quest;
    return !q || this.chestOpen
      ? null
      : this.doorOpen
        ? q.chest
        : this.hasKey
          ? q.door
          : q.key;
  }
  interact(id: number): { message: string; reward: number } | null {
    const q = this.level.quest;
    if (!q) return null;
    let message = "",
      reward = 0;
    if (id === q.key && !this.hasKey && !this.doorOpen) {
      this.hasKey = true;
      message = "拾取钥匙";
    } else if (id === q.door && this.hasKey && !this.doorOpen) {
      this.hasKey = false;
      this.doorOpen = true;
      message = "消耗钥匙，机关门开启";
    } else if (id === q.chest && this.doorOpen && !this.chestOpen) {
      this.chestOpen = true;
      reward = 30;
      message = "开启宝箱，获得 30 金币";
    }
    if (!message) return null;
    this.events.push(message);
    return { message, reward };
  }
}
