"use strict";

// Arena Rubra – Fase B6e / B6-final
// Board / utility cleanup prudente.
// Questo file contiene utility generali di campo, ritmo, PS,
// bonus locali e helper QG/UI.
// Non contiene AI decisionale, combat, economia o deployment.

// Dipendenze globali accettate in questa fase:
// - state.js: state, $
// - rules.js: getCellAt, getUnitAt, getHq, combatUnits, countControlledPS
// - hex.js: coordKey, sameCoord, hexDistance, areAdjacent
// - constants.js: PACE_PRESETS, PS_COORDS, HQ_POS
// - render/events: log

function currentPace() {
      const key = state && state.pacePreset ? state.pacePreset : ($("pacePreset") ? $("pacePreset").value : "standard");
      return PACE_PRESETS[key] || PACE_PRESETS.standard;
    }

function pressureStartRound() { return currentPace().pressureStartRound; }

function paceLabel() { return currentPace().label; }

function generateMap(radius) {
      const cells = [];
      for (let x = -radius; x <= radius; x++) {
        for (let y = -radius; y <= radius; y++) {
          const z = -x - y;
          if (z >= -radius && z <= radius) {
            const c = [x, y, z];
            cells.push({ coord: c, key: coordKey(c), ps: PS_COORDS.some(ps => sameCoord(ps, c)), control: null });
          }
        }
      }
      return cells;
    }

function applyAttackBuff(unit, value, source) {
      unit.currentAtt += value;
      unit.buffs.push({ stat:"att", value, turns:1, source });
      log(`${unit.name} guadagna +${value} ATT da ${source} fino a fine turno.`);
    }

function isOnPS(unit) {
      const cell = unit && unit.pos ? getCellAt(unit.pos) : null;
      return Boolean(cell && cell.ps);
    }

function isOnOrAdjacentToAnyPS(pos) {
      return state.cells.some(c => c.ps && hexDistance(pos, c.coord) <= 1);
    }

function adjacentAllyOfOtherAssaultType(unit) {
      return combatUnits(unit.side).some(a => a.uid !== unit.uid && areAdjacent(a.pos, unit.pos) && ((a.type === "Fanteria" && unit.type === "Veicolo") || (a.type === "Veicolo" && unit.type === "Fanteria")));
    }

function psBonusActive(unit, bonus) {
      if (!unit || !bonus || !unit.pos || !unit.alive) return false;
      if (bonus.condition === "on_controlled_ps") {
        const cell = getCellAt(unit.pos);
        return Boolean(cell && cell.ps && cell.control === unit.side);
      }
      if (bonus.condition === "adjacent_controlled_ps") {
        return state.cells.some(c => c.ps && c.control === unit.side && hexDistance(unit.pos, c.coord) <= 1);
      }
      if (bonus.condition === "controls_ps") {
        return countControlledPS(unit.side) > 0;
      }
      return false;
    }

function psBonusValue(unit, stat) {
      const bonus = unit && unit.psBonus;
      return bonus && bonus.stat === stat && psBonusActive(unit, bonus) ? bonus.value : 0;
    }

function agathoiStructureAdjacencyDefBonus(unit) {
      if (!unit || unit.faction !== "Agathoi" || unit.type === "Struttura" || unit.type === "QG" || !unit.pos) return 0;
      if (!unit.passiveStructureDef) return 0;
      return combatUnits(unit.side).some(s => s.faction === "Agathoi" && s.type === "Struttura" && areAdjacent(s.pos, unit.pos)) ? 1 : 0;
    }

function hqSideAt(coord) {
      if (sameCoord(coord, HQ_POS[1])) return 1;
      if (sameCoord(coord, HQ_POS[2])) return 2;
      return null;
    }

function hqOccupancyText(side) {
      const hq = getHq(side);
      const occ = getUnitAt(hq.pos);
      if (!occ) return "libero";
      return occ.side === side ? `presidiato da ${occ.name}` : `occupato da ${occ.name}`;
    }


// =====================================================
// C2c-5 – Cell effects / temporary terrain / simple traps
// =====================================================

