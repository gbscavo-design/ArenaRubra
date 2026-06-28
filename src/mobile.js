"use strict";

// Arena Rubra – APK-M4c/F9E1 Fixed Mobile Game Layout / Panel bridge.
// UI mobile dedicata sopra lo stesso motore: pagina bloccata, mappa centrata,
// camera a preset, pannelli bottom-sheet per mano/log/opzioni e scheda unità flottante sulla mappa.
// Nessuna modifica a gameplay, AI, deck, tattiche o bilanciamento.

const APK_M4_MOBILE_QUERY = "(pointer: coarse), (max-width: 980px), (max-height: 560px)";
const APK_M4_BOARD_W = 920;
const APK_M4_BOARD_H = 780;
const APK_M4_CAMERA_ZOOMS = Object.freeze({ fit: 1, play: 1.22, focus: 1.55 });

const apkM4Camera = {
  mobile: false,
  fitScale: 1,
  zoom: 1,
  x: 0,
  y: 0,
  mode: "fit",
  panel: null,
  lastSelectedId: null,
  renderPatched: false
};

function apkM4MobileMediaMatches() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(APK_M4_MOBILE_QUERY).matches;
}

function apkM4IsLandscape() {
  if (typeof window === "undefined") return true;
  return window.innerWidth >= window.innerHeight;
}

function apkM4Clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function setApkM4BodyClasses() {
  if (typeof document === "undefined" || !document.body) return false;
  const mobile = apkM4MobileMediaMatches();
  const landscape = apkM4IsLandscape();
  apkM4Camera.mobile = mobile;

  // M4 sostituisce i layout mobili precedenti. Le classi vecchie vengono rimosse
  // per evitare conflitti tra fullscreen M2, scroll M2b e fixed-layout M4.
  document.body.classList.toggle("mobile-apk-m1", false);
  document.body.classList.toggle("mobile-apk-m2", false);
  document.body.classList.toggle("mobile-apk-m2b", false);
  document.documentElement.classList.toggle("mobile-apk-m4-root", mobile);
  document.body.classList.toggle("mobile-apk-m4", mobile);
  document.body.classList.toggle("mobile-landscape", mobile && landscape);
  document.body.classList.toggle("mobile-portrait", mobile && !landscape);
  if (!mobile) {
    document.body.classList.remove("mobile-panel-hand", "mobile-panel-command", "mobile-panel-actions", "mobile-panel-log", "mobile-panel-setup", "mobile-panel-stats");
  }
  return mobile;
}

function ensureApkM4Shell() {
  if (typeof document === "undefined") return;
  if (!document.getElementById("mobileStatusStrip")) {
    const status = document.createElement("div");
    status.id = "mobileStatusStrip";
    status.className = "mobileStatusStrip";
    status.textContent = (typeof buildInfoShortStageLabel === "function" ? buildInfoShortStageLabel() : "Arena Rubra");
    document.body.appendChild(status);
  }
  if (!document.getElementById("mobileGameBar")) {
    const nav = document.createElement("nav");
    nav.id = "mobileGameBar";
    nav.className = "mobileGameBar";
    nav.setAttribute("aria-label", "Comandi rapidi mobile");
    nav.innerHTML = `
      <button type="button" data-apk-m4-action="fit">Fit</button>
      <button type="button" data-apk-m4-action="play">Focus</button>
      <button type="button" data-apk-m4-action="actions">Azioni</button>
      <button type="button" data-apk-m4-action="hand">Mano</button>
      <button type="button" data-apk-m4-action="log">Log</button>
      <button type="button" data-apk-m4-action="setup">Opz</button>
    `;
    document.body.appendChild(nav);
  }
}

function apkM4PanelElements() {
  return {
    hand: document.querySelector(".handPrimaryDock"),
    actions: document.querySelector(".tacticDock"),
    log: document.querySelector(".logPanel"),
    setup: document.querySelector(".setupPanel"),
    stats: document.querySelector(".statsPanel")
  };
}

function showApkM4SelectedUnitFloat() {
  closeApkM4Panel();
  if (typeof expandSelectedUnitFloat === "function") expandSelectedUnitFloat();
  if (typeof centerApkM4CameraOn === "function") centerApkM4CameraOn(apkM4FocusCoord());
}

