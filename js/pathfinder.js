/**
 * T-800 IA Neural v3 — Pathfinder A*
 * Búsqueda optimizada de rutas
 */

export class AStarPathfinder {
  constructor(world) {
    this.world = world;
  }

  _riskAt(x, z, riskMap) {
    if (!riskMap || !riskMap.size) return 0;

    const key = `${x},${z}`;
    let r = riskMap.get(key) || 0;

    // Suavizado local: si alrededor hay riesgo, también penaliza esta celda.
    const N = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];

    for (const [dx, dz] of N) {
      const nr = riskMap.get(`${x + dx},${z + dz}`) || 0;
      r = Math.max(r, nr * 0.75);
    }

    return Math.min(1, Math.max(0, r));
  }

  _wallProximity(x, z) {
    const W = this.world;
    const N = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];

    let nearWalls = 0;
    for (const [dx, dz] of N) {
      if (W.has(x + dx, z + dz)) nearWalls++;
    }

    return Math.min(1, nearWalls / 4);
  }

  _h(ax, az, bx, bz) {
    return Math.abs(ax - bx) + Math.abs(az - bz);
  }

  /**
   * Find optimal path from (sx,sz) to (gx,gz)
   * @returns {{x:number,z:number}[]}
   */
  findPath(sx, sz, gx, gz, opts = {}) {
    const W = this.world;
    const riskMap = opts.riskMap || null;
    const riskWeight = opts.riskWeight ?? 1.7;
    const wallWeight = opts.wallWeight ?? 0.8;
    const visitedMap = opts.visitedMap || null;
    const visitedWeight = opts.visitedWeight ?? 0.45;

    if (!W.isWalkable(gx, gz)) return [];

    const key = (x, z) => `${x},${z}`;
    const open = new Map();
    const gScore = new Map();
    const fScore = new Map();
    const cameFrom = new Map();

    const start = key(sx, sz);
    gScore.set(start, 0);
    fScore.set(start, this._h(sx, sz, gx, gz));
    open.set(start, { x: sx, z: sz });

    const DIRS = [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ];
    const DCOST = [1, 1, 1, 1, 1.41, 1.41, 1.41, 1.41];

    let iters = 0;
    // Ampliado a 15000 iteraciones para no fallar en mapas cerrados y evitar estancamientos AI
    while (open.size > 0 && iters++ < 15000) {
      // Find node with lowest fScore
      let cur = null;
      let curF = Infinity;

      for (const [k, n] of open) {
        const f = fScore.get(k) ?? Infinity;
        if (f < curF) {
          curF = f;
          cur = k;
        }
      }

      if (!cur) break;

      const { x, z } = open.get(cur);

      if (x === gx && z === gz) {
        // Reconstruct path
        const path = [];
        let c = cur;

        while (cameFrom.has(c)) {
          const n = cameFrom.get(c);
          path.unshift({ x: n.x, z: n.z });
          c = key(n.x, n.z);
        }

        path.push({ x: gx, z: gz });
        return path;
      }

      open.delete(cur);

      for (let i = 0; i < DIRS.length; i++) {
        const [dx, dz] = DIRS[i];
        const nx = x + dx;
        const nz = z + dz;

        if (
          !W.isWalkable(nx, nz) ||
          !W.canMoveTo(nx + 0.5, nz + 0.5)
        ) {
          continue;
        }

        const nk = key(nx, nz);
        const riskPenalty = this._riskAt(nx, nz, riskMap) * riskWeight;
        const wallPenalty = this._wallProximity(nx, nz) * wallWeight;
        const visitedPenalty = visitedMap && visitedMap.has(nk) ? visitedWeight : 0;
        const tentG =
          (gScore.get(cur) ?? Infinity) +
          DCOST[i] +
          riskPenalty +
          wallPenalty +
          visitedPenalty;

        if (tentG < (gScore.get(nk) ?? Infinity)) {
          cameFrom.set(nk, { x, z });
          gScore.set(nk, tentG);
          fScore.set(nk, tentG + this._h(nx, nz, gx, gz));
          open.set(nk, { x: nx, z: nz });
        }
      }
    }

    return [];
  }

  /**
   * BFS to find nearest unvisited cell (frontier exploration)
   * @param {number} sx
   * @param {number} sz
   * @param {Set<string>} visited
   * @returns {{x:number,z:number}[]}
   */
  findFrontier(sx, sz, visited, opts = {}) {
    const W = this.world;
    const key = (x, z) => `${x},${z}`;

    const queue = [{ x: Math.round(sx), z: Math.round(sz) }];
    const seen = new Set([key(queue[0].x, queue[0].z)]);

    const DIRS = [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ];

    while (queue.length > 0) {
      const { x, z } = queue.shift();

      if (!visited.has(key(x, z))) {
        // Found frontier — get actual path to it
        return this.findPath(
          Math.round(sx),
          Math.round(sz),
          x,
          z,
          opts
        );
      }

      for (const [dx, dz] of DIRS) {
        const nx = x + dx;
        const nz = z + dz;
        const nk = key(nx, nz);

        if (!seen.has(nk) && W.isWalkable(nx, nz)) {
          seen.add(nk);
          queue.push({ x: nx, z: nz });
        }
      }
    }

    return [];
  }
}
