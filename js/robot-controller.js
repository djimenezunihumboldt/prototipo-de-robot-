/**
 * T-800 IA Neural v3 â€” Controlador mejorado del robot
 * LÃ³gica de movimiento, navegaciÃ³n y anti-bloqueo
 */

import {
  CONFIG,
  $,
  set,
  clamp,
  deg2rad,
  rad2deg,
  normalizeAngle,
  angleDiff,
  distance,
} from './utils.js';

export class RobotController {
  constructor(robot, world, pathfinder, nn, voice) {
    this.robot = robot;
    this.world = world;
    this.pathfinder = pathfinder;
    this.nn = nn;
    this.voice = voice;

    this.robotAngle = 0;
    this.robotVel = 0;
    this.battery = 90;
    this.steps = 0;
    this.evaded = 0;
    this.curAct = 'avanzar'; // Current action
    this.isCharging = false;
    this.chargeLevelReached = false;

    // Navigation
    this.visited = new Set();
    this.bfsPath = [];
    this.bfsTarget = null;
    this.startCell = null;
    this.goalCell = null;
    this.missionComplete = false;
    this.roundTripMode = false;
    this.rechargeMode = false;
    this.scannedWalkable = new Set();
    this.scannedBlocked = new Set();
    this.blockedRisk = new Map();
    this.scanCooldown = 0;
    this.scanInterval = 0.24;
    this.scanAngleStep = 10;
    this.scanRayCount = 2;
    this.scanRayWidth = 8;
    this.scanRayMax = 5.1;
    this.performanceMode = 'alta';
    this.stableTurnTime = 0;
    this.lastPos = { x: this.robot.position.x, z: this.robot.position.z };
    this.failedChargeStations = new Set();

    // Anti-stick & rotation logic
    this.stuckCnt = 0;
    this.turnLockTimer = 0;
    this.turnLockDir = 1;
    this.consecutiveTurns = 0;
    this.actionHistory = [];
    this.forceFwdTimer = 0;
    this.forceFwdAngle = 0;

    // Anti-oscillation
    this.lastAction = null;
    this.lastActionTime = 0;
    this.oscillationCounter = 0;
    this.rotationLock = 0;

    // Replan cooldown
    this.replanCooldown = 0;

    // AI state
    this.autoMode = false;
    this.lastNN = null;

    this._scanEnvironmentGlobal();
    this._setupMission();
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // ANTI-SPIN LOGIC (Mejorado)
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  _isOscillating() {
    const r = this.actionHistory.slice(-8);
    const turns = r.filter(
      (a) => a === 'girar-izq' || a === 'girar-der'
    );

    if (turns.length < 6) return false;

    // Check for alternating pattern
    let flips = 0;
    for (let i = 1; i < turns.length; i++) {
      if (turns[i] !== turns[i - 1]) flips++;
    }

    // Detecta tambiÃ©n giros persistentes sin avance (spin-lock).
    const hasLinear = r.some(
      (a) => a === 'avanzar' || a === 'explorar' || a === 'retroceder'
    );
    const spinLock = turns.length >= 7 && !hasLinear;

    // If too many flips, it's oscillating
    return flips >= 4 || spinLock;
  }

  _recordAction(a) {
    this.actionHistory.push(a);
    if (this.actionHistory.length > 10) {
      this.actionHistory.shift();
    }
  }

  _markScannedWalkable(x, z) {
    if (!this.world.isWalkable(x, z)) return;
    this.scannedWalkable.add(`${x},${z}`);
  }

  _markScannedBlocked(x, z, dist = 1, maxDist = 1) {
    if (!this.world.has(x, z)) return;
    const k = `${x},${z}`;
    this.scannedBlocked.add(k);

    // Mayor riesgo cuanto mÃ¡s cerca del robot estÃ¡ el obstÃ¡culo.
    const near = 1 - clamp(dist / Math.max(0.001, maxDist), 0, 1);
    const sampleRisk = clamp(0.2 + near * 0.8, 0.2, 1);
    const prev = this.blockedRisk.get(k) || 0;
    const blended = clamp(prev * 0.78 + sampleRisk * 0.22, 0, 1);
    this.blockedRisk.set(k, blended);
  }

  _scanEnvironmentGlobal() {
    const GS = CONFIG.GRID_SIZE;
    this.scannedWalkable.clear();
    this.scannedBlocked.clear();
    this.blockedRisk.clear();

    for (let x = 0; x < GS; x++) {
      for (let z = 0; z < GS; z++) {
        if (this.world.isWalkable(x, z)) {
          this.scannedWalkable.add(`${x},${z}`);
        } else if (this.world.has(x, z)) {
          const k = `${x},${z}`;
          this.scannedBlocked.add(k);
          this.blockedRisk.set(k, 0.65);
        }
      }
    }
  }

  _scanEnvironmentLocal() {
    const wx = this.robot.position.x;
    const wz = this.robot.position.z;
    const step = this.scanAngleStep || 6;
    const rayCount = this.scanRayCount || 3;
    const rayWidth = this.scanRayWidth || 10;
    const maxLength = this.scanRayMax || 6.2;

    for (let a = 0; a < 360; a += step) {
      const hitDist = this.world.rayDistAdvanced(wx, wz, a, rayCount, rayWidth, maxLength);
      const rad = deg2rad(a);

      for (let d = 0.2; d < Math.max(0.2, hitDist - 0.15); d += 0.28) {
        const gx = Math.round(wx + Math.sin(rad) * d);
        const gz = Math.round(wz + Math.cos(rad) * d);
        this._markScannedWalkable(gx, gz);
      }

      const bx = Math.round(wx + Math.sin(rad) * hitDist);
      const bz = Math.round(wz + Math.cos(rad) * hitDist);
      this._markScannedBlocked(bx, bz, hitDist, maxLength);
    }
  }

  _updateLocomotionStability(dt) {
    const dx = this.robot.position.x - this.lastPos.x;
    const dz = this.robot.position.z - this.lastPos.z;
    const moved = Math.hypot(dx, dz);

    if (
      (this.curAct === 'girar-izq' || this.curAct === 'girar-der') &&
      moved < 0.015
    ) {
      this.stableTurnTime += dt;
    } else {
      this.stableTurnTime = Math.max(0, this.stableTurnTime - dt * 1.5);
    }

    this.lastPos.x = this.robot.position.x;
    this.lastPos.z = this.robot.position.z;

    if (this.stableTurnTime > 0.95) {
      this.stableTurnTime = 0;
      this.turnLockTimer = 0;
      this.consecutiveTurns = 0;
      this.forceFwdTimer = 0.55;
      this.forceFwdAngle = this._bestOpenAngle();
      this.robotAngle = this.forceFwdAngle;
      this.actionHistory = [];
    }
  }

  _setupMission() {
    if (!this.world.canMoveTo(this.robot.position.x, this.robot.position.z)) {
      const sp = this.world.findSafeSpawn();
      this.robot.position.set(sp.x, 0, sp.z);
    }

    const sx = Math.round(this.robot.position.x);
    const sz = Math.round(this.robot.position.z);

    this.startCell = { x: sx, z: sz };
    this.goalCell = this._pickGoalCell(sx, sz);
    this.missionComplete = false;

    set('st-tg', `(${this.goalCell.x},${this.goalCell.z})`);
    set('pi-txt', 'MISIÃ“N: NAVEGAR A META');

    const d = $('pi-dot');
    if (d) {
      d.style.cssText =
        'background:#00ff88;box-shadow:0 0 6px #00ff88';
    }
  }

  _pickGoalCell(sx, sz) {
    const GS = CONFIG.GRID_SIZE;
    const minEdge = 2; // Expandir el margen para que patrulle mÃ¡s cerca del borde
    const center = (GS - 1) / 2;
    let best = null;
    let bestScore = -Infinity;

    for (let x = minEdge; x <= GS - 1 - minEdge; x++) {
      for (let z = minEdge; z <= GS - 1 - minEdge; z++) {
        if (!this.world.isWalkable(x, z)) continue;
        if (!this.world.canMoveTo(x + 0.5, z + 0.5)) continue;
        if (this._isNearChargeCell(x, z)) continue;

        const wallGap = Math.min(x, z, GS - 1 - x, GS - 1 - z);
        const axisBalance = Math.min(Math.abs(x - sx), Math.abs(z - sz));
        const centerBias = -Math.hypot(x - center, z - center);
        const startBias = Math.hypot(x - sx, z - sz) * 0.2;
        const score = wallGap * 8 + axisBalance * 3 + centerBias + startBias;

        if (score > bestScore) {
          best = { x, z };
          bestScore = score;
        }
      }
    }

    if (best) return best;

    for (let x = 2; x < GS - 2; x++) {
      for (let z = 2; z < GS - 2; z++) {
        if (this.world.isWalkable(x, z) && this.world.canMoveTo(x + 0.5, z + 0.5)) {
          return { x, z };
        }
      }
    }

    return { x: sx, z: sz };
  }

  _pickGoalFarFrom(refX, refZ) {
    const GS = CONFIG.GRID_SIZE;
    const minEdge = 2; // Expandir el margen para que patrulle mÃ¡s cerca del borde
    const center = (GS - 1) / 2;
    let unvisited = [];

    // Priorizar visitar las estaciones de carga primero (Patrullaje)
    for (const station of CONFIG.CHARGE_STATIONS) {
      const cx = Math.round(station.x);
      const cz = Math.round(station.z);
      if (!this.visited.has(`${cx},${cz}`)) {
        return { x: cx, z: cz }; // Forzar ruta hacia centro de carga no visitado
      }
    }

    // Recolectar casillas no visitadas del interior, priorizando frontera
    for (let x = minEdge; x <= GS - 1 - minEdge; x++) {
      for (let z = minEdge; z <= GS - 1 - minEdge; z++) {
        if (!this.world.isWalkable(x, z)) continue;
        if (!this.world.canMoveTo(x + 0.5, z + 0.5)) continue;
        // Removido isNearChargeCell para explorar estaciones
        if (!this.visited.has(`${x},${z}`)) {
          const wallGap = Math.min(x, z, GS - 1 - x, GS - 1 - z);
          const distance = Math.hypot(x - refX, z - refZ);
          const refBias = distance * 0.5;
          const cornerBonus = Math.min(Math.abs(x - 2), Math.abs(x - GS - 3), Math.abs(z - 2), Math.abs(z - GS - 3)) * 3;
          unvisited.push({ x, z, score: wallGap * 6 + refBias + cornerBonus });
        }
      }
    }

    // Si aÃºn hay zonas sin explorar, selecciona la mejor y mÃ¡s lejana
    if (unvisited.length > 0) {
      unvisited.sort((a, b) => b.score - a.score);
        const goal = { x: unvisited[0].x, z: unvisited[0].z };
        // Validar que se puede llegar a ese punto
        if (!this.world.canMoveTo(goal.x + 0.5, goal.z + 0.5)) {
          // Si no se puede, intentar con el siguiente
          for (let i = 1; i < unvisited.length; i++) {
            if (this.world.canMoveTo(unvisited[i].x + 0.5, unvisited[i].z + 0.5)) {
              return { x: unvisited[i].x, z: unvisited[i].z };
            }
          }
        }
        return goal;
    }

    // Fallback: patrullaje en zonas seguras
    let patrolZones = [];
    for (let x = minEdge; x <= GS - 1 - minEdge; x++) {
      for (let z = minEdge; z <= GS - 1 - minEdge; z++) {
        if (
          this.world.isWalkable(x, z) &&
          this.world.canMoveTo(x + 0.5, z + 0.5) &&
          !this._isNearChargeCell(x, z)
        ) {
          const dist = Math.hypot(x - refX, z - refZ);
          patrolZones.push({ x, z, score: dist });
        }
      }
    }

    if (patrolZones.length > 0) {
      patrolZones.sort((a, b) => b.score - a.score);
      return { x: patrolZones[0].x, z: patrolZones[0].z };
    }

    return { x: refX, z: refZ };
  }

  _getClosestChargeStation(skipStation = null) {
    const rX = this.robot.position.x;
    const rZ = this.robot.position.z;
    let closest = null;
    let minDist = Infinity;

    CONFIG.CHARGE_STATIONS.forEach(station => {
      if (this.failedChargeStations.has(`${station.x},${station.z}`)) {
        return; // Skip failed stations
      }
      if (skipStation && skipStation.x === station.x && skipStation.z === station.z) {
        return; // Skip this station
      }
      const dist = distance(rX, rZ, station.x + 0.5, station.z + 0.5);
      if (dist < minDist) {
        minDist = dist;
        closest = station;
      }
    });

    return closest;
  }

  _getChargeCell(skipStation = null) {
    const c = this._getClosestChargeStation(skipStation);
    if (!c) return null;
    return { x: Math.round(c.x), z: Math.round(c.z) };
  }

  _isNearChargeCell(x, z, minDist = 4.0) {
    let tooClose = false;
    CONFIG.CHARGE_STATIONS.forEach(station => {
      if (Math.hypot(x - station.x, z - station.z) < minDist) {
        tooClose = true;
      }
    });
    return tooClose;
  }

  _distanceToCharge() {
    const c = this._getClosestChargeStation();
    if (!c) return Infinity; // Prevenir error 'x' nulo si todas las estaciones fallan
    return distance(
      this.robot.position.x,
      this.robot.position.z,
      c.x + 0.5,
      c.z + 0.5
    );
  }

  _atChargeStation() {
    return this._distanceToCharge() < 0.75;
  }

  _shouldRechargeNow() {
    const dist = this._distanceToCharge();
    const reserve = 15 + dist * 3.5;
    return this.battery <= Math.max(15, reserve);
  }

_goToChargeStation(skipStation = null) {
      const c = this._getChargeCell(skipStation);
      if (!c) {
        // Si no hay estaciÃ³n disponible, esperar
        this.rechargeMode = false;
        return;
      }
    this.rechargeMode = true;
    this.missionComplete = false;
    this.goalCell = { ...c };
    this.bfsPath = [];
    this.bfsTarget = null;
    this.replanCooldown = 0;
    this._replan();
  }

  setRoundTrip(enabled) {
    this.roundTripMode = !!enabled;
    set('pi-txt', enabled ? 'MODO: IDA Y VUELTA' : 'MODO: SOLO IDA');
  }

  generateNewGoal() {
    const rx = Math.round(this.robot.position.x);
    const rz = Math.round(this.robot.position.z);
    this.rechargeMode = false;
    this.startCell = { x: rx, z: rz };
    this.goalCell = this._pickGoalFarFrom(rx, rz);
    this.missionComplete = false;
    this.bfsPath = [];
    this.bfsTarget = null;
    this.replanCooldown = 0;
    this._replan();
  }

  _hasReachedGoal() {
    if (!this.goalCell) return false;
    const wx = this.robot.position.x;
    const wz = this.robot.position.z;
    return distance(wx, wz, this.goalCell.x + 0.5, this.goalCell.z + 0.5) < 0.7;
  }

  _riskTuning() {
    const sr = $('s-risk');
    const sw = $('s-wall');
    const pr = sr ? clamp(+sr.value / 100, 0, 1) : 0.7;
    const pw = sw ? clamp(+sw.value / 100, 0, 1) : 0.65;

    // Escala dinÃƒÂ¡mica independiente:
    // riskWeight: evita zonas detectadas peligrosas
    // wallWeight: evita pegarse a paredes/esquinas
    const riskWeight = 0.35 + pr * 2.75;
    const wallWeight = 0.2 + pw * 1.6;

    return { riskWeight, wallWeight };
  }

  _hasClearSightToCell(x, z) {
    const dx = x + 0.5 - this.robot.position.x;
    const dz = z + 0.5 - this.robot.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.01) return true;

    const ang = rad2deg(Math.atan2(dx, dz));
    const sight = this.world.rayDistAdvanced(
      this.robot.position.x,
      this.robot.position.z,
      ang,
      6,
      14,
      4.2
    );

    return sight >= dist - 0.28;
  }

