"use strict";

// Arena Rubra – C1a
// Deck/hand/discard foundation.
// C1e rende giocabili dalla mano le carte unità. Le tattiche in mano restano non giocabili fino a C2.

function sanitizeCardUidPart(value) {
  return String(value || "card").replace(/[^A-Za-z0-9_]+/g, "_");
}

function createCardInstance(card, side, zone, index) {
  return {
    ...card,
    side,
    zone,
    cardUid: `${sanitizeCardUidPart(card.id)}_${side}_${zone}_${index + 1}`,
    instanceNo: index + 1
  };
}

function shuffleCardsRuntime(cards, rng = Math.random) {
  const result = [...(cards || [])];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = result[i];
    result[i] = result[j];
    result[j] = tmp;
  }
  return result;
}

function shouldShuffleRuntimeDeckAfterInitialHand() {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  return config.runtimeDeckShuffleAfterInitialHand !== false;
}

function selectStarterLoadoutForFaction(faction, catalog = null) {
  const list = starterCardsForFaction(faction, catalog);
  const result = {
    starter_infantry: null,
    starter_vehicle: null,
    starter_structure: null
  };

  for (const role of Object.keys(result)) {
    const candidates = list
      .filter(card => card.starterRole === role)
      .sort((a, b) => (a.cost - b.cost) || String(a.name).localeCompare(String(b.name)));
    result[role] = candidates[0] || null;
  }

  return result;
}

function deckCopyRulesConfig() {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  const rules = config.deckCopyRules || {};
  return {
    defaultMaxCopies: Number.isFinite(rules.defaultMaxCopies) ? rules.defaultMaxCopies : 2,
    uniqueRoles: new Set(Array.isArray(rules.uniqueRoles) ? rules.uniqueRoles : ["commander", "pivot", "elite"]),
    uniqueMaxCopies: Number.isFinite(rules.uniqueMaxCopies) ? rules.uniqueMaxCopies : 1,
    allowDebugOverflowWhenPoolShort: rules.allowDebugOverflowWhenPoolShort !== false
  };
}

function deckCopyLimitForCard(card) {
  const rules = deckCopyRulesConfig();
  if (!card) return 0;
  if (rules.uniqueRoles.has(card.deckRole) || card.cardType === "commander" || card.cardType === "pivot") return rules.uniqueMaxCopies;
  return rules.defaultMaxCopies;
}

function deckRoleSortValue(card) {
  const roleOrder = { commander: 0, base: 1, heavy: 2, elite: 3, tactic: 4, pivot: 5 };
  return roleOrder[card && card.deckRole] ?? 99;
}

function deckCardSort(a, b) {
  const ra = deckRoleSortValue(a);
  const rb = deckRoleSortValue(b);
  if (ra !== rb) return ra - rb;
  const ca = Number.isFinite(a && a.cost) ? a.cost : 99;
  const cb = Number.isFinite(b && b.cost) ? b.cost : 99;
  if (ca !== cb) return ca - cb;
  return String(a && a.name || "").localeCompare(String(b && b.name || ""));
}

function deckLegalCapacityForFaction(faction, catalog = null, options = {}) {
  const pool = deckPoolCardsForFaction(faction, catalog, options);
  return pool.reduce((sum, card) => sum + deckCopyLimitForCard(card), 0);
}

function withDeckCopyMeta(card, copyNo, options = {}) {
  return {
    ...card,
    deckCopyNo: copyNo,
    debugOverflowCopy: Boolean(options.debugOverflowCopy),
    deckCopyLimit: deckCopyLimitForCard(card)
  };
}

function buildLegalDeckTemplateForFaction(faction, catalog = null, size = null, options = {}) {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  const targetSize = Number.isFinite(size) ? size : (config.deckSize || 30);
  const pool = deckPoolCardsForFaction(faction, catalog, options).sort(deckCardSort);
  const deck = [];

  // C2a: quando il pool contiene almeno 30 carte diverse, il template automatico prende
  // prima 1 copia di ogni carta. Così le tattiche entrano davvero nel deck data-only.
  if (config.deckTemplateMode === "unique_pool_first") {
    for (const card of pool) {
      if (deck.length >= targetSize) break;
      deck.push(withDeckCopyMeta(card, 1));
    }
    let copyNo = 2;
    while (deck.length < targetSize) {
      let added = false;
      for (const card of pool) {
        if (deck.length >= targetSize) break;
        const limit = deckCopyLimitForCard(card);
        if (copyNo <= limit) {
          deck.push(withDeckCopyMeta(card, copyNo));
          added = true;
        }
      }
      if (!added) break;
      copyNo += 1;
    }
    return deck;
  }

  for (const card of pool) {
    const limit = deckCopyLimitForCard(card);
    for (let copyNo = 1; copyNo <= limit && deck.length < targetSize; copyNo += 1) {
      deck.push(withDeckCopyMeta(card, copyNo));
    }
    if (deck.length >= targetSize) break;
  }

  return deck;
}

