"use strict";

// Arena Rubra – Fase B4d
// Stats extraction prudente.
// Questo file contiene registro matchup, localStorage, aggregazioni e CSV.
// Non introduce nuove meccaniche e non modifica il gameplay.

// Nota:
// Alcune funzioni usano helper globali ancora definiti altrove:
// - updateControlFromOccupants/countControlledPS/combatUnits/enemyOf da rules.js
// - log/EventTypes da render/events
// - renderMatchupStats/escapeHtml da render.js

function loadMatchStats() {
      try { return JSON.parse(localStorage.getItem(STATS_STORAGE_KEY) || "[]"); }
      catch (_) { return []; }
    }

    function saveMatchStats(items) {
      try { localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(items)); }
      catch (_) { /* localStorage non disponibile */ }
    }

    function recordMatchResult() {
      if (!state || state.matchRecorded) return;
      state.matchRecorded = true;
      updateControlFromOccupants();
      const winner = state.winnerSide;
      const p1Faction = state.factions[1];
      const p2Faction = state.factions[2];
      const record = {
        id: state.matchId,
        at: new Date().toISOString(),
        p1Faction,
        p2Faction,
        p1Mode: state.modes[1],
        p2Mode: state.modes[2],
        aiMode: state.aiMode,
        pacePreset: state.pacePreset,
        winnerSide: winner,
        winnerFaction: winner ? state.factions[winner] : "Pareggio",
        loserFaction: winner ? state.factions[enemyOf(winner)] : "Pareggio",
        winType: state.winType || "altro",
        round: state.turn,
        logLines: state.logSeq,
        pressure1: state.pressure[1],
        pressure2: state.pressure[2],
        ps1: countControlledPS(1),
        ps2: countControlledPS(2),
        units1: combatUnits(1).length,
        units2: combatUnits(2).length,
        ene1: state.energy[1],
        ene2: state.energy[2],
        maxPressureP1: state.aiTelemetry && state.aiTelemetry.maxPressure ? state.aiTelemetry.maxPressure[1] || 0 : 0,
        maxPressureP2: state.aiTelemetry && state.aiTelemetry.maxPressure ? state.aiTelemetry.maxPressure[2] || 0 : 0,
        turnsAt0PSP1: state.aiTelemetry && state.aiTelemetry.turnsAt0PS ? state.aiTelemetry.turnsAt0PS[1] || 0 : 0,
        turnsAt0PSP2: state.aiTelemetry && state.aiTelemetry.turnsAt0PS ? state.aiTelemetry.turnsAt0PS[2] || 0 : 0,
        turnsEnemyAt3PSP1: state.aiTelemetry && state.aiTelemetry.turnsEnemyAt3PS ? state.aiTelemetry.turnsEnemyAt3PS[1] || 0 : 0,
        turnsEnemyAt3PSP2: state.aiTelemetry && state.aiTelemetry.turnsEnemyAt3PS ? state.aiTelemetry.turnsEnemyAt3PS[2] || 0 : 0,
        goalSwitchCountP1: state.aiTelemetry && state.aiTelemetry.goalSwitchCount ? state.aiTelemetry.goalSwitchCount[1] || 0 : 0,
        goalSwitchCountP2: state.aiTelemetry && state.aiTelemetry.goalSwitchCount ? state.aiTelemetry.goalSwitchCount[2] || 0 : 0,
        lastGoalBeforeWinP1: state.aiTelemetry && state.aiTelemetry.lastGoalBeforeWin ? state.aiTelemetry.lastGoalBeforeWin[1] || "" : "",
        lastGoalBeforeWinP2: state.aiTelemetry && state.aiTelemetry.lastGoalBeforeWin ? state.aiTelemetry.lastGoalBeforeWin[2] || "" : "",
        cardsOverdrawnP1: state.aiTelemetry && state.aiTelemetry.cardsOverdrawn ? state.aiTelemetry.cardsOverdrawn[1] || 0 : 0,
        cardsOverdrawnP2: state.aiTelemetry && state.aiTelemetry.cardsOverdrawn ? state.aiTelemetry.cardsOverdrawn[2] || 0 : 0,
        keyCardsOverdrawnP1: state.aiTelemetry && state.aiTelemetry.keyCardsOverdrawn ? (state.aiTelemetry.keyCardsOverdrawn[1] || []).join(" | ") : "",
        keyCardsOverdrawnP2: state.aiTelemetry && state.aiTelemetry.keyCardsOverdrawn ? (state.aiTelemetry.keyCardsOverdrawn[2] || []).join(" | ") : "",
        deckRecoveriesP1: state.aiTelemetry && state.aiTelemetry.deckRecoveries ? state.aiTelemetry.deckRecoveries[1] || 0 : 0,
        deckRecoveriesP2: state.aiTelemetry && state.aiTelemetry.deckRecoveries ? state.aiTelemetry.deckRecoveries[2] || 0 : 0,
        hazardsTriggeredP1: state.aiTelemetry && state.aiTelemetry.hazardsTriggered ? state.aiTelemetry.hazardsTriggered[1] || 0 : 0,
        hazardsTriggeredP2: state.aiTelemetry && state.aiTelemetry.hazardsTriggered ? state.aiTelemetry.hazardsTriggered[2] || 0 : 0,
        selfMineTriggersP1: state.aiTelemetry && state.aiTelemetry.selfMineTriggers ? state.aiTelemetry.selfMineTriggers[1] || 0 : 0,
        selfMineTriggersP2: state.aiTelemetry && state.aiTelemetry.selfMineTriggers ? state.aiTelemetry.selfMineTriggers[2] || 0 : 0,
        qgThreatTurnsP1: state.aiTelemetry && state.aiTelemetry.qgThreatTurns ? state.aiTelemetry.qgThreatTurns[1] || 0 : 0,
        qgThreatTurnsP2: state.aiTelemetry && state.aiTelemetry.qgThreatTurns ? state.aiTelemetry.qgThreatTurns[2] || 0 : 0,
        qgBlockedOpportunitiesP1: state.aiTelemetry && state.aiTelemetry.qgBlockedOpportunities ? state.aiTelemetry.qgBlockedOpportunities[1] || 0 : 0,
        qgBlockedOpportunitiesP2: state.aiTelemetry && state.aiTelemetry.qgBlockedOpportunities ? state.aiTelemetry.qgBlockedOpportunities[2] || 0 : 0,
        pressureEmergencyTurnsP1: state.aiTelemetry && state.aiTelemetry.pressureEmergencyTurns ? state.aiTelemetry.pressureEmergencyTurns[1] || 0 : 0,
        pressureEmergencyTurnsP2: state.aiTelemetry && state.aiTelemetry.pressureEmergencyTurns ? state.aiTelemetry.pressureEmergencyTurns[2] || 0 : 0,
        recoveriesFrom0PSP1: state.aiTelemetry && state.aiTelemetry.recoveriesFrom0PS ? state.aiTelemetry.recoveriesFrom0PS[1] || 0 : 0,
        recoveriesFrom0PSP2: state.aiTelemetry && state.aiTelemetry.recoveriesFrom0PS ? state.aiTelemetry.recoveriesFrom0PS[2] || 0 : 0,
        message: state.winner || ""
      };
      const items = loadMatchStats();
      items.unshift(record);
      saveMatchStats(items.slice(0, 500));
      log(`Statistiche matchup registrate: ${p1Faction} vs ${p2Faction}, vincitore ${record.winnerFaction}, round ${record.round}.`, EventTypes.MATCH_STATS_RECORDED, {
        record
      });
    }

    function matchupKey(a, b) { return [a,b].sort().join(" vs "); }
    function matchupLabel(a, b) { return matchupKey(a,b); }
    function factionWinClass(faction) { return faction && faction !== "Pareggio" ? `win${faction}` : ""; }

    function aggregateMatchStats(items) {
      const map = new Map();
      for (const r of items) {
        const key = matchupKey(r.p1Faction, r.p2Faction);
        if (!map.has(key)) map.set(key, { key, games:0, wins:{}, types:{}, roundTotal:0 });
        const row = map.get(key);
        row.games += 1;
        row.roundTotal += Number(r.round || 0);
        row.wins[r.winnerFaction] = (row.wins[r.winnerFaction] || 0) + 1;
        row.types[r.winType] = (row.types[r.winType] || 0) + 1;
      }
      return [...map.values()].sort((a,b) => b.games - a.games || a.key.localeCompare(b.key));
    }

    function formatWins(wins) {
      return Object.entries(wins).sort((a,b) => b[1]-a[1]).map(([f,n]) => `<span class="${factionWinClass(f)}">${escapeHtml(f)}</span> ${n}`).join(" · ");
    }

    function formatTypes(types) {
      return Object.entries(types).sort((a,b) => b[1]-a[1]).map(([t,n]) => `${escapeHtml(t)} ${n}`).join(" · ");
    }

    function statsToCsv() {
      const items = loadMatchStats();
      const fields = ["at","p1Faction","p2Faction","winnerFaction","winnerSide","winType","round","logLines","pacePreset","aiMode","ps1","ps2","pressure1","pressure2","units1","units2","ene1","ene2","maxPressureP1","maxPressureP2","turnsAt0PSP1","turnsAt0PSP2","turnsEnemyAt3PSP1","turnsEnemyAt3PSP2","goalSwitchCountP1","goalSwitchCountP2","lastGoalBeforeWinP1","lastGoalBeforeWinP2","cardsOverdrawnP1","cardsOverdrawnP2","keyCardsOverdrawnP1","keyCardsOverdrawnP2","deckRecoveriesP1","deckRecoveriesP2","hazardsTriggeredP1","hazardsTriggeredP2","selfMineTriggersP1","selfMineTriggersP2","qgThreatTurnsP1","qgThreatTurnsP2","qgBlockedOpportunitiesP1","qgBlockedOpportunitiesP2","pressureEmergencyTurnsP1","pressureEmergencyTurnsP2","recoveriesFrom0PSP1","recoveriesFrom0PSP2","message"];
      const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
      return [fields.join(","), ...items.map(r => fields.map(f => esc(r[f])).join(","))].join("\n");
    }

    function resetMatchStats() {
      if (!confirm("Azzerare il registro statistiche matchup salvato in questo browser?")) return;
      saveMatchStats([]);
      renderMatchupStats();
    }

    async function copyMatchStatsCsv() {
      const csv = statsToCsv();
      try {
        await navigator.clipboard.writeText(csv);
        if (state) log("CSV statistiche copiato negli appunti.");
        else alert("CSV copiato negli appunti.");
      } catch (_) {
        prompt("Copia manualmente il CSV:", csv);
      }
    }


