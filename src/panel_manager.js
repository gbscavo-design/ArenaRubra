"use strict";

// Arena Rubra – F9E1 HUD & Panel Usability Hotfix.
// UI-only: fix robustezza PanelManager e ritorno alla mappa.
// Non modifica regole, stato logico, AI, deck, tattiche, mappa o input di gioco.

const gamePanelManagerState = {
  currentPanel: null,
  initialized: false
};

const GAME_PANEL_DEFS = Object.freeze({
  hand: { selector: ".handPrimaryDock", focusId: "cardZonePanel", title: "Mano", placement: "side" },
  actions: { selector: ".tacticDock", focusId: "tacticPanel", title: "Tattiche", placement: "side" },
  log: { selector: "#logDock", focusId: "log", title: "Log", placement: "bottom" },
  setup: { selector: ".setupPanel", focusId: "gameOptionsDetails", title: "Setup", placement: "bottom" },
  stats: { selector: ".statsPanel", focusId: "matchupStatsPanel", title: "Statistiche", placement: "bottom" },
  market: { selector: ".marketDebugDock", focusId: "unitMarketDetails", title: "Mercato", placement: "bottom" }
});

function isApkM4MobileActive() {
  return typeof document !== "undefined" && document.body && document.body.classList.contains("mobile-apk-m4");
}

function panelDefinition(panelName) {
  return GAME_PANEL_DEFS[panelName] || null;
}

function panelElementFor(panelName) {
  const def = panelDefinition(panelName);
  if (!def || typeof document === "undefined") return null;
  return document.querySelector(def.selector);
}

function setGamePanelScrimVisible(visible) {
  const scrim = typeof document !== "undefined" ? document.getElementById("gamePanelScrim") : null;
  if (!scrim) return;
  scrim.hidden = !visible;
  scrim.setAttribute("aria-hidden", visible ? "false" : "true");
}

