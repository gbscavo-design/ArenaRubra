"use strict";

// Arena Rubra – F9G HUD & Camera Foundation.
// UI-only: HUD contestuale, ritorno mappa con Fit/Focus, camera separata e chiusura robusta pannelli.
// Non modifica regole, stato logico, AI, deck, tattiche, mappa o input di gioco.

const gameScreenUiState = {
  selectedFloatCollapsed: true,
  lastSelectedUnitId: null,
  logDockCollapsed: false,
  lastHudModeText: "",
  lastMapReturnAt: 0
};

function safeText(id, value) {
  const el = typeof document !== "undefined" ? document.getElementById(id) : null;
  if (el) el.textContent = value;
}

function gameScreenCardCounts(side) {
  if (typeof state === "undefined" || !state) return { deck: 0, hand: 0, discard: 0 };
  return {
    deck: state.deck && state.deck[side] ? state.deck[side].length : 0,
    hand: state.hand && state.hand[side] ? state.hand[side].length : 0,
    discard: state.discard && state.discard[side] ? state.discard[side].length : 0
  };
}

function setSelectedUnitFloatCollapsed(collapsed) {
  gameScreenUiState.selectedFloatCollapsed = Boolean(collapsed);
  const card = typeof document !== "undefined" ? document.getElementById("selectedUnitFloat") : null;
  const btn = typeof document !== "undefined" ? document.getElementById("toggleSelectedUnitFloatBtn") : null;
  if (card) card.classList.toggle("isCollapsed", gameScreenUiState.selectedFloatCollapsed);
  if (btn) btn.textContent = gameScreenUiState.selectedFloatCollapsed ? "+" : "−";
}

function expandSelectedUnitFloat() {
  setSelectedUnitFloatCollapsed(false);
}

function collapseSelectedUnitFloat() {
  setSelectedUnitFloatCollapsed(true);
}

function syncSelectedUnitFloatState() {
  if (typeof document === "undefined") return;
  const card = document.getElementById("selectedUnitFloat");
  if (!card) return;
  const hasPlayableState = typeof state !== "undefined" && state && Array.isArray(state.units);
  const selected = hasPlayableState && typeof getSelectedUnit === "function" ? getSelectedUnit() : null;
  const selectedId = selected && selected.uid ? selected.uid : null;
  card.classList.toggle("hasSelected", Boolean(selected));
  card.classList.toggle("noSelected", !selected);
  if (!selected) {
    gameScreenUiState.lastSelectedUnitId = null;
    setSelectedUnitFloatCollapsed(true);
    return;
  }
  if (selectedId !== gameScreenUiState.lastSelectedUnitId) {
    gameScreenUiState.lastSelectedUnitId = selectedId;
    setSelectedUnitFloatCollapsed(false);
  } else {
    setSelectedUnitFloatCollapsed(gameScreenUiState.selectedFloatCollapsed);
  }
}

function setLogDockCollapsed(collapsed) {
  gameScreenUiState.logDockCollapsed = Boolean(collapsed);
  const dock = typeof document !== "undefined" ? document.getElementById("logDock") : null;
  const btn = typeof document !== "undefined" ? document.getElementById("toggleLogDockBtn") : null;
  if (dock) dock.classList.toggle("isCollapsed", gameScreenUiState.logDockCollapsed);
  if (btn) btn.textContent = gameScreenUiState.logDockCollapsed ? "+" : "−";
}

function toggleLogDock() {
  setLogDockCollapsed(!gameScreenUiState.logDockCollapsed);
}


function hudPendingBlueprintName() {
  try {
    if (typeof pendingBlueprintForHandOrMarket !== "function" || typeof state === "undefined" || !state) return "unità";
    const bpId = pendingPurchaseBlueprintId || pendingBuildBlueprintId;
    const bp = bpId ? pendingBlueprintForHandOrMarket(state.currentPlayer, bpId) : null;
    return bp && bp.name ? bp.name : "unità";
  } catch (err) {
    return "unità";
  }
}