function setApkM4Panel(panel, options = {}) {
  if (typeof document === "undefined" || !document.body) return;
  if (!apkM4Camera.mobile) return;
  let requested = panel;
  if (requested === "command") requested = options.scrollTo === "logDock" || options.scrollTo === "log" ? "log" : "actions";
  const next = apkM4Camera.panel === requested && !options.force ? null : requested;
  apkM4Camera.panel = next;
  document.body.classList.remove("mobile-hand-play-started");
  document.body.classList.toggle("mobile-panel-hand", next === "hand");
  document.body.classList.toggle("mobile-panel-command", false);
  document.body.classList.toggle("mobile-panel-actions", next === "actions");
  document.body.classList.toggle("mobile-panel-log", next === "log");
  document.body.classList.toggle("mobile-panel-setup", next === "setup");
  document.body.classList.toggle("mobile-panel-stats", next === "stats");

  if (next === "setup") {
    const details = document.getElementById("gameOptionsDetails");
    if (details) details.setAttribute("open", "open");
  }
  if (next === "stats") {
    const details = document.getElementById("statsDetails");
    if (details) details.setAttribute("open", "open");
  }

  window.requestAnimationFrame(() => {
    fitApkM4Board({ preserveCamera:true });
    if (options.scrollTo) {
      const target = document.getElementById(options.scrollTo);
      if (target) {
        const scroller = target.closest(".body, .cardZonePanel, #log") || target;
        if (scroller && typeof scroller.scrollTop === "number") scroller.scrollTop = 0;
        else if (typeof target.scrollIntoView === "function") target.scrollIntoView({ block:"start", inline:"nearest", behavior:"smooth" });
      }
    }
  });
}

function closeApkM4Panel() {
  apkM4Camera.panel = null;
  if (!document.body) return;
  document.body.classList.remove("mobile-panel-hand", "mobile-panel-command", "mobile-panel-actions", "mobile-panel-log", "mobile-panel-setup", "mobile-panel-stats", "mobile-hand-play-started");
  window.requestAnimationFrame(() => fitApkM4Board({ preserveCamera:true }));
}

function apkM4CloseHandAfterCardPlay() {
  if (!apkM4Camera.mobile || typeof document === "undefined" || !document.body) return;
  document.body.classList.add("mobile-hand-play-started");
  apkM4Camera.panel = null;
  document.body.classList.remove("mobile-panel-hand", "mobile-panel-command", "mobile-panel-actions", "mobile-panel-log", "mobile-panel-setup", "mobile-panel-stats");
  window.requestAnimationFrame(() => {
    document.body.classList.remove("mobile-hand-play-started");
    fitApkM4Board({ preserveCamera:true });
  });
}

function apkM4BoardPointForCoord(coord) {
  if (!Array.isArray(coord)) return { x: APK_M4_BOARD_W / 2, y: APK_M4_BOARD_H / 2 };
  const q = coord[0];
  const r = coord[2];
  return {
    x: CENTER_X + HEX_SIZE * Math.sqrt(3) * (q + r / 2),
    y: CENTER_Y + HEX_SIZE * 1.5 * r
  };
}

function apkM4FocusCoord() {
  if (typeof getSelectedUnit === "function") {
    const selected = getSelectedUnit();
    if (selected && selected.pos) return selected.pos;
  }
  if (typeof state !== "undefined" && state && state.currentPlayer && typeof getHq === "function") {
    const hq = getHq(state.currentPlayer);
    if (hq && hq.pos) return hq.pos;
  }
  return CENTER_PS_COORD;
}

function clampApkM4Camera() {
  const wrap = document.getElementById("boardWrap");
  if (!wrap) return;
  const rect = wrap.getBoundingClientRect();
  const scale = apkM4Camera.fitScale * apkM4Camera.zoom;
  const visualW = APK_M4_BOARD_W * scale;
  const visualH = APK_M4_BOARD_H * scale;
  const extraX = Math.max(0, (visualW - rect.width) / 2);
  const extraY = Math.max(0, (visualH - rect.height) / 2);
  const margin = 18;
  apkM4Camera.x = apkM4Clamp(apkM4Camera.x, -(extraX + margin), extraX + margin);
  apkM4Camera.y = apkM4Clamp(apkM4Camera.y, -(extraY + margin), extraY + margin);
}

function applyApkM4Camera() {
  const board = document.getElementById("board");
  const wrap = document.getElementById("boardWrap");
  if (!board || !wrap) return;
  if (!apkM4Camera.mobile) {
    board.style.setProperty("--board-fit-scale", "1");
    board.style.setProperty("--board-camera-x", "0px");
    board.style.setProperty("--board-camera-y", "0px");
    wrap.style.removeProperty("--board-visual-width");
    wrap.style.removeProperty("--board-visual-height");
    return;
  }
  clampApkM4Camera();
  const totalScale = apkM4Camera.fitScale * apkM4Camera.zoom;
  board.style.setProperty("--board-fit-scale", String(totalScale.toFixed(4)));
  board.style.setProperty("--board-camera-x", `${Math.round(apkM4Camera.x)}px`);
  board.style.setProperty("--board-camera-y", `${Math.round(apkM4Camera.y)}px`);
  wrap.style.setProperty("--board-visual-width", `${Math.round(APK_M4_BOARD_W * totalScale)}px`);
  wrap.style.setProperty("--board-visual-height", `${Math.round(APK_M4_BOARD_H * totalScale)}px`);
}