function orderDeckForOpeningHand(deck) {
  const source = [...deck];
  const ordered = [];

  function take(predicate, count = 1) {
    let taken = 0;
    for (let i = 0; i < source.length && taken < count; i += 1) {
      const card = source[i];
      if (!card || !predicate(card)) continue;
      ordered.push(card);
      source.splice(i, 1);
      i -= 1;
      taken += 1;
    }
  }

  // Apertura stabile: comandante, due carte base, due speciali unità quando disponibili.
  take(card => card.deckRole === "commander" || card.cardType === "commander", 1);
  take(card => card.deckRole === "base" && card.sourceType === "unit", 2);
  take(card => ["heavy", "elite"].includes(card.deckRole) && card.sourceType === "unit", 2);

  source.sort(deckCardSort);
  return [...ordered, ...source];
}

function addDebugOverflowCopiesIfNeeded(deck, faction, catalog = null, size = null, options = {}) {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  const rules = deckCopyRulesConfig();
  const targetSize = Number.isFinite(size) ? size : (config.deckSize || 30);
  if (deck.length >= targetSize || !rules.allowDebugOverflowWhenPoolShort) return deck;

  const pool = deckPoolCardsForFaction(faction, catalog, options)
    .filter(card => deckCopyLimitForCard(card) > 1)
    .sort(deckCardSort);
  if (!pool.length) return deck;

  const counts = countCardCopies(deck);
  let cursor = 0;
  while (deck.length < targetSize && cursor < targetSize * 4) {
    const card = pool[cursor % pool.length];
    const id = card.id;
    const nextCopy = (counts[id] || 0) + 1;
    counts[id] = nextCopy;
    deck.push(withDeckCopyMeta(card, nextCopy, { debugOverflowCopy: true }));
    cursor += 1;
  }
  return deck;
}

function buildDebugDeckForFaction(faction, catalog = null, size = null, options = {}) {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  const targetSize = Number.isFinite(size) ? size : (config.deckSize || 30);
  const legalDeck = buildLegalDeckTemplateForFaction(faction, catalog, targetSize, options);
  const filledDeck = addDebugOverflowCopiesIfNeeded(legalDeck, faction, catalog, targetSize, options);
  const orderedDeck = orderDeckForOpeningHand(filledDeck).slice(0, targetSize);
  return orderedDeck.map((card, i) => createCardInstance(card, null, "deck", i));
}

function countCardCopies(cards) {
  const counts = {};
  for (const card of cards || []) {
    if (!card || !card.id) continue;
    counts[card.id] = (counts[card.id] || 0) + 1;
  }
  return counts;
}

function deckCopyViolations(cards) {
  const counts = countCardCopies(cards);
  const byId = new Map((cards || []).filter(Boolean).map(card => [card.id, card]));
  const violations = [];
  for (const [id, count] of Object.entries(counts)) {
    const card = byId.get(id);
    const limit = deckCopyLimitForCard(card);
    if (count > limit) {
      violations.push({ id, name: card ? card.name : id, count, limit, overflow: count - limit });
    }
  }
  return violations;
}

function deckRoleCounts(cards) {
  const counts = {};
  for (const card of cards || []) {
    const role = card && card.deckRole ? card.deckRole : "unknown";
    counts[role] = (counts[role] || 0) + 1;
  }
  return counts;
}