  _replan() {
    const cx = Math.round(this.robot.position.x);
    const cz = Math.round(this.robot.position.z);

    if (!this.goalCell) {
      this._setupMission();
    }

    const tuning = this._riskTuning();

    this.bfsPath = this.pathfinder.findPath(
      cx,
      cz,
      this.goalCell.x,
      this.goalCell.z,
      {
        riskMap: this.blockedRisk,
        riskWeight: tuning.riskWeight,
        wallWeight: tuning.wallWeight,
        visitedMap: this.visited,
        visitedWeight: 0.08,
      }
    );

    if (this.bfsPath.length === 0 && this.goalCell) {
      if (this.rechargeMode) {
        this.failedChargeStations.add(`${this.goalCell.x},${this.goalCell.z}`);
      } else {
        this.visited.add(`${this.goalCell.x},${this.goalCell.z}`);
      }
    }

    // Priorizar exploraciÃ³n agresiva de nuevas fronteras
    if (this.bfsPath.length === 0 || this.visited.size < CONFIG.GRID_SIZE * CONFIG.GRID_SIZE * 0.6) {
      this.bfsPath = this.pathfinder.findFrontier(
        cx,
        cz,
        this.visited,
        {
          riskMap: this.blockedRisk,
          riskWeight: Math.max(0.2, tuning.riskWeight * 0.6),
          wallWeight: Math.max(0.15, tuning.wallWeight * 0.5),
          visitedMap: this.visited,
          visitedWeight: 0.05,
        }
      );
    }

    if (this.bfsPath.length > 0) {
      this.bfsTarget =
        this.bfsPath[this.bfsPath.length - 1];
      set(
        'st-tg',
        this.goalCell
          ? `META (${this.goalCell.x},${this.goalCell.z})`
          : `(${this.bfsTarget.x},${this.bfsTarget.z})`
      );
      set('pi-txt', `RUTA A*: ${this.bfsPath.length} PASOS A META`);

      const d = $('pi-dot');
      if (d) {
        d.style.cssText =
          'background:#ffaa00;box-shadow:0 0 6px #ffaa00';
      }
    } else {
      this.bfsTarget = null;
      set('st-tg', this.rechargeMode ? 'ESCAPE A RECARGA' : 'SIN RUTA');
      set('pi-txt', this.rechargeMode ? 'ATRAPADO - BUSCANDO SALIDA PARA RECARGAR' : 'NO HAY RUTA A META â€” REINTENTANDO');

      const d = $('pi-dot');
      if (d) {
        if (this.rechargeMode) {
          d.style.cssText = 'background:#ff4466;box-shadow:0 0 6px #ff4466;animation:blink .4s infinite';
        } else {
          d.style.cssText = 'background:#00d4ff;box-shadow:0 0 6px #00d4ff';
        }
      }

      // En modo recarga atrapado, marcar estaciÃ³n como fallida e intentar otra
      if (this.rechargeMode) {
        const currentStation = this._getClosestChargeStation();
        if (currentStation) {
          this.failedChargeStations.add(`${currentStation.x},${currentStation.z}`);
        }
        
        // NO llamamos recursivamente a _goToChargeStation. Esto previene un
        // Max Call Stack Exceeded al forzar salidas iterativas y permitir
        // que el pathfinder escape y que _shouldRechargeNow trabaje sin loops bruscos.
        const nextStation = this._getClosestChargeStation(currentStation);
        if (nextStation) {
          this.voice.speakOnce('stuck', 12000);
          this.forceFwdTimer = 1.0;
          this.forceFwdAngle = this._bestOpenAngle();
          this.rechargeMode = false;
        } else {
          // Si no hay mÃ¡s estaciones, fuerza escape general
          this.forceFwdTimer = 2.5;
          this.forceFwdAngle = this._bestOpenAngle();
          this.stuckCnt = 0;
          this.voice.speakOnce('stuck', 12000);
          this.failedChargeStations.clear();
          this.rechargeMode = false;
        }
      } else {
        this.voice.speakOnce('stuck', 12000);
      }
    }
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // COLLISION & ESCAPE
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  _subStep(dx, dz) {
    const dist = Math.hypot(dx, dz);
    if (!dist) return false;

    const N = Math.ceil(dist / 0.05);
    const sdx = dx / N;
    const sdz = dz / N;
    let ok = false;

    for (let i = 0; i < N; i++) {
      const nx = this.robot.position.x + sdx;
      const nz = this.robot.position.z + sdz;

      if (this.world.canMoveTo(nx, nz)) {
        this.robot.position.x = nx;
        this.robot.position.z = nz;
        ok = true;
      } else {
        break;
      }
    }

    return ok;
  }

  _escape() {
    const wx = this.robot.position.x;
    const wz = this.robot.position.z;

    for (let r = 1; r <= CONFIG.ESCAPE_RADIUS; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.abs(dx) + Math.abs(dz) < r) continue;

          const tx = Math.round(wx) + dx + 0.5;
          const tz = Math.round(wz) + dz + 0.5;

          if (this.world.canMoveTo(tx, tz)) {
            this.robot.position.x = tx;
            this.robot.position.z = tz;
            this.stuckCnt = 0;
            this.bfsPath = [];
            this.consecutiveTurns = 0;
            this.oscillationCounter = 0;
            return;
          }
        }
      }
    }
  }

  _bestOpenAngle() {
    let bestA = this.robotAngle;
    let bestD = 0;

    for (let a = 0; a < 360; a += 18) {
      const d = this.world.rayDistAdvanced(
        this.robot.position.x,
        this.robot.position.z,
        a,
        5,
        18,
        6
      );

      if (d > bestD) {
        bestD = d;
        bestA = a;
      }
    }

    return bestA;
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // MOVEMENT ENGINE (Mejorado)
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  applyMovement(dt, curAct) {
    const W = this.world;
    const wx = this.robot.position.x;
    const wz = this.robot.position.z;

    // Check bounds
    if (!W.canMoveTo(wx, wz)) {
      this._escape();
      this.robot.position.y = 0;
      this.robot.rotation.y = deg2rad(this.robotAngle);
      return;
    }

    if (this.rechargeMode && !this.isCharging && this._atChargeStation()) {
      this.isCharging = true;
      this.chargeLevelReached = true;
      this.robotVel = 0;
      this.voice.speakContext('recharge', {
        battery: Math.round(this.battery),
      }, 15000);
    }

    // RECHARGE LOGIC
    if (this.isCharging) {
      this.robotVel = 0;
      this.battery = Math.min(100, this.battery + dt * 25);
      if (this.battery >= 90) {
         this.isCharging = false;
         this.chargeLevelReached = false;
         this.rechargeMode = false;
         this.voice.speakOnce('charged', 5000, {
           battery: Math.round(this.battery),
         });
         this.generateNewGoal(); // Resume mission
      }
      return; // Freeze movement while charging
    }

    // GREETING LOGIC
    if (this.isGreeting) {
      this.robotVel = 0;
      // Gently rotate to face the camera (-Math.PI/2 = -90 degrees approx)
      const targetFacing = -90; 
      let diff = angleDiff(this.robotAngle, targetFacing);
      if (Math.abs(diff) > 2) {
          this.robotAngle += Math.sign(diff) * CONFIG.TURN_SPEED * dt;
      }
      this.robot.position.y = 0;
      this.robot.rotation.y = deg2rad(this.robotAngle);
      return; // Freeze movement while greeting
    }

    // Update timers
    if (this.turnLockTimer > 0) {
      this.turnLockTimer = Math.max(0, this.turnLockTimer - dt);
    }

    if (this.forceFwdTimer > 0) {
      this.forceFwdTimer = Math.max(0, this.forceFwdTimer - dt);
    }

    if (this.replanCooldown > 0) {
      this.replanCooldown = Math.max(0, this.replanCooldown - dt);
    }

    if (this.rotationLock > 0) {
      this.rotationLock = Math.max(0, this.rotationLock - dt);
    }

    this.scanCooldown = Math.max(0, this.scanCooldown - dt);
    if (this.scanCooldown <= 0) {
      this._scanEnvironmentLocal();
      this.scanCooldown = this.scanInterval || 0.18;
    }

    const SPEED = CONFIG.SPEED;
    const TURN = CONFIG.TURN_SPEED;
    const SAFE_STOP = CONFIG.OBSTACLE_CLOSE + 0.06;

    // Forced forward escape (breaks rotation locks)
    if (this.forceFwdTimer > 0) {
      const r = deg2rad(this.forceFwdAngle);
      if (!this._subStep(Math.sin(r) * SPEED * dt, Math.cos(r) * SPEED * dt)) {
        this.robotAngle = this._bestOpenAngle();
        this.forceFwdAngle = this.robotAngle;
        this.stuckCnt++;
        if (this.stuckCnt > 20) {
          this._escape();
          this.stuckCnt = 0;
          this.forceFwdTimer = 0;
        }
      } else {
        this.robotVel = SPEED;
        this.stuckCnt = 0;
      }

      this.robot.position.y = 0;
      this.robot.rotation.y = deg2rad(this.robotAngle);
      this._markVisited();
      return;
    }

    if (curAct === 'detener') {
      // Battery empty
      this.robotVel = 0;
      this.robot.position.y = 0;
      this.robot.rotation.y = deg2rad(this.robotAngle);
      this._markVisited();
      return;
    }

    if (curAct === 'responder') {
      this.robotVel = 0;
      this.stuckCnt = 0;

    } else if (curAct === 'retroceder') {
      const r = deg2rad(this.robotAngle);
      if (
        !this._subStep(
          -Math.sin(r) * SPEED * 0.5 * dt,
          -Math.cos(r) * SPEED * 0.5 * dt
        )
      ) {
        this._escape();
      }

      this.robotAngle += (Math.random() < 0.5 ? 1 : -1) * 52 * dt;
      this.robotVel = -SPEED * 0.5;
      this.consecutiveTurns = 0;
      this.turnLockTimer = 0;

    } else if (curAct === 'avanzar' || curAct === 'explorar') {
      this.consecutiveTurns = 0;
      this.turnLockTimer = 0;

      let wp = curAct === 'avanzar' ? this._getWaypoint() : null;

      // Si en modo recarga sin waypoint, apunta directo a la estaciÃ³n
      if (this.rechargeMode && !wp) {
        const c = this._getChargeCell();
        if (c) { wp = { x: c.x, z: c.z }; }
      }

      if (wp) {
        const tgt = rad2deg(
          Math.atan2(
            (wp.x + 0.5) - wx,
            (wp.z + 0.5) - wz
          )
        );
        const diff = angleDiff(this.robotAngle, tgt);
        const absDiff = Math.abs(diff);

        if (absDiff > 6) {
          this.robotAngle += Math.sign(diff) * Math.min(
            TURN * dt,
            absDiff * 0.85
          );
        }

        const r = deg2rad(this.robotAngle);
        const alignFactor = clamp(1 - absDiff / 100, 0.35, 1);
        const moveSpeed = SPEED * alignFactor;
        const fwdSafe = W.rayDistAdvanced(
          this.robot.position.x,
          this.robot.position.z,
          this.robotAngle,
          3, // Reducido de 7 a 3 rayos para no asustarse de las paredes laterales al cruzar aberturas
          12, // Reducido el Ã¡ngulo de visiÃ³n perifÃ©rica de 24Â° a 12Â° para permitir el paso
          3.2
        );

        if (fwdSafe <= CONFIG.OBSTACLE_CLOSE) {
          this.robotVel = 0;
          this.stuckCnt++;
          this.robotAngle = this._bestOpenAngle();
          this.turnLockTimer = 0;
          this.forceFwdTimer = 0.28;
          this.forceFwdAngle = this.robotAngle;
          this._markVisited();
          return;
        }

        const advanceBoost = fwdSafe <= SAFE_STOP ? 0.6 : 1;

        // Si estÃ¡ muy desalineado, primero orienta y reciÃ©n avanza.
        if (absDiff > 42) {
          this.robotVel = 0;
          this._markVisited();
          return;
        }

        if (this._subStep(Math.sin(r) * moveSpeed * advanceBoost * dt, Math.cos(r) * moveSpeed * advanceBoost * dt)) {
          this.robotVel = moveSpeed;
          this.stuckCnt = 0;
        } else {
          this.robotVel = 0;
          this.stuckCnt++;

          if (this.stuckCnt === CONFIG.STUCK_THRESHOLD) {
            this.robotAngle = this._bestOpenAngle();
            this.bfsPath = [];
            this.stuckCnt = 0;
            this.voice.speakOnce('stuck', 10000);
          }

          if (this.stuckCnt > CONFIG.STUCK_ESCAPE_THRESHOLD) {
            this._escape();
            this.bfsPath = [];
          }
        }
      } else {
        const fwd = W.rayDistAdvanced(
          wx,
          wz,
          this.robotAngle,
          7,
          24,
          5
        );
        const r = deg2rad(this.robotAngle);

        if (fwd > CONFIG.CLEAR_DISTANCE) {
          this._subStep(Math.sin(r) * SPEED * 0.75 * dt, Math.cos(r) * SPEED * 0.75 * dt);
        } else {
          this.robotAngle = this._bestOpenAngle();
        }
      }

    } else {
      // Turning with anti-oscillation
      if (this.turnLockTimer <= 0) {
        this.turnLockDir =
          curAct === 'girar-izq' ? -1 : 1;

        // Check for oscillation
        if (this._isOscillating()) {
          this.robotAngle = this._bestOpenAngle();
          this.turnLockTimer = 0;
          this.consecutiveTurns = 0;
          this.forceFwdTimer = CONFIG.FORCED_FWD_DURATION;
          this.forceFwdAngle = this.robotAngle;
          this.actionHistory = [];
          this.robotVel = 0;
          this.rotationLock = 0.8;
          this.robot.position.y = 0;
          this.robot.rotation.y = deg2rad(this.robotAngle);
          return;
        }

        this.turnLockTimer =
          CONFIG.TURN_LOCK_DURATION +
          Math.random() * CONFIG.TURN_LOCK_VARIANCE;
        this.consecutiveTurns++;

        if (this.consecutiveTurns >= 3) {
          this._escape();
          this.bfsPath = [];
          this.consecutiveTurns = 0;
          this.forceFwdTimer = CONFIG.FORCED_FWD_DURATION * 1.2;
          this.forceFwdAngle = this.robotAngle;
          this.actionHistory = [];
          this.voice.speakOnce('stuck', 8000);
        }
      }

      this.robotAngle += this.turnLockDir * TURN * dt;

      // Micro-avance controlado para evitar girar sobre el mismo punto.
      const fwdDist = W.rayDistAdvanced(
        wx,
        wz,
        this.robotAngle,
        5,
        18,
        3.2
      );
      if (fwdDist > 0.95) {
        const rr = deg2rad(this.robotAngle);
        if (
          this._subStep(
            Math.sin(rr) * SPEED * 0.35 * dt,
            Math.cos(rr) * SPEED * 0.35 * dt
          )
        ) {
          this.robotVel = SPEED * 0.35;
        } else {
          this.robotVel = 0;
        }
      } else {
        this.robotVel = 0;
      }
    }

    this.robotAngle = normalizeAngle(this.robotAngle);
    this.robot.position.y = 0;
    this.robot.rotation.y = deg2rad(this.robotAngle);
    this._markVisited();
    this._updateLocomotionStability(dt);

    // Replanning
    if (
      this.bfsPath.length === 0 &&
      this.autoMode &&
      this.replanCooldown <= 0
    ) {
      this.replanCooldown = 1.5;
      this._replan();
    }
  }

  _markVisited() {
    const cx = Math.round(this.robot.position.x);
    const cz = Math.round(this.robot.position.z);

    if (this.world.isWalkable(cx, cz)) {
      this.visited.add(`${cx},${cz}`);
    }
  }

  _getWaypoint() {
    if (!this.bfsPath || this.bfsPath.length === 0) {
      return null;
    }

    const wx = this.robot.position.x;
    const wz = this.robot.position.z;

    while (this.bfsPath.length > 0) {
      const wp = this.bfsPath[0];

      if (distance(wx, wz, wp.x + 0.5, wp.z + 0.5) < 0.75) {
        this.bfsPath.shift();
      } else {
        break;
      }
    }

    if (this.bfsPath.length === 0) {
      return null;
    }

    let chosenIndex = 0;
    const lookahead = Math.min(5, this.bfsPath.length - 1);

    for (let i = lookahead; i >= 1; i--) {
      const candidate = this.bfsPath[i];
      if (candidate && this._hasClearSightToCell(candidate.x, candidate.z)) {
        chosenIndex = i;
        break;
      }
    }

    if (chosenIndex > 0) {
      this.bfsPath.splice(0, chosenIndex);
    }

    return this.bfsPath.length > 0 ? this.bfsPath[0] : null;
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // AI DECISION MAKING
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  decide() {
    if (this.autoMode) {
      const totalWalkable = this.world.countWalkable();
      if (totalWalkable > 0) {
        const coverage = (this.visited.size / totalWalkable) * 100;
        if (coverage >= 92) {
          this.autoMode = false;
          set('pi-txt', 'MISIÃ“N: ÃREA 100% CUBIERTA, FINALIZANDO');
          set('st-tg', '100% COBERTURA');
          if (this.voice) {
            this.voice.speakOnce('explore_done', 0);
            setTimeout(() => this.voice.toggle(false), 3000);
          }
          const d = $('pi-dot');
          if (d) d.style.cssText = 'background:#00ff88;box-shadow:0 0 8px #00ff88';
          return 'detener';
        }
      }
    }

    const luz = +$('s-luz').value / 100;
    const son = +$('s-son').value / 100;
    const dis = +$('s-dis').value / 100;
    const tmp = +$('s-tmp').value / 100;
    const bat = Math.round(this.battery) / 100;

    const wx = this.robot.position.x;
    const wz = this.robot.position.z;

    const fwd = this.world.rayDistAdvanced(
      wx,
      wz,
      this.robotAngle,
      5,
      16,
      5
    );
    const fwdAdv = this.world.rayDistAdvanced(
      wx,
      wz,
      this.robotAngle,
      7,
      26,
      6
    );

    // RED NEURONAL TENSORFLOW.JS â€” Obtener predicciones
    this.lastNN = this.nn.forward([
      luz,
      son,
      Math.min(dis, fwdAdv / 5),
      tmp,
      bat,
    ]);

    // Extraer salidas de la red neuronal
    const nnOutputs = this.lastNN.outputs;
    const confidence = this.lastNN.confidence;
    
    const [
      nnAvanzar,    // index 0
      nnGirarIzq,   // index 1
      nnGirarDer,   // index 2
      nnRetroceder, // index 3
      nnExplorar,   // index 4
      nnResponder,  // index 5
    ] = nnOutputs;

    let act = 'avanzar';
    let nnWeight = 0;  // Peso de influencia de NN

    if (this._hasReachedGoal()) {
      if (this.roundTripMode && this.startCell && this.goalCell) {
        const prevGoal = { ...this.goalCell };
        this.goalCell = { ...this.startCell };
        this.startCell = prevGoal;
        this.missionComplete = false;
        this.bfsPath = [];
        this.replanCooldown = 0;
        set('pi-txt', `IDA/VUELTA: NUEVA META (${this.goalCell.x},${this.goalCell.z})`);
        this._replan();
        this._recordAction('avanzar');
        return 'avanzar';
      }

      if (!this.missionComplete) {
        this.missionComplete = true;
        set('pi-txt', 'META ALCANZADA - BUSCANDO NUEVO OBJETIVO');
        set('st-tg', this.goalCell ? `OK (${this.goalCell.x},${this.goalCell.z})` : 'OK');
        const d = $('pi-dot');
        if (d) {
          d.style.cssText = 'background:#00ff88;box-shadow:0 0 8px #00ff88';
        }
        this.voice.speakOnce('explore_done', 30000);
        
        setTimeout(() => {
          if (this.missionComplete) this.voice.toggle(false);
        }, 8000);
        
        // Continuar explorando generando nueva meta basada en A* para no estancarse
        this.generateNewGoal();
        this._recordAction('avanzar');
        return 'avanzar';
      }
    }

    if (!this.rechargeMode && this._shouldRechargeNow()) {
      this.voice.speakContext('lowbat', {
        battery: Math.round(this.battery),
        x: Math.round(this.robot.position.x),
        z: Math.round(this.robot.position.z),
      }, 18000);
      this._goToChargeStation();
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // JERARQUÃA DE DECISIONES CON NN
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    // 1. EMERGENCIA: BaterÃ­a crÃ­tica
    if (bat <= 0.02) {
      act = 'detener';
    }
    // 2. SEGURIDAD CRÃTICA: Priorizar siempre evitar choque, incluso si quiere cargar
    else if (fwdAdv < CONFIG.OBSTACLE_CLOSE) {
      act = 'retroceder';
      nnWeight = Math.max(nnRetroceder, 0.3);
      this.evaded++;
      this.forceFwdTimer = 0; // Cancelar avance forzado si chocamos
      this.voice.speakOnce('retroceder', 9000);
    }
    // 3. BATERÃA BAJA: Ir directo a recargar (PRIORIDAD MEDIA-ALTA)
    else if (this.rechargeMode || (!this.rechargeMode && this._shouldRechargeNow())) {
      if (!this.rechargeMode) {
        this.voice.speakContext('lowbat', {
          battery: Math.round(this.battery),
          x: Math.round(this.robot.position.x),
          z: Math.round(this.robot.position.z),
        }, 18000);
        this._goToChargeStation();
      }
      act = 'avanzar';
      nnWeight = Math.max(nnAvanzar, 0.5);
    }
    // 4. EVASIÃ“N COORDINADA: ObstÃ¡culo cercano pero no crÃ­tico
    else if (fwdAdv < CONFIG.OBSTACLE_NEAR) {
      // Si casi chocamos, retroceder siempre es prioritario
      if (fwdAdv < CONFIG.OBSTACLE_NEAR - 0.3 || this.consecutiveTurns >= 3) {
        act = 'retroceder';
        nnWeight = Math.max(nnRetroceder, 0.35);
      } else if (this.bfsPath.length > 0 && fwdAdv > CONFIG.OBSTACLE_CLOSE + 0.25) {
        act = 'avanzar';
        nnWeight = Math.max(nnAvanzar, 0.3);
      } else {
        act = null; // Will evaluate turns
      }

      // Evaluar giros si no estamos avanzando
      if (act !== 'avanzar') {
        const lS =
          this.world.rayDist(wx, wz, this.robotAngle - 70, 4) +
          this.world.rayDist(wx, wz, this.robotAngle - 100, 4);
        const rS =
          this.world.rayDist(wx, wz, this.robotAngle + 70, 4) +
          this.world.rayDist(wx, wz, this.robotAngle + 100, 4);

        // Si hay bloqueo rotacional persistente, salir agresivamente
        if (this.rotationLock > 0.4 || this.consecutiveTurns >= 3) {
          if (fwdAdv > 0.85) {
            act = 'avanzar';
            nnWeight = Math.max(nnAvanzar, 0.4);
          } else {
            act = 'retroceder';
            nnWeight = Math.max(nnRetroceder, 0.45);
            this.forceFwdTimer = 1.5; // Fuerza escape rÃ¡pido
          }
        }
        // Aplicar influencia neural
        else if (nnGirarIzq > nnGirarDer * 1.3 && lS > 0.85) {
          act = 'girar-izq';
          nnWeight = nnGirarIzq;
        } else if (nnGirarDer > nnGirarIzq * 1.3 && rS > 0.85) {
          act = 'girar-der';
          nnWeight = nnGirarDer;
        } else {
          // Fallback a raycast - preferir el lado mÃ¡s despejado
          act = lS > rS ? 'girar-izq' : 'girar-der';
          nnWeight = Math.max(nnGirarIzq, nnGirarDer);
        }
      }

      this.evaded++;
      this.voice.speakOnce('girar', 9000);
    } 
    // 5. COMUNICACIÃ“N INTELIGENTE: Audio detectado + NN alta confianza
    else if (son > 0.78 && fwdAdv > 2 && nnResponder > 0.35) {
      act = 'responder';
      nnWeight = nnResponder;
      this.voice.speakOnce('responder', 12000);
    } 
    // 4.2 RECARGA PRIORITARIA: ir directo a la estaciÃ³n central
    else if (this.rechargeMode) {
      act = 'avanzar';
      nnWeight = Math.max(nnAvanzar, 0.35);
    }
    // 4.5 MISIÃ“N SECUNDARIA: Investigar anomalÃ­as en el mapa (Sin perder ruta A*)
    else if ((tmp > 0.8 || luz < 0.25) && fwdAdv > 1.5 && nnExplorar > 0.25) {
      act = 'explorar';
      nnWeight = nnExplorar;
      this.voice.speakOnce('explorar', 15000);
    }
    // 5. NAVEGACIÃ“N BASADA EN RUTA
    else if (this.bfsPath.length > 0) {
      act = 'avanzar';
      nnWeight = nnAvanzar;
      this.voice.speakOnce('avanzar', 14000);
    } 
    // 8. EXPLORACIÃ“N ADAPTATIVA
    else {
      // Decidir entre exploraciÃ³n vs permanencia basado en NN
      if (nnExplorar > nnAvanzar && confidence > 0.4) {
        act = 'explorar';
        nnWeight = nnExplorar;
        this.voice.speakOnce('explorar', 14000);
      } else {
        act = 'avanzar';
        nnWeight = Math.max(nnAvanzar, 0.2);
      }
    }

    // LÃ³gica de baterÃ­a baja
    if (bat < 0.22) {
      this.voice.speakOnce('lowbat', 18000);
    }

    // RetroalimentaciÃ³n de progreso
    if (this.steps > 0 && this.steps % 90 === 0) {
      this.voice.speakOnce('progress', 32000);
    }

    // Evento de obstÃ¡culos evitados
    if (this.evaded > 0 && this.evaded % 8 === 0) {
      this.voice.speakOnce('obstacle', 22000);
    }

    this.steps++;
    this._recordAction(act);

    // Drenaje de baterÃ­a adaptativo segÃºn la acciÃ³n
    if (this.autoMode) {
      const dragMultiplier = (act === 'girar-izq' || act === 'girar-der') ? 1.2 : 1.0;
      this.battery = Math.max(0, this.battery - CONFIG.BATTERY_DRAIN_RATE * dragMultiplier);
    }

    return act;
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // STATE MANAGEMENT
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  setPerformanceMode(mode = 'alta') {
    this.performanceMode = mode === 'baja' ? 'baja' : 'alta';
    const low = this.performanceMode === 'baja';

    // Reducimos la densidad de escaneo en baja calidad para ahorrar CPU
    this.scanInterval = low ? 0.46 : 0.24;
    this.scanAngleStep = low ? 18 : 10;
    this.scanRayCount = low ? 1 : 2;
    this.scanRayWidth = low ? 0 : 8;
    this.scanRayMax = low ? 4.3 : 5.1;
    this.scanCooldown = Math.min(this.scanCooldown, 0.06);
  }

  reset() {
    this.isCharging = false;
    const sp = this.world.findSafeSpawn();

    this.robot.position.set(sp.x, 0, sp.z);
    this.robotAngle = 0;
    this.battery = 90;
    this.steps = 0;
    this.evaded = 0;
    this.stuckCnt = 0;
    this.visited.clear();
    this.bfsPath = [];
    this.bfsTarget = null;
    this.turnLockTimer = 0;
    this.consecutiveTurns = 0;
    this.forceFwdTimer = 0;
    this.replanCooldown = 0;
    this.actionHistory = [];
    this.oscillationCounter = 0;
    this.rotationLock = 0;
    this.startCell = null;
    this.goalCell = null;
    this.missionComplete = false;
    this.chargeLevelReached = false;
    this.rechargeMode = false;
    this.scanCooldown = 0;
    this.stableTurnTime = 0;
    this.lastPos = { x: this.robot.position.x, z: this.robot.position.z };
    this.scannedWalkable.clear();
    this.scannedBlocked.clear();
    this.blockedRisk.clear();
    this._scanEnvironmentGlobal();
    this._setupMission();
  }
}