function safeFilenamePart(value) {
  return String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9_\-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "arena_rubra";
}

function currentBuildVersionLabel() {
  if (typeof buildInfoLabel === "function") return buildInfoLabel();
  if (typeof CONFIG !== "undefined" && CONFIG && CONFIG.version) return CONFIG.version;
  if (typeof CARD_CATALOG_CONFIG !== "undefined" && CARD_CATALOG_CONFIG && CARD_CATALOG_CONFIG.version) return CARD_CATALOG_CONFIG.version;
  return "unknown";
}

function commanderLogLabel(side) {
  if (!state) return "—";
  const catalog = state.cardCatalog || (typeof buildCardCatalog === "function" ? buildCardCatalog() : null);
  const card = typeof selectedCommanderCardForSide === "function" ? selectedCommanderCardForSide(side, catalog) : null;
  return card ? card.name : (state.selectedCommanders && state.selectedCommanders[side] ? state.selectedCommanders[side] : "—");
}

function matchLogHeaderText() {
  if (!state) return "Arena Rubra – nessuna partita attiva";
  if (typeof updateControlFromOccupants === "function") updateControlFromOccupants();
  const winnerSide = state.winnerSide || "";
  const lines = [
    "ARENA RUBRA – MATCH LOG",
    `Build: ${currentBuildVersionLabel()}`,
    ...(typeof buildInfoExportMeta === "function" ? Object.entries(buildInfoExportMeta()).map(([k,v]) => `BuildInfo.${k}: ${v}`) : []),
    `ExportedAt: ${new Date().toISOString()}`,
    `MatchId: ${state.matchId || ""}`,
    `Round: ${state.turn || 0}`,
    `PacePreset: ${state.pacePreset || ""}`,
    `AiMode: ${state.aiMode || ""}`,
    `P1: ${state.factions && state.factions[1] ? state.factions[1] : ""} · Commander: ${commanderLogLabel(1)} · Mode: ${state.modes && state.modes[1] ? state.modes[1] : ""}`,
    `P2: ${state.factions && state.factions[2] ? state.factions[2] : ""} · Commander: ${commanderLogLabel(2)} · Mode: ${state.modes && state.modes[2] ? state.modes[2] : ""}`,
    `WinnerSide: ${winnerSide}`,
    `WinnerFaction: ${winnerSide && state.factions ? state.factions[winnerSide] : ""}`,
    `WinType: ${state.winType || ""}`,
    `FinalPS: P1 ${typeof countControlledPS === "function" ? countControlledPS(1) : "?"} / P2 ${typeof countControlledPS === "function" ? countControlledPS(2) : "?"}`,
    `FinalPressure: P1 ${state.pressure ? state.pressure[1] || 0 : 0} / P2 ${state.pressure ? state.pressure[2] || 0 : 0}`,
    `FinalENE: P1 ${state.energy ? state.energy[1] || 0 : 0} / P2 ${state.energy ? state.energy[2] || 0 : 0}`,
    `FinalUnits: P1 ${typeof combatUnits === "function" ? combatUnits(1).length : "?"} / P2 ${typeof combatUnits === "function" ? combatUnits(2).length : "?"}`,
    `EventCount: ${Array.isArray(state.events) ? state.events.length : 0}`,
    `EventSeqMax: ${state.eventSeq || 0}`,
    "",
    "EVENTI"
  ];
  return lines.join("\n");
}

