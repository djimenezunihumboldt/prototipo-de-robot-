/**
 * T-800 IA Neural v3 — Simulación principal
 * Renderización, loops y coordinación central
 */

import * as THREE from 'three';
import {
  CONFIG,
  $,
  set,
  clamp,
  lerp,
  deg2rad,
  rad2deg,
  normalizeAngle,
} from './utils.js';
import { SceneBuilder } from './scene-builder.js';

export class Simulation {
  constructor(scene, camera, renderer, world, pathfinder, robot, robotController, nn, voice, pathPool, trailPool, trailMats) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.world = world;
    this.pathfinder = pathfinder;
    this.robot = robot;
    this.robotController = robotController;
    this.nn = nn;
    this.voice = voice;
    this.pathPool = pathPool;
    this.trailPool = trailPool;
    this.trailMats = trailMats;

    this.camTarget = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.trailIdx = 0;
    this.trailT = 0;

    this.autoMode = false;
    this.autoInt = null;
    this.lastT = 0;
    this.aiTimer = 0;

    this.rayGrp = null;
    this.rayLines = [];
    this.rayMats = [];
    this.rayAngs = CONFIG.RAY_ANGLES;

    this.fillLights = {};
    this.rP = null;
    this.currentPreset = 'BAL';
    this.startMarker = null;
    this.goalMarker = null;
    this.hasAnnouncedStart = false;
    this.startupAnnounced = false;
    this.scanOverlayGroup = null;
    this.scanOverlayMap = new Map();
    this.scanBlockedGroup = null;
    this.scanBlockedMap = new Map();
    this.scanOverlayEnabled = true;
    this.scanOverlayCooldown = 0;
    this.currentRobotPalette = 'PERLA';
    this.neutralAccentColor = 0x8fe7ff;
    this.performanceMode = 'alta';
    this.rayUpdateTimer = 0;
    this.pathDrawTimer = 0;
    this.nnDrawTimer = 0;
    this.hudTimer = 0;
    this.rayUpdateInterval = 0.05;
    this.pathDrawInterval = 0.12;
    this.nnDrawInterval = 0.18;
    this.hudInterval = 0.1;
    this.trailSpawnInterval = 0.2;
    this.trailFadeStep = 0.011;
    this.trailEnabled = true;
    this.scanOverlayInterval = 0.16;
    this.scanOverlayBeforeLow = null;

    this.nc = $('nc');
    this.nx2 = this.nc.getContext('2d');

