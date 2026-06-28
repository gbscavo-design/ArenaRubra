"use strict";

// Arena Rubra – Fase B2c
// Event layer minimale.
// Obiettivo: iniziare a separare "cosa accade nel motore" da "come viene mostrato nel log".
// In questa fase il gameplay resta invariato: log(msg) continua a funzionare come prima,
// ma i principali log del motore ora passano con EventTypes specifici.
// B2c aggiunge export/debug eventi e tipizza tattiche, stati, AI plan e controllo PS.
// C2e-4h2: il registro eventi runtime non viene più troncato a 1000 eventi,
// così Copia log / Esporta log .txt includono tutta la partita.

const EventTypes = Object.freeze({
  LOG_MESSAGE: "LOG_MESSAGE",

  GAME_STARTED: "GAME_STARTED",
  TURN_STARTED: "TURN_STARTED",
  TURN_ENDED: "TURN_ENDED",

  UNIT_SPAWNED: "UNIT_SPAWNED",
  UNIT_MOVED: "UNIT_MOVED",
  UNIT_ATTACKED: "UNIT_ATTACKED",
  UNIT_DAMAGED: "UNIT_DAMAGED",
  UNIT_DESTROYED: "UNIT_DESTROYED",
  UNIT_BUILT: "UNIT_BUILT",

  ABILITY_USED: "ABILITY_USED",
  TACTIC_USED: "TACTIC_USED",
  STATUS_APPLIED: "STATUS_APPLIED",
  STATUS_EXPIRED: "STATUS_EXPIRED",

  ECONOMY_CHANGED: "ECONOMY_CHANGED",
  PS_CONTROL_CHANGED: "PS_CONTROL_CHANGED",
  AI_PLAN_CHANGED: "AI_PLAN_CHANGED",

  VICTORY: "VICTORY",
  MATCH_STATS_RECORDED: "MATCH_STATS_RECORDED"
});

function normalizeGameEvent(event) {
  const safe = event && typeof event === "object" ? event : { message: String(event ?? "") };
  return {
    type: safe.type || EventTypes.LOG_MESSAGE,
    message: safe.message || "",
    data: safe.data || {},
    at: safe.at || new Date().toISOString()
  };
}

function emitGameEvent(event) {
  const normalized = normalizeGameEvent(event);

  // state è definito in src/main.js. In script browser non-module, le dichiarazioni globali
  // sono condivise tra file caricati in ordine. Qui controlliamo comunque in modo difensivo.
  if (typeof state !== "undefined" && state) {
    state.eventSeq = (state.eventSeq || 0) + 1;
    normalized.seq = state.eventSeq;

    if (!Array.isArray(state.events)) state.events = [];
    // Manteniamo l'ordine storico del runtime esistente: eventi più recenti in testa.
    // C2e-4h2: niente più cap a 1000. L'export TXT/JSON deve contenere
    // tutti gli eventi della partita, anche nei match lunghi da balancing.
    state.events.unshift(normalized);

    // F9F: matchStats viene alimentato dagli eventi tipizzati, non dal parsing del log testuale.
    if (typeof updateMatchStatsFromEvent === "function") {
      try { updateMatchStatsFromEvent(normalized); }
      catch (err) { console.warn("Arena Rubra matchStats update failed", err); }
    }
  }

  return normalized;
}

function gameEventToLogText(event) {
  if (!event) return "";
  if (event.message) return event.message;

  // Formatter minimi: in B2a quasi tutti gli eventi arrivano ancora dal vecchio log(msg).
  switch (event.type) {
    case EventTypes.GAME_STARTED:
      return "Partita avviata.";
    case EventTypes.TURN_STARTED:
      return `Inizia il turno di G${event.data && event.data.player ? event.data.player : "?"}.`;
    case EventTypes.VICTORY:
      return event.data && event.data.message ? event.data.message : "Vittoria.";
    default:
      return event.type || "";
  }
}

function logGameEvent(event) {
  const emitted = emitGameEvent(event);
  const text = gameEventToLogText(emitted);

  // appendLogLine è definita in src/main.js e rappresenta il vecchio output DOM del log.
  // In questo modo il browser continua a comportarsi come prima, ma abbiamo anche eventi dati.
  if (text && typeof appendLogLine === "function") {
    appendLogLine(text);
  }

  return emitted;
}

function lastGameEvents(limit = 50) {
  if (typeof state === "undefined" || !state || !Array.isArray(state.events)) return [];
  return state.events.slice(0, limit);
}

function clearGameEvents() {
  if (typeof state !== "undefined" && state) {
    state.events = [];
    state.eventSeq = 0;
  }
}

function eventCountsByType() {
  const out = {};
  const list = typeof state !== "undefined" && state && Array.isArray(state.events) ? state.events : [];
  for (const ev of list) out[ev.type] = (out[ev.type] || 0) + 1;
  return out;
}


function exportEventsJson(limit = null) {
  const list = typeof state !== "undefined" && state && Array.isArray(state.events) ? state.events : [];
  const selected = Number.isFinite(limit) && limit > 0 ? list.slice(0, limit) : list;
  return JSON.stringify(selected, null, 2);
}

function copyEventsJson(limit = null) {
  const text = exportEventsJson(limit);

  if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    return navigator.clipboard.writeText(text).then(() => text);
  }

  if (typeof document !== "undefined") {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "true");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    try { document.execCommand("copy"); }
    finally { document.body.removeChild(area); }
  }

  return text;
}

function downloadEventsJson(filename = "arena-rubra-events.json", limit = null) {
  const text = exportEventsJson(limit);
  if (typeof document === "undefined") return text;

  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return text;
}
