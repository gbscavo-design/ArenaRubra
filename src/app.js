"use strict";

// Arena Rubra – F9H1 AppShell / Deck Builder Foundation.
// Scopo: mantenere AppShell/SetupScreen stabili e collegare la GameScreen al PanelManager senza toccare la logica Starter congelata.

const ARENA_APP_SCREENS = Object.freeze({
  MAIN_MENU: "mainMenu",
  SETUP: "setup",
  GAME: "game",
  DECK_BUILDER: "deckBuilder",
  CARD_EDITOR: "cardEditor",
  CARD_POOL: "cardPool",
  STATS: "stats",
  OPTIONS: "options",
  ABOUT: "about"
});

const arenaApp = {
  screen: ARENA_APP_SCREENS.MAIN_MENU,
  lastPlaceholder: ""
};

function currentAppScreen() {
  return arenaApp.screen;
}

function setAppScreen(screen) {
  const next = screen || ARENA_APP_SCREENS.MAIN_MENU;
  arenaApp.screen = next;
  if (typeof document === "undefined" || !document.body) return;

  const placeholderScreens = [
    ARENA_APP_SCREENS.CARD_EDITOR,
    ARENA_APP_SCREENS.CARD_POOL,
    ARENA_APP_SCREENS.STATS,
    ARENA_APP_SCREENS.OPTIONS,
    ARENA_APP_SCREENS.ABOUT
  ];
  const isMainMenu = next === ARENA_APP_SCREENS.MAIN_MENU;
  const isSetup = next === ARENA_APP_SCREENS.SETUP;
  const isGame = next === ARENA_APP_SCREENS.GAME;
  const isDeckBuilder = next === ARENA_APP_SCREENS.DECK_BUILDER;
  const isPlaceholder = placeholderScreens.includes(next);

  if (!isGame && typeof closeGamePanel === "function") closeGamePanel();

  document.body.dataset.appScreen = next;
  document.body.classList.toggle("app-screen-menu", isMainMenu);
  document.body.classList.toggle("app-screen-setup", isSetup);
  document.body.classList.toggle("app-screen-game", isGame);
  document.body.classList.toggle("app-screen-deck-builder", isDeckBuilder);
  document.body.classList.toggle("app-screen-placeholder", isPlaceholder);

  const screens = document.querySelectorAll("[data-app-screen-panel]");
  screens.forEach(el => {
    const active = el.dataset.appScreenPanel === next || (el.id === "appPlaceholderScreen" && isPlaceholder);
    el.classList.toggle("isActive", active);
    el.setAttribute("aria-hidden", active ? "false" : "true");
  });

  if (isDeckBuilder && typeof renderDeckBuilderScreen === "function") renderDeckBuilderScreen();
  refreshMainMenuResumeState();
}

function readControlValue(id, fallback = "") {
  const el = typeof document !== "undefined" ? document.getElementById(id) : null;
  return el ? el.value : fallback;
}

function writeControlValue(id, value) {
  const el = typeof document !== "undefined" ? document.getElementById(id) : null;
  if (!el || value === undefined || value === null) return;
  const stringValue = String(value);
  const hasOption = !el.options || Array.from(el.options).some(opt => opt.value === stringValue);
  if (hasOption || el.type === "checkbox") {
    if (el.type === "checkbox") el.checked = Boolean(value);
    else el.value = stringValue;
  }
}

function refreshMainMenuResumeState() {
  const resumeBtn = typeof document !== "undefined" ? document.getElementById("mainMenuResumeBtn") : null;
  if (!resumeBtn) return;
  const hasGame = typeof state !== "undefined" && !!state;
  resumeBtn.disabled = !hasGame;
  resumeBtn.textContent = hasGame ? "Riprendi partita" : "Riprendi partita non disponibile";
}

function commanderLabelForSetup(card) {
  return typeof commanderOptionLabel === "function" ? commanderOptionLabel(card) : (card ? card.name : "Comandante");
}