    this._setupUI();
    this._setupRays();
    this._setupMissionMarkers();
    this._setupScanOverlay();
    this.robotController.setPerformanceMode(this.performanceMode);
  }

  _setupScanOverlay() {
    if (this.scanOverlayGroup) {
      this.scene.remove(this.scanOverlayGroup);
    }
    if (this.scanBlockedGroup) {
      this.scene.remove(this.scanBlockedGroup);
    }

    this.scanOverlayGroup = new THREE.Group();
    this.scanOverlayGroup.position.y = 0.045;
    this.scene.add(this.scanOverlayGroup);
    this.scanOverlayMap.clear();

    this.scanBlockedGroup = new THREE.Group();
    this.scanBlockedGroup.position.y = 0.05;
    this.scene.add(this.scanBlockedGroup);
    this.scanBlockedMap.clear();

    const GS = CONFIG.GRID_SIZE;
    const geo = new THREE.CircleGeometry(0.29, 14);
    geo.rotateX(-Math.PI / 2);

    for (let x = 1; x < GS - 1; x++) {
      for (let z = 1; z < GS - 1; z++) {
        if (!this.world.isWalkable(x, z)) continue;

        const mat = new THREE.MeshBasicMaterial({
          color: 0x005588,
          transparent: true,
          opacity: 0.08,
          depthWrite: false,
        });
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x + 0.5, 0, z + 0.5);
        m.visible = true;
        this.scanOverlayGroup.add(m);
        this.scanOverlayMap.set(`${x},${z}`, m);
      }
    }
  }

  _ensureBlockedMarker(k) {
    if (this.scanBlockedMap.has(k)) return;

    const [x, z] = k.split(',').map(Number);
    const geo = new THREE.RingGeometry(0.12, 0.28, 12);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff3355,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x + 0.5, 0.001, z + 0.5);
    m.visible = false;
    this.scanBlockedGroup.add(m);
    this.scanBlockedMap.set(k, m);
  }

  _updateScanOverlay(dt) {
    this.scanOverlayCooldown = Math.max(0, this.scanOverlayCooldown - dt);
    if (this.scanOverlayCooldown > 0) return;
    this.scanOverlayCooldown = this.scanOverlayInterval;

    if (!this.scanOverlayGroup || !this.scanBlockedGroup) return;
    this.scanOverlayGroup.visible = this.scanOverlayEnabled;
    this.scanBlockedGroup.visible = this.scanOverlayEnabled;
    if (!this.scanOverlayEnabled) return;

    const scanned = this.robotController.scannedWalkable || new Set();
    const blocked = this.robotController.scannedBlocked || new Set();
    const blockedRisk = this.robotController.blockedRisk || new Map();
    const visited = this.robotController.visited || new Set();

    for (const [k, mesh] of this.scanOverlayMap) {
      const isScanned = scanned.has(k);
      const isVisited = visited.has(k);
      const stillWalkable = this.world.isWalkable(...k.split(',').map(Number));

      if (!stillWalkable) {
        mesh.visible = false;
        continue;
      }

      mesh.visible = true;
      if (isVisited) {
        mesh.material.opacity = 0.65;
        mesh.material.color.setHex(0x00d4ff);
      } else if (isScanned) {
        mesh.material.opacity = 0.35;
        mesh.material.color.setHex(0x00aaff);
      } else {
        mesh.material.opacity = 0.08;
        mesh.material.color.setHex(0x005588);
      }
    }

    for (const k of blocked) {
      this._ensureBlockedMarker(k);
    }

    for (const [k, mesh] of this.scanBlockedMap) {
      const isBlocked = blocked.has(k);
      if (!isBlocked) {
        mesh.visible = false;
        continue;
      }

      const risk = Math.max(0, Math.min(1, blockedRisk.get(k) || 0.5));
      mesh.visible = true;
      mesh.material.opacity = 0.2 + risk * 0.65;

      // Gradiente rojo: más riesgo -> más rojo brillante.
      const low = new THREE.Color(0xaa2244);
      const high = new THREE.Color(0xff3355);
      mesh.material.color.copy(low).lerp(high, risk);
    }
  }

  _setupMissionMarkers() {
    if (this.startMarker) this.scene.remove(this.startMarker);
    if (this.goalMarker) this.scene.remove(this.goalMarker);

    const start = this.robotController.startCell;
    const goal = this.robotController.goalCell;
    if (!start || !goal) return;

    const sGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.08, 24);
    const sMat = new THREE.MeshBasicMaterial({
      color: 0x00aaff,
      transparent: true,
      opacity: 0.9,
    });
    this.startMarker = new THREE.Mesh(sGeo, sMat);
    this.startMarker.position.set(start.x + 0.5, 0.08, start.z + 0.5);
    this.scene.add(this.startMarker);

    const gGeo = new THREE.ConeGeometry(0.35, 0.9, 24);
    const gMat = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.95,
    });
    this.goalMarker = new THREE.Mesh(gGeo, gMat);
    this.goalMarker.position.set(goal.x + 0.5, 0.5, goal.z + 0.5);
    this.scene.add(this.goalMarker);
  }

  _setupUI() {
    document.querySelectorAll('input[type=range]').forEach((el) => {
      el.addEventListener('input', () => this._syncUI());
    });

    ['s-risk', 's-wall'].forEach((id) => {
      const slider = $(id);
      if (!slider) return;
      slider.addEventListener('input', () => {
        if (this.autoMode) {
          this.robotController.replanCooldown = 0;
          this.robotController._replan();
        }
      });
    });

    window.addEventListener('keydown', (e) => {
      if (this.autoMode) return;
      const map = {
        ArrowUp: 'avanzar',
        w: 'avanzar',
        ArrowDown: 'retroceder',
        s: 'retroceder',
        ArrowLeft: 'girar-izq',
        a: 'girar-izq',
        ArrowRight: 'girar-der',
        d: 'girar-der',
      };

      if (map[e.key]) {
        const curAct = map[e.key];
        this.robotController.steps++;
        this.robotController._recordAction(curAct);
      }

      if (e.key === ' ') {
        e.preventDefault();
        this.toggleAuto();
      }
    });
  }

  _setupRays() {
    this.rayGrp = new THREE.Group();
    this.scene.add(this.rayGrp);

    this.rayMats = this.rayAngs.map(
      () =>
        new THREE.LineBasicMaterial({
          color: 0x00ff88,
          transparent: true,
          opacity: 0.55,
        })
    );

    this.rayLines = this.rayAngs.map((a, i) => {
      const positions = new Float32Array([0, 0, 0, 0, 0, 4]);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const l = new THREE.Line(g, this.rayMats[i]);
      this.rayGrp.add(l);
      return l;
    });
  }

  _updateRays() {
    const wx = this.robot.position.x;
    const wz = this.robot.position.z;

    this.rayGrp.position.set(wx, 1.0, wz);

    this.rayAngs.forEach((a, i) => {
      const d = this.world.rayDist(
        wx,
        wz,
        this.robotController.robotAngle + a,
        5.5
      );
      const rad = deg2rad(this.robotController.robotAngle + a);
      const px = Math.sin(rad) * d;
      const pz = Math.cos(rad) * d;
      const pos = this.rayLines[i].geometry.getAttribute('position');

      pos.array[3] = px;
      pos.array[4] = 0;
      pos.array[5] = pz;
      pos.needsUpdate = true;

      this.rayMats[i].color.setHex(
        d < 1.1 ? 0xff3300 : d < 2.5 ? 0xffaa00 : 0x00ff88
      );
      this.rayMats[i].opacity =
        d < 1.1 ? 0.9 : d < 2.5 ? 0.62 : 0.35;
    });
  }

  _updateTrail(dt) {
    if (!this.trailEnabled) return;

    this.trailT += dt;

    if (
      this.trailT > this.trailSpawnInterval &&
      ['avanzar', 'explorar'].includes(this.robotController.curAct)
    ) {
      const m = this.trailPool[this.trailIdx % 60];
      m.position.set(this.robot.position.x, 0.11, this.robot.position.z);
      m.visible = true;
      this.trailMats[this.trailIdx % 60].opacity = 0.65;
      this.trailIdx++;
      this.trailT = 0;
    }

    this.trailMats.forEach((mat) => {
      if (mat.opacity > 0) {
        mat.opacity = Math.max(0, mat.opacity - this.trailFadeStep);
      }
    });
  }

  _drawPath() {
    const path = this.robotController.bfsPath || [];
    const max = this.pathPool.length;
    const low = this.performanceMode === 'baja';

    for (let i = 0; i < max; i++) {
      const m = this.pathPool[i];
      if (i < path.length && (!low || i % 2 === 0)) {
        const p = path[i];
        m.visible = true;
        m.position.set(p.x + 0.5, 0.12, p.z + 0.5);
        m.material.opacity = Math.max(0.2, 0.95 - i * 0.02);
      } else {
        m.visible = false;
      }
    }
  }

  _updateCamera(dt) {
    // Smooth follow camera with improved stability
    const r = deg2rad(this.robotController.robotAngle);
    const greetingCam = this.isWaving || this.robotController.isGreeting;
    const targetDist = greetingCam ? -5.8 : 8.5;
    const targetHeight = greetingCam ? 5.5 : 7.5;

    this.camTarget.set(
      this.robot.position.x - Math.sin(r) * targetDist,
      targetHeight,
      this.robot.position.z - Math.cos(r) * targetDist
    );

    // Lerp speed based on distance
    const camDist = this.camera.position.distanceTo(this.camTarget);
    const lerpSpeed = clamp(camDist * 0.02, 0.02, 0.1);

    this.camera.position.lerp(this.camTarget, lerpSpeed);

    this.camLook.set(
      this.robot.position.x,
      this.robot.position.y + 1.5,
      this.robot.position.z
    );

    this.camera.lookAt(this.camLook);
  }

  _drawNN() {
    if (document.hidden || !this.robotController.lastNN || !this.nc.width) return;

    const { nx2: ctx, nc } = this;
    const cw = nc.width;
    const ch = nc.height;

    ctx.clearRect(0, 0, cw, ch);

    // Obtener capas disponibles (manejo dinámico para ambas arquitecturas)
    const lastNN = this.robotController.lastNN;
    const layers = [
      lastNN.inputs || [],
      lastNN.h1 || [],
      lastNN.h2 || [],
      lastNN.h3 || [],
      lastNN.h4 || [],
      lastNN.outputs || [],
    ].filter(l => l && l.length > 0); // Filtrar capas vacías

    // Si no hay capas, salir
    if (layers.length === 0) return;

    const LC = ['#00d4ff', '#00aaff', '#ffaa00', '#00ffaa', '#ff6600', '#00ff88'];
    const px = 14;
    const py = 10;
    const uw = cw - px * 2;
    const uh = ch - py * 2 - 14;

    const lx = layers.map(
      (_, i) => px + (uw * i) / Math.max(1, layers.length - 1)
    );
    const pos = layers.map((l, li) =>
      l.map((_, ni) => ({
        x: lx[li],
        y: py + (uh * (ni + 1)) / (l.length + 1),
      }))
    );

    // Draw edges
    for (let li = 0; li < layers.length - 1; li++) {
      pos[li].forEach((f, fi) => {
        pos[li + 1].forEach((t, ti) => {
          const s = Math.abs(
            (layers[li][fi] || 0) * (layers[li + 1][ti] || 0)
          );
          ctx.beginPath();
          ctx.moveTo(f.x + 7, f.y);
          ctx.lineTo(t.x - 7, t.y);
          ctx.strokeStyle =
            s > 0.25
              ? `rgba(0,180,255,${0.06 + s * 0.5})`
              : `rgba(0,100,180,${0.04 + s * 0.12})`;
          ctx.lineWidth = 0.5 + s * 2;
          ctx.stroke();
        });
      });
    }

    // Draw nodes
    layers.forEach((layer, li) => {
      pos[li].forEach((p, ni) => {
        const a = clamp(layer[ni] || 0, 0, 1);
        const r = li === 0 || li === layers.length - 1 ? 8 : 7;

        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = '#040810';
        ctx.fill();

        if (a > 0.02) {
          ctx.beginPath();
          ctx.arc(
            p.x,
            p.y,
            r,
            -Math.PI / 2,
            -Math.PI / 2 + Math.PI * 2 * a
          );
          ctx.lineTo(p.x, p.y);
          ctx.fillStyle = LC[li % LC.length] + 'cc';
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = LC[li % LC.length];
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = '#0a3050';
        ctx.font = '5px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(a.toFixed(1), p.x, p.y + r + 7);
      });
    });

    // Etiquetas dinámicas para capas
    const layerLabels = ['ENT', 'H1', 'H2', 'H3', 'H4', 'SAL'];
    layers.forEach((_, li) => {
      const label = layerLabels[li] || `L${li}`;
      ctx.fillStyle = '#0a3050';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(label, lx[li], ch - 2);
    });
  }

  _syncUI() {
    ['luz', 'son', 'dis', 'tmp', 'risk', 'wall'].forEach((id) => {
      const s = $('s-' + id);
      const v = $('v-' + id);
      if (s && v) v.textContent = s.value;
    });

    const vb = $('v-bat');
    if (vb) vb.textContent = Math.round(this.robotController.battery);

    const sb = $('s-bat');
    if (sb) sb.value = Math.round(this.robotController.battery);
  }

  _updateHUD() {
    const ACTS = [
      'avanzar',
      'girar-izq',
      'girar-der',
      'retroceder',
      'explorar',
      'responder',
    ];

    ACTS.forEach((a, i) => {
      const row = $('act-' + a);
      const ap = $('ap-' + a);

      if (!row) return;

      row.className =
        'ar' + (a === this.robotController.curAct ? ' on' : '');

      if (ap) {
        ap.textContent =
          a === this.robotController.curAct && this.robotController.lastNN
            ? (this.robotController.lastNN.outputs[i] * 100).toFixed(0) + '%'
            : '—';
      }
    });

    set('st-ac', (this.robotController.curAct || 'avanzar').toUpperCase());
    set('st-pr', this.currentPreset);
    const stPr = $('st-pr');
    if (stPr) {
      const presetColor =
        this.currentPreset === 'DIR'
          ? '#ffaa00'
          : this.currentPreset === 'SEG'
          ? '#00ff88'
          : '#00d4ff';

      stPr.style.color = presetColor;
      stPr.style.textShadow = `0 0 8px ${presetColor}, 0 0 16px ${presetColor}66`;
      stPr.style.fontWeight = '800';
      stPr.style.letterSpacing = '.06em';
    }
    set(
      'st-an',
      Math.round(normalizeAngle(this.robotController.robotAngle)) + '°'
    );
    set('st-ev', this.robotController.evaded);
    set('st-st', this.robotController.steps);

    const bf = $('bf');
    if (bf) {
      bf.style.width = Math.round(this.robotController.battery) + '%';
      bf.style.background =
        this.robotController.battery > 50
          ? '#00ff88'
          : this.robotController.battery > 20
          ? '#ffaa00'
          : '#ff4466';
    }

    const totalWalk = this.world.countWalkable();
    const scanned = this.robotController.scannedWalkable
      ? this.robotController.scannedWalkable.size
      : this.robotController.visited.size;
    const pct =
      totalWalk > 0
        ? Math.min(
            100,
            Math.round((scanned / totalWalk) * 100)
          )
        : 0;

    set('st-ex', pct + '%');
  }

  announceStartup() {
    if (this.startupAnnounced) return;
    this.startupAnnounced = true;

    this.voice.toggle(true, false);
    this.isWaving = true;
    this.robotController.isGreeting = true;
    this.hasAnnouncedStart = true;

    this.voice.speakOnce('start', 999999);

    setTimeout(() => {
      this.isWaving = false;
      this.robotController.isGreeting = false;
    }, 4500); // Saludo breve en vez de los 24s originales
  }

  toggleAuto() {
    this.autoMode = !this.autoMode;
    const b = $('btn-auto');

    if (this.autoMode) {
      if (b) {
        b.textContent = '⏸ PAUSAR';
        b.classList.add('on');
      }

      this.robotController.autoMode = true;
      this.robotController._replan();

      this.autoInt = setInterval(() => {
        ['luz', 'son', 'tmp'].forEach((id) => {
          const s = $('s-' + id);
          if (s) {
            s.value = clamp(
              +s.value + (Math.random() - 0.5) * 6,
              0,
              100
            );
          }
        });

        const ds = $('s-dis');
        if (ds) {
          ds.value = clamp(
            +ds.value + (Math.random() - 0.5) * 10,
            0,
            100
          );
        }

        this.robotController.curAct =
          this.robotController.decide();
      }, CONFIG.AI_THINK_INTERVAL);

      this.robotController.curAct = this.robotController.decide();

    } else {
      if (b) {
        b.textContent = '▶ PLAY';
        b.classList.remove('on');
      }

      clearInterval(this.autoInt);
      this.robotController.curAct = 'avanzar';
      this.robotController.autoMode = false;

      if (this.voice.enabled) {
        this.voice.speak('Pausando el sistema. Quedando en modo de espera.');
      }
    }
  }

  newGoal() {
    this.robotController.generateNewGoal();
    this._setupMissionMarkers();
    this._drawPath();

    if (this.voice.enabled) {
      this.voice.speak('Nueva meta asignada. Recalculando ruta.');
    }
  }

  toggleRoundTrip() {
    this.robotController.setRoundTrip(!this.robotController.roundTripMode);
    const b = $('btn-roundtrip');
    if (b) {
      if (this.robotController.roundTripMode) {
        b.textContent = '⇄ IDA/VTA ON';
        b.classList.add('on');
      } else {
        b.textContent = '⇄ IDA/VTA OFF';
        b.classList.remove('on');
      }
    }
  }

  toggleScanOverlay() {
    this.scanOverlayEnabled = !this.scanOverlayEnabled;
    const b = $('btn-scan');
    if (b) {
      if (this.scanOverlayEnabled) {
        b.textContent = '🗺 SCAN ON';
        b.classList.add('on');
      } else {
        b.textContent = '🗺 SCAN OFF';
        b.classList.remove('on');
      }
    }
  }

  applyRobotPalette(mode = 'perla', silent = false) {
    if (!this.rP || !this.rP.themeMaterials) return;

    const palettes = {
      perla: {
        label: 'PERLA',
        button: 'PALETA: PERLA',
        body: 0xffffff,
        bodyL: 0xffffff,
        bodyD: 0xe0e6ed,
        joint: 0x778899,
        pipe: 0x8899aa,
        bone: 0xeeeeee,
        led: 0x8fe7ff,
        ledEmissive: 0x5fdcff,
        mouth: 0x6ddfff,
        neutralGlow: 0x7adfff,
        roughness: 0.4,
        metalness: 0.15,
      },
      titanio: {
        label: 'TITANIO',
        button: 'PALETA: TITANIO',
        body: 0xcfdce8,
        bodyL: 0xe1ebf4,
        bodyD: 0xb5c4d3,
        joint: 0x93a2b3,
        pipe: 0xabbcd0,
        bone: 0xd3e0ec,
        led: 0x6bc8ff,
        ledEmissive: 0x3faeff,
        mouth: 0x52b8ff,
        neutralGlow: 0x66c2ff,
        roughness: 0.35,
        metalness: 0.4,
      },
    };

    const key = palettes[mode] ? mode : 'perla';
    const p = palettes[key];
    const mats = this.rP.themeMaterials;

    mats.mBody.color.setHex(p.body);
    mats.mBody.roughness = p.roughness;
    mats.mBody.metalness = p.metalness;

    mats.mBodyL.color.setHex(p.bodyL);
    mats.mBodyL.roughness = p.roughness * 0.8;
    mats.mBodyL.metalness = p.metalness * 0.8;

    mats.mBodyD.color.setHex(p.bodyD);
    mats.mBodyD.roughness = p.roughness * 1.2;
    mats.mBodyD.metalness = p.metalness * 1.2;

    mats.mJoint.color.setHex(p.joint);
    mats.mPipe.color.setHex(p.pipe);
    mats.mBone.color.setHex(p.bone);

    if (this.rP.leds && this.rP.leds.length) {
      this.rP.leds.forEach((led) => {
        led.material.color.setHex(p.led);
        led.material.emissive.setHex(p.ledEmissive);
      });
    }

    if (this.rP.mouthBars && this.rP.mouthBars.length) {
      this.rP.mouthBars.forEach((mb) => {
        mb.material.color.setHex(p.mouth);
        mb.material.emissive.setHex(p.ledEmissive);
      });
    }

    this.currentRobotPalette = p.label;
    this.neutralAccentColor = p.neutralGlow;

    const b = $('btn-palette');
    if (b) {
      b.textContent = p.button;
      b.classList.toggle('on', key === 'titanio');
    }

    if (!silent && this.voice.enabled) {
      this.voice.speak(`Paleta ${p.label} aplicada.`);
    }
  }

  toggleRobotPalette() {
    const next = this.currentRobotPalette === 'PERLA' ? 'titanio' : 'perla';
    this.applyRobotPalette(next);
  }

  applyAStarPreset(mode, silent = false) {
    const presets = {
      directo: { risk: 28, wall: 22, text: 'A* DIRECTO' },
      balance: { risk: 70, wall: 65, text: 'A* BALANCEADO' },
      seguro: { risk: 92, wall: 88, text: 'A* SEGURO' },
    };

    const p = presets[mode] || presets.balance;
    const labels = {
      directo: 'DIR',
      balance: 'BAL',
      seguro: 'SEG',
    };
    const safeMode = presets[mode] ? mode : 'balance';
    this.currentPreset = labels[safeMode] || 'BAL';

    const sr = $('s-risk');
    const sw = $('s-wall');
    if (sr) sr.value = p.risk;
    if (sw) sw.value = p.wall;
    this._syncUI();

    const ids = [
      'btn-preset-directo',
      'btn-preset-balance',
      'btn-preset-seguro',
    ];
    ids.forEach((id) => {
      const b = $(id);
      if (!b) return;
      b.classList.toggle('on', id === `btn-preset-${safeMode}`);
    });

    this.robotController.replanCooldown = 0;
    this.robotController._replan();

    if (!silent && this.voice.enabled) {
      this.voice.speak(`Preset ${p.text} aplicado.`);
    }
  }

  setPerformanceMode(mode = 'alta', silent = false) {
    this.performanceMode = mode === 'baja' ? 'baja' : 'alta';
    const low = this.performanceMode === 'baja';
    CONFIG.PERF_LEVEL = low ? 'low' : 'high';

    this.rayUpdateInterval = low ? 0.15 : 0.07;
    this.pathDrawInterval = low ? 0.28 : 0.14;
    this.nnDrawInterval = low ? 0.42 : 0.22;
    this.hudInterval = low ? 0.22 : 0.12;
    this.trailSpawnInterval = low ? 0.34 : 0.2;
    this.trailFadeStep = low ? 0.02 : 0.011;
    this.trailEnabled = true; // Mantener siempre rastro en baja y alta
    this.scanOverlayInterval = low ? 0.4 : 0.16;

    // Mantener los rayos siempre visibles
    if (this.rayGrp) {
      this.rayGrp.visible = true; 
    }

    // Mantener la visual de la Red Neuronal
    if (this.nc) {
      this.nc.style.display = 'block';
    }

    const pnn = $('pnn');
    if (pnn) {
      pnn.style.display = 'block';
    }

    // Gestionamos que el modo scan no se ponga false por defecto si estamos en modo baja calidad.
    // Simplemente se mantiene tal como el usuario lo haya definido.
    const bs = $('btn-scan');
    if (bs) {
      bs.textContent = this.scanOverlayEnabled ? '🗺 SCAN ON' : '🗺 SCAN OFF';
      bs.classList.toggle('on', this.scanOverlayEnabled);
    }

    if (this.robotController && this.robotController.setPerformanceMode) {
      this.robotController.setPerformanceMode(this.performanceMode);
    }
  }

  addWall() {
    const GS = CONFIG.GRID_SIZE;
    const x = 2 + Math.floor(Math.random() * (GS - 4));
    const z = 2 + Math.floor(Math.random() * (GS - 4));

    if (this.world.has(x, z)) return;

    this.world.add(x, z);

    const k = `${x},${z}`;
    if (this.robotController.scannedWalkable) {
      this.robotController.scannedWalkable.delete(k);
    }
    if (this.robotController.visited) {
      this.robotController.visited.delete(k);
    }
    if (this.robotController.scannedBlocked) {
      this.robotController.scannedBlocked.add(k);
    }
    if (this.robotController.blockedRisk) {
      this.robotController.blockedRisk.set(k, 1);
    }

    if (this.scanOverlayMap.has(k)) {
      const mesh = this.scanOverlayMap.get(k);
      this.scanOverlayGroup.remove(mesh);
      this.scanOverlayMap.delete(k);
    }
    this._ensureBlockedMarker(k);

    const h = 0.6 + Math.random() * 0.4;

    // Materials
    const mW = new THREE.MeshStandardMaterial({
      color: 0x1e2a3c,
      roughness: 0.45,
      metalness: 0.6,
    });
    const mMetal = new THREE.MeshStandardMaterial({
      color: 0x2a3a50,
      roughness: 0.3,
      metalness: 0.8,
    });

    // Body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.94, h * 2, 0.94),
      mW
    );
    body.position.set(x, h, z);
    body.castShadow = true;
    body.receiveShadow = true;
    this.scene.add(body);

    // Cap
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(0.94, 0.06, 0.94),
      mMetal
    );
    cap.position.set(x, h * 2 + 0.03, z);
    this.scene.add(cap);

    this.addedObstacles = this.addedObstacles || [];
    this.addedObstacles.push({ x, z, body, cap });
  }

  removeWall(silent = false) {
    if (!this.addedObstacles || this.addedObstacles.length === 0) return;

    const last = this.addedObstacles.pop();
    this.world.remove(last.x, last.z);
    this.scene.remove(last.body);
    this.scene.remove(last.cap);

    const k = `${last.x},${last.z}`;
    if (this.robotController.scannedBlocked) {
      this.robotController.scannedBlocked.delete(k);
    }
    if (this.robotController.blockedRisk) {
      this.robotController.blockedRisk.delete(k);
    }
    if (this.scanBlockedMap.has(k)) {
      const mesh = this.scanBlockedMap.get(k);
      mesh.visible = false;
    }

    if (!silent) {
      this.robotController.replanCooldown = 0;
      this.robotController._replan();

      if (this.voice.enabled) {
        this.voice.speak('Obstáculo removido. Ajustando ruta.');
      }
    }
  }

  reset() {
    clearInterval(this.autoInt);
    this.autoMode = false;

    const b = $('btn-auto');
    if (b) {
      b.textContent = '▶ AUTO';
      b.classList.remove('on');
    }

    const br = $('btn-roundtrip');
    if (br) {
      br.textContent = '⇄ IDA/VTA OFF';
      br.classList.remove('on');
    }

    const bs = $('btn-scan');
    if (bs) {
      bs.textContent = '🗺 SCAN ON';
      bs.classList.add('on');
    }
    this.scanOverlayEnabled = true;
    this.hasAnnouncedStart = false;

    if (this.addedObstacles) {
      while (this.addedObstacles.length > 0) {
        this.removeWall(true);
      }
    }

    this.robotController.reset();
    this.robotController.curAct = 'avanzar';
    this._setupMissionMarkers();

    this.trailPool.forEach((m, i) => {
      m.visible = false;
      this.trailMats[i].opacity = 0;
    });

    this.pathPool.forEach((m) => (m.visible = false));

    $('s-bat').value = 90;
    $('s-luz').value = 70;
    $('s-son').value = 12;
    $('s-dis').value = 90;
    $('s-tmp').value = 35;
    this.applyAStarPreset('balance', true);

    this._syncUI();
    this._updateHUD();

    if (this.voice.enabled) {
      this.voice.speak(this.voice.pick('reset'));
    }

    if (this.voice.clearCooldown) {
      this.voice.clearCooldown('start');
    }

    setTimeout(() => {
      this.toggleAuto();
    }, 400);
  }

  loop(ts) {
    const t = ts * 0.001;
    const dt = Math.min(t - this.lastT, 0.05);
    this.lastT = t;

    if (!this.autoMode) {
      this.aiTimer += dt;
      if (this.aiTimer > (CONFIG.AI_THINK_INTERVAL / 1000)) {
        this.aiTimer = 0;
        this.robotController.curAct =
          this.robotController.decide();
      }
    }

    this.robotController.applyMovement(dt, this.robotController.curAct);
    this.rayUpdateTimer += dt;
    this.pathDrawTimer += dt;
    this.nnDrawTimer += dt;
    this.hudTimer += dt;

    // Animación de Saludo y Caminata
    if (this.isWaving && this.rP) {
      if (this.rP.rArm) {
        this.rP.rArm.group.rotation.x = Math.sin(t * 8) * 0.3 - 0.4; 
        this.rP.rArm.group.rotation.z = Math.PI / 2; 
        this.rP.rArm.elbow.rotation.x = Math.sin(t * 8 + 1) * 0.4 - 0.4;
      }
      if (this.rP.headPivot) {
        this.rP.headPivot.rotation.x = Math.sin(t * 2) * 0.1;
      }
    } else if (this.rP) {
      const speed = this.robotController.robotVel || 0;
      if (Math.abs(speed) > 0.01) {
        const walkT = t * 12;
        const walkBounce = Math.abs(Math.sin(walkT)) * 0.08;
        const hipRotation = Math.sin(walkT) * 0.15;
        
        if (this.rP.robot) this.rP.robot.position.y = 0.03 + walkBounce;
        if (this.rP.hipsG) this.rP.hipsG.rotation.z = hipRotation;
        
        if (this.rP.lArm) this.rP.lArm.group.rotation.x = Math.sin(walkT) * 0.55;
        if (this.rP.rArm) {
          this.rP.rArm.group.rotation.x = Math.sin(walkT + Math.PI) * 0.55;
          this.rP.rArm.group.rotation.z = 0;
          this.rP.rArm.elbow.rotation.x = Math.cos(walkT) * 0.3;
        }
        if (this.rP.lLeg) {
          this.rP.lLeg.upper.rotation.x = Math.sin(walkT + Math.PI) * 0.65;
          if (this.rP.lLeg.knee) this.rP.lLeg.knee.rotation.x = Math.cos(walkT + Math.PI) * 0.4;
        }
        if (this.rP.rLeg) {
          this.rP.rLeg.upper.rotation.x = Math.sin(walkT) * 0.65;
          if (this.rP.rLeg.knee) this.rP.rLeg.knee.rotation.x = Math.cos(walkT) * 0.4;
        }
        if (this.rP.headPivot) this.rP.headPivot.rotation.x = Math.sin(walkT * 0.5) * 0.05;
      } else {
        if (this.rP.robot) this.rP.robot.position.y = 0.03;
        if (this.rP.hipsG) this.rP.hipsG.rotation.z = 0;
        if (this.rP.lArm) this.rP.lArm.group.rotation.x = 0;
        if (this.rP.rArm) {
          this.rP.rArm.group.rotation.x = 0;
          this.rP.rArm.group.rotation.z = 0;
          this.rP.rArm.elbow.rotation.x = 0;
        }
        if (this.rP.lLeg) {
          this.rP.lLeg.upper.rotation.x = 0;
          if (this.rP.lLeg.knee) this.rP.lLeg.knee.rotation.x = 0;
        }
        if (this.rP.rLeg) {
          this.rP.rLeg.upper.rotation.x = 0;
          if (this.rP.rLeg.knee) this.rP.rLeg.knee.rotation.x = 0;
        }
      }
    }

    this._updateCamera(dt);
    if (this.rayUpdateTimer >= this.rayUpdateInterval) {
      this.rayUpdateTimer = 0;
      this._updateRays();
    }
    this._updateTrail(dt);
    this._updateScanOverlay(dt);
    if (this.pathDrawTimer >= this.pathDrawInterval) {
      this.pathDrawTimer = 0;
      this._drawPath();
    }
    if (this.nnDrawTimer >= this.nnDrawInterval) {
      this.nnDrawTimer = 0;
      this._drawNN();
    }
    if (this.hudTimer >= this.hudInterval) {
      this.hudTimer = 0;
      this._syncUI();
      this._updateHUD();
    }

    this.renderer.render(this.scene, this.camera);
  }
}