function deckSanityForFaction(faction, catalog = null, size = null, options = {}) {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  const targetSize = Number.isFinite(size) ? size : (config.deckSize || 30);
  const sourceCatalog = catalog || buildCardCatalog();
  const pool = deckPoolCardsForFaction(faction, sourceCatalog, options);
  const deck = buildDebugDeckForFaction(faction, sourceCatalog, targetSize, options);
  const violations = deckCopyViolations(deck);
  const overflowCopies = deck.filter(card => card && card.debugOverflowCopy).length;
  const commanderCards = deck.filter(card => card && (card.deckRole === "commander" || card.cardType === "commander"));
  const pivotCards = deck.filter(card => card && (card.deckRole === "pivot" || card.cardType === "pivot"));
  const legalCapacity = deckLegalCapacityForFaction(faction, sourceCatalog, options);

  return {
    faction,
    targetSize,
    deckSize: deck.length,
    poolSize: pool.length,
    legalCapacity,
    canBuildLegalDeck: legalCapacity >= targetSize,
    debugOverflowCopies: overflowCopies,
    uniqueCards: Object.keys(countCardCopies(deck)).length,
    commanderCopies: commanderCards.length,
    pivotCopies: pivotCards.length,
    roleCounts: deckRoleCounts(deck),
    copyViolations: violations
  };
}

function deckSanitySummary(catalog = null) {
  const sourceCatalog = catalog || buildCardCatalog();
  const factions = [...new Set(sourceCatalog.map(card => card.faction).filter(Boolean))].sort();
  const byFaction = {};
  for (const faction of factions) byFaction[faction] = deckSanityForFaction(faction, sourceCatalog);
  return {
    version: typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG.version : "unknown",
    mode: typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG.mode : "unknown",
    byFaction
  };
}

function playerDeckRuntimeCards(side) {
  if (!state) return [];
  const deckCards = state.deck && state.deck[side] ? state.deck[side] : [];
  const handCards = state.hand && state.hand[side] ? state.hand[side] : [];
  const discardCards = state.discard && state.discard[side] ? state.discard[side] : [];
  return [...deckCards, ...handCards, ...discardCards].filter(Boolean);
}

function deckRuntimeValidationForSide(side) {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  const targetSize = config.deckSize || 30;
  const faction = state && state.factions ? state.factions[side] : null;
  const catalog = state && state.cardCatalog ? state.cardCatalog : buildCardCatalog();
  const allCards = playerDeckRuntimeCards(side);
  const copyViolations = deckCopyViolations(allCards);
  const debugOverflowCopies = allCards.filter(card => card && card.debugOverflowCopy).length;
  const commanderCopies = allCards.filter(card => card && (card.deckRole === "commander" || card.cardType === "commander")).length;
  const pivotCopies = allCards.filter(card => card && (card.deckRole === "pivot" || card.cardType === "pivot")).length;
  const selectedCommanderId = side && typeof selectedCommanderBlueprintIdForSide === "function" ? selectedCommanderBlueprintIdForSide(side, catalog) : null;
  const legalCapacity = faction ? deckLegalCapacityForFaction(faction, catalog, { selectedCommanderId }) : 0;
  const zoneCounts = {
    deck: state && state.deck && state.deck[side] ? state.deck[side].length : 0,
    hand: state && state.hand && state.hand[side] ? state.hand[side].length : 0,
    discard: state && state.discard && state.discard[side] ? state.discard[side].length : 0
  };

  const issues = [];
  if (!faction) issues.push("fazione assente");
  if (allCards.length !== targetSize) issues.push(`totale carte runtime ${allCards.length}/${targetSize}`);
  if (legalCapacity < targetSize) issues.push(`capacità legale ${legalCapacity}/${targetSize}`);
  if (debugOverflowCopies > 0) issues.push(`overflow debug presente: ${debugOverflowCopies}`);
  if (commanderCopies !== 1) issues.push(`copie comandante ${commanderCopies}, atteso 1`);
  if (pivotCopies > 1) issues.push(`copie pivot ${pivotCopies}, massimo 1`);
  if (copyViolations.length) issues.push(`violazioni copie: ${copyViolations.map(v => `${v.name || v.id} ${v.count}/${v.limit}`).join(", ")}`);

  return {
    side,
    faction,
    targetSize,
    totalCards: allCards.length,
    zoneCounts,
    legalCapacity,
    debugOverflowCopies,
    commanderCopies,
    pivotCopies,
    uniqueCards: Object.keys(countCardCopies(allCards)).length,
    roleCounts: deckRoleCounts(allCards),
    copyViolations,
    ok: issues.length === 0,
    issues
  };
}

