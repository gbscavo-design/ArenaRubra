"use strict";

// Arena Rubra – F9H1 Deck Builder Read/Validate Foundation.
// Schermata di sola lettura/validazione: non salva deck, non modifica setup,
// non influenza initializeCardZonesForGame() o la logica Starter congelata.

const deckBuilderState = {
  faction: "Nexus",
  commanderId: ""
};

function dbEscapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[c]));
}

function deckBuilderFactionList() {
  if (typeof FACTIONS !== "undefined" && FACTIONS) return Object.keys(FACTIONS);
  const catalog = typeof buildCardCatalog === "function" ? buildCardCatalog() : [];
  return [...new Set(catalog.map(card => card && card.faction).filter(Boolean))].sort();
}

function deckBuilderCommanderLabel(card) {
  if (!card) return "Comandante";
  if (typeof commanderOptionLabel === "function") return commanderOptionLabel(card);
  const archetype = card.commanderArchetype ? ` · ${card.commanderArchetype}` : "";
  return `${card.name}${archetype}`;
}

function deckBuilderRoleLabel(card) {
  if (!card) return "—";
  const role = card.deckRole || card.cardType || "—";
  const map = {
    commander: "Comandante",
    pivot: "Pivot",
    elite: "Elite",
    heavy: "Pesante",
    base: "Base",
    tactic: "Tattica",
    unit_structure: "Struttura",
    unit_infantry: "Fanteria",
    unit_vehicle: "Veicolo"
  };
  return map[role] || role;
}

function deckBuilderTypeLabel(card) {
  if (!card) return "—";
  if (card.sourceType === "tactic") return `Tattica${card.category ? ` · ${card.category}` : ""}`;
  return [card.unitType, card.weight].filter(Boolean).join(" · ") || card.cardType || "Carta";
}

function deckBuilderCardSort(a, b) {
  if (typeof deckCardSort === "function") return deckCardSort(a, b);
  const fa = String(a && a.faction || "").localeCompare(String(b && b.faction || ""));
  if (fa) return fa;
  const ca = Number.isFinite(a && a.cost) ? a.cost : 99;
  const cb = Number.isFinite(b && b.cost) ? b.cost : 99;
  if (ca !== cb) return ca - cb;
  return String(a && a.name || "").localeCompare(String(b && b.name || ""));
}

function deckBuilderReportObject() {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  const catalog = typeof buildCardCatalog === "function" ? buildCardCatalog() : [];
  const faction = deckBuilderState.faction || deckBuilderFactionList()[0] || "Nexus";
  const commanderId = deckBuilderState.commanderId || (typeof defaultCommanderBlueprintIdForFaction === "function" ? defaultCommanderBlueprintIdForFaction(faction, catalog) : "");
  const options = { selectedCommanderId: commanderId };
  const pool = typeof deckPoolCardsForFaction === "function" ? deckPoolCardsForFaction(faction, catalog, options).sort(deckBuilderCardSort) : [];
  const deck = typeof buildDebugDeckForFaction === "function" ? buildDebugDeckForFaction(faction, catalog, null, options) : [];
  const sanity = typeof deckSanityForFaction === "function" ? deckSanityForFaction(faction, catalog, null, options) : null;
  const starterExcludedIds = typeof deckStarterExclusionIdsForFaction === "function" ? deckStarterExclusionIdsForFaction(faction, catalog) : new Set();
  const starters = typeof starterCardsForFaction === "function" ? starterCardsForFaction(faction, catalog).filter(card => starterExcludedIds.has(card.id)).sort(deckBuilderCardSort) : [];
  const counts = typeof countCardCopies === "function" ? countCardCopies(deck) : {};
  const commanders = typeof commanderCardsForFaction === "function" ? commanderCardsForFaction(faction, catalog) : [];
  const commander = commanders.find(card => card.blueprintId === commanderId) || commanders[0] || null;

  return {
    build: typeof buildInfoExportMeta === "function" ? buildInfoExportMeta() : {},
    mode: "F9H1 read_validate_only",
    faction,
    commanderId,
    commanderName: commander ? commander.name : "",
    deckRules: {
      deckSize: config.deckSize || 30,
      starterExcluded: config.excludeStarterCardsFromDeck !== false,
      commanderPivotEliteMax: 1,
      defaultMaxCopies: config.deckCopyRules && Number.isFinite(config.deckCopyRules.defaultMaxCopies) ? config.deckCopyRules.defaultMaxCopies : 2
    },
    catalogSize: catalog.length,
    poolSize: pool.length,
    starterExcluded: starters.map(card => ({ id: card.id, name: card.name, role: card.starterRole, cost: card.cost })),
    sanity,
    deck: deck.map(card => ({
      id: card.id,
      name: card.name,
      faction: card.faction,
      sourceType: card.sourceType,
      deckRole: card.deckRole,
      cardType: card.cardType,
      cost: card.cost,
      copyNo: card.deckCopyNo || null,
      copyLimit: typeof deckCopyLimitForCard === "function" ? deckCopyLimitForCard(card) : null
    })),
    deckCopyCounts: counts
  };
}

