/**
 * T-800 IA Neural v3 — Utilidades y helpers
 */

// ═══════════════════════════════════════════════════════
// DOM Helpers
// ═══════════════════════════════════════════════════════
export const $ = (id) => document.getElementById(id);

export const set = (id, v) => {
  const e = $(id);
  if (e) e.textContent = v;
};

// ═══════════════════════════════════════════════════════
// Math helpers
// ═══════════════════════════════════════════════════════
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const lerp = (a, b, t) => a + (b - a) * t;

export const deg2rad = (d) => (d * Math.PI) / 180;

export const rad2deg = (r) => (r * 180) / Math.PI;

export const normalizeAngle = (angle) => {
  return ((angle % 360) + 360) % 360;
};

export const angleDiff = (a1, a2) => {
  const diff = ((a2 - a1 + 180) % 360) - 180;
  return diff < -180 ? diff + 360 : diff;
};

export const distance = (x1, z1, x2, z2) =>
  Math.hypot(x1 - x2, z1 - z2);

// ═══════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════
export const CONFIG = {
  GRID_SIZE: 26,
  PERF_LEVEL: 'high',
  CHARGE_STATIONS: [
    { x: 14, z: 10 },
    { x: 3, z: 20 },
    { x: 20, z: 5 },
    { x: 20, z: 20 },
    { x: 4, z: 4 }
  ],
  ROBOT_RADIUS: 0.38,
  COLLISION_MARGIN: 0.18,
  COLLISION_STEP: 0.03,
  SPEED: 4.0,
  TURN_SPEED: 150,
  AI_THINK_INTERVAL: 180, // ms
  SPIN_DETECTION_THRESHOLD: 3,
  FORCED_FWD_DURATION: 1.8,
  ESCAPE_RADIUS: 5,
  STUCK_THRESHOLD: 5,
  STUCK_ESCAPE_THRESHOLD: 10,
  MAX_RAY_DISTANCE: 8,
  OBSTACLE_CLOSE: 0.35,
  OBSTACLE_NEAR: 0.85,
  CLEAR_DISTANCE: 1.5,
  BATTERY_DRAIN_RATE: 0.18,
  TURN_LOCK_DURATION: 0.9,
  TURN_LOCK_VARIANCE: 0.3,
  NUM_RAY_SENSORS: 13,
  RAY_ANGLES: [
    0,
    10,
    -10,
    20,
    -20,
    35,
    -35,
    55,
    -55,
    90,
    -90,
    130,
    -130,
  ],
};
