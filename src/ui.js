"use strict";

// Arena Rubra – Fase B3b
// UI bindings isolation prudente.
// Questo file contiene i collegamenti DOM: pulsanti, select, toggle e avvio iniziale.
// Non introduce nuove meccaniche e non modifica il gameplay.


function commanderOptionLabel(card) {
  const bp = card && typeof BLUEPRINTS !== "undefined" ? BLUEPRINTS.find(x => x.id === card.blueprintId) : null;
  const archetype = bp && bp.commanderArchetype ? ` · ${bp.commanderArchetype}` : "";
  return `${card.name}${archetype}`;
}

function populateCommanderSelectForSide(side) {
  const factionSelect = $(`p${side}Faction`);
  const commanderSelect = $(`p${side}Commander`);
  if (!factionSelect || !commanderSelect || typeof commanderCardsForFaction !== "function") return;

  const faction = factionSelect.value;
  const previous = commanderSelect.value;
  const commanders = commanderCardsForFaction(faction);
  commanderSelect.innerHTML = commanders.map(card => `<option value="${card.blueprintId}">${commanderOptionLabel(card)}</option>`).join("");

  const fallback = typeof defaultCommanderBlueprintIdForFaction === "function" ? defaultCommanderBlueprintIdForFaction(faction) : (commanders[0] && commanders[0].blueprintId);
  commanderSelect.value = commanders.some(card => card.blueprintId === previous) ? previous : fallback;
}

function refreshCommanderSelects() {
  populateCommanderSelectForSide(1);
  populateCommanderSelectForSide(2);
}

function bindUiEvents() {
$("newGameBtn").addEventListener("click", newGame);
    $("resetStatsBtn").addEventListener("click", resetMatchStats);
    $("copyStatsBtn").addEventListener("click", copyMatchStatsCsv);
    if ($("copyLogBtn")) $("copyLogBtn").addEventListener("click", copyCurrentMatchLogTxt);
    if ($("exportLogBtn")) $("exportLogBtn").addEventListener("click", exportCurrentMatchLogTxt);
    if ($("copyMatchStatsJsonBtn")) $("copyMatchStatsJsonBtn").addEventListener("click", copyCurrentMatchStatsJson);
    if ($("copyMatchReportBtn")) $("copyMatchReportBtn").addEventListener("click", copyCurrentMatchReportText);
    if ($("copyEventsJsonBtn")) $("copyEventsJsonBtn").addEventListener("click", copyCurrentMatchEventsJson);
    if ($("copyStatsFullLogBtn")) $("copyStatsFullLogBtn").addEventListener("click", copyCurrentMatchLogTxt);
    if ($("copyMatchHistoryJsonBtn")) $("copyMatchHistoryJsonBtn").addEventListener("click", copyPersistentMatchHistoryJson);
    if ($("importMatchHistoryJsonBtn")) $("importMatchHistoryJsonBtn").addEventListener("click", importPersistentMatchHistoryJson);
    if ($("resetMatchHistoryBtn")) $("resetMatchHistoryBtn").addEventListener("click", resetPersistentMatchHistory);
    $("endTurnBtn").addEventListener("click", endTurn);
    $("runBotBtn").addEventListener("click", maybeRunBot);
    $("concedeBtn").addEventListener("click", () => concedeMatch(state.currentPlayer));
    $("autoResignToggle").addEventListener("change", () => { if (state) state.autoResignEnabled = $("autoResignToggle").checked; });
    $("botAiMode").addEventListener("change", () => { if (state) { state.aiMode = $("botAiMode").value; log(`AI dei bot impostata su ${state.aiMode === "advanced" ? "Avanzata v1.8.11" : "Base v0.9"}.`); maybeRunBot(); renderAll(); } });
    $("pacePreset").addEventListener("change", () => { if (state) { state.pacePreset = $("pacePreset").value; log(`Preset ritmo impostato su ${paceLabel()}: Pressione dal round ${pressureStartRound()}, cap leggere G1 ${lightFieldLimit(1)} / G2 ${lightFieldLimit(2)}, movimento veicoli ${vehicleMoveRange()}.`); renderAll(); maybeRunBot(); } });
    $("p1Mode").addEventListener("change", () => { if (state) state.modes[1] = $("p1Mode").value; maybeRunBot(); renderAll(); });
    $("p2Mode").addEventListener("change", () => { if (state) state.modes[2] = $("p2Mode").value; maybeRunBot(); renderAll(); });
    $("p1Faction").addEventListener("change", () => { refreshCommanderSelects(); if (state) log("La fazione/comandante del G1 verranno applicati dalla prossima nuova partita."); });
    $("p2Faction").addEventListener("change", () => { refreshCommanderSelects(); if (state) log("La fazione/comandante del G2 verranno applicati dalla prossima nuova partita."); });
    if ($("p1Commander")) $("p1Commander").addEventListener("change", () => { if (state) log("Il comandante del G1 verrà applicato dalla prossima nuova partita."); });
    if ($("p2Commander")) $("p2Commander").addEventListener("change", () => { if (state) log("Il comandante del G2 verrà applicato dalla prossima nuova partita."); });
    $("initiativeMode").addEventListener("change", () => { if (state) log("L'iniziativa verrà applicata dalla prossima nuova partita."); });
}

function bootArenaRubra() {
  refreshCommanderSelects();
  bindUiEvents();
  if (typeof initializeArenaAppShell === "function") initializeArenaAppShell();
  else newGame();
}

bootArenaRubra();
