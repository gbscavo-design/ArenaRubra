"use strict";

// Arena Rubra – C1g
// Bot roster adoption: AI base aggiornata per usare roster C1f, mano unità e acquisti estesi.
// Questo file contiene solo helper base di lettura campo usati dall'AI:
// PS controllati, centro, PS laterale, prossimità alleati/nemici,
// comandante e minacce base.
// Non contiene ancora orchestratore del turno bot, acquisti, azioni,
// movimento AI o punteggi strategici pesanti.

// Dipendenze globali accettate in questa fase:
// - state.js: state
// - rules.js: getCellAt, getUnitAt, getHq, combatUnits, countControlledPS, enemyOf
// - board.js: isOnPS
// - hex.js: sameCoord, hexDistance
// - constants.js: CENTER_PS_COORD, CENTER_OPENING_END_ROUND,
//   CENTER_CONTEST_END_ROUND, QG_THREAT_RANGE
// - movement.js: movableCells
// - board.js: pressureStartRound, isOnPS
// - render/events: log, EventTypes
// - movement.js: movableCells
// - main.js non conserva più blocchi AI principali.
// - azioni operative, attacco e scoring abilità/bersagli sono ora qui.

function advancedAiEnabled() { return state && state.aiMode === "advanced"; }

function controlledPsCells(player) { return state.cells.filter(c => c.ps && c.control === player); }

function centerPsCell() { return state.cells.find(c => c.ps && sameCoord(c.coord, CENTER_PS_COORD)) || null; }

function centerPsOccupant() { const center = centerPsCell(); return center ? getUnitAt(center.coord) : null; }

function centerControlledBy(player) { const center = centerPsCell(); return Boolean(center && center.control === player); }

function centerControlledByEnemy(player) { const center = centerPsCell(); const enemy = enemyOf(player); return Boolean(center && center.control === enemy); }

function centerOpeningActive(player) { return Boolean(centerPsCell() && state.turn <= CENTER_OPENING_END_ROUND && !centerControlledBy(player)); }

function centerContestUrgent(player) { return Boolean(centerPsCell() && state.turn <= CENTER_CONTEST_END_ROUND && centerControlledByEnemy(player)); }

function sidePsCells() { return state.cells.filter(c => c.ps && !sameCoord(c.coord, CENTER_PS_COORD)); }

function homePsCell(player) {
      const hq = getHq(player);
      const candidates = sidePsCells();
      if (!hq || !candidates.length) return null;
      return candidates.slice().sort((a,b) => hexDistance(hq.pos, a.coord) - hexDistance(hq.pos, b.coord))[0] || null;
    }

function homePsOccupant(player) {
      const home = homePsCell(player);
      return home ? getUnitAt(home.coord) : null;
    }

function homePsControlled(player) {
      const occupant = homePsOccupant(player);
      return Boolean(occupant && occupant.side === player && occupant.type !== "QG");
    }

function homePsDutyActive(player, status=strategicStatus(player)) {
      const home = homePsCell(player);
      if (!home) return false;
      if (homePsControlled(player)) return false;
      // Apertura centrale: nei primi turni il PS laterale non deve coprire la corsa/contestazione del centro.
      if (status && (status.centerOpening || status.centerLostEarly)) return false;
      // Se il QG è direttamente minacciato, la difesa resta prioritaria; altrimenti il PS laterale va messo in sicurezza.
      if (status && status.hqDanger && status.enemiesNearOwnHq && status.enemiesNearOwnHq.length >= 2) return false;
      return true;
    }

function alliesNear(coord, player, range=1) { return combatUnits(player).filter(u => hexDistance(u.pos, coord) <= range); }

function enemiesNear(coord, player, range=1) { return combatUnits(enemyOf(player)).filter(u => hexDistance(u.pos, coord) <= range); }

function commanderOf(player) { return combatUnits(player).find(u => u.type === "Comandante") || null; }

function unitIsGarrisoningPs(unit) {
      if (!unit || unit.type === "Comandante" || unit.type === "QG" || !unit.pos) return false;
      const cell = getCellAt(unit.pos);
      return Boolean(cell && cell.ps && cell.control === unit.side);
    }

function threatenedOwnHqUnits(player) {
      const hq = getHq(player);
      return combatUnits(enemyOf(player)).filter(e => hexDistance(e.pos, hq.pos) <= QG_THREAT_RANGE);
    }

function commanderThreatLevel(commander) {
      if (!commander || !commander.alive) return 0;
      const near = enemiesNear(commander.pos, commander.side, 2).length;
      const adjacent = enemiesNear(commander.pos, commander.side, 1).length;
      return adjacent * 2 + near;
    }


// =====================================================
// C2e-3 – Strategic layer / threat map / deck-cycle helpers
// =====================================================
function botCardCounts(player) {
      return {
        deck: state && state.deck && state.deck[player] ? state.deck[player].length : 0,
        hand: state && state.hand && state.hand[player] ? state.hand[player].length : 0,
        discard: state && state.discard && state.discard[player] ? state.discard[player].length : 0
      };
    }

function botArmyValue(player) {
      return combatUnits(player).reduce((sum, u) => sum + botUnitValue(u), 0);
    }

function botIncomeValue(player) {
      return typeof effectiveIncomeGain === "function" ? (effectiveIncomeGain(player).total || 0) : BASE_INCOME + countControlledPS(player);
    }

function evaluateBotStrategicState(player) {
      const enemy = enemyOf(player);
      const ownCards = botCardCounts(player);
      const enemyCards = botCardCounts(enemy);
      const ownUnits = combatUnits(player);
      const enemyUnits = combatUnits(enemy);
      const ownPs = countControlledPS(player);
      const enemyPs = countControlledPS(enemy);
      const ownIncome = botIncomeValue(player);
      const enemyIncome = botIncomeValue(enemy);
      const ownArmy = botArmyValue(player);
      const enemyArmy = botArmyValue(enemy);
      const center = centerPsCell();
      const centerControl = center ? center.control : null;
      const centerMissing = Boolean(center && center.control !== player);
      const deckCyclePressure = ownCards.deck <= 2 && ownCards.hand <= 3 && ownCards.discard >= 3;
      const recoveryReadySoon = ownCards.deck <= 0 && ownCards.hand <= 2 && ownCards.discard >= 3;
      const psDelta = ownPs - enemyPs;
      const incomeDelta = ownIncome - enemyIncome;
      const handDelta = ownCards.hand - enemyCards.hand;
      const unitDelta = ownUnits.length - enemyUnits.length;
      const armyDelta = ownArmy - enemyArmy;
      const advantageScore = psDelta * 6 + incomeDelta * 2 + handDelta * 0.75 + unitDelta * 1.5 + armyDelta * 0.18;
      let posture = "pari";
      if (advantageScore >= 8) posture = "vantaggio";
      else if (advantageScore <= -8) posture = "svantaggio";
      return { player, enemy, ownCards, enemyCards, ownUnits, enemyUnits, ownPs, enemyPs, ownIncome, enemyIncome, ownArmy, enemyArmy, center, centerControl, centerMissing, deckCyclePressure, recoveryReadySoon, psDelta, incomeDelta, handDelta, unitDelta, armyDelta, advantageScore, posture };
    }

function botCenterPsBonus(player, coord) {
      const center = centerPsCell();
      if (!center || !coord || center.control === player) return 0;
      const d = hexDistance(coord, center.coord);
      if (d === 0) return center.control === enemyOf(player) ? 34 : 26;
      if (d === 1) return center.control === enemyOf(player) ? 13 : 9;
      if (d === 2) return 4;
      return 0;
    }

function botEnemyCanThreatenCell(enemyUnit, coord) {
      if (!enemyUnit || !enemyUnit.alive || enemyUnit.type === "QG" || !coord) return false;
      const d = hexDistance(enemyUnit.pos, coord);
      if (d <= 1) return true;
      // Threat map semplice: fanterie/comandanti e unità moveAttack possono muovere e colpire; i veicoli normali no.
      const mobileAttack = typeof canActAfterMove === "function" ? canActAfterMove(enemyUnit) : (enemyUnit.type === "Fanteria" || enemyUnit.type === "Comandante" || enemyUnit.moveAttack);
      const move = typeof movementRangeFor === "function" ? movementRangeFor(enemyUnit) : 1;
      return Boolean(mobileAttack && d <= move + 1);
    }

function botThreatToCell(player, coord, unit=null) {
      const enemy = enemyOf(player);
      const defender = unit ? { ...unit, pos: coord, side: player } : { side: player, pos: coord, currentHp: 1, currentDef: 0, type: "Fanteria", weight: "Leggera" };
      const attackers = combatUnits(enemy).filter(e => botEnemyCanThreatenCell(e, coord));
      const damage = attackers.reduce((sum, e) => {
        const base = typeof effectiveAtt === "function" ? effectiveAtt(e) : (e.att || 0);
        const ns = typeof numericalSuperiorityBonus === "function" ? numericalSuperiorityBonus(e, defender) : 0;
        return sum + Math.max(0, base + ns);
      }, 0);
      const life = unit ? Math.max(1, (unit.currentHp || 0) + (unit.currentDef || 0)) : 1;
      return { attackers, damage, life, lethal: unit ? damage >= life : attackers.length > 0 };
    }

function botThreatPenalty(player, coord, unit=null) {
      const threat = botThreatToCell(player, coord, unit);
      if (!threat.attackers.length) return 0;
      let penalty = threat.attackers.length * 2 + Math.min(18, threat.damage * 0.85);
      if (unit) {
        penalty += Math.min(12, botUnitValue(unit) * 0.35);
        if (unit.type === "Comandante") penalty += 6;
        if (unit.weight === "Elite" || unit.weight === "Pivot") penalty += 4;
        if (threat.lethal) penalty += 12;
      }
      return penalty;
    }

function botDeckCyclePressure(player) {
      const data = evaluateBotStrategicState(player);
      return data.deckCyclePressure || data.recoveryReadySoon;
    }

function botHandCardCycleScore(player, bp, card) {
      const data = evaluateBotStrategicState(player);
      if (!card || card.sourceType !== "unit") return 0;
      let score = 0;
      if (data.deckCyclePressure) score += 4;
      if (data.recoveryReadySoon) score += 6;
      if (data.ownCards.hand >= 8) score += 2;
      if (data.ownCards.hand >= botHandMax(player) - 1) score += 3;
      const status = strategicStatus(player);
      if (status.allIn || status.hqDanger || status.enemyPressurePlan) score += 2;
      if (data.posture === "svantaggio" && (bp.weight === "Leggera" || bp.cost <= 2)) score += 2;
      return score;
    }

function botImmediateVictoryThreat(player) {
      if (!state || state.winner) return false;
      const enemy = enemyOf(player);
      if (countControlledPS(enemy) < 1) return false;
      const ownHq = getHq(player);
      if (!ownHq || !ownHq.pos) return false;
      const occupant = getUnitAt(ownHq.pos);
      if (occupant && occupant.side === enemy) return true;
      return combatUnits(enemy).some(e => {
        if (!e || !e.alive || e.type === "QG" || !e.pos) return false;
        const move = typeof movementRangeFor === "function" ? movementRangeFor(e) : 1;
        return hexDistance(e.pos, ownHq.pos) <= move;
      });
    }

function botChoiceDefendsImmediateVictory(player, choice) {
      if (!choice) return false;
      const ownHq = getHq(player);
      if (!ownHq || !ownHq.pos) return false;
      if (choice.coord && hexDistance(choice.coord, ownHq.pos) <= 1) return true;
      if (choice.builder && choice.builder.pos && hexDistance(choice.builder.pos, ownHq.pos) <= 1) return true;
      if (choice.bp) {
        if (choice.bp.frontLine || choice.bp.type === "Struttura") return choice.coord && hexDistance(choice.coord, ownHq.pos) <= 2;
        if (choice.bp.type === "Fanteria" || choice.bp.type === "Comandante") return choice.coord && hexDistance(choice.coord, ownHq.pos) <= 2;
      }
      return false;
    }

function botLastHandCycleActive(player) {
      if (!advancedAiEnabled() || !state || !state.hand || !state.deck || !state.discard) return false;
      const hand = (state.hand[player] || []).filter(card => card && !(typeof handCardBlocked === "function" && handCardBlocked(card)));
      const ownCards = botCardCounts(player);
      return ownCards.deck <= 0 && hand.length === 1 && hand[0] && hand[0].sourceType === "unit" && ownCards.discard >= 3;
    }

function botShouldForceLastCardPlay(player, choice) {
      if (!choice || choice.source !== "hand" || !choice.cardUid || !botLastHandCycleActive(player)) return false;
      const cost = botChoiceEneCost(player, choice);
      if ((state.energy[player] || 0) < cost) return false;
      if (botImmediateVictoryThreat(player) && !botChoiceDefendsImmediateVictory(player, choice)) return false;
      return true;
    }

function botChoiceEneCost(player, choice) {
      if (!choice || !choice.bp) return 0;
      if (Number.isFinite(choice.cost)) return choice.cost;
      return typeof effectiveBlueprintCost === "function" ? effectiveBlueprintCost(player, choice.bp, choice.coord || null) : (choice.bp.cost || 0);
    }

function botTopPlayableHandTacticCost(player) {
      if (!state || !state.hand || !state.hand[player] || typeof canUseHandTacticCard !== "function") return 0;
      const candidates = botHandTacticCards(player).filter(card => {
        const check = canUseHandTacticCard(player, card);
        return check && check.ok;
      });
      let best = { cost:0, score:0 };
      for (const card of candidates) {
        const c = typeof normalizeHandTacticCard === "function" ? normalizeHandTacticCard(card) : card;
        const immediate = typeof isHandTacticImmediateNoTargetCard === "function" && isHandTacticImmediateNoTargetCard(c);
        if (immediate) {
          const score = scoreBotAdvancedHandTactic(player, c, null, "reserve");
          if (score > best.score) best = { cost:c.cost || 0, score };
          continue;
        }
        const targets = typeof handTacticTargets === "function" ? handTacticTargets(player, c) : [];
        for (const target of targets) {
          const score = scoreBotAdvancedHandTactic(player, c, target, "reserve");
          if (score > best.score) best = { cost:c.cost || 0, score };
        }
      }
      return best.score >= 8 ? best.cost : 0;
    }

function botLightEneReserve(player) {
      const data = evaluateBotStrategicState(player);
      const status = strategicStatus(player);
      if (status.allIn || status.hqDanger || status.pressureDanger || status.enemyPressurePlan || status.pressureEmergency || status.zeroPsRecovery || status.defendQGRecovery) return 0;
      if (botOpeningDoctrineActive()) return 0;
      let reserve = 0;
      if (data.recoveryReadySoon) reserve = Math.max(reserve, CARD_CATALOG_CONFIG.deckRecoveryCost || 5);
      reserve = Math.max(reserve, Math.min(4, botTopPlayableHandTacticCost(player)));
      if (data.posture === "svantaggio" && data.ownPs < 1) reserve = Math.max(0, reserve - 1);
      return Math.min(reserve, state.energy[player] || 0);
    }

function botApplyEneReserveToChoices(player, choices) {
      if (!advancedAiEnabled() || !choices || !choices.length) return choices;
      const reserve = botLightEneReserve(player);
      if (reserve <= 0) return choices;
      const data = evaluateBotStrategicState(player);
      for (const choice of choices) {
        const cost = botChoiceEneCost(player, choice);
        choice.c2e3Cost = cost;
        if (choice.c2e3aLastCardForce) {
          choice.score = (choice.score || 0) + 25;
          continue;
        }
        const after = (state.energy[player] || 0) - cost;
        if (after < reserve) {
          const gap = reserve - after;
          choice.score = (choice.score || 0) - gap * (data.posture === "svantaggio" ? 3.2 : 5.2);
          if (choice.source === "hand" && data.deckCyclePressure) choice.score += 3;
        }
      }
      return choices;
    }

function c2e3MoveScore(unit, coord) {
      const player = unit.side;
      const data = evaluateBotStrategicState(player);
      let score = botCenterPsBonus(player, coord);
      const cell = getCellAt(coord);
      if (cell && cell.ps && cell.control !== player) score += data.posture === "svantaggio" ? 12 : 7;
      if (cell && cell.ps && cell.control === player) score += data.posture === "vantaggio" ? 7 : 3;
      score -= botThreatPenalty(player, coord, unit) * (data.posture === "vantaggio" ? 0.8 : 0.55);
      score += botGeneralDoctrineMoveBonus(unit, coord, strategicStatus(player)) * 0.55;
      score -= botPsSupportGatePenalty(unit, coord, strategicStatus(player)) * 0.35;
      if (data.recoveryReadySoon && unit.type !== "Comandante") score += 1.5;
      return score;
    }

function c2e3SaferStrategicMove(unit, options, proposed) {
      if (!advancedAiEnabled() || !proposed || !options || !options.length) return proposed;
      const proposedScore = c2e3MoveScore(unit, proposed);
      const best = options.map(coord => ({ coord, score:c2e3MoveScore(unit, coord) }))
        .sort((a,b) => b.score - a.score)[0];
      if (!best) return proposed;
      const proposedThreat = botThreatPenalty(unit.side, proposed, unit);
      const bestThreat = botThreatPenalty(unit.side, best.coord, unit);
      if (best.score > proposedScore + 5 && (proposedThreat > bestThreat + 6 || botCenterPsBonus(unit.side, best.coord) >= botCenterPsBonus(unit.side, proposed))) return best.coord;
      return proposed;
    }


// =====================================================
// C2e-4a – General Doctrine helpers
// Opening / PS posture / victory-crisis / anti-suicide
// =====================================================
function botOpeningDoctrineActive() {
      return advancedAiEnabled() && state && state.turn <= 4;
    }

function botUnitIsSacrificial(unit) {
      if (!unit) return false;
      if (unit.type === "Comandante" || unit.weight === "Elite" || unit.weight === "Pivot" || unit.type === "Struttura") return false;
      return (unit.cost || 0) <= 1 || unit.weight === "Leggera";
    }

function botUnitIsValuable(unit) {
      if (!unit) return false;
      return unit.type === "Comandante" || unit.weight === "Elite" || unit.weight === "Pivot" || unit.type === "Struttura" || (unit.cost || 0) >= 4;
    }

function botBlueprintIsSacrificial(bp) {
      if (!bp) return false;
      if (bp.type === "Comandante" || bp.weight === "Elite" || bp.weight === "Pivot" || bp.type === "Struttura") return false;
      return (bp.cost || 0) <= 1 || bp.weight === "Leggera";
    }

function botBlueprintIsValuable(bp) {
      if (!bp) return false;
      return bp.type === "Comandante" || bp.weight === "Elite" || bp.weight === "Pivot" || bp.type === "Struttura" || (bp.cost || 0) >= 4;
    }

function botFakeUnitForCoord(player, bp, coord) {
      return {
        side: player,
        faction: state.factions && state.factions[player],
        pos: coord,
        type: bp.type || "Fanteria",
        weight: bp.weight || "Leggera",
        cost: bp.cost || 0,
        att: bp.att || 0,
        currentAtt: bp.att || 0,
        currentHp: bp.hp || 1,
        currentDef: bp.def || 0,
        maxHp: bp.hp || 1,
        maxDef: bp.def || 0
      };
    }

function botDoctrineExposurePenalty(unit, coord, status=strategicStatus(unit.side)) {
      if (!unit || !coord || (status && status.allIn)) return 0;
      const threat = botThreatToCell(unit.side, coord, unit);
      if (!threat.attackers.length) return 0;
      let penalty = threat.attackers.length * 2.4 + Math.min(18, threat.damage * 0.8);
      if (threat.lethal) penalty += 9;
      const cell = getCellAt(coord);
      const strategicCell = Boolean(cell && cell.ps) || (status && status.hqDanger && hexDistance(coord, status.ownHq.pos) <= 1);
      if (botUnitIsSacrificial(unit) && strategicCell) penalty *= 0.28;
      else if (botUnitIsSacrificial(unit)) penalty *= 0.48;
      else if (botUnitIsValuable(unit)) penalty *= 1.1;
      if (unit.type === "Comandante") penalty *= 1.25;
      return penalty;
    }


// C2e-4a1 – PS Support Gate / Anti-Suicide
// Impedisce al bot di mandare una singola unità a contestare un PS contro 2-3 nemici senza follow-up.
function botPsSupportScore(unit, coord) {
      if (!unit || !coord) return 0;
      const player = unit.side;
      return combatUnits(player).filter(a => a.uid !== unit.uid && a.type !== "QG" && a.pos && hexDistance(a.pos, coord) <= 2)
        .reduce((sum, ally) => {
          const d = hexDistance(ally.pos, coord);
          let value = d <= 1 ? 1.15 : 0.7;
          if (ally.type === "Struttura") value += 0.85;
          if ((typeof effectiveAtt === "function" ? effectiveAtt(ally) : (ally.currentAtt || ally.att || 0)) > 0) value += 0.35;
          if (ally.ability && !ally.ability.passive && (ally.ability.range || 1) >= 2) value += 0.55;
          if (ally.weight === "Elite" || ally.weight === "Pivot" || ally.type === "Comandante") value += 0.25;
          return sum + value;
        }, 0);
    }

function botPsSupportGateData(unit, coord, status=strategicStatus(unit.side)) {
      const cell = getCellAt(coord);
      if (!unit || !coord || !cell || !cell.ps) return null;
      const player = unit.side;
      const threat = botThreatToCell(player, coord, unit);
      const nearbyEnemies = enemiesNear(coord, player, 2).length;
      const enemyPressure = Math.max(threat.attackers.length, nearbyEnemies);
      const support = botPsSupportScore(unit, coord);
      const center = centerPsCell();
      const isCenter = Boolean(center && sameCoord(coord, center.coord));
      const enemyControlsCell = cell.control === enemyOf(player);
      const emergencyBlock = Boolean(status && (status.allIn || status.pressureDanger || status.enemyPressurePlan || status.roundDanger));
      const openingRace = Boolean(status && status.centerOpening && isCenter && !enemyControlsCell);
      const immediateQGBlock = typeof botImmediateVictoryThreat === "function" && botImmediateVictoryThreat(player);
      return { cell, player, threat, nearbyEnemies, enemyPressure, support, isCenter, enemyControlsCell, emergencyBlock, openingRace, immediateQGBlock };
    }

function botPsSupportGatePenalty(unit, coord, status=strategicStatus(unit.side)) {
      if (!advancedAiEnabled() || !unit || !coord) return 0;
      const data = botPsSupportGateData(unit, coord, status);
      if (!data) return 0;
      if (data.enemyPressure < 2) return 0;
      if (data.support >= 1.65) return 0;
      let penalty = 22 + Math.max(0, data.enemyPressure - 2) * 8;
      if (data.threat.lethal) penalty += 13;
      if (botUnitIsValuable(unit)) penalty += 7;
      if (unit.type === "Comandante") penalty += 10;
      // Liberti possono sacrificare, ma non devono regalare unità senza seguito.
      if (botUnitIsSacrificial(unit)) penalty *= 0.78;
      if (unit.faction === "Liberti" && botUnitIsSacrificial(unit)) penalty *= 0.92;
      if (data.openingRace) penalty *= 0.62;
      if (data.emergencyBlock) penalty *= 0.48;
      if (data.immediateQGBlock) penalty *= 0.32;
      return penalty;
    }

function botPsSupportGateBonus(unit, coord, status=strategicStatus(unit.side)) {
      if (!advancedAiEnabled() || !unit || !coord) return 0;
      const data = botPsSupportGateData(unit, coord, status);
      if (!data) return 0;
      let score = 0;
      if (data.support >= 1.65 && data.enemyPressure >= 1) score += 6 + Math.min(8, data.support * 2);
      if (data.support >= 2.4 && data.enemyPressure >= 2) score += 7;
      if (data.enemyControlsCell && data.support >= 1.65) score += 5;
      return score;
    }

function botPsAdjacentStagingBonus(unit, coord, status=strategicStatus(unit.side)) {
      if (!advancedAiEnabled() || !unit || !coord) return 0;
      const player = unit.side;
      const targets = state.cells.filter(c => c.ps && c.control !== player && hexDistance(coord, c.coord) === 1);
      if (!targets.length) return 0;
      const support = botPsSupportScore(unit, coord);
      let score = 0;
      for (const ps of targets) {
        const pressure = Math.max(enemiesNear(ps.coord, player, 2).length, getUnitAt(ps.coord) && getUnitAt(ps.coord).side !== player ? 1 : 0);
        if (pressure >= 2 && support >= 1.2) score += 8;
        if (pressure >= 2 && support < 1.2 && !botUnitIsSacrificial(unit)) score += 3;
        if (unit.ability && !unit.ability.passive && (unit.ability.range || 1) >= 2) score += 3;
      }
      return score;
    }



// C2e-4a2 – Objective Recovery / Pressure Emergency / Mine Awareness
// Regole generali: 0 PS = recupero obiettivo, 3 PS nemici = override PS,
// difesa QG con linea di ripartenza, evitamento mine/celle pericolose.
function botTotalPsCount() {
      return state && Array.isArray(state.cells) ? state.cells.filter(c => c.ps).length : 3;
    }

function botPressureEmergencyActive(status) {
      if (!status) return false;
      return status.enemyPs >= botTotalPsCount() || status.enemyPressure >= Math.min(3, PRESSURE_WIN - 2);
    }

function botZeroPsRecoveryActive(status) {
      return Boolean(status && status.ownPs <= 0 && status.enemyPs > 0);
    }

function botObjectiveRecoveryTargets(player, status=strategicStatus(player)) {
      const targets = [];
      const center = centerPsCell();
      const home = homePsCell(player);
      if (botZeroPsRecoveryActive(status)) {
        if (home && home.control !== player) targets.push(home.coord);
        if (center && center.control !== player) targets.push(center.coord);
      }
      if (status && status.pressureEmergency) {
        for (const c of state.cells.filter(c => c.ps && c.control === status.enemy)) targets.push(c.coord);
        if (center && center.control !== player) targets.push(center.coord);
        if (home && home.control !== player) targets.push(home.coord);
      }
      if (status && status.defendQGRecovery) {
        if (home && home.control !== player) targets.push(home.coord);
        if (center && center.control !== player) targets.push(center.coord);
      }
      if (!targets.length) {
        for (const c of state.cells.filter(c => c.ps && c.control !== player)) targets.push(c.coord);
      }
      return uniqueCoords(targets);
    }

function botObjectiveRecoveryBonus(unit, coord, status=strategicStatus(unit.side)) {
      if (!advancedAiEnabled() || !unit || !coord || !status) return 0;
      const player = unit.side;
      const targets = botObjectiveRecoveryTargets(player, status);
      if (!targets.length) return 0;
      const cell = getCellAt(coord);
      let score = 0;
      const nearest = minDistance(coord, targets);
      if (botZeroPsRecoveryActive(status)) {
        score += Math.max(0, 42 - nearest * 7);
        if (cell && cell.ps && cell.control !== player) score += 42;
        if (cell && cell.ps && cell.control === status.enemy) score += 18;
      }
      if (status.pressureEmergency) {
        score += Math.max(0, 52 - nearest * 8);
        if (cell && cell.ps && cell.control !== player) score += 48;
        if (cell && cell.ps && cell.control === status.enemy) score += 34;
        if (botUnitIsSacrificial(unit) && cell && cell.ps && cell.control !== player) score += 18;
      }
      if (status.defendQGRecovery) {
        // La difesa QG non deve diventare castello immobile: una parte della forza deve ripartire verso PS proprio/centrale.
        score += Math.max(0, 28 - nearest * 5);
        if (cell && cell.ps && cell.control !== player) score += 22;
        const hqDist = status.ownHq ? hexDistance(coord, status.ownHq.pos) : 99;
        if (hqDist <= 1 && !(cell && cell.ps) && !botUnitIsSacrificial(unit)) score -= 5;
      }
      return score;
    }

function botMineAt(coord) {
      if (!state || !Array.isArray(state.mines) || !coord) return null;
      return state.mines.find(m => m && Array.isArray(m.coord) && sameCoord(m.coord, coord)) || null;
    }

function botDangerousCellEffects(player, coord) {
      if (!coord || typeof cellEffectsAt !== "function") return [];
      return cellEffectsAt(coord).filter(e => {
        if (!e) return false;
        if (e.kind === "cell_movement_boost" && e.owner === player) return false;
        if (e.kind === "temporary_block_cell") return true;
        if (["cell_movement_trap", "vegetal_anathema_trap", "bramble_path_trap"].includes(e.kind) && e.owner !== player) return true;
        // Se il boost è nemico o non nostro, non entrarci come scelta preferita.
        if (e.kind === "cell_movement_boost" && e.owner !== player) return true;
        return false;
      });
    }

function botCellDangerPenalty(player, coord, unitOrBp=null, status=strategicStatus(player)) {
      if (!advancedAiEnabled() || !coord) return 0;
      let penalty = 0;
      let purposeBreaking = false;
      const mine = botMineAt(coord);
      if (mine) {
        penalty += 30;
        const type = unitOrBp && unitOrBp.type;
        if (type === "Veicolo") penalty += 16;
        if (type === "Comandante" || (unitOrBp && (unitOrBp.weight === "Elite" || unitOrBp.weight === "Pivot"))) penalty += 10;
      }
      const effects = botDangerousCellEffects(player, coord);
      for (const e of effects) {
        if (e.kind === "cell_movement_trap") { penalty += 16; if (unitOrBp && unitOrBp.type === "Veicolo") purposeBreaking = true; }
        else if (e.kind === "bramble_path_trap") { penalty += 18; if (unitOrBp && (unitOrBp.currentDef || unitOrBp.def || 0) <= 1) purposeBreaking = true; }
        else if (e.kind === "vegetal_anathema_trap") { penalty += 14; if (unitOrBp && ((unitOrBp.currentAtt || unitOrBp.att || 0) > 0 || unitOrBp.vanguard || unitOrBp.moveAttack)) purposeBreaking = true; }
        else if (e.kind === "temporary_block_cell") { penalty += 40; purposeBreaking = true; }
        else penalty += 10;
      }
      if (penalty && status && (status.allIn || status.pressureEmergency || botZeroPsRecoveryActive(status))) penalty *= purposeBreaking ? 0.88 : 0.55;
      return penalty;
    }

function botCellOpportunityBonus(player, coord) {
      if (!coord || typeof cellEffectsAt !== "function") return 0;
      return cellEffectsAt(coord, "cell_movement_boost").some(e => e.owner === player) ? 7 : 0;
    }

// =====================================================
// C2e-4g – AI Integration / Regression Pass helpers
// Arbitraggio priorità: close pressure, QG access blocking,
// hazard scaling e telemetry leggera per campagna 100 game.
// =====================================================
function ensureAiTelemetry() {
      if (!state) return null;
      if (!state.aiTelemetry) {
        state.aiTelemetry = {
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
        };
      }
      return state.aiTelemetry;
    }

function recordAiGoalMode(player, mode) {
      const t = ensureAiTelemetry();
      if (!t || !mode) return;
      if (t.lastGoal[player] && t.lastGoal[player] !== mode) t.goalSwitchCount[player] = (t.goalSwitchCount[player] || 0) + 1;
      t.lastGoal[player] = mode;
      t.lastGoalBeforeWin[player] = mode;
    }

function recordAiHazardTrigger(player, kind="hazard", self=false) {
      const t = ensureAiTelemetry();
      if (!t || !player) return;
      t.hazardsTriggered[player] = (t.hazardsTriggered[player] || 0) + 1;
      if (self || kind === "self_mine") t.selfMineTriggers[player] = (t.selfMineTriggers[player] || 0) + 1;
    }

function updateAiTelemetryStartTurn(player) {
      const t = ensureAiTelemetry();
      if (!t || !player) return;
      updateControlFromOccupants();
      const enemy = enemyOf(player);
      const ownPs = countControlledPS(player);
      const enemyPs = countControlledPS(enemy);
      const ownPressure = state.pressure[player] || 0;
      const enemyPressure = state.pressure[enemy] || 0;
      t.maxPressure[player] = Math.max(t.maxPressure[player] || 0, ownPressure);
      t.maxPressure[enemy] = Math.max(t.maxPressure[enemy] || 0, enemyPressure);
      if (ownPs <= 0) t.turnsAt0PS[player] = (t.turnsAt0PS[player] || 0) + 1;
      if (enemyPs >= botTotalPsCount()) t.turnsEnemyAt3PS[player] = (t.turnsEnemyAt3PS[player] || 0) + 1;
      if (enemyPressure >= Math.min(3, PRESSURE_WIN - 2) || enemyPs >= botTotalPsCount()) t.pressureEmergencyTurns[player] = (t.pressureEmergencyTurns[player] || 0) + 1;
      if (botImmediateVictoryThreat(player)) t.qgThreatTurns[player] = (t.qgThreatTurns[player] || 0) + 1;
      if (t.wasAt0PS[player] && ownPs > 0) t.recoveriesFrom0PS[player] = (t.recoveriesFrom0PS[player] || 0) + 1;
      t.wasAt0PS[player] = ownPs <= 0;
    }

function botClosePressureLockActive(status) {
      return Boolean(status && status.ownPressure >= PRESSURE_WIN - 1 && status.ownPs > status.enemyPs);
    }

function botClosePressureLockBonus(unit, coord, status=strategicStatus(unit.side)) {
      if (!advancedAiEnabled() || !botClosePressureLockActive(status) || !unit || !coord) return 0;
      const player = unit.side;
      const cell = getCellAt(coord);
      let score = 0;
      const ownPsCells = controlledPsCells(player);
      if (cell && cell.ps && cell.control === player) score += 42;
      for (const ps of ownPsCells) {
        const d = hexDistance(coord, ps.coord);
        if (d === 0) score += 20;
        if (d === 1) score += botUnitIsSacrificial(unit) ? 18 : 12;
        if (d === 2 && unit.ability && !unit.ability.passive && (unit.ability.range || 1) >= 2) score += 6;
        const contesters = combatUnits(status.enemy).filter(e => botEnemyCanThreatenCell(e, ps.coord) || hexDistance(e.pos, ps.coord) <= 2);
        if (contesters.length && d <= 1) score += 10 + Math.min(12, contesters.length * 4);
      }
      const enemyHq = getHq(status.enemy);
      if (enemyHq && hexDistance(coord, enemyHq.pos) <= 2 && !sameCoord(coord, enemyHq.pos)) score -= 18;
      return score;
    }

