"use strict";

// Arena Rubra – F9P1 Persistent Storage Foundation.
// Unico layer di accesso allo storage persistente dell'app.
// Per ora usa localStorage, ma Deck Builder / Stats / Setup devono passare da qui:
// in futuro il backend potrà diventare file JSON per EXE/APK senza riscrivere le schermate.

const ARENA_STORAGE_SCHEMA_VERSION = "F9P1-1";
const ARENA_STORAGE_KEYS = Object.freeze({
  customDecks: "arenaRubraF9H3SavedDecksV1",        // chiave F9H3 mantenuta per compatibilità.
  matchupStats: typeof STATS_STORAGE_KEY !== "undefined" ? STATS_STORAGE_KEY : "arenaRubra.matchupStats.v1",
  matchHistory: "arenaRubra.matchHistory.v1",
  settings: "arenaRubra.settings.v1"
});

function arenaStorageAvailable() {
  try {
    if (typeof localStorage === "undefined") return false;
    const key = "__arenaRubraStorageProbe__";
    localStorage.setItem(key, "1");
    localStorage.removeItem(key);
    return true;
  } catch (_) {
    return false;
  }
}

function arenaStorageReadJson(key, fallback) {
  if (!arenaStorageAvailable()) return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch (err) {
    console.warn(`Arena Rubra storage: lettura JSON fallita per ${key}`, err);
    return fallback;
  }
}

function arenaStorageWriteJson(key, value) {
  if (!arenaStorageAvailable()) return false;
  try {
    localStorage.setItem(key, JSON.stringify(value, null, 2));
    return true;
  } catch (err) {
    console.warn(`Arena Rubra storage: scrittura JSON fallita per ${key}`, err);
    return false;
  }
}

function arenaStorageRemove(key) {
  if (!arenaStorageAvailable()) return false;
  try {
    localStorage.removeItem(key);
    return true;
  } catch (err) {
    console.warn(`Arena Rubra storage: rimozione fallita per ${key}`, err);
    return false;
  }
}

function arenaStorageCopyText(text, okMessage = "Testo copiato negli appunti.") {
  if (typeof f9fCopyText === "function") return f9fCopyText(text, okMessage);
  if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    return navigator.clipboard.writeText(text).then(() => text).catch(() => {
      if (typeof prompt === "function") prompt("Copia manualmente:", text);
      return text;
    });
  }
  if (typeof prompt === "function") prompt("Copia manualmente:", text);
  return text;
}


function arenaStorageSafeFilenamePart(value) {
  return String(value || "arena_rubra")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "arena_rubra";
}

function arenaStorageTimestampForFilename() {
  try {
    return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "_");
  } catch (_) {
    return "export";
  }
}

