// Vérifie data/models.json avant chaque mise à jour
import fs from "node:fs";
const c = JSON.parse(fs.readFileSync(new URL("../data/models.json", import.meta.url), "utf8"));
const errs = [];
if (!/^\d{4}-\d{2}-\d{2}$/.test(c.updated)) errs.push("updated doit être AAAA-MM-JJ");
const ids = new Set();
for (const m of c.models || []) {
  const where = m.id || m.name || "?";
  for (const k of ["id", "name", "org", "disp", "lic", "hf", "note"]) if (typeof m[k] !== "string" || !m[k]) errs.push(`${where} : champ ${k} manquant`);
  for (const k of ["p", "a", "kv", "q"]) if (typeof m[k] !== "number" || !(m[k] >= 0)) errs.push(`${where} : ${k} doit être un nombre`);
  if (m.a > m.p) errs.push(`${where} : a (actifs) > p (total)`);
  if (m.q > 100) errs.push(`${where} : q > 100`);
  if (!Array.isArray(m.tags)) errs.push(`${where} : tags doit être une liste`);
  if (ids.has(m.id)) errs.push(`id en double : ${m.id}`);
  ids.add(m.id);
}
if ((c.models || []).length < 5) errs.push("moins de 5 modèles");
for (const k of ["gpus", "macs", "unified", "quants"]) if (!Array.isArray(c[k]) || !c[k].length) errs.push(`${k} manquant`);
if (errs.length) { console.error("Catalogue invalide :\n- " + errs.join("\n- ")); process.exit(1); }
console.log(`Catalogue valide : ${c.models.length} modèles, liste du ${c.updated}`);