function botEnemyQGThreatWeight(enemyUnit, player) {
      if (!enemyUnit || !enemyUnit.alive || enemyUnit.type === "QG") return 0;
      const ownHq = getHq(player);
      if (!ownHq || !ownHq.pos) return 0;
      const move = typeof movementRangeFor === "function" ? movementRangeFor(enemyUnit) : 1;
      const canActAfter = typeof canActAfterMove === "function" ? canActAfterMove(enemyUnit) : (enemyUnit.type === "Fanteria" || enemyUnit.type === "Comandante" || enemyUnit.moveAttack);
      const d = hexDistance(enemyUnit.pos, ownHq.pos);
      let score = 0;
      if (d <= move) score += 18;
      if (canActAfter && d <= move + 1) score += 12;
      if (d <= QG_THREAT_RANGE) score += Math.max(0, 10 - d * 2);
      const n = String(enemyUnit.name || "").toLowerCase();
      if (enemyUnit.faction === "Exordium" && enemyUnit.type === "Veicolo" && /carro leggero|cursor|veicolo ricognitore/.test(n)) score += 12;
      if (enemyUnit.nextTurnMoveBonus || enemyUnit.warPush || enemyUnit.moveAttack || enemyUnit.noAttackMoveNext) score += 6;
      return score;
    }

function botQGAccessBlockBonus(player, coord, unitOrBp=null, status=strategicStatus(player)) {
      if (!advancedAiEnabled() || !status || !status.hqDanger || !coord) return 0;
      const ownHq = getHq(player);
      if (!ownHq || !ownHq.pos) return 0;
      const d = hexDistance(coord, ownHq.pos);
      if (d > 2) return 0;
      let score = d === 0 ? 46 : (d === 1 ? 30 : 8);
      const blockers = status.enemiesNearOwnHq || [];
      for (const e of blockers) {
        const threat = botEnemyQGThreatWeight(e, player);
        if (!threat) continue;
        const move = typeof movementRangeFor === "function" ? movementRangeFor(e) : 1;
        if (hexDistance(e.pos, coord) <= move + 1) score += Math.min(24, threat * 0.75);
      }
      if (unitOrBp) {
        if (unitOrBp.type === "Struttura") score += 8;
        if (botUnitIsSacrificial(unitOrBp) || botBlueprintIsSacrificial(unitOrBp)) score += 6;
        if (unitOrBp.type === "Veicolo" && String(unitOrBp.weight || "").toLowerCase().startsWith("legger")) score += 3;
      }
      return score;
    }

function botEnemyCanContestControlledPsNextTurn(player, enemyUnit) {
      if (!enemyUnit || enemyUnit.side === player || !enemyUnit.pos) return false;
      return controlledPsCells(player).some(ps => botEnemyCanThreatenCell(enemyUnit, ps.coord) || hexDistance(enemyUnit.pos, ps.coord) <= 2);
    }

function botTacticEmergencyRelevance(player, cardOrTactic, target, status=strategicStatus(player)) {
      if (!advancedAiEnabled() || !status || !(status.pressureEmergency || status.zeroPsRecovery || status.defendQGRecovery || botClosePressureLockActive(status))) return 0;
      const kind = (cardOrTactic && (cardOrTactic.effectKind || cardOrTactic.kind)) || "";
      let score = 0;
      if (target && target.side === status.enemy) {
        const cell = getCellAt(target.pos);
        if (cell && cell.ps && cell.control === target.side) score += 14;
        if (botEnemyCanContestControlledPsNextTurn(player, target)) score += 9;
        if (status.hqDanger && hexDistance(target.pos, status.ownHq.pos) <= QG_THREAT_RANGE) score += 10;
      }
      const emergencyKinds = ["stun_disable","stun_unit","inhibit_attack","damage_unit","damage_bonus_vs_vehicle","damage_structure","set_defense_to_one","set_def_to_one_round","destroy_non_unique_unit","bounce_unit_to_owner_hand_clean","convert_isolated_enemy_infantry","cell_movement_trap","temporary_block_cell","vegetal_anathema_trap","bramble_path_trap","spawn_two_militia","spawn_predone_with_temp_vanguard","spawn_clan_reinforcements","spawn_militia_around_commander"];
      const lowImpactValueKinds = ["mutual_draw_conditional_steal","usury_energy_income_debuff","block_enemy_hand_cards_by_ps","bounty_copy_on_death","enemy_kill_gives_fabeot_energy","contractTrap","logisticChoke"];
      if (emergencyKinds.includes(kind)) score += 5;
      if (lowImpactValueKinds.includes(kind) && score <= 0) score -= 8;
      return score;
    }

function botClosestEnemyDistanceToCoord(player, coord) {
      const enemies = combatUnits(enemyOf(player));
      if (!coord || !enemies.length) return 99;
      return Math.min(...enemies.map(e => hexDistance(e.pos, coord)));
    }

function botControlledPsPosture(player, psCell) {
      const strategic = evaluateBotStrategicState(player);
      const d = botClosestEnemyDistanceToCoord(player, psCell.coord);
      const immediate = combatUnits(enemyOf(player)).some(e => botEnemyCanThreatenCell(e, psCell.coord) || hexDistance(e.pos, psCell.coord) <= 2);
      if (immediate || d <= 2) return "clearThreat";
      if (d <= 3) return "fortify";
      if (strategic.posture === "vantaggio" && strategic.unitDelta >= 0 && strategic.incomeDelta >= 0) return "expand";
      return "hold";
    }

function botControlledPsDoctrineBonus(unit, coord, status=strategicStatus(unit.side)) {
      const player = unit.side;
      const psList = controlledPsCells(player);
      if (!psList.length) return 0;
      let score = 0;
      for (const ps of psList) {
        const posture = botControlledPsPosture(player, ps);
        const d = hexDistance(coord, ps.coord);
        const nearEnemies = enemiesNear(ps.coord, player, 3);
        if (posture === "clearThreat") {
          const threatTargets = nearEnemies.map(e => e.pos);
          if (threatTargets.length) score += Math.max(0, 24 - minDistance(coord, threatTargets) * 5);
          if (d <= 1) score += botUnitIsSacrificial(unit) ? 8 : 4;
        } else if (posture === "fortify") {
          if (botUnitIsSacrificial(unit)) {
            if (d === 1) score += 12;
            if (d === 0) score += 6;
          } else {
            if (d === 1 || d === 2) score += 8;
            if (unit.ability && !unit.ability.passive && (unit.ability.range || 1) >= 2) score += d <= 2 ? 5 : 0;
            if (unit.type === "Struttura" && d <= 1) score += 9;
          }
        } else if (posture === "expand") {
          if (d <= 1 && botUnitIsValuable(unit)) score -= 2;
          const enemyHq = getHq(enemyOf(player));
          score += Math.max(0, 14 - hexDistance(coord, enemyHq.pos) * 2.1);
        } else {
          if (d <= 1 && !botUnitIsValuable(unit)) score += 4;
        }
      }
      return score;
    }

function botQGRaidSupportCount(player, coord) {
      const enemyHq = getHq(enemyOf(player));
      return combatUnits(player).filter(u => hexDistance(u.pos, enemyHq.pos) <= 5 || hexDistance(u.pos, coord) <= 2).length;
    }

function botVictoryDoctrineMoveBonus(unit, coord, status=strategicStatus(unit.side)) {
      if (!status || !(status.pressureWinPlan || status.qgWinPlan || status.enemyPressurePlan)) return 0;
      const player = unit.side;
      let score = 0;
      const cell = getCellAt(coord);
      if (status.pressureWinPlan) {
        const psTargets = state.cells.filter(c => c.ps).map(c => c.coord);
        score += Math.max(0, 20 - minDistance(coord, psTargets) * 3.8);
        if (cell && cell.ps) score += cell.control === player ? 10 : 15;
        score += botClosePressureLockBonus(unit, coord, status) * 0.75;
        if (botUnitIsValuable(unit) && enemiesNear(coord, player, 2).length > 1 && !status.allIn) score -= 4;
      }
      if (status.qgWinPlan) {
        const enemyHq = getHq(enemyOf(player));
        const support = botQGRaidSupportCount(player, coord);
        score += Math.max(0, 24 - hexDistance(coord, enemyHq.pos) * 4);
        if (sameCoord(coord, enemyHq.pos)) score += (status.qgImmediateMove || status.qgImmediateOccupy || support >= 2) ? 44 : 15;
        if (support < 2 && hexDistance(coord, enemyHq.pos) <= 3) score -= botUnitIsSacrificial(unit) ? 2 : 8;
        if (status.closePressureLock && !(status.qgImmediateMove || status.qgImmediateOccupy)) score -= 26;
      }
      if (status.enemyPressurePlan) {
        const center = centerPsCell();
        const home = homePsCell(player);
        const targets = [center && center.coord, home && home.coord].filter(Boolean);
        if (targets.length) score += Math.max(0, 28 - minDistance(coord, targets) * 5);
        if (cell && cell.ps && cell.control !== player) score += 18;
      }
      return score;
    }

function botOpeningDoctrineMoveBonus(unit, coord, status=strategicStatus(unit.side)) {
      if (!botOpeningDoctrineActive()) return 0;
      const player = unit.side;
      let score = 0;
      const home = homePsCell(player);
      const center = centerPsCell();
      const cell = getCellAt(coord);
      if (home && !homePsControlled(player)) {
        score += Math.max(0, 34 - hexDistance(coord, home.coord) * 7);
        if (sameCoord(coord, home.coord)) score += 60;
      }
      if (center && center.control !== player) {
        score += Math.max(0, 32 - hexDistance(coord, center.coord) * 6);
        if (sameCoord(coord, center.coord)) score += unit.type === "Struttura" ? 90 : 65;
        if (hexDistance(coord, center.coord) === 1) score += 10;
      }
      if (cell && cell.ps && unit.type === "Struttura") score += 25;
      if (unit.type === "Comandante" && combatUnits(player).some(u => u.uid !== unit.uid && u.type !== "Comandante")) score -= 20;
      return score;
    }

function botGeneralDoctrineMoveBonus(unit, coord, status=strategicStatus(unit.side)) {
      if (!advancedAiEnabled() || !unit || !coord) return 0;
      let score = 0;
      score += botOpeningDoctrineMoveBonus(unit, coord, status);
      score += botControlledPsDoctrineBonus(unit, coord, status);
      score += botVictoryDoctrineMoveBonus(unit, coord, status);
      score += botPsSupportGateBonus(unit, coord, status);
      score += botPsAdjacentStagingBonus(unit, coord, status);
      score += botObjectiveRecoveryBonus(unit, coord, status);
      score += botSuperiorDoctrineMoveBonus(unit, coord, status);
      score += botNexusMoveDoctrineBonus(unit, coord, status);
      score += botExordiumMoveDoctrineBonus(unit, coord, status);
      score += botLibertiMoveDoctrineBonus(unit, coord, status);
      score += botAgathoiMoveDoctrineBonus(unit, coord, status);
      score += botFabeotMoveDoctrineBonus(unit, coord, status);
      score -= botCellDangerPenalty(unit.side, coord, unit, status);
      score += botCellOpportunityBonus(unit.side, coord);
      score -= botDoctrineExposurePenalty(unit, coord, status);
      score -= botPsSupportGatePenalty(unit, coord, status);
      if (status && status.hqDanger) {
        const ownHq = getHq(unit.side);
        score += Math.max(0, 18 - hexDistance(coord, ownHq.pos) * 4);
        score += botQGAccessBlockBonus(unit.side, coord, unit, status) * 0.9;
        if (botUnitIsSacrificial(unit) && hexDistance(coord, ownHq.pos) <= 1) score += 7;
      }
      if (status && status.closePressureLock) score += botClosePressureLockBonus(unit, coord, status) * 0.65;
      return score;
    }

function botGeneralDoctrineCoordBonus(player, bp, coord, status=strategicStatus(player)) {
      if (!advancedAiEnabled() || !bp || !coord) return 0;
      const fake = botFakeUnitForCoord(player, bp, coord);
      let score = botGeneralDoctrineMoveBonus(fake, coord, status);
      const cell = getCellAt(coord);
      score -= botCellDangerPenalty(player, coord, bp, status) * 0.85;
      score += botCellOpportunityBonus(player, coord);
      if (botOpeningDoctrineActive()) {
        if (bp.cost <= 1 && bp.type !== "Struttura") score += 6;
        if (bp.cost === 2 && combatUnits(player).length <= 1) score += 4;
        if (bp.cost === 3 && combatUnits(player).length <= 1) score += 3;
        if (bp.type === "Struttura" && cell && cell.ps) score += 30;
      }
      if (status && status.hqDanger) {
        const ownHq = getHq(player);
        if (hexDistance(coord, ownHq.pos) <= 1) score += bp.type === "Struttura" ? 22 : (botBlueprintIsSacrificial(bp) ? 12 : 7);
        score += botQGAccessBlockBonus(player, coord, bp, status) * 0.75;
      }
      if (status && status.closePressureLock) score += botClosePressureLockBonus(fake, coord, status) * 0.55;
      score += botPsSupportGateBonus(fake, coord, status) * 0.7;
      score += botPsAdjacentStagingBonus(fake, coord, status) * 0.5;
      score += botNexusCoordDoctrineBonus(player, bp, coord, status) * 0.85;
      score += botExordiumCoordDoctrineBonus(player, bp, coord, status) * 0.85;
      score += botLibertiCoordDoctrineBonus(player, bp, coord, status) * 0.85;
      score += botAgathoiCoordDoctrineBonus(player, bp, coord, status) * 0.85;
      score += botFabeotCoordDoctrineBonus(player, bp, coord, status) * 0.85;
      score += botSuperiorDoctrineCoordBonus(player, bp, coord, status) * 0.85;
      score -= botPsSupportGatePenalty(fake, coord, status) * 0.7;
      if (botBlueprintIsValuable(bp) && !status.allIn) score -= botThreatPenalty(player, coord, fake) * 0.15;
      return score;
    }


// =====================================================
// C2e-4h – Superior Doctrine Calibration
// Lezioni umano-vs-bot integrate come layer di scoring matchup.
// Non modifica regole, stat, costi, roster, deck o mappa.
// Questo layer colora le decisioni dopo l'arbitraggio strategico C2e-4g:
// emergenze/QG/pressione restano dominanti; qui si insegna dottrina competente.
// =====================================================
function botSuperiorDoctrineEnemyFaction(player) {
      const enemy = enemyOf(player);
      return state && state.factions ? state.factions[enemy] : null;
    }

function botSuperiorDoctrineName(unitOrBp) { return String(unitOrBp && unitOrBp.name || "").toLowerCase(); }
function botSuperiorDoctrineNearPs(coord, range=1) { return Boolean(coord && state.cells.some(c => c.ps && hexDistance(c.coord, coord) <= range)); }
function botSuperiorDoctrineCenterDistance(coord) { const c = centerPsCell(); return c && coord ? hexDistance(coord, c.coord) : 99; }
function botSuperiorDoctrineIsCenterOrAdjacent(coord) { return botSuperiorDoctrineCenterDistance(coord) <= 1; }
function botSuperiorDoctrineCellPsValue(player, coord) {
      const cell = getCellAt(coord);
      if (!cell || !cell.ps) return 0;
      if (cell.control === player) return 10;
      if (cell.control === enemyOf(player)) return 18;
      return 14;
    }
function botSuperiorDoctrineEarlyTurn() { return state && state.turn <= 7; }
function botSuperiorDoctrineEnemyLowBoard(player) { return combatUnits(enemyOf(player)).filter(u => u.type !== "QG").length <= 3; }
function botSuperiorDoctrineEnemyAtZeroPs(player) { return countControlledPS(enemyOf(player)) <= 0; }

function botSuperiorExordiumTempoUnit(unitOrBp) {
      if (!unitOrBp || unitOrBp.faction !== "Exordium") return false;
      const n = botSuperiorDoctrineName(unitOrBp);
      return unitOrBp.cost <= 2 || unitOrBp.weight === "Leggera" || /guardia di aurex|cursor|veicolo ricognitore|carro leggero/.test(n);
    }
function botSuperiorExordiumAnchorStructure(unitOrBp) {
      if (!unitOrBp || unitOrBp.faction !== "Exordium" || unitOrBp.type !== "Struttura") return false;
      const n = botSuperiorDoctrineName(unitOrBp);
      return /bastione armato|caserma|avamposto|torretta/.test(n) || unitOrBp.type === "Struttura";
    }
function botSuperiorNexusSeedUnit(unit) {
      if (!unit || unit.faction !== "Nexus") return false;
      const n = botSuperiorDoctrineName(unit);
      return /drone geniere|fante robot|droide|drone|droide di sicurezza|quad ricognitore/.test(n);
    }
function botSuperiorNexusDecisiveStructure(unit) {
      if (!unit || unit.faction !== "Nexus" || unit.type !== "Struttura") return false;
      const n = botSuperiorDoctrineName(unit);
      return /bunker|fabbrica|nodo|torre|barriera|rete/.test(n);
    }
function botSuperiorLibertiSwarmThreat(unit) {
      if (!unit || unit.faction !== "Liberti") return false;
      const n = botSuperiorDoctrineName(unit);
      return /miliziano|predone|avanguardia|buggy|moto|raccolta/.test(n) || unit.weight === "Leggera";
    }
function botSuperiorFabeotMassUnit(unitOrBp) {
      if (!unitOrBp || unitOrBp.faction !== "Fabeot") return false;
      const n = botSuperiorDoctrineName(unitOrBp);
      return (unitOrBp.cost || 0) <= 2 || /adepto|inseguitore|lancia fabeot|spia/.test(n);
    }
function botSuperiorFabeotPlatform(unitOrBp) {
      if (!unitOrBp || unitOrBp.faction !== "Fabeot") return false;
      return /avamposto fabeot|sportello|matrice|cabina|cittadella/.test(botSuperiorDoctrineName(unitOrBp));
    }
function botSuperiorAgathoiRootStructure(unitOrBp) {
      if (!unitOrBp || unitOrBp.faction !== "Agathoi" || unitOrBp.type !== "Struttura") return false;
      return /bastione di pietra viva|tholos|cisterna|radura|peribolos|domos|ekklesion|selva/.test(botSuperiorDoctrineName(unitOrBp));
    }
function botSuperiorAgathoiDeterrent(unitOrBp) {
      if (!unitOrBp || unitOrBp.faction !== "Agathoi") return false;
      const n = botSuperiorDoctrineName(unitOrBp);
      return unitOrBp.passiveThorns || unitOrBp.guardThornsOnIdle || /custode|theron|apheton|oplita|aratro|lancia verde/.test(n) || (unitOrBp.ability && ["armorThorns","agoraOrders","primarchMandate","damageShred"].includes(unitOrBp.ability.kind));
    }

function botSuperiorDoctrineMoveBonus(unit, coord, status=strategicStatus(unit.side)) {
      if (!advancedAiEnabled() || !unit || !coord || !status) return 0;
      const player = unit.side;
      const enemyFaction = botSuperiorDoctrineEnemyFaction(player);
      const cell = getCellAt(coord);
      let score = 0;

      if (unit.faction === "Exordium" && enemyFaction === "Nexus") {
        if (botSuperiorDoctrineEarlyTurn()) {
          score += Math.max(0, 26 - botSuperiorDoctrineCenterDistance(coord) * 5.5);
          if (cell && cell.ps && cell.control !== player) score += 18;
          if (botSuperiorExordiumTempoUnit(unit) && botSuperiorDoctrineNearPs(coord, 1)) score += 8;
        }
        if (botSuperiorDoctrineEnemyAtZeroPs(player)) {
          const enemyHq = getHq(status.enemy);
          if (enemyHq) score += Math.max(0, 20 - hexDistance(coord, enemyHq.pos) * 3.2);
          if (cell && cell.ps) score += cell.control === player ? 10 : 16;
        }
        if (botSuperiorExordiumTempoUnit(unit)) {
          score += botSuperiorDoctrineCellPsValue(player, coord) * 0.8;
          if (status.enemyHq && hexDistance(coord, status.enemyHq.pos) <= 3 && countControlledPS(player) >= 1) score += 5;
        }
      }

      if (unit.faction === "Exordium" && enemyFaction === "Liberti") {
        if (botSuperiorDoctrineEarlyTurn()) {
          score += Math.max(0, 24 - botSuperiorDoctrineCenterDistance(coord) * 5);
          if (botSuperiorExordiumTempoUnit(unit)) score += botSuperiorDoctrineNearPs(coord, 1) ? 8 : 2;
        }
        if (cell && cell.ps && cell.control !== player) score += 18;
        if (botSuperiorDoctrineEnemyAtZeroPs(player)) {
          if (cell && cell.ps && cell.control === player) score += 10;
          if (status.enemyHq && hexDistance(coord, status.enemyHq.pos) <= 4 && botSuperiorExordiumTempoUnit(unit)) score += botSuperiorDoctrineEnemyLowBoard(player) ? 14 : 6;
        }
      }

      if (unit.faction === "Fabeot" && enemyFaction === "Exordium") {
        if (botSuperiorDoctrineEarlyTurn() && botSuperiorFabeotMassUnit(unit)) {
          score += Math.max(0, 24 - botSuperiorDoctrineCenterDistance(coord) * 5);
          if (cell && cell.ps && cell.control !== player) score += 20;
        }
        if (countControlledPS(player) <= 0) {
          const psTargets = state.cells.filter(c => c.ps && c.control !== player).map(c => c.coord);
          if (psTargets.length) score += Math.max(0, 28 - minDistance(coord, psTargets) * 5.5);
          if (status.enemyHq && hexDistance(coord, status.enemyHq.pos) <= 3 && !(cell && cell.ps)) score -= botFabeotIsBaitUnit(unit) ? 2 : 10;
        } else if (cell && cell.ps && cell.control === player) {
          score += 10; // tenere il primo PS 1-2 turni prima del teatro QG.
        }
      }

      if (unit.faction === "Agathoi" && enemyFaction === "Nexus") {
        const center = centerPsCell();
        if (center) {
          score += Math.max(0, 30 - hexDistance(coord, center.coord) * 5.2);
          if (cell && cell.ps && sameCoord(cell.coord, center.coord)) score += 24;
          if (botSuperiorDoctrineIsCenterOrAdjacent(coord)) score += unit.type === "Struttura" || unit.canBuild ? 14 : 7;
        }
        if (botSuperiorAgathoiDeterrent(unit) && controlledPsCells(player).some(ps => hexDistance(coord, ps.coord) <= 1)) score += 8;
        if ((state.energy && state.energy[player] || 0) >= 6 && countControlledPS(player) >= 1) {
          if (status.enemyHq) score += Math.max(0, 18 - hexDistance(coord, status.enemyHq.pos) * 2.5);
          if (cell && cell.ps && cell.control !== player) score += 12;
        }
      }

      return score;
    }

function botSuperiorDoctrineCoordBonus(player, unitOrBp, coord, status=strategicStatus(player)) {
      if (!advancedAiEnabled() || !unitOrBp || !coord) return 0;
      const faction = state.factions[player];
      const enemyFaction = botSuperiorDoctrineEnemyFaction(player);
      const fake = unitOrBp.side ? unitOrBp : botFakeUnitForCoord(player, unitOrBp, coord);
      const cell = getCellAt(coord);
      let score = botSuperiorDoctrineMoveBonus(fake, coord, status) * 0.75;

      if (faction === "Exordium" && enemyFaction === "Nexus") {
        if (botSuperiorExordiumAnchorStructure(unitOrBp)) {
          if (cell && cell.ps) score += 34;
          if (botSuperiorDoctrineIsCenterOrAdjacent(coord)) score += 20;
          if (botSuperiorDoctrineEarlyTurn() && botSuperiorDoctrineNearPs(coord, 1)) score += 12;
        }
      }
      if (faction === "Exordium" && enemyFaction === "Liberti") {
        if (botSuperiorExordiumAnchorStructure(unitOrBp) && botSuperiorDoctrineNearPs(coord, 1)) score += cell && cell.ps ? 30 : 16;
        if (botSuperiorExordiumTempoUnit(unitOrBp) && botSuperiorDoctrineEarlyTurn() && botSuperiorDoctrineNearPs(coord, 1)) score += 7;
      }
      if (faction === "Fabeot" && enemyFaction === "Exordium") {
        if (botSuperiorFabeotPlatform(unitOrBp)) {
          if (cell && cell.ps) score += 22;
          if (botSuperiorDoctrineNearPs(coord, 1)) score += 18;
          if (botSuperiorDoctrineIsCenterOrAdjacent(coord)) score += 10;
        }
        if (countControlledPS(player) <= 0 && botSuperiorFabeotMassUnit(unitOrBp) && cell && cell.ps && cell.control !== player) score += 18;
      }
      if (faction === "Agathoi" && enemyFaction === "Nexus") {
        if (botSuperiorAgathoiRootStructure(unitOrBp)) {
          if (cell && cell.ps) score += 38;
          if (botSuperiorDoctrineIsCenterOrAdjacent(coord)) score += 28;
          if (botSuperiorDoctrineNearPs(coord, 1)) score += 18;
        }
        if (unitOrBp.canBuild && botSuperiorDoctrineIsCenterOrAdjacent(coord)) score += 10;
      }
      return score;
    }

function botSuperiorDoctrineTargetBonus(player, enemyUnit, status=strategicStatus(player)) {
      if (!advancedAiEnabled() || !enemyUnit || enemyUnit.side === player) return 0;
      const faction = state.factions[player];
      const enemyFaction = state.factions[enemyOf(player)];
      const cell = getCellAt(enemyUnit.pos);
      const nearPs = botSuperiorDoctrineNearPs(enemyUnit.pos, 1);
      const n = botSuperiorDoctrineName(enemyUnit);
      let score = 0;

      if (faction === "Exordium" && enemyFaction === "Nexus") {
        if (botSuperiorNexusSeedUnit(enemyUnit) && (nearPs || (cell && cell.ps))) score += 18;
        if (/drone geniere/.test(n)) score += nearPs ? 24 : 10;
        if (botSuperiorNexusDecisiveStructure(enemyUnit)) score += nearPs ? 22 : 9;
        if (cell && cell.ps && cell.control === enemyUnit.side) score += 16;
      }
      if (faction === "Exordium" && enemyFaction === "Liberti") {
        if (cell && cell.ps && cell.control === enemyUnit.side) score += 26;
        if (botSuperiorLibertiSwarmThreat(enemyUnit)) score += nearPs ? 14 : 6;
        if (/avanguardia/.test(n)) score += 14;
        if (/miliziano/.test(n) && effectiveLife(enemyUnit) <= 3) score += 8;
        if (/predone|buggy|moto/.test(n) && status.ownHq && hexDistance(enemyUnit.pos, status.ownHq.pos) <= QG_THREAT_RANGE + 1) score += 12;
        if (enemyUnit.type === "Struttura" && nearPs) score += 12;
      }
      if (faction === "Fabeot" && enemyFaction === "Exordium") {
        if (cell && cell.ps && cell.control === enemyUnit.side) score += 20;
        if (/carro medio|legionario|guardia|testudo|iupiter|aurex/.test(n)) score += nearPs ? 14 : 6;
        if ((enemyUnit.currentDef || 0) <= 0 || enemyUnit.currentHp < enemyUnit.maxHp) score += 6;
        if (botEnemyCanContestControlledPsNextTurn(player, enemyUnit)) score += 9;
      }
      if (faction === "Agathoi" && enemyFaction === "Nexus") {
        if (/drone geniere/.test(n)) score += 24;
        if (botSuperiorNexusSeedUnit(enemyUnit) && nearPs) score += 12;
        if (botSuperiorNexusDecisiveStructure(enemyUnit)) score += nearPs ? 20 : 8;
        if (cell && cell.ps && cell.control === enemyUnit.side) score += 16;
      }
      return score;
    }

function botSuperiorDoctrinePurchaseBonus(player, bp, field, enemyField, enemyNearHq, status=strategicStatus(player)) {
      if (!advancedAiEnabled() || !bp) return 0;
      const faction = state.factions[player];
      const enemyFaction = botSuperiorDoctrineEnemyFaction(player);
      const n = botSuperiorDoctrineName(bp);
      let score = 0;
      if (faction === "Exordium" && enemyFaction === "Nexus") {
        if (botSuperiorDoctrineEarlyTurn() && botSuperiorExordiumTempoUnit(bp)) score += 7;
        if (botSuperiorExordiumAnchorStructure(bp) && countControlledPS(player) >= 1) score += 9;
        if (botSuperiorExordiumAnchorStructure(bp) && state.turn <= 8) score += 5;
        if (status.ownPs >= 1 && status.enemyPs <= 0 && (bp.type === "Veicolo" || botSuperiorExordiumTempoUnit(bp))) score += 5;
      }
      if (faction === "Exordium" && enemyFaction === "Liberti") {
        if (botSuperiorDoctrineEarlyTurn() && botSuperiorExordiumTempoUnit(bp)) score += 8;
        if (botSuperiorExordiumAnchorStructure(bp) && countControlledPS(player) >= 1) score += 8;
        if (/cursor|carro leggero|guardia di aurex|veicolo ricognitore/.test(n)) score += 5;
      }
      if (faction === "Fabeot" && enemyFaction === "Exordium") {
        if (countControlledPS(player) <= 0 && (botSuperiorFabeotMassUnit(bp) || bp.type === "Struttura")) score += 8;
        if (botSuperiorFabeotPlatform(bp) && (countControlledPS(player) >= 1 || field.length >= 2)) score += 8;
        if (/agente sabotatore/.test(n) && enemyField.some(e => effectiveLife(e) <= 4 || isOnPS(e))) score += 7;
        if (/emissario|matrice|embargo|contratto/.test(n) && countControlledPS(player) <= 0) score -= 5;
      }
      if (faction === "Agathoi" && enemyFaction === "Nexus") {
        if (botSuperiorAgathoiRootStructure(bp)) score += countControlledPS(player) >= 1 ? 8 : 5;
        if (bp.canBuild && botSuperiorDoctrineEarlyTurn()) score += 8;
        if ((state.energy && state.energy[player] || 0) >= 6 && (bp.weight === "Pesante" || bp.weight === "Elite" || bp.weight === "Pivot" || bp.type === "Veicolo")) score += 6;
        if (/custode|theron|apheton|aratro|karyon/.test(n)) score += enemyField.some(e => e.faction === "Nexus" && botSuperiorDoctrineNearPs(e.pos, 2)) ? 5 : 2;
      }
      return score;
    }

function botSuperiorDoctrineTacticBonus(player, tactic, target, status=strategicStatus(player)) {
      if (!advancedAiEnabled() || !tactic) return 0;
      const faction = state.factions[player];
      const enemyFaction = botSuperiorDoctrineEnemyFaction(player);
      const kind = tactic.effectKind || tactic.kind || "";
      let score = 0;
      if (faction === "Exordium" && tactic.kind === "warPush") {
        if (target && target.side === player && target.type === "Veicolo") {
          const enemyHq = getHq(enemyOf(player));
          if (enemyHq && countControlledPS(player) >= 1) {
            const d = hexDistance(target.pos, enemyHq.pos);
            if (d <= 3) score += 16;
            else if (d <= 5 && (enemyFaction === "Nexus" || botSuperiorDoctrineEnemyLowBoard(player))) score += 7;
          }
        }
      }
      if (faction === "Exordium" && tactic.kind === "assaultOrder" && target && target.side === player) {
        const adjStrategic = combatUnits(enemyOf(player)).some(e => areAdjacent(target.pos, e.pos) && (isOnPS(e) || e.type === "Struttura" || botSuperiorNexusSeedUnit(e) || botSuperiorLibertiSwarmThreat(e)));
        if (adjStrategic) score += 8;
      }
      if (faction === "Fabeot") {
        const hasNoPs = countControlledPS(player) <= 0;
        if (tactic.kind === "logisticChoke" && target && target.side === enemyOf(player)) {
          if (isOnPS(target) || botEnemyCanContestControlledPsNextTurn(player, target) || /carro medio|legionario|guardia|testudo/.test(botSuperiorDoctrineName(target))) score += 10;
          if (hasNoPs && !isOnPS(target) && !botEnemyCanContestControlledPsNextTurn(player, target)) score -= 5;
        }
        if (tactic.kind === "contractTrap" && hasNoPs) score -= 8;
        if (["mutual_draw_conditional_steal","usury_energy_income_debuff","block_enemy_hand_cards_by_ps","bounty_copy_on_death"].includes(kind) && hasNoPs && !(target && isOnPS(target))) score -= 6;
        if (kind === "block_enemy_hand_cards_by_ps" && countControlledPS(player) >= 2) score += 8;
        if (["stun_unit","bounce_unit_to_owner_hand_clean","convert_isolated_enemy_infantry","next_attack_ignore_defense","grant_stun_on_basic_attack"].includes(kind) && target) {
          if (target.side === enemyOf(player) && (isOnPS(target) || botEnemyCanContestControlledPsNextTurn(player, target))) score += 9;
        }
      }
      if (faction === "Agathoi" && enemyFaction === "Nexus") {
        if (tactic.kind === "defensiveRoots" && target && target.side === player && (isOnPS(target) || botSuperiorDoctrineNearPs(target.pos, 1))) score += 8;
        if (tactic.kind === "greenWall" && controlledPsCells(player).length >= 1) score += 4;
        if (kind === "structure_income_seed") {
          if (target && target.side === player && target.type === "Struttura") {
            const safe = enemiesNear(target.pos, player, 2).length <= 1 || /domos|cisterna|bastione|tholos/.test(botSuperiorDoctrineName(target));
            score += safe ? 10 : -8;
          }
        }
      }
      return score;
    }

function botSuperiorDoctrineAbilityBonus(unit, target, ab, status=strategicStatus(unit.side)) {
      if (!advancedAiEnabled() || !unit || !ab || !target) return 0;
      const faction = unit.faction;
      const enemyFaction = botSuperiorDoctrineEnemyFaction(unit.side);
      let score = 0;
      if (faction === "Fabeot" && enemyFaction === "Exordium") {
        if (["corruptLightInfantry","convertEnemy"].includes(ab.kind) && target.side !== unit.side) {
          if (isOnPS(target) || botEnemyCanContestControlledPsNextTurn(unit.side, target)) score += 10;
          else score += 3;
        }
        if (ab.kind === "deceptivePositioning") score += countControlledPS(unit.side) <= 0 ? 5 : 3;
        if (ab.kind === "vulnerableMark" && target.side !== unit.side) {
          if (isOnPS(target) || target.type === "Struttura" || target.weight === "Pesante" || target.weight === "Elite" || target.weight === "Pivot" || target.type === "Comandante") score += 8;
          if (target.weight === "Leggera" && effectiveLife(target) <= 2) score -= 5;
        }
        if (ab.kind === "cleansePositive" && target.side !== unit.side) {
          if (effectiveLife(target) <= 4 || isOnPS(target)) score += 7;
        }
      }
      if (faction === "Agathoi" && enemyFaction === "Nexus") {
        if (["armorThorns","agoraOrders","primarchMandate"].includes(ab.kind) && target.side === unit.side && (isOnPS(target) || botSuperiorDoctrineNearPs(target.pos, 1))) score += 7;
        if (["damageShred","shred","damage"].includes(ab.kind) && target.side !== unit.side && (botSuperiorNexusSeedUnit(target) || botSuperiorNexusDecisiveStructure(target) || isOnPS(target))) score += 7;
      }
      if (faction === "Exordium") {
        if (["shred","damage","damageShred","varranOrder","nemiraCommand"].includes(ab.kind) && target.side !== unit.side) {
          if (isOnPS(target) || target.type === "Struttura") score += 5;
          if (enemyFaction === "Nexus" && (botSuperiorNexusSeedUnit(target) || botSuperiorNexusDecisiveStructure(target))) score += 5;
          if (enemyFaction === "Liberti" && botSuperiorLibertiSwarmThreat(target)) score += 5;
        }
      }
      return score;
    }

