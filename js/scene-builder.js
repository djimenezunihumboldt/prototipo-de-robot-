/**
 * T-800 IA Neural v3 â€” ConstrucciÃ³n de escena 3D
 */

import * as THREE from 'three';
import { CONFIG } from './utils.js';

export class SceneBuilder {
  constructor(scene) {
    this.scene = scene;
  }

  mat(hex, r = 0.3, m = 0.6, ec = null, ei = 0) {
    const mat = new THREE.MeshStandardMaterial({
      color: hex,
      roughness: r,
      metalness: m,
    });

    if (ec != null) {
      mat.emissive = new THREE.Color(ec);
      mat.emissiveIntensity = ei;
    }

    return mat;
  }

  box(w, h, d, m) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    r.castShadow = true;
    return r;
  }

  sph(r, m, s = 12) {
    const o = new THREE.Mesh(new THREE.SphereGeometry(r, s, s), m);
    o.castShadow = true;
    return o;
  }

  cyl(rt, rb, h, m, s = 10) {
    const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, s), m);
    o.castShadow = true;
    return o;
  }

  _createTextTexture(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    // Fondo transparente o semi
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillRect(0, 0, 128, 64);
    
    // Texto
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 32);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    return texture;
  }

  _createTextSprite(text, scale = 1.5) {
    const texture = this._createTextTexture(text);
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(scale, scale / 2, 1);
    return sprite;
  }

  buildLights() {
    const sc = this.scene;

    sc.add(new THREE.AmbientLight(0x1a2840, 0.9));

    const sun = new THREE.DirectionalLight(0xc0d8ff, 1.1);
    sun.position.set(12, 24, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -32;
    sun.shadow.camera.right = 32;
    sun.shadow.camera.bottom = -32;
    sun.shadow.camera.top = 32;
    sun.shadow.camera.far = 80;
    sun.shadow.bias = -0.0003;
    sc.add(sun);

    const f1 = new THREE.PointLight(0x4090ff, 2.0, 24);
    f1.position.set(-8, 6, 6);
    sc.add(f1);

    const f2 = new THREE.PointLight(0xff8020, 0.9, 20);
    f2.position.set(8, 5, -8);
    sc.add(f2);

    const f3 = new THREE.PointLight(0x00d4ff, 0.6, 16);
    f3.position.set(0, 8, 0);
    sc.add(f3);

    return { f1, f2, f3 };
  }

  buildFloor(world) {
    const sc = this.scene;
    const GS = 26;

    const mA = this.mat(0x181e2a, 0.9, 0.08);
    const mB = this.mat(0x121620, 0.92, 0.06);
    const mG = this.mat(0xc07010, 0.3, 0, 0xd07800, 0.12);
    
    const tG = new THREE.BoxGeometry(0.98, 0.06, 0.98);
    const gG = new THREE.BoxGeometry(0.98, 0.007, 0.98);

    let countA = 0, countB = 0, countG = 0;
    for (let x = 0; x < GS; x++) {
      for (let z = 0; z < GS; z++) {
        if ((x + z) % 2 === 0) countA++; else countB++;
        if (!world.has(x, z) && (x * 7 + z * 5) % 11 === 0) countG++;
      }
    }

    const instA = new THREE.InstancedMesh(tG, mA, countA);
    const instB = new THREE.InstancedMesh(tG, mB, countB);
    const instG = new THREE.InstancedMesh(gG, mG, countG);
    
    instA.receiveShadow = true;
    instB.receiveShadow = true;

    const dummy = new THREE.Object3D();
    let idxA = 0, idxB = 0, idxG = 0;

    for (let x = 0; x < GS; x++) {
      for (let z = 0; z < GS; z++) {
        dummy.position.set(x, 0, z);
        dummy.updateMatrix();

        if ((x + z) % 2 === 0) {
          instA.setMatrixAt(idxA++, dummy.matrix);
        } else {
          instB.setMatrixAt(idxB++, dummy.matrix);
        }

        if (!world.has(x, z) && (x * 7 + z * 5) % 11 === 0) {
          dummy.position.set(x, 0.032, z);
          dummy.updateMatrix();
          instG.setMatrixAt(idxG++, dummy.matrix);
        }
      }
    }

    sc.add(instA);
    sc.add(instB);
    if (countG > 0) sc.add(instG);

    const grid = new THREE.GridHelper(GS, GS, 0x1a3050, 0x0e2038);
    grid.position.set(GS / 2 - 0.5, 0.04, GS / 2 - 0.5);
    grid.material.transparent = true;
    grid.material.opacity = 0.45;
    sc.add(grid);
  }

  buildWalls(world) {
    const sc = this.scene;

    const mW = this.mat(0x1e2a3c, 0.45, 0.6);
    const mWarn = this.mat(0xcc2200, 0.25, 0.05, 0xdd1100, 0.2);
    const mMetal = this.mat(0x2a3a50, 0.3, 0.8);
    const mAcc = this.mat(0x00aaff, 0.1, 0, 0x0088ff, 0.7);

    const boxGeo = new THREE.BoxGeometry(1, 1, 1);

    const wallCount = world.wallList.length;
    let strCount = 0;
    let accCount = 0;

    world.wallList.forEach(([x, z]) => {
      const seed = (x * 31 + z * 17) % 7;
      const h = 0.6 + seed * 0.2;
      if (h > 0.85) strCount++;
      if (seed % 3 === 0) accCount++;
    });

    const bodyInst = new THREE.InstancedMesh(boxGeo, mW, wallCount);
    const capInst = new THREE.InstancedMesh(boxGeo, mMetal, wallCount);
    
    bodyInst.castShadow = true;
    bodyInst.receiveShadow = true;

    let strInst = null;
    if (strCount > 0) strInst = new THREE.InstancedMesh(boxGeo, mWarn, strCount);
    
    let accInst = null;
    if (accCount > 0) accInst = new THREE.InstancedMesh(boxGeo, mAcc, accCount);

    const dummy = new THREE.Object3D();
    let idxWall = 0;
    let idxStr = 0;
    let idxAcc = 0;
    let wallNumber = 0;

    world.wallList.forEach(([x, z]) => {
      const seed = (x * 31 + z * 17) % 7;
      const h = 0.6 + seed * 0.2;

      // Body
      dummy.position.set(x, h, z);
      dummy.scale.set(0.94, h * 2, 0.94);
      dummy.updateMatrix();
      bodyInst.setMatrixAt(idxWall, dummy.matrix);

      // Cap
      dummy.position.set(x, h * 2 + 0.03, z);
      dummy.scale.set(0.94, 0.06, 0.94);
      dummy.updateMatrix();
      capInst.setMatrixAt(idxWall, dummy.matrix);
      
      // Etiqueta de texto grande
      const label = this._createTextSprite(`${x},${z}`, 1.2);
      label.position.set(x, h * 2 + 0.5, z);
      sc.add(label);
      
      idxWall++;

      // Str
      if (h > 0.85) {
        dummy.position.set(x, h * 0.55, z);
        dummy.scale.set(0.94, 0.07, 0.94);
        dummy.updateMatrix();
        strInst.setMatrixAt(idxStr++, dummy.matrix);
      }

      // Acc
      if (seed % 3 === 0) {
        dummy.position.set(x, h * 0.8, z);
        dummy.scale.set(0.96, 0.03, 0.96);
        dummy.updateMatrix();
        accInst.setMatrixAt(idxAcc++, dummy.matrix);
      }
    });

    sc.add(bodyInst);
    sc.add(capInst);
    if (strInst) sc.add(strInst);
    if (accInst) sc.add(accInst);
  }

  buildChargeStation() {
    // Generar todas las estaciones dinÃ¡micamente desde la configuraciÃ³n
    CONFIG.CHARGE_STATIONS.forEach(station => {
      this._buildChargeStationAt(station.x + 0.5, station.z + 0.5);
    });
  }

  _buildChargeStationAt(cx, cz) {
    // Base de la estaciÃ³n
    const baseMat = this.mat(0x002244, 0.8, 0.4);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.1, 16), baseMat);
    base.position.set(cx, 0.05, cz);
    this.scene.add(base);

    // Anillo de luz
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.6 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.05, 8, 24), ringMat);
    ring.position.set(cx, 0.12, cz);
    ring.rotation.x = Math.PI / 2;
    this.scene.add(ring);

    // Pilar hologrÃ¡fico central
    const holoMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.2 });
    const holo = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.5, 16), holoMat);
    holo.position.set(cx, 0.75, cz);
    this.scene.add(holo);

    const cxI = Math.floor(cx); const czI = Math.floor(cz);
    const label = this._createTextSprite('CARGA '+cxI+','+czI, 2.0);
    label.position.set(cx, 1.8, cz);
    label.material.color.setHex(0x00ffaa);
    this.scene.add(label);

    // Luz ambiental
    const light = new THREE.PointLight(0x00ff88, 2, 5);
    light.position.set(cx, 1.5, cz);
    this.scene.add(light);
  }

  buildPathPool(count = 70) {
    const sc = this.scene;
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00aaff,
      transparent: true,
      opacity: 0,
    });

    const pool = [];

    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.07, 0.03, 8),
        mat.clone()
      );
      m.visible = false;
      sc.add(m);
      pool.push(m);
    }

    return pool;
  }

  buildTrailPool(count = 60) {
    const sc = this.scene;
    const pool = [];
    const mats = [];

    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xff9900,
        transparent: true,
        opacity: 0,
      });
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 5, 5),
        mat
      );
      m.visible = false;
      sc.add(m);
      pool.push(m);
      mats.push(mat);
    }

    return { pool, mats };
  }
}

