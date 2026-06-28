"use strict";

// Arena Rubra – F9G Camera Foundation.
// Stato UI/render separato dallo stato logico della partita.
// Non modifica regole, AI, mappa, deck, tattiche o input di gioco.

const BOARD_CAMERA_W = 920;
const BOARD_CAMERA_H = 780;
const BOARD_CAMERA_ZOOMS = Object.freeze({ fit: 1, play: 1.12, focus: 1.32, manual: 1.12 });

const boardCamera = {
  x: 0,
  y: 0,
  zoom: 1,
  fitScale: 1,
  mode: "fit",
  initialized: false,
  lastFocusKey: ""
};

function isApkM4CameraActive() {
  return typeof document !== "undefined"
    && document.body
    && document.body.classList.contains("mobile-apk-m4");
}

function boardCameraBoardEl() {
  return typeof document !== "undefined" ? document.getElementById("board") : null;
}

function boardCameraWrapEl() {
  return typeof document !== "undefined" ? document.getElementById("boardWrap") : null;
}

function boardCameraTotalScale() {
  const scale = (Number.isFinite(boardCamera.fitScale) ? boardCamera.fitScale : 1) * (Number.isFinite(boardCamera.zoom) ? boardCamera.zoom : 1);
  return Math.max(0.25, Math.min(2.2, scale));
}

function updateBoardCameraHud() {
  const chip = typeof document !== "undefined" ? document.getElementById("gameHudCamera") : null;
  if (!chip) return;
  const modeLabel = boardCamera.mode === "focus" ? "Focus" : boardCamera.mode === "play" ? "Play" : boardCamera.mode === "manual" ? "Manuale" : "Fit";
  const pct = Math.round(boardCameraTotalScale() * 100);
  chip.textContent = `Camera: ${modeLabel} ${pct}%`;
  chip.dataset.cameraMode = boardCamera.mode || "fit";
}

function applyBoardCamera() {
  const board = boardCameraBoardEl();
  const wrap = boardCameraWrapEl();
  if (!board || !wrap) return;

  // Su APK-M4 la camera validata è quella mobile. Qui non interferiamo.
  if (isApkM4CameraActive()) {
    updateBoardCameraHud();
    return;
  }

  const totalScale = boardCameraTotalScale();
  board.style.setProperty("--board-fit-scale", String(totalScale.toFixed(4)));
  board.style.setProperty("--board-camera-x", `${Math.round(boardCamera.x)}px`);
  board.style.setProperty("--board-camera-y", `${Math.round(boardCamera.y)}px`);
  wrap.style.setProperty("--board-visual-width", `${Math.round(BOARD_CAMERA_W * totalScale)}px`);
  wrap.style.setProperty("--board-visual-height", `${Math.round(BOARD_CAMERA_H * totalScale)}px`);
  updateBoardCameraHud();
}

function computeBoardFitScale() {
  const wrap = boardCameraWrapEl();
  if (!wrap) return 1;
  const rect = wrap.getBoundingClientRect();
  const pad = 28;
  const availableW = Math.max(260, rect.width - pad);
  const availableH = Math.max(220, rect.height - pad);
  return Math.max(0.34, Math.min(1, availableW / BOARD_CAMERA_W, availableH / BOARD_CAMERA_H));
}

function boardPointForCoord(coord) {
  if (!Array.isArray(coord)) return { x: BOARD_CAMERA_W / 2, y: BOARD_CAMERA_H / 2 };
  const q = coord[0];
  const r = coord[2];
  return {
    x: CENTER_X + HEX_SIZE * Math.sqrt(3) * (q + r / 2),
    y: CENTER_Y + HEX_SIZE * 1.5 * r
  };
}

function firstCoordFromTargetList(list) {
  if (!Array.isArray(list)) return null;
  for (const item of list) {
    if (Array.isArray(item)) return item;
    if (item && Array.isArray(item.pos)) return item.pos;
    if (item && Array.isArray(item.coord)) return item.coord;
  }
  return null;
}

