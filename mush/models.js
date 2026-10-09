// MUSH model layer. Visual only.
// Swaps primitive meshes for CC0 GLB models at the same slots. Game logic
// (orders rail, camps, pin, sit/hunger, camp miles, biome names) never reads
// anything from here. If a model fails to load, its primitive stays on screen.
import { GLTFLoader } from "./vendor/three/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "./vendor/three/utils/SkeletonUtils.js";

const THREE = window.THREE;
// index.html is left byte-for-byte unchanged. Its top-level consts (scene,
// dogObjs, sled, ...) live in the shared global scope, so they are read here
// by name. server.js adds the <script type="module"> tag when serving it.
const G = (() => {
  try {
    return { scene, dogObjs, sled, basket, chest, rider, scarf, trees, obstacles };
  } catch (err) {
    console.warn("[mush] model layer off, game globals not found:", err.message);
    return null;
  }
})();
const BASE = "assets/models/";
const loader = new GLTFLoader();
const mixers = [];
const dogRigs = [];
const lamps = [];
let musherRig = null;
const protos = {};

function load(name) {
  return new Promise((resolve) => {
    loader.load(BASE + name, (gltf) => resolve(gltf), undefined, (err) => {
      console.warn("[mush] model fallback:", name, err && err.message ? err.message : err);
      resolve(null);
    });
  });
}

function shadows(root) {
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return root;
}

// Skinned meshes (the husky, the musher) get their size from the posed
// skeleton, not the node transform, so bones are updated before measuring.
function measure(root, box) {
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (o.isSkinnedMesh) {
      o.skeleton.update();
      o.computeBoundingBox();
    }
  });
  return (box || new THREE.Box3()).setFromObject(root);
}

// Wrap a model so it faces -z (direction of travel), is scaled so `axis`
// measures `size`, sits on y=0, and is centered on x/z.
function fit(model, opts) {
  const wrap = new THREE.Group();
  const inner = new THREE.Group();
  inner.add(model);
  inner.rotation.y = opts.yaw || 0;
  wrap.add(inner);
  const box = measure(wrap);
  const dim = box.getSize(new THREE.Vector3());
  const k = opts.size / dim[opts.axis];
  const s = opts.scale ? opts.scale.clone().multiplyScalar(k) : new THREE.Vector3(k, k, k);
  inner.scale.copy(s);
  measure(wrap, box);
  const c = box.getCenter(new THREE.Vector3());
  inner.position.set(-c.x, -box.min.y, -c.z);
  return shadows(wrap);
}

function actionsFor(root, clips) {
  const mixer = new THREE.AnimationMixer(root);
  mixers.push(mixer);
  const actions = {};
  clips.forEach((clip) => { actions[clip.name] = mixer.clipAction(clip); });
  return { mixer, actions, current: null };
}

function play(rig, name, fade) {
  if (!rig || rig.current === name || !rig.actions[name]) return;
  const next = rig.actions[name];
  const prev = rig.current ? rig.actions[rig.current] : null;
  next.reset().setEffectiveWeight(1).fadeIn(fade || 0.2).play();
  if (prev) prev.fadeOut(fade || 0.2);
  rig.current = name;
}

function hidePrimitives(group, keep) {
  group.children.forEach((child) => { if (!keep || keep.indexOf(child) === -1) child.visible = false; });
}

async function setupDogs() {
  const gltf = await load("husky.glb");
  if (!gltf) return;
  G.dogObjs.forEach((dog, i) => {
    const raw = cloneSkinned(gltf.scene);
    // Tint the darker saddle coat toward each dog's roster color so the line
    // still reads Red / Hinge / Pip / ... at a glance.
    const tint = new THREE.Color(dog.spec.color);
    raw.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const next = mats.map((m) => {
        const c = m.clone();
        const l = m.color.r + m.color.g + m.color.b;
        if (l > 0.1 && l < 1.5) c.color.lerp(tint, 0.7);
        else if (l >= 1.5) c.color.lerp(tint, 0.25);
        return c;
      });
      o.material = Array.isArray(o.material) ? next : next[0];
    });
    const size = dog.spec.short ? 0.8 : 1.0;
    const wrap = fit(raw, { axis: "z", size: size, yaw: Math.PI });
    hidePrimitives(dog.mesh);
    dog.mesh.add(wrap);
    const rig = actionsFor(raw, gltf.animations);
    rig.phase = Math.random() * 2;
    dogRigs[i] = rig;
    play(rig, "Gallop", 0);
    if (rig.actions.Gallop) rig.actions.Gallop.time = rig.phase;
  });
}

async function setupSled() {
  const gltf = await load("sled.glb");
  if (!gltf) return;
  const wrap = fit(gltf.scene, { axis: "z", size: 1.4, yaw: Math.PI });
  G.basket.material.visible = false;
  G.basket.castShadow = false;
  G.sled.add(wrap);
  // Keep the live cargo chest (canvas label) riding on the sled bed.
  G.basket.position.y = 0.26;
}