function arenaStorageDownloadText(text, filename = "arena_rubra_export.json", mime = "application/json") {
  const content = String(text == null ? "" : text);
  const safeName = String(filename || "arena_rubra_export.json");
  if (typeof document === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined") {
    return arenaStorageCopyText(content, `Download non disponibile: ${safeName}. JSON copiato negli appunti.`);
  }
  try {
    const blob = new Blob([content], { type: `${mime || "text/plain"};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = safeName;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try { URL.revokeObjectURL(url); } catch (_) {}
      try { a.remove(); } catch (_) {}
    }, 0);
    return content;
  } catch (err) {
    console.warn("Arena Rubra storage: download testo fallito", err);
    return arenaStorageCopyText(content, `Download fallito: ${safeName}. JSON copiato negli appunti.`);
  }
}

function arenaStorageReadCustomDecks() {
  const store = arenaStorageReadJson(ARENA_STORAGE_KEYS.customDecks, {});
  return store && typeof store === "object" && !Array.isArray(store) ? store : {};
}

function arenaStorageWriteCustomDecks(store) {
  const safe = store && typeof store === "object" && !Array.isArray(store) ? store : {};
  return arenaStorageWriteJson(ARENA_STORAGE_KEYS.customDecks, safe);
}

function arenaStorageCustomDecksEnvelope() {
  return {
    schemaVersion: ARENA_STORAGE_SCHEMA_VERSION,
    kind: "arena-rubra-custom-decks",
    exportedAt: new Date().toISOString(),
    build: typeof buildInfoExportMeta === "function" ? buildInfoExportMeta() : {},
    storageKey: ARENA_STORAGE_KEYS.customDecks,
    decks: arenaStorageReadCustomDecks()
  };
}

function arenaStorageExportCustomDecksJson() {
  return JSON.stringify(arenaStorageCustomDecksEnvelope(), null, 2);
}

function arenaStorageImportCustomDecksFromText(text) {
  let parsed;
  try { parsed = JSON.parse(String(text || "")); }
  catch (err) { return { ok:false, imported:0, issues:[`JSON non valido: ${err.message || err}`] }; }

  const source = parsed && parsed.decks && typeof parsed.decks === "object" && !Array.isArray(parsed.decks)
    ? parsed.decks
    : parsed;

  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return { ok:false, imported:0, issues:["Il JSON non contiene un dizionario deck valido."] };
  }

  const current = arenaStorageReadCustomDecks();
  const issues = [];
  let imported = 0;
  Object.entries(source).forEach(([key, payload]) => {
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.deckIds)) {
      issues.push(`${key}: payload ignorato, deckIds assente.`);
      return;
    }
    current[key] = {
      ...payload,
      importedAt: new Date().toISOString(),
      importedBy: "F9I1"
    };
    imported += 1;
  });

  const ok = arenaStorageWriteCustomDecks(current);
  return { ok: ok && imported > 0, imported, issues: ok ? issues : [...issues, "scrittura storage fallita"] };
}

function arenaStorageReadMatchupStats() {
  const items = arenaStorageReadJson(ARENA_STORAGE_KEYS.matchupStats, []);
  return Array.isArray(items) ? items : [];
}

function arenaStorageWriteMatchupStats(items) {
  return arenaStorageWriteJson(ARENA_STORAGE_KEYS.matchupStats, Array.isArray(items) ? items : []);
}

function arenaStorageReadMatchHistory() {
  const items = arenaStorageReadJson(ARENA_STORAGE_KEYS.matchHistory, []);
  return Array.isArray(items) ? items : [];
}

function arenaStorageWriteMatchHistory(items) {
  return arenaStorageWriteJson(ARENA_STORAGE_KEYS.matchHistory, Array.isArray(items) ? items : []);
}

function arenaStorageAppendMatchHistory(record, limit = 500) {
  if (!record || typeof record !== "object") return false;
  const items = arenaStorageReadMatchHistory();
  const id = record.id || record.matchId || "";
  const filtered = id ? items.filter(item => (item && (item.id || item.matchId)) !== id) : items;
  filtered.unshift({
    schemaVersion: ARENA_STORAGE_SCHEMA_VERSION,
    recordedAt: new Date().toISOString(),
    ...record
  });
  return arenaStorageWriteMatchHistory(filtered.slice(0, limit));
}

function arenaStorageMatchHistoryEnvelope() {
  return {
    schemaVersion: ARENA_STORAGE_SCHEMA_VERSION,
    kind: "arena-rubra-match-history",
    exportedAt: new Date().toISOString(),
    build: typeof buildInfoExportMeta === "function" ? buildInfoExportMeta() : {},
    storageKey: ARENA_STORAGE_KEYS.matchHistory,
    matches: arenaStorageReadMatchHistory()
  };
}

function arenaStorageExportMatchHistoryJson() {
  return JSON.stringify(arenaStorageMatchHistoryEnvelope(), null, 2);
}

function arenaStorageImportMatchHistoryFromText(text) {
  let parsed;
  try { parsed = JSON.parse(String(text || "")); }
  catch (err) { return { ok:false, imported:0, issues:[`JSON non valido: ${err.message || err}`] }; }

  const source = Array.isArray(parsed && parsed.matches) ? parsed.matches : (Array.isArray(parsed) ? parsed : null);
  if (!source) return { ok:false, imported:0, issues:["Il JSON non contiene un array matches valido."] };

  const current = arenaStorageReadMatchHistory();
  const byId = new Map();
  current.forEach(item => {
    const key = item && (item.id || item.matchId || `${item.at || item.recordedAt || ""}::${item.p1Faction || ""}::${item.p2Faction || ""}`);
    if (key) byId.set(key, item);
  });

  let imported = 0;
  source.forEach(item => {
    if (!item || typeof item !== "object") return;
    const key = item.id || item.matchId || `${item.at || item.recordedAt || ""}::${item.p1Faction || ""}::${item.p2Faction || ""}`;
    if (!key) return;
    byId.set(key, { ...item, importedAt: new Date().toISOString(), importedBy: "F9I1" });
    imported += 1;
  });

  const merged = Array.from(byId.values()).sort((a, b) => String(b.recordedAt || b.at || "").localeCompare(String(a.recordedAt || a.at || "")));
  const ok = arenaStorageWriteMatchHistory(merged.slice(0, 500));
  return { ok: ok && imported > 0, imported, issues: ok ? [] : ["scrittura storage fallita"] };
}

function arenaStorageResetMatchHistory() {
  return arenaStorageWriteMatchHistory([]);
}

function arenaStorageReadSettings() {
  const settings = arenaStorageReadJson(ARENA_STORAGE_KEYS.settings, {});
  return settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
}

function arenaStorageWriteSettings(settings) {
  const safe = settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
  return arenaStorageWriteJson(ARENA_STORAGE_KEYS.settings, safe);
}