function boardCameraFocusCoord() {
  try {
    if (typeof getSelectedUnit === "function") {
      const selected = getSelectedUnit();
      if (selected && Array.isArray(selected.pos)) return selected.pos;
    }

    if (typeof state !== "undefined" && state) {
      if (mode === "spawn" && typeof pendingBlueprintForHandOrMarket === "function" && typeof spawnCellsFor === "function") {
        const bp = pendingPurchaseBlueprintId ? pendingBlueprintForHandOrMarket(state.currentPlayer, pendingPurchaseBlueprintId) : null;
        const coord = bp ? firstCoordFromTargetList(spawnCellsFor(state.currentPlayer, bp)) : null;
        if (coord) return coord;
      }
      if (mode === "build" && typeof pendingBlueprintForHandOrMarket === "function" && typeof buildableCells === "function") {
        const selected = typeof getSelectedUnit === "function" ? getSelectedUnit() : null;
        const bp = pendingBuildBlueprintId ? pendingBlueprintForHandOrMarket(state.currentPlayer, pendingBuildBlueprintId) : null;
        const coord = selected && bp ? firstCoordFromTargetList(buildableCells(selected)) : null;
        if (coord) return coord;
      }
      if (mode === "ability" && typeof getSelectedUnit === "function" && typeof abilityTargets === "function" && pendingAbility) {
        const selected = getSelectedUnit();
        const coord = selected ? firstCoordFromTargetList(abilityTargets(selected, pendingAbility)) : null;
        if (coord) return coord;
      }
      if (mode === "tactic") {
        if (pendingHandCardUid && typeof handCardByUid === "function" && typeof handTacticTargets === "function") {
          const card = handCardByUid(state.currentPlayer, pendingHandCardUid);
          const coord = card ? firstCoordFromTargetList(handTacticTargets(state.currentPlayer, card)) : null;
          if (coord) return coord;
        }
        if (pendingTacticId && typeof tacticById === "function" && typeof tacticTargets === "function") {
          const tactic = tacticById(pendingTacticId);
          const coord = tactic ? firstCoordFromTargetList(tacticTargets(state.currentPlayer, tactic)) : null;
          if (coord) return coord;
        }
      }
      if (typeof getHq === "function" && state.currentPlayer) {
        const hq = getHq(state.currentPlayer);
        if (hq && Array.isArray(hq.pos)) return hq.pos;
      }
    }
  } catch (err) {
    // Camera UI: non deve mai bloccare gameplay/render.
  }
  return typeof CENTER_PS_COORD !== "undefined" ? CENTER_PS_COORD : [0,0,0];
}

function centerBoardCameraOn(coord, options = {}) {
  if (isApkM4CameraActive()) {
    if (typeof centerApkM4CameraOn === "function") centerApkM4CameraOn(coord || boardCameraFocusCoord(), options);
    return;
  }

  if (!options.keepZoom) boardCamera.zoom = BOARD_CAMERA_ZOOMS.focus;
  const p = boardPointForCoord(coord || boardCameraFocusCoord());
  const scale = boardCameraTotalScale();
  boardCamera.x = (BOARD_CAMERA_W / 2 - p.x) * scale;
  boardCamera.y = (BOARD_CAMERA_H / 2 - p.y) * scale;
  applyBoardCamera();
}

function fitToBoard(options = {}) {
  if (isApkM4CameraActive()) {
    if (typeof setApkM4CameraMode === "function") setApkM4CameraMode("fit");
    else if (typeof fitApkM4Board === "function") fitApkM4Board({ preserveCamera:false });
    return;
  }
  boardCamera.mode = "fit";
  boardCamera.fitScale = computeBoardFitScale();
  boardCamera.zoom = BOARD_CAMERA_ZOOMS.fit;
  boardCamera.x = 0;
  boardCamera.y = 0;
  applyBoardCamera();
}

function resetCamera() {
  fitToBoard();
}

