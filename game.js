/**
 * game.js - SKY STRIKE: mission-based jet combat with lock-on, bombing, and audio.
 * Requires three.js (r128) and GLTFLoader loaded before this script.
 * Requires audio.js (SkyAudio) loaded before this script.
 */
(function (global) {
  "use strict";

  /* ============================================================ RENDERER */
  const wrap = document.getElementById("canvasWrap");
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  wrap.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x9fd0e8, 320, 3200);

  const camera = new THREE.PerspectiveCamera(
    62,
    window.innerWidth / window.innerHeight,
    0.1,
    8000
  );
  camera.position.set(0, 8, -16);

  window.addEventListener("resize", function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  /* ============================================================ LIGHTING */
  const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x2b3a24, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.7);
  sun.position.set(700, 1000, -400);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -500;
  sun.shadow.camera.right = 500;
  sun.shadow.camera.top = 500;
  sun.shadow.camera.bottom = -500;
  sun.shadow.camera.near = 100;
  sun.shadow.camera.far = 2500;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  /* ============================================================ SKY DOME */
  const skyGeo = new THREE.SphereGeometry(3500, 32, 20);
  const topC = new THREE.Color(0x1b4f8a),
    botC = new THREE.Color(0xc8e6f5);
  {
    const pos = skyGeo.attributes.position;
    const cols = [];
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = THREE.MathUtils.clamp((y + 500) / 3000, 0, 1);
      const c = botC.clone().lerp(topC, t);
      cols.push(c.r, c.g, c.b);
    }
    skyGeo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  }
  const skyMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  /* ---- sun sprite for visual ---- */
  function makeGlowTexture(inner, outer) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const x = c.getContext("2d");
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, inner);
    g.addColorStop(0.3, outer);
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  const sunSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture("rgba(255,250,220,0.9)", "rgba(255,220,160,0.3)"),
      transparent: true,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
    })
  );
  sunSprite.scale.set(320, 320, 1);
  sunSprite.position.copy(sun.position).clampLength(0, 2600);
  scene.add(sunSprite);

  /* ============================================================ CLOUDS */
  function makeCloudTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const x = c.getContext("2d");
    for (let i = 0; i < 6; i++) {
      const cx = 60 + Math.random() * 136;
      const cy = 60 + Math.random() * 136;
      const r = 30 + Math.random() * 50;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, "rgba(255,255,255,0.6)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      x.fillStyle = g;
      x.fillRect(0, 0, 256, 256);
    }
    return new THREE.CanvasTexture(c);
  }
  const cloudTex = makeCloudTexture();
  const cloudMat = new THREE.SpriteMaterial({
    map: cloudTex,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    fog: true,
  });
  const clouds = [];
  for (let i = 0; i < 110; i++) {
    const s = new THREE.Sprite(cloudMat);
    const ang = Math.random() * Math.PI * 2;
    const rad = 250 + Math.random() * 2200;
    s.position.set(Math.cos(ang) * rad, 60 + Math.random() * 520, Math.sin(ang) * rad);
    const sc = 120 + Math.random() * 240;
    s.scale.set(sc, sc * 0.5, 1);
    scene.add(s);
    clouds.push(s);
  }

  /* ---- soft dot texture for particles ---- */
  const dotTex = (function () {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d");
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.4, "rgba(255,255,255,0.7)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();

  /* ============================================================ GROUND */
  function makeGroundTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const x = c.getContext("2d");
    x.fillStyle = "#3c5a34";
    x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 1100; i++) {
      x.fillStyle =
        "rgba(" +
        (20 + Math.random() * 40) +
        "," +
        (60 + Math.random() * 50) +
        "," +
        (20 + Math.random() * 30) +
        ",0.5)";
      const px = Math.random() * 512;
      const py = Math.random() * 512;
      const r = 4 + Math.random() * 22;
      x.beginPath();
      x.arc(px, py, r, 0, 7);
      x.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(80, 80);
    return tex;
  }
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(30000, 30000),
    new THREE.MeshStandardMaterial({
      map: makeGroundTexture(),
      roughness: 1,
      metalness: 0,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -20;
  ground.receiveShadow = true;
  scene.add(ground);

  /* ---- terrain.glb (enhanced ground detail) ---- */
  const gltfLoader = new THREE.GLTFLoader();
  let terrainGroup = null;
  gltfLoader.load(
    "terrain.glb",
    function (gltf) {
      terrainGroup = gltf.scene;
      const box = new THREE.Box3().setFromObject(terrainGroup);
      const size = new THREE.Vector3();
      box.getSize(size);
      const center = new THREE.Vector3();
      box.getCenter(center);
      terrainGroup.position.sub(center);
      terrainGroup.position.y = -18;
      const maxDim = Math.max(size.x, size.z) || 1;
      const scale = 2400 / maxDim;
      terrainGroup.scale.setScalar(scale);
      terrainGroup.traverse(function (o) {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      scene.add(terrainGroup);
      console.log("[skystrike] terrain.glb loaded");
    },
    undefined,
    function () {
      console.log("[skystrike] terrain.glb not found — using flat ground");
    }
  );

  /* ============================================================ JET FACTORY */
  function buildJet(scheme) {
    const g = new THREE.Group();
    const mBody = new THREE.MeshStandardMaterial({
      color: scheme.primary,
      metalness: 0.65,
      roughness: 0.32,
    });
    const mAccent = new THREE.MeshStandardMaterial({
      color: scheme.accent,
      metalness: 0.55,
      roughness: 0.38,
    });
    const mDark = new THREE.MeshStandardMaterial({
      color: 0x1c1f22,
      metalness: 0.7,
      roughness: 0.4,
    });
    const mGlass = new THREE.MeshStandardMaterial({
      color: 0x1a2a33,
      metalness: 0.9,
      roughness: 0.05,
      emissive: 0x0b1a22,
    });
    const mNozzle = new THREE.MeshStandardMaterial({
      color: 0x2a2a2c,
      metalness: 0.9,
      roughness: 0.3,
      emissive: 0xff5500,
      emissiveIntensity: 1,
    });

    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.9, 6.6, 12), mBody);
    fuse.rotation.x = Math.PI / 2;
    fuse.position.z = -0.2;
    fuse.castShadow = fuse.receiveShadow = true;
    g.add(fuse);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.4, 12), mBody);
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 3.3;
    nose.castShadow = true;
    g.add(nose);

    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
      mGlass
    );
    canopy.scale.set(0.75, 0.85, 1.7);
    canopy.position.set(0, 0.55, 1.1);
    g.add(canopy);

    function wing(sideSign) {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(0.35, -2.6);
      shape.lineTo(0.15, -3.0);
      shape.lineTo(-2.9, -0.6);
      shape.lineTo(-3.2, 0.5);
      shape.lineTo(-0.4, 0.55);
      shape.lineTo(0, 0);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false });
      const w = new THREE.Mesh(geo, mAccent);
      w.rotation.x = Math.PI / 2;
      w.position.set(0.75 * sideSign, -0.05, -0.4);
      w.scale.x = sideSign;
      w.castShadow = true;
      return w;
    }
    g.add(wing(1));
    g.add(wing(-1));

    function tailplane(sideSign) {
      const tp = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 0.9), mAccent);
      tp.position.set(0.75 * sideSign, 0.05, -2.9);
      tp.rotation.z = -0.12 * sideSign;
      tp.castShadow = true;
      return tp;
    }
    g.add(tailplane(1));
    g.add(tailplane(-1));

    function fin(sideSign) {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(0, 1.5);
      shape.lineTo(-1.1, 1.35);
      shape.lineTo(-0.9, 0);
      shape.lineTo(0, 0);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false });
      const f = new THREE.Mesh(geo, mDark);
      f.position.set(0.5 * sideSign, 0.15, -2.85);
      f.rotation.y = Math.PI / 2;
      f.rotation.z = sideSign > 0 ? -0.18 : 0.18;
      f.castShadow = true;
      return f;
    }
    g.add(fin(1));
    g.add(fin(-1));

    const nozzles = [];
    [1, -1].forEach(function (s) {
      const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.9, 10), mNozzle);
      noz.rotation.x = Math.PI / 2;
      noz.position.set(0.42 * s, -0.05, -3.35);
      g.add(noz);
      const marker = new THREE.Object3D();
      marker.position.set(0.42 * s, -0.05, -3.85);
      g.add(marker);
      nozzles.push(marker);
    });

    const hardpoints = [];
    [1.6, -1.6].forEach(function (s) {
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.6), mDark);
      pylon.position.set(s, -0.35, 0.2);
      g.add(pylon);
      const hp = new THREE.Object3D();
      hp.position.set(s, -0.42, 0.2);
      g.add(hp);
      hardpoints.push(hp);
    });

    g.scale.set(1.35, 1.35, 1.35);
    return { group: g, nozzles: nozzles, hardpoints: hardpoints, nozzleMat: mNozzle };
  }

  const F22_SCHEME = { primary: 0x9aa5ab, accent: 0x6f7a80 };
  const MIG_SCHEME = { primary: 0x7d8a6a, accent: 0x4a5a3c };

  /* ============================================================ MISSILE / BOMB FACTORY */
  function buildProceduralMissile() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 1.6, 8),
      new THREE.MeshStandardMaterial({ color: 0xe8e8e8, metalness: 0.6, roughness: 0.4 })
    );
    body.rotation.x = Math.PI / 2;
    g.add(body);
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.09, 0.35, 8),
      new THREE.MeshStandardMaterial({ color: 0xff3b30, metalness: 0.3, roughness: 0.5 })
    );
    tip.rotation.x = -Math.PI / 2;
    tip.position.z = -0.95;
    g.add(tip);
    [0, 1, 2, 3].forEach(function (i) {
      const fin = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 0.24, 0.3),
        new THREE.MeshStandardMaterial({ color: 0x333333 })
      );
      fin.position.z = 0.7;
      const a = (i * Math.PI) / 2;
      fin.position.x = Math.sin(a) * 0.09;
      fin.position.y = Math.cos(a) * 0.09;
      fin.rotation.z = a;
      g.add(fin);
    });
    return g;
  }

  let missileTemplate = buildProceduralMissile();
  function buildMissile() {
    return missileTemplate.clone(true);
  }

  function buildBomb() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 1.2, 10),
      new THREE.MeshStandardMaterial({ color: 0x4a5560, metalness: 0.7, roughness: 0.35 })
    );
    body.rotation.x = Math.PI / 2;
    g.add(body);
    const nose = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
      new THREE.MeshStandardMaterial({ color: 0x2a3038, metalness: 0.7, roughness: 0.3 })
    );
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = -0.6;
    g.add(nose);
    const tail = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.4, 8),
      new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.5, roughness: 0.5 })
    );
    tail.rotation.x = Math.PI / 2;
    tail.position.z = 0.8;
    g.add(tail);
    [0, 1, 2, 3].forEach(function (i) {
      const fin = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.3, 0.25),
        new THREE.MeshStandardMaterial({ color: 0x333333 })
      );
      fin.position.z = 0.85;
      const a = (i * Math.PI) / 2;
      fin.position.x = Math.sin(a) * 0.16;
      fin.position.y = Math.cos(a) * 0.16;
      fin.rotation.z = a;
      g.add(fin);
    });
    return g;
  }

  /* ============================================================ PARTICLES */
  const particleVert = `
attribute float aSize;
attribute float aAlpha;
varying float vAlpha;
void main(){
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  gl_PointSize = aSize * (300.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
  const particleFrag = `