function botTargetPriorityBonus(player, enemyUnit, status=strategicStatus(player)) {
      if (!enemyUnit || enemyUnit.side === player) return 0;
      let score = 0;
      const ownHq = getHq(player);
      const cell = getCellAt(enemyUnit.pos);
      if (ownHq && hexDistance(enemyUnit.pos, ownHq.pos) <= QG_THREAT_RANGE) score += 18 + Math.min(14, botEnemyQGThreatWeight(enemyUnit, player) * 0.55);
      if (cell && cell.ps) score += cell.control === enemyUnit.side ? 14 : 9;
      if (status && botClosePressureLockActive(status) && botEnemyCanContestControlledPsNextTurn(player, enemyUnit)) score += 20;
      if (status && (status.pressureEmergency || status.zeroPsRecovery) && cell && cell.ps && cell.control === enemyUnit.side) score += 22;
      if (status && (status.pressureEmergency || status.zeroPsRecovery) && botEnemyCanContestControlledPsNextTurn(player, enemyUnit)) score += 12;
      if (status && status.centerLostEarly && status.center && sameCoord(enemyUnit.pos, status.center.coord)) score += 18;
      if (enemyUnit.ability && !enemyUnit.ability.passive) score += 3;
      if (enemyUnit.type === "Struttura") {
        score += 4;
        const nearPs = state.cells.some(c => c.ps && hexDistance(c.coord, enemyUnit.pos) <= 1);
        if (nearPs) score += 9;
        const n = String(enemyUnit.name || "").toLowerCase();
        if (/bunker|nodo|fabbrica|torre|rete|avamposto|cittadella|matrice|sportello|caserma/.test(n)) score += nearPs ? 8 : 3;
      }
      if (enemyUnit.type === "Comandante") score += 5;
      if (status && status.allIn && isStrategicEnemyTarget(player, enemyUnit, status)) score += 12;
      score += botNexusTargetPriorityBonus(player, enemyUnit, status);
      score += botExordiumAntiNexusTargetBonus(player, enemyUnit, status);
      score += botLibertiTargetPriorityBonus(player, enemyUnit, status);
      score += botAgathoiTargetPriorityBonus(player, enemyUnit, status);
      score += botFabeotTargetPriorityBonus(player, enemyUnit, status);
      score += botSuperiorDoctrineTargetBonus(player, enemyUnit, status);
      return score;
    }


// =====================================================
// C2e-4c – Nexus Strategic Profile / Structure Discipline
// =====================================================
function botIsNexusPlayer(player) { return state && state.factions && state.factions[player] === "Nexus"; }

function botNexusCoreStructure(unitOrBp) {
      if (!unitOrBp || unitOrBp.faction !== "Nexus") return false;
      if (unitOrBp.type !== "Struttura") return false;
      const n = String(unitOrBp.name || "").toLowerCase();
      return /bunker|nodo|fabbrica|torre|barriera|rete|comando/.test(n) || true;
    }

function botNexusStructureCountNear(player, coord, range=1) {
      if (!coord) return 0;
      return combatUnits(player).filter(u => u.faction === "Nexus" && u.type === "Struttura" && hexDistance(u.pos, coord) <= range).length;
    }

function botNexusPsNetworkTargets(player, status=strategicStatus(player)) {
      const targets = [];
      const center = centerPsCell();
      const home = homePsCell(player);
      if (status && (status.zeroPsRecovery || status.pressureEmergency || status.enemyPressurePlan || status.defendQGRecovery)) targets.push(...botObjectiveRecoveryTargets(player, status));
      if (home && home.control !== player) targets.push(home.coord);
      if (center && center.control !== player) targets.push(center.coord);
      for (const c of controlledPsCells(player)) {
        targets.push(c.coord);
        for (const n of state.cells.filter(x => hexDistance(x.coord, c.coord) === 1)) targets.push(n.coord);
      }
      if (!targets.length) targets.push(...state.cells.filter(c => c.ps).map(c => c.coord));
      return uniqueCoords(targets);
    }

function botNexusNetworkSupportScore(player, coord) {
      if (!botIsNexusPlayer(player) || !coord) return 0;
      let score = 0;
      const controlled = controlledPsCells(player);
      if (controlled.length) {
        const d = minDistance(coord, controlled.map(c => c.coord));
        score += Math.max(0, 8 - d * 2.2);
        if (controlled.some(c => hexDistance(coord, c.coord) === 1)) score += 5;
      }
      const structures = combatUnits(player).filter(u => u.faction === "Nexus" && u.type === "Struttura");
      if (structures.length) {
        const d = Math.min(...structures.map(s => hexDistance(coord, s.pos)));
        score += Math.max(0, 6 - d * 1.6);
      }
      const cell = getCellAt(coord);
      if (cell && cell.ps) score += cell.control === player ? 8 : 12;
      return score;
    }

function botNexusStructureDisciplinePenalty(player, bp, coord, status=strategicStatus(player)) {
      if (!botIsNexusPlayer(player) || !bp || bp.type !== "Struttura" || !coord || (status && status.hqDanger)) return 0;
      const ownStructures = combatUnits(player).filter(u => u.faction === "Nexus" && u.type === "Struttura");
      const psCoords = state.cells.filter(c => c.ps).map(c => c.coord);
      const distPs = psCoords.length ? minDistance(coord, psCoords) : 99;
      let penalty = 0;
      if (distPs >= 3 && !(status && (status.qgWinPlan || status.pressureWinPlan))) penalty += 10;
      if (distPs >= 4) penalty += 8;
      const nearStruct = ownStructures.filter(s => hexDistance(s.pos, coord) <= 1).length;
      if (nearStruct >= 2 && !state.cells.some(c => c.ps && hexDistance(c.coord, coord) <= 1)) penalty += 7 + (nearStruct - 1) * 3;
      if (ownStructures.length >= 4 && !(status && (status.zeroPsRecovery || status.pressureEmergency || status.defendQGRecovery))) penalty += 4;
      return penalty;
    }

function botNexusMoveDoctrineBonus(unit, coord, status=strategicStatus(unit.side)) {
      if (!advancedAiEnabled() || !unit || unit.faction !== "Nexus" || !coord) return 0;
      const player = unit.side;
      const cell = getCellAt(coord);
      const targets = botNexusPsNetworkTargets(player, status);
      let score = 0;
      if (targets.length) score += Math.max(0, 22 - minDistance(coord, targets) * 4.4);
      score += botNexusNetworkSupportScore(player, coord);
      if (cell && cell.ps) {
        if (cell.control === player) score += unit.type === "Struttura" ? 20 : 10;
        else score += status.zeroPsRecovery || status.pressureEmergency ? 34 : 16;
      }
      if (unit.type === "Struttura") {
        // Nexus deve presidiare e irrobustire rete PS, non inseguire linee aggressive senza supporto.
        if (state.cells.some(c => c.ps && hexDistance(c.coord, coord) <= 1)) score += 12;
        if (botNexusStructureCountNear(player, coord, 1) >= 2 && !(cell && cell.ps)) score -= 6;
      } else if (unit.weight === "Pesante" || unit.weight === "Elite" || unit.weight === "Pivot") {
        if (botNexusStructureCountNear(player, coord, 2) > 0) score += 5;
        if (controlledPsCells(player).some(c => hexDistance(c.coord, coord) <= 1)) score += 4;
      } else if (unit.weight === "Leggera" || unit.cost <= 2) {
        if (status.zeroPsRecovery || status.pressureEmergency) score += 6;
        if (cell && cell.ps && cell.control !== player) score += 8;
      }
      if (!status.qgWinPlan && countControlledPS(player) < 2) {
        const enemyHq = getHq(enemyOf(player));
        if (enemyHq && hexDistance(coord, enemyHq.pos) <= 3) score -= botUnitIsSacrificial(unit) ? 3 : 9;
      }
      return score;
    }

function botNexusCoordDoctrineBonus(player, unitOrBp, coord, status=strategicStatus(player)) {
      if (!advancedAiEnabled() || !botIsNexusPlayer(player) || !unitOrBp || !coord) return 0;
      const fake = unitOrBp.side ? unitOrBp : botFakeUnitForCoord(player, unitOrBp, coord);
      let score = botNexusMoveDoctrineBonus(fake, coord, status) * 0.7;
      const cell = getCellAt(coord);
      if (unitOrBp.type === "Struttura") {
        if (cell && cell.ps) score += 30;
        if (state.cells.some(c => c.ps && hexDistance(c.coord, coord) === 1)) score += 16;
        if (controlledPsCells(player).some(c => hexDistance(c.coord, coord) <= 1)) score += 14;
        if (status.zeroPsRecovery || status.pressureEmergency) {
          const targets = botObjectiveRecoveryTargets(player, status);
          if (targets.length) score += Math.max(0, 24 - minDistance(coord, targets) * 4.5);
        }
        score -= botNexusStructureDisciplinePenalty(player, unitOrBp, coord, status);
      } else {
        if (cell && cell.ps && cell.control !== player) score += 12;
        if (botNexusStructureCountNear(player, coord, 2) > 0) score += unitOrBp.weight === "Leggera" ? 3 : 5;
      }
      return score;
    }

function botNexusTargetPriorityBonus(player, enemyUnit, status=strategicStatus(player)) {
      if (!botIsNexusPlayer(player) || !enemyUnit || enemyUnit.side === player) return 0;
      let score = 0;
      const cell = getCellAt(enemyUnit.pos);
      const nearOwnPs = controlledPsCells(player).some(c => hexDistance(c.coord, enemyUnit.pos) <= 2);
      const nearOwnStructure = combatUnits(player).some(u => u.faction === "Nexus" && u.type === "Struttura" && hexDistance(u.pos, enemyUnit.pos) <= 2);
      if (cell && cell.ps && cell.control === enemyUnit.side) score += status.pressureEmergency || status.zeroPsRecovery ? 20 : 10;
      if (nearOwnPs) score += 9;
      if (nearOwnStructure) score += 8;
      if (enemyUnit.type === "Struttura" && state.cells.some(c => c.ps && hexDistance(c.coord, enemyUnit.pos) <= 1)) score += 6;
      if (enemyUnit.faction === "Exordium" && (enemyUnit.type === "Veicolo" || enemyUnit.weight === "Pesante" || enemyUnit.weight === "Elite")) score += nearOwnPs || nearOwnStructure ? 7 : 2;
      if (enemyUnit.faction === "Liberti" && alliesNear(enemyUnit.pos, enemyUnit.side, 1).length >= 2) score += nearOwnPs ? 6 : 2;
      return score;
    }

function botNexusPurchaseDoctrineBonus(player, bp, field, status=strategicStatus(player)) {
      if (!botIsNexusPlayer(player) || !bp) return 0;
      let score = 0;
      const structures = field.filter(u => u.faction === "Nexus" && u.type === "Struttura").length;
      if (status.zeroPsRecovery || status.pressureEmergency) {
        if (bp.weight === "Leggera" || bp.cost <= 2 || bp.type === "Fanteria" || bp.type === "Veicolo") score += 5;
        if (bp.type === "Struttura") score += 4;
      }
      if (countControlledPS(player) >= 1) {
        if (bp.type === "Struttura") score += structures >= 4 && !status.hqDanger ? 1 : 8;
        if (bp.weight === "Pesante" || bp.weight === "Elite" || bp.weight === "Pivot") score += 4;
      } else if (bp.type === "Struttura" && !status.centerOpening && !status.centerLostEarly) {
        score += 1;
      }
      const n = String(bp.name || "").toLowerCase();
      if (/drone|geniere/.test(n)) score += status.zeroPsRecovery || status.pressureEmergency ? 5 : 2;
      if (/bunker|barriera|nodo|fabbrica|torre/.test(n) && countControlledPS(player) >= 1) score += 3;
      if (structures >= 5 && bp.type === "Struttura" && !status.hqDanger && !status.pressureEmergency) score -= 5;
      return score;
    }

function botNexusTacticProfileBonus(player, card, target, phase="dynamic") {
      if (!botIsNexusPlayer(player) || !card) return 0;
      const kind = card.effectKind || "";
      const status = strategicStatus(player);
      let score = 0;
      if (target && target.side === player) {
        if (target.type === "Struttura" && (isOnPS(target) || controlledPsCells(player).some(c => hexDistance(c.coord, target.pos) <= 1))) score += 3;
        if (isOnPS(target)) score += 2;
        if (["phase_shield","heal_to_max"].includes(kind)) score += enemiesNear(target.pos, player, 2).length ? 3 : 0;
      }
      if (target && target.side === enemyOf(player)) {
        if (isOnPS(target)) score += 3;
        if (status.pressureEmergency || status.zeroPsRecovery) score += isOnPS(target) ? 4 : 0;
      }
      if (["cell_movement_trap","temporary_block_cell"].includes(kind) && target) {
        const coord = target.coord || target.pos;
        if (coord && state.cells.some(c => c.ps && hexDistance(c.coord, coord) <= 1)) score += 3;
      }
      if (phase === "prePurchase" && ["draw_conditional_discount","energy_gain_by_ps"].includes(kind) && countControlledPS(player) >= 1) score += 1.5;
      return score;
    }

// =====================================================
// C2e-4b – Exordium Recovery / Breakpoint Doctrine
// =====================================================
function botIsExordiumPlayer(player) { return state && state.factions && state.factions[player] === "Exordium"; }

function botExordiumShockUnit(unitOrBp) {
      if (!unitOrBp || unitOrBp.faction !== "Exordium") return false;
      const w = String(unitOrBp.weight || "").toLowerCase();
      const n = String(unitOrBp.name || "").toLowerCase();
      return (unitOrBp.cost || 0) >= 3 || w.includes("pesant") || w.includes("elite") || w.includes("pivot") || /carro medio|legionario|testudo|iupiter|artiglieria|aurex|varran/.test(n);
    }

function botExordiumLineSupportScore(unit, coord) {
      if (!unit || unit.faction !== "Exordium" || !coord) return 0;
      let score = 0;
      const allies = combatUnits(unit.side).filter(a => a.uid !== unit.uid);
      for (const a of allies) {
        const d = hexDistance(a.pos, coord);
        if (d <= 1) score += a.weight === "Leggera" ? 0.8 : 1.15;
        else if (d <= 2) score += a.ability && !a.ability.passive && (a.ability.range || 1) >= 2 ? 0.85 : 0.45;
        if (a.type === "Struttura" && d <= 2) score += 1.1;
        if (a.type === "Veicolo" && d <= 2) score += 0.35;
        if (a.type === "Comandante" && d <= 2) score += 0.65;
      }
      const cell = getCellAt(coord);
      if (cell && cell.ps && cell.control === unit.side) score += 0.9;
      if (state.cells.some(c => c.ps && c.control === unit.side && hexDistance(c.coord, coord) <= 1)) score += 0.65;
      return score;
    }

function botExordiumFrontSupportCount(player, coord) {
      if (!botIsExordiumPlayer(player) || !coord) return 0;
      return combatUnits(player).filter(a => a.faction === "Exordium" && a.type !== "QG" && hexDistance(a.pos, coord) <= 2).length;
    }

function botExordiumObjectiveTargets(player, status=strategicStatus(player)) {
      const targets = [];
      const home = homePsCell(player);
      const center = centerPsCell();
      if (home && home.control !== player) targets.push(home.coord);
      if (center && center.control !== player) targets.push(center.coord);
      if (status && (status.zeroPsRecovery || status.pressureEmergency || status.enemyPressurePlan || status.defendQGRecovery)) {
        targets.push(...botObjectiveRecoveryTargets(player, status));
      }
      for (const c of state.cells.filter(c => c.ps && c.control !== player)) targets.push(c.coord);
      return uniqueCoords(targets);
    }

function botExordiumOpeningAnchorPenalty(unit, coord, status=strategicStatus(unit.side)) {
      if (!advancedAiEnabled() || !unit || unit.faction !== "Exordium" || !botExordiumShockUnit(unit) || !coord || status.allIn) return 0;
      if (!(state.turn <= 6 || status.centerOpening || status.centerLostEarly || status.zeroPsRecovery || status.pressureEmergency)) return 0;
      const cell = getCellAt(coord);
      const nearCentralOrContestedPs = Boolean((status.center && hexDistance(coord, status.center.coord) <= 1) || (cell && cell.ps && cell.control !== unit.side) || state.cells.some(c => c.ps && c.control !== unit.side && hexDistance(coord, c.coord) <= 1));
      if (!nearCentralOrContestedPs) return 0;
      const threat = botThreatToCell(unit.side, coord, unit);
      if (threat.attackers.length < 2) return 0;
      const support = botExordiumLineSupportScore(unit, coord);
      if (support >= 1.65) return 0;
      return 18 + Math.min(14, threat.attackers.length * 5) + (threat.lethal ? 10 : 0);
    }

function botExordiumMoveDoctrineBonus(unit, coord, status=strategicStatus(unit.side)) {
      if (!advancedAiEnabled() || !unit || unit.faction !== "Exordium" || !coord) return 0;
      let score = 0;
      const cell = getCellAt(coord);
      const objectives = botExordiumObjectiveTargets(unit.side, status);
      const support = botExordiumLineSupportScore(unit, coord);
      if (status.zeroPsRecovery || status.pressureEmergency || status.enemyPressurePlan || status.defendQGRecovery) {
        if (objectives.length) score += Math.max(0, 34 - minDistance(coord, objectives) * 5.2);
        if (cell && cell.ps && cell.control !== unit.side) score += 34;
        if (hexDistance(coord, status.ownHq.pos) <= 2 && (status.zeroPsRecovery || status.pressureEmergency)) score -= 8;
      }
      if (status.ownPs === 1 && status.enemyPs >= 2) {
        const contested = state.cells.filter(c => c.ps && c.control !== unit.side).map(c => c.coord);
        if (contested.length) score += Math.max(0, 22 - minDistance(coord, contested) * 4.2);
        if (botExordiumFrontSupportCount(unit.side, coord) >= 2) score += 7;
      }
      if (botExordiumShockUnit(unit)) {
        if (support >= 1.2) score += 6 + Math.min(7, support * 2.5);
        score -= botExordiumOpeningAnchorPenalty(unit, coord, status);
      } else if (unit.weight === "Leggera" || unit.cost <= 2) {
        const shockAllies = combatUnits(unit.side).filter(a => a.uid !== unit.uid && a.faction === "Exordium" && botExordiumShockUnit(a));
        if (shockAllies.some(a => hexDistance(a.pos, coord) <= 2)) score += 8;
        if (objectives.length) score += Math.max(0, 14 - minDistance(coord, objectives) * 3);
      }
      if (cell && cell.ps && cell.control !== unit.side && support >= 1.2) score += 12;
      return score;
    }

function botExordiumCoordDoctrineBonus(player, unitOrBp, coord, status=strategicStatus(player)) {
      if (!advancedAiEnabled() || !botIsExordiumPlayer(player) || !unitOrBp || !coord) return 0;
      const fake = unitOrBp.side ? unitOrBp : botFakeUnitForCoord(player, unitOrBp, coord);
      let score = botExordiumMoveDoctrineBonus(fake, coord, status) * 0.65;
      const cell = getCellAt(coord);
      const objectives = botExordiumObjectiveTargets(player, status);
      if (unitOrBp.type === "Struttura") {
        if (cell && cell.ps) score += 26;
        if (objectives.length && minDistance(coord, objectives) <= 1) score += 20;
        if (objectives.length && minDistance(coord, objectives) >= 4 && (status.zeroPsRecovery || status.pressureEmergency)) score -= 18;
      }
      if ((status.zeroPsRecovery || status.pressureEmergency) && objectives.length) score += Math.max(0, 20 - minDistance(coord, objectives) * 4);
      return score;
    }

function botExordiumAntiNexusTargetBonus(player, enemyUnit, status=strategicStatus(player)) {
      if (!botIsExordiumPlayer(player) || !enemyUnit || enemyUnit.faction !== "Nexus") return 0;
      let score = 0;
      const cell = getCellAt(enemyUnit.pos);
      const nearPs = state.cells.some(c => c.ps && hexDistance(c.coord, enemyUnit.pos) <= 1);
      const name = String(enemyUnit.name || "").toLowerCase();
      if (cell && cell.ps && cell.control === enemyUnit.side) score += 24;
      if (/drone geniere|geniere/.test(name) && nearPs) score += 18;
      if (enemyUnit.type === "Struttura") {
        score += nearPs ? 18 : 4;
        if (/bunker|nodo|fabbrica|torre/.test(name)) score += nearPs ? 12 : 5;
      }
      if ((enemyUnit.currentDef || 0) < Math.max(0, enemyUnit.maxDef || enemyUnit.def || 0)) score += 7;
      if (/droide/.test(name) && !(cell && cell.ps) && !nearPs) score -= 3;
      if (status && (status.zeroPsRecovery || status.pressureEmergency) && nearPs) score += 10;
      return score;
    }

function botExordiumFollowUpCount(attacker, defender) {
      if (!attacker || !defender) return 0;
      return combatUnits(attacker.side).filter(a => {
        if (!a || a.uid === attacker.uid || a.acted || !a.alive || a.type === "QG") return false;
        if (areAdjacent(a.pos, defender.pos) && canAttack(a)) return true;
        const ab = a.ability;
        if (ab && !ab.passive && canUseAbility(a, ab) && ab.target === "enemy" && hexDistance(a.pos, defender.pos) <= (ab.range || 1)) return true;
        return false;
      }).length;
    }

function botExordiumBreakpointAttackScore(attacker, defender, status=strategicStatus(attacker.side)) {
      if (!advancedAiEnabled() || !attacker || attacker.faction !== "Exordium" || !defender || defender.side === attacker.side) return 0;
      const damage = Math.max(0, effectiveAtt(attacker) + numericalSuperiorityBonus(attacker, defender));
      const follow = botExordiumFollowUpCount(attacker, defender);
      const cell = getCellAt(defender.pos);
      const strategicTarget = (cell && cell.ps) || defender.type === "Struttura" || isStrategicEnemyTarget(attacker.side, defender, status) || status.allIn || status.pressureEmergency || status.zeroPsRecovery;
      let score = 0;
      if ((defender.currentDef || 0) > 0) {
        const defBefore = defender.currentDef || 0;
        const defAfter = Math.max(0, defBefore - damage);
        const opensHp = defAfter === 0;
        const overflowLost = Math.max(0, damage - defBefore);
        if (opensHp) score += 9;
        if (opensHp && follow >= 1) score += 11 + Math.min(6, follow * 2);
        if (opensHp && cell && cell.ps) score += 8;
        if (opensHp && defender.type === "Struttura") score += 4;
        if (!opensHp && damage >= 4 && !strategicTarget) score -= 7;
        if (overflowLost >= 2 && follow < 1 && !strategicTarget) score -= 5 + overflowLost * 2.4;
      } else {
        if (damage >= (defender.currentHp || 0)) score += 13;
        else if (follow >= 1) score += 5;
      }
      if (defender.faction === "Nexus") score += botExordiumAntiNexusTargetBonus(attacker.side, defender, status) * 0.35;
      return score;
    }

function botShouldAttackTarget(attacker, defender) {
      if (!advancedAiEnabled() || !attacker || !defender) return true;
      const status = strategicStatus(attacker.side);
      const center = centerPsCell();
      const damage = effectiveAtt(attacker) + numericalSuperiorityBonus(attacker, defender);
      const kill = damage >= effectiveLife(defender);
      if (center && sameCoord(defender.pos, center.coord) && defender.side !== attacker.side && (status.centerLostEarly || state.turn <= 4) && !kill && !status.allIn) {
        const alliedSupport = combatUnits(attacker.side).filter(a => a.uid !== attacker.uid && hexDistance(a.pos, center.coord) <= 2).length;
        const tacticalSupport = botHandTacticCards(attacker.side).length;
        if (alliedSupport < 2 && tacticalSupport < 1) return false;
      }
      if (attacker.faction === "Exordium" && !status.allIn && !status.pressureEmergency && !status.zeroPsRecovery) {
        const bpScore = botExordiumBreakpointAttackScore(attacker, defender, status);
        const strategic = isStrategicEnemyTarget(attacker.side, defender, status) || getCellAt(defender.pos)?.ps;
        if (bpScore <= -10 && !strategic) return false;
      }
      return true;
    }


// =====================================================
// C2e-4d – Liberti Swarm / Sacrifice Doctrine
// =====================================================
function botIsLibertiPlayer(player) { return state && state.factions && state.factions[player] === "Liberti"; }

function botLibertiFrontTargets(player, status=strategicStatus(player)) {
      const targets = [];
      const center = centerPsCell();
      const home = homePsCell(player);
      if (status && (status.zeroPsRecovery || status.pressureEmergency || status.enemyPressurePlan || status.defendQGRecovery)) {
        targets.push(...botObjectiveRecoveryTargets(player, status));
      }
      if (home && home.control !== player) targets.push(home.coord);
      if (center && center.control !== player) targets.push(center.coord);
      for (const c of state.cells.filter(c => c.ps && c.control !== player)) targets.push(c.coord);
      const enemyHq = getHq(enemyOf(player));
      if (enemyHq && countControlledPS(player) >= 1) targets.push(enemyHq.pos);
      return uniqueCoords(targets);
    }

function botLibertiPackSupportScore(unit, coord) {
      if (!unit || unit.faction !== "Liberti" || !coord) return 0;
      return combatUnits(unit.side).filter(a => a.uid !== unit.uid && a.faction === "Liberti" && a.type !== "QG")
        .reduce((sum, ally) => {
          const d = hexDistance(ally.pos, coord);
          if (d > 2) return sum;
          let value = d <= 1 ? 1.25 : 0.65;
          if (botUnitIsSacrificial(ally)) value += 0.25;
          if (ally.weight === "Pesante" || ally.weight === "Elite" || ally.weight === "Pivot") value += 0.45;
          if (ally.type === "Comandante") value += 0.5;
          if (ally.ability && !ally.ability.passive && (ally.ability.range || 1) >= 2) value += 0.35;
          return sum + value;
        }, 0);
    }

function botLibertiThreatenedEnemyClusterScore(player, coord) {
      if (!botIsLibertiPlayer(player) || !coord) return 0;
      let score = 0;
      const allies = combatUnits(player);
      for (const enemy of combatUnits(enemyOf(player))) {
        const adjacentFromCoord = areAdjacent(coord, enemy.pos) ? 1 : 0;
        const alliedAdj = allies.filter(a => areAdjacent(a.pos, enemy.pos)).length;
        if (adjacentFromCoord) score += 4 + Math.min(8, alliedAdj * 2.6);
        if (alliedAdj >= 2 && hexDistance(coord, enemy.pos) <= 2) score += 3;
        if (isOnPS(enemy) && hexDistance(coord, enemy.pos) <= 2) score += 3;
      }
      return score;
    }

function botLibertiUsefulSacrifice(unit, coord, status=strategicStatus(unit.side)) {
      if (!unit || unit.faction !== "Liberti" || !coord || !botUnitIsSacrificial(unit)) return false;
      const cell = getCellAt(coord);
      if (status && (status.allIn || status.pressureEmergency || status.zeroPsRecovery || status.enemyPressurePlan)) return Boolean(cell && cell.ps && cell.control !== unit.side);
      if (status && status.hqDanger && hexDistance(coord, status.ownHq.pos) <= 1) return true;
      if (cell && cell.ps && cell.control !== unit.side && botLibertiPackSupportScore(unit, coord) >= 1.15) return true;
      if (botLibertiThreatenedEnemyClusterScore(unit.side, coord) >= 5) return true;
      return false;
    }

function botLibertiLoneRaidPenalty(unit, coord, status=strategicStatus(unit.side)) {
      if (!unit || unit.faction !== "Liberti" || !coord || (status && status.allIn)) return 0;
      const enemyHq = status && status.enemyHq ? status.enemyHq : getHq(enemyOf(unit.side));
      if (!enemyHq || countControlledPS(unit.side) < 1) return 0;
      const d = hexDistance(coord, enemyHq.pos);
      if (d > 3) return 0;
      const support = botLibertiPackSupportScore(unit, coord);
      const raiders = combatUnits(unit.side).filter(a => a.uid !== unit.uid && a.faction === "Liberti" && hexDistance(a.pos, enemyHq.pos) <= 5).length;
      if (support >= 1.2 || raiders >= 1) return 0;
      // Una sola unità verso QG resta diversivo: non bloccarla, ma non trattarla come conquista vera.
      return botUnitIsSacrificial(unit) ? 4 : 10;
    }

function botLibertiMoveDoctrineBonus(unit, coord, status=strategicStatus(unit.side)) {
      if (!advancedAiEnabled() || !unit || unit.faction !== "Liberti" || !coord) return 0;
      const player = unit.side;
      const hasPS = countControlledPS(player) >= 1;
      const cell = getCellAt(coord);
      const targets = botLibertiFrontTargets(player, status);
      const pack = botLibertiPackSupportScore(unit, coord);
      let score = 0;
      if (targets.length) score += Math.max(0, (hasPS ? 22 : 34) - minDistance(coord, targets) * (hasPS ? 3.8 : 5.2));
      if (cell && cell.ps && cell.control !== player) score += status && (status.zeroPsRecovery || status.pressureEmergency) ? 30 : 12;
      if (cell && cell.ps && cell.control === player) score += botUnitIsSacrificial(unit) ? 4 : 7;
      score += Math.min(12, pack * 3.2);
      score += botLibertiThreatenedEnemyClusterScore(player, coord) * 0.75;
      if (botLibertiUsefulSacrifice(unit, coord, status)) score += 10;
      else if (botUnitIsSacrificial(unit) && enemiesNear(coord, player, 2).length >= 2 && pack < 1.1 && !(status && status.allIn)) score -= 8;
      score -= botLibertiLoneRaidPenalty(unit, coord, status);
      if (hasPS) score += Math.min(4, Math.abs(coord[1]) * 0.45); // pressione laterale ma solo con branco/supporto.
      return score;
    }

function botLibertiCoordDoctrineBonus(player, unitOrBp, coord, status=strategicStatus(player)) {
      if (!advancedAiEnabled() || !botIsLibertiPlayer(player) || !unitOrBp || !coord) return 0;
      const fake = unitOrBp.side ? unitOrBp : botFakeUnitForCoord(player, unitOrBp, coord);
      let score = botLibertiMoveDoctrineBonus(fake, coord, status) * 0.75;
      const cell = getCellAt(coord);
      const field = combatUnits(player);
      if ((unitOrBp.cost || 0) <= 2 || unitOrBp.weight === "Leggera") {
        score += field.length < 7 ? 7 : 3;
        if (status && (status.zeroPsRecovery || status.pressureEmergency || status.enemyPressurePlan)) score += 5;
      }
      if (unitOrBp.weight === "Pesante" || unitOrBp.weight === "Elite" || unitOrBp.weight === "Pivot") {
        score += field.length >= 4 ? 6 : -2;
        if (field.some(a => a.faction === "Liberti" && botUnitIsSacrificial(a))) score += 3;
      }
      if (unitOrBp.type === "Struttura") {
        if (cell && cell.ps) score += 10;
        if (state.cells.some(c => c.ps && hexDistance(c.coord, coord) <= 1)) score += 8;
        if (field.length < 5 && !(status && status.hqDanger)) score -= 5;
      }
      return score;
    }

function botLibertiTargetPriorityBonus(player, enemyUnit, status=strategicStatus(player)) {
      if (!botIsLibertiPlayer(player) || !enemyUnit || enemyUnit.side === player) return 0;
      let score = 0;
      const cell = getCellAt(enemyUnit.pos);
      const alliedAdj = combatUnits(player).filter(a => areAdjacent(a.pos, enemyUnit.pos)).length;
      if (cell && cell.ps && cell.control === enemyUnit.side) score += status && (status.zeroPsRecovery || status.pressureEmergency) ? 22 : 12;
      if (alliedAdj >= 2) score += 8 + Math.min(5, alliedAdj);
      if (enemyUnit.type === "Comandante" || enemyUnit.weight === "Pivot" || enemyUnit.weight === "Elite") score += alliedAdj >= 1 ? 5 : 2;
      if (enemyUnit.type === "Struttura" && state.cells.some(c => c.ps && hexDistance(c.coord, enemyUnit.pos) <= 1)) score += 7;
      const name = String(enemyUnit.name || "").toLowerCase();
      if (/rauk|aura|comando|nodo|bunker|fabbrica|caserma|avamposto/.test(name)) score += 4;
      if (status && status.hqDanger && hexDistance(enemyUnit.pos, status.ownHq.pos) <= QG_THREAT_RANGE) score += 10;
      return score;
    }

function botLibertiPurchaseDoctrineBonus(player, bp, field, enemyField, enemyNearHq, status=strategicStatus(player)) {
      if (!botIsLibertiPlayer(player) || !bp) return 0;
      let score = 0;
      const fieldCount = field.length;
      const cheap = (bp.cost || 0) <= 2 || bp.weight === "Leggera";
      const bodies = field.filter(u => u.faction === "Liberti" && u.type !== "Struttura" && u.type !== "QG").length;
      if (status.zeroPsRecovery || status.pressureEmergency || status.enemyPressurePlan) {
        if (cheap || bp.type === "Fanteria" || bp.type === "Veicolo") score += 7;
        if (bp.type === "Struttura") score += 1;
      }
      if (bodies < 5 && cheap) score += 6;
      if (bodies >= 5 && (bp.weight === "Pesante" || bp.weight === "Elite" || bp.weight === "Pivot")) score += 5;
      if (fieldCount >= 7 && cheap && !status.pressureEmergency && !status.zeroPsRecovery) score -= 2;
      if (enemyNearHq && cheap) score += 4;
      if (bp.type === "Struttura" && countControlledPS(player) >= 1 && bodies >= 5) score += 3;
      return score;
    }