function deckBuilderSummaryHtml(report) {
  const sanity = report.sanity || {};
  const ok = Boolean(sanity && sanity.deckSize === report.deckRules.deckSize && sanity.canBuildLegalDeck && !(sanity.copyViolations || []).length && !sanity.debugOverflowCopies);
  const statusClass = ok ? "good" : "bad";
  const statusText = ok ? "Deck template valido" : "Deck template da controllare";
  const roleCounts = sanity.roleCounts || {};
  const violations = Array.isArray(sanity.copyViolations) ? sanity.copyViolations : [];
  return `
    <div class="deckBuilderStatus ${statusClass}">
      <strong>${dbEscapeHtml(statusText)}</strong>
      <span>${dbEscapeHtml(report.faction)} · ${dbEscapeHtml(report.commanderName || report.commanderId || "Comandante")}</span>
    </div>
    <div class="deckBuilderStatGrid">
      <div class="statTile"><strong>${sanity.deckSize || report.deck.length}</strong><span>carte deck</span></div>
      <div class="statTile"><strong>${report.deckRules.deckSize}</strong><span>target</span></div>
      <div class="statTile"><strong>${sanity.poolSize || report.poolSize}</strong><span>pool legale</span></div>
      <div class="statTile"><strong>${sanity.legalCapacity || 0}</strong><span>capacità legale</span></div>
      <div class="statTile"><strong>${sanity.uniqueCards || Object.keys(report.deckCopyCounts || {}).length}</strong><span>carte uniche</span></div>
      <div class="statTile"><strong>${violations.length}</strong><span>violazioni copie</span></div>
    </div>
    <div class="deckBuilderRuleBox">
      <strong>Regole freeze lette dai dati:</strong>
      deck ${report.deckRules.deckSize}; comandante/pivot/elite max 1; altre carte/tattiche max ${report.deckRules.defaultMaxCopies}; starter esclusi dal deck.
      <br />Ruoli nel template: comandante ${roleCounts.commander || 0}, base ${roleCounts.base || 0}, pesanti ${roleCounts.heavy || 0}, elite ${roleCounts.elite || 0}, pivot ${roleCounts.pivot || 0}, tattiche ${roleCounts.tactic || 0}.
    </div>
    ${violations.length ? `<div class="deckBuilderIssueBox"><strong>Violazioni:</strong> ${violations.map(v => `${dbEscapeHtml(v.name || v.id)} ${v.count}/${v.limit}`).join("; ")}</div>` : ""}
    ${sanity.debugOverflowCopies ? `<div class="deckBuilderIssueBox"><strong>Overflow debug:</strong> ${sanity.debugOverflowCopies} copie. Da non usare in integrazione gameplay.</div>` : ""}`;
}