precision mediump float;
uniform vec3 uColor;
uniform sampler2D uMap;
varying float vAlpha;
void main(){
  vec4 t = texture2D(uMap, gl_PointCoord);
  gl_FragColor = vec4(uColor, vAlpha * t.a);
}`;

  function createPool(max, color, blending) {
    const positions = new Float32Array(max * 3);
    const sizes = new Float32Array(max);
    const alphas = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uMap: { value: dotTex } },
      vertexShader: particleVert,
      fragmentShader: particleFrag,
      transparent: true,
      depthWrite: false,
      blending: blending,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);
    return {
      points: points,
      positions: positions,
      sizes: sizes,
      alphas: alphas,
      vel: new Float32Array(max * 3),
      life: new Float32Array(max),
      maxLife: new Float32Array(max),
      baseSize: new Float32Array(max),
      grow: new Float32Array(max),
      cursor: 0,
      max: max,
    };
  }

  function spawnParticle(pool, pos, vel, size, life, grow) {
    const i = pool.cursor;
    pool.cursor = (pool.cursor + 1) % pool.max;
    pool.positions[i * 3] = pos.x;
    pool.positions[i * 3 + 1] = pos.y;
    pool.positions[i * 3 + 2] = pos.z;
    pool.vel[i * 3] = vel.x;
    pool.vel[i * 3 + 1] = vel.y;
    pool.vel[i * 3 + 2] = vel.z;
    pool.life[i] = life;
    pool.maxLife[i] = life;
    pool.baseSize[i] = size;
    pool.grow[i] = grow === undefined ? 0 : grow;
    pool.alphas[i] = 1;
  }

  function updatePool(pool, dt) {
    for (let i = 0; i < pool.max; i++) {
      if (pool.life[i] <= 0) {
        pool.alphas[i] = 0;
        continue;
      }
      pool.life[i] -= dt;
      if (pool.life[i] <= 0) {
        pool.alphas[i] = 0;
        pool.sizes[i] = 0;
        continue;
      }
      pool.positions[i * 3] += pool.vel[i * 3] * dt;
      pool.positions[i * 3 + 1] += pool.vel[i * 3 + 1] * dt;
      pool.positions[i * 3 + 2] += pool.vel[i * 3 + 2] * dt;
      const t = pool.life[i] / pool.maxLife[i];
      pool.alphas[i] = t;
      pool.sizes[i] = pool.baseSize[i] * (1 + (1 - t) * pool.grow[i]);
    }
    pool.points.geometry.attributes.position.needsUpdate = true;
    pool.points.geometry.attributes.aSize.needsUpdate = true;
    pool.points.geometry.attributes.aAlpha.needsUpdate = true;
  }

  const firePool = createPool(700, 0xffa030, THREE.AdditiveBlending);
  const smokePool = createPool(800, 0xaab0b5, THREE.NormalBlending);
  const sparkPool = createPool(600, 0xffcf80, THREE.AdditiveBlending);
  const debrisPool = createPool(300, 0x886644, THREE.NormalBlending);

  function randSphereDir() {
    const v = new THREE.Vector3(
      Math.random() * 2 - 1,
      Math.random() * 2 - 1,
      Math.random() * 2 - 1
    );
    if (v.lengthSq() < 0.0001) v.set(0, 1, 0);
    return v.normalize();
  }
  function jitter(mag) {
    return new THREE.Vector3(
      (Math.random() * 2 - 1) * mag,
      (Math.random() * 2 - 1) * mag,
      (Math.random() * 2 - 1) * mag
    );
  }

  /* ============================================================ EXPLOSIONS */
  const ringMat = new THREE.SpriteMaterial({
    map: dotTex,
    color: 0xffb060,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const activeRings = [];
  const activeFlashes = [];
  let shakeTime = 0,
    shakeAmp = 0;

  function spawnExplosion(pos, scale) {
    scale = scale === undefined ? 1 : scale;
    const sparkCount = Math.round(42 * scale);
    for (let i = 0; i < sparkCount; i++) {
      const d = randSphereDir();
      spawnParticle(sparkPool, pos, d.multiplyScalar(7 + Math.random() * 18 * scale), 0.6 * scale, 0.5 + Math.random() * 0.5, 0.4);
    }
    const smokeCount = Math.round(28 * scale);
    for (let i = 0; i < smokeCount; i++) {
      const d = randSphereDir();
      spawnParticle(smokePool, pos, d.multiplyScalar(1.5 + Math.random() * 5), 1.8 * scale, 2.2 + Math.random() * 1.2, 1.8);
    }
    const debrisCount = Math.round(12 * scale);
    for (let i = 0; i < debrisCount; i++) {
      const d = randSphereDir();
      spawnParticle(debrisPool, pos, d.multiplyScalar(4 + Math.random() * 10 * scale), 0.4 * scale, 1.5 + Math.random(), 0.3);
    }
    const ring = new THREE.Sprite(ringMat.clone());
    ring.position.copy(pos);
    ring.scale.set(0.5, 0.5, 1);
    scene.add(ring);
    activeRings.push({ obj: ring, t: 0, dur: 0.6 * scale });

    const flash = new THREE.PointLight(0xffb060, 10 * scale, 120 * scale, 2);
    flash.position.copy(pos);
    scene.add(flash);
    activeFlashes.push({ light: flash, t: 0, dur: 0.3 });

    SkyAudio.explosion(scale);

    if (camera.position.distanceTo(pos) < 120) {
      shakeTime = Math.max(shakeTime, 0.5 * scale);
      shakeAmp = Math.max(shakeAmp, 0.45 * scale);
    }
  }

  function updateExplosionFX(dt) {
    for (let i = activeRings.length - 1; i >= 0; i--) {
      const r = activeRings[i];
      r.t += dt;
      const k = r.t / r.dur;
      if (k >= 1) {
        scene.remove(r.obj);
        r.obj.material.dispose();
        activeRings.splice(i, 1);
        continue;
      }
      const s = 0.5 + k * 26;
      r.obj.scale.set(s, s, 1);
      r.obj.material.opacity = 0.9 * (1 - k);
    }
    for (let i = activeFlashes.length - 1; i >= 0; i--) {
      const f = activeFlashes[i];
      f.t += dt;
      const k = f.t / f.dur;
      if (k >= 1) {
        scene.remove(f.light);
        activeFlashes.splice(i, 1);
        continue;
      }
      f.light.intensity = 10 * (1 - k);
    }
    if (shakeTime > 0) {
      shakeTime -= dt;
      if (shakeTime < 0) shakeTime = 0;
    }
  }

  /* ============================================================ UTIL */
  function disposeObject(obj) {
    obj.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach(function (m) { m.dispose(); });
        else o.material.dispose();
      }
    });
  }

  /* ============================================================ FIGHTERS */
  const playerBuild = buildJet(F22_SCHEME);
  const enemyBuild = buildJet(MIG_SCHEME);
  scene.add(playerBuild.group);
  scene.add(enemyBuild.group);
  playerBuild.group.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
  enemyBuild.group.traverse(function (o) { if (o.isMesh) o.castShadow = true; });

  const player = {
    obj: playerBuild.group,
    nozzles: playerBuild.nozzles,
    hardpoints: playerBuild.hardpoints,
    nozzleMat: playerBuild.nozzleMat,
    throttle: 0.6,
    health: 100,
    maxHealth: 100,
    alive: true,
    missileCooldown: 0,
    missileFireRate: 0.9,
    bombCooldown: 0,
    bombFireRate: 0.6,
    ammo: 8,
    bombs: 6,
    weapon: "missile",
    emitAcc: 0,
    speed: 0,
    lockState: "search",
    lockProgress: 0,
    lockTarget: null,
  };
  player.obj.position.set(0, 130, 0);

  const enemy = {
    obj: enemyBuild.group,
    nozzles: enemyBuild.nozzles,
    hardpoints: enemyBuild.hardpoints,
    nozzleMat: enemyBuild.nozzleMat,
    throttle: 0.7,
    health: 100,
    maxHealth: 100,
    alive: true,
    missileCooldown: 2.0,
    missileFireRate: 2.6,
    emitAcc: 0,
    weaveT: Math.random() * 10,
    speed: 0,
  };
  enemy.obj.position.set(60, 140, 240);
  enemy.obj.rotateY(Math.PI);

  /* ============================================================ LOAD GLB MODELS */
  function fitModelInto(root, modelScene, targetLength, extraYRotation) {
    while (root.children.length) root.remove(root.children[0]);
    modelScene.traverse(function (o) {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    const box = new THREE.Box3().setFromObject(modelScene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const wrapper = new THREE.Group();
    modelScene.position.sub(center);
    wrapper.add(modelScene);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = targetLength / maxDim;
    wrapper.scale.setScalar(scale);
    if (extraYRotation) wrapper.rotation.y = extraYRotation;
    root.add(wrapper);
    return scale * maxDim;
  }

  function loadFighterModel(fighter, url, targetLength) {
    gltfLoader.load(
      url,
      function (gltf) {
        fitModelInto(fighter.obj, gltf.scene, targetLength, 0);
        const rear = -targetLength * 0.46,
          front = targetLength * 0.02;
        fighter.nozzles = [
          (function () { const m = new THREE.Object3D(); m.position.set(targetLength * 0.09, -0.1, rear); fighter.obj.add(m); return m; })(),
          (function () { const m = new THREE.Object3D(); m.position.set(-targetLength * 0.09, -0.1, rear); fighter.obj.add(m); return m; })(),
        ];
        fighter.hardpoints = [
          (function () { const m = new THREE.Object3D(); m.position.set(targetLength * 0.28, -0.15, front); fighter.obj.add(m); return m; })(),
          (function () { const m = new THREE.Object3D(); m.position.set(-targetLength * 0.28, -0.15, front); fighter.obj.add(m); return m; })(),
        ];
        fighter.nozzleMat = null;
        console.log("[skystrike] loaded", url);
      },
      undefined,
      function () {
        console.log("[skystrike] " + url + " not found — keeping procedural jet");
      }
    );
  }

  loadFighterModel(player, "f-22.glb", 13.5);
  loadFighterModel(enemy, "mig-35.glb", 12.5);

  gltfLoader.load(
    "missile.glb",
    function (gltf) {
      const wrapper = new THREE.Group();
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const size = new THREE.Vector3();
      box.getSize(size);
      const center = new THREE.Vector3();
      box.getCenter(center);
      gltf.scene.position.sub(center);
      gltf.scene.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
      wrapper.add(gltf.scene);
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      wrapper.scale.setScalar(2.4 / maxDim);
      missileTemplate = wrapper;
      console.log("[skystrike] loaded missile.glb");
    },
    undefined,
    function () {
      console.log("[skystrike] missile.glb not found — keeping procedural missile");
    }
  );

  /* ============================================================ GROUND TARGETS (bombing mission) */
  const groundTargets = [];
  const targetGroup = new THREE.Group();
  scene.add(targetGroup);

  function buildGroundTarget(x, z, type) {
    const g = new THREE.Group();
    g.position.set(x, -18, z);
    let mesh, hp, radius;
    if (type === "building") {
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(16, 22, 16),
        new THREE.MeshStandardMaterial({ color: 0x8a8a92, metalness: 0.3, roughness: 0.7 })
      );
      mesh.position.y = 11;
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(18, 2, 18),
        new THREE.MeshStandardMaterial({ color: 0x555a60, metalness: 0.4, roughness: 0.6 })
      );
      roof.position.y = 22;
      roof.castShadow = true;
      g.add(roof);
      hp = 60;
      radius = 11;
    } else if (type === "fuel") {
      mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(8, 8, 14, 16),
        new THREE.MeshStandardMaterial({ color: 0xc0c4c8, metalness: 0.5, roughness: 0.4 })
      );
      mesh.position.y = 7;
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
      hp = 35;
      radius = 9;
    } else {
      // bunker
      mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(10, 12, 6, 16),
        new THREE.MeshStandardMaterial({ color: 0x6a6a5a, metalness: 0.2, roughness: 0.9 })
      );
      mesh.position.y = 3;
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(10, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
        new THREE.MeshStandardMaterial({ color: 0x5a5a4a, metalness: 0.2, roughness: 0.9 })
      );
      dome.position.y = 6;
      dome.castShadow = true;
      g.add(dome);
      hp = 80;
      radius = 12;
    }
    targetGroup.add(g);
    const t = {
      obj: g,
      mesh: mesh,
      health: hp,
      maxHealth: hp,
      alive: true,
      radius: radius,
      type: type,
      origPos: g.position.clone(),
    };
    groundTargets.push(t);
    return t;
  }

  function buildRunway() {
    const rw = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 300),
      new THREE.MeshStandardMaterial({ color: 0x333338, metalness: 0.1, roughness: 0.9 })
    );
    rw.rotation.x = -Math.PI / 2;
    rw.position.set(0, -17.5, 100);
    rw.receiveShadow = true;
    targetGroup.add(rw);
    for (let i = -120; i <= 120; i += 30) {
      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(1.5, 12),
        new THREE.MeshBasicMaterial({ color: 0xdddddd })
      );
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(0, -17, 100 + i);
      targetGroup.add(stripe);
    }
  }

  function setupBombingTargets() {
    while (targetGroup.children.length) targetGroup.remove(targetGroup.children[0]);
    groundTargets.length = 0;
    buildRunway();
    buildGroundTarget(-50, 60, "building");
    buildGroundTarget(55, 80, "fuel");
    buildGroundTarget(-70, 120, "bunker");
    buildGroundTarget(70, 140, "building");
    buildGroundTarget(-45, 170, "fuel");
    buildGroundTarget(50, 200, "bunker");
  }

  /* ============================================================ MISSILES & BOMBS */
  const missiles = [];
  const bombs = [];

  function fireMissile(shooter, target) {
    if (shooter.missileCooldown > 0) return;
    if (shooter === player) {
      if (player.ammo <= 0) return;
      player.ammo--;
    }
    shooter.missileCooldown = shooter.missileFireRate;
    const m = buildMissile();
    const hp = shooter.hardpoints[Math.floor(Math.random() * shooter.hardpoints.length)];
    const wp = new THREE.Vector3();
    hp.getWorldPosition(wp);
    m.position.copy(wp);
    m.quaternion.copy(shooter.obj.quaternion);
    scene.add(m);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(shooter.obj.quaternion);
    missiles.push({
      obj: m,
      dir: fwd.clone(),
      speed: 80,
      life: 6.5,
      owner: shooter,
      target: target,
      trailAcc: 0,
    });
    SkyAudio.launch();
    if (shooter === enemy) SkyAudio.enemyLaunchHeard();
  }

  function dropBomb(shooter) {
    if (shooter.bombCooldown > 0) return;
    if (shooter === player) {
      if (player.bombs <= 0) return;
      player.bombs--;
    }
    shooter.bombCooldown = shooter.bombFireRate;
    const b = buildBomb();
    const hp = shooter.hardpoints[Math.floor(Math.random() * shooter.hardpoints.length)];
    const wp = new THREE.Vector3();
    hp.getWorldPosition(wp);
    b.position.copy(wp);
    b.quaternion.copy(shooter.obj.quaternion);
    scene.add(b);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(shooter.obj.quaternion);
    const vel = fwd.clone().multiplyScalar(shooter.speed || 30);
    vel.y -= 5;
    bombs.push({
      obj: b,
      vel: vel,
      life: 12,
      owner: shooter,
      spin: 0,
    });
    SkyAudio.launch();
    SkyAudio.bombWhistle(3.5);
  }

  /* ============================================================ INPUT */
  const input = {};
  window.addEventListener("keydown", function (e) {
    input[e.code] = true;
    if (e.code === "Space") e.preventDefault();
    if (e.code === "KeyF" && state === "playing") {
      player.weapon = player.weapon === "missile" ? "bomb" : "missile";
      SkyAudio.uiClick();
      updateWeaponHud();
    }
    if (state === "menu" && e.code === "Enter") startGame();
  });
  window.addEventListener("keyup", function (e) {
    input[e.code] = false;
  });

  /* ============================================================ GAME STATE / MISSIONS */
  let state = "menu"; // menu | playing | over
  let mission = "dogfight"; // dogfight | strike
  let missionTimer = 0;
  let incomingAlertTimer = 0;
  let lastLockBeep = 0;
  let lastWarning = 0;
  let muzzleFlash = null;

  const startBtn = document.getElementById("startBtn");
  const msgOverlay = document.getElementById("msgOverlay");
  const resultTitle = document.getElementById("resultTitle");
  const msgBox = document.getElementById("msgBox");

  function startGame() {
    SkyAudio.init();
    state = "playing";
    msgOverlay.style.display = "none";
    clock.getDelta();
    if (mission === "strike") {
      setupBombingTargets();
      player.bombs = 6;
      player.ammo = 4;
      player.weapon = "bomb";
    } else {
      player.bombs = 0;
      player.ammo = 8;
      player.weapon = "missile";
      while (targetGroup.children.length) targetGroup.remove(targetGroup.children[0]);
      groundTargets.length = 0;
    }
    updateWeaponHud();
  }

  startBtn.addEventListener("click", function () {
    mission = document.querySelector('input[name="mission"]:checked').value;
    startGame();
  });

  function endGame(win) {
    state = "over";
    resultTitle.textContent = win ? "MISSION COMPLETE" : "RAPTOR DOWN";
    resultTitle.className = win ? "win" : "lose";
    const sub = document.getElementById("resultSub");
    const sub2 = document.getElementById("resultSub2");
    if (win) {
      sub.textContent = mission === "dogfight" ? "MiG-35 eliminated. Outstanding." : "All targets destroyed. Strike successful.";
      SkyAudio.success();
    } else {
      sub.textContent = "You were shot down.";
      SkyAudio.fail();
    }
    sub2.textContent = "";
    document.querySelectorAll(".missionSelect, #msgBox p").forEach(function (el) {
      el.style.display = "none";
    });
    startBtn.textContent = "RESTART";
    startBtn.onclick = function () { window.location.reload(); };
    msgOverlay.style.display = "flex";
  }

  function checkMissionComplete() {
    if (mission === "dogfight" && !enemy.alive) {
      endGame(true);
    } else if (mission === "strike") {
      const aliveTargets = groundTargets.filter(function (t) { return t.alive; });
      if (aliveTargets.length === 0) endGame(true);
    }
  }

  /* ============================================================ LOCK-ON SYSTEM */
  function updateLockOn(dt) {
    if (!player.alive) {
      player.lockState = "search";
      player.lockProgress = 0;
      return;
    }
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(player.obj.quaternion);
    let bestTarget = null;
    let bestAngle = Infinity;

    if (mission === "dogfight" && enemy.alive) {
      const rel = new THREE.Vector3().subVectors(enemy.obj.position, player.obj.position);
      const dist = rel.length();
      const angle = fwd.angleTo(rel.clone().normalize());
      if (dist < 350 && angle < 0.32) {
        bestTarget = enemy;
        bestAngle = angle;
      }
    } else if (mission === "strike") {
      for (let i = 0; i < groundTargets.length; i++) {
        const t = groundTargets[i];
        if (!t.alive) continue;
        const rel = new THREE.Vector3().subVectors(t.obj.position, player.obj.position);
        const dist = rel.length();
        if (dist > 500) continue;
        const downDir = new THREE.Vector3(0, -0.7, 1).normalize();
        const downFwd = downDir.applyQuaternion(player.obj.quaternion);
        const angle = downFwd.angleTo(rel.clone().normalize());
        if (angle < 0.38) {
          if (angle < bestAngle) {
            bestTarget = t;
            bestAngle = angle;
          }
        }
      }
    }

    if (bestTarget) {
      if (player.lockTarget !== bestTarget) {
        player.lockTarget = bestTarget;
        player.lockProgress = 0;
        player.lockState = "track";
      }
      if (player.lockState === "track") {
        player.lockProgress += dt * 0.9;
        if (player.lockProgress >= 1) {
          player.lockProgress = 1;
          player.lockState = "lock";
          SkyAudio.lockAlert();
        } else {
          if (missionTimer - lastLockBeep > 0.18) {
            SkyAudio.lockBeep();
            lastLockBeep = missionTimer;
          }
        }
      }
    } else {
      player.lockState = "search";
      player.lockProgress = 0;
      player.lockTarget = null;
    }
  }

  /* ============================================================ INCOMING MISSILE WARNING */
  function checkIncomingMissile(dt) {
    let incoming = false;
    for (let i = 0; i < missiles.length; i++) {
      const m = missiles[i];
      if (m.owner === enemy && m.target === player && player.alive) {
        const d = m.obj.position.distanceTo(player.obj.position);
        if (d < 80) incoming = true;
      }
    }
    if (incoming) {
      incomingAlertTimer = 0.5;
      if (missionTimer - lastWarning > 1.5) {
        SkyAudio.warning();
        lastWarning = missionTimer;
      }
    }
  }

  /* ============================================================ UPDATE: PLAYER */
  function updatePlayer(dt) {
    if (!player.alive) return;
    let pitch = 0, roll = 0, yaw = 0;
    if (input["KeyW"]) pitch += 1;
    if (input["KeyS"]) pitch -= 1;
    if (input["KeyA"]) roll += 1;
    if (input["KeyD"]) roll -= 1;
    if (input["KeyQ"]) yaw += 1;
    if (input["KeyE"]) yaw -= 1;

    player.obj.rotateX(pitch * 1.2 * dt);
    player.obj.rotateZ(roll * 2.4 * dt);
    player.obj.rotateY(yaw * 0.75 * dt);

    if (input["ShiftLeft"] || input["ShiftRight"]) {
      player.throttle = Math.min(1.5, player.throttle + dt * 1.1);
    } else {
      player.throttle += (0.62 - player.throttle) * Math.min(1, dt * 0.6);
    }
    if (input["ControlLeft"] || input["ControlRight"]) {
      player.throttle = Math.max(0.08, player.throttle - dt * 1.1);
    }

    const speed = 26 + player.throttle * 50;
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(player.obj.quaternion);
    player.obj.position.addScaledVector(fwd, speed * dt);
    if (player.obj.position.y < 8) player.obj.position.y = 8;
    if (player.obj.position.y > 950) player.obj.position.y = 950;
    player.speed = speed;

    player.missileCooldown = Math.max(0, player.missileCooldown - dt);
    player.bombCooldown = Math.max(0, player.bombCooldown - dt);

    if (input["Space"]) {
      if (player.weapon === "missile" && mission === "dogfight" && enemy.alive) {
        if (player.lockState === "lock") fireMissile(player, enemy);
        else if (player.lockState === "track") {
          // can fire without full lock but less accurate
          fireMissile(player, enemy);
        }
      } else if (player.weapon === "bomb" && mission === "strike") {
        dropBomb(player);
      }
    }

    const boosting = player.throttle > 1.0;
    if (player.nozzleMat) player.nozzleMat.emissiveIntensity = boosting ? 3.2 : 1.1;
    const abTag = document.getElementById("afterburnerTag");
    if (abTag) abTag.style.opacity = boosting ? 1 : 0;

    SkyAudio.updateEngine(player.throttle, speed);
  }

  /* ============================================================ UPDATE: ENEMY AI */
  function updateEnemy(dt) {
    if (!enemy.alive) return;
    enemy.weaveT += dt;
    const toPlayer = new THREE.Vector3().subVectors(player.obj.position, enemy.obj.position);
    const dist = toPlayer.length();
    toPlayer.normalize();

    const weave = new THREE.Vector3(
      Math.sin(enemy.weaveT * 0.5) * 0.2,
      Math.sin(enemy.weaveT * 0.8) * 0.14,
      0
    );
    let desiredForward;
    if (dist < 32) {
      const away = new THREE.Vector3().subVectors(enemy.obj.position, player.obj.position).normalize();
      desiredForward = away.add(weave).normalize();
    } else {
      desiredForward = toPlayer.clone().add(weave).normalize();
    }

    const currentForward = new THREE.Vector3(0, 0, 1).applyQuaternion(enemy.obj.quaternion);
    const targetQuat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      desiredForward
    );
    enemy.obj.quaternion.slerp(targetQuat, Math.min(1, dt * 1.2));

    const finalSpeed = 32 + 6 * Math.sin(enemy.weaveT * 0.3);
    enemy.obj.position.addScaledVector(currentForward, finalSpeed * dt);
    if (enemy.obj.position.y < 12) enemy.obj.position.y = 12;
    if (enemy.obj.position.y > 950) enemy.obj.position.y = 950;
    enemy.speed = finalSpeed;

    enemy.missileCooldown -= dt;
    const angleToPlayer = currentForward.angleTo(toPlayer);
    if (dist < 280 && dist > 20 && angleToPlayer < 0.45 && enemy.missileCooldown <= 0 && player.alive) {
      fireMissile(enemy, player);
    }
    const boosting = finalSpeed > 36;
    if (enemy.nozzleMat) enemy.nozzleMat.emissiveIntensity = boosting ? 3.0 : 1.1;
  }

  /* ============================================================ ENGINE TRAIL */
  function emitEngineTrail(fighter, boosting, dt) {
    if (!fighter.alive) return;
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(fighter.obj.quaternion);
    const back = fwd.clone().negate();
    fighter.emitAcc += dt;
    const rate = boosting ? 0.006 : 0.018;
    let guard = 0;
    while (fighter.emitAcc > rate && guard < 14) {
      fighter.emitAcc -= rate;
      guard++;
      fighter.nozzles.forEach(function (n) {
        const wp = new THREE.Vector3();
        n.getWorldPosition(wp);
        const fireVel = back.clone().multiplyScalar(5 + Math.random() * 4).add(jitter(0.6));
        spawnParticle(firePool, wp, fireVel, boosting ? 0.6 : 0.42, boosting ? 0.45 : 0.28, 0.3);
        if (!boosting) {
          if (Math.random() < 0.6) {
            const smokeVel = back.clone().multiplyScalar(1.2 + Math.random() * 1.2).add(jitter(0.35));
            spawnParticle(smokePool, wp, smokeVel, 1.0, 1.6 + Math.random() * 0.6, 1.8);
          }
        } else {
          const smokeVel = back.clone().multiplyScalar(2 + Math.random() * 1.5).add(jitter(0.4));
          spawnParticle(smokePool, wp, smokeVel, 1.1, 1.0, 1.6);
        }
      });
    }
  }

  /* ============================================================ UPDATE MISSILES */
  function updateMissiles(dt) {
    for (let i = missiles.length - 1; i >= 0; i--) {
      const m = missiles[i];
      m.life -= dt;

      let desiredDir = m.dir;
      if (m.target && m.target.alive) {
        desiredDir = new THREE.Vector3().subVectors(m.target.obj.position, m.obj.position).normalize();
      }
      const maxTurn = Math.min(1, 2.6 * dt);
      m.dir.lerp(desiredDir, maxTurn).normalize();
      m.obj.position.addScaledVector(m.dir, m.speed * dt);
      const lookTarget = m.obj.position.clone().add(m.dir);
      m.obj.up.set(0, 1, 0);
      m.obj.lookAt(lookTarget);

      m.trailAcc += dt;
      while (m.trailAcc > 0.02) {
        m.trailAcc -= 0.02;
        spawnParticle(smokePool, m.obj.position, jitter(0.4), 0.7, 0.7, 1.4);
        spawnParticle(
          firePool,
          m.obj.position.clone().addScaledVector(m.dir, -0.4),
          m.dir.clone().negate().multiplyScalar(2).add(jitter(0.3)),
          0.35,
          0.2,
          0.2
        );
      }

      let hit = false,
        expired = false;
      if (m.target && m.target.alive) {
        const d = m.obj.position.distanceTo(m.target.obj.position);
        if (d < 3.6) {
          hit = true;
          if (m.target === player || m.target === enemy) {
            damage(m.target, 36);
          } else {
            damageGroundTarget(m.target, 40);
          }
        }
      }
      if (m.obj.position.y < 2) expired = true;
      if (m.life <= 0) expired = true;

      if (hit || expired) {
        spawnExplosion(m.obj.position.clone(), hit ? 1.2 : 0.5);
        scene.remove(m.obj);
        disposeObject(m.obj);
        missiles.splice(i, 1);
      }
    }
  }

  /* ============================================================ UPDATE BOMBS */
  function updateBombs(dt) {
    for (let i = bombs.length - 1; i >= 0; i--) {
      const b = bombs[i];
      b.life -= dt;
      b.vel.y -= 9.8 * dt;
      b.obj.position.addScaledVector(b.vel, dt);
      b.spin += dt * 2;
      b.obj.rotation.x = b.spin;

      let hit = false;
      if (b.obj.position.y <= -17) {
        hit = true;
        b.obj.position.y = -17;
      }
      for (let j = 0; j < groundTargets.length; j++) {
        const t = groundTargets[j];
        if (!t.alive) continue;
        const d = b.obj.position.distanceTo(t.obj.position.clone().setY(b.obj.position.y));
        if (d < t.radius + 2) {
          hit = true;
          damageGroundTarget(t, 50);
          break;
        }
      }
      if (b.life <= 0) hit = true;

      if (hit) {
        spawnExplosion(b.obj.position.clone(), 2.0);
        scene.remove(b.obj);
        disposeObject(b.obj);
        bombs.splice(i, 1);
      }
    }
  }

  /* ============================================================ DAMAGE */
  function damage(fighter, amount) {
    if (!fighter.alive) return;
    fighter.health = Math.max(0, fighter.health - amount);
    SkyAudio.hit();
    if (fighter.health <= 0) destroyFighter(fighter);
  }

  function damageGroundTarget(target, amount) {
    if (!target.alive) return;
    target.health = Math.max(0, target.health - amount);
    SkyAudio.hit();
    if (target.health <= 0) destroyGroundTarget(target);
  }

  function destroyFighter(fighter) {
    fighter.alive = false;
    spawnExplosion(fighter.obj.position.clone(), 2.5);
    setTimeout(function () {
      for (let k = 0; k < 4; k++) {
        spawnExplosion(fighter.obj.position.clone().add(jitter(3)), 1.2 + Math.random());
      }
    }, 140);
    fighter.obj.visible = false;
    setTimeout(function () {
      checkMissionComplete();
      if (mission === "dogfight") endGame(fighter === enemy);
    }, 1000);
  }

  function destroyGroundTarget(target) {
    target.alive = false;
    spawnExplosion(target.obj.position.clone().add(new THREE.Vector3(0, 8, 0)), 2.0);
    setTimeout(function () {
      spawnExplosion(target.obj.position.clone().add(jitter(4)), 1.5);
    }, 200);
    target.obj.visible = false;
    setTimeout(checkMissionComplete, 300);
  }

  /* ============================================================ CAMERA */
  const camQuat = new THREE.Quaternion().copy(player.obj.quaternion);
  function updateCamera(dt) {
    if (player.alive) {
      camQuat.slerp(player.obj.quaternion, Math.min(1, dt * 5));
      const offset = new THREE.Vector3(0, 3.8, -14.5).applyQuaternion(camQuat);
      const desired = player.obj.position.clone().add(offset);
      camera.position.lerp(desired, Math.min(1, dt * 7));
      const lookAt = player.obj.position
        .clone()
        .add(new THREE.Vector3(0, 1.6, 0).applyQuaternion(camQuat));
      camera.lookAt(lookAt);
    }
    if (shakeTime > 0) {
      const s = shakeAmp * shakeTime;
      camera.position.x += (Math.random() * 2 - 1) * s;
      camera.position.y += (Math.random() * 2 - 1) * s;
      camera.position.z += (Math.random() * 2 - 1) * s;
    }
    sun.target.position.copy(player.obj.position);
  }

  /* ============================================================ HUD */
  const spdVal = document.getElementById("spdVal");
  const altVal = document.getElementById("altVal");
  const playerBar = document.getElementById("playerBar");
  const enemyBar = document.getElementById("enemyBar");
  const playerHpTxt = document.getElementById("playerHpTxt");
  const enemyHpTxt = document.getElementById("enemyHpTxt");
  const ammoVal = document.getElementById("ammoVal");
  const enemyBlip = document.getElementById("enemyBlip");
  const lockCircle = document.getElementById("lockCircle");
  const lockText = document.getElementById("lockText");
  const lockProgressCircle = document.getElementById("lockProgressCircle");
  const weaponName = document.getElementById("weaponName");
  const weaponCount = document.getElementById("weaponCount");
  const missionTag = document.getElementById("missionTag");
  const targetList = document.getElementById("targetList");
  const incomingWarning = document.getElementById("incomingWarning");
  const lockStatus = document.getElementById("lockStatus");

  function updateWeaponHud() {
    if (!weaponName) return;
    if (player.weapon === "missile") {
      weaponName.textContent = "AIM-120";
      weaponName.style.color = "var(--cy)";
      weaponCount.textContent = player.ammo;
    } else {
      weaponName.textContent = "GBU-12";
      weaponName.style.color = "var(--am)";
      weaponCount.textContent = player.bombs;
    }
  }

  function updateHud() {
    spdVal.textContent = String(Math.round(player.speed || 0)).padStart(3, "0");
    altVal.textContent = String(Math.round(player.obj.position.y)).padStart(3, "0");
    playerBar.style.width = (player.health / player.maxHealth) * 100 + "%";
    enemyBar.style.width = (enemy.health / enemy.maxHealth) * 100 + "%";
    playerHpTxt.textContent = Math.round(player.health);
    enemyHpTxt.textContent = Math.round(enemy.health);
    ammoVal.textContent = player.ammo;
    updateWeaponHud();

    if (missionTag) missionTag.textContent = mission === "dogfight" ? "MISSION: DOGFIGHT" : "MISSION: STRIKE";

    /* target list for bombing */
    if (targetList) {
      if (mission === "strike") {
        targetList.style.display = "block";
        const alive = groundTargets.filter(function (t) { return t.alive; }).length;
        targetList.textContent = "TARGETS: " + alive + " / " + groundTargets.length;
      } else {
        targetList.style.display = "none";
      }
    }

    /* radar + lock for dogfight */
    if (enemy.alive && player.alive && mission === "dogfight") {
      const rel = new THREE.Vector3().subVectors(enemy.obj.position, player.obj.position);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(player.obj.quaternion);
      const fwdP = new THREE.Vector3(0, 0, 1).applyQuaternion(player.obj.quaternion);
      const rx = rel.dot(right),
        rz = rel.dot(fwdP);
      const range = 400;
      const rxN = THREE.MathUtils.clamp(rx / range, -1, 1);
      const rzN = THREE.MathUtils.clamp(rz / range, -1, 1);
      enemyBlip.style.left = 50 + rxN * 45 + "%";
      enemyBlip.style.top = 50 - rzN * 45 + "%";
      enemyBlip.style.display = "block";
    } else {
      enemyBlip.style.display = "none";
    }

    /* lock-on indicator */
    if (player.lockState === "lock") {
      lockCircle.setAttribute("opacity", "1");
      lockText.style.opacity = "1";
      lockText.textContent = "LOCKED — FOX 3";
      lockStatus.textContent = "LOCKED";
      lockStatus.style.color = "var(--rd)";
      if (lockProgressCircle) lockProgressCircle.setAttribute("opacity", "0");
    } else if (player.lockState === "track") {
      lockCircle.setAttribute("opacity", "0.4");
      lockText.style.opacity = "0.7";
      lockText.textContent = "TRACKING...";
      lockStatus.textContent = "TRACKING";
      lockStatus.style.color = "var(--am)";
      if (lockProgressCircle) {
        lockProgressCircle.setAttribute("opacity", "0.8");
        const circ = 2 * Math.PI * 40;
        const offset = circ * (1 - player.lockProgress);
        lockProgressCircle.setAttribute("stroke-dasharray", circ);
        lockProgressCircle.setAttribute("stroke-dashoffset", offset);
      }
    } else {
      lockCircle.setAttribute("opacity", "0");
      lockText.style.opacity = "0";
      lockStatus.textContent = "SEARCH";
      lockStatus.style.color = "var(--cy)";
      if (lockProgressCircle) lockProgressCircle.setAttribute("opacity", "0");
    }

    /* incoming missile warning */
    if (incomingAlertTimer > 0) {
      incomingWarning.style.opacity = "1";
      incomingAlertTimer -= 0.016;
    } else {
      incomingWarning.style.opacity = "0";
    }
  }

  /* ============================================================ MAIN LOOP */
  const clock = new THREE.Clock();
  document.addEventListener("visibilitychange", function () { clock.getDelta(); });

  let fpsAcc = 0, fpsCount = 0, fpsTimer = 0;
  const fpsTag = document.getElementById("fpsTag");

  function animate() {
    requestAnimationFrame(animate);
    let dt = Math.min(clock.getDelta(), 0.05);

    if (state === "playing") {
      missionTimer += dt;
      updatePlayer(dt);
      if (mission === "dogfight" || (mission === "strike" && enemy.alive)) {
        updateEnemy(dt);
      }
      updateLockOn(dt);
      checkIncomingMissile(dt);
      updateMissiles(dt);
      updateBombs(dt);
      emitEngineTrail(player, player.throttle > 1.0, dt);
      emitEngineTrail(enemy, (enemy.speed || 32) > 36, dt);
      updateExplosionFX(dt);
      updateHud();
    } else {
      updateExplosionFX(dt);
    }

    updatePool(firePool, dt);
    updatePool(smokePool, dt);
    updatePool(sparkPool, dt);
    updatePool(debrisPool, dt);
    updateCamera(dt);

    fpsTimer += dt;
    fpsCount++;
    if (fpsTimer >= 1) {
      if (fpsTag) fpsTag.textContent = Math.round(fpsCount / fpsTimer) + " FPS";
      fpsCount = 0;
      fpsTimer = 0;
    }

    renderer.render(scene, camera);
  }
  animate();
})(typeof window !== "undefined" ? window : this);
