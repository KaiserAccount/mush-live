// Build-time model pipeline for MUSH. Visual only: nothing here touches the
// orders rail, camps, pin, sit/hunger, camp miles, or biome names.
//
// Every source is CC0. Each download is checked by sha256 before use. A model
// that fails to fetch or verify is skipped; the game draws its primitive
// fallback for that entity, so a bad mirror never breaks a deploy.
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { unzipSync } from "fflate";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune, dedup, weld, resample, quantize } from "@gltf-transform/functions";

const here = path.dirname(fileURLToPath(import.meta.url));
const outRoot = path.resolve(process.argv[2] || path.join(here, "..", "mush"));
const modelsDir = path.join(outRoot, "assets", "models");
const vendorDir = path.join(outRoot, "vendor", "three");

const PACKS = {
  husky: {
    urls: ["https://static.poly.pizza/611d25c7-430f-4bb5-ab2c-d8f5f3cb9712.glb"],
    sha256: "a1e107ec4c2c62ce8cad86f750a7f6f9f2065c691dc6f88fce39667d3f4877eb"
  },
  holiday: {
    urls: ["https://kenney.nl/media/pages/assets/holiday-kit/3976a6496a-1733923970/kenney_holiday-kit.zip"],
    sha256: "fde4d514d7297388d98058e8933ff614e071886f7ce57f9aea4b00d7698dd769"
  },
  nature: {
    urls: ["https://kenney.nl/media/pages/assets/nature-kit/37ac38a37b-1677698939/kenney_nature-kit.zip"],
    sha256: "fa7974a0d342bfe63c38664ba9f8ec1a4aab8ea25f099bdc56870e33588c4d9d"
  },
  mini: {
    urls: ["https://kenney.nl/media/pages/assets/mini-characters/bfc7e272b4-1774770718/kenney_mini-characters.zip"],
    sha256: "9e1d48e6d7b8479ebbe84df71eb5bd8e1b3f0da546dea641890dccc8a02d0999"
  }
};

// out name -> source. `keep` lists the only animation clips that ship.
// The husky's Death and Attack clips are dropped on purpose: dogs do not die.
const MODELS = [
  { out: "husky.glb", pack: "husky", keep: ["Gallop", "Gallop_Jump", "Idle", "Idle_2_HeadLow", "Eating", "Walk"] },
  { out: "sled.glb", pack: "holiday", entry: "Models/GLB format/sled-long.glb" },
  { out: "musher.glb", pack: "mini", entry: "Models/GLB format/character-female-b.glb", keep: ["static", "idle", "drive", "crouch", "jump"] },
  { out: "tree-snow-a.glb", pack: "holiday", entry: "Models/GLB format/tree-snow-a.glb" },
  { out: "tree-snow-b.glb", pack: "holiday", entry: "Models/GLB format/tree-snow-b.glb" },
  { out: "tree-snow-c.glb", pack: "holiday", entry: "Models/GLB format/tree-snow-c.glb" },
  { out: "rocks-small.glb", pack: "holiday", entry: "Models/GLB format/rocks-small.glb" },
  { out: "snow-pile.glb", pack: "holiday", entry: "Models/GLB format/snow-pile.glb" },
  { out: "lantern.glb", pack: "holiday", entry: "Models/GLB format/lantern.glb" },
  { out: "log.glb", pack: "nature", entry: "Models/GLTF format/log_large.glb" },
  { out: "branch.glb", pack: "nature", entry: "Models/GLTF format/log.glb" }
];

const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const cache = {};
async function fetchPack(name) {
  if (cache[name]) return cache[name];
  const pack = PACKS[name];
  let lastErr = "no url";
  for (const url of pack.urls) {
    try {
      const res = await fetch(url, { headers: { "user-agent": "mush-model-build" } });
      if (!res.ok) { lastErr = url + " " + res.status; continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      const h = sha(buf);
      if (h !== pack.sha256) { lastErr = url + " sha256 " + h; continue; }
      cache[name] = buf;
      return buf;
    } catch (err) {
      lastErr = url + " " + err.message;
    }
  }
  throw new Error(lastErr);
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

async function buildModel(spec, tmp) {
  const buf = await fetchPack(spec.pack);
  const work = fs.mkdtempSync(path.join(tmp, "m-"));
  let srcPath;
  if (!spec.entry) {
    srcPath = path.join(work, "src.glb");
    fs.writeFileSync(srcPath, buf);
  } else {
    const dir = path.posix.dirname(spec.entry);
    const files = unzipSync(new Uint8Array(buf), {
      filter: (f) => f.name === spec.entry || f.name.startsWith(dir + "/Textures/")
    });
    if (!files[spec.entry]) throw new Error("missing " + spec.entry);
    for (const [name, data] of Object.entries(files)) {
      if (name.endsWith("/")) continue;
      const rel = path.posix.relative(dir, name);
      const dest = path.join(work, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, data);
    }
    srcPath = path.join(work, path.posix.basename(spec.entry));
  }
  const doc = await io.read(srcPath);
  for (const anim of doc.getRoot().listAnimations()) {
    if (!spec.keep || !spec.keep.includes(anim.getName())) anim.dispose();
  }
  await doc.transform(prune(), dedup(), weld(), resample(), quantize());
  const glb = await io.writeBinary(doc);
  fs.writeFileSync(path.join(modelsDir, spec.out), glb);
  return { file: spec.out, bytes: glb.length, clips: doc.getRoot().listAnimations().map((a) => a.getName()) };
}

// three@0.160.0 ships GLTFLoader only as an ES module that imports "three".
// The game uses the global three.min.js build of the same version, so a shim
// re-exports window.THREE under the names these addons import.
function vendorThree() {
  const src = path.join(here, "node_modules", "three", "examples", "jsm");
  const files = ["loaders/GLTFLoader.js", "utils/BufferGeometryUtils.js", "utils/SkeletonUtils.js"];
  const names = new Set();
  for (const rel of files) {
    const text = fs.readFileSync(path.join(src, rel), "utf8");
    const re = /import\s*\{([^}]*)\}\s*from\s*['"]three['"]/g;
    let m;
    while ((m = re.exec(text))) m[1].split(",").map((s) => s.trim()).filter(Boolean).forEach((n) => names.add(n.split(/\s+as\s+/)[0]));
    const dest = path.join(vendorDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, text);
  }
  const list = [...names].sort();
  fs.writeFileSync(
    path.join(vendorDir, "three-shim.js"),
    "// Generated at build. Re-exports the global THREE (three.min.js r160) for ES module addons.\n" +
      "const T = window.THREE;\nexport const { " + list.join(", ") + " } = T;\nexport default T;\n"
  );
  return list.length;
}

fs.mkdirSync(modelsDir, { recursive: true });
fs.mkdirSync(vendorDir, { recursive: true });
const shimNames = vendorThree();
console.log("vendor three addons ok, shim names:", shimNames);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mush-models-"));
const built = [];
const skipped = [];
for (const spec of MODELS) {
  try {
    const r = await buildModel(spec, tmp);
    built.push(r);
    console.log("model ok", r.file, r.bytes, r.clips.join(","));
  } catch (err) {
    skipped.push({ file: spec.out, reason: err.message });
    console.log("model SKIPPED", spec.out, err.message);
  }
}
fs.writeFileSync(path.join(modelsDir, "manifest.json"), JSON.stringify({ built, skipped }, null, 2) + "\n");
console.log("models built", built.length, "skipped", skipped.length);
