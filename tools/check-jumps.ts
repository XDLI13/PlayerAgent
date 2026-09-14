import {Simulation} from '../src/gameplay/Simulation';
import {levels} from '../src/modules/world/levels';
import {profiles} from '../src/agent/personality/profiles';
import {MOTION} from '../src/gameplay/Motion';
/** 打印首个不满足动作距离的落地，辅助排查动态平台预测与实际碰撞。 */
const s=new Simulation(levels[5],profiles[0]);let start=0,target=0,origin=0;
while(!s.done){const previous=s.ground;s.step();if(previous>=0&&s.ground<0){start=s.takeoff!.takeoffX;target=s.target!.id;origin=previous;}
if(previous<0&&s.ground>=0&&Math.abs(Math.abs(s.x-start)-MOTION.jumpDistance)>1e-5){console.log({time:s.time,origin,target,landed:s.ground,start,x:s.x,distance:s.x-start,logs:s.logs});break;}}