function ensureCellEffects() {
  if (!state) return [];
  if (!Array.isArray(state.cellEffects)) state.cellEffects = [];
  return state.cellEffects;
}

function cellEffectsAt(coord, kind=null) {
  if (!state || !coord) return [];
  return ensureCellEffects().filter(e => e && Array.isArray(e.coord) && sameCoord(e.coord, coord) && (!kind || e.kind === kind));
}

function hasCellEffect(coord, kind=null) {
  return cellEffectsAt(coord, kind).length > 0;
}

function cellEffectLabel(effect) {
  if (!effect) return "Effetto cella";
  if (effect.kind === "temporary_block_cell") return "Barricata Verde";
  if (effect.kind === "cell_movement_trap") return "Fossato";
  if (effect.kind === "cell_movement_boost") return "Passaggio tattico";
  if (effect.kind === "vegetal_anathema_trap") return "Anatema Vegetale";
  if (effect.kind === "bramble_path_trap") return "Sentiero dei Rovi";
  return effect.source || effect.kind || "Effetto cella";
}

function cellEffectsSummary(coord) {
  const effects = cellEffectsAt(coord);
  if (!effects.length) return "";
  return effects.map(e => `${cellEffectLabel(e)}${Number.isFinite(e.turns) ? ` (${e.turns})` : ""}`).join(" · ");
}

function isCellBlockedByEffect(coord) {
  return hasCellEffect(coord, "temporary_block_cell");
}

function isCellEnterable(coord) {
  return isInsideMap(coord) && !isCellBlockedByEffect(coord);
}

function isCellValidForTerrainTactic(coord, effectKind) {
  if (!coord || !getCellAt(coord) || getUnitAt(coord)) return false;
  if (isCellBlockedByEffect(coord) && effectKind !== "temporary_block_cell") return false;
  if (hqSideAt(coord)) return false;
  if (effectKind === "temporary_block_cell") {
    const cell = getCellAt(coord);
    if (!cell || cell.ps) return false;
    return !hasCellEffect(coord);
  }
  return !hasCellEffect(coord);
}

function addCellEffect(effect) {
  if (!effect || !Array.isArray(effect.coord)) return false;
  const list = ensureCellEffects();
  const coord = [...effect.coord];
  const existing = list.find(e => e.kind === effect.kind && sameCoord(e.coord, coord));
  if (existing) {
    Object.assign(existing, { ...effect, coord });
  } else {
    list.push({ ...effect, coord });
  }
  log(`${effect.source || cellEffectLabel(effect)} viene piazzato sulla cella [${coord.join(",")}].`, EventTypes.STATUS_APPLIED, {
    owner: effect.owner || null,
    coord,
    kind: effect.kind,
    source: effect.source || null,
    turns: effect.turns || null
  });
  return true;
}

function removeCellEffect(effect, reason="risolto") {
  if (!state || !effect) return false;
  const list = ensureCellEffects();
  const before = list.length;
  state.cellEffects = list.filter(e => e !== effect);
  const removed = before !== state.cellEffects.length;
  if (removed) {
    log(`${cellEffectLabel(effect)} termina sulla cella [${effect.coord.join(",")}] (${reason}).`, EventTypes.STATUS_EXPIRED, {
      owner: effect.owner || null,
      coord: [...effect.coord],
      kind: effect.kind,
      source: effect.source || null,
      reason
    });
  }
  return removed;
}

function tickCellEffectsAtStart(player) {
  if (!state || !Array.isArray(state.cellEffects) || !state.cellEffects.length) return;
  for (const effect of [...state.cellEffects]) {
    if (effect.owner !== player) continue;
    if (!Number.isFinite(effect.turns)) continue;
    effect.turns -= 1;
    if (effect.turns <= 0) removeCellEffect(effect, "durata esaurita");
  }
}