function botLibertiTacticProfileBonus(player, card, target, phase="dynamic") {
      if (!botIsLibertiPlayer(player) || !card) return 0;
      const kind = card.effectKind || "";
      const status = strategicStatus(player);
      let score = 0;
      if (["spawn_two_militia","spawn_predone_with_temp_vanguard","spawn_clan_reinforcements","spawn_militia_around_commander"].includes(kind)) {
        const bodies = combatUnits(player).filter(u => u.faction === "Liberti" && u.type !== "Struttura").length;
        score += Math.max(0, 10 - bodies);
        if (status.zeroPsRecovery || status.pressureEmergency || status.hqDanger) score += 3;
      }
      if (target && target.side === player) {
        const pack = botLibertiPackSupportScore(target, target.pos);
        if (["next_attack_bleed_two","arena_champion_permanent_attack","sanguis_hunter_scaling_bleed","coordinated_opportunity_attacks"].includes(kind)) score += pack >= 1.2 ? 4 : -1;
        if (kind === "last_run_sacrifice_aoe") score += botUnitIsSacrificial(target) || effectiveLife(target) <= 2 ? 5 : -3;
      }
      if (target && target.side === enemyOf(player)) score += botLibertiTargetPriorityBonus(player, target, status) * 0.3;
      return score;
    }


// =====================================================
// C2e-4e – Agathoi Fortification / Green Line Doctrine
// =====================================================

function botIsAgathoiPlayer(player) { return state && state.factions && state.factions[player] === "Agathoi"; }

function botAgathoiStructures(player) {
      return combatUnits(player).filter(u => u.faction === "Agathoi" && u.type === "Struttura");
    }

function botAgathoiStructureNetworkScore(player, coord) {
      if (!coord) return 0;
      const structures = botAgathoiStructures(player);
      let score = 0;
      const near1 = structures.filter(s => hexDistance(s.pos, coord) <= 1).length;
      const near2 = structures.filter(s => hexDistance(s.pos, coord) <= 2).length;
      const controlledNear = controlledPsCells(player).filter(ps => hexDistance(ps.coord, coord) <= 1).length;
      const psNear = state.cells.filter(c => c.ps && hexDistance(c.coord, coord) <= 1).length;
      const center = centerPsCell();
      const home = homePsCell(player);
      score += near1 * 4.5 + Math.max(0, near2 - near1) * 2.0;
      score += controlledNear * 5.5;
      score += psNear * 3.5;
      if (center && hexDistance(coord, center.coord) <= 1) score += 4;
      if (home && hexDistance(coord, home.coord) <= 1) score += 3;
      // Agathoi deve fare una linea verde, non una palla di strutture nella stessa area.
      if (near1 >= 3 && !psNear) score -= 8;
      return score;
    }

function botAgathoiGreenLineTargets(player, status=strategicStatus(player)) {
      const targets = [];
      const center = centerPsCell();
      const home = homePsCell(player);
      if (status && (status.zeroPsRecovery || status.pressureEmergency || status.enemyPressurePlan || status.defendQGRecovery)) {
        targets.push(...botObjectiveRecoveryTargets(player, status));
      }
      if (home && home.control !== player) targets.push(home.coord);
      if (center && center.control !== player) targets.push(center.coord);
      for (const c of state.cells.filter(c => c.ps)) {
        if (c.control !== player) targets.push(c.coord);
        else {
          targets.push(c.coord);
          for (const n of neighbors(c.coord)) {
            if (getCellAt(n)) targets.push(n);
          }
        }
      }
      const guard = nearestControlledPsNeedingGuard(player);
      if (guard) targets.push(guard.coord);
      return uniqueCoords(targets);
    }

function botAgathoiFrontLayerScore(player, coord, status=strategicStatus(player)) {
      if (!coord) return 0;
      let score = 0;
      const enemiesR1 = enemiesNear(coord, player, 1).length;
      const enemiesR2 = enemiesNear(coord, player, 2).length;
      const alliedStructures = botAgathoiStructures(player).filter(s => hexDistance(s.pos, coord) <= 2).length;
      const alliedSupport = alliesNear(coord, player, 2).filter(a => a.faction === "Agathoi" && a.type !== "QG").length;
      if (alliedStructures) score += Math.min(10, alliedStructures * 4);
      if (alliedSupport >= 2) score += 4;
      if (enemiesR2 && alliedStructures) score += Math.min(8, enemiesR2 * 2);
      if (enemiesR1 >= 2 && alliedSupport < 2 && !(status && status.allIn)) score -= 8;
      return score;
    }

function botAgathoiMoveDoctrineBonus(unit, coord, status=strategicStatus(unit.side)) {
      if (!advancedAiEnabled() || !unit || unit.faction !== "Agathoi" || !coord) return 0;
      const player = unit.side;
      const cell = getCellAt(coord);
      const targets = botAgathoiGreenLineTargets(player, status);
      let score = 0;
      if (targets.length) score += Math.max(0, 26 - minDistance(coord, targets) * 4.0);
      score += botAgathoiStructureNetworkScore(player, coord) * 0.65;
      score += botAgathoiFrontLayerScore(player, coord, status);
      if (cell && cell.ps) {
        if (cell.control === player) score += unit.type === "Struttura" ? 26 : 12;
        else score += (status.zeroPsRecovery || status.pressureEmergency) ? 38 : 16;
      }
      if (unit.type === "Struttura") {
        if (state.cells.some(c => c.ps && hexDistance(c.coord, coord) <= 1)) score += 16;
        if (controlledPsCells(player).some(c => hexDistance(c.coord, coord) <= 1)) score += 14;
        if (botAgathoiStructures(player).filter(s => hexDistance(s.pos, coord) <= 1).length >= 3 && !(cell && cell.ps)) score -= 8;
      }
      if (unit.canBuild) {
        if (state.cells.some(c => c.ps && hexDistance(c.coord, coord) <= 1)) score += 8;
        if (botAgathoiStructureNetworkScore(player, coord) >= 5) score += 4;
      }
      if (unit.passiveThorns || (unit.ability && (unit.ability.statusKind === "thorns" || unit.ability.kind === "armorThorns" || unit.ability.kind === "grantCounterattack"))) {
        if (enemiesNear(coord, player, 2).length) score += 5;
        if (botAgathoiStructureNetworkScore(player, coord) >= 5) score += 4;
      }
      if ((status.zeroPsRecovery || status.pressureEmergency || status.defendQGRecovery) && targets.length) {
        score += Math.max(0, 24 - minDistance(coord, targets) * 4.8);
        if (status.defendQGRecovery && status.ownHq && hexDistance(coord, status.ownHq.pos) <= 2 && countControlledPS(player) <= 0) score -= 7;
      }
      if (!status.qgWinPlan && countControlledPS(player) < 2 && status.enemyHq && hexDistance(coord, status.enemyHq.pos) <= 3) {
        score -= unit.weight === "Pivot" ? 3 : 8;
      }
      return score;
    }

function botAgathoiCoordDoctrineBonus(player, unitOrBp, coord, status=strategicStatus(player)) {
      if (!advancedAiEnabled() || !botIsAgathoiPlayer(player) || !unitOrBp || !coord) return 0;
      const fake = unitOrBp.side ? unitOrBp : botFakeUnitForCoord(player, unitOrBp, coord);
      let score = botAgathoiMoveDoctrineBonus(fake, coord, status) * 0.72;
      const cell = getCellAt(coord);
      const targets = botAgathoiGreenLineTargets(player, status);
      if (unitOrBp.type === "Struttura") {
        if (cell && cell.ps) score += 34;
        if (state.cells.some(c => c.ps && hexDistance(c.coord, coord) === 1)) score += 18;
        if (controlledPsCells(player).some(c => hexDistance(c.coord, coord) <= 1)) score += 18;
        if (targets.length) score += Math.max(0, 24 - minDistance(coord, targets) * 4);
        const nearStruct = botAgathoiStructures(player).filter(s => hexDistance(s.pos, coord) <= 1).length;
        if (nearStruct >= 3 && !(cell && cell.ps)) score -= 10;
      } else {
        if (unitOrBp.canBuild) score += botAgathoiStructures(player).length < 3 ? 5 : 2;
        if (cell && cell.ps && cell.control !== player) score += 12;
        if (botAgathoiStructureNetworkScore(player, coord) >= 6) score += unitOrBp.weight === "Leggera" ? 3 : 5;
      }
      return score;
    }

function botAgathoiTargetPriorityBonus(player, enemyUnit, status=strategicStatus(player)) {
      if (!botIsAgathoiPlayer(player) || !enemyUnit || enemyUnit.side === player) return 0;
      let score = 0;
      const cell = getCellAt(enemyUnit.pos);
      const nearOwnPs = controlledPsCells(player).some(c => hexDistance(c.coord, enemyUnit.pos) <= 2);
      const nearOwnStructure = botAgathoiStructures(player).some(s => hexDistance(s.pos, enemyUnit.pos) <= 2);
      if (cell && cell.ps && cell.control === enemyUnit.side) score += status && (status.zeroPsRecovery || status.pressureEmergency) ? 26 : 14;
      if (nearOwnPs) score += 8;
      if (nearOwnStructure) score += 8;
      if (enemyUnit.type === "Struttura" && state.cells.some(c => c.ps && hexDistance(c.coord, enemyUnit.pos) <= 1)) score += 6;
      if (enemyUnit.type === "Comandante" || enemyUnit.weight === "Pivot" || enemyUnit.weight === "Elite") score += 3;
      if (state.factions[enemyOf(player)] === "Liberti") {
        const adjAllies = alliesNear(enemyUnit.pos, player, 1).filter(a => a.faction === "Agathoi").length;
        score += Math.min(8, adjAllies * 2);
        if (nearOwnPs || nearOwnStructure) score += 4;
      }
      return score;
    }

function botAgathoiPurchaseDoctrineBonus(player, bp, field, enemyField, enemyNearHq, status=strategicStatus(player)) {
      if (!botIsAgathoiPlayer(player) || !bp) return 0;
      let score = 0;
      const structures = field.filter(u => u.faction === "Agathoi" && u.type === "Struttura").length;
      const enemyMass = enemyField.length >= field.length + 3;
      if (status.zeroPsRecovery || status.pressureEmergency || status.enemyPressurePlan) {
        if (bp.type === "Fanteria" || bp.type === "Veicolo" || (bp.cost || 0) <= 2) score += 6;
        if (bp.type === "Struttura") score += 6;
        if (bp.canBuild) score += 4;
      }
      if (bp.type === "Struttura") {
        if (countControlledPS(player) >= 1) score += 8;
        if (structures < 3) score += 5;
        else if (structures >= 6 && !status.pressureEmergency) score -= 3;
      }
      if (bp.canBuild && (countControlledPS(player) >= 1 || structures < 3)) score += 6;
      if (enemyMass && (bp.weight === "Leggera" || bp.type === "Fanteria" || (bp.cost || 0) <= 2)) score += 5;
      if (structures >= 2 && (bp.weight === "Pesante" || bp.weight === "Elite" || bp.weight === "Pivot")) score += 4;
      if (enemyNearHq && (bp.type === "Fanteria" || bp.weight === "Pesante" || bp.type === "Struttura")) score += 5;
      return score;
    }

function botAgathoiTacticProfileBonus(player, card, target, phase="dynamic") {
      if (!botIsAgathoiPlayer(player) || !card) return 0;
      const kind = card.effectKind || "";
      const status = strategicStatus(player);
      let score = 0;
      if (["temporary_block_cell","vegetal_anathema_trap","bramble_path_trap"].includes(kind)) {
        if (Array.isArray(target) && state.cells.some(c => c.ps && hexDistance(c.coord, target) <= 1)) score += 3;
        if (status.zeroPsRecovery || status.pressureEmergency || status.hqDanger) score += 2;
      }
      if (target && target.side === player) {
        const nearPs = state.cells.some(c => c.ps && hexDistance(c.coord, target.pos) <= 1);
        const nearStruct = botAgathoiStructures(player).some(s => hexDistance(s.pos, target.pos) <= 1);
        if (target.type === "Struttura" && ["set_structure_def_to_current_hp","green_fortress_structure_growth"].includes(kind)) score += nearPs ? 5 : 2;
        if (["grant_counterattack","grant_thorns_two"].includes(kind)) score += (nearPs || nearStruct) ? 4 : 1;
      }
      if (!target && ["draw_by_structures","structure_income_seed"].includes(kind)) {
        const structures = botAgathoiStructures(player).length;
        score += Math.min(8, structures * 1.7);
        if (phase === "prePurchase" && structures >= 2) score += 2;
      }
      return score;
    }


// =====================================================
// C2e-4f – Fabeot Deception / Surrender Pressure Profile
// =====================================================
function botIsFabeotPlayer(player) { return state && state.factions && state.factions[player] === "Fabeot"; }

function botFabeotIsBaitUnit(unitOrBp) {
      if (!unitOrBp || unitOrBp.faction !== "Fabeot") return false;
      const n = String(unitOrBp.name || "").toLowerCase();
      const w = String(unitOrBp.weight || "").toLowerCase();
      const hasStealth = Boolean((unitOrBp.startStatuses || []).some(st => st && st.kind === "stealth") || (unitOrBp.statuses || []).some(st => st && st.kind === "stealth"));
      return (unitOrBp.cost || 0) <= 2 || w.includes("legger") || unitOrBp.moveAttack || unitOrBp.c1fMoveBonus || hasStealth || /spia|inseguitore|lancia|opportunista|persecutore/.test(n);
    }

function botFabeotIsValuableUnit(unitOrBp) {
      if (!unitOrBp || unitOrBp.faction !== "Fabeot") return false;
      const n = String(unitOrBp.name || "").toLowerCase();
      const w = String(unitOrBp.weight || "").toLowerCase();
      return unitOrBp.type === "Comandante" || w.includes("pivot") || w.includes("elite") || (unitOrBp.cost || 0) >= 5 || /architetto|cittadella|emissario|gerarca/.test(n);
    }

function botFabeotAllyHalf(player, coord) {
      const ownHq = getHq(player);
      const enemyHq = getHq(enemyOf(player));
      if (!ownHq || !enemyHq || !coord) return false;
      return hexDistance(coord, ownHq.pos) <= hexDistance(coord, enemyHq.pos) + 1;
    }

function botFabeotEnemyAgencyScore(player) {
      const enemy = enemyOf(player);
      const enemyHand = state.hand && state.hand[enemy] ? state.hand[enemy] : [];
      const fabeotHand = state.hand && state.hand[player] ? state.hand[player] : [];
      const blocked = typeof handCardBlocked === "function" ? enemyHand.filter(c => handCardBlocked(c)).length : 0;
      const enemyEnergy = state.energy && typeof state.energy[enemy] === "number" ? state.energy[enemy] : 0;
      const handDelta = fabeotHand.length - enemyHand.length;
      const energyDelta = (state.energy && typeof state.energy[player] === "number" ? state.energy[player] : 0) - enemyEnergy;
      // Valore alto = avversario con poche risposte o Fabeot in vantaggio di leva.
      return blocked * 2.5 + Math.max(0, 2 - enemyEnergy) * 2.2 + Math.max(0, handDelta) * 1.1 + Math.max(0, energyDelta) * 0.9;
    }

function botFabeotEnemyConcentratedOnDefense(player) {
      const enemy = enemyOf(player);
      const enemyHq = getHq(enemy);
      const hqGuards = enemyHq ? combatUnits(enemy).filter(u => hexDistance(u.pos, enemyHq.pos) <= 2).length : 0;
      const psCrowd = state.cells.filter(c => c.ps).some(ps => combatUnits(enemy).filter(u => hexDistance(u.pos, ps.coord) <= 1).length >= 3);
      return hqGuards >= 2 || psCrowd;
    }

function botFabeotLessDefendedPsTargets(player) {
      const enemy = enemyOf(player);
      return state.cells
        .filter(c => c.ps && c.control !== player)
        .map(c => ({ coord:c.coord, enemies:combatUnits(enemy).filter(e => hexDistance(e.pos, c.coord) <= 1).length, allies:combatUnits(player).filter(a => hexDistance(a.pos, c.coord) <= 2).length }))
        .sort((a,b) => (a.enemies - b.enemies) || (b.allies - a.allies))
        .map(x => x.coord);
    }

function botFabeotKeyEnemyTarget(player, enemyUnit) {
      if (!enemyUnit || enemyUnit.side === player) return false;
      const n = String(enemyUnit.name || "").toLowerCase();
      const w = String(enemyUnit.weight || "").toLowerCase();
      const abKind = enemyUnit.ability && enemyUnit.ability.kind;
      return enemyUnit.type === "Comandante" || w.includes("pivot") || w.includes("elite") || (enemyUnit.cost || 0) >= 4 || enemyUnit.type === "Struttura" || ["deploymentDiscount","incomeDelta","incomeSwing","psLock","adjacentDefBuff","spawnBlueprint"].includes(abKind) || /bunker|nodo|fabbrica|torre|rete|avamposto|caserma|matrice|cittadella/.test(n);
    }

function botFabeotIsolationScore(player, enemyUnit) {
      if (!enemyUnit || !enemyUnit.pos) return 0;
      const enemy = enemyOf(player);
      const sameSideNear = combatUnits(enemy).filter(u => u.uid !== enemyUnit.uid && hexDistance(u.pos, enemyUnit.pos) <= 1).length;
      const fabeotNear = combatUnits(player).filter(u => hexDistance(u.pos, enemyUnit.pos) <= 2).length;
      let score = 0;
      if (sameSideNear === 0) score += 6;
      else if (sameSideNear === 1) score += 2;
      if (fabeotNear >= 2) score += 4;
      if (fabeotNear >= 3) score += 2;
      return score;
    }

function botFabeotExposedKeyTargets(player) {
      return combatUnits(enemyOf(player)).filter(e => botFabeotKeyEnemyTarget(player, e) && botFabeotIsolationScore(player, e) >= 5);
    }

function botFabeotCollapseReady(player, status=strategicStatus(player)) {
      if (!botIsFabeotPlayer(player)) return false;
      if (status && (status.qgWinPlan || status.pressureEmergency || status.zeroPsRecovery || status.allIn)) return true;
      const agency = botFabeotEnemyAgencyScore(player);
      const ownPs = countControlledPS(player);
      const enemyPs = countControlledPS(enemyOf(player));
      return agency >= 5 || botFabeotExposedKeyTargets(player).length > 0 || ownPs > enemyPs;
    }

function botFabeotDeceptionTargets(player, status=strategicStatus(player)) {
      const targets = [];
      const center = centerPsCell();
      const home = homePsCell(player);
      if (status && (status.zeroPsRecovery || status.pressureEmergency || status.enemyPressurePlan || status.defendQGRecovery)) targets.push(...botObjectiveRecoveryTargets(player, status));
      if (home && home.control !== player) targets.push(home.coord);
      if (center && center.control !== player) targets.push(center.coord);
      targets.push(...botFabeotLessDefendedPsTargets(player).slice(0, 2));
      if (botFabeotEnemyConcentratedOnDefense(player)) targets.push(...botFabeotLessDefendedPsTargets(player).slice(0, 3));
      if (countControlledPS(player) >= 1 && !(status && (status.zeroPsRecovery || status.pressureEmergency))) {
        const enemyHq = getHq(enemyOf(player));
        if (enemyHq) targets.push(enemyHq.pos);
      }
      for (const e of botFabeotExposedKeyTargets(player)) targets.push(e.pos);
      return uniqueCoords(targets);
    }

function botFabeotBaitScore(unit, coord, status=strategicStatus(unit.side)) {
      if (!unit || unit.faction !== "Fabeot" || !coord) return 0;
      const player = unit.side;
      const enemyHq = getHq(enemyOf(player));
      if (!enemyHq || countControlledPS(player) < 1 || (status && (status.zeroPsRecovery || status.pressureEmergency))) return 0;
      const d = hexDistance(coord, enemyHq.pos);
      let score = 0;
      if (botFabeotIsBaitUnit(unit)) {
        score += Math.max(0, 18 - d * 3.2);
        if (d <= 3) score += 6;
        if (botFabeotEnemyConcentratedOnDefense(player)) score -= 4; // bait già riuscito: ora bisogna monetizzare sui PS.
      } else if (botFabeotIsValuableUnit(unit) && !(status && status.qgWinPlan)) {
        score -= Math.max(0, 18 - d * 3.0);
      }
      return score;
    }

function botFabeotSplitPressureScore(player, coord, status=strategicStatus(player)) {
      if (!botIsFabeotPlayer(player) || !coord) return 0;
      let score = 0;
      const psTargets = botFabeotLessDefendedPsTargets(player);
      if (psTargets.length) score += Math.max(0, 18 - minDistance(coord, psTargets) * 4.0);
      if (botFabeotEnemyConcentratedOnDefense(player) && psTargets.length) score += Math.max(0, 22 - minDistance(coord, psTargets) * 4.8);
      const cell = getCellAt(coord);
      if (cell && cell.ps && cell.control !== player) score += status && (status.zeroPsRecovery || status.pressureEmergency) ? 32 : 16;
      return score;
    }

function botFabeotPatienceScore(unit, coord, status=strategicStatus(unit.side)) {
      if (!unit || unit.faction !== "Fabeot" || !coord || (status && (status.allIn || status.zeroPsRecovery || status.pressureEmergency || status.qgWinPlan))) return 0;
      const player = unit.side;
      let score = 0;
      const alliedHalf = botFabeotAllyHalf(player, coord);
      const hasLeverage = botFabeotCollapseReady(player, status);
      if (alliedHalf && !hasLeverage) score += 5;
      if (controlledPsCells(player).some(ps => hexDistance(coord, ps.coord) <= 2)) score += 3;
      if (unit.ability && !unit.ability.passive) {
        const usefulEnemyInRange = combatUnits(enemyOf(player)).some(e => hexDistance(coord, e.pos) <= Math.max(1, unit.ability.range || 1) + 1);
        if (usefulEnemyInRange) score += 3;
      }
      const enemyHq = getHq(enemyOf(player));
      if (enemyHq && botFabeotIsValuableUnit(unit) && !hasLeverage && hexDistance(coord, enemyHq.pos) <= 3) score -= 10;
      return score;
    }

function botFabeotMoveDoctrineBonus(unit, coord, status=strategicStatus(unit.side)) {
      if (!advancedAiEnabled() || !unit || unit.faction !== "Fabeot" || !coord) return 0;
      const player = unit.side;
      const targets = botFabeotDeceptionTargets(player, status);
      const collapse = botFabeotCollapseReady(player, status);
      const cell = getCellAt(coord);
      let score = 0;
      if (targets.length) score += Math.max(0, (collapse ? 28 : 21) - minDistance(coord, targets) * (collapse ? 4.5 : 3.4));
      score += botFabeotBaitScore(unit, coord, status);
      score += botFabeotSplitPressureScore(player, coord, status) * 0.75;
      score += botFabeotPatienceScore(unit, coord, status);
      if (cell && cell.ps) score += cell.control === player ? 7 : ((status.zeroPsRecovery || status.pressureEmergency) ? 34 : 14);
      const exposed = botFabeotExposedKeyTargets(player);
      if (collapse && exposed.length) score += Math.max(0, 24 - minDistance(coord, exposed.map(e => e.pos)) * 4.5);
      if (collapse && status.enemyHq && sameCoord(coord, status.enemyHq.pos) && status.qgRaiders >= 2) score += 48;
      if (!collapse && botFabeotIsValuableUnit(unit) && status.enemyHq && hexDistance(coord, status.enemyHq.pos) <= 3) score -= 9;
      if (unit.type === "Comandante" && !collapse && !status.hqDanger) score += botFabeotAllyHalf(player, coord) ? 4 : -6;
      return score;
    }

function botFabeotCoordDoctrineBonus(player, unitOrBp, coord, status=strategicStatus(player)) {
      if (!advancedAiEnabled() || !botIsFabeotPlayer(player) || !unitOrBp || !coord) return 0;
      const fake = unitOrBp.side ? unitOrBp : botFakeUnitForCoord(player, unitOrBp, coord);
      let score = botFabeotMoveDoctrineBonus(fake, coord, status) * 0.72;
      const cell = getCellAt(coord);
      const collapse = botFabeotCollapseReady(player, status);
      if (unitOrBp.type === "Struttura") {
        if (cell && cell.ps) score += 18;
        if (state.cells.some(c => c.ps && hexDistance(c.coord, coord) <= 1)) score += 12;
        if (botFabeotAllyHalf(player, coord) && !collapse) score += 8;
        if (status.zeroPsRecovery || status.pressureEmergency) score += Math.max(0, 18 - minDistance(coord, botFabeotLessDefendedPsTargets(player)) * 4);
      } else {
        if (botFabeotIsBaitUnit(unitOrBp) && countControlledPS(player) >= 1 && !collapse) {
          const enemyHq = getHq(enemyOf(player));
          if (enemyHq) score += Math.max(0, 14 - hexDistance(coord, enemyHq.pos) * 2.5);
        }
        if (collapse && botFabeotExposedKeyTargets(player).length) score += Math.max(0, 16 - minDistance(coord, botFabeotExposedKeyTargets(player).map(e => e.pos)) * 3.5);
      }
      return score;
    }

function botFabeotTargetPriorityBonus(player, enemyUnit, status=strategicStatus(player)) {
      if (!botIsFabeotPlayer(player) || !enemyUnit || enemyUnit.side === player) return 0;
      let score = 0;
      const cell = getCellAt(enemyUnit.pos);
      if (cell && cell.ps && cell.control === enemyUnit.side) score += status && (status.zeroPsRecovery || status.pressureEmergency) ? 28 : 14;
      if (enemyUnit.type === "Comandante") score += 22;
      if (enemyUnit.weight === "Pivot") score += 18;
      if (enemyUnit.weight === "Elite") score += 11;
      if (botFabeotKeyEnemyTarget(player, enemyUnit)) score += 6;
      score += botFabeotIsolationScore(player, enemyUnit);
      if (botFabeotEnemyAgencyScore(player) >= 5 && botFabeotKeyEnemyTarget(player, enemyUnit)) score += 7;
      if (enemyUnit.type === "Struttura" && state.cells.some(c => c.ps && hexDistance(c.coord, enemyUnit.pos) <= 1)) score += 9;
      if (effectiveLife(enemyUnit) <= 3 && botFabeotKeyEnemyTarget(player, enemyUnit)) score += 5;
      return score;
    }

function botFabeotPurchaseDoctrineBonus(player, bp, field, enemyField, enemyNearHq, status=strategicStatus(player)) {
      if (!botIsFabeotPlayer(player) || !bp) return 0;
      let score = 0;
      const hasPS = countControlledPS(player) >= 1;
      const collapse = botFabeotCollapseReady(player, status);
      const n = String(bp.name || "").toLowerCase();
      if (status.zeroPsRecovery || status.pressureEmergency || status.enemyPressurePlan) {
        if (bp.type === "Fanteria" || bp.type === "Veicolo" || (bp.cost || 0) <= 2) score += 7;
        if (bp.ability && ["psLock","shred","status","vulnerableMark","convertEnemy"].includes(bp.ability.kind)) score += 5;
      }
      if (!collapse && hasPS && botFabeotIsBaitUnit(bp)) score += 5;
      if (!collapse && botFabeotIsValuableUnit(bp) && field.length < 4) score -= 4;
      if (collapse && (botFabeotIsValuableUnit(bp) || bp.weight === "Elite" || bp.weight === "Pivot" || bp.ability)) score += 7;
      if (/spia|inseguitore|lancia/.test(n) && hasPS) score += 4;
      if (/agente espropriatore|architetto|emissario|avamposto|matrice|cabina|cittadella/.test(n)) score += hasPS ? 5 : 2;
      if (botFabeotEnemyAgencyScore(player) >= 4 && (bp.ability || /espropriatore|architetto|emissario/.test(n))) score += 4;
      if (enemyNearHq && (bp.type === "Fanteria" || bp.type === "Veicolo" || bp.type === "Struttura")) score += 4;
      return score;
    }

function botFabeotTacticProfileBonus(player, card, target, phase="dynamic") {
      if (!botIsFabeotPlayer(player) || !card) return 0;
      const kind = card.effectKind || "";
      const status = strategicStatus(player);
      const enemy = enemyOf(player);
      let score = 0;
      const enemyHand = state.hand && state.hand[enemy] ? state.hand[enemy] : [];
      const agency = botFabeotEnemyAgencyScore(player);
      if (target && target.side === enemy) {
        if (botFabeotKeyEnemyTarget(player, target)) score += 4;
        if (isOnPS(target)) score += 4;
        score += Math.min(5, botFabeotIsolationScore(player, target) * 0.8);
      }
      if (kind === "stun_unit") {
        if (target && (botFabeotKeyEnemyTarget(player, target) || isOnPS(target))) score += 6;
        if (status.hqDanger || status.pressureEmergency) score += 3;
      }
      if (kind === "bounce_unit_to_owner_hand_clean") {
        if (target && target.side === enemy && (isOnPS(target) || botFabeotKeyEnemyTarget(player, target))) score += 7;
        if (target && target.side === player && (target.currentHp < target.maxHp || target.currentDef < target.maxDef)) score += 2;
      }
      if (kind === "convert_isolated_enemy_infantry") {
        if (target && target.side === enemy) score += 8 + botFabeotIsolationScore(player, target);
        if (target && isOnPS(target)) score += 5;
      }
      if (kind === "bounty_copy_on_death") {
        if (target && effectiveLife(target) <= 4) score += 5;
        if (target && botFabeotKeyEnemyTarget(player, target)) score += 3;
      }
      if (kind === "mutual_draw_conditional_steal") {
        score += phase === "prePurchase" ? 3 : 1;
        if (enemyHand.length >= 4) score += 2;
        if (status.pressureEmergency || status.zeroPsRecovery) score -= 7;
      }
      if (kind === "block_enemy_hand_cards_by_ps") {
        score += Math.min(8, countControlledPS(player) * 3 + enemyHand.length * 0.6);
        if (status.pressureWinPlan || agency >= 4) score += 3;
        if ((status.pressureEmergency || status.zeroPsRecovery) && countControlledPS(player) < 1) score -= 6;
      }
      if (kind === "usury_energy_income_debuff") {
        score += 4 + Math.min(4, state.energy && state.energy[enemy] || 0);
        if (status.enemyPressurePlan || status.pressureEmergency || agency >= 4) score += 3;
        if (status.pressureEmergency || status.zeroPsRecovery) score -= 8;
      }
      if (kind === "grant_stealth_vehicle" && target && target.side === player) {
        if (botFabeotIsBaitUnit(target)) score += 6;
        if (status.enemyHq && hexDistance(target.pos, status.enemyHq.pos) <= 5) score += 3;
      }
      if (kind === "next_attack_ignore_defense" && target && target.side === player) {
        const adjKey = combatUnits(enemy).some(e => areAdjacent(target.pos, e.pos) && (botFabeotKeyEnemyTarget(player, e) || isOnPS(e)));
        if (adjKey) score += 7;
      }
      if (kind === "grant_stun_on_basic_attack" && target && target.side === player) {
        if (target.moveAttack || target.att >= 2 || botFabeotIsBaitUnit(target)) score += 4;
      }
      if (kind === "small_cell_cluster_damage" && Array.isArray(target)) {
        if (state.cells.some(c => c.ps && hexDistance(c.coord, target) <= 1)) score += 3;
      }
      return score;
    }


// =====================================================
// B7b – Strategic status / emergency / protection helpers
// =====================================================

function strategicStatus(player) {
      const enemy = enemyOf(player);
      const ownPs = countControlledPS(player);
      const enemyPs = countControlledPS(enemy);
      const ownPressure = state.pressure[player] || 0;
      const enemyPressure = state.pressure[enemy] || 0;
      const ownHq = getHq(player);
      const enemyHq = getHq(enemy);
      const enemyUnits = combatUnits(enemy);
      const ownUnits = combatUnits(player);
      const enemyOnOwnHq = enemyUnits.find(u => sameCoord(u.pos, ownHq.pos)) || null;
      const enemiesNearOwnHq = enemyUnits.filter(u => hexDistance(u.pos, ownHq.pos) <= QG_THREAT_RANGE);
      const center = centerPsCell();
      const centerOccupant = center ? getUnitAt(center.coord) : null;
      const centerOpening = Boolean(center && state.turn <= CENTER_OPENING_END_ROUND && !centerControlledBy(player));
      const centerLostEarly = Boolean(center && state.turn <= CENTER_CONTEST_END_ROUND && centerControlledByEnemy(player));
      const pressureWindow = state.turn >= pressureStartRound() - 2;
      const pressureEmergency = enemyPs >= botTotalPsCount() || enemyPressure >= Math.min(3, PRESSURE_WIN - 2);
      const zeroPsRecovery = ownPs <= 0 && enemyPs > 0;
      const pressureDanger = pressureWindow && (enemyPs > ownPs || enemyPressure >= PRESSURE_WIN - 2 || enemyPressure - ownPressure >= 2);
      const hqDanger = Boolean(enemyOnOwnHq) || enemiesNearOwnHq.length > 0;
      const defendQGRecovery = hqDanger && (zeroPsRecovery || enemyPs >= 2 || enemyPressure > ownPressure);
      const roundDanger = state.turn >= MAX_ROUND - 5 && (enemyPs > ownPs || enemyPressure > ownPressure || enemyUnits.length > ownUnits.length + 2);
      const allIn = Boolean(enemyOnOwnHq) || enemyPressure >= PRESSURE_WIN - 1 || (state.turn >= MAX_ROUND - 3 && enemyPs >= ownPs) || (pressureWindow && ownPs === 0 && enemyPs >= 2) || (pressureEmergency && ownPs === 0);
      const strategic = evaluateBotStrategicState(player);
      const midgame = state.turn >= 8;
      const winning = midgame && strategic.posture === "vantaggio";
      const losing = midgame && strategic.posture === "svantaggio";
      const qgRaiderUnits = ownUnits.filter(u => enemyHq && (hexDistance(u.pos, enemyHq.pos) <= 5 || (u.type === "Veicolo" && hexDistance(u.pos, enemyHq.pos) <= 6)));
      const qgRaiders = qgRaiderUnits.length;
      const closestQGRaiderDistance = qgRaiderUnits.length && enemyHq ? Math.min(...qgRaiderUnits.map(u => hexDistance(u.pos, enemyHq.pos))) : 99;
      const qgImmediateOccupy = Boolean(ownUnits.some(u => enemyHq && sameCoord(u.pos, enemyHq.pos)));
      const qgImmediateMove = Boolean(enemyHq && ownPs >= 1 && ownUnits.some(u => !u.acted && typeof movableCells === "function" && movableCells(u).some(c => sameCoord(c, enemyHq.pos))));
      const closePressureLock = Boolean(ownPressure >= PRESSURE_WIN - 1 && ownPs > enemyPs);
      // C2e-4g: una breccia QG supera la pressione solo se è immediata o quasi certa.
      // Se il bot è già a 4/5 pressione con vantaggio PS, resta conservativo sui PS.
      const qgStrongSequence = Boolean(!closePressureLock && qgRaiders >= 2 && closestQGRaiderDistance <= 2);
      const qgClosingPossible = Boolean(winning && ownPs >= 1 && (qgImmediateOccupy || qgImmediateMove || qgStrongSequence));
      const qgWinPlan = qgClosingPossible;
      const pressureWinPlan = Boolean(!qgWinPlan && (closePressureLock || (winning && (ownPs >= 2 || ownPressure > enemyPressure + 1 || (ownPs > enemyPs && strategic.incomeDelta >= 0)))));
      const enemyPressurePlan = Boolean(losing && (enemyPs >= 2 || enemyPressure > ownPressure || enemyPs > ownPs));
      const doctrineActive = pressureWinPlan || qgWinPlan || enemyPressurePlan || pressureEmergency || zeroPsRecovery || defendQGRecovery || closePressureLock;
      const active = pressureDanger || hqDanger || roundDanger || allIn || centerOpening || centerLostEarly || doctrineActive;
      let mode = "normal";
      if (qgImmediateOccupy || qgImmediateMove) mode = "vittoria_qg";
      else if (allIn) mode = "tutto_per_tutto";
      else if (closePressureLock) mode = "vittoria_pressione";
      else if (pressureEmergency) mode = "rompi_controllo_ps";
      else if (zeroPsRecovery) mode = "recupero_ps";
      else if (defendQGRecovery) mode = "difesa_qg_recupero_ps";
      else if (hqDanger) mode = "difesa_qg";
      else if (centerLostEarly || centerOpening) mode = "contesta_centro";
      else if (pressureDanger) mode = "rompi_pressione";
      else if (roundDanger) mode = "finale";
      else if (enemyPressurePlan) mode = "difesa_pressione";
      else if (qgWinPlan) mode = "vittoria_qg";
      else if (pressureWinPlan) mode = "vittoria_pressione";
      return { player, enemy, ownPs, enemyPs, ownPressure, enemyPressure, ownHq, enemyHq, enemyUnits, ownUnits, enemyOnOwnHq, enemiesNearOwnHq, center, centerOccupant, centerOpening, centerLostEarly, pressureDanger, pressureEmergency, zeroPsRecovery, defendQGRecovery, hqDanger, roundDanger, allIn, active, mode, strategic, midgame, winning, losing, pressureWinPlan, qgWinPlan, qgClosingPossible, qgImmediateOccupy, qgImmediateMove, qgStrongSequence, closePressureLock, closestQGRaiderDistance, enemyPressurePlan, doctrineActive, qgRaiders };
    }