function deckRuntimeValidationSummary() {
  if (!state || !state.cardDebug || !state.cardDebug.initialized) {
    return {
      version: typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG.version : "unknown",
      mode: typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG.mode : "unknown",
      initialized: false,
      sides: {}
    };
  }
  return {
    version: typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG.version : "unknown",
    mode: typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG.mode : "unknown",
    initialized: true,
    sides: {
      1: deckRuntimeValidationForSide(1),
      2: deckRuntimeValidationForSide(2)
    }
  };
}


function createInitialHandFromDeck(deck, options = {}) {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  const handSize = options.handSize || config.initialHandSize || 5;
  const requireCommander = options.requireCommander ?? config.initialHandRequiresCommander ?? true;

  const drawDeck = [...deck];
  const hand = [];

  if (requireCommander) {
    const commanderIndex = drawDeck.findIndex(card => card.cardType === "commander" || card.deckRole === "commander");
    if (commanderIndex >= 0) hand.push(drawDeck.splice(commanderIndex, 1)[0]);
  }

  while (hand.length < handSize && drawDeck.length) {
    hand.push(drawDeck.shift());
  }

  const runtimeDeck = shouldShuffleRuntimeDeckAfterInitialHand() ? shuffleCardsRuntime(drawDeck) : drawDeck;

  return {
    deck: runtimeDeck.map((card, i) => ({ ...card, zone: "deck", instanceNo: i + 1 })),
    hand: hand.map((card, i) => ({ ...card, zone: "hand", instanceNo: i + 1 })),
    runtimeDeckShuffled: runtimeDeck !== drawDeck
  };
}

function initializeCardZonesForPlayer(side, catalog = null) {
  const faction = state.factions[side];
  const sourceCatalog = catalog || buildCardCatalog();
  const starterLoadout = selectStarterLoadoutForFaction(faction, sourceCatalog);
  const selectedCommanderId = typeof selectedCommanderBlueprintIdForSide === "function" ? selectedCommanderBlueprintIdForSide(side, sourceCatalog) : null;
  const rawDeck = buildDebugDeckForFaction(faction, sourceCatalog, null, { selectedCommanderId });
  const split = createInitialHandFromDeck(rawDeck);

  const deck = split.deck.map((card, i) => createCardInstance(card, side, "deck", i));
  const hand = split.hand.map((card, i) => createCardInstance(card, side, "hand", i));
  const starters = {};
  for (const [role, card] of Object.entries(starterLoadout)) {
    starters[role] = card ? createCardInstance(card, side, "starter", 0) : null;
  }

  return {
    faction,
    deck,
    hand,
    discard: [],
    starters
  };
}

function initializeCardZonesForGame() {
  if (!state) return null;

  const catalog = buildCardCatalog();
  state.cardCatalog = catalog;
  state.deck = { 1: [], 2: [] };
  state.hand = { 1: [], 2: [] };
  state.discard = { 1: [], 2: [] };
  state.starterCards = { 1: {}, 2: {} };

  for (const side of [1, 2]) {
    const zones = initializeCardZonesForPlayer(side, catalog);
    state.deck[side] = zones.deck;
    state.hand[side] = zones.hand;
    state.discard[side] = zones.discard;
    state.starterCards[side] = zones.starters;
  }

  state.cardDebug = {
    enabled: true,
    mode: typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG.mode : "draw_lifecycle_foundation",
    initialized: true,
    catalogSize: catalog.length,
    deckSize: { 1: state.deck[1].length, 2: state.deck[2].length },
    handSize: { 1: state.hand[1].length, 2: state.hand[2].length },
    selectedCommanders: state.selectedCommanders ? { ...state.selectedCommanders } : {},
    runtimeDeckShuffled: shouldShuffleRuntimeDeckAfterInitialHand(),
    runtimeDeckShuffleMode: shouldShuffleRuntimeDeckAfterInitialHand() ? "after_initial_hand" : "off",
    starterSlots: {
      1: Object.fromEntries(Object.entries(state.starterCards[1]).map(([k, v]) => [k, v ? v.name : null])),
      2: Object.fromEntries(Object.entries(state.starterCards[2]).map(([k, v]) => [k, v ? v.name : null]))
    },
    deckSanity: typeof deckSanitySummary === "function" ? deckSanitySummary(catalog) : null,
    deckRuntimeValidation: null
  };
  state.cardDebug.deckRuntimeValidation = typeof deckRuntimeValidationSummary === "function" ? deckRuntimeValidationSummary() : null;

  if (shouldShuffleRuntimeDeckAfterInitialHand() && typeof log === "function") {
    const eventType = typeof EventTypes !== "undefined" && EventTypes.LOG_MESSAGE ? EventTypes.LOG_MESSAGE : "LOG_MESSAGE";
    log(`Runtime deck shuffled: G1 ${state.deck[1].length} carte, G2 ${state.deck[2].length} carte. Mano iniziale controllata mantenuta.`, eventType, {
      source: "C2c-6a-fix2-runtime-deck-shuffle",
      g1Deck: state.deck[1].length,
      g2Deck: state.deck[2].length,
      g1Hand: state.hand[1].length,
      g2Hand: state.hand[2].length
    });
  }

  return state.cardDebug;
}

