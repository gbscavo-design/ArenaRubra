"use strict";

// Arena Rubra – Fase B4a
// State extraction prudente.
// Qui vivono lo stato globale, il contesto UI corrente e le factory base.
// Non introduce nuove meccaniche e non modifica il gameplay.

let state = null;
let selectedId = null;
let mode = "idle"; // idle | move | ability | build | spawn | tactic
let pendingAbility = null;
let pendingBuildBlueprintId = null;
let pendingPurchaseBlueprintId = null;
let pendingTacticId = null;
let pendingHandCardUid = null;
let botRunning = false;

const $ = (id) => document.getElementById(id);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function createMatchId() {
  return Date.now() + "-" + Math.random().toString(36).slice(2, 8);
}

function readDeckSetupForSide(side) {
  const modeEl = $(`p${side}DeckMode`) || $(`setupP${side}DeckMode`);
  const mode = modeEl ? modeEl.value : "template";
  return {
    mode: mode === "custom" ? "custom" : "template"
  };
}

function readGameSetupFromDom() {
  return {
    factions: {
      1: $("p1Faction").value,
      2: $("p2Faction").value
    },
    selectedCommanders: {
      1: $("p1Commander") ? $("p1Commander").value : null,
      2: $("p2Commander") ? $("p2Commander").value : null
    },
    selectedDecks: {
      1: readDeckSetupForSide(1),
      2: readDeckSetupForSide(2)
    },
    modes: {
      1: $("p1Mode").value,
      2: $("p2Mode").value
    },
    autoResignEnabled: $("autoResignToggle") ? $("autoResignToggle").checked : true,
    aiMode: $("botAiMode") ? $("botAiMode").value : "advanced",
    pacePreset: $("pacePreset") ? $("pacePreset").value : "standard"
  };
}

function createInitialGameState(setup) {
  const factions = setup.factions;
  const firstPlayer = setup.firstPlayer;

  return {
    cells: generateMap(RADIUS),
    units: [],
    factions,
    selectedCommanders: setup.selectedCommanders || {},
    selectedDecks: setup.selectedDecks || { 1: { mode: "template" }, 2: { mode: "template" } },
    turnOrder: firstPlayer === 1 ? [1, 2] : [2, 1],
    orderIndex: 0,
    currentPlayer: firstPlayer,
    turn: 1,
    energy: { 1: START_ENE, 2: START_ENE },
    turnsStarted: { 1: 0, 2: 0 },
    modes: setup.modes,
    instanceCounters: {},
    pressure: { 1: 0, 2: 0 },
    desperation: { 1: 0, 2: 0 },
    playerEffects: { 1: [], 2: [] },
    c2c6b: { enemyDestroyedThisTurn: { 1: 0, 2: 0 } },
    mines: [],
    cellEffects: [],
    tacticCooldowns: { 1: {}, 2: {} },
    tacticUsedThisTurn: { 1: false, 2: false },
    c2eBotHandTacticsUsedThisTurn: { 1: 0, 2: 0 },
    fabeotEconomyAbilityUsed: { 1: false, 2: false },
    fabeotConversionUsed: { 1: false, 2: false },
    energyLocked: { 1: 0, 2: 0 },
    handLocked: { 1: 0, 2: 0 },
    psLocks: [],
    emergencyLoggedTurn: { 1: -1, 2: -1 },
    autoResignEnabled: setup.autoResignEnabled,
    aiMode: setup.aiMode,
    pacePreset: setup.pacePreset,
    winner: null,
    logSeq: 0,
    eventSeq: 0,
    events: [],
    matchRecorded: false,
    matchStats: null,

    // C2e-4g – telemetry minima per regression/balancing AI.
    aiTelemetry: {
      maxPressure:{ 1:0, 2:0 },
      turnsAt0PS:{ 1:0, 2:0 },
      turnsEnemyAt3PS:{ 1:0, 2:0 },
      goalSwitchCount:{ 1:0, 2:0 },
      lastGoal:{ 1:null, 2:null },
      lastGoalBeforeWin:{ 1:null, 2:null },
      cardsOverdrawn:{ 1:0, 2:0 },
      keyCardsOverdrawn:{ 1:[], 2:[] },
      deckRecoveries:{ 1:0, 2:0 },
      hazardsTriggered:{ 1:0, 2:0 },
      selfMineTriggers:{ 1:0, 2:0 },
      qgThreatTurns:{ 1:0, 2:0 },
      qgBlockedOpportunities:{ 1:0, 2:0 },
      pressureEmergencyTurns:{ 1:0, 2:0 },
      recoveriesFrom0PS:{ 1:0, 2:0 },
      wasAt0PS:{ 1:false, 2:false }
    },

    // C1a – fondazione passiva carte/deck/mano.
    cardCatalog: [],
    deck: { 1: [], 2: [] },
    hand: { 1: [], 2: [] },
    discard: { 1: [], 2: [] },
    starterCards: { 1: {}, 2: {} },
    cardDebug: {
      enabled: true,
      mode: "debug_passive",
      initialized: false,
      catalogSize: 0,
      deckSize: { 1: 0, 2: 0 },
      handSize: { 1: 0, 2: 0 },
      starterSlots: { 1: {}, 2: {} }
    },

    matchId: createMatchId()
  };
}

function resetInteractionContext() {
  selectedId = null;
  mode = "idle";
  pendingAbility = null;
  pendingBuildBlueprintId = null;
  pendingPurchaseBlueprintId = null;
  pendingTacticId = null;
  pendingHandCardUid = null;
}


    function createHq(side) {
      const faction = state.factions[side];
      return {
        id: `HQ-${side}-${faction}`,
        uid: `HQ-${side}-${faction}`,
        side,
        faction,
        name: `QG ${faction}`,
        type: "QG",
        weight: "Obiettivo",
        cost: 0,
        hp: 0,
        maxHp: 0,
        currentHp: 0,
        att: 0,
        baseAtt: 0,
        currentAtt: 0,
        def: 0,
        maxDef: 0,
        currentDef: 0,
        source: "QG v1.4.1 · cella occupabile",
        ability: null,
        pos: [...HQ_POS[side]],
        acted: true,
        movedThisTurn: false,
        abilityUsedThisTurn: false,
        builtThisTurn: false,
        alive: true,
        cooldownLeft: 0,
        buffs: [],
        statuses: []
      };
    }



    function createUnitFromBlueprint(bp, side) {
      const key = `${side}:${bp.id}`;
      state.instanceCounters[key] = (state.instanceCounters[key] || 0) + 1;
      const n = state.instanceCounters[key];
      return {
        ...bp,
        side,
        uid: `${bp.id}_${side}_${n}`,
        instanceNo: n,
        maxHp: bp.hp,
        currentHp: bp.hp,
        baseAtt: bp.att,
        currentAtt: bp.att,
        maxDef: bp.def,
        currentDef: bp.def,
        baseMoveBonus: bp.c1fMoveBonus || 0,
        attacksPerTurn: bp.attacksPerTurn || 1,
        attacksMade: 0,
        movedThisTurn: false,
        abilityUsedThisTurn: false,
        builtThisTurn: false,
        pos: null,
        acted: false,
        alive: true,
        cooldownLeft: 0,
        buffs: [],
        factionRules: Array.isArray(bp.factionRules) ? [...bp.factionRules] : [],
        statuses: (bp.startStatuses || []).map(st => ({ ...st }))
      };
    }