function applyTemporaryAttackDebuffFromCell(unit, value, turns, source) {
  if (!unit || !unit.alive) return 0;
  const loss = Math.min(Math.max(0, unit.currentAtt || 0), Math.abs(value || 0));
  if (!loss) return 0;
  unit.currentAtt = Math.max(0, (unit.currentAtt || 0) - loss);
  unit.buffs = unit.buffs || [];
  unit.buffs.push({ stat:"att", value:-loss, turns:turns || 1, source, c2c5CellEffect:true });
  return loss;
}

function grantPermanentDefFromCell(unit, value, source) {
  if (!unit || !unit.alive) return 0;
  const gain = Math.max(0, value || 0);
  if (!gain) return 0;
  unit.maxDef = (Number.isFinite(unit.maxDef) ? unit.maxDef : (unit.currentDef || 0)) + gain;
  unit.currentDef = (Number.isFinite(unit.currentDef) ? unit.currentDef : 0) + gain;
  unit.buffs = unit.buffs || [];
  unit.buffs.push({ stat:"def", value:gain, turns:999, source, permanent:true, c2c5CellEffect:true });
  return gain;
}

function triggerCellEffectsAt(coord, unit) {
  if (!state || !coord || !unit || !unit.alive || unit.type === "QG" || unit.type === "Struttura") return;
  for (const effect of [...cellEffectsAt(coord)]) {
    if (!unit.alive) break;
    if (effect.kind === "temporary_block_cell") continue;

    if (effect.kind === "cell_movement_boost") {
      if (unit.side !== effect.owner) continue;
      unit.c2c5bMoveBonus = Math.max(unit.c2c5bMoveBonus || 0, effect.value || 1);
      unit.c2c5bPassageContinue = true;
      unit.c2c5bMoveOnlyExhaustAfterMove = true;
      unit.movedThisTurn = false;
      applyStatus(unit, { kind:"move_only", turns:1, owner:effect.owner, source:effect.source || "Passaggio tattico" });
      log(`${unit.name} sfrutta Passaggio tattico in [${coord.join(",")}]: +${effect.value || 1} movimento e può muovere ancora, poi sarà considerata agita.`);
      removeCellEffect(effect, "innescato");
      continue;
    }

    if (effect.kind === "cell_movement_trap") {
      if (unit.side === effect.owner) continue;
      if (typeof recordAiHazardTrigger === "function") recordAiHazardTrigger(unit.side, "cell_movement_trap", false);
      applyStatus(unit, { kind:"inhibit_move", turns:2, owner:effect.owner, source:effect.source || "Fossato" });
      log(`${unit.name} cade nel Fossato in [${coord.join(",")}]: movimento bloccato al prossimo turno.`);
      removeCellEffect(effect, "innescato");
      continue;
    }

    if (effect.kind === "vegetal_anathema_trap") {
      if (unit.side === effect.owner) {
        const gain = grantPermanentDefFromCell(unit, 2, effect.source || "Anatema Vegetale");
        log(`${unit.name} occupa Anatema Vegetale: +${gain} DEF permanente.`);
      } else {
        if (typeof recordAiHazardTrigger === "function") recordAiHazardTrigger(unit.side, "vegetal_anathema_trap", false);
        const loss = applyTemporaryAttackDebuffFromCell(unit, 2, 1, effect.source || "Anatema Vegetale");
        log(`${unit.name} occupa Anatema Vegetale: -${loss} ATT fino a fine turno.`);
      }
      removeCellEffect(effect, "innescato");
      continue;
    }

    if (effect.kind === "bramble_path_trap") {
      if (unit.side === effect.owner) continue;
      if (typeof recordAiHazardTrigger === "function") recordAiHazardTrigger(unit.side, "bramble_path_trap", false);
      const beforeDef = unit.currentDef || 0;
      unit.currentDef = Math.max(0, beforeDef - 1);
      applyStatus(unit, { kind:"inhibit_move", turns:2, owner:effect.owner, source:effect.source || "Sentiero dei Rovi" });
      log(`${unit.name} attraversa il Sentiero dei Rovi: DEF ${beforeDef} → ${unit.currentDef}, movimento bloccato al prossimo turno.`);
      removeCellEffect(effect, "innescato");
      continue;
    }
  }
}