function currentMatchLogTxt() {
  if (!state) return matchLogHeaderText();
  const events = Array.isArray(state.events) ? state.events.slice().reverse() : [];
  const lines = events.map(ev => {
    const seq = Number.isFinite(ev && ev.seq) ? `#${String(ev.seq).padStart(4, "0")}` : "#----";
    const at = ev && ev.at ? ev.at : "";
    const type = ev && ev.type ? ev.type : "LOG";
    const msg = typeof gameEventToLogText === "function" ? gameEventToLogText(ev) : (ev && ev.message ? ev.message : "");
    return `${seq}\t${at}\t${type}\t${msg}`;
  });
  return `${matchLogHeaderText()}\n${lines.join("\n")}`;
}

async function copyCurrentMatchLogTxt() {
  const text = currentMatchLogTxt();
  try {
    await navigator.clipboard.writeText(text);
    if (state) log("Log partita copiato negli appunti.");
    else alert("Log copiato negli appunti.");
  } catch (_) {
    prompt("Copia manualmente il log:", text);
  }
}

function exportCurrentMatchLogTxt() {
  const text = currentMatchLogTxt();
  const version = safeFilenamePart(currentBuildVersionLabel());
  const p1 = state && state.factions ? safeFilenamePart(state.factions[1]) : "P1";
  const p2 = state && state.factions ? safeFilenamePart(state.factions[2]) : "P2";
  const round = state ? state.turn || 0 : 0;
  const filename = `arena_rubra_${version}_${p1}_vs_${p2}_R${round}.txt`;
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  if (state) log(`Log partita esportato come ${filename}.`);
}