function populateSetupCommanderSelectForSide(side) {
  const factionSelect = document.getElementById(`setupP${side}Faction`);
  const commanderSelect = document.getElementById(`setupP${side}Commander`);
  if (!factionSelect || !commanderSelect || typeof commanderCardsForFaction !== "function") return;

  const faction = factionSelect.value;
  const previous = commanderSelect.value;
  const commanders = commanderCardsForFaction(faction);
  commanderSelect.innerHTML = commanders.map(card => `<option value="${card.blueprintId}">${commanderLabelForSetup(card)}</option>`).join("");

  const fallback = typeof defaultCommanderBlueprintIdForFaction === "function"
    ? defaultCommanderBlueprintIdForFaction(faction)
    : (commanders[0] && commanders[0].blueprintId);
  commanderSelect.value = commanders.some(card => card.blueprintId === previous) ? previous : fallback;
}

function refreshSetupCommanderSelects() {
  populateSetupCommanderSelectForSide(1);
  populateSetupCommanderSelectForSide(2);
}

function syncSetupScreenFromLegacyControls() {
  writeControlValue("setupP1Faction", readControlValue("p1Faction", "Nexus"));
  writeControlValue("setupP2Faction", readControlValue("p2Faction", "Exordium"));
  refreshSetupCommanderSelects();
  writeControlValue("setupP1Commander", readControlValue("p1Commander", ""));
  writeControlValue("setupP2Commander", readControlValue("p2Commander", ""));
  writeControlValue("setupP1Mode", readControlValue("p1Mode", "human"));
  writeControlValue("setupP2Mode", readControlValue("p2Mode", "bot"));
  writeControlValue("setupInitiativeMode", readControlValue("initiativeMode", "random"));
  writeControlValue("setupBotAiMode", readControlValue("botAiMode", "advanced"));
  writeControlValue("setupPacePreset", readControlValue("pacePreset", "standard"));
  const legacyAuto = document.getElementById("autoResignToggle");
  const setupAuto = document.getElementById("setupAutoResignToggle");
  if (legacyAuto && setupAuto) setupAuto.checked = legacyAuto.checked;
}

function syncLegacyControlsFromSetupScreen() {
  writeControlValue("p1Faction", readControlValue("setupP1Faction", "Nexus"));
  writeControlValue("p2Faction", readControlValue("setupP2Faction", "Exordium"));
  if (typeof refreshCommanderSelects === "function") refreshCommanderSelects();
  writeControlValue("p1Commander", readControlValue("setupP1Commander", ""));
  writeControlValue("p2Commander", readControlValue("setupP2Commander", ""));
  writeControlValue("p1Mode", readControlValue("setupP1Mode", "human"));
  writeControlValue("p2Mode", readControlValue("setupP2Mode", "bot"));
  writeControlValue("initiativeMode", readControlValue("setupInitiativeMode", "random"));
  writeControlValue("botAiMode", readControlValue("setupBotAiMode", "advanced"));
  writeControlValue("pacePreset", readControlValue("setupPacePreset", "standard"));
  const legacyAuto = document.getElementById("autoResignToggle");
  const setupAuto = document.getElementById("setupAutoResignToggle");
  if (legacyAuto && setupAuto) legacyAuto.checked = setupAuto.checked;
}

function openNewGameSetupScreen() {
  if (typeof refreshCommanderSelects === "function") refreshCommanderSelects();
  syncSetupScreenFromLegacyControls();
  setAppScreen(ARENA_APP_SCREENS.SETUP);
}

function startGameFromSetupScreen() {
  syncLegacyControlsFromSetupScreen();
  setAppScreen(ARENA_APP_SCREENS.GAME);
  if (typeof newGame === "function") newGame();
}


function appPlaceholderText(screen) {
  const labels = {
    cardEditor: "Crea / modifica carta",
    cardPool: "Pool carte",
    stats: "Statistiche / log test",
    options: "Opzioni / debug",
    about: "Informazioni versione"
  };
  const label = labels[screen] || "Schermata futura";
  if (screen === ARENA_APP_SCREENS.ABOUT && typeof BUILD_INFO !== "undefined") {
    return `${label}: ${BUILD_INFO.version} · ${BUILD_INFO.buildName} · baseline ${BUILD_INFO.logicBaseline}.`;
  }
  return `${label}: placeholder F9H1. La schermata verrà implementata nelle prossime sottofasi senza modificare la logica Starter congelata.`;
}