function maxHandSizeConfig() {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  return Number.isFinite(config.maxHandSize) ? config.maxHandSize : Infinity;
}

function handIsFullForDraw(side) {
  if (!state || !state.hand || !state.hand[side]) return false;
  return state.hand[side].length >= maxHandSizeConfig();
}

function aiTelemetryKeyCardLabel(card) {
  if (!card) return "";
  const role = card.deckRole || card.cardType || "";
  const kind = card.effectKind || "";
  if (["commander","pivot","elite"].includes(role)) return `${card.name || card.id} (${role})`;
  if (["set_defense_to_one","set_def_to_one_round","damage_structure","destroy_non_unique_unit","convert_isolated_enemy_infantry","bounce_unit_to_owner_hand_clean","stun_unit","stun_disable","inhibit_attack","phase_shield","green_fortress_structure_growth","structure_income_seed"].includes(kind)) return `${card.name || card.id} (${kind})`;
  return "";
}

function recordAiOverdraw(side, card) {
  if (!state || !state.aiTelemetry || !card) return;
  const t = state.aiTelemetry;
  t.cardsOverdrawn[side] = (t.cardsOverdrawn[side] || 0) + 1;
  const label = aiTelemetryKeyCardLabel(card);
  if (label) {
    if (!Array.isArray(t.keyCardsOverdrawn[side])) t.keyCardsOverdrawn[side] = [];
    if (t.keyCardsOverdrawn[side].length < 12) t.keyCardsOverdrawn[side].push(label);
  }
}

function overdrawToDiscard(side, card, source="pesca") {
  if (!state || !state.discard || !state.discard[side] || !card) return null;
  card.zone = "discard";
  card.overdrawDiscarded = true;
  card.overdrawSource = source;
  state.discard[side].push(card);
  recordAiOverdraw(side, card);
  if (typeof log === "function") {
    log(`Mano piena (${maxHandSizeConfig()}): ${card.name || card.id} viene pescata ma va direttamente negli scarti.`, EventTypes.LOG_MESSAGE, {
      player: side,
      faction: state.factions && state.factions[side],
      cardUid: card.cardUid,
      cardId: card.id,
      cardName: card.name,
      maxHandSize: maxHandSizeConfig(),
      source: "C2-FINAL-A-overdraw-discard"
    });
  }
  return card;
}

function drawCards(side, count = 1, options = {}) {
  if (!state || !state.deck || !state.hand || !state.discard) return [];
  const drawn = [];
  const source = options.source || "pesca";
  for (let i = 0; i < count; i += 1) {
    const card = state.deck[side].shift();
    if (!card) break;
    if (handIsFullForDraw(side)) {
      overdrawToDiscard(side, card, source);
    } else {
      card.zone = "hand";
      delete card.overdrawDiscarded;
      delete card.overdrawSource;
      state.hand[side].push(card);
    }
    drawn.push(card);
  }
  syncCardDebugState();
  return drawn;
}

function discardCard(side, cardUid) {
  if (!state || !state.hand || !state.discard) return null;
  const index = state.hand[side].findIndex(card => card.cardUid === cardUid);
  if (index < 0) return null;
  const [card] = state.hand[side].splice(index, 1);
  card.zone = "discard";
  state.discard[side].push(card);
  syncCardDebugState();
  return card;
}





// =====================================================
// C2c-7a – Hand card lock / theft helpers
// =====================================================
function handCardBlocked(card) {
  return Boolean(card && Number.isFinite(card.c2c7aBlockedTurns) && card.c2c7aBlockedTurns > 0);
}