// =====================================================
// F9F – MatchStats in memoria + export strutturato
// =====================================================
// Fondazione prudente: il riepilogo partita viene alimentato dagli eventi tipizzati
// emessi dal motore. Non parsa il testo del log e non modifica il gameplay.

function f9fEmptyPlayerStats() {
  return {
    turnsStarted: 0,
    turnsEnded: 0,
    energyGained: 0,
    energySpent: 0,
    unitsSpawned: 0,
    structuresBuilt: 0,
    moves: 0,
    movedCells: 0,
    attacks: 0,
    attackAmountTotal: 0,
    abilitiesUsed: 0,
    tacticsUsed: 0,
    statusesApplied: 0,
    statusesExpired: 0,
    damageTaken: 0,
    defDamageTaken: 0,
    hpDamageTaken: 0,
    unitsLost: 0,
    structuresLost: 0,
    commandersLost: 0,
    pivotsLost: 0,
    psControlChanges: 0,
    cardsDrawn: 0,
    cardsPlayed: 0,
    deckRecoveries: 0
  };
}

function f9fSideKey(side) {
  const n = Number(side);
  return n === 1 || n === 2 ? String(n) : null;
}

function f9fPlayerBucket(stats, side) {
  const key = f9fSideKey(side);
  if (!key || !stats || !stats.players) return null;
  if (!stats.players[key]) stats.players[key] = f9fEmptyPlayerStats();
  return stats.players[key];
}

function f9fNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function f9fCubeDistance(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length < 3 || b.length < 3) return 0;
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

function f9fUnitById(uid) {
  if (!uid || !state || !Array.isArray(state.units)) return null;
  return state.units.find(u => u && u.uid === uid) || null;
}

function f9fStatusBucket(stats, kind) {
  const key = String(kind || "unknown");
  stats.statuses[key] = stats.statuses[key] || { applied:0, expired:0 };
  return stats.statuses[key];
}

function f9fTacticBucket(stats, nameOrId) {
  const key = String(nameOrId || "unknown");
  stats.tactics[key] = (stats.tactics[key] || 0) + 1;
}

function f9fAbilityBucket(stats, nameOrKind) {
  const key = String(nameOrKind || "unknown");
  stats.abilities[key] = (stats.abilities[key] || 0) + 1;
}