function deckBuilderPoolRowsHtml(pool, report) {
  const deckCounts = report.deckCopyCounts || {};
  if (!pool.length) return `<tr><td colspan="7">Nessuna carta nel pool.</td></tr>`;
  return pool.map(card => {
    const limit = typeof deckCopyLimitForCard === "function" ? deckCopyLimitForCard(card) : "—";
    const copies = deckCounts[card.id] || 0;
    const cls = copies > 0 ? "deckBuilderInTemplate" : "";
    return `<tr class="${cls}">
      <td>${dbEscapeHtml(card.id)}</td>
      <td><strong>${dbEscapeHtml(card.name)}</strong></td>
      <td>${dbEscapeHtml(deckBuilderRoleLabel(card))}</td>
      <td>${dbEscapeHtml(deckBuilderTypeLabel(card))}</td>
      <td>${Number.isFinite(card.cost) ? card.cost : "—"}</td>
      <td>${copies}/${limit}</td>
      <td>${dbEscapeHtml(card.effectText || card.ability && card.ability.description || card.target || "")}</td>
    </tr>`;
  }).join("");
}

function deckBuilderDeckRowsHtml(deck) {
  if (!deck.length) return `<tr><td colspan="6">Nessun deck template generato.</td></tr>`;
  const byId = new Map();
  for (const card of deck) {
    const row = byId.get(card.id) || { card, count: 0 };
    row.count += 1;
    byId.set(card.id, row);
  }
  return [...byId.values()].sort((a, b) => deckBuilderCardSort(a.card, b.card)).map(row => {
    const card = row.card;
    const limit = typeof deckCopyLimitForCard === "function" ? deckCopyLimitForCard(card) : "—";
    return `<tr>
      <td>${dbEscapeHtml(card.id)}</td>
      <td><strong>${dbEscapeHtml(card.name)}</strong></td>
      <td>${dbEscapeHtml(deckBuilderRoleLabel(card))}</td>
      <td>${Number.isFinite(card.cost) ? card.cost : "—"}</td>
      <td>${row.count}/${limit}</td>
      <td>${dbEscapeHtml(deckBuilderTypeLabel(card))}</td>
    </tr>`;
  }).join("");
}

function deckBuilderStartersHtml(report) {
  const list = report.starterExcluded || [];
  if (!list.length) return `<div class="help">Nessuno starter escluso rilevato per questa fazione.</div>`;
  return `<div class="deckBuilderStarterList">${list.map(card => `
    <div class="unitCard deckBuilderStarterCard">
      <h4>${dbEscapeHtml(card.name)} <span>${dbEscapeHtml(card.role || "starter")}</span></h4>
      <div class="meta">${dbEscapeHtml(card.id)} · costo ${Number.isFinite(card.cost) ? card.cost : "—"} · esclusa dal deck</div>
    </div>`).join("")}</div>`;
}

function populateDeckBuilderFactionSelect() {
  const select = document.getElementById("deckBuilderFactionSelect");
  if (!select) return;
  const factions = deckBuilderFactionList();
  if (!factions.includes(deckBuilderState.faction)) deckBuilderState.faction = factions[0] || "Nexus";
  select.innerHTML = factions.map(faction => `<option value="${dbEscapeHtml(faction)}">${dbEscapeHtml(faction)}</option>`).join("");
  select.value = deckBuilderState.faction;
}

function populateDeckBuilderCommanderSelect() {
  const select = document.getElementById("deckBuilderCommanderSelect");
  if (!select || typeof buildCardCatalog !== "function" || typeof commanderCardsForFaction !== "function") return;
  const catalog = buildCardCatalog();
  const faction = deckBuilderState.faction;
  const commanders = commanderCardsForFaction(faction, catalog);
  const fallback = typeof defaultCommanderBlueprintIdForFaction === "function" ? defaultCommanderBlueprintIdForFaction(faction, catalog) : (commanders[0] && commanders[0].blueprintId);
  if (!deckBuilderState.commanderId || !commanders.some(card => card.blueprintId === deckBuilderState.commanderId)) deckBuilderState.commanderId = fallback || "";
  select.innerHTML = commanders.map(card => `<option value="${dbEscapeHtml(card.blueprintId)}">${dbEscapeHtml(deckBuilderCommanderLabel(card))}</option>`).join("");
  select.value = deckBuilderState.commanderId;
}

