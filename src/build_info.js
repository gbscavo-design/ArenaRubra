"use strict";

// Arena Rubra – F9H1 Application Foundation metadata.
// Single source of truth for visible build/version metadata.
// Do not hardcode build labels in menu, HUD, log/export or startup messages:
// read from BUILD_INFO through the helpers below.

const BUILD_INFO = Object.freeze({
  appName: "Arena Rubra",
  stage: "Starter Game ALPHA",
  version: "C2-STABLE-1-F9H1-APK-M4c",
  buildName: "Deck Builder Read/Validate Foundation",
  buildDate: "2026-06-28",
  buildChannel: "freeze-candidate",
  logicBaseline: "C2-STABLE-1-APK-M4c",
  map: "Starter MAP1 radius 6",
  notes: "Fase 9H1: Deck Builder Read/Validate Foundation. Aggiunge una schermata Costruisci deck di sola lettura/validazione: pool carte per fazione, comandante selezionabile, deck template generato, regole copie e report JSON. Nessun salvataggio e nessun uso del deck builder in partita."
});

function buildInfoLabel() {
  if (typeof BUILD_INFO === "undefined" || !BUILD_INFO) return "unknown";
  return BUILD_INFO.version || "unknown";
}

function buildInfoFullLabel() {
  if (typeof BUILD_INFO === "undefined" || !BUILD_INFO) return "Arena Rubra";
  const parts = [BUILD_INFO.appName, BUILD_INFO.stage, BUILD_INFO.version, BUILD_INFO.buildName].filter(Boolean);
  return parts.join(" – ");
}

function buildInfoShortStageLabel() {
  if (typeof BUILD_INFO === "undefined" || !BUILD_INFO) return "Arena Rubra";
  return `${BUILD_INFO.appName || "Arena Rubra"} · ${BUILD_INFO.stage || ""}`.trim();
}

function buildInfoExportMeta() {
  if (typeof BUILD_INFO === "undefined" || !BUILD_INFO) return {};
  return {
    appName: BUILD_INFO.appName || "Arena Rubra",
    stage: BUILD_INFO.stage || "",
    version: BUILD_INFO.version || "unknown",
    buildName: BUILD_INFO.buildName || "",
    buildDate: BUILD_INFO.buildDate || "",
    buildChannel: BUILD_INFO.buildChannel || "",
    logicBaseline: BUILD_INFO.logicBaseline || "",
    map: BUILD_INFO.map || "",
    notes: BUILD_INFO.notes || ""
  };
}

function setTextIfPresent(id, value) {
  const el = typeof document !== "undefined" ? document.getElementById(id) : null;
  if (el) el.textContent = value;
}

function applyBuildInfoToDom() {
  if (typeof document === "undefined" || typeof BUILD_INFO === "undefined") return;
  document.title = `${BUILD_INFO.appName} – ${BUILD_INFO.stage} (${BUILD_INFO.version})`;
  setTextIfPresent("buildAppName", BUILD_INFO.appName || "Arena Rubra");
  setTextIfPresent("buildStage", BUILD_INFO.stage || "");
  setTextIfPresent("buildVersion", BUILD_INFO.version || "unknown");
  setTextIfPresent("topBuildStage", BUILD_INFO.stage || "Starter Game");
  setTextIfPresent("topBuildVersion", BUILD_INFO.version || "unknown");
  setTextIfPresent("menuBuildVersion", BUILD_INFO.version || "unknown");
  setTextIfPresent("menuBuildName", BUILD_INFO.buildName || "");
  setTextIfPresent("menuBuildDate", BUILD_INFO.buildDate || "");
  setTextIfPresent("menuBuildChannel", BUILD_INFO.buildChannel || "");
  setTextIfPresent("menuLogicBaseline", BUILD_INFO.logicBaseline || "");
  setTextIfPresent("menuBuildNotes", BUILD_INFO.notes || "");
  setTextIfPresent("setupBuildVersion", BUILD_INFO.version || "unknown");
  setTextIfPresent("setupBuildName", BUILD_INFO.buildName || "");
  setTextIfPresent("freezeRulesBuildVersion", BUILD_INFO.version || "unknown");
  setTextIfPresent("splashEnterBtn", "Entra in Arena Rubra");
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", applyBuildInfoToDom);
  else applyBuildInfoToDom();
}
