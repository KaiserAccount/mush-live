const http = require("http");
const fs = require("fs");
const path = require("path");

const port = Number(process.env.PORT) || 8080;
const root = path.join(__dirname, "mush");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".glb": "model/gltf-binary"
};

function configScript() {
  const url = process.env.SUPABASE_URL || "";
  const anonKey = process.env.SUPABASE_ANON_KEY || "";
  const ready = Boolean(url && anonKey);
  const value = ready ? { url: url, anonKey: anonKey } : null;
  return "window.MUSH_SUPABASE=" + JSON.stringify(value) + ";\n";
}

// The 3D model layer (mush/models.js) is added to the page here so the game
// file itself stays untouched. If models.js or a .glb is missing, the game
// keeps its primitive meshes.
const modelTags =
  '<script type="importmap">{ "imports": { "three": "./vendor/three/three-shim.js" } }</script>\n' +
  '<script type="module" src="models.js"></script>\n';
function withModels(buf) {
  if (!fs.existsSync(path.join(root, "models.js"))) return buf;
  const html = buf.toString("utf8");
  const at = html.lastIndexOf("</body>");
  return at === -1 ? buf : html.slice(0, at) + modelTags + html.slice(at);
}

const server = http.createServer((req, res) => {
  const pathname = (req.url || "/").split("?")[0];
  if (pathname === "/config.js") {
    res.writeHead(200, {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-store"
    });
    res.end(configScript());
    return;
  }
  const rel = pathname === "/" ? "/index.html" : pathname;
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("not found");
      return;
    }
    const type = types[path.extname(file)] || "application/octet-stream";
    res.writeHead(200, { "content-type": type, "cache-control": "no-cache" });
    res.end(rel === "/index.html" ? withModels(data) : data);
  });
});

server.listen(port, () => {
  process.stdout.write("mush listening on " + port + "\n");
});
