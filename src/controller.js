"use strict";

// Arena Rubra – Fase B8c
// Input/controller extraction.
// Contiene click mappa, modalità abilità, pass unità, clear selection
// e helper target per attacco/abilità.
// Non contiene AI, turn flow, economia, combat rules o rendering.

function handleCellClick(coord) {
      if (!state || state.winner || botRunning) return;
      const unit = getUnitAt(coord);
      const humanTurn = state.modes[state.currentPlayer] === "human";
      if (!humanTurn) return;

      if (mode === "spawn") {
        const bp = pendingPurchaseBlueprintId ? pendingBlueprintForHandOrMarket(state.currentPlayer, pendingPurchaseBlueprintId) : null;
        if (bp && spawnCellsFor(state.currentPlayer, bp).some(c => sameCoord(c, coord))) {
          const playedHandCardUid = pendingHandCardUid;
          const spawned = spawnUnit(bp, state.currentPlayer, coord);
          if (spawned) {
            if (playedHandCardUid && typeof completeHandCardUnitPlay === "function") completeHandCardUnitPlay(state.currentPlayer, playedHandCardUid, bp);
            clearSelection();
            postActionChecks(false);
          } else {
            renderAll();
          }
          return;
        }
      }

      if (mode === "move") {
        const selected = getSelectedUnit();
        if (selected && movableCells(selected).some(c => sameCoord(c, coord))) {
          moveUnit(selected, coord);
          if (selected.c2c5bPassageContinue) {
            selected.c2c5bPassageContinue = false;
            mode = "idle";
            pendingTacticId = null;
            selectedId = selected.uid;
            log(`${selected.name} può muovere ancora grazie a Passaggio tattico.`);
            postActionChecks(false);
          } else if (selected.c2c5bMoveOnlyExhaustAfterMove) {
            log(`${selected.name} completa il movimento tattico e viene considerata agita.`);
            endUnitAction(selected);
            clearSelection();
            postActionChecks();
          } else if (selected.warPush) {
            selected.warPush = false;
            mode = "idle";
            pendingTacticId = null;
            log(`${selected.name} sfrutta Spinta di Guerra: può ancora agire.`);
            postActionChecks(false);
          } else if (isInfantryActionLike(selected)) {
            mode = "idle";
            pendingTacticId = null;
            log(`${selected.name} ha mosso e può ancora agire: attacco o abilità${canBuildStructures(selected) ? " o costruzione" : ""}.`);
            selectedId = selected.uid;
            postActionChecks(false);
          } else if (selected.moveAttack) {
            mode = "idle";
            pendingTacticId = null;
            log(`${selected.name} ha mosso e può ancora attaccare.`);
            selectedId = selected.uid;
            postActionChecks(false);
          } else {
            endUnitAction(selected);
            clearSelection();
            postActionChecks();
          }
          return;
        }
      }

      if (mode === "ability") {
        const selected = getSelectedUnit();
        if (selected && pendingAbility) {
          const target = abilityTargets(selected, pendingAbility).find(t => sameCoord(t.pos, coord));
          if (target) {
            useAbility(selected, target, pendingAbility);
            if (shouldEndAfterAbility(selected)) {
              endUnitAction(selected);
              clearSelection();
              postActionChecks();
            } else {
              mode = "idle";
              pendingAbility = null;
              selectedId = selected.uid;
              log(`${selected.name} può ancora attaccare dopo l'abilità.`);
              postActionChecks(false);
            }
            return;
          }
        }
      }

      if (mode === "tactic") {
        if (pendingHandCardUid) {
          const card = handCardByUid(state.currentPlayer, pendingHandCardUid);
          if (card) {
            const target = handTacticTargets(state.currentPlayer, card).find(t => t.pos && sameCoord(t.pos, coord));
            if (target) {
              const used = useHandTacticCard(state.currentPlayer, card, target);
              clearSelection();
              postActionChecks(false);
              return;
            }
          }
        } else {
          const tactic = tacticById(pendingTacticId);
          if (tactic) {
            const valid = tacticTargets(state.currentPlayer, tactic).some(t => t.pos && sameCoord(t.pos, coord));
            if (valid) {
              const target = getUnitAt(coord);
              useTactic(state.currentPlayer, tactic, target);
              clearSelection();
              postActionChecks(false);
              return;
            }
          }
        }
      }

      if (mode === "build") {
        const selected = getSelectedUnit();
        const bp = pendingBuildBlueprintId ? pendingBlueprintForHandOrMarket(state.currentPlayer, pendingBuildBlueprintId) : null;
        if (selected && bp && buildableCells(selected).some(c => sameCoord(c, coord))) {
          const playedHandCardUid = pendingHandCardUid;
          const built = buildStructure(selected, bp, coord);
          if (built) {
            if (playedHandCardUid && typeof completeHandCardUnitPlay === "function") completeHandCardUnitPlay(state.currentPlayer, playedHandCardUid, bp);
            endUnitAction(selected);
            clearSelection();
            postActionChecks();
          } else {
            renderAll();
          }
          return;
        }
      }

      if (selectedId) {
        const selected = getSelectedUnit();
        if (selected && unit && unit.side !== selected.side && !isUntargetableTo(unit, selected.side) && selected.type !== "QG" && canAttack(selected) && areAdjacent(selected.pos, unit.pos) && selected.side === state.currentPlayer) {
          attackUnit(selected, unit);
          if (!shouldEndAfterAttack(selected)) {
            selectedId = selected.uid;
            mode = "idle";
            const follow = (selected.attacksMade < selected.attacksPerTurn && adjacentAttackTargets(selected).length > 0) ? "può attaccare ancora" : "può ancora usare l'abilità attiva";
            log(`${selected.name} ${follow}.`);
            postActionChecks(false);
          } else {
            endUnitAction(selected);
            clearSelection();
            postActionChecks();
          }
          return;
        }
      }

      if (unit && unit.side === state.currentPlayer && unit.alive && !unit.acted && unit.type !== "QG") {
        selectUnitAndPrimeMovement(unit);
      } else if (unit) {
        selectedId = unit.uid;
        mode = "idle";
        pendingAbility = null;
        pendingBuildBlueprintId = null;
        pendingPurchaseBlueprintId = null;
        pendingHandCardUid = null;
      } else {
        clearSelection();
      }
      renderAll();
    }

