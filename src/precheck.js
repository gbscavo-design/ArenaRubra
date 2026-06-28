"use strict";

// Arena Rubra – Fase B3c-precheck
// Controlli diagnostici su dati, handler e riferimenti.
// Non introduce gameplay. Non modifica state, unità, economia o AI.
// Espone funzioni console: runPrecheck(), copyPrecheckJson(), precheckSummary().

function collectDuplicateValues(items, selector) {
  const seen = new Map();
  const duplicates = [];
  for (const item of items || []) {
    const key = selector(item);
    if (key == null) continue;
    if (seen.has(key)) duplicates.push({ key, first: seen.get(key), duplicate: item });
    else seen.set(key, item);
  }
  return duplicates;
}

function precheckAbility(ab, owner, problems, warnings) {
  if (!ab) return;
  const label = owner && owner.id ? owner.id : (owner && owner.name ? owner.name : "unknown-owner");

  if (ab.passive) return;

  if (!ab.kind) {
    problems.push(`Ability senza kind su ${label}: ${ab.name || "(senza nome)"}`);
    return;
  }

  if (typeof ABILITY_HANDLERS !== "undefined" && !ABILITY_HANDLERS[ab.kind]) {
    problems.push(`Ability kind senza handler: ${ab.kind} su ${label} (${ab.name || "senza nome"})`);
  }

  if (!ab.name) warnings.push(`Ability senza nome su ${label}`);
  if (ab.cost != null && (!Number.isFinite(ab.cost) || ab.cost < 0)) {
    problems.push(`Costo ability non valido su ${label}: ${ab.name || ab.kind}`);
  }
  if (ab.cooldown != null && (!Number.isFinite(ab.cooldown) || ab.cooldown < 0)) {
    problems.push(`Cooldown ability non valido su ${label}: ${ab.name || ab.kind}`);
  }
  if (ab.range != null && (!Number.isFinite(ab.range) || ab.range < 0)) {
    problems.push(`Range ability non valido su ${label}: ${ab.name || ab.kind}`);
  }

  if (ab.statusKind && typeof STATUS_DEFINITIONS !== "undefined" && !STATUS_DEFINITIONS[ab.statusKind]) {
    warnings.push(`Ability applica status non presente in STATUS_DEFINITIONS: ${ab.statusKind} su ${label}`);
  }

  // Alcune abilità sono volutamente tecniche/economiche: qui segnaliamo solo casi sospetti, non errori.
  if (ab.affects === "enemy" && !["economicEffect", "incomeDelta", "status", "damage", "directDamage", "psLock"].includes(ab.kind)) {
    warnings.push(`Ability con affects=enemy e kind insolito (${ab.kind}) su ${label}: ${ab.name || "senza nome"}`);
  }
}