function initializeMatchStats() {
  if (!state) return null;
  const build = typeof buildInfoExportMeta === "function" ? buildInfoExportMeta() : { version: currentBuildVersionLabel() };
  state.matchStats = {
    schemaVersion: "F9F-1",
    source: "typed-events",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    matchId: state.matchId || "",
    build,
    setup: {
      map: build.map || "Starter MAP1 radius 6",
      radius: typeof RADIUS !== "undefined" ? RADIUS : null,
      pacePreset: state.pacePreset || "",
      aiMode: state.aiMode || "",
      factions: { 1: state.factions ? state.factions[1] : "", 2: state.factions ? state.factions[2] : "" },
      modes: { 1: state.modes ? state.modes[1] : "", 2: state.modes ? state.modes[2] : "" },
      commanders: { 1: commanderLogLabel(1), 2: commanderLogLabel(2) },
      firstPlayer: state.currentPlayer || null
    },
    current: {},
    final: null,
    eventSeqMax: state.eventSeq || 0,
    eventCount: 0,
    eventCounts: {},
    players: { 1: f9fEmptyPlayerStats(), 2: f9fEmptyPlayerStats() },
    totals: {
      moves: 0,
      movedCells: 0,
      attacks: 0,
      attackAmountTotal: 0,
      damage: 0,
      damageToDef: 0,
      damageToHp: 0,
      unitsSpawned: 0,
      structuresBuilt: 0,
      unitsDestroyed: 0,
      abilitiesUsed: 0,
      tacticsUsed: 0,
      psControlChanges: 0,
      economyEvents: 0,
      statusesApplied: 0,
      statusesExpired: 0,
      cardsDrawn: 0,
      cardsPlayed: 0,
      deckRecoveries: 0
    },
    tactics: {},
    abilities: {},
    statuses: {},
    psTimeline: []
  };
  refreshMatchStatsSnapshot();
  return state.matchStats;
}

function ensureMatchStats() {
  if (!state) return null;
  if (!state.matchStats) return initializeMatchStats();
  return state.matchStats;
}

function f9fReadCardZoneCounts(side) {
  if (!state) return { deck:0, hand:0, discard:0 };
  return {
    deck: state.deck && Array.isArray(state.deck[side]) ? state.deck[side].length : 0,
    hand: state.hand && Array.isArray(state.hand[side]) ? state.hand[side].length : 0,
    discard: state.discard && Array.isArray(state.discard[side]) ? state.discard[side].length : 0
  };
}

function refreshMatchStatsSnapshot() {
  if (!state || !state.matchStats) return null;
  const stats = state.matchStats;
  const ps1 = typeof countControlledPS === "function" ? countControlledPS(1) : 0;
  const ps2 = typeof countControlledPS === "function" ? countControlledPS(2) : 0;
  const units1 = typeof combatUnits === "function" ? combatUnits(1).length : 0;
  const units2 = typeof combatUnits === "function" ? combatUnits(2).length : 0;
  stats.updatedAt = new Date().toISOString();
  stats.eventSeqMax = state.eventSeq || 0;
  stats.eventCount = Array.isArray(state.events) ? state.events.length : stats.eventCount || 0;
  stats.current = {
    round: state.turn || 0,
    currentPlayer: state.currentPlayer || null,
    winnerSide: state.winnerSide || null,
    winnerFaction: state.winnerSide && state.factions ? state.factions[state.winnerSide] : "",
    winType: state.winType || "",
    ps: { 1: ps1, 2: ps2 },
    pressure: { 1: state.pressure ? state.pressure[1] || 0 : 0, 2: state.pressure ? state.pressure[2] || 0 : 0 },
    energy: { 1: state.energy ? state.energy[1] || 0 : 0, 2: state.energy ? state.energy[2] || 0 : 0 },
    units: { 1: units1, 2: units2 },
    cards: { 1: f9fReadCardZoneCounts(1), 2: f9fReadCardZoneCounts(2) }
  };
  if (state.winnerSide && !stats.final) {
    stats.final = { ...stats.current, finishedAt: new Date().toISOString() };
  }
  return stats;
}