function logEmergencyIfNeeded(player, status) {
      if (!status || !status.active || !state || state.winner) return;
      if (state.emergencyLoggedTurn[player] === state.turn) return;
      state.emergencyLoggedTurn[player] = state.turn;
      const reasons = [];
      if (status.hqDanger) reasons.push("QG minacciato");
      if (status.centerOpening) reasons.push("apertura: priorità PS centrale");
      if (status.centerLostEarly) reasons.push("PS centrale perso presto");
      if (status.pressureDanger) reasons.push(`Pressione nemica ${status.enemyPressure}/${PRESSURE_WIN}, PS ${status.enemyPs}-${status.ownPs}`);
      if (status.pressureEmergency) reasons.push("override: rompere controllo PS");
      if (status.zeroPsRecovery) reasons.push("0 PS: recupero obiettivo");
      if (status.defendQGRecovery) reasons.push("difesa QG con ripartenza PS");
      if (status.roundDanger) reasons.push("spareggio vicino");
      if (status.enemyPressurePlan) reasons.push("dottrina: difendere asse PS");
      if (status.closePressureLock) reasons.push("close pressure lock: proteggere PS e chiudere pressione");
      if (status.pressureWinPlan) reasons.push("dottrina: chiudere di pressione");
      if (status.qgWinPlan) reasons.push(status.qgImmediateMove || status.qgImmediateOccupy ? "dottrina: QG immediato" : "dottrina: breccia verso QG");
      if (status.allIn) reasons.push("tutto per tutto");
      if (status.closePressureLock && status.qgRaiders > 0 && !(status.qgImmediateMove || status.qgImmediateOccupy) && state.aiTelemetry && state.aiTelemetry.qgBlockedOpportunities) {
        state.aiTelemetry.qgBlockedOpportunities[player] = (state.aiTelemetry.qgBlockedOpportunities[player] || 0) + 1;
      }
      if (typeof recordAiGoalMode === "function") recordAiGoalMode(player, status.mode);
      log(`${playerName(player)} cambia piano AI: ${status.mode} (${reasons.join("; ")}).`, EventTypes.AI_PLAN_CHANGED, {
        player,
        faction: state.factions[player],
        mode: status.mode,
        reasons,
        round: state.turn,
        ownPs: status.ownPs,
        enemyPs: status.enemyPs,
        ownPressure: status.ownPressure,
        enemyPressure: status.enemyPressure
      });
    }

function strategicTargetCoords(player, status=strategicStatus(player)) {
      const targets = [];
      const center = centerPsCell();
      if (status.zeroPsRecovery || status.pressureEmergency || status.defendQGRecovery) {
        targets.push(...botObjectiveRecoveryTargets(player, status));
      }
      if (center && (status.centerOpening || status.centerLostEarly)) {
        targets.push(center.coord);
        const occ = getUnitAt(center.coord);
        if (occ && occ.side !== player) targets.push(occ.pos);
      }
      const home = homePsCell(player);
      if (!(status.centerOpening || status.centerLostEarly) && home && !homePsControlled(player)) targets.push(home.coord);
      if (status.hqDanger) {
        targets.push(status.ownHq.pos);
        for (const e of status.enemiesNearOwnHq) targets.push(e.pos);
        if (status.enemyOnOwnHq) targets.push(status.enemyOnOwnHq.pos);
      }
      if (status.pressureDanger || status.roundDanger || status.pressureEmergency || status.zeroPsRecovery) {
        for (const c of controlledPsCells(status.enemy)) targets.push(c.coord);
        if (status.ownPs < 1) for (const c of state.cells.filter(c => c.ps && c.control !== player)) targets.push(c.coord);
      }
      if (status.allIn && status.ownPs >= 1) targets.push(status.enemyHq.pos);
      if (!targets.length) targets.push(...state.cells.filter(c => c.ps && c.control !== player).map(c => c.coord));
      if (!targets.length) targets.push(status.enemyHq.pos);
      return uniqueCoords(targets);
    }

function isStrategicEnemyTarget(player, enemyUnit, status=strategicStatus(player)) {
      if (!enemyUnit || enemyUnit.side === player) return false;
      const cell = getCellAt(enemyUnit.pos);
      if (status.hqDanger && hexDistance(enemyUnit.pos, status.ownHq.pos) <= QG_THREAT_RANGE) return true;
      if (status.centerLostEarly && status.center && sameCoord(enemyUnit.pos, status.center.coord)) return true;
      if ((status.pressureDanger || status.roundDanger || status.pressureEmergency || status.zeroPsRecovery) && cell && cell.ps && cell.control === enemyUnit.side) return true;
      if (status.allIn && enemyUnit.type === "Comandante") return true;
      return false;
    }

function strategicMoveBonus(player, unit, coord, status=strategicStatus(player)) {
      if (!status.active) return 0;
      let score = 0;
      const cell = getCellAt(coord);
      if (status.centerOpening || status.centerLostEarly) score += centerMoveScore(unit, coord, status);
      score += botObjectiveRecoveryBonus(unit, coord, status);
      score -= botCellDangerPenalty(player, coord, unit, status);
      score += botCellOpportunityBonus(player, coord);
      if (status.hqDanger) {
        const d = hexDistance(coord, status.ownHq.pos);
        score += Math.max(0, 24 - d * 5);
        if (sameCoord(coord, status.ownHq.pos)) score += 24;
        for (const e of status.enemiesNearOwnHq) {
          if (areAdjacent(coord, e.pos)) score += 10;
          if (sameCoord(coord, e.pos)) score += 16;
        }
      }
      if (status.pressureDanger || status.roundDanger || status.pressureEmergency || status.zeroPsRecovery) {
        const enemyPs = controlledPsCells(status.enemy).map(c => c.coord);
        const targets = enemyPs.length ? enemyPs : state.cells.filter(c => c.ps && c.control !== player).map(c => c.coord);
        if (targets.length) score += Math.max(0, 22 - minDistance(coord, targets) * 5);
        if (cell && cell.ps && cell.control === status.enemy) score += 28;
        if (cell && cell.ps && cell.control !== player && status.ownPs < 1) score += 20;
      }
      if (status.allIn && status.ownPs >= 1) {
        score += Math.max(0, 26 - hexDistance(coord, status.enemyHq.pos) * 4.5);
        if (sameCoord(coord, status.enemyHq.pos)) score += 42;
      }
      if (unit.type === "Comandante" && !status.allIn) score -= enemiesNear(coord, player, 2).length * 4;
      score += botClosePressureLockBonus(unit, coord, status);
      score += botQGAccessBlockBonus(player, coord, unit, status);
      score += botPsSupportGateBonus(unit, coord, status) * 0.75;
      score += botPsAdjacentStagingBonus(unit, coord, status) * 0.65;
      score -= botPsSupportGatePenalty(unit, coord, status) * 0.95;
      return score;
    }

function chooseEmergencyMove(unit, options, status=strategicStatus(unit.side)) {
      if (!status.active || !options.length) return null;
      const scored = options.map(coord => ({ coord, score: strategicMoveBonus(unit.side, unit, coord, status) }))
        .sort((a,b) => b.score - a.score);
      return scored.length && scored[0].score >= 10 ? scored[0].coord : null;
    }

function centerMoveScore(unit, coord, status=strategicStatus(unit.side)) {
      const center = centerPsCell();
      if (!center || !(status.centerOpening || status.centerLostEarly)) return 0;
      let score = 0;
      const dist = hexDistance(coord, center.coord);
      if (status.centerOpening) {
        score += Math.max(0, 36 - dist * 7);
        if (sameCoord(coord, center.coord)) score += 70;
        if (dist === 1) score += 12;
      }
      if (status.centerLostEarly) {
        score += Math.max(0, 46 - dist * 8);
        if (sameCoord(coord, center.coord)) score += 90;
        if (dist === 1) score += 18;
      }
      if (unit.type === "Comandante" && combatUnits(unit.side).some(u => u.uid !== unit.uid && u.type !== "Comandante")) score -= 22;
      return score;
    }

function homePsMoveScore(unit, coord, status=strategicStatus(unit.side)) {
      if (!advancedAiEnabled() || !homePsDutyActive(unit.side, status)) return 0;
      const home = homePsCell(unit.side);
      if (!home) return 0;
      let score = Math.max(0, 36 - hexDistance(coord, home.coord) * 7);
      if (sameCoord(coord, home.coord)) score += 70;
      if (hexDistance(coord, home.coord) === 1) score += 8;
      if (unit.type === "Fanteria" || unit.weight === "Leggera") score += 6;
      score += botPsSupportGateBonus(unit, coord, status) * 0.7;
      score += botPsAdjacentStagingBonus(unit, coord, status) * 0.45;
      score -= botPsSupportGatePenalty(unit, coord, status) * 0.85;
      if (unit.type === "Comandante" && combatUnits(unit.side).some(u => u.uid !== unit.uid && u.type !== "Comandante")) score -= 24;
      return score;
    }

function chooseHomePsDutyMove(unit, options, status=strategicStatus(unit.side)) {
      if (!options.length || !homePsDutyActive(unit.side, status)) return null;
      if (unitIsGarrisoningPs(unit) && !shouldReleasePsGarrison(unit)) return null;
      const currentHomeDistance = hexDistance(unit.pos, homePsCell(unit.side).coord);
      const best = options.map(coord => ({ coord, score: homePsMoveScore(unit, coord, status), distance: hexDistance(coord, homePsCell(unit.side).coord) }))
        .sort((a,b) => b.score - a.score || a.distance - b.distance)[0];
      if (!best || best.score < 14) return null;
      return best.distance <= currentHomeDistance ? best.coord : null;
    }

function contestedPsCells(player) { return controlledPsCells(player).filter(c => enemiesNear(c.coord, player, 2).length > 0); }

function nearestControlledPsNeedingGuard(player) {
      const candidates = controlledPsCells(player).map(c => ({
        cell: c,
        allies: alliesNear(c.coord, player, 1).length,
        enemies: enemiesNear(c.coord, player, 2).length
      })).filter(x => x.allies <= 1 || x.enemies > 0);
      candidates.sort((a,b) => (b.enemies - a.enemies) || (a.allies - b.allies));
      return candidates.length ? candidates[0].cell : null;
    }

function shouldReleasePsGarrison(unit) {
      if (!unitIsGarrisoningPs(unit)) return true;
      const status = strategicStatus(unit.side);
      // In tutto-per-tutto si può abbandonare un PS solo se ne resta almeno un altro presidiato.
      if (status.allIn && countControlledPS(unit.side) > 1) return true;
      return false;
    }

function commanderSafetyMove(unit) {
      if (!advancedAiEnabled() || unit.type !== "Comandante") return null;
      const threat = commanderThreatLevel(unit);
      if (threat < 2) return null;
      const options = movableCells(unit);
      if (!options.length) return null;
      const currentThreat = enemiesNear(unit.pos, unit.side, 2).length * 2 + enemiesNear(unit.pos, unit.side, 1).length * 4;
      const ownHq = getHq(unit.side);
      const best = options.map(coord => {
        const threatScore = enemiesNear(coord, unit.side, 2).length * 2 + enemiesNear(coord, unit.side, 1).length * 4;
        let score = -threatScore + alliesNear(coord, unit.side, 1).length * 2 - hexDistance(coord, ownHq.pos) * 0.35;
        return { coord, score, threatScore };
      }).sort((a,b) => b.score - a.score)[0];
      return best && best.threatScore < currentThreat ? best.coord : null;
    }

function commanderProtectionMoveBonus(unit, coord) {
      const commander = commanderOf(unit.side);
      if (!commander || unit.uid === commander.uid) return 0;
      const threat = commanderThreatLevel(commander);
      if (threat <= 0) return 0;
      return Math.max(0, 5 - hexDistance(coord, commander.pos)) * (1.2 + threat * 0.35);
    }

function psProtectionMoveBonus(player, coord) {
      const target = nearestControlledPsNeedingGuard(player);
      if (!target) return 0;
      const d = hexDistance(coord, target.coord);
      return Math.max(0, 5 - d) * 1.15;
    }

function shouldHoldStrategicCell(unit, cell) {
      if (!advancedAiEnabled() || !cell || !cell.ps || cell.control !== unit.side) return false;
      if (unit.type === "Comandante") return false;
      if (combatUnits(enemyOf(unit.side)).some(e => areAdjacent(e.pos, unit.pos))) return false;
      return !shouldReleasePsGarrison(unit);
    }


// =====================================================
// B7e – AI movement selection / faction movement profiles
// =====================================================

function chooseBotMove(unit) {
      const options = movableCells(unit);
      if (!options.length) return null;
      if (advancedAiEnabled()) return chooseAdvancedMove(unit, options);
      if (unit.faction === "Liberti") return chooseLibertiMove(unit, options);

      const faction = unit.faction;
      const enemy = enemyOf(unit.side);
      const enemyHq = getHq(enemy);
      const ownHq = getHq(unit.side);
      const hasPS = countControlledPS(unit.side) >= 1;
      const enemyHasPS = countControlledPS(enemy) >= 1;
      const psCells = state.cells.filter(c => c.ps).map(c => c.coord);
      const uncontrolledPS = state.cells.filter(c => c.ps && c.control !== unit.side).map(c => c.coord);
      const enemyUnits = combatUnits(enemy);
      const threatenedOwnHq = enemyUnits.some(e => hexDistance(e.pos, ownHq.pos) <= QG_THREAT_RANGE);

      const scored = options.map(coord => {
        let score = 0;
        const cell = getCellAt(coord);
        if (hasPS) score -= hexDistance(coord, enemyHq.pos) * (faction === "Exordium" ? 1.6 : 1.1);
        else score -= minDistance(coord, uncontrolledPS.length ? uncontrolledPS : psCells) * 1.5;
        if (cell && cell.ps && cell.control !== unit.side) score += faction === "Nexus" ? 7 : 5;
        if (sameCoord(coord, enemyHq.pos) && hasPS) score += 40;
        if (threatenedOwnHq) score -= hexDistance(coord, ownHq.pos) * 1.2;
        if (faction === "Nexus") {
          if (cell && cell.ps && cell.control === unit.side) score += 4;
          if (hasPS && unit.weight === "Pivot") score += 1;
        }
        if (faction === "Exordium") {
          score -= minDistance(coord, [enemyHq.pos]) * 0.7;
          if (hasPS && unit.type === "Veicolo") score += 2;
        }
        return { coord, score };
      }).sort((a,b) => b.score - a.score);
      return scored[0].coord;
    }

function chooseAdvancedMove(unit, options) {
      const status = strategicStatus(unit.side);
      if (status.active) {
        const emergency = chooseEmergencyMove(unit, options, status);
        if (emergency) return emergency;
      }
      const homeDuty = chooseHomePsDutyMove(unit, options, status);
      if (homeDuty) return homeDuty;
      const faction = unit.faction;
      let proposed = null;
      if (faction === "Liberti") proposed = chooseAdvancedLibertiMove(unit, options);
      else if (faction === "Nexus") proposed = chooseAdvancedNexusMove(unit, options);
      else if (faction === "Exordium") proposed = chooseAdvancedExordiumMove(unit, options);
      else if (faction === "Agathoi") proposed = chooseAdvancedAgathoiMove(unit, options);
      else if (faction === "Fabeot") proposed = chooseAdvancedFabeotMove(unit, options);
      else proposed = chooseLibertiMove(unit, options);
      const doctrineBest = options.map(coord => ({ coord, score: botGeneralDoctrineMoveBonus(unit, coord, status) }))
        .sort((a,b) => b.score - a.score)[0];
      if (doctrineBest && doctrineBest.score >= 18) proposed = doctrineBest.coord;
      const safeProposed = c2e3SaferStrategicMove(unit, options, proposed);
      const gatePenalty = botPsSupportGatePenalty(unit, safeProposed, status);
      if (gatePenalty >= 24 && !status.allIn) {
        const supported = options.map(coord => ({
          coord,
          score: botGeneralDoctrineMoveBonus(unit, coord, status) + c2e3MoveScore(unit, coord) - botPsSupportGatePenalty(unit, coord, status)
        })).sort((a,b) => b.score - a.score)[0];
        if (supported && supported.score > -10) return supported.coord;
      }
      return safeProposed;
    }

function chooseAdvancedAgathoiMove(unit, options) {
      const player = unit.side;
      const enemyHq = getHq(enemyOf(player));
      const hasPS = countControlledPS(player) >= 1;
      const status = strategicStatus(player);
      const psTargets = state.cells.filter(c => c.ps).map(c => c.coord);
      const guardTarget = nearestControlledPsNeedingGuard(player);
      const greenTargets = botAgathoiGreenLineTargets(player, status);
      const scored = options.map(coord => {
        let score = 0;
        const cell = getCellAt(coord);
        if (unitIsGarrisoningPs(unit) && !shouldReleasePsGarrison(unit)) score -= 999;
        score += homePsMoveScore(unit, coord, status);
        score += centerMoveScore(unit, coord, status);
        if (!hasPS) score -= minDistance(coord, psTargets) * 2.0;
        else if (guardTarget) score -= hexDistance(coord, guardTarget.coord) * 2.4;
        else score -= hexDistance(coord, enemyHq.pos) * 0.55;
        if (greenTargets.length) score += Math.max(0, 18 - minDistance(coord, greenTargets) * 3.2);
        if (cell && cell.ps && cell.control !== player) score += status.zeroPsRecovery || status.pressureEmergency ? 22 : 12;
        if (cell && cell.ps && cell.control === player) score += 16;
        score += alliesNear(coord, player, 1).length * 1.2;
        score += botAgathoiStructureNetworkScore(player, coord) * 0.75;
        if (combatUnits(player).some(s => s.faction === "Agathoi" && s.type === "Struttura" && hexDistance(coord, s.pos) <= 1)) score += 5;
        if (unit.canBuild && state.cells.some(ps => ps.ps && hexDistance(coord, ps.coord) <= 1)) score += 7;
        if (state.factions[enemyOf(player)] === "Liberti") {
          const enemyCountR2 = enemiesNear(coord, player, 2).length;
          if (unit.name === "Oplita di Confine" && enemyCountR2) score += 6 + enemyCountR2 * 2.2;
          if (unit.name === "Aratro Corazzato" && enemyCountR2) score += 5 + enemyCountR2 * 1.8;
          if (botAgathoiStructureNetworkScore(player, coord) >= 5) score += 4;
          if (unit.canBuild && state.cells.some(ps => ps.ps && hexDistance(coord, ps.coord) <= 1)) score += 4;
        }
        if (unit.type === "Struttura" || unit.weight === "Pivot") score += 3;
        if (sameCoord(coord, enemyHq.pos) && hasPS && status.qgWinPlan) score += 28;
        else if (sameCoord(coord, enemyHq.pos) && hasPS) score += 10;
        score += psProtectionMoveBonus(player, coord) * 1.6;
        score += homePsMoveScore(unit, coord, status);
        score += commanderProtectionMoveBonus(unit, coord);
        score -= enemiesNear(coord, player, 1).length * (unit.type === "Comandante" ? 4 : 0.2);
        score += botGeneralDoctrineMoveBonus(unit, coord, status);
        score += botAgathoiMoveDoctrineBonus(unit, coord, status);
        return { coord, score };
      }).sort((a,b) => b.score - a.score);
      return scored[0].coord;
    }

function chooseAdvancedFabeotMove(unit, options) {
      const player = unit.side;
      const enemy = enemyOf(player);
      const enemyHq = getHq(enemy);
      const hasPS = countControlledPS(player) >= 1;
      const status = strategicStatus(player);
      const targets = botFabeotDeceptionTargets(player, status);
      const commander = commanderOf(player);
      const collapse = botFabeotCollapseReady(player, status);
      const scored = options.map(coord => {
        let score = 0;
        const cell = getCellAt(coord);
        if (unitIsGarrisoningPs(unit) && !shouldReleasePsGarrison(unit)) score -= 999;
        score += homePsMoveScore(unit, coord, status);
        score += centerMoveScore(unit, coord, status);
        if (!hasPS || status.zeroPsRecovery || status.pressureEmergency) {
          const psTargets = botFabeotLessDefendedPsTargets(player);
          score += psTargets.length ? Math.max(0, 34 - minDistance(coord, psTargets) * 5.2) : 0;
        } else if (targets.length) {
          score += Math.max(0, (collapse ? 28 : 20) - minDistance(coord, targets) * (collapse ? 4.4 : 3.2));
        }
        if (cell && cell.ps && cell.control !== player) score += (status.zeroPsRecovery || status.pressureEmergency) ? 36 : 16;
        if (cell && cell.ps && cell.control === player) score += 7;
        if (enemyHq && sameCoord(coord, enemyHq.pos) && hasPS) {
          score += collapse && status.qgRaiders >= 2 ? 60 : (botFabeotIsBaitUnit(unit) ? 36 : 14);
        }
        if (unit.ability && !unit.ability.passive) {
          const enemyNearRange = combatUnits(enemy).some(e => hexDistance(coord, e.pos) <= Math.max(1, unit.ability.range || 1));
          if (enemyNearRange) score += collapse ? 7 : 5;
        }
        score += botFabeotMoveDoctrineBonus(unit, coord, status) * 1.35;
        const exposed = botFabeotExposedKeyTargets(player);
        if (collapse && exposed.length) score += Math.max(0, 22 - minDistance(coord, exposed.map(e => e.pos)) * 4.2);
        if (!collapse && botFabeotIsValuableUnit(unit) && enemyHq && hexDistance(coord, enemyHq.pos) <= 3) score -= 10;
        if (botFabeotEnemyConcentratedOnDefense(player)) score += botFabeotSplitPressureScore(player, coord, status) * 0.9;
        if (commander && unit.uid !== commander.uid && commanderThreatLevel(commander) > 0) score -= hexDistance(coord, commander.pos) * 2.0;
        score += commanderProtectionMoveBonus(unit, coord);
        score += psProtectionMoveBonus(player, coord) * 1.05;
        score -= enemiesNear(coord, player, 1).length * (unit.type === "Comandante" ? 5 : (collapse ? 0.8 : 1.3));
        score += botGeneralDoctrineMoveBonus(unit, coord, status);
        return { coord, score };
      }).sort((a,b) => b.score - a.score);
      return scored[0].coord;
    }

function chooseAdvancedNexusMove(unit, options) {
      const player = unit.side;
      const enemy = enemyOf(player);
      const enemyHq = getHq(enemy);
      const hasPS = countControlledPS(player) >= 1;
      const status = strategicStatus(player);
      const uncontrolledPS = state.cells.filter(c => c.ps && c.control !== player).map(c => c.coord);
      const controlled = controlledPsCells(player).map(c => c.coord);
      const guardTarget = nearestControlledPsNeedingGuard(player);
      const commander = commanderOf(player);
      const nexusTargets = botNexusPsNetworkTargets(player, status);
      const scored = options.map(coord => {
        let score = 0;
        const cell = getCellAt(coord);
        if (unitIsGarrisoningPs(unit) && !shouldReleasePsGarrison(unit)) score -= 999;
        score += homePsMoveScore(unit, coord, status);
        score += centerMoveScore(unit, coord, status);
        if (!hasPS) score -= minDistance(coord, uncontrolledPS.length ? uncontrolledPS : state.cells.filter(c => c.ps).map(c => c.coord)) * 2.6;
        else if (status.zeroPsRecovery || status.pressureEmergency) score -= minDistance(coord, nexusTargets) * 1.5;
        else if (guardTarget) score -= hexDistance(coord, guardTarget.coord) * 2.2;
        else if (controlled.length && countControlledPS(player) < 2) score -= minDistance(coord, controlled) * 1.1;
        else score -= hexDistance(coord, enemyHq.pos) * (status.qgWinPlan ? 1.15 : 0.45);
        if (cell && cell.ps && cell.control !== player) score += status.zeroPsRecovery || status.pressureEmergency ? 34 : 14;
        if (cell && cell.ps && cell.control === player) score += unit.type === "Struttura" ? 20 : 13;
        if (controlled.some(ps => hexDistance(coord, ps) === 1)) score += 6;
        if (sameCoord(coord, enemyHq.pos) && hasPS) score += status.qgWinPlan ? 55 : 28;
        if (unit.weight === "Pivot") score += alliesNear(coord, player, 1).length * 2.5;
        if (unit.type === "Struttura" && !state.cells.some(c => c.ps && hexDistance(c.coord, coord) <= 1) && !status.hqDanger) score -= 5;
        if (commander && unit.uid !== commander.uid && commanderThreatLevel(commander) > 0) score -= hexDistance(coord, commander.pos) * 2;
        score += commanderProtectionMoveBonus(unit, coord);
        score += psProtectionMoveBonus(player, coord) * 1.15;
        score += botNexusMoveDoctrineBonus(unit, coord, status) * 1.2;
        score += botGeneralDoctrineMoveBonus(unit, coord, status);
        score -= enemiesNear(coord, player, 1).length * (unit.type === "Comandante" ? 4 : 0.6);
        return { coord, score };
      }).sort((a,b) => b.score - a.score);
      return scored[0].coord;
    }

function chooseAdvancedExordiumMove(unit, options) {
      const player = unit.side;
      const status = strategicStatus(player);
      const enemyHq = getHq(enemyOf(player));
      const hasPS = countControlledPS(player) >= 1;
      const fronts = exordiumFrontTargets(player);
      const desiredFront = chooseExordiumFrontForUnit(unit, fronts);
      const commander = commanderOf(player);
      const scored = options.map(coord => {
        let score = 0;
        const cell = getCellAt(coord);
        if (unitIsGarrisoningPs(unit) && !shouldReleasePsGarrison(unit)) score -= 999;
        score += homePsMoveScore(unit, coord, status);
        score += centerMoveScore(unit, coord, status);
        if (!hasPS) score -= minDistance(coord, fronts.map(f => f.ps)) * 2.35;
        else score -= hexDistance(coord, desiredFront.advance) * 1.05;
        score -= hexDistance(coord, enemyHq.pos) * (hasPS ? 0.95 : 0.15);
        if (cell && cell.ps && cell.control !== player) score += status.zeroPsRecovery || status.pressureEmergency ? 28 : 10;
        if (sameCoord(coord, enemyHq.pos) && hasPS) score += 55;
        if (unit.type === "Veicolo") score += 2;
        if (unit.weight === "Pivot" || unit.weight === "Elite") score += 2;
        score += botExordiumMoveDoctrineBonus(unit, coord, status) * 1.25;
        const nearbyAllies = alliesNear(coord, player, 1).length;
        score += botExordiumShockUnit(unit) ? Math.min(5, nearbyAllies * 1.5) : Math.min(4, nearbyAllies * 0.9);
        if (!status.zeroPsRecovery && !status.pressureEmergency && nearbyAllies >= 4) score -= 2;
        if (commander && unit.uid !== commander.uid && commanderThreatLevel(commander) > 0) score -= hexDistance(coord, commander.pos) * 1.8;
        score += commanderProtectionMoveBonus(unit, coord);
        score += psProtectionMoveBonus(player, coord) * 1.25;
        score += botGeneralDoctrineMoveBonus(unit, coord, status);
        return { coord, score };
      }).sort((a,b) => b.score - a.score);
      return scored[0].coord;
    }

function chooseAdvancedLibertiMove(unit, options) {
      const player = unit.side;
      const enemyHq = getHq(enemyOf(player));
      const enemies = combatUnits(enemyOf(player));
      const hasPS = countControlledPS(player) >= 1;
      const status = strategicStatus(player);
      const targets = botLibertiFrontTargets(player, status);
      const flankTarget = libertiFlankTarget(player);
      const mainTarget = hasPS
        ? (status.qgWinPlan ? enemyHq.pos : (hexDistance(unit.pos, flankTarget) > 2 ? flankTarget : enemyHq.pos))
        : (targets.length ? nearestCoord(unit.pos, targets) : [0,0,0]);
      const allies = combatUnits(player).filter(a => a.uid !== unit.uid);
      const commander = commanderOf(player);
      const scored = options.map(coord => {
        let score = 0;
        const cell = getCellAt(coord);
        if (unitIsGarrisoningPs(unit) && !shouldReleasePsGarrison(unit)) score -= 999;
        score += homePsMoveScore(unit, coord, status);
        score += centerMoveScore(unit, coord, status);
        score -= hexDistance(coord, mainTarget) * (hasPS ? 1.15 : 1.85);
        if (targets.length) score += Math.max(0, 18 - minDistance(coord, targets) * 3.4);
        if (hasPS) score += Math.min(3.5, Math.abs(coord[1]) * 0.45);
        if (cell && cell.ps && cell.control !== player) score += status.zeroPsRecovery || status.pressureEmergency ? 28 : 8;
        if (cell && cell.ps && cell.control === player) score += botUnitIsSacrificial(unit) ? 4 : 7;
        if (sameCoord(coord, enemyHq.pos) && hasPS) score += status.qgRaiders >= 2 ? 55 : 24;
        const adjacentAllies = alliesNear(coord, player, 1).length;
        score += adjacentAllies * 2.0;
        for (const enemy of enemies) {
          if (areAdjacent(coord, enemy.pos)) {
            score += 2;
            if (allies.some(a => areAdjacent(a.pos, enemy.pos))) score += 6;
          }
        }
        score += botLibertiMoveDoctrineBonus(unit, coord, status) * 1.35;
        if (commander && unit.uid !== commander.uid && commanderThreatLevel(commander) > 0) score -= hexDistance(coord, commander.pos) * 1.9;
        score += commanderProtectionMoveBonus(unit, coord);
        score += psProtectionMoveBonus(player, coord) * 1.25;
        score += botGeneralDoctrineMoveBonus(unit, coord, status);
        return { coord, score };
      }).sort((a,b) => b.score - a.score);
      return scored[0].coord;
    }

function chooseLibertiMove(unit, options) {
      const enemyHq = getHq(enemyOf(unit.side));
      const enemies = combatUnits(enemyOf(unit.side));
      const enemyTargets = enemies.length ? enemies.map(e => e.pos) : [enemyHq.pos];
      const uncontrolledPS = state.cells.filter(c => c.ps && c.control !== unit.side).map(c => c.coord);
      const allies = combatUnits(unit.side).filter(a => a.uid !== unit.uid);
      const hasPS = countControlledPS(unit.side) >= 1;
      const scored = options.map(coord => {
        let score = 0;
        score -= minDistance(coord, hasPS ? [enemyHq.pos] : uncontrolledPS.length ? uncontrolledPS : [enemyHq.pos]) * 0.95;
        score -= minDistance(coord, enemyTargets) * 0.35;
        const cell = getCellAt(coord);
        if (cell && cell.ps && cell.control !== unit.side) score += 3.5;
        if (sameCoord(coord, enemyHq.pos) && hasPS) score += 20;
        const adjacentAllies = allies.filter(a => areAdjacent(a.pos, coord)).length;
        score += adjacentAllies * 1.8;
        for (const enemy of enemies) {
          if (areAdjacent(coord, enemy.pos)) {
            score += 2;
            const alreadySupported = allies.some(a => areAdjacent(a.pos, enemy.pos));
            if (alreadySupported) score += 5;
          }
        }
        return { coord, score };
      }).sort((a,b) => b.score - a.score);
      return scored[0].coord;
    }

function exordiumFrontTargets(player) {
      const lateral = PS_COORDS.filter(c => !sameCoord(c, [0,0,0]));
      const enemyHq = getHq(enemyOf(player));
      return lateral.map((ps, idx) => ({
        ps,
        advance: idx === 0 ? (player === 1 ? [2,-4,2] : [-2,-2,4]) : (player === 1 ? [2,2,-4] : [-2,4,-2]),
        end: enemyHq.pos
      }));
    }