function hudPendingTacticName() {
  try {
    if (pendingHandCardUid && typeof handCardByUid === "function" && typeof state !== "undefined" && state) {
      const card = handCardByUid(state.currentPlayer, pendingHandCardUid);
      if (card && card.name) return card.name;
    }
    if (pendingTacticId && typeof tacticById === "function") {
      const tactic = tacticById(pendingTacticId);
      if (tactic && tactic.name) return tactic.name;
    }
  } catch (err) {}
  return "tattica";
}

function gameHudModeInfo() {
  const info = { text: "Pronto", active: false, tone: "idle" };
  if (typeof state === "undefined" || !state) return { text: "Pronto", active: false, tone: "empty" };
  if (state.winner) {
    const winnerName = typeof playerName === "function" ? playerName(state.winner) : `G${state.winner}`;
    return { text: `Vittoria: ${winnerName}`, active: true, tone: "victory" };
  }

  const selected = (typeof getSelectedUnit === "function") ? getSelectedUnit() : null;
  const selectedName = selected && selected.name ? selected.name : "unità";
  const currentName = typeof playerName === "function" ? playerName(state.currentPlayer || 1) : `G${state.currentPlayer || 1}`;

  if (mode === "spawn") return { text: `Sbarco: scegli cella blu per ${hudPendingBlueprintName()}`, active: true, tone: "target" };
  if (mode === "build") return { text: `Costruzione: scegli cella blu per ${hudPendingBlueprintName()}`, active: true, tone: "target" };
  if (mode === "tactic") return { text: `Tattica: scegli bersaglio per ${hudPendingTacticName()}`, active: true, tone: "target" };
  if (mode === "ability") {
    const abName = pendingAbility && pendingAbility.name ? pendingAbility.name : "abilità";
    return { text: `Abilità: scegli bersaglio per ${abName}`, active: true, tone: "target" };
  }
  if (mode === "move") return { text: `Movimento: scegli cella per ${selectedName}`, active: true, tone: "move" };
  if (selected && selected.side === state.currentPlayer) return { text: `Unità: ${selectedName}`, active: true, tone: "unit" };
  return { text: `Pronto · ${currentName}`, active: false, tone: "idle" };
}

function updateGameHudModeChip() {
  const chip = typeof document !== "undefined" ? document.getElementById("gameHudMode") : null;
  if (!chip) return;
  const info = gameHudModeInfo();
  chip.textContent = info.text;
  chip.classList.toggle("hudModeActive", Boolean(info.active));
  chip.dataset.hudTone = info.tone || "idle";
  gameScreenUiState.lastHudModeText = info.text;
}

function closePanelForMapTarget(panelName) {
  // Chiusura puramente UI: non resetta pendingHandCardUid, pendingPurchaseBlueprintId,
  // pendingBuildBlueprintId, pendingTacticId o mode. Serve a liberare la mappa quando parte
  // una selezione su board da Mano/Azioni. F9E1 la rende indipendente da currentPanel
  // perché un errore/inizializzazione incompleta non deve lasciare la mano davanti alla mappa.
  if (typeof document === "undefined") return;
  const isMobileApk = document.body && document.body.classList.contains("mobile-apk-m4");
  if (isMobileApk && typeof closeApkM4Panel === "function") closeApkM4Panel();
  if (typeof closeAnyGamePanelForMapReturn === "function") closeAnyGamePanelForMapReturn();
  else if (typeof closeGamePanel === "function") closeGamePanel();

  const selector = panelName === "hand" ? ".handPrimaryDock" : panelName === "actions" ? ".tacticDock" : null;
  if (selector) {
    document.querySelectorAll(selector).forEach(el => {
      el.classList.remove("panelOverlayActive");
      el.removeAttribute("data-active-game-panel");
    });
  }
  if (document.body) {
    document.body.classList.remove("game-panel-open");
    document.body.removeAttribute("data-game-panel-current");
    document.body.removeAttribute("data-game-panel-placement");
  }
  const scrim = document.getElementById("gamePanelScrim");
  if (scrim) {
    scrim.hidden = true;
    scrim.setAttribute("aria-hidden", "true");
  }
  window.requestAnimationFrame(() => {
    if (typeof fitApkM4Board === "function") fitApkM4Board({ preserveCamera:true });
  });
}

