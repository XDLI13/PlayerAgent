import type { Profile } from "../agent/personality/profiles";
import type { Level, Platform } from "../modules/world/levels";
import { chooseTarget } from "../agent/planning/RulePlanner";
import { routeNames, type RouteKind } from "../modules/world/levels";
/** 固定时间步使可视化与无画面批测使用完全相同的物理和策略。 */
export const DT = 1 / 60;
import { MOTION, findJump, type JumpPlan } from "./Motion";
import { SessionMemory } from "../agent/memory/SessionMemory";
import { TaskChain } from "./TaskChain";
import { platformX, trapActive } from "./DynamicWorld";
import { enemyPosition } from "../modules/enemies/EnemyBehavior";
export interface Result {
  batchId?: string;
  taskEvents: string[];
  chestOpened: boolean;
  waited: number;
  switches: number;
  remembered: number;
  profile: string;
  level: string;
  seed: number;
  success: boolean;
  time: number;
  coins: number;
  damage: number;
  route: number[];
  reason: string;
  parameters: Profile;
  version: string;
  routeKinds: RouteKind[];
  explored: number;
  jumps: number;
  walkLeft: number;
  walkRight: number;
}
export class Simulation {
  x = 80;
  y = 365;
  vx = 0;
  vy = 0;
  time = 0;
  hp = 3;
  coins = 0;
  damage = 0;
  ground = 0;
  target: Platform | null = null;
  done = false;
  success = false;
  reason = "";
  invincible = 0;
  visited = new Set<number>([0]);
  collected = new Set<number>();
  deadEnemies = new Set<number>();
  logs: string[] = ["已读取局部环境，准备出发。"];
  action = "观察环境";
  lastPlan = -10;
  route = [0];
  jumps = 0;
  jumpElapsed = 0;
  takeoff: JumpPlan | null = null;
  walkLeft = 0;
  walkRight = 0;
  facing = 1;
  readonly profile: Profile;
  readonly memory = new SessionMemory();
  readonly task: TaskChain;
  private templates: Platform[];
  waited = 0;
  private targetSince = 0;
  private nextPlan = 0;
  private committed: number | null = null;
  private pursuit = true;
  get taskGoal() {
    return this.level.quest
      ? this.pursuit
        ? this.task.stage
        : "优先通关 · 宝箱支线暂缓"
      : "自由闯关";
  }
  constructor(
    public level: Level,
    profile: Profile,
    public seed = 42,
  ) {
    this.profile = { ...profile };
    this.level = structuredClone(level);
    this.templates = structuredClone(level.platforms);
    this.task = new TaskChain(this.level);
    this.pursuit = profile.reward + profile.persistence >= 100;
    this.memory.visit(0);
  }
  /** 动态平台只更新副本，批测中的不同局不会互相修改地图。 */
  private updateWorld() {
    for (const p of this.level.platforms) {
      const next = platformX(this.templates[p.id], this.time, this.seed);
      if (this.ground === p.id) this.x += next - p.x;
      p.x = next;
    }
  }
  isTrapActive(p: Platform, time = this.time) {
    return trapActive(p, time, this.seed);
  }
  private solveJump(p: Platform, observed: Platform[]) {
    const support = this.level.platforms[this.ground];
    const d = MOTION.jumpSpeed ** 2 + 2 * MOTION.gravity * (p.y - support.y);
    if (d < 0) return null;
    const duration = (MOTION.jumpSpeed + Math.sqrt(d)) / MOTION.gravity;
    // 预测落地时平台位置。到起跳点后还会复核一次，不能追着旧坐标起跳。
    const future = {
      ...p,
      x: platformX(this.templates[p.id], this.time + duration, this.seed),
    };
    return findJump(support, this.x, future, observed, (other, t) =>
      platformX(this.templates[other.id], this.time + t, this.seed),
    );
  }
  /** 只向规划器提供附近平台；终点只在进入观察范围后可见。 */
  observe() {
    return this.level.platforms.filter(
      (p) => p.x + p.w > this.x - 80 && p.x < this.x + 420,
    );
  }
  enemyX(p: Platform, time = this.time) {
    return enemyPosition(p, time, this.seed).x;
  }
  enemyY(p: Platform, time = this.time) {
    return enemyPosition(p, time, this.seed).feetY;
  }
  log(message: string) {
    this.logs.unshift(`${this.time.toFixed(1)}s  ${message}`);
    this.logs = this.logs.slice(0, 24);
  }
  /** 候选起跳点先在局部地图上求解，画像规划器仅选择路线。 */
  plan() {
    const observed = this.observe();
    const goal = this.pursuit ? this.task.objective : null;
    const goalX = goal === null ? Infinity : this.level.platforms[goal].x;
    const plans = new Map<number, JumpPlan>();
    const options = observed.filter((p) => {
      if (p.id === this.ground) return false;
      const backward = goal !== null && goalX < this.x;
      if (!backward && p.x + p.w / 2 < this.x + 35) return false;
      if (backward && p.x > this.x + 80) return false;
      if (this.memory.blocked(p.id, this.time)) return false;
      if (
        this.level.quest &&
        p.id === this.level.quest.door &&
        !this.task.doorOpen &&
        !this.task.hasKey
      )
        return false;
      const jump = this.solveJump(p, observed);
      if (!jump) return false;
      plans.set(p.id, jump);
      return true;
    });
    if (!options.length) {
      if (this.level.quest) {
        this.action = "等待平台或路线冷却";
        this.nextPlan = this.time + 0.25;
        this.waited += 0.25;
        return;
      }
      this.finish(false, "没有可达路线");
      return;
    }
    // 风险不仅在目标平台，也可能来自经过的守卫；让规划器考虑整条路径。
    const transitRisks = new Map<number, number>();
    for (const candidate of options) {
      const jump = plans.get(candidate.id)!;
      const duration = jump.duration,
        power = MOTION.jumpSpeed,
        vx = jump.velocityX;
      let risk = 0;
      for (const enemy of this.observe()) {
        if (
          !enemy.enemy ||
          this.deadEnemies.has(enemy.id) ||
          enemy.id === candidate.id
        )
          continue;
        for (let t = 0; t < duration; t += 0.04) {
          const px = jump.takeoffX + vx * t,
            py = this.y - power * t + 600 * t * t;
          if (
            px > enemy.x - 20 &&
            px < enemy.x + enemy.w + 20 &&
            Math.abs(py - (enemy.y - 12)) < 32
          ) {
            risk += 2;
            break;
          }
        }
      }
      transitRisks.set(candidate.id, risk);
    }
    const adjustments = new Map<number, number>();
    if (this.level.quest)
      for (const candidate of options) {
        let bonus =
          -(this.memory.visits.get(candidate.id) ?? 0) *
          this.profile.memory *
          0.3;
        bonus -=
          (this.memory.injuries.get(candidate.id) ?? 0) *
          this.profile.memory *
          2;
        if (goal !== null) {
          bonus +=
            candidate.id === goal
              ? 500
              : Math.max(-250, 150 - Math.abs(candidate.x - goalX)) * 0.5;
        }
        if (candidate.id === this.committed)
          bonus += this.profile.persistence * 0.8;
        adjustments.set(candidate.id, bonus);
      }
    const previous = this.committed;
    this.target = chooseTarget(
      options,
      this.x,
      this.profile,
      this.deadEnemies,
      transitRisks,
      adjustments,
    );
    if (!this.target) return;
    if (previous !== this.target.id) {
      if (previous !== null) this.memory.switches++;
      this.targetSince = this.time;
    }
    this.committed = this.target.id;
    this.takeoff = plans.get(this.target.id)!;
    this.lastPlan = this.time;
    this.log(
      `目标 P${this.target.id} · ${routeNames[this.target.kind]} · 从 ${options.length} 个可达落点中选择`,
    );
    this.action = "准备跳跃";
  }
  step() {
    if (this.done) return;
    this.time += DT;
    this.updateWorld();
    this.invincible = Math.max(0, this.invincible - DT);
    if (this.time > 90) {
      this.finish(false, "超过 90 秒时限");
      return;
    }
    if (this.ground >= 0) {
      const p = this.level.platforms[this.ground];
      const interaction = this.task.interact(p.id);
      if (interaction) {
        this.coins += interaction.reward;
        this.log(interaction.message);
      }
      if (!this.collected.has(p.id)) {
        this.collected.add(p.id);
        this.coins += p.coins;
      }
      if (p.id === this.level.platforms.at(-1)!.id) {
        this.finish(true, "到达旗杆");
        return;
      }
      if (!this.target && this.time >= this.nextPlan) this.plan();
      if (!this.target) {
        this.checkEnemies(this.y);
        return;
      }
      if (this.done) return;
      if (this.target && this.takeoff) {
        // 落地后先左右平移。移动和起跳是两个独立动作，平移时竖直坐标不变。
        const offset = this.takeoff.takeoffX - this.x;
        if (Math.abs(offset) > 0.05) {
          const distance = Math.min(Math.abs(offset), MOTION.walkSpeed * DT);
          this.facing = Math.sign(offset);
          this.x += this.facing * distance;
          this.vx = this.facing * MOTION.walkSpeed;
          this.vy = 0;
          if (this.facing < 0) this.walkLeft += distance;
          else this.walkRight += distance;
          this.action =
            this.facing < 0 ? "向左平移 · 调整起跳点" : "向右平移 · 准备起跳";
          this.checkEnemies(this.y);
          if (this.done) return;
          if (Math.abs(offset) > MOTION.walkSpeed * DT) {
            if (p.motion || this.target.motion) this.reconsider();
            return;
          }
        }
        this.vx = 0;
        if (this.observe().some((platform) => platform.motion)) {
          const refreshed = this.solveJump(this.target, this.observe());
          if (!refreshed) {
            this.waited += DT;
            this.action = "等待移动平台靠近";
            this.reconsider();
            this.checkEnemies(this.y);
            return;
          }
          if (Math.abs(refreshed.takeoffX - this.x) > MOTION.walkSpeed * DT) {
            this.takeoff = refreshed;
            this.reconsider();
            return;
          }
          this.takeoff = refreshed;
          const correction = refreshed.takeoffX - this.x;
          if (correction < 0) this.walkLeft -= correction;
          else this.walkRight += correction;
          this.x = refreshed.takeoffX;
        }

        // 谨慎画像会等待敌人远离预计落点，但等待有上限，避免永久卡住。
        // 检查整条跳跃弧线上的未来守卫位置，安全偏好才真正影响避敌时机。
        const duration = this.takeoff.duration;
        const horizontal = this.takeoff.velocityX;
        const power = MOTION.jumpSpeed;
        const enemyNear = this.observe().some((p) => {
          if (!p.enemy || this.deadEnemies.has(p.id)) return false;
          for (let t = 0; t < duration; t += DT) {
            const px = this.x + horizontal * t;
            const py = this.y - power * t + 600 * t * t;
            if (
              Math.abs(px - this.enemyX(p, this.time + t)) < 26 &&
              Math.abs(py - (this.enemyY(p, this.time + t) - 12)) < 28
            )
              return true;
          }
          return false;
        });
        const delay = 0.12 + this.profile.safety * 0.003;
        const hazard = this.isTrapActive(this.target, this.time + duration);
        if (this.level.quest && (hazard || enemyNear)) {
          const budget = 0.3 + this.profile.patience * 0.035;
          if (this.time - this.targetSince < budget) {
            this.waited += DT;
            this.action = hazard ? "等待陷阱关闭" : "等待守卫离开";
            this.reconsider();
            this.checkEnemies(this.y);
            return;
          }
        }
        if (
          this.time - this.lastPlan < delay ||
          (!this.level.quest &&
            enemyNear &&
            this.profile.safety > 60 &&
            this.time - this.lastPlan < 3.5)
        ) {
          this.action = "等待安全时机";
          this.checkEnemies(this.y);
          return;
        }
        this.vx = this.takeoff.velocityX;
        this.vy = -MOTION.jumpSpeed;
        this.facing = Math.sign(this.vx);
        this.jumps++;
        this.jumpElapsed = 0;
        this.ground = -1;
        this.action = "向目标平台跳跃";
      }
    }
    const previousY = this.y;
    // 最后一帧只推进到真实落地时刻，避免帧步长导致跳远超过140像素。
    const movementDt = this.takeoff
      ? Math.min(DT, Math.max(0, this.takeoff.duration - this.jumpElapsed))
      : DT;
    this.jumpElapsed += movementDt;
    this.x += this.vx * movementDt;
    this.y +=
      this.vy * movementDt + 0.5 * MOTION.gravity * movementDt * movementDt;
    this.vy += MOTION.gravity * movementDt;
    this.checkEnemies(previousY);
    if (this.done) return;
    // 使用跨越检测而非单点重叠，防止高速下穿过平台。
    for (const p of this.level.platforms) {
      if (
        this.vy >= 0 &&
        previousY <= p.y &&
        this.y >= p.y - 1e-7 &&
        this.x >= p.x &&
        this.x <= p.x + p.w
      ) {
        this.y = p.y;
        this.vy = 0;
        this.vx = 0;
        this.ground = p.id;
        this.target = null;
        this.takeoff = null;
        this.committed = null;
        this.memory.visit(p.id);
        if (!this.visited.has(p.id)) {
          this.visited.add(p.id);
          this.route.push(p.id);
        }
        break;
      }
    }
    if (
      this.takeoff &&
      this.jumpElapsed >= this.takeoff.duration - 1e-8 &&
      this.ground < 0
    ) {
      // 移动平台错过后不冻结在空中：水平动作结束，继续竖直下落。
      this.takeoff = null;
      this.vx = 0;
      this.log("未接住移动平台，继续下落");
    }
    if (this.y > 540) this.finish(false, "掉入坑洞");
  }
  /** 坚持时间耗尽才允许换目标；短暂失败进入本局记忆，稍后可以重试。 */
  private reconsider() {
    if (this.time - this.targetSince < 0.6 + this.profile.persistence * 0.045)
      return;
    if (this.target) this.memory.block(this.target.id, this.time);
    this.log("当前目标等待过久，记住阻塞并重新选路");
    this.target = null;
    this.takeoff = null;
    this.nextPlan = this.time + 0.1;
  }
  /** 地面平移、等待和空中运动都检测敌人，暂停则不会进入 step。 */
  private checkEnemies(previousY: number) {
    for (const p of this.observe()) {
      if (
        this.isTrapActive(p) &&
        Math.abs(this.y - p.y) < 12 &&
        this.x >= p.x &&
        this.x <= p.x + p.w &&
        this.invincible === 0
      ) {
        this.hp--;
        this.damage++;
        this.invincible = 1.4;
        this.memory.hurt(p.id);
        this.log("触发周期陷阱，记住危险位置");
        if (!this.hp) {
          this.finish(false, "生命耗尽");
          return;
        }
      }
      if (
        p.enemy &&
        !this.deadEnemies.has(p.id) &&
        Math.abs(this.x - this.enemyX(p)) < 20 &&
        Math.abs(this.y - (this.enemyY(p) - 12)) < 22
      ) {
        if (
          p.enemyType !== "armored" &&
          this.vy > 0 &&
          previousY <= this.enemyY(p) - 16
        ) {
          this.deadEnemies.add(p.id);
          this.log("踩中敌人");
        } else if (this.invincible === 0) {
          this.hp--;
          this.damage++;
          this.memory.hurt(p.id);
          this.invincible = 1.4;
          this.log("受到伤害，进入短暂无敌");
          if (!this.hp) {
            this.finish(false, "生命耗尽");
            return;
          }
        }
      }
    }
  }
  finish(success: boolean, reason: string) {
    this.done = true;
    this.success = success;
    this.reason = reason;
    this.action = success ? "通关成功" : "本次结束";
    this.log(reason);
  }
  result(): Result {
    return {
      taskEvents: [...this.task.events],
      chestOpened: this.task.chestOpen,
      waited: +this.waited.toFixed(2),
      switches: this.memory.switches,
      remembered: this.memory.visits.size,
      profile: this.profile.name,
      level: this.level.name,
      seed: this.seed,
      success: this.success,
      time: +this.time.toFixed(2),
      coins: this.coins,
      damage: this.damage,
      route: [...this.route],
      reason: this.reason,
      parameters: { ...this.profile },
      version: this.level.version,
      routeKinds: this.route.map((id) => this.level.platforms[id].kind),
      explored: this.route.filter(
        (id) => this.level.platforms[id].kind === "explore",
      ).length,
      jumps: this.jumps,
      walkLeft: +this.walkLeft.toFixed(1),
      walkRight: +this.walkRight.toFixed(1),
    };
  }
}