function fitApkM4Board(options = {}) {
  const mobile = setApkM4BodyClasses();
  const wrap = document.getElementById("boardWrap");
  if (!wrap) return 1;
  if (!mobile) {
    apkM4Camera.fitScale = 1;
    apkM4Camera.zoom = 1;
    apkM4Camera.x = 0;
    apkM4Camera.y = 0;
    applyApkM4Camera();
    return 1;
  }

  const rect = wrap.getBoundingClientRect();
  const pad = apkM4IsLandscape() ? 8 : 12;
  const availableW = Math.max(220, rect.width - pad);
  const availableH = Math.max(180, rect.height - pad);
  apkM4Camera.fitScale = Math.max(0.26, Math.min(1, availableW / APK_M4_BOARD_W, availableH / APK_M4_BOARD_H));

  if (!options.preserveCamera) {
    apkM4Camera.zoom = APK_M4_CAMERA_ZOOMS[apkM4Camera.mode] || 1;
    if (apkM4Camera.mode === "focus") centerApkM4CameraOn(apkM4FocusCoord(), { keepZoom:true });
    else { apkM4Camera.x = 0; apkM4Camera.y = 0; }
  }
  applyApkM4Camera();
  updateApkM4StatusStrip();
  return apkM4Camera.fitScale;
}

function setApkM4CameraMode(mode) {
  if (!apkM4Camera.mobile) return;
  apkM4Camera.mode = mode;
  apkM4Camera.zoom = APK_M4_CAMERA_ZOOMS[mode] || 1;
  if (mode === "focus") centerApkM4CameraOn(apkM4FocusCoord(), { keepZoom:true });
  else {
    apkM4Camera.x = 0;
    apkM4Camera.y = 0;
    applyApkM4Camera();
  }
  updateApkM4StatusStrip();
}

function centerApkM4CameraOn(coord, options = {}) {
  if (!apkM4Camera.mobile) return;
  if (!options.keepZoom) apkM4Camera.zoom = APK_M4_CAMERA_ZOOMS.focus;
  const p = apkM4BoardPointForCoord(coord || CENTER_PS_COORD);
  const scale = apkM4Camera.fitScale * apkM4Camera.zoom;
  apkM4Camera.x = (APK_M4_BOARD_W / 2 - p.x) * scale;
  apkM4Camera.y = (APK_M4_BOARD_H / 2 - p.y) * scale;
  applyApkM4Camera();
}

function updateApkM4StatusStrip() {
  const el = document.getElementById("mobileStatusStrip");
  if (!el) return;
  if (!apkM4Camera.mobile) {
    el.textContent = "";
    return;
  }
  if (typeof state === "undefined" || !state) {
    el.textContent = (typeof buildInfoShortStageLabel === "function" ? buildInfoShortStageLabel() : "Arena Rubra · Starter Game");
    return;
  }
  const p = state.currentPlayer || 1;
  const p1Ps = typeof countControlledPS === "function" ? countControlledPS(1) : 0;
  const p2Ps = typeof countControlledPS === "function" ? countControlledPS(2) : 0;
  const p1 = state.factions && state.factions[1] ? state.factions[1] : "G1";
  const p2 = state.factions && state.factions[2] ? state.factions[2] : "G2";
  const current = typeof playerName === "function" ? playerName(p) : `G${p}`;
  el.textContent = `R${state.turn || 0} · ${current} · ENE ${state.energy ? state.energy[p] : 0} · PS ${p1Ps}-${p2Ps} · PR ${state.pressure ? state.pressure[1] || 0 : 0}/${state.pressure ? state.pressure[2] || 0 : 0} · ${p1} vs ${p2}`;
}

