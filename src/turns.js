"use strict";

// Arena Rubra – Fase B8b
// Turn flow extraction: post-action, start/end turn, status turnali, endUnitAction.

function postActionChecks(autoEnd=true) {
      removeDeadControl();
      checkVictory();
      if (!state.winner && autoEnd && hasAnyCombatUnits(state.currentPlayer) && activeCombatUnits(state.currentPlayer).length === 0) {
        endTurn();
      } else {
        renderAll();
      }
      maybeRunBot();
    }

function endTurn() {
      if (state.winner) return;
      updateControlFromOccupants();
      log(`${playerName(state.currentPlayer)} chiude il turno.`, EventTypes.TURN_ENDED, {
        player: state.currentPlayer,
        faction: state.factions[state.currentPlayer],
        round: state.turn
      });
      applyEndTurnStatuses(state.currentPlayer);
      if (typeof tickPlayerLocksAtEnd === "function") tickPlayerLocksAtEnd(state.currentPlayer);
      applyAgathoiIdleGuardThorns(state.currentPlayer);
      if (typeof applyC1fEndTurnPassives === "function") applyC1fEndTurnPassives(state.currentPlayer);
      cleanupTurnTactics(state.currentPlayer);
      if (typeof c2c7aCleanupEndTurnEffects === "function") c2c7aCleanupEndTurnEffects(state.currentPlayer);
      if (typeof tickHandCardLocksAtEnd === "function") tickHandCardLocksAtEnd(state.currentPlayer);
      tickCooldownsAndBuffs(state.currentPlayer);
      checkVictory();
      if (state.winner) { renderAll(); return; }
      if (state.orderIndex >= state.turnOrder.length - 1) {
        resolveEndOfRound();
        if (state.winner) { renderAll(); return; }
        // v1.8.6: niente inversione automatica dell'ordine a fine round.
        // La vecchia reverse() produceva sequenze tipo G2→G2 o G1→G1 ai confini del round.
        // Manteniamo l'iniziativa scelta a inizio partita, ma i turni restano sempre alternati.
        state.orderIndex = 0;
        state.turn += 1;
      } else {
        state.orderIndex += 1;
      }
      state.currentPlayer = state.turnOrder[state.orderIndex];
      startTurn(state.currentPlayer, false);
      renderAll();
      maybeRunBot();
    }

function startTurn(player, first=false) {
      tickPsLocksAtStart(player);
      if (typeof tickCellEffectsAtStart === "function") tickCellEffectsAtStart(player);
      resetTurnEconomyFlags(player);
      applyStartTurnStatuses(player);
      removeDeadControl();
      if (typeof updateAiTelemetryStartTurn === "function") updateAiTelemetryStartTurn(player);
      applyAgathoiRaduraAutoHeal(player);
      if (typeof applyC1fStartTurnPassives === "function") applyC1fStartTurnPassives(player);
      checkVictory();
      if (state.winner) return;
      for (const u of combatUnits(player)) {
        u.acted = false;
        u.attacksMade = 0;
        if (u.c2c8BaseAttacksPerTurn) {
          u.attacksPerTurn = u.c2c8BaseAttacksPerTurn;
          delete u.c2c8BaseAttacksPerTurn;
        }
        u.movedThisTurn = false;
        u.abilityUsedThisTurn = false;
        u.builtThisTurn = false;
        u.c2c5bMoveBonus = 0;
        u.c2c5bDoubleMove = false;
        u.c2c5bPassageContinue = false;
        u.c2c5bMoveOnlyExhaustAfterMove = false;
      }
      clearSelection();
      resolveStartTurnIncome(player, first);
      tickTacticCooldowns(player);
      state.tacticUsedThisTurn[player] = false;
      if (state.c2eBotHandTacticsUsedThisTurn) state.c2eBotHandTacticsUsedThisTurn[player] = 0;
      state.turnsStarted[player] += 1;
      if (!first) log(`Inizia il turno di ${playerName(player)}.`, EventTypes.TURN_STARTED, {
        player,
        faction: state.factions[player],
        round: state.turn
      });
      if (typeof drawCardForTurn === "function") drawCardForTurn(player, { first });
      if (typeof applyC1fAfterDrawPassives === "function") applyC1fAfterDrawPassives(player, first);
      maybeAutoResign(player);
    }

function applyStartTurnStatuses(player) {
      for (const u of combatUnits(player)) tickStatuses(u, "startTurn");
    }

function applyEndTurnStatuses(player) {
      for (const u of combatUnits(player)) tickStatuses(u, "endTurn");
      tickPlayerEffects(player, "endTurn");
    }

function applyAgathoiIdleGuardThorns(player) {
      for (const u of combatUnits(player)) {
        if (!u.guardThornsOnIdle || u.type !== "Fanteria") continue;
        const didAction = (u.attacksMade || 0) > 0 || u.abilityUsedThisTurn || u.builtThisTurn;
        if (!didAction && !hasStatus(u, "thorns")) {
          applyStatus(u, { kind:"thorns", value:1, turns:1, source:"Guardia Spinosa" });
          log(`${u.name} resta in guardia e ottiene Spine 1.`);
        }
      }
    }

function endUnitAction(unit) {
      unit.acted = true;
      unit.c2c5bMoveBonus = 0;
      unit.c2c5bDoubleMove = false;
      unit.c2c5bPassageContinue = false;
      unit.c2c5bMoveOnlyExhaustAfterMove = false;
      mode = "idle";
      pendingAbility = null;
      pendingBuildBlueprintId = null;
      pendingPurchaseBlueprintId = null;
      pendingTacticId = null;
      pendingHandCardUid = null;
    }


