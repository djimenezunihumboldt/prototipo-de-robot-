/**
 * T-800 IA Neural v3 — Constructor del robot 3D
 * Endoesqueleto de cobre con detalles detallados
 */

import * as THREE from 'three';

export class RobotBuilder {
  constructor(sb) {
    this.sb = sb;
  }

  _m(c, r = 0.3, m = 0.6, ec = null, ei = 0) {
    return this.sb.mat(c, r, m, ec, ei);
  }

  build() {
    const { box, sph, cyl } = this.sb;
    const root = new THREE.Group();
    const P = {};

    // Palette (white / pastel gray metallic)
    const mBody = this._m(0xffffff, 0.4, 0.15);
    const mBodyL = this._m(0xffffff, 0.35, 0.1);
    const mBodyD = this._m(0xe0e6ed, 0.5, 0.2);
    const mJoint = this._m(0x778899, 0.6, 0.4);
    const mPipe = this._m(0x8899aa, 0.4, 0.5);
    const mBone = this._m(0xeeeeee, 0.3, 0.1);
    const mEye = this._m(0x00ccff, 0.02, 0, 0x00aaff, 7.0);
    const mLED = (c) => this._m(c, 0.05, 0, c, 4.0);
    const LED_C = [
      0x00ccff,
      0x00aaff,
      0x00ffcc,
      0x00d4ff,
      0xffaa00,
      0xff5500,
    ];

    // Hips
    P.hipsG = new THREE.Group();
    P.hipsG.position.y = 0.58;
    P.hipsG.add(box(0.58, 0.18, 0.38, mBody));

    [-1, 1].forEach((s) => {
      const hb = box(0.12, 0.22, 0.14, mBodyL);
      hb.position.set(s * 0.27, -0.04, 0);
      P.hipsG.add(hb);

      const pipe = cyl(0.024, 0.024, 0.18, mPipe);
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(s * 0.18, 0.08, 0);
      P.hipsG.add(pipe);
    });

    root.add(P.hipsG);

    // Spine
    P.spineG = new THREE.Group();
    P.spineG.position.y = 0.58;

    for (let i = 0; i < 5; i++) {
      const v = box(0.16, 0.11, 0.12, i % 2 === 0 ? mBody : mBodyD);
      v.position.y = i * 0.14;
      P.spineG.add(v);

      if (i < 4) {
        const j = box(0.06, 0.04, 0.06, mJoint);
        j.position.y = i * 0.14 + 0.08;
        P.spineG.add(j);
      }
    }

    [-1, 1].forEach((s) => {
      for (let i = 0; i < 4; i++) {
        const rib = box(0.3, 0.04, 0.22, mBodyL);
        rib.position.set(s * 0.22, 0.06 + i * 0.14, 0);
        rib.rotation.z = s * 0.14;
        P.spineG.add(rib);
      }
    });

    root.add(P.spineG);

    // Torso
    P.torsoG = new THREE.Group();
    P.torsoG.position.y = 0.98;
    P.torsoG.add(box(0.72, 0.9, 0.5, mBody));

    const chTop = box(0.68, 0.12, 0.48, mBodyL);
    chTop.position.y = 0.42;
    P.torsoG.add(chTop);

    [-1, 1].forEach((s) => {
      const sp2 = box(0.08, 0.9, 0.5, mBodyD);
      sp2.position.set(s * 0.4, 0, 0);
      P.torsoG.add(sp2);

      const hl = cyl(0.02, 0.02, 0.52, mPipe);
      hl.position.set(s * 0.32, -0.04, 0.14);
      P.torsoG.add(hl);

      for (let j = 0; j < 5; j++) {
        const v = box(0.014, 0.04, 0.3, this._m(
          0x00aaff,
          0.08,
          0,
          0x0088ff,
          0.5
        ));
        v.position.set(s * 0.4, 0.16 - j * 0.1, 0);
        P.torsoG.add(v);
      }
    });

    const cp = box(0.44, 0.48, 0.016, mBodyD);
    cp.position.set(0, 0.04, 0.26);
    P.torsoG.add(cp);

    P.leds = [];
    [
      [-0.09, 0.18, 0],
      [0, 0.18, 1],
      [0.09, 0.18, 2],
      [-0.09, 0.04, 3],
      [0, 0.04, 4],
      [0.09, 0.04, 5],
    ].forEach(([lx, ly, i]) => {
      const led = box(0.05, 0.035, 0.015, mLED(LED_C[i]));
      led.position.set(lx, ly, 0.272);
      P.torsoG.add(led);
      P.leds.push(led);
    });

    root.add(P.torsoG);

    // Head
    P.headG = new THREE.Group();
    P.headG.position.y = 1.92;

    const nk = cyl(0.09, 0.11, 0.24, mBody);
    nk.position.y = -0.09;
    P.headG.add(nk);

    [-1, 1].forEach((s) => {
      const p = cyl(0.021, 0.021, 0.26, mPipe);
      p.position.set(s * 0.06, -0.08, 0.07);
      P.headG.add(p);
    });

    P.headPivot = new THREE.Group();
    P.headG.add(P.headPivot);

    const hMain = box(0.64, 0.56, 0.58, mBody);
    hMain.position.y = 0.15;
    P.headPivot.add(hMain);

    const hBrow = box(0.66, 0.1, 0.56, mBodyD);
    hBrow.position.set(0, 0.42, 0);
    P.headPivot.add(hBrow);

    const hTop = box(0.62, 0.06, 0.52, mBodyL);
    hTop.position.set(0, 0.47, 0);
    P.headPivot.add(hTop);

    const fPlate = box(0.54, 0.4, 0.014, mBodyD);
    fPlate.position.set(0, 0.14, 0.31);
    P.headPivot.add(fPlate);

    // Eyes
    P.eyeL = sph(0.09, mEye);
    P.eyeL.position.set(-0.175, 0.24, 0.3);
    P.eyeR = sph(0.09, mEye);
    P.eyeR.position.set(0.175, 0.24, 0.3);
    P.headPivot.add(P.eyeL, P.eyeR);

    const el = new THREE.PointLight(0x00aaff, 2.2, 2.6);
    el.position.set(-0.175, 0.24, 0.3);
    P.headPivot.add(el);

    const er = new THREE.PointLight(0x00aaff, 2.2, 2.6);
    er.position.set(0.175, 0.24, 0.3);
    P.headPivot.add(er);

    P.eyeLights = [el, er];

    // Mouth
    P.mouthBars = [];
    for (let i = 0; i < 5; i++) {
      const mb = box(0.052, 0.04, 0.013, this._m(
        0x00aaff,
        0.05,
        0,
        0x0088ff,
        1.8
      ));
      mb.position.set(-0.08 + i * 0.04, 0.04, 0.312);
      P.headPivot.add(mb);
      P.mouthBars.push(mb);
    }

    // Antenna
    const aPole = cyl(0.016, 0.02, 0.4, mJoint);
    aPole.position.y = 0.62;
    P.headPivot.add(aPole);

    P.antBall = sph(0.075, this._m(0xffaa00, 0.06, 0, 0xffaa00, 5.0));
    P.antBall.position.y = 0.84;
    P.headPivot.add(P.antBall);

    P.antLight = new THREE.PointLight(0xffaa00, 1.2, 1.6);
    P.antLight.position.y = 0.84;
    P.headPivot.add(P.antLight);

    root.add(P.headG);

    // Arms
    const mkArm = (s) => {
      const ag = new THREE.Group();
      ag.position.set(s * 0.46, 1.56, 0);
      ag.add(sph(0.1, mJoint));

      const ug = new THREE.Group();
      ug.position.y = -0.09;

      const ua = box(0.14, 0.46, 0.14, mBody);
      ua.position.y = -0.19;
      ug.add(ua);

      const eg = new THREE.Group();
      eg.position.y = -0.44;
      eg.add(sph(0.08, mJoint));

      const la = box(0.12, 0.42, 0.12, mBodyL);
      la.position.y = -0.22;
      eg.add(la);

      const wr = box(0.18, 0.08, 0.16, mJoint);
      wr.position.y = -0.48;
      eg.add(wr);

      const ha = box(0.16, 0.1, 0.14, mBodyD);
      ha.position.y = -0.58;
      eg.add(ha);

      ug.add(eg);
      ag.add(ug);

      return { group: ag, upper: ug, elbow: eg };
    };

    const la = mkArm(-1);
    const ra = mkArm(1);
    root.add(la.group, ra.group);
    P.lArm = la;
    P.rArm = ra;

    // Legs
    const mkLeg = (s) => {
      const lg = new THREE.Group();
      lg.position.set(s * 0.25, 0.6, 0);
      lg.add(sph(0.12, mJoint));

      const ug = new THREE.Group();
      ug.position.y = -0.09;

      const ul = box(0.2, 0.52, 0.2, mBody);
      ul.position.y = -0.22;
      ug.add(ul);

      const kg = new THREE.Group();
      kg.position.y = -0.5;
      kg.add(sph(0.1, mJoint));

      const kp = box(0.18, 0.14, 0.12, mBodyD);
      kp.position.set(0, 0, 0.07);
      kg.add(kp);

      const ll = box(0.17, 0.5, 0.17, mBodyL);
      ll.position.y = -0.27;
      kg.add(ll);

      const ank = box(0.22, 0.1, 0.2, mJoint);
      ank.position.y = -0.58;
      kg.add(ank);

      const foot = box(0.28, 0.1, 0.5, mBody);
      foot.position.set(0, -0.7, 0.1);
      kg.add(foot);

      const heel = box(0.22, 0.08, 0.12, mBodyD);
      heel.position.set(0, -0.68, -0.14);
      kg.add(heel);

      ug.add(kg);
      lg.add(ug);

      return { group: lg, upper: ug, knee: kg };
    };

    const ll = mkLeg(-1);
    const rl = mkLeg(1);
    root.add(ll.group, rl.group);
    P.lLeg = ll;
    P.rLeg = rl;

    P.glow = new THREE.PointLight(0x00aaff, 1.5, 6);
    P.glow.position.y = 1.0;
    root.add(P.glow);

    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 20),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.45,
      })
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.03;
    root.add(blob);

    P.themeMaterials = {
      mBody,
      mBodyL,
      mBodyD,
      mJoint,
      mPipe,
      mBone,
    };

    return { root, P };
  }
}
