// Quel LLM pour mon PC — processus principal Electron
// Détecte le matériel (GPU, VRAM, RAM, puce Apple) et récupère le catalogue de modèles mis à jour chaque jour.
const { app, BrowserWindow, ipcMain, shell, net, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFile } = require("child_process");
const pkg = require("../package.json");

const CATALOG_URL = pkg.catalogUrl;

function run(cmd, args, timeout = 8000) {
  return new Promise((resolve) => {
    try {
      execFile(cmd, args, { timeout, windowsHide: true, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) =>
        resolve(err ? "" : String(stdout))
      );
    } catch (e) {
      resolve("");
    }
  });
}

const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
const vendorOf = (name) =>
  /nvidia|geforce|rtx|gtx|quadro/i.test(name) ? "nvidia" : /amd|radeon/i.test(name) ? "amd" : /intel|arc/i.test(name) ? "intel" : "other";

async function detect() {
  const cpus = os.cpus();
  const info = {
    platform: process.platform,
    arch: os.arch(),
    ramGB: +(os.totalmem() / 2 ** 30).toFixed(1),
    cpu: (cpus[0] && cpus[0].model) || "",
    cores: cpus.length,
    gpus: [],
    appleChip: null,
    ddr: null,
  };

  // NVIDIA : nvidia-smi donne la VRAM exacte (Windows et Linux)
  const nv = await run("nvidia-smi", ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"]);
  nv.trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .forEach((line) => {
      const [name, mib] = line.split(",").map((s) => s.trim());
      if (name) info.gpus.push({ name, vramGB: Math.round(+mib / 1024) || 0, vendor: "nvidia", src: "nvidia-smi" });
    });

  if (process.platform === "darwin") {
    const brand = (await run("sysctl", ["-n", "machdep.cpu.brand_string"])).trim();
    if (brand) info.cpu = brand;
    const m = brand.match(/Apple (M\d+(?: Pro| Max| Ultra)?)/i);
    if (m) info.appleChip = m[1];
    if (!m) {
      // Mac Intel : carte graphique via system_profiler
      const sp = await run("system_profiler", ["SPDisplaysDataType", "-json"], 15000);
      try {
        (JSON.parse(sp).SPDisplaysDataType || []).forEach((d) => {
          const name = d.sppci_model || d._name || "";
          const vr = String(d.spdisplays_vram || d.spdisplays_vram_shared || "");
          const n = parseInt(vr, 10) || 0;
          info.gpus.push({ name, vramGB: /GB/i.test(vr) ? n : Math.round(n / 1024), vendor: vendorOf(name), src: "system_profiler" });
        });
      } catch (e) {}
    }
  } else if (process.platform === "win32") {
    // La VRAM fiable sous Windows se lit dans le registre (Win32_VideoController plafonne à 4 Go)
    const ps = `$ErrorActionPreference='SilentlyContinue';
$g=@();
Get-ItemProperty 'HKLM:\\SYSTEM\\ControlSet001\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0*' | ForEach-Object {
  if($_.DriverDesc){ $g += [pscustomobject]@{name=$_.DriverDesc; mem=[int64]$_.'HardwareInformation.qwMemorySize'} }
};
if($g.Count -eq 0){ Get-CimInstance Win32_VideoController | ForEach-Object { $g += [pscustomobject]@{name=$_.Name; mem=[int64]$_.AdapterRAM} } };
$m=@(Get-CimInstance Win32_PhysicalMemory | Select-Object -ExpandProperty SMBIOSMemoryType);
$c=(Get-CimInstance Win32_Processor | Select-Object -First 1 -ExpandProperty Name);
[pscustomobject]@{gpus=$g; mem=$m; cpu=$c} | ConvertTo-Json -Depth 4 -Compress`;
    const out = await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", ps], 20000);
    try {
      const j = JSON.parse(out);
      [].concat(j.gpus || []).forEach((x) => {
        if (!x || !x.name) return;
        if (info.gpus.some((g) => norm(g.name) === norm(x.name))) return;
        info.gpus.push({ name: x.name, vramGB: x.mem ? Math.round(x.mem / 2 ** 30) : 0, vendor: vendorOf(x.name), src: "registre" });
      });
      const types = [].concat(j.mem || []).map(Number);
      if (types.includes(34) || types.includes(35)) info.ddr = "DDR5";
      else if (types.includes(26)) info.ddr = "DDR4";
      if (j.cpu) info.cpu = String(j.cpu).trim();
    } catch (e) {}
  } else {
    // Linux : AMD via rocm-smi si présent
    const rocm = await run("rocm-smi", ["--showproductname", "--showmeminfo", "vram", "--json"]);
    try {
      const j = JSON.parse(rocm);
      Object.values(j).forEach((c) => {
        const name = c["Card series"] || c["Card model"] || "AMD GPU";
        const total = +c["VRAM Total Memory (B)"] || 0;
        info.gpus.push({ name, vramGB: Math.round(total / 2 ** 30), vendor: "amd", src: "rocm-smi" });
      });
    } catch (e) {}
  }
  return info;
}

const validCatalog = (c) => c && Array.isArray(c.models) && c.models.length > 0 && Array.isArray(c.gpus);
const cacheFile = () => path.join(app.getPath("userData"), "models.json");

async function getCatalog() {
  let bundled = null, cached = null;
  try { bundled = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "models.json"), "utf8")); } catch (e) {}
  try { cached = JSON.parse(fs.readFileSync(cacheFile(), "utf8")); } catch (e) {}
  if (CATALOG_URL) {
    try {
      const res = await net.fetch(CATALOG_URL + "?t=" + Date.now(), { cache: "no-store" });
      if (res.ok) {
        const remote = await res.json();
        if (validCatalog(remote)) {
          try { fs.writeFileSync(cacheFile(), JSON.stringify(remote)); } catch (e) {}
          return { catalog: remote, source: "en ligne" };
        }
      }
    } catch (e) {}
  }
  const best = [cached, bundled].filter(validCatalog).sort((a, b) => String(b.updated).localeCompare(String(a.updated)))[0];
  return { catalog: best, source: best === cached ? "hors ligne (dernière liste téléchargée)" : "hors ligne (liste intégrée)" };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 920,
    minWidth: 760,
    minHeight: 600,
    title: "Quel LLM pour mon PC",
    backgroundColor: "#f2f4f7",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadFile(path.join(__dirname, "index.html"));
  // Les liens externes s'ouvrent dans le navigateur
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith("file:")) { e.preventDefault(); shell.openExternal(url); } });
}

ipcMain.handle("detect", () => detect());
ipcMain.handle("catalog", () => getCatalog());
ipcMain.handle("version", () => app.getVersion());

app.whenReady().then(() => {
  if (process.platform !== "darwin") Menu.setApplicationMenu(null);
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