function renderDeckBuilderScreen() {
  if (typeof document === "undefined") return;
  const summary = document.getElementById("deckBuilderSummary");
  const poolBody = document.getElementById("deckBuilderPoolBody");
  const deckBody = document.getElementById("deckBuilderDeckBody");
  const starterBox = document.getElementById("deckBuilderStarterBox");
  const meta = document.getElementById("deckBuilderMetaLine");
  if (!summary || !poolBody || !deckBody || !starterBox) return;

  populateDeckBuilderFactionSelect();
  populateDeckBuilderCommanderSelect();
  const report = deckBuilderReportObject();
  const pool = typeof deckPoolCardsForFaction === "function" ? deckPoolCardsForFaction(report.faction, buildCardCatalog(), { selectedCommanderId: report.commanderId }).sort(deckBuilderCardSort) : [];

  summary.innerHTML = deckBuilderSummaryHtml(report);
  poolBody.innerHTML = deckBuilderPoolRowsHtml(pool, report);
  deckBody.innerHTML = deckBuilderDeckRowsHtml(report.deck || []);
  starterBox.innerHTML = deckBuilderStartersHtml(report);
  if (meta) meta.textContent = `${report.build.version || "build"} · ${report.mode} · catalogo ${report.catalogSize} carte`;
}

function openDeckBuilderScreen() {
  if (typeof syncSetupScreenFromLegacyControls === "function") {
    try {
      deckBuilderState.faction = (typeof readControlValue === "function") ? readControlValue("setupP1Faction", deckBuilderState.faction) : deckBuilderState.faction;
    } catch (_) {}
  }
  renderDeckBuilderScreen();
  if (typeof setAppScreen === "function" && typeof ARENA_APP_SCREENS !== "undefined") setAppScreen(ARENA_APP_SCREENS.DECK_BUILDER);
}

function deckBuilderReportJson() {
  return JSON.stringify(deckBuilderReportObject(), null, 2);
}

function copyDeckBuilderReportJson() {
  const text = deckBuilderReportJson();
  if (typeof f9fCopyText === "function") return f9fCopyText(text, "Report deck builder JSON copiato negli appunti.");
  if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") return navigator.clipboard.writeText(text).then(() => text);
  if (typeof prompt === "function") prompt("Copia manualmente:", text);
  return text;
}

function initializeDeckBuilderScreen() {
  if (typeof document === "undefined") return;
  populateDeckBuilderFactionSelect();
  populateDeckBuilderCommanderSelect();

  const factionSelect = document.getElementById("deckBuilderFactionSelect");
  if (factionSelect && factionSelect.dataset.bound !== "1") {
    factionSelect.dataset.bound = "1";
    factionSelect.addEventListener("change", () => {
      deckBuilderState.faction = factionSelect.value;
      deckBuilderState.commanderId = "";
      renderDeckBuilderScreen();
    });
  }

  const commanderSelect = document.getElementById("deckBuilderCommanderSelect");
  if (commanderSelect && commanderSelect.dataset.bound !== "1") {
    commanderSelect.dataset.bound = "1";
    commanderSelect.addEventListener("change", () => {
      deckBuilderState.commanderId = commanderSelect.value;
      renderDeckBuilderScreen();
    });
  }

  const copyBtn = document.getElementById("deckBuilderCopyJsonBtn");
  if (copyBtn && copyBtn.dataset.bound !== "1") {
    copyBtn.dataset.bound = "1";
    copyBtn.addEventListener("click", copyDeckBuilderReportJson);
  }
}