function handCardBlockReason(card) {
  if (!handCardBlocked(card)) return "";
  return `${card.c2c7aBlockedSource || "Embargo"}: carta bloccata per ${card.c2c7aBlockedTurns} turno/i`;
}

function tickHandCardLocksAtEnd(side) {
  if (!state || !state.hand || !state.hand[side]) return;
  let released = 0;
  for (const card of state.hand[side]) {
    if (!handCardBlocked(card)) continue;
    card.c2c7aBlockedTurns = Math.max(0, (card.c2c7aBlockedTurns || 1) - 1);
    if (card.c2c7aBlockedTurns <= 0) {
      delete card.c2c7aBlockedTurns;
      delete card.c2c7aBlockedBy;
      delete card.c2c7aBlockedSource;
      released += 1;
    }
  }
  if (released > 0) {
    log(`${playerName(side)} libera ${released} carta${released > 1 ? "e" : ""} dal blocco mano.`, EventTypes.LOG_MESSAGE, {
      player: side,
      faction: state.factions && state.factions[side],
      released,
      source: "C2c-7a-hand-card-lock-tick"
    });
  }
  syncCardDebugState();
}

function moveHandCardBetweenPlayers(fromSide, toSide, cardUid, source="Furto carta") {
  if (!state || !state.hand || !state.hand[fromSide] || !state.hand[toSide]) return null;
  const idx = state.hand[fromSide].findIndex(card => card && card.cardUid === cardUid);
  if (idx < 0) return null;
  const [original] = state.hand[fromSide].splice(idx, 1);
  const moved = createCardInstance(original, toSide, "hand", state.hand[toSide].length);
  moved.stolenFrom = fromSide;
  moved.stolenSource = source;
  delete moved.c2c7aBlockedTurns;
  delete moved.c2c7aBlockedBy;
  delete moved.c2c7aBlockedSource;
  state.hand[toSide].push(moved);
  syncCardDebugState();
  log(`${playerName(toSide)} ruba ${moved.name} dalla mano di ${playerName(fromSide)} (${source}).`, EventTypes.LOG_MESSAGE, {
    fromSide,
    toSide,
    cardUid: moved.cardUid,
    cardName: moved.name,
    source: "C2c-7a-move-hand-card"
  });
  return moved;
}

function handCardByUid(side, cardUid) {
  if (!state || !state.hand || !state.hand[side]) return null;
  return state.hand[side].find(card => card.cardUid === cardUid) || null;
}

function isPlayableUnitHandCard(card) {
  if (!card) return false;
  if (card.sourceType !== "unit") return false;
  if (!card.blueprintId) return false;
  return ["commander", "pivot", "elite", "heavy", "unit_structure", "unit_infantry", "unit_vehicle", "unit"].includes(card.cardType)
    || ["commander", "pivot", "elite", "heavy"].includes(card.deckRole);
}

function isPlayableTacticHandCard(card) {
  if (!card) return false;
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  return Boolean(config.handTacticCardsPlayable && card.sourceType === "tactic");
}

function discardPlayedHandCard(side, cardUid) {
  const card = discardCard(side, cardUid);
  if (card) {
    log(`${playerName(side)} consuma la carta ${card.name}: va negli scarti.`, EventTypes.LOG_MESSAGE, {
      player: side,
      faction: state.factions[side],
      cardUid: card.cardUid,
      cardId: card.id,
      cardName: card.name,
      cardType: card.cardType,
      source: "C1e-hand-card-play"
    });
  }
  return card;
}


function cardZoneCounts(side) {
  if (!state) return { deck: 0, hand: 0, discard: 0 };
  return {
    deck: state.deck && state.deck[side] ? state.deck[side].length : 0,
    hand: state.hand && state.hand[side] ? state.hand[side].length : 0,
    discard: state.discard && state.discard[side] ? state.discard[side].length : 0
  };
}

