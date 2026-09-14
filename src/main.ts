import Phaser from "phaser";
import { GameScene } from "./scenes/GameScene";
import { store } from "./core/state/GameStore";
import { profiles } from "./agent/personality/profiles";
import { levels, routeNames } from "./modules/world/levels";
import { Simulation, type Result } from "./gameplay/Simulation";
import "./styles/main.css";
/** DOM 负责实验控件，Phaser 负责游戏；文本使用 textContent 更新，避免插入外部 HTML。 */
document.querySelector("#app")!.innerHTML = `
<header><a class="brand" href="./"><span class="brand-icon">▦</span> PIXEL / PERSONA <small>游戏智能体实验室</small></a><span class="local"><i></i> LOCAL SIMULATION <b>v0.4</b></span></header>
<main><div class="intro"><div><p class="eyebrow">OBSERVE. UNDERSTAND. EXPERIMENT.</p><h1>同一个世界，不同的选择<span>。</span></h1><p class="muted">观察人格如何影响决策，让每一次闯关成为一场实验。</p></div><div class="mode">规则 Agent <span>● 离线运行</span></div></div>
<div class="workspace"><section class="stage-card"><div class="stage-top"><div><span class="live-dot"></span><b id="level-title"></b><span class="stage-sub" id="level-sub"></span></div><span id="run-status">实验进行中</span></div><div id="game-wrap"><div id="game"></div><div class="hud"><span>HEALTH <b id="health">♥ ♥ ♥</b></span><span>COINS <b id="coins">00</b></span><span>TIME <b id="time">0.0 s</b></span><span class="hud-right">SEED <b>42</b></span></div><div id="result" hidden><small>EXPERIMENT COMPLETE</small><h2 id="result-title"></h2><p id="result-detail"></p><button id="again">再运行一次 ↗</button></div></div>
<div class="transport"><button id="pause" class="primary">Ⅱ 暂停</button><button id="step">单步 +0.1s</button><button id="restart">↻ 重试</button><div class="divider"></div><label>速度 <select id="speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select></label><label class="vision"><input id="vision" type="checkbox" checked> 观测辅助线</label></div>
<div class="level-picker"><div><p class="eyebrow">TEST ENVIRONMENT</p><strong>选择实验关卡</strong></div><select id="level">${levels.map((l, i) => `<option value="${i}">${l.name}</option>`).join("")}</select><p>固定布局 · 相同运动能力 · 可复现实验</p></div>
</section><aside><section class="panel persona"><div class="section-heading"><h2>行为画像</h2><span>PERSONALITY</span></div><div class="profile-grid">${profiles.map((p) => `<button data-profile="${p.id}"><span style="color:${p.color}">◆</span> ${p.name}</button>`).join("")}</div><p id="profile-description"></p><div id="sliders">${[
  ["safety", "安全优先"],
  ["reward", "金币偏好"],
  ["speed", "通关速度"],
  ["exploration", "探索倾向"],
  ["patience", "耐心"],
  ["persistence", "目标坚持"],
  ["memory", "本局记忆影响"],
]
  .map(
    ([k, n]) =>
      `<label>${n}<output id="out-${k}"></output><input type="range" min="0" max="100" id="param-${k}" data-param="${k}"></label>`,
  )
  .join(
    "",
  )}</div><p class="hint" id="pending">参数固定于每次尝试开始时</p></section>
<section class="panel decision"><div class="section-heading"><h2>决策现场</h2><span class="rule">RULE BASED</span></div><div class="decision-row"><span>当前动作</span><strong id="action"></strong></div><div class="decision-row"><span>局部观测</span><strong id="observation"></strong></div><div class="decision-row"><span>短期目标</span><strong id="target"></strong></div><div class="decision-row"><span>地面平移</span><strong id="walk-stats"></strong></div><p class="hint">固定跳高 96 px · 固定跳远 140 px · 平移 120 px/s</p><div id="logs"></div></section></aside></div>
<section class="results"><div class="section-heading"><div><p class="eyebrow">EXPERIMENT RECORDS</p><h2>让行为差异，有据可查。</h2></div><div class="result-actions"><span id="batch-status">本地保留最近 100 条</span><button id="batch">运行四画像对比</button><button id="export">导出 JSON ↓</button></div></div><div class="table-scroll"><table><thead><tr><th>行为画像</th><th>关卡</th><th>结果</th><th>金币</th><th>受伤</th><th>耗时</th><th>路线</th></tr></thead><tbody id="records"></tbody></table></div><p class="hint">画像代表预设行为偏好，不是心理学人格诊断。批测每种画像运行 5 个相同种子，不代表真人表现。</p></section><footer>PIXEL / PERSONA LAB <span>观察 → 规划 → 行动 → 反馈</span><span>原创程序化像素素材 · 无模型调用费用</span></footer></main>`;
const el = (id: string) => document.getElementById(id)!;
// 新增图例和批测摘要；原有逐局记录仍然保留，旧版本不会混入新关卡对比。
document
  .querySelector(".level-picker")!
  .insertAdjacentHTML(
    "afterend",
    '<div class="route-legend"><span>🟩 安全绕行：更多落点</span><span>🟨 金币支路：额外收益</span><span>🟪 遗迹探索：新颖路线</span><span>🟧 危险捷径：窄平台</span></div>',
  );
