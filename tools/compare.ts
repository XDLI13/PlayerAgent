import { Simulation } from "../src/gameplay/Simulation";
import { profiles } from "../src/agent/personality/profiles";
import { levels, routeNames } from "../src/modules/world/levels";
/** 无画面验收：打印真实路线，便于检查地图是否存在死路或画像趋同。 */
for (const level of levels)
  for (const profile of profiles) {
    const sim = new Simulation(level, profile, 42);
    while (!sim.done) sim.step();
    const r = sim.result();
    console.log(
      level.name,
      profile.name,
      r.success,
      r.reason,
      r.time,
      r.coins,
      r.explored,
      r.route
        .map((id) => `${id}:${routeNames[level.platforms[id].kind]}`)
        .join(" > "),
      `位置 ${sim.x},${sim.y}`,
    );
  }