function syncCardDebugState() {
  if (!state || !state.cardDebug) return null;

  state.cardDebug.mode = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG.mode : state.cardDebug.mode;
  state.cardDebug.catalogSize = state.cardCatalog ? state.cardCatalog.length : 0;
  state.cardDebug.deckSize = {
    1: state.deck && state.deck[1] ? state.deck[1].length : 0,
    2: state.deck && state.deck[2] ? state.deck[2].length : 0
  };
  state.cardDebug.handSize = {
    1: state.hand && state.hand[1] ? state.hand[1].length : 0,
    2: state.hand && state.hand[2] ? state.hand[2].length : 0
  };
  state.cardDebug.discardSize = {
    1: state.discard && state.discard[1] ? state.discard[1].length : 0,
    2: state.discard && state.discard[2] ? state.discard[2].length : 0
  };
  state.cardDebug.deckSanity = typeof deckSanitySummary === "function" ? deckSanitySummary(state.cardCatalog || null) : null;
  state.cardDebug.deckRuntimeValidation = typeof deckRuntimeValidationSummary === "function" ? deckRuntimeValidationSummary() : null;
  state.cardDebug.lastSync = new Date().toISOString();
  return state.cardDebug;
}

function drawCardForTurn(side, options = {}) {
  if (!state || !state.deck || !state.hand) return [];

  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  const first = Boolean(options.first);
  const drawOnFirstTurn = Boolean(config.drawOnFirstTurn);
  const drawCount = Number.isFinite(config.drawPerTurn) ? config.drawPerTurn : 1;

  if (first && !drawOnFirstTurn) {
    syncCardDebugState();
    return [];
  }

  if (drawCount <= 0) {
    syncCardDebugState();
    return [];
  }

  if (!state.deck[side] || state.deck[side].length <= 0) {
    syncCardDebugState();
    log(`${playerName(side)} non pesca: deck vuoto.`, EventTypes.LOG_MESSAGE, {
      player: side,
      faction: state.factions[side],
      reason: "empty_deck",
      source: "C1d-draw-lifecycle"
    });
    return [];
  }

  const drawn = drawCards(side, drawCount);
  if (drawn.length) {
    const names = drawn.map(card => card.name || card.id).join(", ");
    log(`${playerName(side)} pesca ${drawn.length} carta${drawn.length > 1 ? "e" : ""}: ${names}.`, EventTypes.LOG_MESSAGE, {
      player: side,
      faction: state.factions[side],
      count: drawn.length,
      cards: drawn.map(card => ({
        cardUid: card.cardUid,
        id: card.id,
        name: card.name,
        cardType: card.cardType,
        deckRole: card.deckRole,
        sourceType: card.sourceType
      })),
      source: "C1d-draw-lifecycle"
    });
  }

  syncCardDebugState();
  return drawn;
}


function deckRecoveryConfig() {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  return {
    cost: Number.isFinite(config.deckRecoveryCost) ? config.deckRecoveryCost : 5,
    draw: Number.isFinite(config.deckRecoveryDraw) ? config.deckRecoveryDraw : 3
  };
}

function canRecoverDeck(side) {
  const cfg = deckRecoveryConfig();
  if (!state || !state.deck || !state.hand || !state.discard || !state.energy) return { ok:false, reason:"Partita non inizializzata", cost:cfg.cost, draw:cfg.draw };
  if (state.winner) return { ok:false, reason:"Partita conclusa", cost:cfg.cost, draw:cfg.draw };
  if ((state.deck[side] || []).length > 0) return { ok:false, reason:"Il deck non è vuoto", cost:cfg.cost, draw:cfg.draw };
  if ((state.hand[side] || []).length > 0) return { ok:false, reason:"La mano non è vuota", cost:cfg.cost, draw:cfg.draw };
  if ((state.discard[side] || []).length <= 0) return { ok:false, reason:"Gli scarti sono vuoti", cost:cfg.cost, draw:cfg.draw };
  if ((state.energy[side] || 0) < cfg.cost) return { ok:false, reason:`Servono ${cfg.cost} ENE`, cost:cfg.cost, draw:cfg.draw };
  return { ok:true, reason:"Pronto", cost:cfg.cost, draw:cfg.draw };
}