function updateMatchStatsFromEvent(event) {
  if (!state || !event) return null;
  const stats = ensureMatchStats();
  if (!stats) return null;
  const type = event.type || "LOG_MESSAGE";
  const data = event.data || {};
  stats.eventSeqMax = event.seq || stats.eventSeqMax || 0;
  stats.eventCount += 1;
  stats.eventCounts[type] = (stats.eventCounts[type] || 0) + 1;

  switch (type) {
    case EventTypes.GAME_STARTED: {
      stats.setup.firstPlayer = data.firstPlayer || stats.setup.firstPlayer;
      stats.setup.factions = { 1: data.faction1 || stats.setup.factions[1], 2: data.faction2 || stats.setup.factions[2] };
      break;
    }
    case EventTypes.TURN_STARTED: {
      const bucket = f9fPlayerBucket(stats, data.player);
      if (bucket) bucket.turnsStarted += 1;
      break;
    }
    case EventTypes.TURN_ENDED: {
      const bucket = f9fPlayerBucket(stats, data.player || (state ? state.currentPlayer : null));
      if (bucket) bucket.turnsEnded += 1;
      break;
    }
    case EventTypes.UNIT_SPAWNED: {
      const bucket = f9fPlayerBucket(stats, data.player || data.side);
      if (bucket) {
        bucket.unitsSpawned += 1;
        bucket.energySpent += Math.max(0, f9fNumber(data.cost, 0));
      }
      stats.totals.unitsSpawned += 1;
      break;
    }
    case EventTypes.UNIT_BUILT: {
      const bucket = f9fPlayerBucket(stats, data.player || data.side);
      if (bucket) {
        bucket.structuresBuilt += 1;
        bucket.energySpent += Math.max(0, f9fNumber(data.cost, 0));
      }
      stats.totals.structuresBuilt += 1;
      break;
    }
    case EventTypes.UNIT_MOVED: {
      const bucket = f9fPlayerBucket(stats, data.player || data.side);
      const dist = f9fCubeDistance(data.from, data.to);
      if (bucket) {
        bucket.moves += 1;
        bucket.movedCells += dist;
      }
      stats.totals.moves += 1;
      stats.totals.movedCells += dist;
      break;
    }
    case EventTypes.UNIT_ATTACKED: {
      const bucket = f9fPlayerBucket(stats, data.attackerSide || data.player);
      const amount = Math.max(0, f9fNumber(data.amount, 0));
      if (bucket) {
        bucket.attacks += 1;
        bucket.attackAmountTotal += amount;
      }
      stats.totals.attacks += 1;
      stats.totals.attackAmountTotal += amount;
      break;
    }
    case EventTypes.UNIT_DAMAGED: {
      const targetSide = data.targetSide || (f9fUnitById(data.targetId) ? f9fUnitById(data.targetId).side : null);
      const bucket = f9fPlayerBucket(stats, targetSide);
      const defLoss = Math.max(0, f9fNumber(data.defLoss, 0));
      const hpLoss = Math.max(0, f9fNumber(data.hpLoss, 0));
      const total = defLoss + hpLoss;
      if (bucket) {
        bucket.damageTaken += total;
        bucket.defDamageTaken += defLoss;
        bucket.hpDamageTaken += hpLoss;
      }
      stats.totals.damage += total;
      stats.totals.damageToDef += defLoss;
      stats.totals.damageToHp += hpLoss;
      break;
    }
    case EventTypes.UNIT_DESTROYED: {
      const unit = f9fUnitById(data.unitId);
      const side = data.side || (unit ? unit.side : null);
      const bucket = f9fPlayerBucket(stats, side);
      if (bucket) {
        bucket.unitsLost += 1;
        if (unit && unit.type === "Struttura") bucket.structuresLost += 1;
        if (unit && unit.type === "Comandante") bucket.commandersLost += 1;
        if (unit && unit.weight === "Pivot") bucket.pivotsLost += 1;
      }
      stats.totals.unitsDestroyed += 1;
      break;
    }
    case EventTypes.ABILITY_USED: {
      const bucket = f9fPlayerBucket(stats, data.player);
      if (bucket) {
        bucket.abilitiesUsed += 1;
        bucket.energySpent += Math.max(0, f9fNumber(data.cost, 0));
      }
      stats.totals.abilitiesUsed += 1;
      f9fAbilityBucket(stats, data.abilityName || data.abilityKind);
      break;
    }
    case EventTypes.TACTIC_USED: {
      const bucket = f9fPlayerBucket(stats, data.player);
      if (bucket) {
        bucket.tacticsUsed += 1;
        bucket.cardsPlayed += data.cardUid ? 1 : 0;
        bucket.energySpent += Math.max(0, f9fNumber(data.cost, 0));
      }
      stats.totals.tacticsUsed += 1;
      if (data.cardUid) stats.totals.cardsPlayed += 1;
      f9fTacticBucket(stats, data.tacticName || data.tacticId || data.tacticKind);
      break;
    }
    case EventTypes.STATUS_APPLIED: {
      const bucket = f9fPlayerBucket(stats, data.owner || data.player || data.targetSide);
      if (bucket) bucket.statusesApplied += 1;
      stats.totals.statusesApplied += 1;
      f9fStatusBucket(stats, data.kind || data.status || data.modifier).applied += 1;
      break;
    }
    case EventTypes.STATUS_EXPIRED: {
      const bucket = f9fPlayerBucket(stats, data.owner || data.player || data.targetSide);
      if (bucket) bucket.statusesExpired += 1;
      stats.totals.statusesExpired += 1;
      f9fStatusBucket(stats, data.kind || data.status || data.modifier).expired += 1;
      break;
    }
    case EventTypes.ECONOMY_CHANGED: {
      stats.totals.economyEvents += 1;
      const bucket = f9fPlayerBucket(stats, data.player || data.side || data.owner);
      const gain = f9fNumber(data.gain, 0);
      const cost = f9fNumber(data.cost, 0);
      if (bucket) {
        if (gain > 0) bucket.energyGained += gain;
        if (cost > 0) bucket.energySpent += cost;
      }
      break;
    }
    case EventTypes.PS_CONTROL_CHANGED: {
      stats.totals.psControlChanges += 1;
      const next = data.nextControl || null;
      const prev = data.previousControl || null;
      const nextBucket = f9fPlayerBucket(stats, next);
      const prevBucket = f9fPlayerBucket(stats, prev);
      if (nextBucket) nextBucket.psControlChanges += 1;
      if (prevBucket && prev !== next) prevBucket.psControlChanges += 1;
      stats.psTimeline.push({
        seq: event.seq || null,
        round: data.round || (state ? state.turn : 0),
        coord: Array.isArray(data.coord) ? [...data.coord] : null,
        previousControl: prev,
        nextControl: next,
        occupantName: data.occupantName || ""
      });
      if (stats.psTimeline.length > 200) stats.psTimeline.shift();
      break;
    }
    default: {
      // LOG_MESSAGE e altri eventi futuri restano contati in eventCounts.
      break;
    }
  }

  refreshMatchStatsSnapshot();
  return stats;
}