function bindApkM4ShellControls() {
  if (typeof document === "undefined") return;
  ensureApkM4Shell();
  const nav = document.getElementById("mobileGameBar");
  if (nav && nav.dataset.apkM4Bound !== "1") {
    nav.dataset.apkM4Bound = "1";
    nav.addEventListener("click", ev => {
      const btn = ev.target && ev.target.closest ? ev.target.closest("button[data-apk-m4-action]") : null;
      if (!btn) return;
      const action = btn.dataset.apkM4Action;
      if (action === "fit") { closeApkM4Panel(); setApkM4CameraMode("fit"); return; }
      if (action === "play") { closeApkM4Panel(); setApkM4CameraMode("focus"); return; }
      if (action === "unit") { showApkM4SelectedUnitFloat(); return; }
      if (action === "actions") { setApkM4Panel("actions", { force:true, scrollTo:"tacticPanel" }); return; }
      if (action === "hand") { setApkM4Panel("hand", { force:true, scrollTo:"cardZonePanel" }); return; }
      if (action === "log") { if (typeof setLogDockCollapsed === "function") setLogDockCollapsed(false); setApkM4Panel("log", { force:true, scrollTo:"log" }); return; }
      if (action === "setup") { setApkM4Panel("setup", { force:true, scrollTo:"gameOptionsDetails" }); return; }
    });
  }

  // Vecchi bottoni M2/M2b dentro la mappa: in M4 restano nascosti ma, se presenti,
  // vengono comunque collegati a funzioni stabili.
  const fitBtn = document.getElementById("fitBoardBtn");
  if (fitBtn && fitBtn.dataset.apkM4Bound !== "1") {
    fitBtn.dataset.apkM4Bound = "1";
    fitBtn.addEventListener("click", () => setApkM4CameraMode("fit"));
  }
  const zoomIn = document.getElementById("zoomInBoardBtn");
  if (zoomIn && zoomIn.dataset.apkM4Bound !== "1") {
    zoomIn.dataset.apkM4Bound = "1";
    zoomIn.addEventListener("click", () => setApkM4CameraMode("play"));
  }
  const zoomOut = document.getElementById("zoomOutBoardBtn");
  if (zoomOut && zoomOut.dataset.apkM4Bound !== "1") {
    zoomOut.dataset.apkM4Bound = "1";
    zoomOut.addEventListener("click", () => setApkM4CameraMode("fit"));
  }
  const handDrawer = document.getElementById("openHandDrawerBtn");
  if (handDrawer && handDrawer.dataset.apkM4Bound !== "1") {
    handDrawer.dataset.apkM4Bound = "1";
    handDrawer.addEventListener("click", () => setApkM4Panel("hand", { force:true, scrollTo:"cardZonePanel" }));
  }
  const commandDrawer = document.getElementById("openCommandDrawerBtn");
  if (commandDrawer && commandDrawer.dataset.apkM4Bound !== "1") {
    commandDrawer.dataset.apkM4Bound = "1";
    commandDrawer.addEventListener("click", () => setApkM4Panel("actions", { force:true, scrollTo:"tacticPanel" }));
  }
  const setupDrawer = document.getElementById("openSetupDrawerBtn");
  if (setupDrawer && setupDrawer.dataset.apkM4Bound !== "1") {
    setupDrawer.dataset.apkM4Bound = "1";
    setupDrawer.addEventListener("click", () => setApkM4Panel("setup", { force:true, scrollTo:"gameOptionsDetails" }));
  }
}

function patchApkM4RenderRefresh() {
  if (typeof renderAll !== "function" || renderAll.apkM4Patched) return;
  const originalRenderAll = renderAll;
  renderAll = function patchedRenderAll() {
    const result = originalRenderAll.apply(this, arguments);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        const wasSelected = apkM4Camera.lastSelectedId;
        const selected = typeof getSelectedUnit === "function" ? getSelectedUnit() : null;
        apkM4Camera.lastSelectedId = selected ? selected.uid : null;
        updateApkM4StatusStrip();
        fitApkM4Board({ preserveCamera:true });
        if (apkM4Camera.mobile && selected && selected.uid !== wasSelected) {
          if (typeof expandSelectedUnitFloat === "function") expandSelectedUnitFloat();
          centerApkM4CameraOn(selected.pos);
        }
      });
    }
    return result;
  };
  renderAll.apkM4Patched = true;
}

function initApkM4MobileLayout() {
  if (typeof window === "undefined") return;
  ensureApkM4Shell();
  bindApkM4ShellControls();
  patchApkM4RenderRefresh();
  fitApkM4Board({ preserveCamera:false });
  updateApkM4StatusStrip();

  window.addEventListener("resize", () => fitApkM4Board({ preserveCamera:false }), { passive:true });
  window.addEventListener("orientationchange", () => setTimeout(() => fitApkM4Board({ preserveCamera:false }), 160), { passive:true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => fitApkM4Board({ preserveCamera:false }), { passive:true });
  }
  if (typeof window.matchMedia === "function") {
    const mq = window.matchMedia(APK_M4_MOBILE_QUERY);
    if (typeof mq.addEventListener === "function") mq.addEventListener("change", () => fitApkM4Board({ preserveCamera:false }));
  }
}

initApkM4MobileLayout();