function selectUnitAndPrimeMovement(unit) {
      selectedId = unit.uid;
      pendingAbility = null;
      pendingBuildBlueprintId = null;
      pendingPurchaseBlueprintId = null;
      pendingTacticId = null;
      pendingHandCardUid = null;
      const canPrimeMove = Boolean(
        unit
        && unit.side === state.currentPlayer
        && unit.alive
        && !unit.acted
        && unit.type !== "QG"
        && typeof canMove === "function"
        && canMove(unit)
        && typeof movableCells === "function"
        && movableCells(unit).length > 0
      );
      mode = canPrimeMove ? "move" : "idle";
    }

function toggleAbilityMode(unit) {
      if (!unit.ability) return;
      if (unit.ability.target === "self") {
        useAbility(unit, unit, unit.ability);
        if (shouldEndAfterAbility(unit)) {
          endUnitAction(unit);
          clearSelection();
          postActionChecks();
        } else {
          mode = "idle";
          pendingAbility = null;
          selectedId = unit.uid;
          log(`${unit.name} può ancora attaccare dopo l'abilità.`);
          postActionChecks(false);
        }
        return;
      }
      mode = mode === "ability" ? "idle" : "ability";
      pendingAbility = mode === "ability" ? unit.ability : null;
      pendingBuildBlueprintId = null;
      pendingPurchaseBlueprintId = null;
      renderAll();
    }

function passUnit(unit) {
      log(`${unit.name} passa l'azione.`);
      endUnitAction(unit);
      clearSelection();
      postActionChecks();
    }

function clearSelection() {
      selectedId = null;
      mode = "idle";
      pendingAbility = null;
      pendingBuildBlueprintId = null;
      pendingPurchaseBlueprintId = null;
      pendingTacticId = null;
      pendingHandCardUid = null;
    }

function isAttackTarget(coord) {
      const u = getSelectedUnit();
      const target = getUnitAt(coord);
      return mode === "idle" && u && target && target.side !== u.side && !isUntargetableTo(target, u.side) && u.side === state.currentPlayer && u.type !== "QG" && canAttack(u) && areAdjacent(u.pos, target.pos);
    }

function isAbilityTarget(coord) {
      const u = getSelectedUnit();
      if (mode !== "ability" || !u || !pendingAbility) return false;
      return abilityTargets(u, pendingAbility).some(t => sameCoord(t.pos, coord));
    }
