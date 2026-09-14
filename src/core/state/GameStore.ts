import { profiles, type Profile } from "../../agent/personality/profiles";
/** 这里只存跨关卡设置；角色坐标和本局成绩由 Simulation 单独管理。 */
export const store = {
  level: 7,
  profile: { ...profiles[0] } as Profile,
  seed: 42,
  paused: false,
  speed: 1,
  overlay: true,
};