function focusCoord(coord, options = {}) {
  if (isApkM4CameraActive()) {
    if (typeof setApkM4CameraMode === "function") setApkM4CameraMode("focus");
    if (typeof centerApkM4CameraOn === "function") centerApkM4CameraOn(coord || boardCameraFocusCoord(), { keepZoom:true });
    return;
  }
  boardCamera.mode = "focus";
  boardCamera.fitScale = computeBoardFitScale();
  boardCamera.zoom = BOARD_CAMERA_ZOOMS.focus;
  centerBoardCameraOn(coord || boardCameraFocusCoord(), { keepZoom:true });
}

function focusUnit(unitOrId) {
  let unit = unitOrId;
  if (typeof unitOrId === "string" && typeof state !== "undefined" && state && Array.isArray(state.units)) {
    unit = state.units.find(u => u && u.uid === unitOrId);
  }
  if (unit && Array.isArray(unit.pos)) focusCoord(unit.pos);
  else focusCoord(boardCameraFocusCoord());
}

function setBoardCameraMode(mode) {
  if (mode === "focus") return focusCoord(boardCameraFocusCoord());
  if (mode === "play") {
    if (isApkM4CameraActive() && typeof setApkM4CameraMode === "function") return setApkM4CameraMode("play");
    boardCamera.mode = "play";
    boardCamera.fitScale = computeBoardFitScale();
    boardCamera.zoom = BOARD_CAMERA_ZOOMS.play;
    boardCamera.x = 0;
    boardCamera.y = 0;
    applyBoardCamera();
    return;
  }
  return fitToBoard();
}

function panBy(dx, dy) {
  if (isApkM4CameraActive()) return;
  boardCamera.mode = "manual";
  boardCamera.x += Number(dx) || 0;
  boardCamera.y += Number(dy) || 0;
  applyBoardCamera();
}

function zoomAt(point, delta) {
  if (isApkM4CameraActive()) return;
  boardCamera.mode = "manual";
  const current = Number.isFinite(boardCamera.zoom) ? boardCamera.zoom : 1;
  const step = delta > 0 ? 1.1 : 0.9;
  boardCamera.zoom = Math.max(0.72, Math.min(1.8, current * step));
  applyBoardCamera();
}

function screenToBoardCoord(point) {
  const board = boardCameraBoardEl();
  if (!board || !point) return null;
  const rect = board.getBoundingClientRect();
  const scale = boardCameraTotalScale();
  return {
    x: (point.x - rect.left) / scale,
    y: (point.y - rect.top) / scale
  };
}

function syncBoardCameraAfterRender() {
  if (isApkM4CameraActive()) {
    if (typeof fitApkM4Board === "function") fitApkM4Board({ preserveCamera:true });
    return;
  }
  if (!boardCamera.initialized) {
    boardCamera.initialized = true;
    fitToBoard();
    return;
  }
  boardCamera.fitScale = computeBoardFitScale();
  if (boardCamera.mode === "focus") {
    const coord = boardCameraFocusCoord();
    const key = Array.isArray(coord) ? coord.join(",") : "center";
    boardCamera.lastFocusKey = key;
    centerBoardCameraOn(coord, { keepZoom:true });
  } else if (boardCamera.mode === "fit") {
    boardCamera.zoom = BOARD_CAMERA_ZOOMS.fit;
    boardCamera.x = 0;
    boardCamera.y = 0;
    applyBoardCamera();
  } else {
    applyBoardCamera();
  }
}

function initializeBoardCamera() {
  if (typeof document === "undefined") return;
  if (boardCamera.initialized) {
    syncBoardCameraAfterRender();
    return;
  }
  boardCamera.initialized = true;
  fitToBoard();

  window.addEventListener("resize", () => syncBoardCameraAfterRender(), { passive:true });
  window.addEventListener("orientationchange", () => setTimeout(() => syncBoardCameraAfterRender(), 160), { passive:true });
  if (window.visualViewport && typeof window.visualViewport.addEventListener === "function") {
    window.visualViewport.addEventListener("resize", () => syncBoardCameraAfterRender(), { passive:true });
  }
}
