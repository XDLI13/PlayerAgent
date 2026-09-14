/** 人格是可解释的游戏行为参数，不是心理学量表。所有画像共用相同运动能力。 */
export interface Profile {
  id: string;
  name: string;
  tag: string;
  color: string;
  safety: number;
  reward: number;
  speed: number;
  exploration: number;
  description: string;
  /** 耐心控制等待预算；坚持控制目标保留时间；记忆权重控制重复/受伤路线惩罚。 */
  patience: number;
  persistence: number;
  memory: number;
}
export const profiles: Profile[] = [
  {
    id: "careful",
    patience: 90,
    persistence: 80,
    memory: 90,
    name: "谨慎型",
    tag: "SAFE & STEADY",
    color: "#8edbb3",
    safety: 95,
    reward: 25,
    speed: 25,
    exploration: 10,
    description: "优先安全落点，耐心避开敌人。",
  },
  {
    id: "bold",
    patience: 15,
    persistence: 25,
    memory: 25,
    name: "冒险型",
    tag: "FAST & FEARLESS",
    color: "#ffad77",
    safety: 15,
    reward: 20,
    speed: 95,
    exploration: 25,
    description: "优先捷径，等待较短，尽快前进。",
  },
  {
    id: "collector",
    patience: 70,
    persistence: 95,
    memory: 65,
    name: "收集型",
    tag: "EVERY COIN COUNTS",
    color: "#f2d579",
    safety: 45,
    reward: 100,
    speed: 20,
    exploration: 20,
    description: "把沿途金币变成值得停留的目标。",
  },
  {
    id: "explorer",
    patience: 50,
    persistence: 55,
    memory: 100,
    name: "探索型",
    tag: "TAKE A NEW PATH",
    color: "#b6a1ed",
    safety: 35,
    reward: 30,
    speed: 35,
    exploration: 100,
    description: "偏好支路与高处平台，寻找不同路径。",
  },
];
