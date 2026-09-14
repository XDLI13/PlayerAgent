import Phaser from "phaser";
import { Simulation, DT } from "../gameplay/Simulation";
import { store } from "../core/state/GameStore";
import { levels, routeNames, type RouteKind } from "../modules/world/levels";
/** 地形颜色始终一致，便于用户识别选择，不按当前画像改变地图。 */
const routeColors: Record<RouteKind, number> = {
  start: 0x63834c,
  safe: 0x63834c,
  reward: 0xc6923d,
  explore: 0x8570b4,
  shortcut: 0xc56648,
  merge: 0x63834c,
};
/** Phaser 管理画布生命周期；模拟不依赖渲染，因此批测可以复用同一套逻辑。 */
export class GameScene extends Phaser.Scene {
  sim = new Simulation(levels[store.level], store.profile, store.seed);
  private graphics!: Phaser.GameObjects.Graphics;
  private accumulator = 0;
  private labels: Phaser.GameObjects.Text[] = [];
  private labelLevel = "";
  onFrame: () => void = () => {};
  constructor() {
    super("game");
  }
  create() {
    this.graphics = this.add.graphics();
    this.onFrame();
  }
  restartRun() {
    this.sim = new Simulation(levels[store.level], store.profile, store.seed);
    this.accumulator = 0;
  }
  singleStep() {
    for (let i = 0; i < 6; i++) this.sim.step();
    this.draw();
    this.onFrame();
  }
  update(_time: number, delta: number) {
    if (!store.paused) {
      this.accumulator += (Math.min(delta, 100) / 1000) * store.speed;
      while (this.accumulator >= DT) {
        this.sim.step();
        this.accumulator -= DT;
      }
    }
    this.draw();
    this.onFrame();
  }
  private draw() {
    if (!this.graphics) return;
    const g = this.graphics;
    g.clear();
    const s = this.sim;
    const camera = Math.max(0, Math.min(s.x - 220, s.level.width - 960));
    // 文本对象只在换地图时创建；每帧仅调整位置与可见性，避免分配大量对象。
    if (this.labelLevel !== s.level.name) {
      this.labels.forEach((label) => label.destroy());
      this.labels = s.level.platforms.map((p) =>
        this.add
          .text(0, 0, `P${p.id} ${routeNames[p.kind]}`, {
            fontSize: "10px",
            fontFamily: "Microsoft YaHei",
            color: "#30483c",
            backgroundColor: "#ecedd8",
            padding: { x: 3, y: 2 },
          })
          .setOrigin(0.5, 0),
      );
      this.labelLevel = s.level.name;
    }
    this.labels.forEach((label, i) => {
      const p = s.level.platforms[i];
      label
        .setPosition(p.x + p.w / 2 - camera, p.y + 27)
        .setVisible(
          store.overlay && p.x - camera < 960 && p.x + p.w - camera > 0,
        );
    });
    const rect = (
      x: number,
      y: number,
      w: number,
      h: number,
      color: number,
    ) => {
      g.fillStyle(color);
      g.fillRect(Math.round(x), Math.round(y), w, h);
    };
    rect(0, 0, 960, 480, 0x90c6c0);
    rect(0, 230, 960, 250, 0xafd3b4);
    // 原创程序化像素风景，不依赖外部图片下载。
    for (let i = 0; i < 9; i++) {
      let x = i * 180 - camera * 0.18;
      rect(x, 95 + (i % 3) * 24, 60, 14, 0xe6eed1);
      rect(x + 12, 83 + (i % 3) * 24, 30, 14, 0xe6eed1);
    }
    for (let i = 0; i < 10; i++) {
      const x = i * 160 - camera * 0.35;
      rect(x, 270, 90, 100, 0x72a990);
      rect(x + 20, 245, 50, 30, 0x72a990);
      rect(x + 33, 227, 25, 20, 0x72a990);
    }
    if (store.overlay) {
      g.fillStyle(0xf4e9bc, 0.12);
      g.fillRect(s.x - camera - 80, 160, 500, 270);
      g.lineStyle(1, 0xf5edc8, 0.5);
      g.strokeRect(s.x - camera - 80, 160, 500, 270);
    }
    for (const p of s.level.platforms) {
      const x = p.x - camera;
      if (x > 980 || x + p.w < 0) continue;
      rect(x, p.y, p.w, 12, routeColors[p.kind]);
      // 支路画成悬浮台，避免高处平台的装饰柱遮住下方路线。
      const bottom = p.kind === "start" || p.kind === "merge" ? 480 : p.y + 24;
      const stone = p.kind === "explore" || s.level.name.startsWith("07");
      rect(x, p.y + 12, p.w, bottom - p.y - 12, stone ? 0x78858b : 0x96704b);
      // 宽地面加入分层岩土与低矮植被，支路分别表现为石台和木桥。
      if (p.kind === "merge" || p.kind === "start") {
        rect(x, p.y + 32, p.w, 4, stone ? 0x596b76 : 0x7a603f);
        for (let plant = 12; plant < p.w - 15; plant += 47) {
          rect(x + plant, p.y - 5, 14, 5, 0x537b46);
          rect(x + plant + 5, p.y - 9, 5, 4, 0x638b52);
        }
      }
      if (p.kind === "shortcut") {
        for (let plank = 3; plank < p.w; plank += 12)
          rect(x + plank, p.y + 3, 2, 17, 0x5b4833);
      }
      for (let xx = 0; xx < p.w; xx += 24) {
        rect(x + xx, p.y + 16, 22, 3, 0xbb9160);
        for (let yy = p.y + 25; yy < bottom; yy += 24)
          rect(x + xx + 4, yy, 12, 3, 0x795a40);
      }
      if (!s.collected.has(p.id))
        for (let c = 0; c < p.coins; c++) {
          rect(
            x + p.w / 2 - 5 + ((c % 4) - (Math.min(p.coins, 4) - 1) / 2) * 13,
            p.y - 37 - Math.floor(c / 4) * 18,
            9,
            13,
            0xffdb70,
          );
          rect(
            x + p.w / 2 - 2 + ((c % 4) - (Math.min(p.coins, 4) - 1) / 2) * 13,
            p.y - 35 - Math.floor(c / 4) * 18,
            2,
            8,
            0xfff2bd,
          );
        }
      if (p.enemy && !s.deadEnemies.has(p.id)) {
        const ex = s.enemyX(p) - camera,
          ey = s.enemyY(p);
        const color =
          p.enemyType === "hopper"
            ? 0x8a63ad
            : p.enemyType === "armored"
              ? 0x567a86
              : 0xa55f46;
        rect(ex - 12, ey - 20, 24, 16, color);
        rect(ex - 8, ey - 26, 16, 8, color);
        rect(ex - 8, ey - 17, 4, 5, 0xffedce);
        rect(ex + 5, ey - 17, 4, 5, 0xffedce);
        rect(ex - 14, ey - 4, 9, 4, 0x443b37);
        rect(ex + 5, ey - 4, 9, 4, 0x443b37);
        if (p.enemyType === "armored") {
          rect(ex - 15, ey - 26, 30, 6, 0xa2bcc3);
          rect(ex - 10, ey - 32, 4, 6, 0xe1e7d8);
          rect(ex + 6, ey - 32, 4, 6, 0xe1e7d8);
        }
        if (p.enemyType === "hopper") {
          rect(ex - 8, ey - 34, 4, 10, color);
          rect(ex + 5, ey - 34, 4, 10, color);
        }
      }
      if (p.kind === "explore") {
        rect(x + p.w / 2 - 10, p.y - 30, 20, 26, 0x74628e);
        rect(
          x + p.w / 2 - 3,
          p.y - 24,
          6,
          12,
          s.visited.has(p.id) ? 0xbcd5aa : 0xd7bbfa,
        );
      }
      // 动态平台用轨道与方向标记展示，实际坐标由模拟器更新。
      if (p.motion) {
        rect(x - 16, p.y + 20, p.w + 32, 2, 0x5c969b);
        rect(x + 3, p.y + 3, 8, 4, 0xd9f5ee);
        rect(x + p.w - 11, p.y + 3, 8, 4, 0xd9f5ee);
      }
      if (p.trap) {
        const active = s.isTrapActive(p);
        for (let tx = 6; tx < p.w - 6; tx += 15) {
          rect(
            x + tx,
            p.y - (active ? 12 : 3),
            7,
            active ? 12 : 3,
            active ? 0xd45148 : 0x546b66,
          );
        }
      }
      const quest = s.level.quest;
      if (quest && p.id === quest.key && !s.task.hasKey && !s.task.doorOpen) {
        rect(x + p.w / 2 - 12, p.y - 65, 13, 13, 0xffe179);
        rect(x + p.w / 2 - 8, p.y - 61, 5, 5, 0x90c6c0);
        rect(x + p.w / 2, p.y - 60, 20, 5, 0xffe179);
        rect(x + p.w / 2 + 12, p.y - 60, 4, 12, 0xffe179);
      }
      if (quest && p.id === quest.door) {
        const dx = x + p.w / 2;
        rect(dx - 20, p.y - 64, 40, 64, 0x5d6d67);
        rect(dx - 14, p.y - 58, 28, 58, s.task.doorOpen ? 0xaad6bc : 0xa37a50);
        if (!s.task.doorOpen) {
          rect(dx - 3, p.y - 34, 7, 9, 0xffdb79);
        } else {
          rect(dx - 10, p.y - 58, 20, 58, 0x90c6c0);
        }
      }
      if (quest && p.id === quest.chest) {
        rect(x + p.w / 2 - 16, p.y - 26, 32, 24, 0xb47e3c);
        rect(
          x + p.w / 2 - 18,
          p.y - (s.task.chestOpen ? 42 : 30),
          36,
          10,
          0xeac36d,
        );
        rect(
          x + p.w / 2 - 3,
          p.y - 21,
          6,
          10,
          s.task.chestOpen ? 0x659b73 : 0xffe5a5,
        );
      }
    }
    // 记录已到访落点，用路线轨迹直观呈现画像选择。
    if (store.overlay) {
      g.lineStyle(2, 0xffffff, 0.65);
      for (let i = 1; i < s.route.length; i++) {
        const a = s.level.platforms[s.route[i - 1]],
          b = s.level.platforms[s.route[i]];
        g.lineBetween(
          a.x + a.w / 2 - camera,
          a.y - 5,
          b.x + b.w / 2 - camera,
          b.y - 5,
        );
      }
    }
    const end = s.level.platforms.at(-1)!;
    rect(end.x + 75 - camera, end.y - 125, 4, 125, 0xf5eace);
    rect(end.x + 79 - camera, end.y - 122, 35, 23, 0xd27055);
    if (s.target && store.overlay) {
      if (s.takeoff && s.ground >= 0) {
        rect(s.takeoff.takeoffX - camera - 2, s.y - 10, 4, 10, 0xffed9f);
      }
      g.lineStyle(2, 0xfff0b0, 0.8);
      g.lineBetween(
        s.x - camera,
        s.y - 20,
        s.target.x + s.target.w / 2 - camera,
        s.target.y - 20,
      );
      g.strokeRect(s.target.x - camera, s.target.y - 4, s.target.w, 8);
    }
    // 原创探险者：橙色帽子、浅色背包和蓝色衣裤。
    const x = s.x - camera,
      y = s.y;
    if (s.invincible === 0 || Math.floor(s.time * 12) % 2 === 0) {
      // 朝向跟随平移方向；地面移动时两只脚交替摆动，区别于跳跃。
      const stride =
        s.ground >= 0 && Math.abs(s.vx) > 0 ? Math.sin(s.time * 22) * 3 : 0;
      rect(x - 9, y - 34, 19, 7, 0xdb8059);
      rect(x - 12, y - 28, 26, 4, 0xe7a16e);
      rect(x - 7, y - 24, 16, 10, 0xf4d6aa);
      rect(x + (s.facing > 0 ? 5 : -7), y - 22, 3, 3, 0x293b3b);
      rect(x - 11, y - 15, 20, 10, 0x3e6871);
      rect(x + (s.facing > 0 ? -14 : 10), y - 15, 5, 8, 0xe6c887);
      rect(x - 10 + stride, y - 5, 7, 5, 0x31484c);
      rect(x + 3 - stride, y - 5, 8, 5, 0x31484c);
    }
  }
}
