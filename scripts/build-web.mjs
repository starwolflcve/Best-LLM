// Génère la version web autonome (catalogue intégré) dans dist-web/index.html
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "src", "index.html"), "utf8");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "data", "models.json"), "utf8"));
const inline = `<script>window.__CATALOG__=${JSON.stringify(catalog).replace(/</g, "\\u003c")};</script>`;
const out = html
  .replace(/<!--CSP-->[\s\S]*?<!--\/CSP-->\n?/, "")
  .replace("<!--CATALOG-->", inline);
fs.mkdirSync(path.join(root, "dist-web"), { recursive: true });
fs.writeFileSync(path.join(root, "dist-web", "index.html"), out);
console.log("dist-web/index.html écrit :", catalog.models.length, "modèles, liste du", catalog.updated);
