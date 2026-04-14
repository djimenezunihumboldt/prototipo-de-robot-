/**
 * T-800 IA Neural v3 — Mapa del mundo
 * Mundo procedural con salas, pasillos y obstáculos
 */

import { CONFIG } from './utils.js';

export class WorldMap {
  constructor() {
    /** @type {Set<string>} */
    this.walls = new Set();
    this._build();
  }

  _cell(x, z) {
    return `${x},${z}`;
  }

  add(x, z) {
    this.walls.add(this._cell(x, z));
  }

  remove(x, z) {
    this.walls.delete(this._cell(x, z));
  }

  has(x, z) {
    return this.walls.has(this._cell(x, z));
  }

  _build() {
    const GS = CONFIG.GRID_SIZE;
    // Outer border
    for (let i = 0; i < GS; i++) {
      this.add(i, 0);
      this.add(i, GS - 1);
      this.add(0, i);
      this.add(GS - 1, i);
    }

    // Obstáculos suaves de referencia: visibles y fáciles de detectar a tiempo.
    this.add(6, 15);
    this.add(16, 9);
    this.add(10, 17);
  }

  isWalkable(gx, gz) {
    const GS = CONFIG.GRID_SIZE;
    return gx >= 1 && gz >= 1 && gx < GS - 1 && gz < GS - 1 && !this.has(gx, gz);
  }

  canMoveTo(wx, wz) {
    const GS = CONFIG.GRID_SIZE;
    const R = CONFIG.ROBOT_RADIUS + CONFIG.COLLISION_MARGIN;

    if (wx < R || wz < R || wx > GS - 1 - R || wz > GS - 1 - R) return false;

    // Muestreo radial más denso para evitar traspasar esquinas y bordes
    const checks = [[wx, wz]];

    // Capas adicionales de detección cercana (más sensible)
    const rings = [R * 0.3, R * 0.5, R * 0.7, R * 0.82, R];
    for (const rr of rings) {
      // Incrementar granularidad: de cada 30° a cada 15° para mejor cobertura
      for (let a = 0; a < 360; a += 15) {
        const rad = (a * Math.PI) / 180;
        checks.push([wx + Math.cos(rad) * rr, wz + Math.sin(rad) * rr]);
      }
    }

    for (const [cx, cz] of checks) {
      if (this.has(Math.round(cx), Math.round(cz))) return false;
    }

    return true;
  }

  rayDist(wx, wz, ang, max = 8) {
    const r = (ang * Math.PI) / 180;
    const sx = Math.sin(r);
    const sz = Math.cos(r);

    // Paso más pequeño (0.015) para detección más precisa de muros
    const step = CONFIG.COLLISION_STEP * 0.5; // 0.015m steps
    for (let d = step; d <= max; d += step) {
      if (!this.canMoveTo(wx + sx * d, wz + sz * d)) return d;
    }
    return max;
  }

  // Multi-sensor ray distance (improved detection)
  rayDistAdvanced(wx, wz, ang, angles = 3, width = 12, max = 8) {
    if (angles <= 1) return this.rayDist(wx, wz, ang, max);

    let minDist = max;
    const step = width / (angles - 1);

    for (let i = 0; i < angles; i++) {
      const offset = -width / 2 + i * step;
      const d = this.rayDist(wx, wz, ang + offset, max);
      minDist = Math.min(minDist, d);
    }

    return minDist;
  }

  findSafeSpawn() {
    const GS = CONFIG.GRID_SIZE;
    const tries = [
      [2, 2],
      [12, 2],
      [22, 2],
      [2, 12],
      [12, 12],
      [22, 12],
      [2, 22],
      [12, 22],
      [22, 22],
    ];

    for (const [x, z] of tries) {
      if (this.canMoveTo(x + 0.5, z + 0.5)) {
        return { x: x + 0.5, z: z + 0.5 };
      }
    }

    for (let x = 2; x < GS - 2; x++) {
      for (let z = 2; z < GS - 2; z++) {
        if (this.canMoveTo(x + 0.5, z + 0.5)) {
          return { x: x + 0.5, z: z + 0.5 };
        }
      }
    }

    return { x: 12.5, z: 2.5 };
  }

  get wallList() {
    return [...this.walls].map((k) => k.split(',').map(Number));
  }

  countWalkable() {
    const GS = CONFIG.GRID_SIZE;
    let n = 0;

    for (let x = 0; x < GS; x++) {
      for (let z = 0; z < GS; z++) {
        if (this.isWalkable(x, z)) n++;
      }
    }

    return n;
  }
}
