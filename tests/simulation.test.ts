import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "../src/gameplay/Simulation";
import { levels } from "../src/modules/world/levels";
import { profiles } from "../src/agent/personality/profiles";
import { MOTION } from "../src/gameplay/Motion";
import { TaskChain } from "../src/gameplay/TaskChain";
import { SessionMemory } from "../src/agent/memory/SessionMemory";

/** 双线关卡允许画像共享路线，重点验证收集绕行与冒险捷径的真实取舍。 */
test("矿道五个种子均出现宝藏支路与窄桥捷径，且重新汇合通关", () => {
  for (let seed = 42; seed <= 46; seed++) {
    const results = [profiles[2], profiles[1]].map((profile) => {
      const sim = new Simulation(levels[7], profile, seed);
      while (!sim.done) sim.step();
      return sim.result();
    });
    const [collector, bold] = results;
    assert.ok(collector.success && bold.success);
    assert.deepEqual(collector.route.slice(0, 4), [0, 1, 2, 3]);
    assert.deepEqual(bold.route.slice(0, 3), [0, 4, 5]);
    assert.ok(collector.route.includes(7) && bold.route.includes(7));
    assert.ok(collector.chestOpened && !bold.chestOpened);
    assert.ok(collector.coins > bold.coins);
    assert.ok(collector.time > bold.time);
  }
});

test("任务链拒绝越序领取、开门消耗钥匙、宝箱只能领取一次", () => {
  const task = new TaskChain(levels[7]);
  assert.equal(task.interact(3), null);
  assert.equal(task.interact(2), null);
  task.interact(1);
  assert.ok(task.hasKey);
  task.interact(2);
  assert.ok(task.doorOpen && !task.hasKey);
  assert.equal(task.interact(3)?.reward, 30);
  assert.equal(task.interact(3), null);
  assert.equal(task.events.length, 3);
});

test("本局记忆不跨局泄漏，暂时阻塞在冷却结束后可以重试", () => {
  const first = new SessionMemory(),
    second = new SessionMemory();
  first.visit(1);
  first.hurt(1);
  first.block(1, 10);
  assert.ok(first.blocked(1, 12));
  assert.ok(!first.blocked(1, 13));
  assert.equal(second.visits.size + second.injuries.size, 0);
  assert.ok(!second.blocked(1, 12));
});

test("动态矿道在相同种子和画像下完整复现", () => {
  assert.deepEqual(run(7, 2), run(7, 2));
});

test("所有高低平台的完整跳跃水平位移均固定140像素", () => {
  let checked = 0;
  for (const level of levels)
    for (const profile of profiles) {
      const sim = new Simulation(level, profile);
      let takeoffX = 0;
      while (!sim.done) {
        const previousGround = sim.ground;
        sim.step();
        if (previousGround >= 0 && sim.ground < 0)
          takeoffX = sim.takeoff!.takeoffX;
        if (previousGround < 0 && sim.ground >= 0) {
          assert.ok(
            Math.abs(Math.abs(sim.x - takeoffX) - MOTION.jumpDistance) < 1e-6,
            `${level.name} / ${profile.name} 位移 ${sim.x - takeoffX}`,
          );
          checked++;
        }
      }
    }
  assert.ok(checked > 100);
});
/** 运行完整的一局，检验行为结果而非逐行重复实现。 */
function run(level = 0, profile = 0) {
  const s = new Simulation(levels[level], profiles[profile], 42);
  for (let i = 0; i < 5500 && !s.done; i++) s.step();
  return s.result();
}
test("教学关卡能够自主通关", () => {
  assert.equal(run().success, true);
});
test("相同配置可以复现实验", () => {
  assert.deepEqual(run(3, 1), run(3, 1));
});
test("奖励关卡画像产生不同路线", () => {
  assert.notDeepEqual(run(2, 0).route, run(2, 2).route);
});
test("运行中的参数快照不受界面修改影响", () => {
  const p = { ...profiles[0] };
  const s = new Simulation(levels[0], p);
  p.safety = 0;
  assert.equal(s.profile.safety, 95);
});
test("所有画像与关卡均在时限内结束", () => {
  for (let l = 0; l < 4; l++)
    for (let p = 0; p < 4; p++) {
      const r = run(l, p);
      assert.ok(r.reason);
      assert.ok(Number.isFinite(r.time));
    }
});

test("四种画像在同一岔口做出四种选择，且选择不依赖画像名字", () => {
  const choices = profiles.map((profile) => {
    const sim = new Simulation(levels[2], {
      ...profile,
      id: "匿名",
      name: "匿名",
    });
    sim.plan();
    return sim.target?.kind;
  });
  assert.deepEqual(choices, ["safe", "shortcut", "reward", "explore"]);
});

test("七个关卡、五个种子都能产生四条不同的完整行为路线", () => {
  for (const level of levels.slice(0, 7))
    for (let seed = 42; seed <= 46; seed++) {
      const routes = profiles.map((profile) => {
        const sim = new Simulation(level, profile, seed);
        while (!sim.done) sim.step();
        assert.notEqual(
          sim.reason,
          "超过 90 秒时限",
          "地图不应让 Agent 原地卡死",
        );
        return sim.result().route.join(",");
      });
      assert.equal(
        new Set(routes).size,
        4,
        `${level.name} / ${seed} 的画像路线趋同`,
      );
    }
});

test("收集与探索具有不同收益，冒险的完成时间短于谨慎", () => {
  const careful = run(2, 0),
    bold = run(2, 1),
    collector = run(2, 2),
    explorer = run(2, 3);
  assert.ok(collector.coins > explorer.coins);
  assert.ok(explorer.explored > collector.explored);
  assert.ok(bold.time < careful.time);
  assert.ok(careful.success);
});

test("四画像所有跳跃使用相同起跳力度和最大上升高度", () => {
  const heights: number[] = [];
  for (const profile of profiles) {
    const sim = new Simulation(levels[0], profile);
    let origin = 0,
      top = 0;
    while (!sim.done) {
      const wasGrounded = sim.ground >= 0,
        previousY = sim.y;
      sim.step();
      if (wasGrounded && sim.ground < 0) {
        assert.ok(
          Math.abs(sim.vy + MOTION.jumpSpeed - MOTION.gravity / 60) < 0.001,
        );
        origin = previousY;
        top = sim.y;
      }
      if (sim.ground < 0) top = Math.min(top, sim.y);
      if (!wasGrounded && sim.ground >= 0) heights.push(origin - top);
    }
  }
  assert.ok(heights.length > 20);
  assert.ok(
    heights.every(
      (h) => Math.abs(h - MOTION.jumpSpeed ** 2 / (2 * MOTION.gravity)) < 0.2,
    ),
  );
});

test("平移在地面保持高度，并且实际执行了左右两个方向", () => {
  let left = 0,
    right = 0;
  for (const profile of profiles) {
    const sim = new Simulation(levels[2], profile);
    while (!sim.done) {
      const y = sim.y,
        ground = sim.ground;
      sim.step();
      if (sim.action.includes("平移") && ground >= 0 && sim.ground >= 0) {
        assert.equal(sim.y, y);
        assert.equal(sim.vy, 0);
      }
    }
    left += sim.walkLeft;
    right += sim.walkRight;
  }
  assert.ok(left > 0);
  assert.ok(right > 0);
});
