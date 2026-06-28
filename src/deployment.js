"use strict";

// Arena Rubra – Fase B6c
// Deployment / Build extraction prudente.
// Questo file contiene modalità acquisto/build/spawn,
// celle valide di sbarco/costruzione, esecuzione spawn e costruzione,
// bonus Agathoi allo sbarco.
// Non contiene ancora logica decisionale AI pesante.

// Dipendenze globali accettate in questa fase:
// - state.js: state, selectedId, mode, pending...
// - rules.js: combatUnits, getHq, getUnitAt, isInsideMap, structureBlueprintFor, playerName
// - economy.js: canAffordBlueprint, purchaseLimitReached, effectiveBlueprintCost, consumeDeploymentDiscount
// - statuses.js: canAct
// - main.js/map/movement future: isOnPS, buildCellStrategicScore, chooseBuildCell, chooseSpawnCell
// - render/events: log, EventTypes, renderAll



    // =====================================================
    // C1c – Starter cards spawning foundation
    // =====================================================

    function starterCardsForPlayer(side) {
      if (!state || !state.starterCards || !state.starterCards[side]) return [];
      return Object.values(state.starterCards[side]).filter(Boolean);
    }

    function starterCardByUid(side, cardUid) {
      return starterCardsForPlayer(side).find(card => card.cardUid === cardUid) || null;
    }

    function blueprintForStarterCard(card, side) {
      if (!card || !card.blueprintId || !state || !state.factions) return null;
      return blueprintById(card.blueprintId, state.factions[side]);
    }

    function starterCardActionState(side, card) {
      if (!state || !card) return { canUse: false, reason: "Starter assente", actionText: "Non disponibile" };

      const bp = blueprintForStarterCard(card, side);
      const isCurrent = state.currentPlayer === side;
      const isHuman = state.modes && state.modes[side] === "human";
      const actionText = bp && bp.type === "Struttura" ? "Costruisci starter" : "Piazza starter";

      if (!bp) return { canUse: false, reason: "Blueprint non trovato", actionText };
      if (state.winner) return { canUse: false, reason: "Partita conclusa", actionText };
      if (!isCurrent) return { canUse: false, reason: "Non è il turno", actionText };
      if (!isHuman) return { canUse: false, reason: "Controllo bot", actionText };
      if (botRunning) return { canUse: false, reason: "Bot in esecuzione", actionText };
      if (purchaseLimitReached(side, bp)) return { canUse: false, reason: limitReason(side, bp), actionText };
      if (state.energy[side] < effectiveHandUnitCardCost(side, card, bp)) return { canUse: false, reason: "ENE insufficiente", actionText };

      if (bp.type === "Struttura") {
        const builder = getSelectedUnit();
        if (!builder || builder.side !== side || !canBuildStructures(builder) || builder.acted) {
          return { canUse: false, reason: "Seleziona costruttore attivo", actionText };
        }
        if (!buildableCells(builder).length) {
          return { canUse: false, reason: "Nessuna cella libera adiacente", actionText };
        }
      } else if (!spawnCellsFor(side, bp).length) {
        return { canUse: false, reason: "Nessuna cella di sbarco", actionText };
      }

      return { canUse: true, reason: "Pronto", actionText };
    }

    function beginStarterCardPurchase(cardUid) {
      pendingHandCardUid = null;
      if (!state || state.winner || botRunning) return false;
      const player = state.currentPlayer;
      const card = starterCardByUid(player, cardUid);
      if (!card) {
        log("Carta starter non trovata per il giocatore corrente.");
        renderAll();
        return false;
      }

      const check = starterCardActionState(player, card);
      const bp = blueprintForStarterCard(card, player);
      if (!check.canUse || !bp) {
        log(`Starter ${card.name || card.id}: ${check.reason}.`);
        renderAll();
        return false;
      }

      log(`Starter ${card.name}: seleziona il piazzamento.`, EventTypes.GAME_STARTED, {
        player,
        faction: state.factions[player],
        cardUid: card.cardUid,
        cardName: card.name,
        blueprintId: card.blueprintId,
        starterRole: card.starterRole,
        source: "C1c-starter-card"
      });
      beginPurchase(bp);
      if ((mode === "spawn" || mode === "build") && typeof closeHandPanelAfterAcceptedCardPlay === "function") closeHandPanelAfterAcceptedCardPlay();
      else if ((mode === "spawn" || mode === "build") && typeof apkM4CloseHandAfterCardPlay === "function") apkM4CloseHandAfterCardPlay();
      renderAll();
      return true;
    }



    // =====================================================
    // C1e – Hand unit cards playable foundation
    // =====================================================

    function blueprintForHandCard(card, side) {
      if (!card || !card.blueprintId || !state || !state.factions) return null;
      // C2c-7a: carte copiate/rubate o generate da Taglia/Matrice possono
      // appartenere a una fazione diversa da quella del controllore. Prima
      // tentiamo il roster della fazione del giocatore, poi la fazione originale
      // della carta, infine il blueprint globale.
      return blueprintById(card.blueprintId, state.factions[side])
        || blueprintById(card.blueprintId, card.faction)
        || BLUEPRINTS.find(bp => bp && bp.id === card.blueprintId)
        || null;
    }


    function pendingBlueprintForHandOrMarket(player, pendingBlueprintId) {
      if (!state || !state.factions || !pendingBlueprintId) return null;
      // C2c-8c-fix: se stiamo piazzando/costruendo una carta dalla mano,
      // il blueprint va risolto dalla carta stessa. Questo è essenziale per
      // carte unità copiate/rubate da altre fazioni tramite Esproprio di Mano,
      // Contratto Capestro, Taglia o altri effetti hand/deck.
      if (pendingHandCardUid && typeof handCardByUid === "function") {
        const card = handCardByUid(player, pendingHandCardUid);
        if (card && card.blueprintId === pendingBlueprintId && typeof blueprintForHandCard === "function") {
          return blueprintForHandCard(card, player);
        }
      }
      return blueprintById(pendingBlueprintId, state.factions[player])
        || BLUEPRINTS.find(bp => bp && bp.id === pendingBlueprintId)
        || null;
    }

    function effectiveHandUnitCardCost(side, card, bp, coord=null) {
      if (!bp) return Infinity;
      if (!card || !card.c2c6aCostAdjusted || !Number.isFinite(card.cost)) {
        const base = effectiveBlueprintCost(side, bp, coord);
        const handModifiers = typeof playerHandUnitCostModifiers === "function" ? playerHandUnitCostModifiers(side, bp) : [];
        if (!handModifiers.length) return base;
        const delta = handModifiers.reduce((sum, mod) => sum + (mod.value || 0), 0);
        const minCost = handModifiers.reduce((min, mod) => Math.max(min, mod.minCost || 0), 0);
        return Math.max(minCost, base + delta);
      }

      // C2c-6c: le carte pescate con costo modificato mantengono il proprio
      // costo di istanza, ma possono ancora ricevere modificatori economici
      // di turno/posizione già stabilizzati: Bunker Nexus, Avamposto Fabeot,
      // riduzioni da adiacenza e futuri effetti cost_delta/deploy_discount.
      const baseCost = Number(card.cost);
      const modifiers = typeof playerCostModifiers === "function" ? playerCostModifiers(side, bp) : [];
      const handModifiers = typeof playerHandUnitCostModifiers === "function" ? playerHandUnitCostModifiers(side, bp) : [];
      const allModifiers = [...modifiers, ...handModifiers];
      const placement = typeof c1fPlacementCostModifier === "function" ? c1fPlacementCostModifier(side, bp, coord) : { value:0, minCost:0 };
      const delta = allModifiers.reduce((sum, mod) => sum + (mod.value || 0), 0) + (placement.value || 0);
      const modifierMin = allModifiers.reduce((min, mod) => Math.max(min, mod.minCost || 0), 0);
      const cardMin = Number.isFinite(card.c2c6aMinCost) ? card.c2c6aMinCost : 0;
      const minCost = Math.max(cardMin, modifierMin, placement.minCost || 0);
      return Math.max(minCost, baseCost + delta);
    }

    function c2c6aPendingHandCardFor(side, bp=null) {
      if (!pendingHandCardUid || typeof handCardByUid !== "function") return null;
      const card = handCardByUid(side, pendingHandCardUid);
      if (!card || card.sourceType !== "unit") return null;
      if (bp && card.blueprintId !== bp.id) return null;
      return card;
    }

    function applyC2c6aHandCardSpawnBonuses(unit, card) {
      if (!unit || !card) return;
      const attBonus = Number.isFinite(card.c2c6aSpawnAttBonus) ? card.c2c6aSpawnAttBonus : 0;
      if (attBonus > 0) {
        unit.baseAtt = (unit.baseAtt || 0) + attBonus;
        unit.currentAtt = (unit.currentAtt || 0) + attBonus;
        unit.buffs = unit.buffs || [];
        unit.buffs.push({ stat:"att", value:attBonus, turns:999, permanent:true, source:card.c2c6aSpawnAttBonusSource || "Rifornimenti in arrivo", c2c6a:true });
        log(`${unit.name} entra con +${attBonus} ATT permanente dalla carta pescata (${card.c2c6aSpawnAttBonusSource || "C2c-6a"}).`);
      }
    }

    function handCardActionState(side, card) {
      if (!state || !card) return { canUse: false, reason: "Carta assente", actionText: "Non disponibile" };

      const isCurrent = state.currentPlayer === side;
      const isHuman = state.modes && state.modes[side] === "human";

      if (card.sourceType === "tactic") {
        const implemented = typeof isC2c1SingleDamageTacticCard === "function" && isC2c1SingleDamageTacticCard(card);
        const playable = typeof canUseHandTacticCard === "function" ? canUseHandTacticCard(side, card) : { ok:false, reason:"Controller tattiche non disponibile" };
        const actionText = implemented ? "Gioca ora" : "Tattica data-only";
        if (!isCurrent) return { canUse:false, reason:"Non è il turno", actionText };
        if (!isHuman) return { canUse:false, reason:"Controllo bot", actionText };
        if (botRunning) return { canUse:false, reason:"Bot in esecuzione", actionText };
        if (!implemented) return { canUse:false, reason:playable.reason, actionText };
        return { canUse: Boolean(playable.ok), reason: playable.reason, actionText };
      }

      if (!isPlayableUnitHandCard(card)) {
        return { canUse: false, reason: "Carta non unità", actionText: "Non giocabile" };
      }

      const bp = blueprintForHandCard(card, side);
      const actionText = bp && bp.type === "Struttura" ? "Costruisci carta" : "Gioca carta";

      if (!bp) return { canUse: false, reason: "Blueprint non trovato", actionText };
      if (state.winner) return { canUse: false, reason: "Partita conclusa", actionText };
      if (typeof playerHandLocked === "function" && playerHandLocked(side)) return { canUse:false, reason:"Mano bloccata", actionText };
      if (typeof handCardBlocked === "function" && handCardBlocked(card)) return { canUse:false, reason:handCardBlockReason(card), actionText };
      if (!isCurrent) return { canUse: false, reason: "Non è il turno", actionText };
      if (!isHuman) return { canUse: false, reason: "Controllo bot", actionText };
      if (botRunning) return { canUse: false, reason: "Bot in esecuzione", actionText };
      if (purchaseLimitReached(side, bp)) return { canUse: false, reason: limitReason(side, bp), actionText };
      if (state.energy[side] < effectiveHandUnitCardCost(side, card, bp)) return { canUse: false, reason: "ENE insufficiente", actionText };

      if (bp.type === "Struttura") {
        const builder = getSelectedUnit();
        if (!builder || builder.side !== side || !canBuildStructures(builder) || builder.acted) {
          return { canUse: false, reason: "Seleziona costruttore attivo", actionText };
        }
        if (!buildableCells(builder).length) {
          return { canUse: false, reason: "Nessuna cella libera adiacente", actionText };
        }
      } else if (!spawnCellsFor(side, bp).length) {
        return { canUse: false, reason: "Nessuna cella di sbarco", actionText };
      }

      return { canUse: true, reason: "Pronto", actionText };
    }

    function beginHandCardPlay(cardUid) {
      if (!state || state.winner || botRunning) return false;

      const player = state.currentPlayer;
      const card = handCardByUid(player, cardUid);
      if (!card) {
        log("Carta in mano non trovata per il giocatore corrente.");
        renderAll();
        return false;
      }

      const check = handCardActionState(player, card);
      if (!check.canUse) {
        log(`Carta ${card.name || card.id}: ${check.reason}.`);
        renderAll();
        return false;
      }

      if (card.sourceType === "tactic") {
        return beginHandTacticCardPlay(cardUid);
      }

      const bp = blueprintForHandCard(card, player);
      if (!bp) {
        log(`Carta ${card.name || card.id}: Blueprint non trovato.`);
        renderAll();
        return false;
      }

      pendingHandCardUid = card.cardUid;
      pendingAbility = null;
      pendingTacticId = null;

      if (bp.type === "Struttura") {
        const builder = getSelectedUnit();
        mode = "build";
        pendingBuildBlueprintId = bp.id;
        pendingPurchaseBlueprintId = null;
        log(`Carta ${card.name}: scegli una cella blu adiacente a ${builder.name} per costruire ${bp.name}.`, EventTypes.LOG_MESSAGE, {
          player,
          faction: state.factions[player],
          cardUid: card.cardUid,
          cardName: card.name,
          blueprintId: bp.id,
          source: "C1e-hand-card-play"
        });
      } else {
        mode = "spawn";
        pendingPurchaseBlueprintId = bp.id;
        pendingBuildBlueprintId = null;
        selectedId = null;
        log(`Carta ${card.name}: scegli una cella blu per piazzare ${bp.name}.`, EventTypes.LOG_MESSAGE, {
          player,
          faction: state.factions[player],
          cardUid: card.cardUid,
          cardName: card.name,
          blueprintId: bp.id,
          source: "C1e-hand-card-play"
        });
      }

      if (typeof closeHandPanelAfterAcceptedCardPlay === "function") closeHandPanelAfterAcceptedCardPlay();
      else if (typeof apkM4CloseHandAfterCardPlay === "function") apkM4CloseHandAfterCardPlay();
      renderAll();
      return true;
    }

    function completeHandCardUnitPlay(side, cardUid, bp) {
      if (!cardUid) return null;
      const card = handCardByUid(side, cardUid);
      if (!card) return null;
      if (bp && card.blueprintId !== bp.id) return null;
      return discardPlayedHandCard(side, cardUid);
    }


    function beginPurchase(bp) {
      pendingHandCardUid = null;
      if (state.modes[state.currentPlayer] !== "human" || state.winner) return;
      if (!canAffordBlueprint(state.currentPlayer, bp)) return;
      if (commanderLimitReached(state.currentPlayer, bp)) {
        log(`${playerName(state.currentPlayer)} ha già schierato il proprio comandante.`);
        return;
      }
      if (bp.type === "Struttura") {
        const builder = getSelectedUnit();
        if (!builder || builder.side !== state.currentPlayer || !canBuildStructures(builder) || builder.acted) {
          log(`Per costruire ${bp.name}, seleziona prima una fanteria attiva o un veicolo costruttore attivo.`);
          return;
        }
        if (!buildableCells(builder).length) {
          log(`${builder.name} non ha celle libere adiacenti per costruire.`);
          return;
        }
        mode = "build";
        pendingBuildBlueprintId = bp.id;
        pendingPurchaseBlueprintId = null;
        pendingAbility = null;
        log(`Scegli una cella blu adiacente a ${builder.name} per costruire ${bp.name}.`);
      } else {
        if (!spawnCellsFor(state.currentPlayer, bp).length) {
          log(`Nessuna cella libera di sbarco intorno al QG o agli edifici per piazzare ${bp.name}.`);
          return;
        }
        mode = "spawn";
        pendingPurchaseBlueprintId = bp.id;
        pendingBuildBlueprintId = null;
        pendingAbility = null;
        pendingTacticId = null;
        selectedId = null;
        log(`Scegli una cella blu adiacente al tuo QG o a un tuo edificio per piazzare ${bp.name}.`);
      }
      renderAll();
    }



    function toggleBuildMode(unit) {
      const structure = structureBlueprintFor(unit.side);
      if (!structure || !canBuildStructures(unit) || state.energy[unit.side] < effectiveBlueprintCost(unit.side, structure)) return;
      mode = mode === "build" ? "idle" : "build";
      pendingAbility = null;
      pendingBuildBlueprintId = mode === "build" ? structure.id : null;
      pendingPurchaseBlueprintId = null;
      pendingTacticId = null;
      pendingHandCardUid = null;
      renderAll();
    }



    function spawnUnit(bp, side, coord) {
      if (purchaseLimitReached(side, bp)) return false;
      const handCard = c2c6aPendingHandCardFor(side, bp);
      const paid = effectiveHandUnitCardCost(side, handCard, bp, coord);
      if (state.energy[side] < paid || playerEnergyLocked(side)) { log(`${playerName(side)} non può pagare ${paid} ENE per piazzare ${bp.name} in questa cella.`); return false; }
      const unit = createUnitFromBlueprint(bp, side);
      state.energy[side] -= paid;
      // C2c-6c: se uno sconto di sbarco ha contribuito al costo effettivo,
      // va consumato anche quando la carta aveva già uno sconto C2c-6a.
      consumeDeploymentDiscount(side, bp);
      if (handCard && typeof consumeHandDeploymentDiscount === "function") consumeHandDeploymentDiscount(side, bp);
      unit.pos = [...coord];
      applyAgathoiSpawnDefBonus(unit);
      applyC1fSpawnAdjacencyBonuses(unit);
      applyC2c6aHandCardSpawnBonuses(unit, handCard);
      unit.acted = !unit.vanguard;
      state.units.push(unit);
      if (typeof triggerMinesAt === "function") triggerMinesAt(unit.pos, unit);
      if (typeof triggerCellEffectsAt === "function") triggerCellEffectsAt(unit.pos, unit);
      log(`${playerName(side)} acquista ${unit.name} #${unit.instanceNo} per ${paid} ENE e lo piazza in [${coord.join(",")}].${unit.vanguard ? " Avanguardia: può agire subito." : " Entra esausto."}`, EventTypes.UNIT_SPAWNED, {
        player: side,
        faction: state.factions[side],
        unitId: unit.uid,
        unitName: unit.name,
        blueprintId: bp.id,
        cost: paid,
        coord: [...coord],
        exhausted: !unit.vanguard
      });
      return true;
    }



    function applyAgathoiSpawnDefBonus(unit) {
      if (!unit || unit.faction !== "Agathoi" || unit.type !== "Fanteria" || !unit.pos) return;
      const bonusSource = combatUnits(unit.side).find(s => s.faction === "Agathoi" && s.type === "Struttura" && s.spawnDefBonus && areAdjacent(s.pos, unit.pos));
      if (!bonusSource) return;
      const bonus = bonusSource.spawnDefBonus || 1;
      unit.currentDef += bonus;
      log(`${unit.name} entra con +${bonus} DEF corrente grazie a ${bonusSource.name}.`);
    }




    function applyC1fSpawnAdjacencyBonuses(unit) {
      if (!unit || !unit.pos) return;
      for (const s of combatUnits(unit.side).filter(x => x.type === "Struttura" && areAdjacent(x.pos, unit.pos))) {
        if (s.spawnAdjacentPermanentAtt) {
          unit.baseAtt += s.spawnAdjacentPermanentAtt || 1;
          unit.currentAtt += s.spawnAdjacentPermanentAtt || 1;
          log(`${unit.name} entra con +${s.spawnAdjacentPermanentAtt || 1} ATT permanente grazie a ${s.name}.`);
        }
      }
    }

    function buildStructure(builder, bp, coord) {
      const handCard = builder && bp ? c2c6aPendingHandCardFor(builder.side, bp) : null;
      const paid = builder && bp ? effectiveHandUnitCardCost(builder.side, handCard, bp, coord) : Infinity;
      if (!builder || !bp || playerEnergyLocked(builder.side) || state.energy[builder.side] < paid || purchaseLimitReached(builder.side, bp)) return false;
      const structure = createUnitFromBlueprint(bp, builder.side);
      state.energy[builder.side] -= paid;
      structure.pos = [...coord];
      structure.acted = true;
      state.units.push(structure);
      builder.builtThisTurn = true;
      log(`${builder.name} costruisce ${structure.name} #${structure.instanceNo} in [${coord.join(",")}] per ${paid} ENE.`, EventTypes.UNIT_BUILT, {
        player: builder.side,
        faction: state.factions[builder.side],
        builderId: builder.uid,
        builderName: builder.name,
        unitId: structure.uid,
        unitName: structure.name,
        blueprintId: bp.id,
        cost: paid,
        coord: [...coord]
      });
      return true;
    }



    function isBuildTarget(coord) {
      const u = getSelectedUnit();
      if (mode !== "build" || !u || !pendingBuildBlueprintId) return false;
      return buildableCells(u).some(c => sameCoord(c, coord));
    }



    function isSpawnTarget(coord) {
      if (mode !== "spawn" || !pendingPurchaseBlueprintId) return false;
      const bp = pendingBlueprintForHandOrMarket(state.currentPlayer, pendingPurchaseBlueprintId);
      return Boolean(bp) && spawnCellsFor(state.currentPlayer, bp).some(c => sameCoord(c, coord));
    }



    function spawnSourcesFor(player) {
      const hq = getHq(player);
      return [hq.pos, ...combatUnits(player).filter(u => u.type === "Struttura").map(u => u.pos)];
    }

    function specialSpawnSourcesFor(player, bp=null) {
      if (!bp || !countsAsLightCap(bp)) return [];
      const sources = [];
      for (const s of combatUnits(player).filter(u => u.type === "Struttura" && u.specialSpawn)) {
        const rule = s.specialSpawn;
        if (rule.onlyLight && !countsAsLightCap(bp)) continue;
        if (Array.isArray(rule.unitTypes) && !rule.unitTypes.includes(bp.type)) continue;
        sources.push({ source:s.pos, range:rule.range || 1 });
      }
      return sources;
    }

    function cellsInRangeFrom(source, range) {
      return state.cells.map(c => c.coord).filter(c => hexDistance(source, c) <= range && hexDistance(source, c) > 0);
    }

    function spawnCellsFor(player, bp=null) {
      const enemyHq = getHq(enemyOf(player));
      const seen = new Set();
      const cells = [];
      const addCell = (c) => {
        const key = coordKey(c);
        if (!seen.has(key) && isCellEnterable(c) && !getUnitAt(c) && hexDistance(c, enemyHq.pos) > 1) {
          seen.add(key);
          cells.push(c);
        }
      };
      for (const source of spawnSourcesFor(player)) for (const c of neighbors(source)) addCell(c);
      for (const src of specialSpawnSourcesFor(player, bp)) for (const c of cellsInRangeFrom(src.source, src.range)) addCell(c);
      return cells;
    }



    function canBuildStructures(unit) {
      return Boolean(unit && (unit.type === "Fanteria" || unit.canBuild));
    }



    function buildableCells(unit) {
      if (!canAct(unit) || !unit.pos || !canBuildStructures(unit)) return [];
      return neighbors(unit.pos).filter(c => isCellEnterable(c) && !getUnitAt(c));
    }



    function canAnyInfantryBuild(player, structure) {
      return !playerEnergyLocked(player) && !purchaseLimitReached(player, structure) && activeCombatUnits(player).some(u => canBuildStructures(u) && buildableCells(u).length > 0) && state.energy[player] >= effectiveBlueprintCost(player, structure);
    }

