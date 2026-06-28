"use strict";

// Arena Rubra – Fase B6d
// Movement extraction prudente.
// Questo file contiene range movimento, target movimento,
// modalità movimento UI e applicazione dello spostamento.
// Non contiene logica decisionale AI: l'AI usa queste funzioni,
// ma resta ancora nel main.

// Dipendenze globali accettate in questa fase:
// - state.js: state, mode, pending..., selectedId
// - rules.js: getSelectedUnit, getUnitAt, isInsideMap, playerName
// - statuses.js: canMove
// - main.js/pace future: currentPace
// - render/events: log, EventTypes, renderAll

function vehicleMoveRange() { return currentPace().vehicleMove || 1; }
    function isInfantryActionLike(unit) { return unit && (unit.type === "Fanteria" || unit.type === "Comandante"); }
    function canActAfterMove(unit) { return Boolean(unit && (unit.warPush || isInfantryActionLike(unit) || unit.moveAttack)); }
    function movementRangeFor(unit) {
      if (!unit) return 0;
      let range = (unit.type === "Veicolo" ? vehicleMoveRange() : 1)
        + (unit.warPush ? 1 : 0)
        + (unit.c1fMoveBonus ? unit.c1fMoveBonus : 0)
        + (unit.c2c5bMoveBonus ? unit.c2c5bMoveBonus : 0);
      if (unit.c2c5bDoubleMove) range *= 2;
      return Math.max(0, range);
    }

function toggleMoveMode() {
      if (!getSelectedUnit()) return;
      mode = mode === "move" ? "idle" : "move";
      pendingAbility = null;
      pendingBuildBlueprintId = null;
      pendingPurchaseBlueprintId = null;
      pendingTacticId = null;
      renderAll();
    }

function moveUnit(unit, coord) {
      if (unit.stationaryDefBonus) {
        log(`${unit.name} si muove e perde il bonus DEF da posizione.`);
        unit.stationaryDefBonus = 0;
      }
      log(`${unit.name} si muove da [${unit.pos.join(",")}] a [${coord.join("," )}].`, EventTypes.UNIT_MOVED, {
        player: unit.side,
        faction: state.factions[unit.side],
        unitId: unit.uid,
        unitName: unit.name,
        from: [...unit.pos],
        to: [...coord]
      });
      unit.pos = [...coord];
      unit.movedThisTurn = true;
      if (typeof triggerMinesAt === "function") triggerMinesAt(unit.pos, unit);
      if (typeof triggerCellEffectsAt === "function") triggerCellEffectsAt(unit.pos, unit);
      if (unit.alive && typeof triggerAmbushesAt === "function") triggerAmbushesAt(unit);
    }

function isMoveTarget(coord) {
      const u = getSelectedUnit();
      return mode === "move" && u && movableCells(u).some(c => sameCoord(c, coord));
    }

function movableCells(unit) {
      if (!canMove(unit) || !unit.pos || unit.type === "Struttura" || unit.type === "QG") return [];
      const range = movementRangeFor(unit);
      if (range <= 1) return neighbors(unit.pos).filter(c => isCellEnterable(c) && !getUnitAt(c));
      const results = [];
      const seen = new Set([coordKey(unit.pos)]);
      const frontier = [{ coord: unit.pos, dist: 0 }];
      while (frontier.length) {
        const cur = frontier.shift();
        if (cur.dist >= range) continue;
        for (const n of neighbors(cur.coord)) {
          const key = coordKey(n);
          if (seen.has(key) || !isCellEnterable(n)) continue;
          seen.add(key);
          if (getUnitAt(n)) continue;
          results.push(n);
          frontier.push({ coord:n, dist:cur.dist + 1 });
        }
      }
      return results;
    }