function currentMatchStatsObject() {
  if (!state) return { error:"Nessuna partita attiva" };
  const stats = ensureMatchStats();
  refreshMatchStatsSnapshot();
  return stats;
}

function currentMatchStatsJson() {
  return JSON.stringify(currentMatchStatsObject(), null, 2);
}

function topEntries(obj, limit = 8) {
  return Object.entries(obj || {}).sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0)).slice(0, limit);
}

function currentMatchReportText() {
  if (!state) return "Arena Rubra – nessuna partita attiva";
  const stats = currentMatchStatsObject();
  const c = stats.current || {};
  const p1 = stats.players && stats.players[1] ? stats.players[1] : f9fEmptyPlayerStats();
  const p2 = stats.players && stats.players[2] ? stats.players[2] : f9fEmptyPlayerStats();
  const avgAtt1 = p1.attacks ? (p1.attackAmountTotal / p1.attacks).toFixed(2) : "0";
  const avgAtt2 = p2.attacks ? (p2.attackAmountTotal / p2.attacks).toFixed(2) : "0";
  const topTactics = topEntries(stats.tactics, 6).map(([k,v]) => `${k}: ${v}`).join("; ") || "—";
  const topAbilities = topEntries(stats.abilities, 6).map(([k,v]) => `${k}: ${v}`).join("; ") || "—";
  const lines = [
    "ARENA RUBRA – MATCH REPORT",
    `Build: ${stats.build && stats.build.version ? stats.build.version : currentBuildVersionLabel()}`,
    `MatchId: ${stats.matchId || ""}`,
    `Round: ${c.round || 0}`,
    `Setup: ${stats.setup.factions[1]} (${stats.setup.modes[1]}) vs ${stats.setup.factions[2]} (${stats.setup.modes[2]}) · ${stats.setup.pacePreset} · ${stats.setup.map}`,
    `Comandanti: G1 ${stats.setup.commanders[1] || "—"} / G2 ${stats.setup.commanders[2] || "—"}`,
    `Vincitore: ${c.winnerFaction || "—"} · Tipo: ${c.winType || "—"}`,
    `PS: G1 ${c.ps ? c.ps[1] : 0} / G2 ${c.ps ? c.ps[2] : 0}`,
    `Pressione: G1 ${c.pressure ? c.pressure[1] : 0} / G2 ${c.pressure ? c.pressure[2] : 0}`,
    `ENE finale: G1 ${c.energy ? c.energy[1] : 0} / G2 ${c.energy ? c.energy[2] : 0}`,
    `Unità finali: G1 ${c.units ? c.units[1] : 0} / G2 ${c.units ? c.units[2] : 0}`,
    `Eventi: ${stats.eventCount} · Seq max: ${stats.eventSeqMax}`,
    "",
    "AZIONI",
    `Movimenti: G1 ${p1.moves} (${p1.movedCells} celle) / G2 ${p2.moves} (${p2.movedCells} celle)`,
    `Attacchi: G1 ${p1.attacks} (ATT medio ${avgAtt1}) / G2 ${p2.attacks} (ATT medio ${avgAtt2})`,
    `Abilità: G1 ${p1.abilitiesUsed} / G2 ${p2.abilitiesUsed}`,
    `Tattiche: G1 ${p1.tacticsUsed} / G2 ${p2.tacticsUsed}`,
    `Spawn unità: G1 ${p1.unitsSpawned} / G2 ${p2.unitsSpawned}`,
    `Strutture costruite: G1 ${p1.structuresBuilt} / G2 ${p2.structuresBuilt}`,
    "",
    "COMBATTIMENTO",
    `Danno a DEF: ${stats.totals.damageToDef}`,
    `Danno a HP: ${stats.totals.damageToHp}`,
    `Unità distrutte: ${stats.totals.unitsDestroyed}`,
    `Perdite: G1 ${p1.unitsLost} / G2 ${p2.unitsLost}`,
    "",
    "TOP EVENTI",
    `Tattiche: ${topTactics}`,
    `Abilità: ${topAbilities}`
  ];
  return lines.join("\n");
}