async function setupMusher() {
  const gltf = await load("musher.glb");
  if (!gltf) return;
  const wrap = fit(gltf.scene, { axis: "y", size: 0.86, yaw: Math.PI });
  wrap.position.set(0, 0.3, 0.42);
  G.rider.visible = false;
  G.scarf.visible = false;
  G.sled.add(wrap);
  musherRig = actionsFor(gltf.scene, gltf.animations);
  play(musherRig, gltf.animations.some((a) => a.name === "idle") ? "idle" : "static", 0);
}

async function setupTrees() {
  const kinds = await Promise.all(["tree-snow-a.glb", "tree-snow-b.glb", "tree-snow-c.glb"].map(load));
  const trees = kinds.filter(Boolean);
  const rocks = await load("rocks-small.glb");
  const pile = await load("snow-pile.glb");
  if (!trees.length) return;
  G.trees.forEach((t, i) => {
    const src = trees[i % trees.length].scene.clone();
    const h = 2.3 * (0.85 + ((i * 37) % 10) / 22);
    const wrap = fit(src, { axis: "y", size: h });
    wrap.rotation.y = (i * 1.7) % (Math.PI * 2);
    hidePrimitives(t);
    t.add(wrap);
    const extra = i % 3 === 0 ? rocks : i % 3 === 1 ? pile : null;
    if (extra) {
      const e = fit(extra.scene.clone(), { axis: "x", size: extra === rocks ? 0.7 : 1.1 });
      e.position.set(t.position.x < 0 ? 0.9 : -0.9, 0, 0.4);
      t.add(e);
    }
  });
}

async function setupObstacles() {
  const [log, branch] = await Promise.all([load("log.glb"), load("branch.glb")]);
  if (log) protos.log = fit(log.scene, { axis: "x", size: 1.5, scale: new THREE.Vector3(1, 0.75, 0.75) });
  if (branch) {
    const b = fit(branch.scene, { axis: "x", size: 1.6, yaw: Math.PI / 2, scale: new THREE.Vector3(1, 0.45, 0.45) });
    b.position.y = 0.95;
    protos.branch = b;
  }
}

async function setupLamps() {
  const gltf = await load("lantern.glb");
  if (!gltf) return;
  for (let i = 0; i < 6; i++) {
    const lamp = fit(gltf.scene.clone(), { axis: "y", size: 1.9 });
    lamp.position.set(i % 2 === 0 ? -3.2 : 3.2, 0, -i * 7.5);
    lamp.visible = false;
    G.scene.add(lamp);
    lamps.push(lamp);
  }
}

const MushModels = {
  // Returns a fresh model for a log or branch, or null to keep the primitive
  // (always null for the ice gap).
  obstacle(kind) {
    const p = protos[kind];
    return p ? p.clone() : null;
  },
  update(dt, s) {
    G.dogObjs.forEach((dog, i) => {
      const rig = dogRigs[i];
      if (!rig) return;
      let name = "Gallop";
      if (!s.alive || dog.basket > 0) name = "Idle";
      else if (dog.hunger > 0.72) name = "Walk";
      play(rig, name);
      if (rig.actions.Gallop) rig.actions.Gallop.timeScale = 0.8 + s.speed / 40;
    });
    if (musherRig) play(musherRig, s.jumping > 0 && musherRig.actions.jump ? "jump" : (musherRig.actions.idle ? "idle" : "static"));
    const lit = s.biome === "Night Lamp" || s.biome === "Village";
    lamps.forEach((lamp) => {
      lamp.visible = lit;
      lamp.position.z += dt * s.speed;
      if (lamp.position.z > 8) lamp.position.z -= 45;
    });
    mixers.forEach((m) => m.update(dt));
  }
};

window.MushModels = MushModels;

// Hook 1: obstacles. fillObstacle is a top-level function declaration, so it
// is a writable property of window and spawn() picks up this wrapper. Same
// slot, same kind, same lane and collision math; only the mesh differs.
function hookObstacles() {
  const original = window.fillObstacle;
  if (typeof original !== "function") return;
  window.fillObstacle = function (slot, kind) {
    const model = MushModels.obstacle(kind);
    if (!model) return original(slot, kind);
    while (slot.mesh.children.length) slot.mesh.remove(slot.mesh.children[0]);
    slot.mesh.add(model);
    slot.kind = kind;
  };
}

// Hook 2: per-frame animation. Runs just before each render; reads game state
// (alive, jumping, speed, mile) and never writes it.
function hookFrame() {
  const original = renderer.render.bind(renderer);
  let lastT = performance.now();
  renderer.render = function (sc, cam) {
    const now = performance.now();
    const dt = Math.min(0.033, (now - lastT) / 1000);
    lastT = now;
    try {
      MushModels.update(dt, { alive: alive, jumping: jumping, speed: speed, biome: biomeAt(mile).name });
    } catch (err) {
      // Visual layer only; a bad frame here must never stop the game.
    }
    return original(sc, cam);
  };
}

if (G) {
  hookObstacles();
  hookFrame();
  Promise.all([setupDogs(), setupSled(), setupMusher(), setupTrees(), setupObstacles(), setupLamps()])
    .then(() => console.log("[mush] models ready"))
    .catch((err) => console.warn("[mush] model layer error, primitives stay:", err));
}
