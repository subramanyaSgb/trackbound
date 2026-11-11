export const LANE_W = 2.2;
export const laneX = (lane: number) => (lane - 1) * LANE_W;

export const CFG = {
  startSpeed: 11,
  maxSpeed: 27,
  speedPerMeter: 0.008, // speed gained per metre run
  jumpV: 9.6,
  gravity: 28,
  fastFall: 34,
  slideTime: 0.65,
  standH: 1.6,
  slideH: 0.7,
  halfW: 0.3,
  coinValue: 10,
  viewAhead: 140,
  chunkLen: 60,
};

export const speedAt = (d: number) => Math.min(CFG.maxSpeed, CFG.startSpeed + d * CFG.speedPerMeter);