function chooseExordiumFrontForUnit(unit, fronts) {
      if (!fronts.length) return { ps:[0,0,0], advance:getHq(enemyOf(unit.side)).pos };
      const own = combatUnits(unit.side);
      const counts = fronts.map(f => own.filter(u => hexDistance(u.pos, f.ps) <= 3 || hexDistance(u.pos, f.advance) <= 3).length);
      const preferred = Math.abs(hashString(unit.uid)) % fronts.length;
      const least = counts[0] <= counts[1] ? 0 : 1;
      const idx = counts[preferred] <= counts[least] + 1 ? preferred : least;
      return fronts[idx];
    }

function libertiFlankTarget(player) {
      // C2e-6a MAP1: flank target scala con il nuovo bordo mappa.
      const r = typeof RADIUS === "number" ? RADIUS : 5;
      return player === 1 ? [r - 2, 2, -r] : [2 - r, -2, r];
    }

function hashString(s) {
      let h = 0;
      for (let i = 0; i < String(s).length; i++) h = ((h << 5) - h + String(s).charCodeAt(i)) | 0;
      return h;
    }


// =====================================================
// B7f – AI orchestrator / turn driver
// =====================================================

async function maybeRunBot() {
      if (!state || state.winner || botRunning) return;
      if (state.modes[state.currentPlayer] === "bot") await runBotTurn();
    }

function chooseNextBotUnit(player) {
      if (advancedAiEnabled()) return chooseNextAdvancedBotUnit(player);
      const enemyHq = getHq(enemyOf(player));
      const ownHasPS = countControlledPS(player) >= 1;
      return activeCombatUnits(player).map(u => {
        let score = 0;
        if (ownHasPS) score -= hexDistance(u.pos, enemyHq.pos) * 1.5;
        else score -= minDistance(u.pos, state.cells.filter(c => c.ps && c.control !== player).map(c => c.coord)) * 1.2;
        if (u.type === "Comandante") score += 1;
        if (u.weight === "Pivot") score += 1.5;
        if (u.faction === "Exordium" && u.type === "Veicolo") score += 1;
        if (status.doctrineActive) {
          if (status.pressureWinPlan && getCellAt(u.pos)?.ps) score += 6;
          if (status.qgWinPlan && hexDistance(u.pos, enemyHq.pos) <= 5) score += 8;
          if (status.enemyPressurePlan && state.cells.some(c => c.ps && c.control === enemy && hexDistance(u.pos, c.coord) <= 3)) score += 10;
        }

        if (u.faction === "Nexus") {
          const cell = getCellAt(u.pos);
          if (cell && cell.ps) score += 2;
        }
        if (u.faction === "Liberti") score += combatUnits(player).filter(a => a.uid !== u.uid && areAdjacent(a.pos, u.pos)).length * 1.2;
        return { u, score };
      }).sort((a,b) => b.score - a.score)[0].u;
    }

function chooseNextAdvancedBotUnit(player) {
      const enemy = enemyOf(player);
      const enemyHq = getHq(enemy);
      const ownHq = getHq(player);
      const hasPS = countControlledPS(player) >= 1;
      const commander = commanderOf(player);
      const status = strategicStatus(player);
      logEmergencyIfNeeded(player, status);
      const threatenedPs = controlledPsCells(player).filter(c => enemiesNear(c.coord, player, 2).length > 0);
      const underguardedPs = controlledPsCells(player).filter(c => alliesNear(c.coord, player, 1).length <= 1);
      const units = activeCombatUnits(player);
      if (!units.length) return null;
      const home = homePsCell(player);
      const homeDuty = homePsDutyActive(player, status);
      return units.map(u => {
        let score = 0;
        const adjacentEnemies = combatUnits(enemy).filter(e => areAdjacent(u.pos, e.pos));
        if (status.centerOpening || status.centerLostEarly) {
          const center = centerPsCell();
          if (center) {
            score += Math.max(0, 30 - hexDistance(u.pos, center.coord) * 5);
            if (movableCells(u).some(c => sameCoord(c, center.coord))) score += 60;
            if (adjacentEnemies.some(e => sameCoord(e.pos, center.coord))) score += 22;
            if (u.type === "Comandante" && units.some(x => x.uid !== u.uid && x.type !== "Comandante")) score -= 20;
          }
        }
        if (homeDuty && home) {
          score += Math.max(0, 34 - hexDistance(u.pos, home.coord) * 4.2);
          if (movableCells(u).some(c => sameCoord(c, home.coord))) score += 50;
          if (u.type === "Comandante" && units.some(x => x.uid !== u.uid && x.type !== "Comandante")) score -= 18;
        }
        if (adjacentEnemies.length) score += 8 + adjacentEnemies.length * 2;
        if (hasPS && movableCells(u).some(c => sameCoord(c, enemyHq.pos))) score += 100;
        if (!hasPS && movableCells(u).some(c => getCellAt(c)?.ps)) score += 35;

        // Modalità emergenza: usa per primi i pezzi che possono rompere pressione o difendere QG.
        if (status.active) {
          score += Math.max(0, 26 - minDistance(u.pos, strategicTargetCoords(player, status)) * 4.4);
          if (u.type === "Fanteria" || u.weight === "Leggera") score += status.pressureDanger ? 4 : 1;
          if (u.weight === "Pivot" || u.weight === "Elite") score += status.allIn ? 6 : 2;
          if (adjacentEnemies.some(e => isStrategicEnemyTarget(player, e, status))) score += 18;
          if (status.hqDanger && hexDistance(u.pos, ownHq.pos) <= 3) score += 8;
          if (status.allIn && hasPS) score -= hexDistance(u.pos, enemyHq.pos) * 2.4;
        }

        if (u.type === "Comandante") score += commanderThreatLevel(u) >= 2 ? 16 : -1;
        if (!status.allIn && commander && commanderThreatLevel(commander) > 0 && u.uid !== commander.uid) {
          score -= hexDistance(u.pos, commander.pos) * 2.2;
          if (hexDistance(u.pos, commander.pos) <= 2) score += 6;
        }
        if (threatenedPs.length) score -= minDistance(u.pos, threatenedPs.map(c => c.coord)) * 2.1;
        else if (underguardedPs.length) score -= minDistance(u.pos, underguardedPs.map(c => c.coord)) * 1.25;
        else if (hasPS) score -= hexDistance(u.pos, enemyHq.pos) * 0.8;
        else score -= minDistance(u.pos, state.cells.filter(c => c.ps && c.control !== player).map(c => c.coord)) * 1.5;

        if (unitIsGarrisoningPs(u) && !enemiesNear(u.pos, player, 1).length && !status.hqDanger) score -= 18;

        if (status.doctrineActive) {
          if (status.pressureWinPlan && getCellAt(u.pos)?.ps) score += 6;
          if (status.qgWinPlan && hexDistance(u.pos, enemyHq.pos) <= 5) score += 8;
          if (status.enemyPressurePlan && state.cells.some(c => c.ps && c.control === enemy && hexDistance(u.pos, c.coord) <= 3)) score += 10;
        }

        if (u.faction === "Nexus") {
          const cell = getCellAt(u.pos);
          if (cell && cell.ps && cell.control === player) score += 10;
          if (status.zeroPsRecovery || status.pressureEmergency) {
            const nxTargets = botNexusPsNetworkTargets(player, status);
            if (nxTargets.length) score += Math.max(0, 22 - minDistance(u.pos, nxTargets) * 3.8);
          }
          if (u.weight === "Pivot") score += 5;
          if (u.type === "Struttura") score += nearestControlledPsNeedingGuard(player) ? 7 : 4;
          if (u.type !== "Struttura" && botNexusStructureCountNear(player, u.pos, 2) > 0) score += 3;
        } else if (u.faction === "Exordium") {
          if (u.type === "Veicolo") score += 4;
          if (u.weight === "Pivot" || u.weight === "Elite") score += 4;
          if (hasPS) score += 5;
          if (status.zeroPsRecovery || status.pressureEmergency || status.enemyPressurePlan) {
            const exTargets = botExordiumObjectiveTargets(player, status);
            if (exTargets.length) score += Math.max(0, 28 - minDistance(u.pos, exTargets) * 4.3);
            if (botExordiumShockUnit(u) && botExordiumLineSupportScore(u, u.pos) < 1.2) score -= 5;
          }
          if (botExordiumShockUnit(u) && botExordiumLineSupportScore(u, u.pos) >= 1.2) score += 4;
        } else if (u.faction === "Liberti") {
          score += alliesNear(u.pos, player, 1).length * 2;
          score += botLibertiMoveDoctrineBonus(u, u.pos, status) * 0.55;
          if (hasPS && Math.abs(u.pos[1]) > 1) score += 3;
          if (botLibertiPackSupportScore(u, u.pos) >= 1.2) score += 4;
        } else if (u.faction === "Agathoi") {
          const vsLiberti = state.factions[enemy] === "Liberti";
          const nearbyEnemyCount = enemiesNear(u.pos, player, 2).length;
          if (u.canBuild && (hasPS || combatUnits(player).some(a => a.type === "Struttura"))) score += 5;
          if (u.type === "Struttura" && u.ability && abilityTargets(u, u.ability).length > 0) score += 3;
          if (u.ability && ["inhibit_move", "thorns"].includes(u.ability.statusKind)) score += status.centerLostEarly || status.hqDanger ? 4 : 1;
          if (u.passiveThorns && enemiesNear(u.pos, player, 1).length) score += 4;
          if (vsLiberti) {
            if (u.name === "Oplita di Confine") score += 8 + nearbyEnemyCount * 2;
            if (u.name === "Aratro Corazzato" && u.ability && canUseAbility(u, u.ability) && abilityTargets(u, u.ability).length) score += 10;
            if (u.passiveThorns && nearbyEnemyCount) score += 6;
            if (u.canBuild && countControlledPS(player) >= 1) score += 3;
          }
        }
        return { u, score };
      }).sort((a,b) => b.score - a.score)[0].u;
    }

async function runBotTurn() {
      if (botRunning || state.winner) return;
      botRunning = true;
      const player = state.currentPlayer;
      try {
        renderAll();
        await sleep(220);
        log(`${playerName(player)} è controllato dal bot.`);
        if (typeof canRecoverDeck === "function" && typeof recoverDeckForPlayer === "function") {
          const recovery = canRecoverDeck(player);
          if (recovery.ok) {
            recoverDeckForPlayer(player, { skipRender:true, skipBot:true });
          }
        }
        // C2e-3: il bot valuta tattiche C2, riserva ENE leggera e layer strategico prima del mercato.
        // Così non spende tutta l'ENE ignorando combo, PS centrale, threat map e ciclo deck.
        maybeUseBotHandTactic(player, "prePurchase");
        maybeUseBotTactic(player);
        botPurchasePhase(player);
        // Secondo tentativo dopo gli acquisti: utile se una nuova unità appena piazzata rende valida una tattica.
        maybeUseBotHandTactic(player, "postPurchase");
        maybeUseBotTactic(player);
        renderAll();
        await sleep(260);
        let guard = 0;
        while (!state.winner && state.currentPlayer === player && activeCombatUnits(player).length > 0 && guard < 45) {
          guard++;
          const unit = chooseNextBotUnit(player);
          if (!unit) break;
          botAct(unit);
          removeDeadControl();
          checkVictory();
          // Terzo tentativo dinamico: dopo movimento/combattimento alcune tattiche diventano finalmente sensate.
          maybeUseBotHandTactic(player, "dynamic");
          maybeUseBotTactic(player);
          renderAll();
          await sleep(220);
        }
      } catch (err) {
        console.error(err);
        log(`⚠️ Errore runtime bot: ${err && err.message ? err.message : err}. Turno sbloccato.`);
      } finally {
        botRunning = false;
        if (!state.winner && state.currentPlayer === player) endTurn();
        renderAll();
      }
    }

function botAct(unit) {
      if (unit && unit.type === "Struttura") {
        if (botTryStationaryAction(unit)) endUnitAction(unit);
        else endUnitAction(unit);
        return;
      }
      const enemyHq = getHq(enemyOf(unit.side));
      if (advancedAiEnabled()) {
        const status = strategicStatus(unit.side);
        logEmergencyIfNeeded(unit.side, status);
        if (!status.allIn) {
          const safe = commanderSafetyMove(unit);
          if (safe) {
            moveUnit(unit, safe);
            finishBotMove(unit);
            return;
          }
        }
      }
      if (advancedAiEnabled() && !unit.acted) {
        maybeUseBotHandTactic(unit.side, "preAction");
        maybeUseBotTactic(unit.side);
      }

      if (sameCoord(unit.pos, enemyHq.pos) && countControlledPS(unit.side) < 1) {
        log(`${unit.name} mantiene il QG nemico in attesa del controllo di un PS.`);
        endUnitAction(unit);
        return;
      }
      const winStep = movableCells(unit).find(c => sameCoord(c, enemyHq.pos) && countControlledPS(unit.side) >= 1);
      if (winStep) {
        moveUnit(unit, winStep);
        finishBotMove(unit);
        return;
      }

      if (advancedAiEnabled() && emergencyBotAction(unit)) return;

      if (advancedAiEnabled() && homePsDutyActive(unit.side)) {
        const home = homePsCell(unit.side);
        const homeStep = home ? movableCells(unit).find(c => sameCoord(c, home.coord)) : null;
        if (homeStep) {
          moveUnit(unit, homeStep);
          log(`${unit.name} mette in sicurezza il PS laterale della propria fazione.`);
          finishBotMove(unit);
          return;
        }
      }
      const psStep = movableCells(unit).find(c => {
        const cell = getCellAt(c);
        return cell && cell.ps && cell.control !== unit.side && countControlledPS(unit.side) < 1;
      });
      if (psStep) {
        moveUnit(unit, psStep);
        finishBotMove(unit);
        return;
      }
      if (botTryStationaryAction(unit)) {
        endUnitAction(unit);
        return;
      }
      const currentCell = getCellAt(unit.pos);
      if (advancedAiEnabled() && shouldHoldStrategicCell(unit, currentCell)) {
        log(`${unit.name} presidia il PS conquistato.`);
        endUnitAction(unit);
        return;
      }
      if (currentCell && currentCell.ps && currentCell.control === unit.side && countControlledPS(unit.side) < 2) {
        log(`${unit.name} presidia il Punto Strategico.`);
        endUnitAction(unit);
        return;
      }
      const step = chooseBotMove(unit);
      if (step) {
        moveUnit(unit, step);
        finishBotMove(unit);
      } else {
        log(`${unit.name} non trova movimento utile e resta in posizione.`);
        endUnitAction(unit);
      }
    }


// =====================================================
// B7c – AI purchase / tactics / spawn-build decisions
// =====================================================


// =====================================================
// C2e-1 – Bot Hand Tactic Usage Foundation
// =====================================================
function botHandTacticUseLimit(player) {
      // Limite prudente: il bot può usare al massimo 2 tattiche C2 dalla mano per turno.
      // Evita turni "scarica mano" e mantiene leggibili i test di bilanciamento.
      return state && state.factions && state.factions[player] === "Liberti" ? 2 : 2;
    }

function botHandTacticUsesThisTurn(player) {
      if (!state.c2eBotHandTacticsUsedThisTurn) state.c2eBotHandTacticsUsedThisTurn = { 1:0, 2:0 };
      return state.c2eBotHandTacticsUsedThisTurn[player] || 0;
    }

function markBotHandTacticUsed(player) {
      if (!state.c2eBotHandTacticsUsedThisTurn) state.c2eBotHandTacticsUsedThisTurn = { 1:0, 2:0 };
      state.c2eBotHandTacticsUsedThisTurn[player] = (state.c2eBotHandTacticsUsedThisTurn[player] || 0) + 1;
    }

function botCanUseMoreHandTactics(player) {
      return botHandTacticUsesThisTurn(player) < botHandTacticUseLimit(player);
    }

function botHandTacticCards(player) {
      if (!state || !state.hand || !state.hand[player]) return [];
      return state.hand[player].filter(card => card && card.sourceType === "tactic" && !(typeof handCardBlocked === "function" && handCardBlocked(card)));
    }

function maybeUseBotHandTactic(player, phase="dynamic") {
      if (!advancedAiEnabled() || !botCanUseMoreHandTactics(player)) return false;
      if (typeof canUseHandTacticCard !== "function" || typeof useHandTacticCard !== "function") return false;
      const cards = botHandTacticCards(player).filter(card => {
        const check = canUseHandTacticCard(player, card);
        return check && check.ok;
      });
      if (!cards.length) return false;

      const scored = [];
      for (const card of cards) {
        const normalized = typeof normalizeHandTacticCard === "function" ? normalizeHandTacticCard(card) : card;
        const immediate = typeof isHandTacticImmediateNoTargetCard === "function" && isHandTacticImmediateNoTargetCard(normalized);
        if (immediate) {
          scored.push({ card, target:null, score:scoreBotAdvancedHandTactic(player, normalized, null, phase) });
          continue;
        }
        const targets = typeof handTacticTargets === "function" ? handTacticTargets(player, normalized) : [];
        for (const target of targets) {
          scored.push({ card, target, score:scoreBotAdvancedHandTactic(player, normalized, target, phase) });
        }
      }
      if (!scored.length) return false;
      scored.sort((a,b) => b.score - a.score);
      const best = scored[0];
      let threshold = phase === "prePurchase" ? 6.5 : 5.5;
      const status = strategicStatus(player);
      const counts = botCardCounts(player);
      if (status.allIn || status.hqDanger || status.enemyPressurePlan) threshold -= 1.6;
      if (phase === "preAction") threshold -= 0.8;
      if (counts.hand >= botHandMax(player) - 1) threshold -= 0.7;
      if (botDeckCyclePressure(player)) threshold -= 1.2;
      if (!best || best.score < threshold) return false;
      const used = useHandTacticCard(player, best.card, best.target);
      if (used) {
        markBotHandTacticUsed(player);
        log(`${playerName(player)} usa una tattica C2 dalla mano con priorità AI (${phase}).`, EventTypes.LOG_MESSAGE, {
          player,
          faction: state.factions && state.factions[player],
          cardUid: best.card.cardUid,
          cardName: best.card.name,
          tacticId: best.card.tacticId || best.card.sourceId,
          score: best.score,
          phase,
          source: "C2e-3-bot-hand-tactic"
        });
        return true;
      }
      return false;
    }

function scoreBotHandTactic(player, rawCard, target, phase="dynamic") {
      const card = typeof normalizeHandTacticCard === "function" ? normalizeHandTacticCard(rawCard) : rawCard;
      if (!card) return -99;
      const kind = card.effectKind || "";
      const cost = card.cost || 0;
      const status = strategicStatus(player);
      const enemy = enemyOf(player);
      const ownUnits = combatUnits(player);
      const enemyUnits = combatUnits(enemy);
      let score = Math.max(0, 5 - cost * 0.55);
      if (phase === "prePurchase" && ["draw_conditional_discount","draw_two_buff_drawn_vehicles","draw_if_infantry","draw_by_structures","energy_gain_by_ps","energy_gain_by_kills_this_turn"].includes(kind)) score += 2;

      if (!target) {
        if (kind === "energy_gain_by_ps") return score + countControlledPS(player) * 3 + (commanderOf(player) ? 1.5 : 0);
        if (kind === "energy_gain_by_kills_this_turn") {
          const kills = typeof c2c6bEnemyDestroyedThisTurn === "function" ? c2c6bEnemyDestroyedThisTurn(player) : 0;
          return kills > 0 ? score + 5 + kills * 2 : -99;
        }
        if (kind === "draw_conditional_discount") return score + 5 + (state.deck[player] || []).length * 0.05;
        if (kind === "draw_two_buff_drawn_vehicles") return score + 5 + (state.factions[player] === "Exordium" ? 2 : 0);
        if (kind === "draw_if_infantry") return score + 4 + (state.factions[player] === "Liberti" ? 2 : 0);
        if (kind === "draw_by_structures") return score + Math.min(8, combatUnits(player).filter(u => u.type === "Struttura").length * 2.5);
        if (kind === "enemy_ability_cost_tax") {
          const taxTargets = enemyUnits.filter(u => u && u.ability && !u.ability.passive && (u.ability.cost || 0) > 0).length;
          return taxTargets ? score + 4 + taxTargets * 2 : -99;
        }
        if (kind === "mutual_draw_conditional_steal") return score + 5 + (state.hand && state.hand[enemy] ? Math.min(3, state.hand[enemy].length) : 0);
        if (kind === "block_enemy_hand_cards_by_ps") return countControlledPS(player) > 0 ? score + 5 + countControlledPS(player) * 2 : -99;
        if (kind === "usury_energy_income_debuff") return score + 6 + Math.min(4, state.energy[enemy] || 0);
        return -99;
      }

      const enemyTarget = target.side === enemy;
      const allyTarget = target.side === player;
      const targetLife = target.currentHp + target.currentDef;
      const strategicEnemy = enemyTarget && status.active && isStrategicEnemyTarget(player, target, status);
      if (strategicEnemy) score += 5;
      if (enemyTarget && target.type === "Comandante") score += 2;
      if (enemyTarget && isOnPS(target)) score += 2;

      const damage = typeof handTacticDamageAmount === "function" ? handTacticDamageAmount(card, target) : 0;
      if (["damage_unit","damage_bonus_vs_vehicle","damage_structure","damage_and_cleanse_buffs","damage_and_permanent_attack_debuff","damage_and_permanent_att_debuff","damage_and_bleed","demolition_charge"].includes(kind)) {
        score += damage ? 4 + damage : 3;
        if (damage >= targetLife) score += 7;
        if (kind === "damage_bonus_vs_vehicle" && target.type === "Veicolo") score += 3;
        if ((kind === "damage_structure" || kind === "demolition_charge") && target.type === "Struttura") score += 4;
        if (kind === "damage_and_cleanse_buffs" && ((target.buffs || []).length || (target.statuses || []).length)) score += 2;
        if (kind === "damage_and_bleed" && typeof canBleed === "function" && canBleed(target) && !hasStatus(target, "bleed")) score += 3;
        return score;
      }

      if (["stun_disable","stun_unit","inhibit_attack","set_defense_to_one","set_def_to_one_round","damage_and_permanent_attack_debuff"].includes(kind)) {
        if (!enemyTarget) return -99;
        score += 5 + Math.min(5, effectiveLife(target));
        if (target.acted) score -= 3;
        if (target.att >= 4 || target.weight === "Elite" || target.weight === "Pivot") score += 3;
        return score;
      }

      if (kind === "destroy_non_unique_unit") return enemyTarget ? score + 8 + Math.min(6, target.cost || 0) + (strategicEnemy ? 3 : 0) : -99;
      if (kind === "convert_isolated_enemy_infantry") return enemyTarget ? score + 10 + Math.min(5, target.cost || 0) : -99;
      if (kind === "bounce_unit_to_owner_hand_clean") return enemyTarget ? score + 5 + Math.min(5, target.cost || 0) : (allyTarget && target.currentHp < target.maxHp ? score + 2 : -99);
      if (kind === "bounty_copy_on_death") return enemyTarget ? score + 4 + (targetLife <= 4 ? 4 : 0) : -99;
      if (kind === "enemy_kill_gives_fabeot_energy") return enemyTarget ? score + 4 + (target.att >= 3 ? 2 : 0) : -99;

      if (allyTarget) {
        const readyToAttack = !target.acted && canAttack(target) && combatUnits(enemy).some(e => areAdjacent(target.pos, e.pos));
        const endangered = enemiesNear(target.pos, player, 2).length > 0 || isOnPS(target);
        if (kind === "heal_to_max") {
          const missing = Math.max(0, target.maxHp - target.currentHp);
          return missing > 0 ? score + 4 + missing + (target.type === "Comandante" ? 2 : 0) : -99;
        }
        if (["phase_shield","grant_thorns_two","grant_counterattack","grant_ambush","grant_stealth_vehicle"].includes(kind)) {
          score += endangered ? 5 : 1;
          if (isOnPS(target)) score += 2;
          if (target.type === "Comandante") score += 2;
          return score;
        }
        if (["ignore_defense_permanent","next_attack_ignore_defense","double_attack_next_attack","next_attack_bleed_two","extra_attack_on_kill","grant_stun_on_basic_attack","arena_champion_permanent_attack","sanguis_hunter_scaling_bleed","last_run_sacrifice_aoe"].includes(kind)) {
          score += readyToAttack ? 6 : 2;
          if (target.att >= 3) score += 2;
          if (kind === "arena_champion_permanent_attack") score += Math.min(6, alliesNear(target.pos, player, 1).length * 1.5);
          if (kind === "last_run_sacrifice_aoe" && target.currentHp <= 1) score += 2;
          return score;
        }
        if (["move_after_attack","group_double_move_exhaust"].includes(kind)) return !target.acted ? score + 4 : -99;
        if (["set_structure_def_to_current_hp","green_fortress_structure_growth","structure_income_seed"].includes(kind)) {
          if (target.type !== "Struttura") return -99;
          return score + 4 + (isOnPS(target) ? 2 : 0) + enemiesNear(target.pos, player, 2).length;
        }
      }

      if (["aoe_cell_damage","small_cell_cluster_damage"].includes(kind)) {
        const coord = target.coord || target.pos;
        if (!coord) return -99;
        const enemyHits = combatUnits(enemy).filter(u => hexDistance(u.pos, coord) <= 1).length;
        const allyHits = combatUnits(player).filter(u => hexDistance(u.pos, coord) <= 1).length;
        return enemyHits ? score + enemyHits * 3 - allyHits * 2 : -99;
      }

      if (["temporary_block_cell","cell_movement_trap","vegetal_anathema_trap","bramble_path_trap","cell_movement_boost"].includes(kind)) {
        const coord = target.coord || target.pos;
        if (!coord) return -99;
        const nearPs = state.cells.some(c => c.ps && hexDistance(c.coord, coord) <= 1) ? 3 : 0;
        const nearEnemy = combatUnits(enemy).filter(u => hexDistance(u.pos, coord) <= 2).length;
        return score + nearPs + nearEnemy;
      }

      if (["spawn_two_militia","spawn_predone_with_temp_vanguard","spawn_clan_reinforcements","spawn_militia_around_commander"].includes(kind)) return score + 5;
      if (kind === "coordinated_opportunity_attacks") return enemyTarget ? score + 6 + Math.min(4, targetLife) : -99;
      return -99;
    }


// =====================================================
// C2e-2/C2e-3 – Advanced tactical effect scoring / faction profiles
// =====================================================
function botHandMax(player) {
      return typeof maxHandSizeConfig === "function" ? maxHandSizeConfig() : 10;
    }

function botHandFreeSlots(player) {
      const hand = state && state.hand && state.hand[player] ? state.hand[player] : [];
      return Math.max(0, botHandMax(player) - hand.length);
    }

function botDeckCount(player) {
      return state && state.deck && state.deck[player] ? state.deck[player].length : 0;
    }

function botCardDrawSafetyScore(player, expectedDraws=1) {
      const free = botHandFreeSlots(player);
      const deck = botDeckCount(player);
      if (deck <= 0) return -20;
      if (free <= 0) return -10;
      if (free < expectedDraws) return -4;
      return Math.min(4, free * 0.45) + Math.min(2, deck * 0.05);
    }

function botUnitValue(unit) {
      if (!unit) return 0;
      let value = (unit.cost || 0) + (unit.att || 0) * 0.8 + (unit.currentHp || 0) + (unit.currentDef || 0) * 0.65;
      if (unit.type === "Comandante") value += 4;
      if (unit.weight === "Elite") value += 2.5;
      if (unit.weight === "Pivot") value += 4;
      if (unit.type === "Struttura") value += 1.5;
      if (isOnPS(unit)) value += 2;
      return value;
    }

function botReadyAttackTargets(unit) {
      if (!unit || !isFieldUnit(unit) || unit.acted || !canAttack(unit)) return [];
      return combatUnits(enemyOf(unit.side)).filter(e => areAdjacent(unit.pos, e.pos) && !isUntargetableTo(e, unit.side));
    }

function botHasImmediateAttack(unit) {
      return botReadyAttackTargets(unit).length > 0;
    }

function botBestImmediateAttackValue(unit) {
      const targets = botReadyAttackTargets(unit);
      if (!targets.length) return 0;
      return Math.max(...targets.map(t => scoreAttackTarget(unit, t)));
    }

function botCanUseNextAttackBuffWell(unit) {
      if (!unit || unit.acted) return false;
      if (botHasImmediateAttack(unit)) return true;
      if (unit.moveAttack && movableCells(unit).some(c => combatUnits(enemyOf(unit.side)).some(e => areAdjacent(c, e.pos)))) return true;
      return false;
    }

function botAoeImpactScore(player, coord, radius=1, damage=1) {
      if (!coord) return -99;
      const enemy = enemyOf(player);
      const enemies = combatUnits(enemy).filter(u => hexDistance(u.pos, coord) <= radius);
      const allies = combatUnits(player).filter(u => hexDistance(u.pos, coord) <= radius);
      if (!enemies.length) return -99;
      let score = 0;
      for (const e of enemies) {
        score += 4 + Math.min(5, botUnitValue(e) * 0.35);
        if (damage >= effectiveLife(e)) score += 6;
        if (isOnPS(e)) score += 2;
      }
      for (const a of allies) {
        score -= 3 + Math.min(5, botUnitValue(a) * 0.35);
        if (damage >= effectiveLife(a)) score -= 8;
      }
      return score;
    }

function botCellTacticalScore(player, coord, kind="") {
      if (!coord) return -99;
      const enemy = enemyOf(player);
      let score = 0;
      const cell = getCellAt(coord);
      if (cell && cell.ps) score += cell.control === enemy ? 6 : (cell.control !== player ? 4 : 2);
      const nearEnemy = combatUnits(enemy).filter(u => hexDistance(u.pos, coord) <= 2).length;
      const nearAlly = combatUnits(player).filter(u => hexDistance(u.pos, coord) <= 1).length;
      score += nearEnemy * 1.8;
      if (["temporary_block_cell", "cell_movement_trap", "vegetal_anathema_trap", "bramble_path_trap"].includes(kind)) score += nearEnemy * 1.2 - nearAlly * 0.5;
      if (kind === "cell_movement_boost") score += nearAlly * 1.5;
      const status = strategicStatus(player);
      if (status.active) score += Math.max(0, 8 - minDistance(coord, strategicTargetCoords(player, status)) * 1.6);
      return score;
    }

function botLibertiSuperioritySetup(player, unit) {
      if (!unit) return 0;
      const enemy = enemyOf(player);
      let setups = 0;
      for (const e of combatUnits(enemy)) {
        if (areAdjacent(unit.pos, e.pos) && combatUnits(player).some(a => a.uid !== unit.uid && areAdjacent(a.pos, e.pos))) setups += 1;
      }
      return setups;
    }

function botExpectedStolenDrawValue(player) {
      const enemy = enemyOf(player);
      const deck = state.deck && state.deck[enemy] ? state.deck[enemy] : [];
      if (!deck.length) return 0;
      const sample = deck.slice(-8);
      const valid = sample.filter(c => c && c.sourceType === "unit" && !["commander", "pivot"].includes(c.deckRole) && !/struttura/i.test(String(c.unitType || c.type || ""))).length;
      return valid / Math.max(1, sample.length);
    }