function recoverDeckForPlayer(side, options = {}) {
  const check = canRecoverDeck(side);
  if (!check.ok) {
    if (!options.quiet && typeof log === "function") {
      log(`Recupero deck non disponibile per ${playerName(side)}: ${check.reason}.`, EventTypes.LOG_MESSAGE, {
        player: side,
        faction: state && state.factions && state.factions[side],
        reason: check.reason,
        source: "C2-FINAL-A-deck-recovery-blocked"
      });
    }
    return { ok:false, reason:check.reason, drawn:[] };
  }

  const beforeEnergy = state.energy[side] || 0;
  state.energy[side] = beforeEnergy - check.cost;
  if (state.aiTelemetry && state.aiTelemetry.deckRecoveries) state.aiTelemetry.deckRecoveries[side] = (state.aiTelemetry.deckRecoveries[side] || 0) + 1;
  const pile = state.discard[side].splice(0);
  const shuffled = shuffleCardsRuntime(pile);
  state.deck[side] = shuffled.map((card, i) => {
    card.zone = "deck";
    card.instanceNo = i + 1;
    delete card.overdrawDiscarded;
    delete card.overdrawSource;
    return card;
  });

  log(`${playerName(side)} paga ${check.cost} ENE: scarti rimescolati nel deck (${state.deck[side].length} carte), poi pesca ${check.draw} carte.`, EventTypes.LOG_MESSAGE, {
    player: side,
    faction: state.factions && state.factions[side],
    energyBefore: beforeEnergy,
    energyAfter: state.energy[side],
    deckSize: state.deck[side].length,
    draw: check.draw,
    source: "C2-FINAL-A-deck-recovery"
  });

  const drawn = drawCards(side, check.draw, { source:"recupero_deck" });
  if (drawn.length) {
    log(`${playerName(side)} pesca da recupero deck: ${drawn.map(c => c.name || c.id).join(", ")}.`, EventTypes.LOG_MESSAGE, {
      player: side,
      faction: state.factions && state.factions[side],
      count: drawn.length,
      cards: drawn.map(c => ({ id:c.id, name:c.name, zone:c.zone, overdrawDiscarded:Boolean(c.overdrawDiscarded) })),
      source: "C2-FINAL-A-deck-recovery-draw"
    });
  }
  syncCardDebugState();
  if (typeof renderAll === "function" && !options.skipRender) renderAll();
  if (typeof maybeRunBot === "function" && !options.skipBot) maybeRunBot();
  return { ok:true, drawn };
}

function recoverCurrentPlayerDeck() {
  if (!state) return null;
  const side = state.currentPlayer || 1;
  if (state.modes && state.modes[side] === "bot") return null;
  return recoverDeckForPlayer(side);
}

function cardZoneDebugSummary() {
  if (!state || !state.cardDebug) return null;
  syncCardDebugState();
  return {
    config: typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : null,
    cardDebug: state.cardDebug,
    hand: {
      1: (state.hand[1] || []).map(card => card.name),
      2: (state.hand[2] || []).map(card => card.name)
    },
    discard: {
      1: (state.discard[1] || []).map(card => card.name),
      2: (state.discard[2] || []).map(card => card.name)
    },
    deckSize: {
      1: (state.deck[1] || []).length,
      2: (state.deck[2] || []).length
    },
    discardSize: {
      1: (state.discard[1] || []).length,
      2: (state.discard[2] || []).length
    },
    deckSanity: state.cardDebug.deckSanity || null
  };
}


// =====================================================
// C1f – card manipulation helpers
// =====================================================
function addBlueprintCardToHand(side, blueprintId, faction=null, source="C1f") {
  if (!state || !state.cardCatalog || !state.hand) return null;
  const card = state.cardCatalog.find(c => c.sourceType === "unit" && c.blueprintId === blueprintId && (!faction || c.faction === faction));
  if (!card) { log(`${source}: carta blueprint ${blueprintId} non trovata.`); return null; }
  const inst = createCardInstance(card, side, "hand", state.hand[side].length);
  state.hand[side].push(inst);
  syncCardDebugState();
  log(`${playerName(side)} crea in mano la carta ${inst.name} (${source}).`);
  return inst;
}

function copyRandomEnemyHandCard(side) {
  const enemy = enemyOf(side);
  const pool = state.hand && state.hand[enemy] ? state.hand[enemy] : [];
  if (!pool.length) { log(`${playerName(enemy)} non ha carte in mano da copiare.`); return null; }
  const original = pool[Math.floor(Math.random() * pool.length)];
  const copy = createCardInstance(original, side, "hand", state.hand[side].length);
  copy.copiedFrom = enemy;
  state.hand[side].push(copy);
  syncCardDebugState();
  log(`${playerName(side)} copia casualmente ${copy.name} dalla mano di ${playerName(enemy)}.`);
  return copy;
}