document
  .querySelector(".table-scroll")!
  .insertAdjacentHTML(
    "beforebegin",
    '<div id="comparison" class="comparison"></div>',
  );
const questPanel = document.createElement("section");
questPanel.className = "quest-panel";
questPanel.innerHTML =
  '<div class="section-heading"><strong>本局任务与记忆</strong><span id="quest-goal"></span></div><div id="quest-steps" class="quest-steps"></div><p id="memory-state"></p>';
document.querySelector(".level-picker")!.after(questPanel);
questPanel.insertAdjacentHTML(
  "afterend",
  '<div class="route-legend">敌人图鉴：<span>🟤 巡逻怪：地面巡逻，可踩踏</span><span>🟣 弹跳怪：周期起跳，可踩踏</span><span>🛡 装甲怪：不能踩踏，需避让</span></div>',
);
const scene = new GameScene();
new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 960,
  height: 480,
  pixelArt: true,
  backgroundColor: "#90c6c0",
  scene: [scene],
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
});
let records: Result[] = [];
try {
  const saved = JSON.parse(localStorage.getItem("persona-records-v1") || "[]");
  if (Array.isArray(saved))
    records = saved
      .filter(
        (r) =>
          r &&
          typeof r.profile === "string" &&
          Array.isArray(r.route) &&
          typeof r.time === "number",
      )
      .slice(-100);
} catch {
  /* 存档损坏或浏览器禁用存储时，仍允许正常游戏。 */
}
let recorded = false;
let lastUi = 0;
function renderRecords() {
  renderComparison();
  const body = el("records");
  body.replaceChildren();
  for (const r of records.slice().reverse()) {
    const tr = document.createElement("tr");
    for (const text of [
      r.profile,
      r.level + (r.version === levels[store.level].version ? "" : "（旧版）"),
      r.success ? "✓ 通关" : "× " + r.reason,
      String(r.coins),
      String(r.damage),
      r.time + " s",
      r.routeKinds
        ? r.routeKinds.map((k) => routeNames[k]).join(" → ")
        : r.route.map((n) => "P" + n).join(" → "),
    ]) {
      const td = document.createElement("td");
      td.textContent = text;
      td.title = text;
      tr.append(td);
    }
    body.append(tr);
  }
  if (!records.length)
    body.innerHTML =
      '<tr><td colspan="7" class="empty">第一场实验正在进行，结束后将在这里记录结果。</td></tr>';
}
/** 只汇总同一批、同一关卡版本的数据，不把手调参数或历史版本混在一起。 */
function renderComparison() {
  const host = el("comparison");
  host.replaceChildren();
  const matching = records.filter(
    (r) =>
      r.version === levels[store.level].version &&
      r.level === levels[store.level].name &&
      r.batchId,
  );
  const batchId = matching.at(-1)?.batchId;
  if (!batchId) {
    host.textContent =
      "点击“运行四画像对比”，查看同一关卡下的通关率、金币、遗迹访问和跳跃次数。";
    return;
  }
  const batch = matching.filter((r) => r.batchId === batchId);
  for (const profile of profiles) {
    const runs = batch.filter((r) => r.parameters.id === profile.id);
    const card = document.createElement("article");
    card.style.borderTopColor = profile.color;
    const title = document.createElement("strong");
    title.textContent = profile.name;
    card.append(title);
    if (runs.length) {
      const average = (
        key: "coins" | "time" | "explored" | "jumps" | "waited" | "switches",
      ) => (runs.reduce((sum, r) => sum + r[key], 0) / runs.length).toFixed(1);
      const stats = document.createElement("p");
      stats.textContent = `${Math.round((runs.filter((r) => r.success).length / runs.length) * 100)}% 通关 · ${runs.length}/5 次\n金币 ${average("coins")} · 遗迹 ${average("explored")}\n耗时 ${average("time")}s · 跳跃 ${average("jumps")} 次`;
      if (runs[0].taskEvents)
        stats.textContent += `
宝箱 ${runs.filter((r) => r.chestOpened).length}/${runs.length} · 等待 ${average("waited")}s · 换目标 ${average("switches")}`;
      card.append(stats);
      const route = document.createElement("small");
      route.textContent =
        "首局：" + runs[0].routeKinds.map((k) => routeNames[k]).join(" → ");
      card.append(route);
    } else {
      card.append("等待运行");
    }
    host.append(card);
  }
}
function save(r: Result) {
  records.push(r);
  records = records.slice(-100);
  try {
    localStorage.setItem("persona-records-v1", JSON.stringify(records));
  } catch {
    el("batch-status").textContent = "浏览器存储不可用，请导出记录";
  }
  renderRecords();
}
function syncProfile() {
  document
    .querySelectorAll<HTMLButtonElement>("[data-profile]")
    .forEach((b) =>
      b.classList.toggle("selected", b.dataset.profile === store.profile.id),
    );
  el("profile-description").textContent = store.profile.description;
  for (const key of [
    "safety",
    "reward",
    "speed",
    "exploration",
    "patience",
    "persistence",
    "memory",
  ] as const) {
    (el("param-" + key) as HTMLInputElement).value = String(store.profile[key]);
    el("out-" + key).textContent = String(store.profile[key]);
  }
}
function restart() {
  scene.restartRun();
  recorded = false;
  store.paused = false;
  el("pause").textContent = "Ⅱ 暂停";
  el("result").hidden = true;
  el("pending").textContent = "本次参数已锁定 · " + scene.sim.profile.name;
  el("level-title").textContent = levels[store.level].name;
  el("level-sub").textContent = levels[store.level].subtitle;
  (el("level") as HTMLSelectElement).value = String(store.level);
  renderComparison();
}
scene.onFrame = () => {
  const s = scene.sim;
  if (s.done && !recorded) {
    recorded = true;
    save(s.result());
    el("result").hidden = false;
    el("result-title").textContent = s.success ? "旅程完成！" : "再试一种选择";
    el("result-detail").textContent =
      `${s.profile.name} · ${s.reason} · ${s.coins} 枚金币 · ${s.time.toFixed(1)} 秒`;
  }
  if (performance.now() - lastUi < 100) return;
  lastUi = performance.now();
  el("health").textContent = "♥ ".repeat(s.hp) + "♡ ".repeat(3 - s.hp);
  el("coins").textContent = String(s.coins).padStart(2, "0");
  el("time").textContent = s.time.toFixed(1) + " s";
  el("action").textContent = s.action;
  el("quest-goal").textContent = s.taskGoal;
  el("quest-steps").replaceChildren(
    ...[
      ["钥匙", s.task.hasKey || s.task.doorOpen],
      ["机关门", s.task.doorOpen],
      ["宝箱 +30", s.task.chestOpen],
    ].map(([label, done]) => {
      const span = document.createElement("span");
      span.textContent = (done ? "✓ " : "○ ") + label;
      span.className = done ? "completed" : "";
      return span;
    }),
  );
  el("memory-state").textContent =
    `本局记住 ${s.memory.visits.size} 个落点 · ${s.memory.injuries.size} 处受伤位置 · 换目标 ${s.memory.switches} 次 · 等待 ${s.waited.toFixed(1)}s`;
  questPanel.hidden = !s.level.quest;
  el("walk-stats").textContent =
    `← ${s.walkLeft.toFixed(0)} px / → ${s.walkRight.toFixed(0)} px`;
  el("observation").textContent = `${s.observe().length} 个平台 · 前方 420 px`;
  el("target").textContent = s.target
    ? `${routeNames[s.target.kind]} P${s.target.id} · ${s.target.coins} 金币`
    : "检查当前落点";
  el("run-status").textContent = s.done
    ? "实验已结束"
    : store.paused
      ? "已暂停"
      : s.profile.name + " · 运行中";
  el("logs").replaceChildren(
    ...s.logs.slice(0, 4).map((t) => {
      const p = document.createElement("p");
      p.textContent = t;
      return p;
    }),
  );
};
document.querySelectorAll<HTMLButtonElement>("[data-profile]").forEach(
  (b) =>
    (b.onclick = () => {
      store.profile = { ...profiles.find((p) => p.id === b.dataset.profile)! };
      syncProfile();
      el("pending").textContent = "已修改 · 下次尝试生效，点击重试应用";
    }),
);
document.querySelectorAll<HTMLInputElement>("[data-param]").forEach(
  (input) =>
    (input.oninput = () => {
      const key = input.dataset.param as
        | "safety"
        | "reward"
        | "speed"
        | "exploration"
        | "patience"
        | "persistence"
        | "memory";
      store.profile[key] = +input.value;
      el("out-" + key).textContent = input.value;
      el("pending").textContent = "已修改 · 下次尝试生效，点击重试应用";
    }),
);
el("pause").onclick = () => {
  store.paused = !store.paused;
  el("pause").textContent = store.paused ? "▶ 继续" : "Ⅱ 暂停";
};
el("step").onclick = () => {
  store.paused = true;
  el("pause").textContent = "▶ 继续";
  scene.singleStep();
};
el("restart").onclick = restart;
el("again").onclick = restart;
(el("speed") as HTMLSelectElement).onchange = (e) =>
  (store.speed = +(e.target as HTMLSelectElement).value);
(el("vision") as HTMLInputElement).onchange = (e) =>
  (store.overlay = (e.target as HTMLInputElement).checked);
(el("level") as HTMLSelectElement).onchange = (e) => {
  store.level = +(e.target as HTMLSelectElement).value;
  restart();
};
/** 每完成一局就把控制权交还浏览器，避免批测使页面失去响应。 */
el("batch").onclick = async () => {
  const button = el("batch") as HTMLButtonElement;
  button.disabled = true;
  const level = levels[store.level];
  const batchId = Date.now().toString();
  try {
    for (let i = 0; i < 20; i++) {
      const sim = new Simulation(
        level,
        profiles[Math.floor(i / 5)],
        42 + (i % 5),
      );
      while (!sim.done) sim.step();
      save({ ...sim.result(), batchId });
      el("batch-status").textContent = `对比进度 ${i + 1} / 20`;
      await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    button.disabled = false;
  }
};
el("export").onclick = () => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(records, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "persona-experiments.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
syncProfile();
renderRecords();
restart();