function scoreBotAdvancedHandTactic(player, rawCard, target, phase="dynamic") {
      const card = typeof normalizeHandTacticCard === "function" ? normalizeHandTacticCard(rawCard) : rawCard;
      const base = scoreBotHandTactic(player, card, target, phase);
      if (base <= -90 || !card) return base;
      const kind = card.effectKind || "";
      const faction = state.factions && state.factions[player];
      const enemy = enemyOf(player);
      const status = strategicStatus(player);
      const strategic = evaluateBotStrategicState(player);
      let score = base;
      if (strategic.posture === "svantaggio" && ["damage_unit","damage_bonus_vs_vehicle","stun_disable","stun_unit","inhibit_attack","destroy_non_unique_unit","heal_to_max","phase_shield","grant_counterattack"].includes(kind)) score += 1.2;
      if (strategic.posture === "vantaggio" && ["phase_shield","grant_counterattack","set_structure_def_to_current_hp","green_fortress_structure_growth","structure_income_seed","enemy_ability_cost_tax"].includes(kind)) score += 1.4;
      score += botTacticEmergencyRelevance(player, card, target, status);
      if ((status.pressureEmergency || status.zeroPsRecovery || botClosePressureLockActive(status)) && phase === "prePurchase" && ["draw_conditional_discount","draw_two_buff_drawn_vehicles","draw_if_infantry","draw_by_structures","mutual_draw_conditional_steal","usury_energy_income_debuff","block_enemy_hand_cards_by_ps"].includes(kind)) score -= 6;

      // Profilo generale: in fase pre-acquisto privilegia economie/pesca; dopo acquisti privilegia combo e controllo campo.
      if (phase === "prePurchase" && ["draw_conditional_discount","draw_two_buff_drawn_vehicles","draw_if_infantry","draw_by_structures","energy_gain_by_ps","energy_gain_by_kills_this_turn"].includes(kind)) score += 1.5;
      if (phase !== "prePurchase" && ["next_attack_ignore_defense","double_attack_next_attack","next_attack_bleed_two","extra_attack_on_kill","grant_stun_on_basic_attack","last_run_sacrifice_aoe"].includes(kind)) score += 1.5;

      // Non pescare alla cieca con mano piena o deck quasi vuoto.
      const drawAmounts = {
        draw_conditional_discount: 1,
        draw_two_buff_drawn_vehicles: 2,
        draw_if_infantry: 1,
        draw_by_structures: Math.min(4, combatUnits(player).filter(u => u.type === "Struttura").length),
        mutual_draw_conditional_steal: 1
      };
      if (kind in drawAmounts) {
        score += botCardDrawSafetyScore(player, drawAmounts[kind]);
        if (strategic.ownCards.deck <= 1 && strategic.ownCards.hand <= 3) score -= 3;
      }

      // Effetti no target Fabeot/economia: più valore se mano nemica/deck hanno materiale e se il bot non è saturo.
      if (!target) {
        if (kind === "block_enemy_hand_cards_by_ps") {
          const enemyHand = state.hand && state.hand[enemy] ? state.hand[enemy].filter(c => !(typeof handCardBlocked === "function" && handCardBlocked(c))).length : 0;
          score += enemyHand ? Math.min(5, enemyHand) : -20;
        }
        if (kind === "mutual_draw_conditional_steal") score += botHandFreeSlots(player) > 0 ? 2 : -8;
        if (kind === "usury_energy_income_debuff") score += (state.energy[enemy] || 0) === 0 ? 2 : 0;
        if (kind === "enemy_ability_cost_tax") {
          const dangerousAbilities = combatUnits(enemy).filter(u => u.ability && !u.ability.passive && canUseAbility(u, u.ability)).length;
          score += dangerousAbilities * 1.5;
        }
        return score + botFactionTacticProfileBonus(player, card, target, phase);
      }

      const enemyTarget = target.side === enemy;
      const allyTarget = target.side === player;

      // AoE: calcolo netto più severo su friendly fire.
      if (["aoe_cell_damage","small_cell_cluster_damage"].includes(kind)) {
        const coord = target.coord || target.pos;
        score += botAoeImpactScore(player, coord, 1, 1);
      }

      // Celle/trappole/movimento: più valore su PS, linee di avanzata e pressione.
      if (["temporary_block_cell","cell_movement_trap","vegetal_anathema_trap","bramble_path_trap","cell_movement_boost"].includes(kind)) {
        score += botCellTacticalScore(player, target.coord || target.pos, kind);
      }

      // Rimozioni/controlli: priorità a pezzi costosi, PS e minacce QG.
      if (enemyTarget) {
        score += Math.min(6, botUnitValue(target) * 0.35);
        if (status.active && isStrategicEnemyTarget(player, target, status)) score += 4;
        if (faction === "Exordium") {
          score += botExordiumAntiNexusTargetBonus(player, target, status) * 0.35;
          if ((isOnPS(target) || target.type === "Struttura") && ["damage_unit","damage_bonus_vs_vehicle","damage_structure","damage_and_permanent_attack_debuff","stun_disable","stun_unit","inhibit_attack","set_defense_to_one","set_def_to_one_round","destroy_non_unique_unit"].includes(kind)) score += 3.5;
          if ((target.currentDef || 0) > 0 && ["set_defense_to_one","set_def_to_one_round"].includes(kind)) score += 6;
        }
        if (kind === "convert_isolated_enemy_infantry") score += target.type === "Fanteria" ? 4 : -20;
        if (kind === "destroy_non_unique_unit") score += (target.weight === "Elite" || target.weight === "Pesante") ? 3 : 0;
        if (kind === "bounce_unit_to_owner_hand_clean") score += isOnPS(target) ? 4 : 0;
        if (kind === "bounty_copy_on_death") score += effectiveLife(target) <= 3 ? 4 : -1;
        if (["stun_disable","stun_unit","inhibit_attack"].includes(kind)) score += target.acted ? -5 : 2;
      }

      if (allyTarget) {
        // Buff da prossimo attacco: non sprecarli su unità lontane o già agite.
        if (["next_attack_ignore_defense","double_attack_next_attack","next_attack_bleed_two","extra_attack_on_kill","grant_stun_on_basic_attack","last_run_sacrifice_aoe"].includes(kind)) {
          score += botCanUseNextAttackBuffWell(target) ? 6 + Math.min(4, botBestImmediateAttackValue(target) * 0.15) : -4;
          if (faction === "Exordium" && target.faction === "Exordium" && botExordiumShockUnit(target)) score += botExordiumLineSupportScore(target, target.pos) >= 1 ? 3 : -2;
        }
        if (kind === "arena_champion_permanent_attack") {
          score += Math.min(8, alliesNear(target.pos, player, 1).length * 2);
          if (target.c2c8bArenaChampionApplied) score -= 20;
        }
        if (kind === "sanguis_hunter_scaling_bleed") {
          const nearbyInfantry = combatUnits(enemy).filter(e => e.type === "Fanteria" && hexDistance(e.pos, target.pos) <= 2).length;
          score += nearbyInfantry * 2 + (target.c2c8cSanguisHunter ? -20 : 0);
        }
        if (kind === "grant_ambush") score += enemiesNear(target.pos, player, 2).length ? 4 : -2;
        if (kind === "grant_counterattack") score += enemiesNear(target.pos, player, 2).length + (isOnPS(target) ? 3 : 0);
        if (kind === "heal_to_max") score += target.type === "Comandante" ? 3 : 0;
        if (["set_structure_def_to_current_hp","green_fortress_structure_growth","structure_income_seed"].includes(kind)) score += target.type === "Struttura" && (isOnPS(target) || enemiesNear(target.pos, player, 2).length) ? 3 : 0;
      }

      // Spawn Liberti: valore in base a spazio, scarsità pezzi e pressione.
      if (["spawn_two_militia","spawn_predone_with_temp_vanguard","spawn_clan_reinforcements","spawn_militia_around_commander"].includes(kind)) {
        const fieldCount = combatUnits(player).length;
        score += faction === "Liberti" ? Math.max(0, 9 - fieldCount) : 0;
        if (status.pressureDanger || status.hqDanger) score += 2;
      }

      return score + botFactionTacticProfileBonus(player, card, target, phase);
    }

function botFactionTacticProfileBonus(player, card, target, phase="dynamic") {
      const faction = state.factions && state.factions[player];
      const kind = card && card.effectKind || "";
      let bonus = 0;
      if (faction === "Nexus") {
        if (["phase_shield","ignore_defense_permanent","heal_to_max","cell_movement_trap","damage_and_cleanse_buffs"].includes(kind)) bonus += 1.5;
        if (target && target.side === player && isOnPS(target)) bonus += 2;
        bonus += botNexusTacticProfileBonus(player, card, target, phase);
      } else if (faction === "Exordium") {
        if (["damage_bonus_vs_vehicle","damage_structure","damage_and_permanent_attack_debuff","destroy_non_unique_unit","double_attack_next_attack","extra_attack_on_kill","set_defense_to_one","set_def_to_one_round","stun_disable","inhibit_attack"].includes(kind)) bonus += 2.2;
        if (target && target.side === player && target.type === "Veicolo") bonus += 2;
        if (target && target.side === enemyOf(player) && (isOnPS(target) || target.type === "Struttura")) bonus += 2.5;
      } else if (faction === "Liberti") {
        if (["spawn_two_militia","spawn_predone_with_temp_vanguard","spawn_clan_reinforcements","spawn_militia_around_commander","next_attack_bleed_two","sanguis_hunter_scaling_bleed","arena_champion_permanent_attack","last_run_sacrifice_aoe","coordinated_opportunity_attacks"].includes(kind)) bonus += 2;
        if (target && target.side === player) bonus += botLibertiSuperioritySetup(player, target) * 1.5;
        bonus += botLibertiTacticProfileBonus(player, card, target, phase);
      } else if (faction === "Agathoi") {
        if (["temporary_block_cell","vegetal_anathema_trap","bramble_path_trap","set_structure_def_to_current_hp","green_fortress_structure_growth","grant_counterattack","grant_thorns_two","draw_by_structures","structure_income_seed"].includes(kind)) bonus += 2;
        if (target && target.side === player && target.type === "Struttura") bonus += 2;
        bonus += botAgathoiTacticProfileBonus(player, card, target, phase);
      } else if (faction === "Fabeot") {
        if (["stun_unit","grant_stun_on_basic_attack","bounce_unit_to_owner_hand_clean","convert_isolated_enemy_infantry","bounty_copy_on_death","mutual_draw_conditional_steal","block_enemy_hand_cards_by_ps","enemy_kill_gives_fabeot_energy","usury_energy_income_debuff","grant_stealth_vehicle","next_attack_ignore_defense"].includes(kind)) bonus += 2;
        if (phase === "prePurchase" && ["mutual_draw_conditional_steal","block_enemy_hand_cards_by_ps","usury_energy_income_debuff"].includes(kind)) bonus += 1;
        bonus += botFabeotTacticProfileBonus(player, card, target, phase);
      }
      return bonus;
    }

function maybeUseBotTactic(player) {
      if (!advancedAiEnabled() || state.tacticUsedThisTurn[player]) return false;
      const faction = state.factions[player];
      const options = tacticsForFaction(faction).filter(t => canUseTactic(player, t));
      if (!options.length) return false;
      const scored = [];
      for (const tactic of options) {
        const targets = tactic.target === "none" ? [null] : tacticTargets(player, tactic);
        for (const target of targets) scored.push({ tactic, target, score: scoreBotTactic(player, tactic, target) });
      }
      scored.sort((a,b) => b.score - a.score);
      const best = scored[0];
      if (!best || best.score < 4.5) return false;
      useTactic(player, best.tactic, best.target);
      return true;
    }

function scoreBotTactic(player, tactic, target) {
      const faction = state.factions[player];
      const status = strategicStatus(player);
      let score = Math.max(0, tactic.cost ? 4 - tactic.cost * .25 : 4.5);
      if (tactic.kind === "healArmorOnPS") score += target ? (target.maxHp - target.currentHp) + (target.maxDef - target.currentDef) + 4 + (state.factions[player] === "Nexus" && isOnPS(target) ? 4 : 0) : 0;
      if (tactic.kind === "damageNearPS") score += target ? 5 + (effectiveLife(target) <= (tactic.value || 2) ? 5 : 0) : 0;
      if (tactic.kind === "assaultOrder") score += target ? 6 + (faction === "Exordium" ? (botExordiumShockUnit(target) && botExordiumLineSupportScore(target, target.pos) >= 1 ? 5 : 2) : 0) : 0;
      if (tactic.kind === "warPush") score += target ? 6 + (countControlledPS(player) >= 1 ? 2 : 0) + (status.allIn ? 3 : 0) : 0;
      if (tactic.kind === "hordeCharge") score += target ? 4 + alliesNear(target.pos, player, 1).length * 2 : 0;
      if (tactic.kind === "raidMark") score += target ? (effectiveLife(target) <= 4 ? 7 : 3) : 0;
      if (tactic.kind === "defensiveRoots") score += target ? 5 + (isOnPS(target) ? 3 : 0) : 0;
      if (tactic.kind === "greenWall") score += combatUnits(player).filter(u => u.type !== "Struttura" && combatUnits(player).some(s => s.type === "Struttura" && areAdjacent(s.pos, u.pos)) && u.currentDef < u.maxDef).length * 2;
      if (tactic.kind === "logisticChoke") score += target ? 5 + (target.att > 3 ? 2 : 0) : 0;
      if (tactic.kind === "contractTrap") score += state.energy[enemyOf(player)] >= 3 ? 8 : 4;
      score += botTacticEmergencyRelevance(player, tactic, target, status);
      score += botSuperiorDoctrineTacticBonus(player, tactic, target, status);
      if (status.pressureDanger || status.hqDanger || status.allIn) score += 2;
      return score;
    }

function maybeUseBotPrePurchaseEconomyAbility(player) {
      if (!advancedAiEnabled() || state.factions[player] !== "Fabeot") return false;
      const candidates = activeCombatUnits(player).filter(u => {
        const ab = u.ability;
        return ab && !ab.passive && ab.kind === "deploymentDiscount" && canUseAbility(u, ab) && abilityTargets(u, ab).length > 0;
      });
      if (!candidates.length) return false;

      const usable = candidates.find(u => {
        const ab = u.ability;
        return BLUEPRINTS.some(bp => {
          if (bp.faction !== state.factions[player] || bp.type === "Struttura" || purchaseLimitReached(player, bp)) return false;
          const discountedCost = Math.max(ab.minCost ?? 1, effectiveBlueprintCost(player, bp) + (ab.value || -1));
          return state.energy[player] >= discountedCost;
        });
      });

      if (!usable) return false;
      useAbility(usable, usable, usable.ability);
      log(`${usable.name} apre lo Sportello di Reclutamento prima degli acquisti del bot.`);
      return true;
    }

function botPurchasePhase(player) {
      maybeUseBotPrePurchaseEconomyAbility(player);
      let buys = 0;
      const status = advancedAiEnabled() ? strategicStatus(player) : { active:false, allIn:false };
      let maxBuys = state.factions[player] === "Liberti" ? 3 : (state.factions[player] === "Exordium" ? 3 : (state.factions[player] === "Fabeot" ? 3 : 2));
      if (status.active) maxBuys += 1;
      if (status.allIn) maxBuys += 1;
      maxBuys = Math.min(maxBuys, 5);
      while (buys < maxBuys) {
        const choice = chooseBestBotRosterPlay(player);
        if (!choice) break;
        const ok = executeBotRosterPlay(player, choice);
        if (!ok) break;
        buys++;
      }
    }

function chooseBestBotRosterPlay(player) {
      const choices = [];
      const handChoice = chooseBotHandCardPlay(player);
      if (handChoice) choices.push(handChoice);
      const marketChoice = chooseBotPurchase(player);
      if (marketChoice) choices.push({ ...marketChoice, source:"market", score:(marketChoice.score || 0) });
      if (!choices.length) return null;
      botApplyEneReserveToChoices(player, choices);
      choices.sort((a,b) => (b.score || 0) - (a.score || 0));
      return choices[0];
    }

function executeBotRosterPlay(player, choice) {
      if (!choice || !choice.bp) return false;
      let ok = false;
      const previousPendingHandCardUid = pendingHandCardUid;
      if (choice.cardUid) pendingHandCardUid = choice.cardUid;
      try {
        if (choice.bp.type === "Struttura") {
          if (!choice.builder || !choice.coord) return false;
          ok = buildStructure(choice.builder, choice.bp, choice.coord);
          if (ok) {
            if (choice.cardUid && typeof completeHandCardUnitPlay === "function") completeHandCardUnitPlay(player, choice.cardUid, choice.bp);
            endUnitAction(choice.builder);
          }
        } else {
          if (!choice.coord) return false;
          ok = spawnUnit(choice.bp, player, choice.coord);
          if (ok && choice.cardUid && typeof completeHandCardUnitPlay === "function") completeHandCardUnitPlay(player, choice.cardUid, choice.bp);
        }
      } finally {
        pendingHandCardUid = previousPendingHandCardUid;
      }
      if (ok && choice.source === "hand") {
        log(`${playerName(player)} gioca dalla mano ${choice.cardName || choice.bp.name}.`, EventTypes.LOG_MESSAGE, {
          player,
          faction: state.factions[player],
          cardUid: choice.cardUid || null,
          blueprintId: choice.bp.id,
          source:"C1g-bot-hand-play"
        });
        if (choice.c2e3aLastCardForce) {
          log(`${playerName(player)} libera l'ultima carta giocabile per riattivare il ciclo deck.`, EventTypes.LOG_MESSAGE, {
            player,
            faction: state.factions[player],
            cardUid: choice.cardUid || null,
            blueprintId: choice.bp.id,
            source:"C2e-3a-last-card-cycle"
          });
        }
      }
      return ok;
    }

function chooseBotHandCardPlay(player) {
      if (!state || !state.hand || !state.hand[player] || playerHandLocked(player) || playerEnergyLocked(player)) return null;
      const faction = state.factions[player];
      const field = combatUnits(player);
      const enemyField = combatUnits(enemyOf(player));
      const hq = getHq(player);
      const enemyNearHq = combatUnits(enemyOf(player)).some(e => hq && hexDistance(e.pos, hq.pos) <= QG_THREAT_RANGE);
      const scored = [];
      for (const card of state.hand[player]) {
        if (!card || card.sourceType !== "unit" || !card.blueprintId) continue;
        const bp = typeof blueprintForHandCard === "function" ? blueprintForHandCard(card, player) : BLUEPRINTS.find(x => x.id === card.blueprintId && x.faction === faction);
        if (!bp || purchaseLimitReached(player, bp)) continue;
        if (bp.type === "Struttura") {
          const baseCost = typeof effectiveHandUnitCardCost === "function" ? effectiveHandUnitCardCost(player, card, bp) : effectiveBlueprintCost(player, bp);
          if (state.energy[player] < baseCost) continue;
          const builders = activeCombatUnits(player).filter(b => canBuildStructures(b) && buildableCells(b).length > 0);
          for (const builder of builders) {
            const coord = chooseBuildCell(builder, buildableCells(builder));
            if (!coord) continue;
            let score = botCardPlayScore(player, bp, card, field, enemyField, enemyNearHq) + buildCellStrategicScore(builder, coord) * 0.18;
            score += botGeneralDoctrineCoordBonus(player, bp, coord, strategicStatus(player)) * 0.18;
            score += 1.5 + botHandCardCycleScore(player, bp, card);
            const choice = { source:"hand", bp, cardUid:card.cardUid, cardName:card.name, builder, coord, cost:baseCost, score };
            if (botShouldForceLastCardPlay(player, choice)) {
              choice.c2e3aLastCardForce = true;
              choice.score += 80;
            }
            scored.push(choice);
          }
        } else {
          const cells = spawnCellsFor(player, bp).filter(c => state.energy[player] >= (typeof effectiveHandUnitCardCost === "function" ? effectiveHandUnitCardCost(player, card, bp, c) : effectiveBlueprintCost(player, bp, c)));
          if (!cells.length) continue;
          const coord = chooseSpawnCell(player, bp, cells);
          let score = botCardPlayScore(player, bp, card, field, enemyField, enemyNearHq);
          score += botGeneralDoctrineCoordBonus(player, bp, coord, strategicStatus(player)) * 0.16;
          score += 2.5 + botHandCardCycleScore(player, bp, card);
          const handCost = typeof effectiveHandUnitCardCost === "function" ? effectiveHandUnitCardCost(player, card, bp, coord) : effectiveBlueprintCost(player, bp, coord);
          const choice = { source:"hand", bp, cardUid:card.cardUid, cardName:card.name, coord, cost:handCost, score };
          if (botShouldForceLastCardPlay(player, choice)) {
            choice.c2e3aLastCardForce = true;
            choice.score += 80;
          }
          scored.push(choice);
        }
      }
      scored.sort((a,b) => b.score - a.score);
      return scored[0] || null;
    }

function botCardPlayScore(player, bp, card, field, enemyField, enemyNearHq) {
      let score = state.factions[player] === "Liberti" ? scoreLibertiPurchase(bp, field, enemyField, enemyNearHq) : scoreFactionPurchase(player, bp, field, enemyField, enemyNearHq);
      if (card.deckRole === "commander") score += commanderOf(player) ? -8 : 8;
      if (card.deckRole === "pivot" || bp.weight === "Pivot") score += field.length >= 4 ? 7 : 2;
      if (card.deckRole === "elite" || bp.weight === "Elite") score += 4;
      if (card.deckRole === "heavy" || String(bp.weight || "").toLowerCase().startsWith("pesant")) score += 2.5;
      if (bp.ability && !bp.ability.passive) score += 1.5;
      if (bp.vanguard) score += 2;
      return score;
    }

function chooseBotPurchase(player) {
      const faction = state.factions[player];
      const available = BLUEPRINTS.filter(u => u.faction === faction && canAffordBlueprint(player, u) && !purchaseLimitReached(player, u));
      if (!available.length) return null;
      const hq = getHq(player);
      const enemyNearHq = combatUnits(enemyOf(player)).some(e => hexDistance(e.pos, hq.pos) <= QG_THREAT_RANGE);
      const field = combatUnits(player);
      const enemyField = combatUnits(enemyOf(player));
      const scored = [];
      for (const bp of available) {
        if (bp.type === "Struttura") {
          const builders = activeCombatUnits(player).filter(b => canBuildStructures(b) && buildableCells(b).length > 0);
          for (const builder of builders) {
            const coord = chooseBuildCell(builder, buildableCells(builder));
            let score = 1.5 + (enemyNearHq ? 5 : 0) + bp.cost;
            const status = advancedAiEnabled() ? strategicStatus(player) : null;
            if (advancedAiEnabled() && status && (status.centerOpening || status.centerLostEarly) && faction !== "Agathoi") score -= 4;
            if (advancedAiEnabled() && coord) {
              score += buildCellStrategicScore(builder, coord) * 0.22;
              score += botGeneralDoctrineCoordBonus(player, bp, coord, strategicStatus(player)) * 0.12;
            }
            if (faction === "Nexus" && countControlledPS(player) >= 1) score += 2;
            if (advancedAiEnabled() && faction === "Nexus" && controlledPsCells(player).length && nearestControlledPsNeedingGuard(player)) score += 3;
            if (advancedAiEnabled() && faction === "Agathoi") score += countControlledPS(player) >= 1 ? 4 : 1;
            if (advancedAiEnabled() && faction === "Fabeot") score += countControlledPS(player) >= 1 ? 3 : 0;
            if (advancedAiEnabled() && faction === "Liberti") score -= field.length < 6 ? 4 : 0;
            else if (faction === "Liberti") score -= field.length < 5 ? 3 : 0;
            const cost = effectiveBlueprintCost(player, bp, coord);
            scored.push({ bp, builder, coord, cost, score });
          }
        } else {
          const cells = spawnCellsFor(player, bp).filter(c => state.energy[player] >= effectiveBlueprintCost(player, bp, c));
          if (cells.length) {
            const coord = chooseSpawnCell(player, bp, cells);
            let score = scoreFactionPurchase(player, bp, field, enemyField, enemyNearHq);
            if (advancedAiEnabled()) score += botGeneralDoctrineCoordBonus(player, bp, coord, strategicStatus(player)) * 0.10;
            if (faction === "Liberti") {
              score = scoreLibertiPurchase(bp, field, enemyField, enemyNearHq);
              if (advancedAiEnabled()) score += botGeneralDoctrineCoordBonus(player, bp, coord, strategicStatus(player)) * 0.10;
            }
            const cost = effectiveBlueprintCost(player, bp, coord);
            scored.push({ bp, coord, cost, score });
          }
        }
      }
      scored.sort((a,b) => b.score - a.score);
      return scored[0] || null;
    }

function scoreFactionPurchase(player, bp, field, enemyField, enemyNearHq) {
      const faction = state.factions[player];
      const hasPS = countControlledPS(player) >= 1;
      const enemyHasPS = countControlledPS(enemyOf(player)) >= 1;
      let score = bp.cost + bp.att + bp.def * 0.35;
      if (field.length < 2 && bp.type !== "Comandante") score += 5;
      if (enemyNearHq && (bp.type === "Fanteria" || bp.type === "Comandante" || bp.weight === "Pesante")) score += 4;
      if (bp.weight === "Leggera" && activeLightCount(player) < 3) score += 3;
      if (advancedAiEnabled() && botOpeningDoctrineActive()) {
        if (bp.cost <= 1 && bp.type !== "Struttura") score += 5;
        if (bp.cost === 2 && field.length <= 1) score += 3.5;
        if (bp.cost === 3 && field.length <= 1) score += 3;
        if (bp.type === "Struttura" && countControlledPS(player) >= 1) score += 6;
      }

      if (faction === "Nexus") {
        if (!hasPS && (bp.weight === "Leggera" || bp.type === "Fanteria")) score += 4;
        if (hasPS && (bp.weight === "Pivot" || bp.type === "Struttura" || bp.weight === "Pesante")) score += 3;
        if (enemyHasPS && bp.type === "Veicolo") score += 1.5;
      } else if (faction === "Exordium") {
        const status = advancedAiEnabled() ? strategicStatus(player) : { zeroPsRecovery:false, pressureEmergency:false, enemyPressurePlan:false, ownPs:countControlledPS(player), enemyPs:countControlledPS(enemyOf(player)) };
        if (hasPS && (bp.type === "Veicolo" || bp.weight === "Pivot" || bp.weight === "Elite")) score += 5;
        if (!hasPS && (bp.weight === "Leggera" || bp.cost <= 2)) score += 4;
        if ((status.zeroPsRecovery || status.pressureEmergency || status.enemyPressurePlan) && (bp.type === "Fanteria" || bp.type === "Veicolo")) score += 5;
        if (bp.type === "Struttura" && (status.zeroPsRecovery || status.pressureEmergency || status.ownPs <= 1)) score += 4;
        if (bp.type === "Comandante" && field.length < 3) score -= 1.5;
      }
      if (advancedAiEnabled()) score += advancedPurchaseBonus(player, bp, field, enemyField, enemyNearHq);
      score += c1gRosterPurchaseBonus(player, bp, field, enemyField, enemyNearHq);
      return score;
    }

function scoreLibertiPurchase(bp, field, enemyField, enemyNearHq) {
      const fieldCount = field.length;
      let score = 0;
      if (fieldCount < 5) {
        score += 10 - bp.cost * 1.7;
        if (bp.type === "Fanteria" || bp.type === "Veicolo") score += 3;
        if (bp.type === "Comandante") score -= 3;
        if (bp.weight === "Leggera") score += 2;
        if (bp.weight === "Pesante") score += 1;
      } else {
        score += bp.cost + bp.att + (bp.type === "Comandante" ? 2 : 0);
      }
      if (advancedAiEnabled() && botOpeningDoctrineActive()) {
        if (bp.cost <= 1) score += 4;
        if (bp.cost === 2 && fieldCount <= 1) score += 2;
      }
      if (enemyNearHq && bp.cost <= 2) score += 3;
      if (enemyField.length > fieldCount && bp.cost <= 2) score += 2;
      if (bp.name.includes("Titanus") && fieldCount < 4) score -= 2;
      if (advancedAiEnabled()) {
        const status = strategicStatus(state.currentPlayer);
        score += centerPurchaseBonus(state.currentPlayer, bp, status);
        score += botLibertiPurchaseDoctrineBonus(state.currentPlayer, bp, field, enemyField, enemyNearHq, status);
        if (fieldCount < 7 && bp.cost <= 2) score += 3;
        if (countControlledPS(state.currentPlayer) >= 1 && (bp.weight === "Leggera" || bp.weight === "Pesante")) score += 2;
        if (bp.weight === "Pivot" && fieldCount >= 5) score += 4;
      }
      return score;
    }

function c1gRosterPurchaseBonus(player, bp, field, enemyField, enemyNearHq) {
      if (!bp) return 0;
      const faction = state.factions[player];
      const status = advancedAiEnabled() ? strategicStatus(player) : { active:false, allIn:false, pressureDanger:false, hqDanger:false };
      let score = 0;
      if (bp.vanguard) score += 3;
      if (bp.antiStructureAtt && enemyField.some(e => e.type === "Struttura")) score += 3 + bp.antiStructureAtt;
      if (bp.frontLine && field.some(u => u.type !== "Struttura")) score += 2;
      if (bp.specialSpawn) score += field.length >= 3 ? 4 : 1;
      if (bp.spawnAdjacentPermanentAtt) score += 4;
      if (bp.capBonus) score += 2;
      if (bp.stealthDraw) score += 3;
      if (bp.createCardFromEnemyDeathRange) score += 2;
      if (bp.costAdjacencyVehicle && field.some(u => u.type === "Veicolo")) score += 2;
      if (bp.dynamicDefAdjacentUnits || bp.dynamicDefAdjacentStructures) score += faction === "Agathoi" ? 3 : 1;
      if (bp.dawnHealAdjacentIfNearStructure || bp.dawnHealStructures || bp.dawnMaxHpBoost) score += faction === "Agathoi" ? 3 : 1;
      if (bp.abilityUntargetableAdjacentStructure) score += field.some(u => u.type === "Struttura") ? 4 : 1;
      if (bp.ability) {
        const kind = bp.ability.kind;
        if (["damage", "shred", "flameArea"].includes(kind)) score += status.active ? 4 : 2;
        if (["spawnBlueprint", "placeMine"].includes(kind)) score += field.length >= 2 ? 3 : 1;
        if (["lockEnemyEnergy", "copyRandomEnemyHandCard", "cleansePositive"].includes(kind)) score += faction === "Fabeot" ? 3 : 1;
        if (["relocateAlly", "abilityUntargetable", "duplicateStructureAbility"].includes(kind)) score += field.length >= 3 ? 2 : 0;
        if (kind === "status" && bp.ability.target === "self") score += enemyNearHq || status.hqDanger ? 2 : 1;
      }
      // C1g-a: rimossa ricorsione infinita accidentale.
      return score;
    }

function chooseSpawnCell(player, unit, options) {
      if (advancedAiEnabled()) return chooseAdvancedSpawnCell(player, unit, options);
      const enemyHq = getHq(enemyOf(player));
      const targets = countControlledPS(player) >= 1 ? [enemyHq.pos] : state.cells.filter(c => c.ps).map(c => c.coord);
      return options.sort((a,b) => minDistance(a, targets) - minDistance(b, targets))[0];
    }

function chooseAdvancedSpawnCell(player, unit, options) {
      const faction = state.factions[player];
      const enemyHq = getHq(enemyOf(player));
      const hasPS = countControlledPS(player) >= 1;
      const commander = commanderOf(player);
      const status = strategicStatus(player);
      const safeOptions = options.filter(c => botCellDangerPenalty(player, c, unit, status) < 18);
      const candidateOptions = safeOptions.length ? safeOptions : options;
      let targets = hasPS ? [enemyHq.pos] : state.cells.filter(c => c.ps && c.control !== player).map(c => c.coord);
      if (status.centerOpening || status.centerLostEarly) targets = [centerPsCell().coord];
      else if (status.active) targets = strategicTargetCoords(player, status);
      if (!targets.length) targets = state.cells.filter(c => c.ps).map(c => c.coord);
      if (!status.active && faction === "Exordium" && hasPS) targets = exordiumFrontTargets(player).map(f => f.advance);
      if (!status.active && faction === "Liberti" && hasPS) targets = [libertiFlankTarget(player)];
      return candidateOptions.map(coord => {
        let score = -minDistance(coord, targets);
        if (sameCoord(coord, enemyHq.pos) && hasPS) score += 40;
        if (status.active) score += strategicMoveBonus(player, unit, coord, status) * 1.15;
        score += botGeneralDoctrineCoordBonus(player, unit, coord, status) * 0.45;
        if (status.centerOpening || status.centerLostEarly) score += centerMoveScore(unit, coord, status) * 0.35;
        score += botCenterPsBonus(player, coord) * 0.55;
        score -= botThreatPenalty(player, coord, unit) * 0.35;
        if (faction === "Nexus") score += psProtectionMoveBonus(player, coord) * 1.4 + botNexusCoordDoctrineBonus(player, unit, coord, status) * 0.65;
        if (faction === "Exordium") score += botExordiumCoordDoctrineBonus(player, unit, coord, status) * 0.65 - Math.max(0, alliesNear(coord, player, 1).length - 2) * 0.35;
        if (faction === "Liberti") score += alliesNear(coord, player, 1).length * 1.15;
        if (!status.allIn && commander && commanderThreatLevel(commander) > 0) score -= hexDistance(coord, commander.pos) * 1.7;
        return { coord, score };
      }).sort((a,b) => b.score - a.score)[0].coord;
    }

function buildCellStrategicScore(builder, coord) {
      if (!builder || !coord) return 0;
      const player = builder.side;
      const faction = state.factions[player];
      const cell = getCellAt(coord);
      const home = homePsCell(player);
      const center = centerPsCell();
      let score = 0;

      // Non è una regola obbligatoria: è un peso. Se costruire su PS è possibile e sensato, il bot lo considera seriamente.
      if (cell && cell.ps) {
        score += 30;
        if (!cell.control) score += 8;
        if (cell.control && cell.control !== player) score += 14;
        if (home && sameCoord(coord, home.coord)) score += 16;
        if (center && sameCoord(coord, center.coord)) score += 10;
        if (faction === "Agathoi") score += 12;
        if (faction === "Nexus") score += 8;
        if (faction === "Fabeot") score += 5;
      }

      const adjacentControlledPs = controlledPsCells(player).some(ps => hexDistance(coord, ps.coord) === 1);
      if (adjacentControlledPs) score += 7;
      score += botCenterPsBonus(player, coord) * 0.45;
      if (faction === "Agathoi") {
        const nearbyOwnStructures = combatUnits(player).filter(u => u.faction === "Agathoi" && u.type === "Struttura" && hexDistance(coord, u.pos) <= 2).length;
        score += nearbyOwnStructures * 4;
        if (state.cells.some(ps => ps.ps && hexDistance(coord, ps.coord) <= 1)) score += 8;
        if (center && hexDistance(coord, center.coord) <= 1) score += 6;
        score += botAgathoiCoordDoctrineBonus(player, { ...builder, faction:"Agathoi", type:"Struttura", weight:"Struttura", cost:3, hp:3, def:3, att:0 }, coord, strategicStatus(player)) * 0.55;
      }
      if (faction === "Exordium") {
        const status = strategicStatus(player);
        const exTargets = botExordiumObjectiveTargets(player, status);
        if (exTargets.length && minDistance(coord, exTargets) <= 1) score += 16;
        if (center && hexDistance(coord, center.coord) <= 2) score += 6;
        if ((status.zeroPsRecovery || status.pressureEmergency) && exTargets.length && minDistance(coord, exTargets) >= 4) score -= 12;
      }
      if (faction === "Nexus") {
        const status = strategicStatus(player);
        score += botNexusCoordDoctrineBonus(player, { ...builder, faction:"Nexus", type:"Struttura", weight:"Struttura", cost:3, hp:3, def:2, att:0 }, coord, status) * 0.55;
        if (center && hexDistance(coord, center.coord) <= 1) score += 6;
      }
      if (faction === "Fabeot") {
        const status = strategicStatus(player);
        score += botFabeotCoordDoctrineBonus(player, { ...builder, faction:"Fabeot", type:"Struttura", weight:"Struttura", cost:3, hp:3, def:1, att:0 }, coord, status) * 0.55;
        if (botFabeotAllyHalf(player, coord) && !(status.zeroPsRecovery || status.pressureEmergency)) score += 4;
        if (center && hexDistance(coord, center.coord) <= 1) score += 4;
      }

      const nearbyEnemies = enemiesNear(coord, player, 2).length;
      if (nearbyEnemies) score += Math.min(8, nearbyEnemies * 3);

      const status = strategicStatus(player);
      if (status.hqDanger && status.ownHq && hexDistance(coord, status.ownHq.pos) <= 1) score += 28;
      score += botQGAccessBlockBonus(player, coord, { type:"Struttura", weight:"Struttura" }, status) * 0.8;
      if (status.closePressureLock) score += botClosePressureLockBonus(botFakeUnitForCoord(player, { ...builder, type:"Struttura", weight:"Struttura", cost:3, hp:3, def:2, att:0 }, coord), coord, status) * 0.5;
      score += botObjectiveRecoveryBonus(botFakeUnitForCoord(player, { ...builder, type:"Struttura", weight:"Struttura", cost:3, hp:3, def:2, att:0 }, coord), coord, status) * 0.45;
      score -= botCellDangerPenalty(player, coord, { type:"Struttura", weight:"Struttura" }, status) * 0.9;
      for (const ps of controlledPsCells(player)) {
        const posture = botControlledPsPosture(player, ps);
        const d = hexDistance(coord, ps.coord);
        if (posture === "fortify" && d <= 1) score += 12;
        if (posture === "clearThreat" && d <= 1) score += 10;
      }
      const enemyHq = getHq(enemyOf(player));
      if (enemyHq && hexDistance(coord, enemyHq.pos) <= 5) score += faction === "Exordium" ? 5 : 2;
      return score;
    }