function f9fEscapeHtml(value) {
  if (typeof escapeHtml === "function") return escapeHtml(value);
  return String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c]));
}

function renderCurrentMatchStatsPanel() {
  const panel = typeof $ === "function" ? $("currentMatchStatsPanel") : null;
  if (!panel) return;
  if (!state) {
    panel.innerHTML = `<div class="help">Nessuna partita attiva. Avvia una nuova partita per generare matchStats.</div>`;
    return;
  }
  const stats = currentMatchStatsObject();
  const c = stats.current || {};
  const p1 = stats.players && stats.players[1] ? stats.players[1] : f9fEmptyPlayerStats();
  const p2 = stats.players && stats.players[2] ? stats.players[2] : f9fEmptyPlayerStats();
  const eventRows = topEntries(stats.eventCounts, 8).map(([k,v]) => `<tr><td>${f9fEscapeHtml(k)}</td><td>${v}</td></tr>`).join("");
  panel.innerHTML = `
    <div class="statGrid">
      <div class="statTile"><strong>${stats.eventCount || 0}</strong><span>eventi tipizzati</span></div>
      <div class="statTile"><strong>${c.round || 0}</strong><span>round corrente</span></div>
      <div class="statTile"><strong>${stats.totals.moves || 0}</strong><span>movimenti</span></div>
      <div class="statTile"><strong>${stats.totals.attacks || 0}</strong><span>attacchi</span></div>
      <div class="statTile"><strong>${stats.totals.damageToDef || 0}/${stats.totals.damageToHp || 0}</strong><span>danno DEF/HP</span></div>
      <div class="statTile"><strong>${stats.totals.tacticsUsed || 0}</strong><span>tattiche usate</span></div>
    </div>
    <div class="miniTable"><table>
      <thead><tr><th>G</th><th>Fazione</th><th>PS</th><th>Press.</th><th>ENE</th><th>Unità</th><th>Move</th><th>Atk</th><th>Abil.</th><th>Tatt.</th><th>Perdite</th></tr></thead>
      <tbody>
        <tr><td>G1</td><td>${f9fEscapeHtml(stats.setup.factions[1])}</td><td>${c.ps ? c.ps[1] : 0}</td><td>${c.pressure ? c.pressure[1] : 0}</td><td>${c.energy ? c.energy[1] : 0}</td><td>${c.units ? c.units[1] : 0}</td><td>${p1.moves}</td><td>${p1.attacks}</td><td>${p1.abilitiesUsed}</td><td>${p1.tacticsUsed}</td><td>${p1.unitsLost}</td></tr>
        <tr><td>G2</td><td>${f9fEscapeHtml(stats.setup.factions[2])}</td><td>${c.ps ? c.ps[2] : 0}</td><td>${c.pressure ? c.pressure[2] : 0}</td><td>${c.energy ? c.energy[2] : 0}</td><td>${c.units ? c.units[2] : 0}</td><td>${p2.moves}</td><td>${p2.attacks}</td><td>${p2.abilitiesUsed}</td><td>${p2.tacticsUsed}</td><td>${p2.unitsLost}</td></tr>
      </tbody>
    </table></div>
    <details>
      <summary>Conteggio eventi</summary>
      <div class="miniTable"><table><thead><tr><th>Evento</th><th>Conteggio</th></tr></thead><tbody>${eventRows || `<tr><td>—</td><td>0</td></tr>`}</tbody></table></div>
    </details>`;
}

async function f9fCopyText(text, okMessage) {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
    } else if (typeof document !== "undefined") {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "true");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
    } else {
      return text;
    }
    if (state && okMessage) log(okMessage);
  } catch (_) {
    if (typeof prompt === "function") prompt("Copia manualmente:", text);
  }
  return text;
}

function copyCurrentMatchStatsJson() {
  return f9fCopyText(currentMatchStatsJson(), "Statistiche partita JSON copiate negli appunti.");
}

function copyCurrentMatchReportText() {
  return f9fCopyText(currentMatchReportText(), "Report sintetico partita copiato negli appunti.");
}

function copyCurrentMatchEventsJson() {
  const text = typeof exportEventsJson === "function" ? exportEventsJson(null) : JSON.stringify((state && state.events) || [], null, 2);
  return f9fCopyText(text, "Eventi JSON copiati negli appunti.");
}