function returnToMapFromActionBar(cameraMode = "fit") {
  gameScreenUiState.lastMapReturnAt = Date.now();
  if (typeof closeApkM4Panel === "function") closeApkM4Panel();
  if (typeof closeAnyGamePanelForMapReturn === "function") closeAnyGamePanelForMapReturn();
  else if (typeof closeGamePanel === "function") closeGamePanel();

  if (cameraMode === "focus") {
    if (typeof setBoardCameraMode === "function") setBoardCameraMode("focus");
    else if (typeof setApkM4CameraMode === "function") setApkM4CameraMode("focus");
  } else {
    if (typeof fitToBoard === "function") fitToBoard();
    else if (typeof fitApkM4Board === "function") fitApkM4Board({ preserveCamera:false });
  }
  gameScrollToElement("boardWrap");
}

function closeHandPanelAfterAcceptedCardPlay() {
  closePanelForMapTarget("hand");
}

function closeActionsPanelAfterAcceptedTactic() {
  closePanelForMapTarget("actions");
}

function renderGameHud() {
  if (typeof document === "undefined") return;
  const buildLabel = typeof buildInfoLabel === "function" ? buildInfoLabel() : "C2-STABLE-1-F9H1-APK-M4c";
  safeText("gameHudBuild", buildLabel);
  syncSelectedUnitFloatState();
  setLogDockCollapsed(gameScreenUiState.logDockCollapsed);

  if (typeof state === "undefined" || !state) {
    safeText("gameHudRound", "R—");
    safeText("gameHudTurn", "Turno: —");
    safeText("gameHudEnergy", "ENE —");
    safeText("gameHudPs", "PS —");
    safeText("gameHudPressure", "Pressione —");
    safeText("gameHudCards", "Deck/Mano/Scarti —");
    updateGameHudModeChip();
    return;
  }

  const current = state.currentPlayer || 1;
  const currentName = typeof playerName === "function" ? playerName(current) : `G${current}`;
  const currentMode = state.modes && state.modes[current] === "bot" ? "Bot" : "Umano";
  const ps1 = typeof countControlledPS === "function" ? countControlledPS(1) : 0;
  const ps2 = typeof countControlledPS === "function" ? countControlledPS(2) : 0;
  const p1Cards = gameScreenCardCounts(1);
  const p2Cards = gameScreenCardCounts(2);
  const p1 = state.factions && state.factions[1] ? state.factions[1] : "G1";
  const p2 = state.factions && state.factions[2] ? state.factions[2] : "G2";

  safeText("gameHudRound", `R${state.turn || 0}`);
  safeText("gameHudTurn", `Turno: ${currentName} · ${currentMode}`);
  safeText("gameHudEnergy", `ENE ${state.energy ? state.energy[1] : 0}-${state.energy ? state.energy[2] : 0}`);
  safeText("gameHudPs", `PS ${ps1}-${ps2}`);
  safeText("gameHudPressure", `Pressione ${state.pressure ? state.pressure[1] || 0 : 0}-${state.pressure ? state.pressure[2] || 0 : 0}`);
  safeText("gameHudCards", `Carte ${p1}: ${p1Cards.deck}/${p1Cards.hand}/${p1Cards.discard} · ${p2}: ${p2Cards.deck}/${p2Cards.hand}/${p2Cards.discard}`);
  updateGameHudModeChip();
}

function gameScrollToElement(id) {
  const el = typeof document !== "undefined" ? document.getElementById(id) : null;
  if (!el || typeof el.scrollIntoView !== "function") return;
  el.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
}

function openLegacyDetails(id) {
  const el = typeof document !== "undefined" ? document.getElementById(id) : null;
  if (el && el.tagName && el.tagName.toLowerCase() === "details") el.setAttribute("open", "open");
}