function chooseBuildCell(unit, options) {
      const hq = getHq(unit.side);
      const enemies = combatUnits(enemyOf(unit.side)).map(e => e.pos);
      const targets = enemies.length ? enemies : [hq.pos];
      if (advancedAiEnabled()) {
        const status = strategicStatus(unit.side);
        const safeOptions = options.filter(coord => botCellDangerPenalty(unit.side, coord, { type:"Struttura" }, status) < 18);
        const candidateOptions = safeOptions.length ? safeOptions : options;
        return candidateOptions.map(coord => ({
          coord,
          score: buildCellStrategicScore(unit, coord) - minDistance(coord, targets) * 0.8 - botCellDangerPenalty(unit.side, coord, { type:"Struttura" }, status) + botQGAccessBlockBonus(unit.side, coord, { type:"Struttura" }, status)
        })).sort((a,b) => b.score - a.score)[0].coord;
      }
      return options.sort((a,b) => minDistance(a, targets) - minDistance(b, targets))[0];
    }

function centerPurchaseBonus(player, bp, status=strategicStatus(player)) {
      if (!(status.centerOpening || status.centerLostEarly)) return 0;
      let score = 0;
      if (status.centerOpening) {
        if (bp.weight === "Leggera") score += 6;
        if (bp.type === "Fanteria" || bp.type === "Veicolo") score += 4;
        if (bp.type === "Struttura") score -= state.factions[player] === "Agathoi" ? 1 : 4;
        if (bp.type === "Comandante" && combatUnits(player).length < 2) score -= 2;
      }
      if (status.centerLostEarly) {
        const kind = bp.ability && bp.ability.kind;
        const statusish = bp.ability && (bp.ability.statusKind || ["damage", "directDamage", "shred", "status", "psLock", "vulnerableMark", "swapAlly"].includes(kind));
        if (statusish) score += 6;
        if (bp.weight === "Pesante" || bp.weight === "Elite") score += 3;
        if (bp.weight === "Leggera") score += 3;
        if (bp.type === "Struttura" && state.factions[player] !== "Agathoi") score -= 4;
      }
      return score;
    }

function advancedPurchaseBonus(player, bp, field, enemyField, enemyNearHq) {
      const faction = state.factions[player];
      const enemy = enemyOf(player);
      const enemyFaction = state.factions[enemy];
      const hasPS = countControlledPS(player) >= 1;
      const enemyHasPS = countControlledPS(enemy) >= 1;
      const status = strategicStatus(player);
      let score = 0;
      const strategic = evaluateBotStrategicState(player);
      const commander = commanderOf(player);
      score += centerPurchaseBonus(player, bp, status);
      if (!commander && bp.type === "Comandante" && field.length >= 2) score += 4;
      if (!status.allIn && commander && commanderThreatLevel(commander) > 0 && (bp.weight === "Leggera" || bp.type === "Fanteria")) score += 5;
      if (nearestControlledPsNeedingGuard(player) && (bp.weight === "Leggera" || bp.weight === "Pesante" || bp.type === "Struttura")) score += 3;
      if (strategic.centerMissing && (bp.weight === "Leggera" || bp.type === "Fanteria" || bp.type === "Veicolo")) score += 2.5;
      if (strategic.posture === "svantaggio" && (bp.cost <= 2 || bp.weight === "Leggera")) score += 2;
      if (strategic.deckCyclePressure && bp.type !== "Struttura" && bp.cost <= 3) score += 1.2;

      if (status.zeroPsRecovery || status.pressureEmergency || status.defendQGRecovery) {
        if (bp.weight === "Leggera" || bp.cost <= 2 || bp.type === "Fanteria" || bp.type === "Veicolo") score += 7;
        if (bp.type === "Struttura") score += status.defendQGRecovery ? 3 : 5;
        if (bp.type === "Comandante" && field.length >= 2 && !status.allIn) score -= 2;
      }
      if (status.active) {
        if (status.hqDanger && (bp.weight === "Leggera" || bp.type === "Fanteria" || bp.weight === "Pesante")) score += 8;
        if (status.hqDanger && bp.type === "Struttura") score += 8;
        if ((status.pressureDanger || status.enemyPressurePlan) && (bp.weight === "Leggera" || bp.type === "Fanteria" || bp.type === "Veicolo")) score += 6;
        if (status.pressureWinPlan && (bp.type === "Struttura" || bp.weight === "Pesante" || bp.weight === "Elite")) score += 4;
        if (status.closePressureLock && (bp.weight === "Leggera" || bp.type === "Fanteria" || bp.type === "Struttura")) score += 7;
        if (status.hqDanger && (bp.type === "Struttura" || bp.weight === "Leggera" || bp.type === "Fanteria" || bp.type === "Veicolo")) score += 5;
        if (status.qgWinPlan && !status.closePressureLock && (bp.type === "Veicolo" || bp.weight === "Leggera" || bp.weight === "Elite")) score += 4;
        if (status.allIn && (bp.weight === "Pivot" || bp.weight === "Elite" || bp.type === "Veicolo" || bp.type === "Comandante")) score += 6;
        if (bp.type === "Struttura" && status.allIn && !status.hqDanger) score -= 5;
      }

      if (faction === "Nexus") {
        if (!hasPS && (bp.type === "Fanteria" || bp.weight === "Leggera")) score += 3;
        if (hasPS && (bp.weight === "Pivot" || bp.type === "Struttura" || bp.weight === "Pesante")) score += 4;
        score += botNexusPurchaseDoctrineBonus(player, bp, field, status);
      } else if (faction === "Exordium") {
        if (hasPS && (bp.type === "Veicolo" || bp.weight === "Pivot" || bp.weight === "Elite")) score += 4;
        if (field.filter(u => u.type === "Veicolo").length < 2 && bp.type === "Veicolo") score += 2;
        if ((status.zeroPsRecovery || status.pressureEmergency || status.enemyPressurePlan) && (bp.type === "Fanteria" || bp.type === "Veicolo" || bp.type === "Struttura")) score += 7;
        if (status.ownPs <= 1 && status.enemyPs >= 2 && bp.cost <= 2) score += 4;
        if (bp.type === "Struttura" && (status.zeroPsRecovery || status.pressureEmergency || countControlledPS(player) <= 1)) score += 6;
        if (strategic.ownCards.hand >= botHandMax(player) - 1 && ["Avamposto Exordium","Bastione Armato","Caserma Fanteria","Testudo","Carro Medio Exordium","Legionario d'Assedio","Legionario Pesante"].includes(bp.name)) score += 3.5;
      } else if (faction === "Liberti") {
        if (status.pressureDanger && bp.weight === "Leggera") score += 4;
        if (status.allIn && bp.type === "Veicolo") score += 3;
        score += botLibertiPurchaseDoctrineBonus(player, bp, field, enemyField, enemyNearHq, status);
      } else if (faction === "Agathoi") {
        const ownCount = field.length;
        const enemyCount = enemyField.length;
        const structures = field.filter(u => u.type === "Struttura").length;
        const hasStructure = structures > 0;
        const vsLiberti = enemyFaction === "Liberti";
        const enemyMassAdvantage = enemyCount >= ownCount + 3;
        score += botAgathoiPurchaseDoctrineBonus(player, bp, field, enemyField, enemyNearHq, status);
        if (ownCount < enemyCount && (bp.weight === "Leggera" || bp.cost <= 2 || bp.type === "Fanteria")) score += 7;
        if (field.length < 3 && (bp.type === "Fanteria" || bp.weight === "Leggera")) score += 5;
        if ((hasPS || hasStructure) && bp.type === "Struttura") score += 7 + Math.min(4, structures * 1.5);
        if (hasPS && (bp.weight === "Pivot" || String(bp.weight || "").startsWith("Pesante"))) score += 4;
        if (bp.canBuild && (hasPS || hasStructure || structures < 2)) score += 5;
        if (enemyHasPS && bp.ability && (bp.ability.statusKind === "inhibit_move" || bp.ability.kind === "armorThorns" || bp.ability.kind === "adjacentDefBuff" || bp.ability.kind === "damageShred")) score += 4;
        if (ownCount < enemyCount && bp.cost >= 4 && field.length < 5) score -= 4;
        if (vsLiberti) {
          if (bp.name === "Oplita di Confine") score += 9;
          if (bp.name === "Aratro Corazzato") score += 8;
          if (bp.passiveThorns || (bp.ability && (bp.ability.statusKind === "thorns" || bp.ability.kind === "armorThorns"))) score += 5;
          if (bp.ability && bp.ability.statusKind === "inhibit_move") score += 6;
          if (bp.type === "Struttura" && (hasPS || hasStructure || structures < 2)) score += 4;
          if (enemyMassAdvantage && bp.name === "Custode Agathoi" && ownCount >= 5) score -= 5;
          if (enemyMassAdvantage && bp.cost >= 4 && bp.weight !== "Pivot") score -= 3;
        }
      } else if (faction === "Fabeot") {
        if (bp.ability && ["incomeDelta", "costDelta", "incomeSwing", "status"].includes(bp.ability.kind)) score += 4;
        if (field.length < 3 && bp.cost <= 2) score += 3;
        if (hasPS && (bp.type === "Struttura" || bp.weight === "Pivot")) score += 4;
        if (enemyNearHq && bp.ability && bp.ability.kind === "status") score += 3;
        score += botFabeotPurchaseDoctrineBonus(player, bp, field, enemyField, enemyNearHq, status);
      }
      score += botSuperiorDoctrinePurchaseBonus(player, bp, field, enemyField, enemyNearHq, status);
      return score;
    }


// =====================================================
// B7d – AI action / combat / ability decisions
// =====================================================

function botTryStationaryAction(unit) {
      if (!unit || !canAct(unit)) return false;
      let didSomething = false;
      const ab = unit.ability;
      if (ab && !ab.passive && canUseAbility(unit, ab)) {
        const scored = abilityTargets(unit, ab).map(t => ({ target:t, score: scoreAbility(unit, t, ab) })).sort((a,b) => b.score - a.score);
        if (scored.length && scored[0].score > 0) {
          useAbility(unit, scored[0].target, ab);
          didSomething = true;
          if (unit.c2finalc2ReadyAfterAbility) {
            unit.c2finalc2ReadyAfterAbility = false;
          } else if (unit.type !== "Veicolo") return true;
        }
      }
      let adjacentEnemies = combatUnits(enemyOf(unit.side)).filter(e => areAdjacent(unit.pos, e.pos) && (!advancedAiEnabled() || botShouldAttackTarget(unit, e)));
      if (adjacentEnemies.length && canAttack(unit)) {
        while (adjacentEnemies.length && canAttack(unit) && unit.alive) {
          const target = adjacentEnemies
            .map(e => ({ unit:e, score: scoreAttackTarget(unit, e) }))
            .sort((a,b) => b.score - a.score)[0].unit;
          const before = unit.attacksMade || 0;
          attackUnit(unit, target);
          didSomething = true;
          if (!isFieldUnit(unit)) return true;
          if ((unit.attacksMade || 0) === before) break;
          adjacentEnemies = combatUnits(enemyOf(unit.side)).filter(e => areAdjacent(unit.pos, e.pos) && (!advancedAiEnabled() || botShouldAttackTarget(unit, e)));
        }
      }
      if (!isFieldUnit(unit)) return didSomething;
      if (unit.type === "Veicolo" && ab && !ab.passive && canUseAbility(unit, ab)) {
        const scored = abilityTargets(unit, ab).map(t => ({ target:t, score: scoreAbility(unit, t, ab) })).sort((a,b) => b.score - a.score);
        if (scored.length && scored[0].score > 0) {
          useAbility(unit, scored[0].target, ab);
          didSomething = true;
        }
      }
      return didSomething;
    }

function botTryAttackOnly(unit) {
      let adjacentEnemies = combatUnits(enemyOf(unit.side)).filter(e => areAdjacent(unit.pos, e.pos) && (!advancedAiEnabled() || botShouldAttackTarget(unit, e)));
      let didSomething = false;
      while (adjacentEnemies.length && canAttack(unit) && unit.alive) {
        const target = adjacentEnemies.map(e => ({ unit:e, score:scoreAttackTarget(unit, e) })).sort((a,b) => b.score - a.score)[0].unit;
        const before = unit.attacksMade || 0;
        attackUnit(unit, target);
        didSomething = true;
        if (!isFieldUnit(unit)) return true;
        if ((unit.attacksMade || 0) === before) break;
        adjacentEnemies = combatUnits(enemyOf(unit.side)).filter(e => areAdjacent(unit.pos, e.pos) && (!advancedAiEnabled() || botShouldAttackTarget(unit, e)));
      }
      return didSomething;
    }

function finishBotMove(unit) {
      if (!isFieldUnit(unit)) return;
      if (unit.warPush) {
        unit.warPush = false;
        log(`${unit.name} sfrutta Spinta di Guerra: può ancora agire.`);
        botTryStationaryAction(unit);
        endUnitAction(unit);
        return;
      }
      if (isInfantryActionLike(unit) && canAct(unit)) {
        botTryStationaryAction(unit);
        endUnitAction(unit);
        return;
      }
      if (unit.moveAttack && canAct(unit)) {
        botTryAttackOnly(unit);
        endUnitAction(unit);
        return;
      }
      endUnitAction(unit);
    }

function emergencyBotAction(unit) {
      const status = strategicStatus(unit.side);
      if (!status.active) return false;
      const adjacentEnemies = combatUnits(status.enemy).filter(e => areAdjacent(unit.pos, e.pos));
      const strategicAdjacent = adjacentEnemies.filter(e => isStrategicEnemyTarget(unit.side, e, status));
      if (strategicAdjacent.length && canAttack(unit)) {
        while (canAttack(unit) && unit.alive && strategicAdjacent.some(e => e.alive)) {
          const target = strategicAdjacent.filter(e => e.alive)
            .map(e => ({ unit:e, score: scoreAttackTarget(unit, e) + 12 }))
            .sort((a,b) => b.score - a.score)[0]?.unit;
          if (!target) break;
          const before = unit.attacksMade || 0;
          attackUnit(unit, target);
          if (!isFieldUnit(unit)) return true;
          if ((unit.attacksMade || 0) === before) break;
        }
        if (isFieldUnit(unit) && unit.type === "Veicolo" && canUseAbility(unit, unit.ability) && abilityTargets(unit, unit.ability).length > 0) botTryStationaryAction(unit);
        if (isFieldUnit(unit)) endUnitAction(unit);
        return true;
      }
      if (unitIsGarrisoningPs(unit) && !shouldReleasePsGarrison(unit)) {
        return false;
      }
      const step = chooseEmergencyMove(unit, movableCells(unit), status);
      if (step) {
        moveUnit(unit, step);
        finishBotMove(unit);
        return true;
      }
      return false;
    }

function scoreAttackTarget(attacker, defender) {
      const damage = effectiveAtt(attacker) + numericalSuperiorityBonus(attacker, defender);
      const kill = damage >= effectiveLife(defender) ? 12 : 0;
      let score = kill + damage - effectiveLife(defender) * 0.25;
      const status = advancedAiEnabled() ? strategicStatus(attacker.side) : { active:false };
      if (advancedAiEnabled() && !botShouldAttackTarget(attacker, defender)) score -= 35;
      if (advancedAiEnabled()) {
        score += botTargetPriorityBonus(attacker.side, defender, status);
        score += botExordiumBreakpointAttackScore(attacker, defender, status);
      }
      if (defender.type === "Comandante") score += 3;
      if (defender.type === "Struttura") score += 1;
      if (status.active && isStrategicEnemyTarget(attacker.side, defender, status)) score += 12;
      if (status.hqDanger && hexDistance(defender.pos, getHq(attacker.side).pos) <= QG_THREAT_RANGE) score += 18;
      if (status.pressureDanger) {
        const cell = getCellAt(defender.pos);
        if (cell && cell.ps && cell.control === defender.side) score += 10;
      }
      if (attacker.faction === "Liberti") {
        score += numericalSuperiorityBonus(attacker, defender) ? 5 : 0;
        if (canBleed(defender) && !hasStatus(defender, "bleed")) score += 2;
      }
      return score;
    }

function scoreAbility(unit, target, ab) {
      if (target.type === "QG" || ab.passive) return -99;
      const status = advancedAiEnabled() ? strategicStatus(unit.side) : { active:false };
      let emergency = status.active && target.side !== unit.side && isStrategicEnemyTarget(unit.side, target, status) ? 8 : 0;
      if (advancedAiEnabled() && target && target.side && target.pos && target.side !== unit.side) emergency += botTargetPriorityBonus(unit.side, target, status) * 0.25;
      const superiorAbility = advancedAiEnabled() ? botSuperiorDoctrineAbilityBonus(unit, target, ab, status) : 0;
      if (ab.kind === "heal") {
        if (target.side !== unit.side) return -99;
        const missing = target.maxHp - target.currentHp;
        return missing > 0 ? missing + (target.type === "Comandante" ? 2 : 0) : 0;
      }
      if (ab.kind === "armor") {
        if (target.side !== unit.side) return -99;
        const missingDef = target.maxDef - target.currentDef;
        return missingDef > 0 ? 2 + missingDef + (target.type === "Comandante" ? 1 : 0) : 0;
      }
      if (ab.kind === "shred") {
        if (target.side === unit.side) return -99;
        let score = target.currentDef > 0 ? 4 + target.currentDef + emergency : 0;
        if (unit.faction === "Exordium" && target.currentDef > 0) score += isOnPS(target) || target.type === "Struttura" ? 4 : 1;
        return score + superiorAbility;
      }
      if (ab.kind === "damage") {
        if (target.side === unit.side) return -99;
        const damageValue = abilityDamageValue(ab, target);
        const kill = damageValue >= effectiveLife(target) ? 10 : 0;
        let score = kill + 4 + emergency + (target.type === "Comandante" ? 2 : 0) + (target.type === "Struttura" ? 1 : 0) - Math.min(target.currentHp, 4) * .2;
        if (unit.faction === "Exordium") {
          if (target.currentDef > 0 && damageValue >= target.currentDef) score += 4;
          if (isOnPS(target) || target.type === "Struttura") score += 3;
        }
        return score + superiorAbility;
      }
      if (ab.kind === "buffAtt") {
        if (target.side !== unit.side) return -99;
        return target.acted ? 0 : 4 + (target.type === "Comandante" ? 1 : 0) + (status.allIn ? 2 : 0);
      }
      if (ab.kind === "status") {
        if (ab.target === "self") {
          const already = getStatus(target, ab.statusKind);
          if (already && (already.turns || 0) >= (ab.turns || 1)) return 0;
          let selfBase = 3;
          if (ab.statusKind === "enemy_effect_immune") selfBase = enemiesNear(unit.pos, unit.side, 2).length || isOnPS(unit) ? 7 : 2;
          if (ab.statusKind === "ambush") selfBase = enemiesNear(unit.pos, unit.side, 2).length ? 6 : 2;
          return selfBase + (status.hqDanger || status.pressureDanger ? 2 : 0);
        }
        if (target.side === unit.side) return -99;
        const already = getStatus(target, ab.statusKind);
        if (already && (already.turns || 0) >= (ab.turns || 1)) return 0;
        let base = 4;
        if (ab.statusKind === "inhibit_action") base = 8;
        if (ab.statusKind === "inhibit_attack") base = 6;
        if (ab.statusKind === "inhibit_move") base = 5;
        if (target.type === "Comandante") base += 2;
        if (status.hqDanger && hexDistance(target.pos, getHq(unit.side).pos) <= QG_THREAT_RANGE) base += 5;
        if (status.pressureDanger) {
          const cell = getCellAt(target.pos);
          if (cell && cell.ps && cell.control === target.side) base += 4;
        }
        return base + emergency + superiorAbility;
      }
      if (ab.kind === "costDelta") {
        const side = affectedPlayerForAbility(unit, target, ab);
        const already = activeEconomicEffect(side, "cost_delta", ab.name);
        if (already) return 0;
        const affordableAfter = BLUEPRINTS.filter(bp => bp.faction === unit.faction && !purchaseLimitReached(unit.side, bp) && effectiveBlueprintCost(unit.side, bp) <= state.energy[unit.side] + Math.abs(ab.value || 0)).length;
        return 5 + Math.min(affordableAfter, 4) + (status.allIn ? 2 : 0);
      }
      if (ab.kind === "incomeDelta") {
        const side = affectedPlayerForAbility(unit, target, ab);
        const already = activeEconomicEffect(side, "income_delta", ab.name);
        if (already) return 0;
        const v = ab.value || 0;
        let base = v > 0 ? 5 : 6;
        if (v < 0 && countControlledPS(enemyOf(unit.side)) > countControlledPS(unit.side)) base += 2;
        if (status.pressureDanger || status.allIn) base += 2;
        return base;
      }
      if (ab.kind === "psLock") {
        const cell = target;
        if (!cell || !cell.ps || isPsLocked(cell.coord)) return 0;
        let base = 6;
        if (cell.control === enemyOf(unit.side)) base += 5;
        if (status.pressureDanger || status.allIn) base += 6;
        if (sameCoord(cell.coord, [0,0,0])) base += 2;
        return base;
      }
      if (ab.kind === "swapAlly") {
        if (!target || target.side !== unit.side) return -99;
        const enemyHq = getHq(enemyOf(unit.side));
        return 2 + Math.max(0, hexDistance(unit.pos, enemyHq.pos) - hexDistance(target.pos, enemyHq.pos));
      }
      if (ab.kind === "deceptivePositioning") {
        if (!target || target.side !== unit.side || target.type === "Struttura") return -99;
        const futureEnemies = combatUnits(enemyOf(unit.side)).filter(e => hexDistance(target.pos, e.pos) <= 1 && e.currentDef > 0 && !isUntargetableTo(e, unit.side));
        const bestDef = futureEnemies.length ? Math.max(...futureEnemies.map(e => e.currentDef)) : 0;
        const enemyHq = getHq(enemyOf(unit.side));
        const positionGain = Math.max(0, hexDistance(unit.pos, enemyHq.pos) - hexDistance(target.pos, enemyHq.pos));
        return (futureEnemies.length ? 5 + bestDef * 2 + positionGain : 1 + positionGain) + superiorAbility;
      }
      if (ab.kind === "vulnerableMark") {
        if (target.side === unit.side || getStatus(target, "fabeot_vulnerable")) return 0;
        const life = effectiveLife(target);
        const heavy = (target.weight === "Pesante" || target.weight === "Elite" || target.weight === "Pivot") ? 3 : 0;
        const lightPenalty = (target.weight === "Leggera" && life <= 2) ? -4 : 0;
        return 5 + emergency + Math.min(8, life) + target.currentDef * 1.5 + heavy + (isOnPS(target) ? 2 : 0) + (target.type === "Comandante" ? 4 : 0) + lightPenalty + superiorAbility;
      }
      if (ab.kind === "deploymentDiscount") {
        if (activeEconomicEffect(unit.side, "deploy_discount", ab.name)) return 0;
        const affordable = BLUEPRINTS.filter(bp => bp.faction === unit.faction && bp.type !== "Struttura" && !purchaseLimitReached(unit.side, bp) && effectiveBlueprintCost(unit.side, bp) <= state.energy[unit.side] + 1).length;
        return affordable > 0 ? 5 : 0;
      }
      if (ab.kind === "nexusPsPresidium") {
        if (!target || target.side !== unit.side || target.faction !== "Nexus") return -99;
        const psCells = state.cells.filter(c => c.ps && target.pos && hexDistance(target.pos, c.coord) <= 1);
        if (!psCells.length) return 0;
        const controlled = psCells.some(c => c.control === unit.side);
        const danger = enemiesNear(target.pos, unit.side, 2).length;
        return 4 + (controlled ? 3 : 0) + danger * 2 + (isOnPS(target) ? 2 : 0);
      }
      if (ab.kind === "nexusAdvancedLogistics") {
        const hand = state.hand && state.hand[unit.side] ? state.hand[unit.side] : [];
        const candidates = hand.filter(card => card && card.sourceType === "unit" && card.faction === "Nexus" && !(typeof handCardBlocked === "function" && handCardBlocked(card)));
        const playableSoon = candidates.some(card => Math.max(ab.minCost ?? 1, (card.cost || 0) + (ab.value || -1)) <= state.energy[unit.side]);
        return candidates.length ? 4 + (playableSoon ? 3 : 0) : 0;
      }
      if (ab.kind === "varranOrder") {
        if (!target || target.side !== unit.side || target.faction !== "Exordium") return -99;
        const adjacentEnemy = combatUnits(enemyOf(unit.side)).some(e => areAdjacent(target.pos, e.pos));
        return 5 + (target.uid === unit.uid ? 3 : 0) + (target.acted ? -2 : 2) + (adjacentEnemy ? 3 : 0) + Math.min(3, target.att || 0);
      }
      if (ab.kind === "nemiraCommand") {
        if (!target || target.side !== unit.side || target.faction !== "Exordium") return -99;
        const missing = Math.max(0, target.maxHp - target.currentHp);
        return missing > 0 || !target.acted ? 4 + missing * 2 + (target.acted ? 0 : 2) : 1;
      }
      if (ab.kind === "enhancedSuperiority") {
        if (!target || target.side !== unit.side || target.faction !== "Liberti" || target.type === "Struttura") return -99;
        const hasSetup = combatUnits(enemyOf(unit.side)).some(e => areAdjacent(target.pos, e.pos) && combatUnits(unit.side).some(a => a.uid !== target.uid && areAdjacent(a.pos, e.pos)));
        return !target.acted ? 4 + (hasSetup ? 5 : 0) + (target.att >= 3 ? 2 : 0) : 0;
      }
      if (ab.kind === "primarchMandate") {
        const allies = combatUnits(unit.side).filter(u => u && u.alive && u.faction === "Agathoi" && (u.uid === unit.uid || areAdjacent(u.pos, unit.pos)));
        const threatened = allies.filter(a => enemiesNear(a.pos, unit.side, 2).length > 0 || isOnPS(a)).length;
        return allies.length >= 2 || threatened ? 3 + allies.length * 1.5 + threatened * 2 : 0;
      }
      if (ab.kind === "agoraOrders") {
        if (!target || target.side !== unit.side || target.faction !== "Agathoi" || !(target.type === "Fanteria" || target.uid === unit.uid)) return -99;
        if (hasStatus(target, "counterattack")) return 0;
        const danger = enemiesNear(target.pos, unit.side, 2).length;
        return danger || isOnPS(target) ? 4 + danger * 2 + (isOnPS(target) ? 2 : 0) : 1;
      }
      if (ab.kind === "compromisedLogistics") {
        const enemy = enemyOf(unit.side);
        const enemyDeck = state.deck && state.deck[enemy] ? state.deck[enemy].length : 0;
        const ownHand = state.hand && state.hand[unit.side] ? state.hand[unit.side].length : 0;
        const maxHand = typeof maxHandSizeConfig === "function" ? maxHandSizeConfig() : 10;
        return enemyDeck > 0 ? 4 + Math.max(0, maxHand - ownHand) * 0.25 : 0;
      }
      if (ab.kind === "fabeotBounty") {
        if (target.side === unit.side || getStatus(target, "fabeot_bounty")) return 0;
        return 4 + (effectiveLife(target) <= 3 ? 5 : 0) + emergency;
      }
      if (ab.kind === "adjacentDefBuff") {
        const allies = combatUnits(unit.side).filter(u => u.uid !== unit.uid && areAdjacent(u.pos, unit.pos));
        const threatened = allies.filter(a => enemiesNear(a.pos, unit.side, 2).length > 0 || isOnPS(a)).length;
        return allies.length ? 3 + allies.length + threatened * 2 : 0;
      }
      if (ab.kind === "damageShred") {
        if (target.side === unit.side) return -99;
        const dmg = ab.damage || 1;
        const shred = Math.min(target.currentDef, ab.shred || 1);
        const kill = dmg >= effectiveLife(target) ? 8 : 0;
        return 4 + dmg + shred * 2 + kill + emergency;
      }
      if (ab.kind === "areaHealInfantry") {
        const allies = combatUnits(unit.side).filter(u => u.type === "Fanteria" && hexDistance(u.pos, unit.pos) <= (ab.range || 1));
        const missing = allies.reduce((sum, a) => sum + Math.max(0, a.maxHp - a.currentHp), 0);
        return missing > 0 ? 3 + missing : 0;
      }
      if (ab.kind === "agathoiPivotHeal") {
        const structuresMissing = combatUnits(unit.side).filter(u => u.faction === "Agathoi" && u.type === "Struttura").reduce((sum, a) => sum + Math.max(0, a.maxHp - a.currentHp), 0);
        const adjMissing = combatUnits(unit.side).filter(u => u.uid !== unit.uid && areAdjacent(u.pos, unit.pos)).reduce((sum, a) => sum + Math.max(0, a.maxHp - a.currentHp), 0);
        return structuresMissing + adjMissing > 0 ? 4 + structuresMissing + adjMissing : 0;
      }
      if (ab.kind === "agathoiShroud") {
        if (target.side !== unit.side || target.type === "Struttura" || !isAdjacentToAgathoiStructure(target) || hasStatus(target, "untargetable")) return 0;
        const danger = enemiesNear(target.pos, unit.side, 2).length;
        const ps = isOnPS(target) ? 3 : 0;
        const commander = target.type === "Comandante" ? 3 : 0;
        const elite = target.weight === "Elite" || target.weight === "Pivot" ? 2 : 0;
        return danger > 0 || ps || commander ? 5 + danger * 2 + ps + commander + elite : 1;
      }
      if (ab.kind === "armorThorns") {
        if (target.side !== unit.side) return -99;
        const missingDef = Math.max(0, target.maxDef - target.currentDef);
        const danger = enemiesNear(target.pos, unit.side, 2).length;
        const ps = isOnPS(target) ? 2 : 0;
        return 3 + missingDef + danger * 2 + ps;
      }
      if (ab.kind === "convertEnemy") {
        return canConvertEnemy(unit, target) ? 12 + (target.cost || 0) + superiorAbility : 0;
      }
      if (ab.kind === "corruptLightInfantry") {
        return canCorruptLightInfantry(unit, target) ? 9 + (isOnPS(target) ? 2 : 0) + emergency + superiorAbility : 0;
      }
      if (ab.kind === "buffDef") {
        if (target.side !== unit.side) return -99;
        const danger = enemiesNear(target.pos, unit.side, 2).length;
        const ps = isOnPS(target) ? 2 : 0;
        return target.acted && !danger ? 0 : 3 + danger * 2 + ps;
      }
      if (ab.kind === "placeMine") {
        const coord = target && (target.coord || target.pos);
        if (!coord || getUnitAt(coord)) return 0;
        const enemyNear = combatUnits(enemyOf(unit.side)).filter(e => hexDistance(e.pos, coord) <= 2).length;
        const psNear = state.cells.some(c => c.ps && hexDistance(c.coord, coord) <= 1) ? 2 : 0;
        return enemyNear || psNear ? 3 + enemyNear * 2 + psNear + (status.pressureDanger ? 2 : 0) : 1;
      }
      if (ab.kind === "spawnBlueprint") {
        const bp = BLUEPRINTS.find(x => x.id === ab.spawnBlueprintId && x.faction === unit.faction) || BLUEPRINTS.find(x => x.id === ab.spawnBlueprintId);
        if (!bp || purchaseLimitReached(unit.side, bp)) return 0;
        const cells = neighbors(unit.pos).filter(c => isInsideMap(c) && !getUnitAt(c));
        return cells.length ? 4 + Math.max(0, 3 - bp.cost) + (status.active ? 2 : 0) : 0;
      }
      if (ab.kind === "flameArea") {
        if (target.side === unit.side) return -99;
        const adjacentEnemies = combatUnits(enemyOf(unit.side)).filter(e => e.uid !== target.uid && areAdjacent(e.pos, target.pos)).slice(0, 2);
        const totalDamage = (1 + adjacentEnemies.length) * (ab.value || 2);
        const killBonus = [target, ...adjacentEnemies].filter(t => (ab.value || 2) >= effectiveLife(t)).length * 5;
        return 4 + totalDamage + killBonus + emergency;
      }
      if (ab.kind === "relocateAlly") {
        if (!target || target.side !== unit.side || target.uid === unit.uid || target.type === "QG") return 0;
        const enemyHq = getHq(enemyOf(unit.side));
        const current = hexDistance(target.pos, enemyHq.pos);
        const bestDest = state.cells.map(c => c.coord).filter(c => isInsideMap(c) && !getUnitAt(c) && hexDistance(c, unit.pos) <= (ab.destRange || 1))
          .sort((a,b) => hexDistance(a, enemyHq.pos) - hexDistance(b, enemyHq.pos))[0];
        if (!bestDest) return 0;
        const gain = current - hexDistance(bestDest, enemyHq.pos);
        return 2 + Math.max(0, gain) + (isOnPS(target) ? -2 : 0);
      }
      if (ab.kind === "copyRandomEnemyHandCard") {
        const enemy = enemyOf(unit.side);
        const count = state.hand && state.hand[enemy] ? state.hand[enemy].length : 0;
        return count ? 5 + Math.min(count, 4) : 0;
      }
      if (ab.kind === "lockEnemyEnergy") {
        const enemy = enemyOf(unit.side);
        const ene = state.energy[enemy] || 0;
        const hand = state.hand && state.hand[enemy] ? state.hand[enemy].length : 0;
        return ene > 0 || hand > 0 ? 6 + Math.min(ene, 5) + (ene === 0 && hand ? 4 : 0) : 0;
      }
      if (ab.kind === "cleansePositive") {
        if (!target || target.side === unit.side) return 0;
        const buffs = (target.buffs || []).length;
        const positives = (target.statuses || []).filter(st => ["thorns","untargetable","ability_untargetable","ambush","counterattack","extra_attack_on_kill","stealth","enemy_effect_immune"].includes(st.kind)).length;
        const baseCleanse = buffs + positives ? 4 + buffs * 2 + positives * 2 : 0;
        return Math.max(baseCleanse, superiorAbility > 0 ? 2 : 0) + superiorAbility;
      }
      if (ab.kind === "abilityUntargetable") {
        if (!target || target.side !== unit.side || target.type !== "Struttura" || hasStatus(target, "ability_untargetable")) return 0;
        const danger = enemiesNear(target.pos, unit.side, 2).length;
        return danger || isOnPS(target) ? 5 + danger * 2 : 1;
      }
      if (ab.kind === "duplicateStructureAbility") {
        if (!target || target.side !== unit.side || target.uid === unit.uid || target.type !== "Struttura" || !target.ability || target.ability.passive) return 0;
        const k = target.ability.kind;
        if (!(target.ability.target === "self" || ["spawnBlueprint","incomeDelta","costDelta","deploymentDiscount"].includes(k))) return 0;
        return 4 + (k === "spawnBlueprint" ? 3 : 0);
      }
      return 0;
    }