function ensureGamePanelCloseButton(panelEl) {
  if (!panelEl || panelEl.querySelector(".panelManagerCloseBtn")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ghost compactIconBtn panelManagerCloseBtn";
  btn.setAttribute("aria-label", "Chiudi pannello");
  btn.textContent = "×";
  btn.addEventListener("click", ev => {
    ev.preventDefault();
    ev.stopPropagation();
    closeGamePanel();
  });
  panelEl.appendChild(btn);
}

function clearActiveGamePanel() {
  if (typeof document === "undefined") return;
  document.querySelectorAll(".managedGamePanel.panelOverlayActive").forEach(el => {
    el.classList.remove("panelOverlayActive");
    el.removeAttribute("data-active-game-panel");
  });
  if (document.body) {
    document.body.classList.remove("game-panel-open");
    document.body.removeAttribute("data-game-panel-current");
    document.body.removeAttribute("data-game-panel-placement");
  }
  setGamePanelScrimVisible(false);
  gamePanelManagerState.currentPanel = null;
}

function closeGamePanel() {
  clearActiveGamePanel();
}

function closeAnyGamePanelForMapReturn() {
  // F9E1: uscita robusta verso la mappa. Non dipende da currentPanel,
  // così funziona anche se un pannello è stato aperto prima di una init completa.
  clearActiveGamePanel();
}

function focusInsidePanel(panelName, focusId) {
  if (typeof document === "undefined") return;
  const def = panelDefinition(panelName);
  const targetId = focusId || (def && def.focusId);
  if (!targetId) return;
  const target = document.getElementById(targetId);
  if (!target) return;

  if (target.tagName && target.tagName.toLowerCase() === "details") target.setAttribute("open", "open");
  const parentDetails = target.closest ? target.closest("details") : null;
  if (parentDetails) parentDetails.setAttribute("open", "open");

  window.requestAnimationFrame(() => {
    const activePanel = panelElementFor(panelName);
    const scroller = activePanel && activePanel.classList.contains("panelOverlayActive") ? activePanel : null;
    if (scroller && typeof scroller.scrollTop === "number") {
      const panelRect = scroller.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      scroller.scrollTop += targetRect.top - panelRect.top - 48;
    } else if (typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
    }
  });
}

function openMobileGamePanel(panelName, options = {}) {
  if (typeof setApkM4Panel !== "function") return false;
  if (panelName === "hand") {
    setApkM4Panel("hand", { force: true, scrollTo: options.focusId || "cardZonePanel" });
    return true;
  }
  if (panelName === "actions") {
    setApkM4Panel("actions", { force: true, scrollTo: options.focusId || "tacticPanel" });
    return true;
  }
  if (panelName === "log") {
    if (typeof setLogDockCollapsed === "function") setLogDockCollapsed(false);
    setApkM4Panel("log", { force: true, scrollTo: options.focusId || "log" });
    return true;
  }
  if (panelName === "setup") {
    setApkM4Panel("setup", { force: true, scrollTo: options.focusId || "gameOptionsDetails" });
    return true;
  }
  if (panelName === "stats") {
    setApkM4Panel("stats", { force: true, scrollTo: options.focusId || "matchupStatsPanel" });
    return true;
  }
  return false;
}

function openGamePanel(panelName, options = {}) {
  if (!panelName || typeof document === "undefined" || !document.body) return;

  if (panelName === "unit") {
    closeGamePanel();
    if (typeof expandSelectedUnitFloat === "function") expandSelectedUnitFloat();
    return;
  }

  if (isApkM4MobileActive() && openMobileGamePanel(panelName, options)) return;

  const def = panelDefinition(panelName);
  const panelEl = panelElementFor(panelName);
  if (!def || !panelEl) return;

  clearActiveGamePanel();

  if (panelName === "log" && typeof setLogDockCollapsed === "function") setLogDockCollapsed(false);
  if (panelName === "setup" && typeof document.getElementById === "function") {
    const details = document.getElementById("gameOptionsDetails");
    if (details) details.setAttribute("open", "open");
  }
  if (panelName === "stats" && typeof document.getElementById === "function") {
    const details = document.getElementById("statsDetails");
    if (details) details.setAttribute("open", "open");
  }

  panelEl.classList.add("managedGamePanel", "panelOverlayActive");
  panelEl.dataset.activeGamePanel = panelName;
  ensureGamePanelCloseButton(panelEl);

  document.body.classList.add("game-panel-open");
  document.body.dataset.gamePanelCurrent = panelName;
  document.body.dataset.gamePanelPlacement = def.placement || "bottom";
  setGamePanelScrimVisible(true);
  gamePanelManagerState.currentPanel = panelName;
  focusInsidePanel(panelName, options.focusId);
}

function toggleGamePanel(panelName, options = {}) {
  if (!panelName) return;
  if (!options.forceOpen && gamePanelManagerState.currentPanel === panelName) {
    closeGamePanel();
    return;
  }
  openGamePanel(panelName, options);
}

function isPanelOpen(panelName) {
  if (!panelName) return Boolean(gamePanelManagerState.currentPanel);
  return gamePanelManagerState.currentPanel === panelName;
}

function currentGamePanel() {
  return gamePanelManagerState.currentPanel;
}

function initializeGamePanelManager() {
  if (typeof document === "undefined" || gamePanelManagerState.initialized) return;
  gamePanelManagerState.initialized = true;

  Object.keys(GAME_PANEL_DEFS).forEach(panelName => {
    const el = panelElementFor(panelName);
    if (!el) return;
    el.classList.add("managedGamePanel");
    el.dataset.gamePanelManaged = panelName;
  });

  const scrim = document.getElementById("gamePanelScrim");
  if (scrim && scrim.dataset.bound !== "1") {
    scrim.dataset.bound = "1";
    scrim.addEventListener("click", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      closeGamePanel();
    });
  }

  document.addEventListener("keydown", ev => {
    if (ev.key === "Escape" && gamePanelManagerState.currentPanel) closeGamePanel();
  });
}