function handleGameActionBarClick(action) {
  if (!action) return;

  const isMobileApk = typeof document !== "undefined" && document.body && document.body.classList.contains("mobile-apk-m4");
  if (isMobileApk && typeof setApkM4Panel === "function") {
    if (action === "fit" && typeof setApkM4CameraMode === "function") {
      if (typeof closeApkM4Panel === "function") closeApkM4Panel();
      setApkM4CameraMode("fit");
      return;
    }
    if (action === "focus" && typeof setApkM4CameraMode === "function") {
      if (typeof closeApkM4Panel === "function") closeApkM4Panel();
      setApkM4CameraMode("focus");
      return;
    }
    if (action === "map") {
      if (typeof closeApkM4Panel === "function") closeApkM4Panel();
      if (typeof setApkM4CameraMode === "function") setApkM4CameraMode("play");
      return;
    }
    if (action === "hand") { setApkM4Panel("hand", { force:true, scrollTo:"cardZonePanel" }); return; }
    if (action === "unit") {
      if (typeof closeApkM4Panel === "function") closeApkM4Panel();
      expandSelectedUnitFloat();
      if (typeof centerApkM4CameraOn === "function" && typeof apkM4FocusCoord === "function") centerApkM4CameraOn(apkM4FocusCoord());
      return;
    }
    if (action === "actions") { setApkM4Panel("actions", { force:true, scrollTo:"tacticPanel" }); return; }
    if (action === "log") { setLogDockCollapsed(false); setApkM4Panel("log", { force:true, scrollTo:"log" }); return; }
    if (action === "stats") { setApkM4Panel("stats", { force:true, scrollTo:"matchupStatsPanel" }); return; }
    if (action === "setup") { setApkM4Panel("setup", { force:true, scrollTo:"gameOptionsDetails" }); return; }
  }

  if (action === "fit" || action === "map") {
    returnToMapFromActionBar("fit");
    return;
  }
  if (action === "focus") {
    returnToMapFromActionBar("focus");
    return;
  }
  if (typeof toggleGamePanel === "function") {
    if (action === "hand") { toggleGamePanel("hand", { focusId:"cardZonePanel" }); return; }
    if (action === "actions") { toggleGamePanel("actions", { focusId:"tacticPanel" }); return; }
    if (action === "log") { setLogDockCollapsed(false); toggleGamePanel("log", { focusId:"log" }); return; }
    if (action === "setup") { openLegacyDetails("gameOptionsDetails"); toggleGamePanel("setup", { focusId:"gameOptionsDetails" }); return; }
    if (action === "stats") { openLegacyDetails("statsDetails"); toggleGamePanel("stats", { focusId:"matchupStatsPanel" }); return; }
  }

  if (action === "hand") { gameScrollToElement("cardZonePanel"); return; }
  if (action === "unit") { expandSelectedUnitFloat(); gameScrollToElement("boardWrap"); return; }
  if (action === "actions") { gameScrollToElement("tacticPanel"); return; }
  if (action === "log") { setLogDockCollapsed(false); gameScrollToElement("logDock"); return; }
  if (action === "setup") { openLegacyDetails("gameOptionsDetails"); gameScrollToElement("gameOptionsDetails"); return; }
  if (action === "stats") { openLegacyDetails("statsDetails"); gameScrollToElement("matchupStatsPanel"); return; }
}

function initializeGameScreenShell() {
  if (typeof document === "undefined") return;
  if (typeof initializeGamePanelManager === "function") initializeGamePanelManager();
  if (typeof initializeBoardCamera === "function") initializeBoardCamera();
  const bar = document.getElementById("gameActionBar");
  if (bar && bar.dataset.bound !== "1") {
    bar.dataset.bound = "1";
    bar.addEventListener("click", ev => {
      const btn = ev.target && ev.target.closest ? ev.target.closest("button[data-game-action]") : null;
      if (!btn) return;
      ev.preventDefault();
      handleGameActionBarClick(btn.dataset.gameAction);
    });
  }

  const unitToggle = document.getElementById("toggleSelectedUnitFloatBtn");
  if (unitToggle && unitToggle.dataset.bound !== "1") {
    unitToggle.dataset.bound = "1";
    unitToggle.addEventListener("click", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      setSelectedUnitFloatCollapsed(!gameScreenUiState.selectedFloatCollapsed);
    });
  }

  const logToggle = document.getElementById("toggleLogDockBtn");
  if (logToggle && logToggle.dataset.bound !== "1") {
    logToggle.dataset.bound = "1";
    logToggle.addEventListener("click", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      toggleLogDock();
    });
  }

  renderGameHud();
}