function showAppPlaceholder(screen) {
  const target = document.getElementById("appPlaceholderMessage");
  if (target) target.textContent = appPlaceholderText(screen);
  setAppScreen(screen);
}

function startNewGameFromAppMenu() {
  openNewGameSetupScreen();
}

function resumeGameFromAppMenu() {
  if (typeof state === "undefined" || !state) {
    openNewGameSetupScreen();
    return;
  }
  setAppScreen(ARENA_APP_SCREENS.GAME);
  if (typeof renderAll === "function") renderAll();
  if (typeof maybeRunBot === "function") maybeRunBot();
}

function openMainMenu() {
  setAppScreen(ARENA_APP_SCREENS.MAIN_MENU);
}

function initializeArenaAppShell() {
  if (typeof document === "undefined") return;
  if (typeof applyBuildInfoToDom === "function") applyBuildInfoToDom();
  if (typeof initializeGameScreenShell === "function") {
    try {
      initializeGameScreenShell();
    } catch (err) {
      // La shell del menu non deve mai restare bloccata da un errore HUD/GameScreen.
      console.error("Arena AppShell: inizializzazione GameScreen non bloccante fallita", err);
    }
  }

  if (typeof initializeDeckBuilderScreen === "function") initializeDeckBuilderScreen();

  const deckBuilderBtn = document.querySelector("[data-app-open-deck-builder]");
  if (deckBuilderBtn && deckBuilderBtn.dataset.bound !== "1") {
    deckBuilderBtn.dataset.bound = "1";
    deckBuilderBtn.addEventListener("click", () => {
      if (typeof openDeckBuilderScreen === "function") openDeckBuilderScreen();
      else showAppPlaceholder(ARENA_APP_SCREENS.DECK_BUILDER);
    });
  }

  const newGameBtn = document.getElementById("mainMenuNewGameBtn");
  if (newGameBtn && newGameBtn.dataset.bound !== "1") {
    newGameBtn.dataset.bound = "1";
    newGameBtn.addEventListener("click", startNewGameFromAppMenu);
  }

  const resumeBtn = document.getElementById("mainMenuResumeBtn");
  if (resumeBtn && resumeBtn.dataset.bound !== "1") {
    resumeBtn.dataset.bound = "1";
    resumeBtn.addEventListener("click", resumeGameFromAppMenu);
  }

  document.querySelectorAll("[data-app-placeholder-screen]").forEach(btn => {
    if (btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", () => showAppPlaceholder(btn.dataset.appPlaceholderScreen));
  });

  document.querySelectorAll("[data-app-back-menu]").forEach(btn => {
    if (btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", openMainMenu);
  });

  const setupStartBtn = document.getElementById("setupStartGameBtn");
  if (setupStartBtn && setupStartBtn.dataset.bound !== "1") {
    setupStartBtn.dataset.bound = "1";
    setupStartBtn.addEventListener("click", startGameFromSetupScreen);
  }

  const setupBackBtn = document.getElementById("setupBackMenuBtn");
  if (setupBackBtn && setupBackBtn.dataset.bound !== "1") {
    setupBackBtn.dataset.bound = "1";
    setupBackBtn.addEventListener("click", openMainMenu);
  }

  [1, 2].forEach(side => {
    const factionSelect = document.getElementById(`setupP${side}Faction`);
    if (factionSelect && factionSelect.dataset.bound !== "1") {
      factionSelect.dataset.bound = "1";
      factionSelect.addEventListener("change", () => refreshSetupCommanderSelects());
    }
  });

  refreshSetupCommanderSelects();

  const topNewGame = document.getElementById("newGameBtn");
  if (topNewGame && topNewGame.dataset.appShellPatched !== "1") {
    topNewGame.dataset.appShellPatched = "1";
    topNewGame.addEventListener("click", event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      openNewGameSetupScreen();
    }, true);
  }

  const returnMenuBtn = document.getElementById("returnMainMenuBtn");
  if (returnMenuBtn && returnMenuBtn.dataset.bound !== "1") {
    returnMenuBtn.dataset.bound = "1";
    returnMenuBtn.addEventListener("click", openMainMenu);
  }

  setAppScreen(ARENA_APP_SCREENS.MAIN_MENU);
}