function runPrecheck(options = {}) {
  const quiet = Boolean(options.quiet);
  const source = options.source || "manual";
  const problems = [];
  const warnings = [];
  const info = [];

  try {
    if (typeof FACTIONS === "undefined") problems.push("FACTIONS non definito.");
    if (typeof BLUEPRINTS === "undefined") problems.push("BLUEPRINTS non definito.");
    if (typeof TACTICS === "undefined") problems.push("TACTICS non definito.");
    if (typeof STATUS_DEFINITIONS === "undefined") problems.push("STATUS_DEFINITIONS non definito.");
    if (typeof ABILITY_HANDLERS === "undefined") problems.push("ABILITY_HANDLERS non definito.");
    if (typeof TACTIC_HANDLERS === "undefined") problems.push("TACTIC_HANDLERS non definito.");

    const factions = typeof FACTIONS !== "undefined" ? FACTIONS : {};
    const blueprints = typeof BLUEPRINTS !== "undefined" ? BLUEPRINTS : [];
    const tactics = typeof TACTICS !== "undefined" ? TACTICS : [];
    const deckTactics = typeof DECK_TACTICS !== "undefined" ? DECK_TACTICS : [];

    const factionNames = Object.keys(factions);
    info.push(`Fazioni: ${factionNames.length}`);
    info.push(`Blueprint unità: ${blueprints.length}`);
    info.push(`Tattiche starter/base: ${tactics.length}`);
    info.push(`Tattiche deck C2-FINAL-C2: ${deckTactics.length}`);

    // C1a – controlli passivi card/deck/hand foundation.
    if (typeof CARD_CATALOG_CONFIG === "undefined") {
      warnings.push("CARD_CATALOG_CONFIG non definito: fondazione carte C1a non caricata.");
    }
    if (typeof buildCardCatalog !== "function") {
      warnings.push("buildCardCatalog non definita: catalogo carte C1a non disponibile.");
    } else {
      const cardCatalog = buildCardCatalog();
      info.push(`Catalogo carte C2a: ${cardCatalog.length}`);

      for (const dup of collectDuplicateValues(cardCatalog, card => card && card.id)) {
        problems.push(`Card ID duplicato: ${dup.key}`);
      }

      const deckTacticCards = cardCatalog.filter(card => card.sourceType === "tactic");
      if (deckTacticCards.length !== 59) problems.push(`Tattiche deck C2-FINAL-C2 nel catalogo: ${deckTacticCards.length}/59.`);
      const expectedTacticCounts = { Nexus:12, Exordium:12, Liberti:14, Agathoi:9, Fabeot:12 };
      for (const [factionName, expected] of Object.entries(expectedTacticCounts)) {
        const count = deckTacticCards.filter(card => card.faction === factionName).length;
        if (count !== expected) problems.push(`Tattiche deck C2-FINAL-C2 ${factionName}: ${count}/${expected}.`);
      }

      const playableC2c1 = deckTacticCards.filter(card => typeof isC2c1SingleDamageTacticCard === "function" && isC2c1SingleDamageTacticCard(card));
      info.push(`Tattiche giocabili C2-FINAL-C2: ${playableC2c1.length}/59.`);
      

      for (const factionName of factionNames) {
        const factionCards = cardCatalog.filter(card => card.faction === factionName);
        const deckPool = typeof deckPoolCardsForFaction === "function" ? deckPoolCardsForFaction(factionName, cardCatalog) : [];
        const starters = typeof starterCardsForFaction === "function" ? starterCardsForFaction(factionName, cardCatalog) : [];
        const commanders = typeof commanderCardsForFaction === "function" ? commanderCardsForFaction(factionName, cardCatalog) : [];
        if (!factionCards.length) warnings.push(`Nessuna carta generata per fazione: ${factionName}`);
        if (!deckPool.length) warnings.push(`Deck pool C2a vuoto per fazione: ${factionName}`);
        if (!starters.length) warnings.push(`Starter cards C2a assenti per fazione: ${factionName}`);
        if (commanders.length !== 2) problems.push(`Commander Choice ${factionName}: comandanti disponibili ${commanders.length}/2.`);

        if (typeof deckSanityForFaction === "function") {
          const sanity = deckSanityForFaction(factionName, cardCatalog);
          info.push(`Deck C2-FINAL-C2 ${factionName}: ${sanity.deckSize}/${sanity.targetSize}, pool ${sanity.poolSize}, capacità legale ${sanity.legalCapacity}, overflow debug ${sanity.debugOverflowCopies}.`);
          if (sanity.deckSize !== sanity.targetSize) problems.push(`Deck C2-FINAL-C2 ${factionName}: deck ${sanity.deckSize}/${sanity.targetSize}.`);
          if (sanity.legalCapacity < sanity.targetSize) problems.push(`Deck C2-FINAL-C2 ${factionName}: capacità legale insufficiente ${sanity.legalCapacity}/${sanity.targetSize}.`);
          if (sanity.debugOverflowCopies > 0) problems.push(`Deck C2-FINAL-C2 ${factionName}: overflow debug presente (${sanity.debugOverflowCopies}).`);
          if (sanity.commanderCopies !== 1) problems.push(`Deck C2-FINAL-C2 ${factionName}: copie comandante ${sanity.commanderCopies}, atteso 1.`);
          if (sanity.pivotCopies > 1) problems.push(`Deck C2-FINAL-C2 ${factionName}: copie pivot ${sanity.pivotCopies}, massimo 1.`);
          if (sanity.copyViolations && sanity.copyViolations.length) {
            problems.push(`Deck C2-FINAL-C2 ${factionName}: violazioni copie ${sanity.copyViolations.map(v => `${v.name || v.id} ${v.count}/${v.limit}`).join(", ")}.`);
          }
        }
      }

      if (typeof state !== "undefined" && state && state.cardDebug && state.cardDebug.initialized) {
        info.push(`Deck C2-FINAL-C2 G1: ${state.deck && state.deck[1] ? state.deck[1].length : 0}`);
        info.push(`Deck C2-FINAL-C2 G2: ${state.deck && state.deck[2] ? state.deck[2].length : 0}`);
        info.push(`Mano C2-FINAL-C2 G1: ${state.hand && state.hand[1] ? state.hand[1].length : 0}`);
        info.push(`Mano C2-FINAL-C2 G2: ${state.hand && state.hand[2] ? state.hand[2].length : 0}`);
        if (state.cardDebug && Object.prototype.hasOwnProperty.call(state.cardDebug, "runtimeDeckShuffled")) {
          info.push(`Runtime deck shuffle C2c-6a-fix2: ${state.cardDebug.runtimeDeckShuffleMode || (state.cardDebug.runtimeDeckShuffled ? "after_initial_hand" : "off")}.`);
        }
        if (typeof deckRuntimeValidationSummary === "function") {
          const runtime = deckRuntimeValidationSummary();
          for (const side of [1, 2]) {
            const r = runtime.sides && runtime.sides[side];
            if (!r) continue;
            info.push(`Runtime deck C2-FINAL-C2 G${side}: totale ${r.totalCards}/${r.targetSize}, deck ${r.zoneCounts.deck}, mano ${r.zoneCounts.hand}, scarti ${r.zoneCounts.discard}, overflow ${r.debugOverflowCopies}, ok ${r.ok}.`);
            if (!r.ok) problems.push(`Runtime deck C2-FINAL-C2 G${side}: ${r.issues.join("; ")}.`);
          }
        }
      }
    }


    // Fazioni minime.
    for (const factionName of factionNames) {
      const roster = blueprints.filter(bp => bp.faction === factionName);
      if (!roster.length) problems.push(`Fazione senza roster: ${factionName}`);
      const commanderCount = roster.filter(bp => bp.type === "Comandante").length;
      if (!commanderCount) problems.push(`Fazione senza comandante: ${factionName}`);
      if (commanderCount !== 2) problems.push(`Commander Choice ${factionName}: blueprint comandanti ${commanderCount}/2.`);
      if (!roster.some(bp => bp.type === "Struttura")) warnings.push(`Fazione senza struttura: ${factionName}`);
      if (!roster.some(bp => bp.weight === "Pivot")) warnings.push(`Fazione senza pivot: ${factionName}`);
    }

    // Duplicati ID.
    for (const dup of collectDuplicateValues(blueprints, bp => bp && bp.id)) {
      problems.push(`Blueprint ID duplicato: ${dup.key}`);
    }
    for (const dup of collectDuplicateValues(tactics, t => t && t.id)) {
      problems.push(`Tactic ID duplicato: ${dup.key}`);
    }

    for (const dup of collectDuplicateValues(deckTactics, t => t && t.id)) {
      problems.push(`Deck tactic C2-FINAL-C2 ID duplicato: ${dup.key}`);
    }

    // Blueprint checks.
    const knownUnitTypes = typeof UnitTypes !== "undefined" ? new Set(Object.values(UnitTypes)) : null;
    const knownWeights = typeof UnitWeights !== "undefined" ? new Set([...Object.values(UnitWeights), "Leggero"]) : null;

    for (const bp of blueprints) {
      if (!bp.id) problems.push(`Blueprint senza id: ${bp.name || "(senza nome)"}`);
      if (!bp.name) problems.push(`Blueprint senza name: ${bp.id || "(senza id)"}`);
      if (!bp.faction || !factions[bp.faction]) problems.push(`Blueprint con fazione sconosciuta: ${bp.id || bp.name} -> ${bp.faction}`);
      if (!bp.type) problems.push(`Blueprint senza type: ${bp.id || bp.name}`);
      else if (knownUnitTypes && !knownUnitTypes.has(bp.type)) warnings.push(`Blueprint con type non enumerato: ${bp.id} -> ${bp.type}`);
      if (!bp.weight) warnings.push(`Blueprint senza weight: ${bp.id || bp.name}`);
      else if (knownWeights && !knownWeights.has(bp.weight)) warnings.push(`Blueprint con weight non enumerato: ${bp.id} -> ${bp.weight}`);

      for (const stat of ["cost", "hp", "att", "def"]) {
        if (!Number.isFinite(bp[stat]) || bp[stat] < 0) problems.push(`Blueprint ${bp.id || bp.name}: ${stat} non valido (${bp[stat]})`);
      }

      if (bp.type === "Struttura" && bp.att > 0) warnings.push(`Struttura con ATT > 0: ${bp.id} (${bp.name})`);
      if (bp.type === "QG") warnings.push(`Blueprint dati contiene QG: ${bp.id || bp.name}`);

      precheckAbility(bp.ability, bp, problems, warnings);

      if (Array.isArray(bp.passives)) {
        for (const passive of bp.passives) precheckAbility(passive, bp, problems, warnings);
      }
    }

    // C2a deck tactic checks.
    for (const tactic of deckTactics) {
      if (!tactic.id) problems.push(`Deck tactic C2-FINAL-C2 senza id: ${tactic.name || "(senza nome)"}`);
      if (!tactic.name) problems.push(`Deck tactic C2-FINAL-C2 senza name: ${tactic.id || "(senza id)"}`);
      if (!tactic.faction || !factions[tactic.faction]) problems.push(`Deck tactic C2-FINAL-C2 con fazione sconosciuta: ${tactic.id || tactic.name} -> ${tactic.faction}`);
      if (!Number.isFinite(tactic.cost) || tactic.cost < 0) problems.push(`Deck tactic C2-FINAL-C2 ${tactic.id || tactic.name}: costo non valido (${tactic.cost})`);
      if (!tactic.quality) warnings.push(`Deck tactic C2-FINAL-C2 ${tactic.id}: qualità mancante`);
      if (!tactic.targetDomain) warnings.push(`Deck tactic C2-FINAL-C2 ${tactic.id}: targetDomain mancante`);
      if (!tactic.effectKind) warnings.push(`Deck tactic C2-FINAL-C2 ${tactic.id}: effectKind mancante`);
      if ((tactic.targetDomain === "board_unit" || tactic.targetDomain === "board_cell") && tactic.rangeMode !== "none" && !Number.isFinite(tactic.range)) {
        problems.push(`Deck tactic C2-FINAL-C2 ${tactic.id}: range non valido per bersaglio mappa.`);
      }
    }

    // Tactic checks.
    for (const tactic of tactics) {
      if (!tactic.id) problems.push(`Tattica senza id: ${tactic.name || "(senza nome)"}`);
      if (!tactic.name) problems.push(`Tattica senza name: ${tactic.id || "(senza id)"}`);
      if (!tactic.faction || !factions[tactic.faction]) problems.push(`Tattica con fazione sconosciuta: ${tactic.id || tactic.name} -> ${tactic.faction}`);
      if (!tactic.kind) problems.push(`Tattica senza kind: ${tactic.id || tactic.name}`);
      else if (typeof TACTIC_HANDLERS !== "undefined" && !TACTIC_HANDLERS[tactic.kind]) problems.push(`Tactic kind senza handler: ${tactic.kind} su ${tactic.id || tactic.name}`);

      if (!Number.isFinite(tactic.cost) || tactic.cost < 0) problems.push(`Tattica ${tactic.id || tactic.name}: costo non valido (${tactic.cost})`);
      if (tactic.cooldown != null && (!Number.isFinite(tactic.cooldown) || tactic.cooldown < 0)) problems.push(`Tattica ${tactic.id || tactic.name}: cooldown non valido (${tactic.cooldown})`);
      if (tactic.range != null && (!Number.isFinite(tactic.range) || tactic.range < 0)) warnings.push(`Tattica ${tactic.id || tactic.name}: range sospetto (${tactic.range})`);
      if (tactic.statusKind && typeof STATUS_DEFINITIONS !== "undefined" && !STATUS_DEFINITIONS[tactic.statusKind]) {
        warnings.push(`Tattica applica status non definito: ${tactic.statusKind} su ${tactic.id || tactic.name}`);
      }
    }

    // Handler orfani: non errore, ma utile per pulizia.
    if (typeof ABILITY_HANDLERS !== "undefined") {
      const usedKinds = new Set(blueprints.map(bp => bp.ability && bp.ability.kind).filter(Boolean));
      const orphanHandlers = Object.keys(ABILITY_HANDLERS).filter(k => !usedKinds.has(k));
      if (orphanHandlers.length) info.push(`Ability handler non usati direttamente da blueprint: ${orphanHandlers.join(", ")}`);
    }

    if (typeof TACTIC_HANDLERS !== "undefined") {
      const usedKinds = new Set(tactics.map(t => t.kind).filter(Boolean));
      const orphanHandlers = Object.keys(TACTIC_HANDLERS).filter(k => !usedKinds.has(k));
      if (orphanHandlers.length) info.push(`Tactic handler non usati direttamente da tattiche: ${orphanHandlers.join(", ")}`);
    }

  } catch (err) {
    problems.push(`Precheck exception: ${err && err.message ? err.message : err}`);
  }

  const report = {
    ok: problems.length === 0,
    source,
    at: new Date().toISOString(),
    problems,
    warnings,
    info
  };

  window.__arenaRubraLastPrecheck = report;

  if (!quiet || problems.length || warnings.length) {
    const msg = `Precheck Arena Rubra: ${report.ok ? "OK" : "PROBLEMI"} · problemi ${problems.length}, warning ${warnings.length}.`;
    if (typeof console !== "undefined") {
      if (problems.length) console.error(msg, report);
      else if (warnings.length) console.warn(msg, report);
      else console.info(msg, report);
    }
    if (typeof log === "function" && (problems.length || warnings.length)) {
      log(`⚠️ ${msg} Controlla console o runPrecheck().`);
    }
  }

  return report;
}

function precheckSummary() {
  const r = window.__arenaRubraLastPrecheck || runPrecheck({ quiet: true, source: "summary" });
  return {
    ok: r.ok,
    problems: r.problems.length,
    warnings: r.warnings.length,
    info: r.info
  };
}

function exportPrecheckJson() {
  const report = window.__arenaRubraLastPrecheck || runPrecheck({ quiet: true, source: "export" });
  return JSON.stringify(report, null, 2);
}

function copyPrecheckJson() {
  const text = exportPrecheckJson();
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