// =====================================================
// C1f – start/end turn passive triggers
// =====================================================
function c1fMostWounded(units) {
  return [...units].filter(u => u.currentHp < u.maxHp).sort((a,b) => (b.maxHp-b.currentHp) - (a.maxHp-a.currentHp) || effectiveLife(a)-effectiveLife(b))[0] || null;
}

function applyC1fStartTurnPassives(player) {
  for (const u of combatUnits(player)) {
    u.c1fMoveBonus = u.baseMoveBonus || 0;
    if (u.nextTurnMoveBonus) { u.c1fMoveBonus = Math.max(u.c1fMoveBonus || 0, u.nextTurnMoveBonus); u.nextTurnMoveBonus = 0; }
    if (u.startTurnMoveIfAdjacentStructure && isAdjacentToAlliedStructure(u)) {
      u.c1fMoveBonus = Math.max(u.c1fMoveBonus || 0, u.startTurnMoveIfAdjacentStructure || 1);
      log(`${u.name} inizia vicino a una struttura e ottiene +${u.startTurnMoveIfAdjacentStructure || 1} movimento.`);
    }
  }

  for (const u of combatUnits(player)) {
    if (u.dawnHealAdjacentIfNearStructure && isAdjacentToAlliedStructure(u)) {
      const target = c1fMostWounded(combatUnits(player).filter(a => a.uid !== u.uid && areAdjacent(a.pos, u.pos)));
      if (target) { const before = target.currentHp; target.currentHp = Math.min(target.maxHp, target.currentHp + (u.dawnHealAdjacentIfNearStructure || 1)); log(`${u.name} cura ${target.name}: +${target.currentHp-before} HP.`); }
    }
    if (u.dawnHealStructures) {
      const targets = combatUnits(player).filter(s => s.type === "Struttura" && s.uid !== u.uid && areAdjacent(s.pos, u.pos) && s.currentHp < s.maxHp).slice(0, u.dawnHealStructures.maxTargets || 3);
      for (const s of targets) { const before=s.currentHp; s.currentHp=Math.min(s.maxHp, s.currentHp+(u.dawnHealStructures.value||1)); log(`${u.name} cura ${s.name}: +${s.currentHp-before} HP struttura.`); }
    }
    if (u.dawnMaxHpAdjacent) {
      const candidates = combatUnits(player).filter(a => a.uid !== u.uid && a.type !== "Struttura" && areAdjacent(a.pos, u.pos));
      const target = candidates.sort((a,b)=>(a._c1fMaxHpBonus||0)-(b._c1fMaxHpBonus||0) || effectiveLife(a)-effectiveLife(b))[0];
      if (target && (target._c1fMaxHpBonus || 0) < (u.dawnMaxHpAdjacent.maxPerUnit || 3)) {
        target._c1fMaxHpBonus = (target._c1fMaxHpBonus || 0) + (u.dawnMaxHpAdjacent.value || 1);
        target.maxHp += (u.dawnMaxHpAdjacent.value || 1);
        target.currentHp += (u.dawnMaxHpAdjacent.value || 1);
        log(`${u.name} aumenta HP massimo di ${target.name}: +${u.dawnMaxHpAdjacent.value || 1} HP max (${target._c1fMaxHpBonus}/${u.dawnMaxHpAdjacent.maxPerUnit || 3}).`);
      }
    }
    if (u.eneEveryOwnerTurns) {
      u._c1fOwnerTurns = (u._c1fOwnerTurns || 0) + 1;
      if (u._c1fOwnerTurns % (u.eneEveryOwnerTurns.turns || 2) === 0) {
        state.energy[player] += u.eneEveryOwnerTurns.value || 1;
        log(`${u.name} genera +${u.eneEveryOwnerTurns.value || 1} ENE al turno ${u._c1fOwnerTurns}.`);
      }
    }
  }
}

function applyC1fAfterDrawPassives(player, first=false) {
  if (!state || first) return;
  const hasStealthSpy = combatUnits(player).some(u => u.stealthDraw && hasStatus(u, "stealth"));
  if (hasStealthSpy && typeof drawCards === "function") {
    const drawn = drawCards(player, 1);
    if (drawn.length) log(`${playerName(player)} pesca +1 per Spia Silente furtiva: ${drawn.map(c=>c.name).join(", ")}.`);
  }
}

function applyC1fEndTurnPassives(player) {
  for (const u of combatUnits(player)) {
    if (u.stationaryDef) {
      if (u.movedThisTurn) u.stationaryDefBonus = 0;
      else {
        u.stationaryDefBonus = Math.min(u.stationaryDef.max || 4, (u.stationaryDefBonus || 0) + (u.stationaryDef.value || 1));
        log(`${u.name} mantiene posizione: bonus DEF cumulativo ${u.stationaryDefBonus}/${u.stationaryDef.max || 4}.`);
      }
    }
    if (u.noAttackMoveNext) {
      if ((u.attacksMade || 0) === 0) {
        u.nextTurnMoveBonus = Math.max(u.nextTurnMoveBonus || 0, u.noAttackMoveNext || 1);
        log(`${u.name} non ha attaccato: otterrà +${u.noAttackMoveNext || 1} movimento nel prossimo turno.`);
      } else u.nextTurnMoveBonus = 0;
    }
  }
}
