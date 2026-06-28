"use strict";

// Arena Rubra – Fase B5d
// Tactics extraction prudente.
// Questo file contiene cooldown tattiche, cleanup tattiche di turno,
// targeting tattiche, uso tattiche e handler tattiche.
// Non contiene AI, economia generale, abilità unità o rendering.

// Dipendenze globali accettate in questa fase:
// - combat.js: applyDamage
// - statuses.js: applyStatus, getStatus, hasStatus
// - abilities.js: targetLabel
// - rules.js: combatUnits, enemyOf, playerName
// - main.js/economy future: addPlayerEffect
// - main.js/map/movement future: isOnPS, isOnOrAdjacentToAnyPS,
//   adjacentAllyOfOtherAssaultType, movableCells, applyAttackBuff
// - render/events: log, EventTypes, renderAll


    function tickTacticCooldowns(player) {
      const cds = state.tacticCooldowns[player] || {};
      for (const id of Object.keys(cds)) cds[id] = Math.max(0, cds[id] - 1);
    }



    function cleanupTurnTactics(player) {
      for (const u of combatUnits(player)) u.warPush = false;
      for (const u of combatUnits(enemyOf(player))) {
        u.statuses = (u.statuses || []).filter(st => !(st.kind === "raid_mark" && st.owner === player));
      }
    }



    function triggerLogisticChoke(attacker) {
      const mark = getStatus(attacker, "logistic_choke");
      if (!mark) return;
      const owner = mark.owner || enemyOf(attacker.side);
      const gain = mark.value || 2;
      state.energy[owner] = (state.energy[owner] || 0) + gain;
      log(`${attacker.name} attiva Strozzatura Logistica: ${playerName(owner)} guadagna +${gain} ENE per l'attacco nemico.`, EventTypes.ECONOMY_CHANGED, {
        player: owner,
        faction: state.factions[owner],
        targetPlayer: attacker.side,
        targetFaction: state.factions[attacker.side],
        unitId: attacker.uid,
        unitName: attacker.name,
        source: mark.source || "Strozzatura Logistica",
        gain,
        totalEnergy: state.energy[owner],
        round: state.turn
      });
    }



    function tacticsForFaction(faction) { return TACTICS.filter(t => t.faction === faction); }



    function tacticById(id) { return TACTICS.find(t => t.id === id) || null; }



    function tacticCooldown(player, tactic) { return (state.tacticCooldowns[player] && state.tacticCooldowns[player][tactic.id]) || 0; }



    function canUseTactic(player, tactic) {
      if (!state || state.winner || !tactic) return false;
      if (state.tacticUsedThisTurn[player]) return false;
      if (tacticCooldown(player, tactic) > 0) return false;
      if (state.energy[player] < tactic.cost) return false;
      if (tactic.target !== "none" && tacticTargets(player, tactic).length === 0) return false;
      return true;
    }



    function toggleTacticMode(tactic) {
      if (!canUseTactic(state.currentPlayer, tactic)) return;
      if (tactic.target === "none") {
        useTactic(state.currentPlayer, tactic, null);
        if (typeof closeActionsPanelAfterAcceptedTactic === "function") closeActionsPanelAfterAcceptedTactic();
        clearSelection();
        postActionChecks(false);
        return;
      }
      mode = mode === "tactic" && pendingTacticId === tactic.id ? "idle" : "tactic";
      pendingTacticId = mode === "tactic" ? tactic.id : null;
      selectedId = null;
      pendingAbility = null;
      pendingBuildBlueprintId = null;
      pendingPurchaseBlueprintId = null;
      log(`Scegli un bersaglio per ${tactic.name}.`);
      if (mode === "tactic" && typeof closeActionsPanelAfterAcceptedTactic === "function") closeActionsPanelAfterAcceptedTactic();
      renderAll();
    }



    function isTacticTarget(coord) {
      if (mode !== "tactic" || !pendingTacticId) return false;
      if (pendingHandCardUid) {
        const card = handCardByUid(state.currentPlayer, pendingHandCardUid);
        return card && handTacticTargets(state.currentPlayer, card).some(t => t.pos && sameCoord(t.pos, coord));
      }
      const tactic = tacticById(pendingTacticId);
      return tactic && tacticTargets(state.currentPlayer, tactic).some(t => t.pos && sameCoord(t.pos, coord));
    }



    function tacticTargets(player, tactic) {
      if (!tactic || tactic.target === "none") return [];
      const own = combatUnits(player);
      const enemy = combatUnits(enemyOf(player));
      if (tactic.kind === "healArmorOnPS") return own.filter(u => isOnPS(u) && (u.currentHp < u.maxHp || u.currentDef < u.maxDef));
      if (tactic.kind === "damageNearPS") return enemy.filter(u => isOnOrAdjacentToAnyPS(u.pos));
      if (tactic.kind === "assaultOrder") return own.filter(u => (u.type === "Fanteria" || u.type === "Veicolo") && adjacentAllyOfOtherAssaultType(u));
      if (tactic.kind === "warPush") return own.filter(u => u.type === "Veicolo" && !u.acted && u.alive && movableCells(u).length > 0);
      if (tactic.kind === "hordeCharge") return own.filter(u => u.type !== "Struttura");
      if (tactic.kind === "raidMark") return enemy.filter(u => u.type !== "Struttura" && !hasStatus(u, "raid_mark"));
      if (tactic.kind === "defensiveRoots") return own.filter(u => u.type === "Struttura" || isOnPS(u));
      if (tactic.kind === "logisticChoke") return enemy.filter(u => u.type !== "Struttura" && !hasStatus(u, "logistic_choke"));
      return [];
    }



    function useTactic(player, tactic, target) {
      if (!canUseTactic(player, tactic)) return false;
      if (tactic.target !== "none" && (!target || !tacticTargets(player, tactic).some(t => t.uid === target.uid))) return false;
      state.energy[player] -= tactic.cost;
      state.tacticUsedThisTurn[player] = true;
      state.tacticCooldowns[player][tactic.id] = tactic.cooldown;
      log(`${playerName(player)} usa tattica: ${tactic.name} (${tactic.cost} ENE).`, EventTypes.TACTIC_USED, {
        player,
        faction: state.factions[player],
        tacticId: tactic.id,
        tacticName: tactic.name,
        tacticKind: tactic.kind,
        cost: tactic.cost,
        targetId: target && target.uid ? target.uid : null,
        targetName: target ? targetLabel(target) : null
      });
      TACTIC_HANDLERS[tactic.kind](player, target, tactic);
      return true;
    }




// =====================================================
// C2c-1 – Hand tactic cards: single direct damage only
// =====================================================

function deckTacticById(id) {
  return (typeof DECK_TACTICS !== "undefined" ? DECK_TACTICS : []).find(t => t && t.id === id) || null;
}

function c2c1PlayableTacticIds() {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  return new Set(Array.isArray(config.playableTacticIdsC2c1) ? config.playableTacticIdsC2c1 : ["NXTAC01", "NXTAC02", "EXTAC01", "EXTAC02", "LBTAC06"]);
}

function c2c1PlayableEffectKinds() {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  return new Set(Array.isArray(config.playableTacticEffectKindsC2c1) ? config.playableTacticEffectKindsC2c1 : ["damage_unit", "damage_bonus_vs_vehicle", "damage_structure", "demolition_charge"]);
}

function c2c2PlayableTacticIds() {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  return new Set(Array.isArray(config.playableTacticIdsC2c2) ? config.playableTacticIdsC2c2 : ["NXTAC03", "EXTAC03", "LBTAC05", "EXTAC06", "AGTAC07"]);
}

function c2c2PlayableEffectKinds() {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  return new Set(Array.isArray(config.playableTacticEffectKindsC2c2) ? config.playableTacticEffectKindsC2c2 : ["damage_and_cleanse_buffs", "damage_and_permanent_att_debuff", "damage_and_permanent_attack_debuff", "damage_and_bleed", "set_def_to_one_round", "set_defense_to_one", "grant_thorns_temp", "grant_thorns_two"]);
}

function c2c3PlayableTacticIds() {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  return new Set(Array.isArray(config.playableTacticIdsC2c3) ? config.playableTacticIdsC2c3 : ["NXTAC09", "NXTAC10", "EXTAC09", "FABTAC01", "FABTAC10"]);
}

function c2c3PlayableEffectKinds() {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  return new Set(Array.isArray(config.playableTacticEffectKindsC2c3) ? config.playableTacticEffectKindsC2c3 : ["phase_shield", "stun_disable", "inhibit_attack", "stun_unit", "grant_stealth_vehicle"]);
}


function c2c4PlayableTacticIds() {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  return new Set(Array.isArray(config.playableTacticIdsC2c4) ? config.playableTacticIdsC2c4 : ["NXTAC04", "FABTAC11"]);
}

function c2c4PlayableEffectKinds() {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  return new Set(Array.isArray(config.playableTacticEffectKindsC2c4) ? config.playableTacticEffectKindsC2c4 : ["aoe_cell_damage", "small_cell_cluster_damage"]);
}

function c2c4aPlayableTacticIds() {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  return new Set(Array.isArray(config.playableTacticIdsC2c4a) ? config.playableTacticIdsC2c4a : ["FABTAC12", "FABTAC02", "NXTAC11", "AGTAC04", "AGTAC06"]);
}

function c2c4aPlayableEffectKinds() {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  return new Set(Array.isArray(config.playableTacticEffectKindsC2c4a) ? config.playableTacticEffectKindsC2c4a : ["next_attack_ignore_defense", "grant_stun_on_basic_attack", "ignore_defense_permanent", "set_structure_def_to_current_hp", "green_fortress_structure_growth"]);
}

function c2c5PlayableTacticIds() {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  return new Set(Array.isArray(config.playableTacticIdsC2c5) ? config.playableTacticIdsC2c5 : ["NXTAC06", "AGTAC01", "AGTAC02", "AGTAC03"]);
}

function c2c5PlayableEffectKinds() {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  return new Set(Array.isArray(config.playableTacticEffectKindsC2c5) ? config.playableTacticEffectKindsC2c5 : ["cell_movement_trap", "temporary_block_cell", "vegetal_anathema_trap", "bramble_path_trap"]);
}

function c2c5bPlayableTacticIds() {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  return new Set(Array.isArray(config.playableTacticIdsC2c5b) ? config.playableTacticIdsC2c5b : ["NXTAC05", "EXTAC05", "LBTAC12"]);
}

function c2c5bPlayableEffectKinds() {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  return new Set(Array.isArray(config.playableTacticEffectKindsC2c5b) ? config.playableTacticEffectKindsC2c5b : ["cell_movement_boost", "move_after_attack", "group_double_move_exhaust"]);
}

function c2c5cPlayableTacticIds() {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  return new Set(Array.isArray(config.playableTacticIdsC2c5c) ? config.playableTacticIdsC2c5c : ["LBTAC01", "LBTAC02", "LBTAC03", "LBTAC04"]);
}

function c2c5cPlayableEffectKinds() {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  return new Set(Array.isArray(config.playableTacticEffectKindsC2c5c) ? config.playableTacticEffectKindsC2c5c : ["spawn_two_militia", "spawn_predone_with_temp_vanguard", "spawn_clan_reinforcements", "spawn_militia_around_commander"]);
}

function c2c6aPlayableTacticIds() {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  return new Set(Array.isArray(config.playableTacticIdsC2c6a) ? config.playableTacticIdsC2c6a : ["NXTAC08", "EXTAC08", "LBTAC11", "AGTAC08"]);
}

function c2c6aPlayableEffectKinds() {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  return new Set(Array.isArray(config.playableTacticEffectKindsC2c6a) ? config.playableTacticEffectKindsC2c6a : ["draw_conditional_discount", "draw_two_buff_drawn_vehicles", "draw_if_infantry", "draw_by_structures"]);
}

function c2c6bPlayableTacticIds() {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  return new Set(Array.isArray(config.playableTacticIdsC2c6b) ? config.playableTacticIdsC2c6b : ["NXTAC07", "EXTAC07", "AGTAC09", "FABTAC08", "FABTAC09"]);
}

function c2c6bPlayableEffectKinds() {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  return new Set(Array.isArray(config.playableTacticEffectKindsC2c6b) ? config.playableTacticEffectKindsC2c6b : ["energy_gain_by_ps", "energy_gain_by_kills_this_turn", "structure_income_seed", "enemy_kill_gives_fabeot_energy", "usury_energy_income_debuff"]);
}

function c2c7aPlayableTacticIds() {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  return new Set(Array.isArray(config.playableTacticIdsC2c7a) ? config.playableTacticIdsC2c7a : ["FABTAC03", "FABTAC05", "FABTAC06", "FABTAC07"]);
}

function c2c7aPlayableEffectKinds() {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  return new Set(Array.isArray(config.playableTacticEffectKindsC2c7a) ? config.playableTacticEffectKindsC2c7a : ["bounce_unit_to_owner_hand_clean", "bounty_copy_on_death", "mutual_draw_conditional_steal", "block_enemy_hand_cards_by_ps"]);
}

function c2c7bPlayableTacticIds() {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  return new Set(Array.isArray(config.playableTacticIdsC2c7b) ? config.playableTacticIdsC2c7b : ["FABTAC04"]);
}

function c2c7bPlayableEffectKinds() {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  return new Set(Array.isArray(config.playableTacticEffectKindsC2c7b) ? config.playableTacticEffectKindsC2c7b : ["convert_isolated_enemy_infantry"]);
}

function c2c8PlayableTacticIds() {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  return new Set(Array.isArray(config.playableTacticIdsC2c8) ? config.playableTacticIdsC2c8 : ["EXTAC11", "LBTAC09", "LBTAC14", "AGTAC05"]);
}

function c2c8PlayableEffectKinds() {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  return new Set(Array.isArray(config.playableTacticEffectKindsC2c8) ? config.playableTacticEffectKindsC2c8 : ["extra_attack_on_kill", "grant_ambush", "coordinated_opportunity_attacks", "grant_counterattack"]);
}

function c2c8bPlayableTacticIds() {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  return new Set(Array.isArray(config.playableTacticIdsC2c8b) ? config.playableTacticIdsC2c8b : ["EXTAC12", "LBTAC08", "LBTAC10", "NXTAC12"]);
}

function c2c8bPlayableEffectKinds() {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  return new Set(Array.isArray(config.playableTacticEffectKindsC2c8b) ? config.playableTacticEffectKindsC2c8b : ["double_attack_next_attack", "next_attack_bleed_two", "arena_champion_permanent_attack", "heal_to_max"]);
}

function c2c8cPlayableTacticIds() {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  return new Set(Array.isArray(config.playableTacticIdsC2c8c) ? config.playableTacticIdsC2c8c : ["LBTAC07", "LBTAC13", "EXTAC04", "EXTAC10"]);
}

function c2c8cPlayableEffectKinds() {
  const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
  return new Set(Array.isArray(config.playableTacticEffectKindsC2c8c) ? config.playableTacticEffectKindsC2c8c : ["last_run_sacrifice_aoe", "sanguis_hunter_scaling_bleed", "destroy_non_unique_unit", "enemy_ability_cost_tax"]);
}

function c2cPlayableTacticIds() {
  return new Set([...c2c1PlayableTacticIds(), ...c2c2PlayableTacticIds(), ...c2c3PlayableTacticIds(), ...c2c4PlayableTacticIds(), ...c2c4aPlayableTacticIds(), ...c2c5PlayableTacticIds(), ...c2c5bPlayableTacticIds(), ...c2c5cPlayableTacticIds(), ...c2c6aPlayableTacticIds(), ...c2c6bPlayableTacticIds(), ...c2c7aPlayableTacticIds(), ...c2c7bPlayableTacticIds(), ...c2c8PlayableTacticIds(), ...c2c8bPlayableTacticIds(), ...c2c8cPlayableTacticIds()]);
}

function c2cPlayableEffectKinds() {
  return new Set([...c2c1PlayableEffectKinds(), ...c2c2PlayableEffectKinds(), ...c2c3PlayableEffectKinds(), ...c2c4PlayableEffectKinds(), ...c2c4aPlayableEffectKinds(), ...c2c5PlayableEffectKinds(), ...c2c5bPlayableEffectKinds(), ...c2c5cPlayableEffectKinds(), ...c2c6aPlayableEffectKinds(), ...c2c6bPlayableEffectKinds(), ...c2c7aPlayableEffectKinds(), ...c2c7bPlayableEffectKinds(), ...c2c8PlayableEffectKinds(), ...c2c8bPlayableEffectKinds(), ...c2c8cPlayableEffectKinds()]);
}

function isC2c1SingleDamageTacticCard(card) {
  // Nome storico conservato per compatibilità UI C2c-1b.
  // Da C2c-2 indica: tattica da mano implementata nel ciclo C2c.
  // C2c-4a-fix: normalizza tramite DECK_TACTICS, così anche carte già in mano
  // create da dati vecchi diventano giocabili se il loro tacticId è ora implementato.
  const c = normalizeHandTacticCard(card);
  if (!c || c.sourceType !== "tactic") return false;
  if (!c2cPlayableTacticIds().has(c.tacticId || c.sourceId)) return false;
  return c2cPlayableEffectKinds().has(c.effectKind);
}

function isC2c2DamageDebuffCleanseTacticCard(card) {
  const c = normalizeHandTacticCard(card);
  if (!c || c.sourceType !== "tactic") return false;
  if (!c2c2PlayableTacticIds().has(c.tacticId || c.sourceId)) return false;
  return c2c2PlayableEffectKinds().has(c.effectKind);
}

function isC2c3ControlStatusTacticCard(card) {
  const c = normalizeHandTacticCard(card);
  if (!c || c.sourceType !== "tactic") return false;
  if (!c2c3PlayableTacticIds().has(c.tacticId || c.sourceId)) return false;
  return c2c3PlayableEffectKinds().has(c.effectKind);
}

function isC2c4SimpleAoeTacticCard(card) {
  const c = normalizeHandTacticCard(card);
  if (!c || c.sourceType !== "tactic") return false;
  if (!c2c4PlayableTacticIds().has(c.tacticId || c.sourceId)) return false;
  return c2c4PlayableEffectKinds().has(c.effectKind);
}

function isC2c4aRecoveredBuffStructureTacticCard(card) {
  const c = normalizeHandTacticCard(card);
  if (!c || c.sourceType !== "tactic") return false;
  if (!c2c4aPlayableTacticIds().has(c.tacticId || c.sourceId)) return false;
  return c2c4aPlayableEffectKinds().has(c.effectKind);
}

function isC2c5MovementCellTacticCard(card) {
  const c = normalizeHandTacticCard(card);
  if (!c || c.sourceType !== "tactic") return false;
  if (!c2c5PlayableTacticIds().has(c.tacticId || c.sourceId)) return false;
  return c2c5PlayableEffectKinds().has(c.effectKind);
}

function isC2c5bActiveMovementTacticCard(card) {
  const c = normalizeHandTacticCard(card);
  if (!c || c.sourceType !== "tactic") return false;
  if (!c2c5bPlayableTacticIds().has(c.tacticId || c.sourceId)) return false;
  return c2c5bPlayableEffectKinds().has(c.effectKind);
}

function isC2c5cLibertiSpawnTacticCard(card) {
  const c = normalizeHandTacticCard(card);
  if (!c || c.sourceType !== "tactic") return false;
  if (!c2c5cPlayableTacticIds().has(c.tacticId || c.sourceId)) return false;
  return c2c5cPlayableEffectKinds().has(c.effectKind);
}

function isC2c6aDrawCardEconomyTacticCard(card) {
  const c = normalizeHandTacticCard(card);
  if (!c || c.sourceType !== "tactic") return false;
  if (!c2c6aPlayableTacticIds().has(c.tacticId || c.sourceId)) return false;
  return c2c6aPlayableEffectKinds().has(c.effectKind);
}

function isC2c6bEnergyEconomyTacticCard(card) {
  const c = normalizeHandTacticCard(card);
  if (!c || c.sourceType !== "tactic") return false;
  if (!c2c6bPlayableTacticIds().has(c.tacticId || c.sourceId)) return false;
  return c2c6bPlayableEffectKinds().has(c.effectKind);
}

function isC2c7aFabeotHandTheftTacticCard(card) {
  const c = normalizeHandTacticCard(card);
  if (!c || c.sourceType !== "tactic") return false;
  if (!c2c7aPlayableTacticIds().has(c.tacticId || c.sourceId)) return false;
  return c2c7aPlayableEffectKinds().has(c.effectKind);
}

function isC2c7bFabeotConversionTacticCard(card) {
  const c = normalizeHandTacticCard(card);
  if (!c || c.sourceType !== "tactic") return false;
  if (!c2c7bPlayableTacticIds().has(c.tacticId || c.sourceId)) return false;
  return c2c7bPlayableEffectKinds().has(c.effectKind);
}

function isC2c8ReactionTacticCard(card) {
  const c = normalizeHandTacticCard(card);
  if (!c || c.sourceType !== "tactic") return false;
  if (!c2c8PlayableTacticIds().has(c.tacticId || c.sourceId)) return false;
  return c2c8PlayableEffectKinds().has(c.effectKind);
}

function isC2c8bBuffHealTacticCard(card) {
  const c = normalizeHandTacticCard(card);
  if (!c || c.sourceType !== "tactic") return false;
  if (!c2c8bPlayableTacticIds().has(c.tacticId || c.sourceId)) return false;
  return c2c8bPlayableEffectKinds().has(c.effectKind);
}


function isC2c8cFinalAdvancedTacticCard(card) {
  const c = normalizeHandTacticCard(card);
  if (!c || c.sourceType !== "tactic") return false;
  if (!c2c8cPlayableTacticIds().has(c.tacticId || c.sourceId)) return false;
  return c2c8cPlayableEffectKinds().has(c.effectKind);
}

function isHandTacticCellTargetCard(card) {
  const c = normalizeHandTacticCard(card);
  return Boolean(c && (c.targetDomain === "board_cell" || c.targetDomain === "deployment_cell" || c.targetDomain === "deployment_cell_group" || c.targetDomain === "board_edge_cells" || c2c4PlayableEffectKinds().has(c.effectKind)));
}

function isHandTacticImmediateNoTargetCard(card) {
  const c = normalizeHandTacticCard(card);
  return Boolean(c && c.sourceType === "tactic" && (
    (c2c6aPlayableEffectKinds().has(c.effectKind) && (c.targetDomain === "deck" || c.rangeMode === "none"))
    || (c2c6bPlayableEffectKinds().has(c.effectKind) && ["energy_pool", "player"].includes(c.targetDomain) && c.rangeMode === "none")
    || (c2c7aPlayableEffectKinds().has(c.effectKind) && ["deck", "hand"].includes(c.targetDomain) && c.rangeMode === "none")
    || (c.effectKind === "enemy_ability_cost_tax" && c.rangeMode === "none")
  ));
}

function tacticIdFromHandCard(card) {
  if (!card) return "";
  const raw = card.tacticId || card.sourceId || card.sourceId || card.id || "";
  return String(raw).replace(/^TACTIC:/, "");
}

function handTacticDefinition(card) {
  if (!card || card.sourceType !== "tactic") return null;
  const id = tacticIdFromHandCard(card);
  return deckTacticById(id) || card;
}

function normalizeHandTacticCard(card) {
  if (!card || card.sourceType !== "tactic") return card;
  const id = tacticIdFromHandCard(card);
  const def = deckTacticById(id);
  if (!def) return card;
  return {
    ...card,
    tacticId: id,
    sourceId: card.sourceId || id,
    name: def.name || card.name,
    faction: def.faction || card.faction,
    // C2c-6a: le carte pescate da effetti possono avere costo modificato sulla singola istanza.
    // Non sovrascriverlo con il costo base del catalogo.
    cost: card.c2c6aCostAdjusted && Number.isFinite(card.cost) ? card.cost : (Number.isFinite(def.cost) ? def.cost : (card.cost || 0)),
    quality: def.quality || card.quality || "",
    category: def.category || card.category || "",
    target: def.target || card.target || "",
    targetDomain: def.targetDomain || card.targetDomain || "",
    targetSide: def.targetSide || card.targetSide || "",
    rangeMode: def.rangeMode || card.rangeMode || "none",
    range: Number.isFinite(def.range) ? def.range : card.range,
    condition: def.condition || card.condition || "",
    effectText: def.effectText || def.description || card.effectText || "",
    duration: def.duration || card.duration || "",
    effectKind: def.effectKind || card.effectKind || "",
    implementationStatus: def.implementationStatus || card.implementationStatus || "data_only",
    notes: def.notes || card.notes || ""
  };
}

function handTacticEffectKind(card) {
  const c = normalizeHandTacticCard(card);
  return c && c.effectKind ? c.effectKind : "";
}

function handTacticDamageAmount(card, target) {
  const c = normalizeHandTacticCard(card);
  if (!c || !target) return 0;
  if (c.effectKind === "damage_bonus_vs_vehicle") return handTacticIsVehicle(target) ? 3 : 2;
  if (c.effectKind === "damage_structure") return 4;
  if (c.effectKind === "demolition_charge") return 5;
  if (c.effectKind === "damage_and_cleanse_buffs") return 2;
  if (c.effectKind === "damage_and_permanent_att_debuff") return 2;
  if (c.effectKind === "damage_and_bleed") return 1;
  if (c.tacticId === "NXTAC02") return 4;
  if (c.tacticId === "NXTAC01") return 2;
  return 0;
}

function handTacticSourceCells(player, card) {
  const c = normalizeHandTacticCard(card);
  if (!state || !c) return [];
  if (c.effectKind === "demolition_charge") {
    // C2c-1b: Carica da Demolizione resta volutamente più stretta:
    // fonte valida = fanteria/veicolo Liberti vivo, non struttura e non QG.
    return combatUnits(player)
      .filter(u => u && u.faction === "Liberti" && u.type !== "Struttura" && u.type !== "QG")
      .map(u => u.pos)
      .filter(Boolean);
  }
  if (c.rangeMode === "ally_network") {
    // C2c-1b: rete operativa standard = unità o struttura alleata viva; QG escluso.
    return combatUnits(player)
      .filter(u => u && u.type !== "QG")
      .map(u => u.pos)
      .filter(Boolean);
  }
  return [];
}

function isInHandTacticRange(player, card, target) {
  const c = normalizeHandTacticCard(card);
  if (!target || !target.pos || !c) return false;
  // C2c-5c: alcuni spawn tattici usano regole speciali di sbarco/bordo/comandante
  // già validate nei rispettivi candidate/filter, non la rete operativa standard.
  if (c2c5cPlayableEffectKinds().has(c.effectKind)) return true;
  const range = Number.isFinite(c.range) ? c.range : 0;
  const sources = handTacticSourceCells(player, c);
  return sources.some(pos => hexDistance(pos, target.pos) <= range);
}

function handTacticCellName(coord) {
  return `cella [${coord.join(",")}]`;
}

function handTacticCellTargetFor(cell) {
  return {
    uid: `CELL:${coordKey(cell.coord)}`,
    pos: [...cell.coord],
    cell,
    isCellTarget: true,
    type: "Cella",
    side: null,
    alive: true,
    name: handTacticCellName(cell.coord)
  };
}

function libertiSpawnBlueprint(id) {
  return blueprintById(id, "Liberti") || BLUEPRINTS.find(x => x && x.id === id);
}

function c2c5cMilitiaBlueprint() { return libertiSpawnBlueprint("LX2B01"); }
function c2c5cPredoneBlueprint() { return libertiSpawnBlueprint("LX2B02"); }

function c2c5cCellTargetForCoord(coord, label="cella") {
  return {
    uid: `CELL:${coordKey(coord)}`,
    pos: [...coord],
    cell: getCellAt(coord),
    isCellTarget: true,
    type: "Cella",
    side: null,
    alive: true,
    name: `${label} [${coord.join(",")}]`
  };
}

function c2c5cSpawnCellsForBlueprint(player, bp) {
  return (typeof spawnCellsFor === "function" && bp) ? spawnCellsFor(player, bp) : [];
}

function c2c5cAvailableCapacity(player, bp) {
  if (!bp) return 0;
  if (typeof countsAsLightCap === "function" && countsAsLightCap(bp)) {
    return Math.max(0, lightFieldLimit(player, bp.type) - lightBucketCount(player, bp));
  }
  const limit = typeof fieldLimitFor === "function" ? fieldLimitFor(bp, player) : Infinity;
  if (!Number.isFinite(limit)) return Infinity;
  return Math.max(0, limit - activeBlueprintCount(player, bp));
}

function c2c5cAdjacentSpawnCellPair(player, firstCoord) {
  const bp = c2c5cMilitiaBlueprint();
  if (c2c5cAvailableCapacity(player, bp) < 2) return [];
  const cells = c2c5cSpawnCellsForBlueprint(player, bp);
  if (!bp || !firstCoord || !cells.some(c => sameCoord(c, firstCoord))) return [];
  const second = cells.find(c => !sameCoord(c, firstCoord) && areAdjacent(c, firstCoord));
  return second ? [[...firstCoord], [...second]] : [];
}

function c2c5cIsEdgeCell(coord) {
  return Boolean(coord && getCellAt(coord) && neighbors(coord).filter(n => getCellAt(n)).length < 6);
}

function c2c5cIsInAlliedHalf(player, coord) {
  const own = getHq(player);
  const enemy = getHq(enemyOf(player));
  if (!own || !enemy || !coord) return false;
  return hexDistance(coord, own.pos) <= hexDistance(coord, enemy.pos);
}

function c2c5cClanCandidateCells(player) {
  const predone = c2c5cPredoneBlueprint();
  const militia = c2c5cMilitiaBlueprint();
  if (c2c5cAvailableCapacity(player, predone) <= 0 && c2c5cAvailableCapacity(player, militia) <= 0) return [];
  return (state.cells || [])
    .map(cell => cell && cell.coord)
    .filter(Boolean)
    .filter(c => c2c5cIsEdgeCell(c) && c2c5cIsInAlliedHalf(player, c))
    .filter(c => !hqSideAt(c) && isCellEnterable(c) && !getUnitAt(c));
}

function c2c5cClanSpawnCoords(player, firstCoord) {
  const predone = c2c5cPredoneBlueprint();
  const militia = c2c5cMilitiaBlueprint();
  if (!predone || !militia || !firstCoord) return [];
  const candidates = c2c5cClanCandidateCells(player);
  if (!candidates.some(c => sameCoord(c, firstCoord))) return [];
  const selected = [...firstCoord];
  const free = candidates
    .filter(c => !sameCoord(c, selected))
    .filter(c => areAdjacent(c, selected) || hexDistance(c, selected) <= 2)
    .sort((a,b) => hexDistance(a, selected) - hexDistance(b, selected) || coordKey(a).localeCompare(coordKey(b)));
  return [selected, ...free.slice(0, 2)].map(c => [...c]);
}

function c2c5cCommanderMilitiaCoords(player, commander) {
  const bp = c2c5cMilitiaBlueprint();
  const cap = c2c5cAvailableCapacity(player, bp);
  if (!bp || cap <= 0 || !commander || commander.side !== player || commander.type !== "Comandante" || !commander.pos) return [];
  return neighbors(commander.pos)
    .filter(c => isCellEnterable(c) && !getUnitAt(c))
    .slice(0, Math.min(6, cap))
    .map(c => [...c]);
}

function handTacticCandidateCells(player, card) {
  const c = normalizeHandTacticCard(card);
  if (!state || !c || !isHandTacticCellTargetCard(c)) return [];

  if (c.effectKind === "spawn_two_militia") {
    const bp = c2c5cMilitiaBlueprint();
    return c2c5cSpawnCellsForBlueprint(player, bp)
      .filter(coord => c2c5cAdjacentSpawnCellPair(player, coord).length === 2)
      .map(coord => c2c5cCellTargetForCoord(coord, "punto sbarco"));
  }

  if (c.effectKind === "spawn_predone_with_temp_vanguard") {
    const bp = c2c5cPredoneBlueprint();
    return c2c5cSpawnCellsForBlueprint(player, bp)
      .map(coord => c2c5cCellTargetForCoord(coord, "punto sbarco"));
  }

  if (c.effectKind === "spawn_clan_reinforcements") {
    return c2c5cClanCandidateCells(player)
      .map(coord => c2c5cCellTargetForCoord(coord, "bordo alleato"));
  }

  return (state.cells || [])
    .filter(cell => cell && Array.isArray(cell.coord))
    .filter(cell => (!(c2c5IsCellTerrainEffect(c) || c2c5bIsCellMovementBoost(c)) || isCellValidForTerrainTactic(cell.coord, c.effectKind)))
    .map(handTacticCellTargetFor)
    .filter(target => isInHandTacticRange(player, c, target));
}

function c2c4ValidAoeCoords(center, includeFullRing) {
  const coords = includeFullRing ? [center, ...neighbors(center)] : [center];
  return uniqueCoords(coords).filter(c => getCellAt(c));
}

function c2c4SmallClusterCoords(center) {
  const adj = neighbors(center).filter(c => getCellAt(c));
  const scored = adj.slice().sort((a, b) => {
    const au = getUnitAt(a);
    const bu = getUnitAt(b);
    const as = au ? 0 : 1;
    const bs = bu ? 0 : 1;
    if (as !== bs) return as - bs;
    return coordKey(a).localeCompare(coordKey(b));
  });
  return uniqueCoords([center, ...scored.slice(0, 2)]).filter(c => getCellAt(c));
}

function c2c4AoeCoordsFor(card, target) {
  const c = normalizeHandTacticCard(card);
  const center = target && target.pos ? target.pos : null;
  if (!center || !c) return [];
  if (c.effectKind === "aoe_cell_damage") return c2c4ValidAoeCoords(center, true);
  if (c.effectKind === "small_cell_cluster_damage") return c2c4SmallClusterCoords(center);
  return [];
}

function c2c5IsCellTerrainEffect(card) {
  const c = normalizeHandTacticCard(card);
  return Boolean(c && c2c5PlayableEffectKinds().has(c.effectKind));
}

function c2c5CellEffectTurns(effectKind) {
  if (effectKind === "temporary_block_cell") return 2;
  if (effectKind === "vegetal_anathema_trap") return 2;
  if (effectKind === "bramble_path_trap") return 3;
  if (effectKind === "cell_movement_trap") return 1;
  return 1;
}

function handTacticIsCommanderOrPivot(unit) {
  return Boolean(unit && (unit.type === "Comandante" || unit.weight === "Pivot"));
}

function handTacticUnitType(unit) {
  return String((unit && (unit.type || unit.unitType || unit.cardType)) || "");
}

function handTacticIsInfantry(unit) {
  return handTacticUnitType(unit) === "Fanteria";
}

function handTacticIsVehicle(unit) {
  return handTacticUnitType(unit) === "Veicolo";
}

function handTacticIsStructure(unit) {
  return handTacticUnitType(unit) === "Struttura";
}

function c2c5bIsMovableCombatUnit(unit) {
  return Boolean(unit && unit.alive && unit.type !== "QG" && unit.type !== "Struttura" && Array.isArray(unit.pos));
}

function c2c5bReadyMoveUnit(unit) {
  return Boolean(c2c5bIsMovableCombatUnit(unit) && !unit.acted && !unit.movedThisTurn && !statusBlocks(unit, "move"));
}

function c2c5bHordeGroup(player, anchor) {
  if (!anchor || anchor.side !== player || !c2c5bReadyMoveUnit(anchor)) return [];
  const candidates = combatUnits(player).filter(u => u.uid !== anchor.uid && c2c5bReadyMoveUnit(u));
  const connected = candidates
    .filter(u => areAdjacent(u.pos, anchor.pos) || candidates.some(v => v.uid !== u.uid && areAdjacent(u.pos, v.pos) && areAdjacent(v.pos, anchor.pos)))
    .sort((a, b) => hexDistance(a.pos, anchor.pos) - hexDistance(b.pos, anchor.pos) || effectiveLife(a) - effectiveLife(b));
  return [anchor, ...connected].slice(0, 3);
}

function handTacticTargetUnitFilter(player, card, target) {
  const c = normalizeHandTacticCard(card);
  if (!c || !target || !isFieldUnit(target) || isUntargetableTo(target, player)) return false;

  const sideRule = c.targetSide || "enemy";
  if (sideRule === "enemy" && target.side === player) return false;
  if (sideRule === "ally" && target.side !== player) return false;
  if (sideRule === "both" && target.type === "QG") return false;
  const effectKind = c.effectKind;

  if (effectKind === "damage_structure" || effectKind === "demolition_charge") return target.side !== player && handTacticIsStructure(target);
  if (effectKind === "damage_and_cleanse_buffs") return target.side !== player && target.type !== "QG" && target.type !== "Struttura";
  if (effectKind === "damage_and_permanent_att_debuff" || effectKind === "damage_and_permanent_attack_debuff") return target.side !== player && target.type !== "QG" && target.type !== "Struttura";
  if (effectKind === "damage_and_bleed") return target.side !== player && (handTacticIsInfantry(target) || handTacticIsVehicle(target));
  if (effectKind === "set_def_to_one_round" || effectKind === "set_defense_to_one") return target.side !== player && target.type !== "QG";
  if (effectKind === "grant_thorns_temp" || effectKind === "grant_thorns_two") return target.side === player && target.type !== "QG";
  if (effectKind === "phase_shield") return target.side === player && target.type !== "QG";
  if (effectKind === "stun_disable") return target.side !== player && target.type !== "QG";
  if (effectKind === "inhibit_attack") return target.side !== player && target.type !== "QG";
  if (effectKind === "stun_unit") return target.side !== player && target.type !== "QG" && target.type !== "Struttura";
  if (effectKind === "grant_stealth_vehicle") return target.side === player && handTacticIsVehicle(target);
  if (effectKind === "next_attack_ignore_defense") return target.side === player && handTacticIsInfantry(target);
  if (effectKind === "grant_stun_on_basic_attack") return target.side === player && (handTacticIsInfantry(target) || handTacticIsVehicle(target)) && !handTacticIsCommanderOrPivot(target);
  if (effectKind === "ignore_defense_permanent") return target.side === player && target.type !== "QG" && target.type !== "Struttura";
  if (effectKind === "set_structure_def_to_current_hp") return target.side === player && handTacticIsStructure(target);
  if (effectKind === "green_fortress_structure_growth") return target.side === player && handTacticIsStructure(target);
  if (effectKind === "move_after_attack") return target.side === player && c2c5bIsMovableCombatUnit(target) && (target.attacksMade || 0) > 0;
  if (effectKind === "group_double_move_exhaust") return target.side === player && c2c5bHordeGroup(player, target).length >= 2;
  if (effectKind === "spawn_militia_around_commander") return target.side === player && target.type === "Comandante" && c2c5cCommanderMilitiaCoords(player, target).length > 0;
  if (effectKind === "structure_income_seed") return target.side === player && handTacticIsStructure(target) && !(typeof hasStatus === "function" && hasStatus(target, "agathoi_income_seed"));
  if (effectKind === "enemy_kill_gives_fabeot_energy") return target.side !== player && target.type !== "QG" && !handTacticIsStructure(target) && !handTacticIsCommanderOrPivot(target);
  if (effectKind === "bounce_unit_to_owner_hand_clean") return (target.side === player || target.side === enemyOf(player)) && (handTacticIsInfantry(target) || handTacticIsVehicle(target)) && !handTacticIsCommanderOrPivot(target);
  if (effectKind === "bounty_copy_on_death") return target.side !== player && (handTacticIsInfantry(target) || handTacticIsVehicle(target)) && !handTacticIsCommanderOrPivot(target);
  if (effectKind === "extra_attack_on_kill") return target.side === player && target.type !== "QG" && !handTacticIsStructure(target);
  if (effectKind === "grant_ambush") return target.side === player && handTacticIsInfantry(target) && !handTacticIsCommanderOrPivot(target);
  if (effectKind === "grant_counterattack") return target.side === player && handTacticIsInfantry(target) && !handTacticIsCommanderOrPivot(target);
  if (effectKind === "coordinated_opportunity_attacks") return target.side !== player && handTacticIsInfantry(target) && c2c8AdjacentOpportunityAttackers(player, target).length > 0;
  if (effectKind === "double_attack_next_attack") return target.side === player && target.type !== "QG" && !handTacticIsStructure(target);
  if (effectKind === "next_attack_bleed_two") return target.side === player && handTacticIsInfantry(target);
  if (effectKind === "arena_champion_permanent_attack") return target.side === player && handTacticIsInfantry(target) && !handTacticIsCommanderOrPivot(target) && !target.c2c8bArenaChampionApplied;
  if (effectKind === "heal_to_max") return target.side === player && target.type !== "QG" && Number.isFinite(target.currentHp) && Number.isFinite(target.maxHp) && target.currentHp < target.maxHp;
  if (effectKind === "last_run_sacrifice_aoe") return target.side === player && handTacticIsInfantry(target) && !handTacticIsCommanderOrPivot(target);
  if (effectKind === "sanguis_hunter_scaling_bleed") return target.side === player && handTacticIsInfantry(target) && !handTacticIsCommanderOrPivot(target) && !target.c2c8cSanguisHunter;
  if (effectKind === "destroy_non_unique_unit") return target.side !== player && (handTacticIsInfantry(target) || handTacticIsVehicle(target)) && !handTacticIsCommanderOrPivot(target);
  if (effectKind === "convert_isolated_enemy_infantry") return c2c7bCanConvertByDoctrine(player, target, false);

  return target.side !== player && target.type !== "QG";
}

function handTacticCandidateUnits(player, card) {
  const c = normalizeHandTacticCard(card);
  if (!c) return [];
  if (c.targetSide === "ally") return combatUnits(player);
  if (c.targetSide === "both") return combatUnits(null);
  return combatUnits(enemyOf(player));
}

function handTacticTargets(player, card) {
  const c = normalizeHandTacticCard(card);
  if (!isC2c1SingleDamageTacticCard(c)) return [];
  if (isHandTacticCellTargetCard(c)) return handTacticCandidateCells(player, c);
  return handTacticCandidateUnits(player, c)
    .filter(target => handTacticTargetUnitFilter(player, c, target))
    .filter(target => isInHandTacticRange(player, c, target));
}

function canUseHandTacticCard(player, card) {
  const c = normalizeHandTacticCard(card);
  if (!state || state.winner || !c) return { ok:false, reason:"Carta assente" };
  if (!isC2c1SingleDamageTacticCard(c)) return { ok:false, reason:"Tattica C2 non ancora implementata" };
  if (playerHandLocked(player)) return { ok:false, reason:"Mano bloccata" };
  if (typeof handCardBlocked === "function" && handCardBlocked(card)) return { ok:false, reason:handCardBlockReason(card) };
  if (playerEnergyLocked(player) && (card.cost || 0) > 0) return { ok:false, reason:"ENE bloccata" };
  if ((state.energy[player] || 0) < (c.cost || 0)) return { ok:false, reason:"ENE insufficiente" };

  if (isC2c6aDrawCardEconomyTacticCard(c)) {
    const deckCount = state.deck && state.deck[player] ? state.deck[player].length : 0;
    if (deckCount <= 0) return { ok:false, reason:"Deck vuoto" };
    if (c.effectKind === "draw_by_structures" && c2c6aActiveAlliedStructures(player).length <= 0) return { ok:false, reason:"Nessuna struttura alleata viva" };
  }

  if (isC2c6bEnergyEconomyTacticCard(c)) {
    if (c.effectKind === "energy_gain_by_ps" && countControlledPS(player) <= 0) return { ok:false, reason:"Serve almeno 1 PS occupato" };
    if (c.effectKind === "energy_gain_by_kills_this_turn" && (typeof c2c6bEnemyDestroyedThisTurn === "function" ? c2c6bEnemyDestroyedThisTurn(player) : 0) <= 0) return { ok:false, reason:"Nessuna unità nemica distrutta in questo turno" };
  }

  if (isC2c7aFabeotHandTheftTacticCard(c)) {
    const enemy = enemyOf(player);
    const enemyHand = state.hand && state.hand[enemy] ? state.hand[enemy] : [];
    const ownDeck = state.deck && state.deck[player] ? state.deck[player] : [];
    const enemyDeck = state.deck && state.deck[enemy] ? state.deck[enemy] : [];
    if (c.effectKind === "mutual_draw_conditional_steal" && ownDeck.length <= 0) return { ok:false, reason:"Deck Fabeot vuoto" };
    if (c.effectKind === "mutual_draw_conditional_steal" && enemyDeck.length <= 0) return { ok:false, reason:"Deck avversario vuoto" };
    if (c.effectKind === "block_enemy_hand_cards_by_ps" && countControlledPS(player) <= 0) return { ok:false, reason:"Serve almeno 1 PS controllato da Fabeot" };
    if (c.effectKind === "block_enemy_hand_cards_by_ps" && enemyHand.filter(x => !(typeof handCardBlocked === "function" && handCardBlocked(x))).length <= 0) return { ok:false, reason:"Nessuna carta avversaria sbloccata in mano" };
  }

  if (isC2c7bFabeotConversionTacticCard(c)) {
    if (!handTacticTargets(player, c).length) return { ok:false, reason:"Nessuna fanteria nemica isolata convertibile entro raggio" };
  }

  if (isC2c8ReactionTacticCard(c)) {
    if (!handTacticTargets(player, c).length) return { ok:false, reason:"Nessun bersaglio valido per reazione/attacco opportunità entro raggio" };
  }

  if (isC2c8bBuffHealTacticCard(c)) {
    if (!handTacticTargets(player, c).length) return { ok:false, reason:"Nessun bersaglio valido per buff offensivo/riparazione entro raggio" };
  }

  if (isC2c8cFinalAdvancedTacticCard(c)) {
    if (c.effectKind === "enemy_ability_cost_tax") {
      const enemy = enemyOf(player);
      const targets = combatUnits(enemy).filter(u => u && u.ability && !u.ability.passive && (u.ability.cost || 0) > 0);
      if (!targets.length) return { ok:false, reason:"Nessuna abilità nemica non gratuita da tassare" };
    } else if (!handTacticTargets(player, c).length) {
      return { ok:false, reason:"Nessun bersaglio valido per tattica avanzata entro raggio" };
    }
  }

  // C2c-1b hotfix:
  // il pulsante deve essere cliccabile anche prima di validare il bersaglio.
  // Il controllo dei bersagli avviene dopo il click, quando si entra in modalità targeting.
  const targetCount = handTacticTargets(player, c).length;
  return {
    ok:true,
    reason: targetCount ? `Pronta · bersagli validi ${targetCount}` : "Pronta · nessun bersaglio valido ora"
  };
}

function beginHandTacticCardPlay(cardUid) {
  if (!state || state.winner || botRunning) return false;
  const player = state.currentPlayer;
  const card = handCardByUid(player, cardUid);
  const check = canUseHandTacticCard(player, card);
  if (!check.ok) {
    log(`Carta ${card ? card.name : cardUid}: ${check.reason}.`);
    renderAll();
    return false;
  }

  const targets = handTacticTargets(player, card);
  if (isHandTacticImmediateNoTargetCard(card)) {
    const used = useHandTacticCard(player, card, null);
    if (used && typeof closeHandPanelAfterAcceptedCardPlay === "function") closeHandPanelAfterAcceptedCardPlay();
    else if (used && typeof apkM4CloseHandAfterCardPlay === "function") apkM4CloseHandAfterCardPlay();
    clearSelection();
    if (used && typeof postActionChecks === "function") postActionChecks(false);
    else renderAll();
    return used;
  }

  if (!targets.length) {
    log(`Carta ${card.name}: nessun bersaglio valido entro raggio. Avvicina una tua unità/struttura operativa o scegli un altro momento.`, EventTypes.LOG_MESSAGE, {
      player,
      faction: state.factions[player],
      cardUid: card.cardUid,
      cardName: card.name,
      tacticId: card.tacticId || card.sourceId,
      source: "C2c-1b-hand-tactic-target-check"
    });
    renderAll();
    return false;
  }

  pendingHandCardUid = card.cardUid;
  pendingTacticId = card.tacticId || card.sourceId;
  pendingAbility = null;
  pendingBuildBlueprintId = null;
  pendingPurchaseBlueprintId = null;
  selectedId = null;
  mode = "tactic";
  log(`Carta ${card.name}: scegli il bersaglio evidenziato della tattica C2c.`, EventTypes.LOG_MESSAGE, {
    player,
    faction: state.factions[player],
    cardUid: card.cardUid,
    cardName: card.name,
    tacticId: pendingTacticId,
    validTargets: targets.length,
    source: "C2c-1b-hand-tactic"
  });
  if (typeof closeHandPanelAfterAcceptedCardPlay === "function") closeHandPanelAfterAcceptedCardPlay();
  else if (typeof apkM4CloseHandAfterCardPlay === "function") apkM4CloseHandAfterCardPlay();
  renderAll();
  return true;
}


function removeHandTacticPositiveEffects(target, source) {
  if (typeof removePositiveEffects === "function") {
    removePositiveEffects(target, source);
    return;
  }
  let removed = 0;
  for (const buff of target.buffs || []) {
    if (buff.stat === "att") target.currentAtt = Math.max(0, target.currentAtt - (buff.value || 0));
    if (buff.stat === "def") target.currentDef = Math.max(0, target.currentDef - (buff.value || 0));
    removed += 1;
  }
  target.buffs = [];
  const positive = new Set(["thorns", "untargetable", "phase_shield", "ability_untargetable", "ambush", "counterattack", "extra_attack_on_kill", "stealth", "enemy_effect_immune"]);
  const before = (target.statuses || []).length;
  target.statuses = (target.statuses || []).filter(st => !positive.has(st.kind));
  removed += before - target.statuses.length;
  log(`${source}: rimossi ${removed} buff/effetti positivi da ${target.name}.`);
}

function applyPermanentAttackDebuff(target, value, source) {
  if (!target || !value) return 0;
  const loss = Math.min(Math.max(0, target.currentAtt || 0), Math.abs(value));
  if (!loss) {
    log(`${source}: ${target.name} non ha ATT da ridurre.`);
    return 0;
  }
  target.baseAtt = Math.max(0, (typeof target.baseAtt === "number" ? target.baseAtt : target.currentAtt) - loss);
  target.currentAtt = Math.max(0, (target.currentAtt || 0) - loss);
  log(`${target.name} subisce -${loss} ATT permanente da ${source}.`);
  return loss;
}

function applyTemporaryDefToOne(target, source) {
  if (!target) return 0;
  const reduction = Math.max(0, (target.currentDef || 0) - 1);
  if (!reduction) {
    log(`${source}: ${target.name} ha già DEF ${target.currentDef || 0}.`);
    return 0;
  }
  target.currentDef = 1;
  target.buffs = target.buffs || [];
  target.buffs.push({ stat:"def", value:-reduction, turns:1, source, c2c2TemporaryDebuff:true });
  log(`${target.name} viene neutralizzato: DEF corrente portata a 1 fino al prossimo turno.`);
  return reduction;
}

function applyStructureDefToCurrentHp(target, source) {
  if (!target || target.type !== "Struttura") return { defGain:0 };
  const before = target.currentDef || 0;
  const desired = Math.max(0, target.currentHp || 0);
  target.currentDef = Math.max(before, desired);
  const defGain = Math.max(0, target.currentDef - before);
  log(`${source}: ${target.name} ricostruisce il Bastione Ligneo: DEF ${before} → ${target.currentDef}.`, EventTypes.STATUS_APPLIED, {
    targetId: target.uid,
    targetName: target.name,
    beforeDef: before,
    afterDef: target.currentDef,
    defGain,
    source
  });
  return { defGain };
}

function applyGreenFortressGrowth(player, target, source) {
  if (!target || !handTacticIsStructure(target) || !Array.isArray(target.pos)) return { defGain:0, hpMaxGain:0, adjacentStructures:0, adjacentInfantry:0 };
  const allies = combatUnits(player).filter(u => u && u.uid !== target.uid && Array.isArray(u.pos) && areAdjacent(u.pos, target.pos));
  const adjacentStructures = allies.filter(handTacticIsStructure).length;
  const adjacentInfantry = allies.filter(handTacticIsInfantry).length;
  const defGain = adjacentStructures * 2;
  const hpMaxGain = adjacentInfantry;
  const beforeDef = Number.isFinite(target.currentDef) ? target.currentDef : 0;
  const beforeMaxHp = Number.isFinite(target.maxHp) ? target.maxHp : (Number.isFinite(target.hp) ? target.hp : 0);
  const beforeCurrentHp = Number.isFinite(target.currentHp) ? target.currentHp : beforeMaxHp;
  target.currentDef = beforeDef + defGain;
  target.maxHp = beforeMaxHp + hpMaxGain;
  // Manteniamo esplicitamente gli HP correnti invariati: Fortezza Verde aumenta il tetto massimo, non cura.
  target.currentHp = beforeCurrentHp;
  target.buffs = target.buffs || [];
  if (hpMaxGain > 0) target.buffs.push({ stat:"maxHp", value:hpMaxGain, turns:999, source, permanent:true, c2c4a:true });
  if (defGain > 0) target.buffs.push({ stat:"def", value:defGain, turns:999, source, permanent:true, c2c4a:true });
  log(`${source}: ${target.name} cresce come Fortezza Verde: DEF ${beforeDef} → ${target.currentDef}, HP max ${beforeMaxHp} → ${target.maxHp}; HP correnti restano ${target.currentHp} (${adjacentStructures} strutture, ${adjacentInfantry} fanterie adiacenti).`, EventTypes.STATUS_APPLIED, {
    targetId: target.uid,
    targetName: target.name,
    adjacentStructures,
    adjacentInfantry,
    defGain,
    hpMaxGain,
    beforeDef,
    afterDef: target.currentDef,
    beforeMaxHp,
    afterMaxHp: target.maxHp,
    beforeCurrentHp,
    afterCurrentHp: target.currentHp,
    source
  });
  return { defGain, hpMaxGain, adjacentStructures, adjacentInfantry };
}

function resolveHandTacticRecoveredBuffStructureEffect(player, card, target) {
  const c = normalizeHandTacticCard(card);
  if (!c) return null;
  const effectKind = c.effectKind;
  if (effectKind === "next_attack_ignore_defense") {
    applyStatus(target, { kind:"next_attack_ignore_defense", turns:1, source:c.name, owner:player });
    return { damage:0, extra:"prossimo attacco ignora DEF" };
  }
  if (effectKind === "grant_stun_on_basic_attack") {
    applyStatus(target, { kind:"stun_on_basic_attack", turns:999, source:c.name, owner:player });
    return { damage:0, extra:"stordimento su attacco base" };
  }
  if (effectKind === "ignore_defense_permanent") {
    applyStatus(target, { kind:"ignore_defense_permanent", turns:999, source:c.name, owner:player });
    return { damage:0, extra:"attacchi ignorano DEF" };
  }
  if (effectKind === "set_structure_def_to_current_hp") {
    const r = applyStructureDefToCurrentHp(target, c.name);
    return { damage:0, extra:`DEF ricostruita +${r.defGain}` };
  }
  if (effectKind === "green_fortress_structure_growth") {
    const r = applyGreenFortressGrowth(player, target, c.name);
    return { damage:0, extra:`+${r.defGain} DEF, +${r.hpMaxGain} HP max` };
  }
  return null;
}


function c2c5bIsCellMovementBoost(card) {
  const c = normalizeHandTacticCard(card);
  return Boolean(c && c.effectKind === "cell_movement_boost");
}

function resolveHandTacticCellMovementBoostEffect(player, card, target) {
  const c = normalizeHandTacticCard(card);
  if (!c || !target || !target.pos || !c2c5bIsCellMovementBoost(c)) return null;
  if (!isCellValidForTerrainTactic(target.pos, c.effectKind)) {
    log(`${c.name}: cella non valida per Passaggio tattico.`);
    return { damage:0, extra:"cella non valida" };
  }
  addCellEffect({
    kind:"cell_movement_boost",
    owner: player,
    coord: [...target.pos],
    source: c.name,
    turns: 1,
    value: 1,
    tacticId: c.tacticId || c.sourceId,
    faction: c.faction || state.factions[player]
  });
  return { damage:0, extra:"Passaggio tattico" };
}

function resolveHandTacticActiveMovementEffect(player, card, target) {
  const c = normalizeHandTacticCard(card);
  if (!c || !target) return null;
  if (c.effectKind === "move_after_attack") {
    target.acted = false;
    target.movedThisTurn = false;
    target.c2c5bMoveOnlyExhaustAfterMove = true;
    applyStatus(target, { kind:"move_only", turns:1, owner:player, source:c.name });
    log(`${target.name} riceve Manovra d’attacco: può effettuare un movimento, poi sarà considerata agita.`);
    return { damage:0, extra:"movimento dopo attacco" };
  }
  if (c.effectKind === "group_double_move_exhaust") {
    const group = c2c5bHordeGroup(player, target);
    if (group.length < 2) {
      log(`${c.name}: servono almeno 2 unità alleate pronte e connesse.`);
      return { damage:0, extra:"gruppo non valido" };
    }
    for (const unit of group) {
      unit.acted = false;
      unit.movedThisTurn = false;
      unit.c2c5bDoubleMove = true;
      unit.c2c5bMoveOnlyExhaustAfterMove = true;
      applyStatus(unit, { kind:"move_only", turns:1, owner:player, source:c.name });
    }
    log(`${c.name}: ${group.map(u => u.name).join(", ")} ottengono MOV raddoppiato e possono solo muovere.`);
    return { damage:0, extra:`MOV x2 su ${group.length} unità` };
  }
  return null;
}

function resolveHandTacticCellTerrainEffect(player, card, target) {
  const c = normalizeHandTacticCard(card);
  if (!c || !target || !target.pos || !c2c5IsCellTerrainEffect(c)) return null;
  if (!isCellValidForTerrainTactic(target.pos, c.effectKind)) {
    log(`${c.name}: cella non valida per l'effetto terreno.`);
    return { damage:0, extra:"cella non valida" };
  }
  const turns = c2c5CellEffectTurns(c.effectKind);
  addCellEffect({
    kind: c.effectKind,
    owner: player,
    coord: [...target.pos],
    source: c.name,
    turns,
    tacticId: c.tacticId || c.sourceId,
    faction: c.faction || state.factions[player]
  });
  return { damage:0, extra:`effetto cella ${turns} turno${turns === 1 ? "" : "i"}` };
}

function resolveHandTacticAoeEffect(player, card, target) {
  const coords = c2c4AoeCoordsFor(card, target);
  const units = [];
  const seen = new Set();
  for (const coord of coords) {
    const unit = getUnitAt(coord);
    if (!unit || unit.type === "QG") continue;
    if (unit.side !== player && typeof isUntargetableTo === "function" && isUntargetableTo(unit, player)) continue;
    if (seen.has(unit.uid)) continue;
    seen.add(unit.uid);
    units.push(unit);
  }

  const damage = 1;
  if (!units.length) {
    log(`${card.name}: nessuna unità colpita nell'area selezionata (${coords.map(c => `[${c.join(",")}]`).join(", ")}).`, EventTypes.LOG_MESSAGE, {
      player,
      faction: state.factions[player],
      tacticId: card.tacticId || card.sourceId,
      cardUid: card.cardUid,
      center: target && target.pos ? [...target.pos] : null,
      affectedCells: coords.map(c => [...c]),
      source: "C2c-4-aoe"
    });
    return { damage, extra:"AoE senza bersagli", hits:0, affectedCells:coords.length };
  }

  log(`${card.name}: area [${coords.map(c => c.join(",")).join("] [")}] · ${units.length} unità colpite.`, EventTypes.TACTIC_USED, {
    player,
    faction: state.factions[player],
    tacticId: card.tacticId || card.sourceId,
    cardUid: card.cardUid,
    center: target && target.pos ? [...target.pos] : null,
    affectedCells: coords.map(c => [...c]),
    hitUnitIds: units.map(u => u.uid),
    source: "C2c-4-aoe"
  });

  for (const unit of units) {
    applyDamage(unit, damage, card.name, { tactic:true, sourceCardUid: card.cardUid, aoe:true });
  }
  return { damage, extra:`AoE ${units.length} unità`, hits:units.length, affectedCells:coords.length };
}

function c2c5cSpawnUnitFromTactic(player, bp, coord, source, options={}) {
  if (!bp || !coord) return null;
  if (purchaseLimitReached(player, bp)) {
    log(`${source}: cap pieno per ${bp.name}.`);
    return null;
  }
  if (!isCellEnterable(coord) || getUnitAt(coord)) {
    log(`${source}: cella [${coord.join(",")}] non libera o invalicabile.`);
    return null;
  }
  const unit = createUnitFromBlueprint(bp, player);
  unit.pos = [...coord];
  if (options.tempVanguard) {
    unit.vanguard = true;
    unit.c2c5cTemporaryVanguard = true;
  }
  unit.acted = options.ready ? false : true;
  if (typeof applyAgathoiSpawnDefBonus === "function") applyAgathoiSpawnDefBonus(unit);
  if (typeof applyC1fSpawnAdjacencyBonuses === "function") applyC1fSpawnAdjacencyBonuses(unit);
  state.units.push(unit);
  if (typeof triggerMinesAt === "function") triggerMinesAt(unit.pos, unit);
  if (typeof triggerCellEffectsAt === "function") triggerCellEffectsAt(unit.pos, unit);
  log(`${source}: ${unit.name} #${unit.instanceNo} entra in [${unit.pos.join(",")}].${unit.acted ? " Entra esausto." : " Avanguardia: può agire subito."}`, EventTypes.UNIT_SPAWNED, {
    player,
    faction: state.factions[player],
    unitId: unit.uid,
    unitName: unit.name,
    blueprintId: bp.id,
    coord: [...unit.pos],
    source: "C2c-5c-tactic-spawn",
    exhausted: unit.acted
  });
  return unit;
}

function c2c6aCardTypeName(card) {
  if (!card) return "carta";
  if (card.sourceType === "tactic") return "tattica";
  if (card.sourceType === "unit") return String(card.unitType || card.cardType || "unità").toLowerCase();
  return String(card.cardType || "carta").toLowerCase();
}

function c2c6aDrawnCardAvailable(card) {
  return Boolean(card && !card.overdrawDiscarded && card.zone === "hand");
}

function c2c6aIsDrawnInfantry(card) {
  return Boolean(c2c6aDrawnCardAvailable(card) && card.sourceType === "unit" && String(card.unitType || "") === "Fanteria");
}

function c2c6aIsDrawnVehicle(card) {
  return Boolean(c2c6aDrawnCardAvailable(card) && card.sourceType === "unit" && String(card.unitType || "") === "Veicolo");
}

function c2c6aApplyCardDiscount(card, value, source, minCost=0) {
  if (!c2c6aDrawnCardAvailable(card) || !Number.isFinite(value) || value === 0) return 0;
  const before = Number.isFinite(card.cost) ? card.cost : 0;
  const after = Math.max(minCost, before + value);
  card.basePrintedCost = Number.isFinite(card.basePrintedCost) ? card.basePrintedCost : before;
  card.cost = after;
  card.c2c6aMinCost = minCost;
  card.c2c6aCostAdjusted = true;
  card.c2c6aCostDelta = (card.c2c6aCostDelta || 0) + (after - before);
  card.c2c6aCostSource = source;
  return before - after;
}

function c2c6aApplyVehicleAttackBonusToCard(card, value, source) {
  if (!c2c6aDrawnCardAvailable(card) || !c2c6aIsDrawnVehicle(card) || !value) return 0;
  card.c2c6aSpawnAttBonus = (card.c2c6aSpawnAttBonus || 0) + value;
  card.c2c6aSpawnAttBonusSource = source;
  card.effectText = `${card.effectText || ""}${card.effectText ? " " : ""}[Bonus pescata: +${value} ATT permanente quando schierata.]`;
  return value;
}

function c2c6aDrawCardsForTactic(player, count, source) {
  if (!state || !state.deck || !state.deck[player]) return [];
  const before = state.deck[player].length;
  const drawn = typeof drawCards === "function" ? drawCards(player, count) : [];
  if (!drawn.length) {
    log(`${source}: nessuna carta pescata${before <= 0 ? " · deck vuoto" : ""}.`, EventTypes.LOG_MESSAGE, {
      player, faction: state.factions[player], requested:count, deckBefore:before, source:"C2c-6a-draw"
    });
    return [];
  }
  log(`${source}: ${playerName(player)} pesca ${drawn.length} carta${drawn.length > 1 ? "e" : ""}: ${drawn.map(c => `${c.name} (${c2c6aCardTypeName(c)})`).join(", ")}.`, EventTypes.LOG_MESSAGE, {
    player, faction: state.factions[player], requested:count, drawn:drawn.length, cards: drawn.map(c => ({ cardUid:c.cardUid, id:c.id, name:c.name, sourceType:c.sourceType, cardType:c.cardType, unitType:c.unitType, cost:c.cost })), source:"C2c-6a-draw"
  });
  return drawn;
}

function c2c6aActiveAlliedStructures(player) {
  return combatUnits(player).filter(u => u && u.alive && u.type === "Struttura");
}

function resolveHandTacticDrawCardEconomyEffect(player, card) {
  const c = normalizeHandTacticCard(card);
  if (!c || !c2c6aPlayableEffectKinds().has(c.effectKind)) return null;

  if (c.effectKind === "draw_conditional_discount") {
    const drawn = c2c6aDrawCardsForTactic(player, 1, c.name);
    if (c2c6aDrawnCardAvailable(drawn[0]) && drawn[0].sourceType === "tactic") {
      const bonus = c2c6aDrawCardsForTactic(player, 1, `${c.name} · bonus tattica`);
      drawn.push(...bonus);
    }
    let discounts = 0;
    for (const d of drawn) discounts += c2c6aApplyCardDiscount(d, -1, c.name, 1);
    if (discounts > 0) log(`${c.name}: ${drawn.length} carta${drawn.length === 1 ? "" : "e"} pescata${drawn.length === 1 ? "" : "e"} riceve costo -1 ENE permanente sull'istanza, minimo 1.`);
    return { damage:0, extra:`pescate ${drawn.length}, sconto totale ${discounts}` };
  }

  if (c.effectKind === "draw_two_buff_drawn_vehicles") {
    const drawn = c2c6aDrawCardsForTactic(player, 2, c.name);
    let buffed = 0;
    for (const d of drawn) buffed += c2c6aApplyVehicleAttackBonusToCard(d, 1, c.name);
    if (buffed > 0) log(`${c.name}: ${buffed} veicolo/i pescato/i riceve/ricevono +1 ATT permanente quando schierato/i.`);
    return { damage:0, extra:`pescate ${drawn.length}, veicoli buffati ${buffed}` };
  }

  if (c.effectKind === "draw_if_infantry") {
    const drawn = c2c6aDrawCardsForTactic(player, 1, c.name);
    if (c2c6aIsDrawnInfantry(drawn[0])) {
      drawn.push(...c2c6aDrawCardsForTactic(player, 1, `${c.name} · bonus fanteria`));
    }
    return { damage:0, extra:`pescate ${drawn.length}` };
  }

  if (c.effectKind === "draw_by_structures") {
    const structures = c2c6aActiveAlliedStructures(player).length;
    const count = Math.min(4, structures);
    if (count <= 0) {
      log(`${c.name}: nessuna struttura alleata viva, nessuna carta pescata.`);
      return { damage:0, extra:"nessuna struttura" };
    }
    const drawn = c2c6aDrawCardsForTactic(player, count, c.name);
    return { damage:0, extra:`pescate ${drawn.length}/${count}` };
  }

  return null;
}

function c2c6bDiscardRandomEnemyCard(player, sourceName) {
  const enemy = enemyOf(player);
  const hand = state && state.hand ? (state.hand[enemy] || []) : [];
  if (!hand.length) {
    log(`${sourceName}: ${playerName(enemy)} non ha carte da scartare.`);
    return null;
  }
  const index = Math.floor(Math.random() * hand.length);
  const card = hand[index];
  const discarded = typeof discardCard === "function" ? discardCard(enemy, card.cardUid) : null;
  if (discarded) {
    log(`${sourceName}: ${playerName(enemy)} scarta casualmente ${discarded.name}.`, EventTypes.LOG_MESSAGE, {
      player: enemy,
      faction: state.factions && state.factions[enemy],
      cardUid: discarded.cardUid,
      cardName: discarded.name,
      source: "C2c-6b-usury-discard"
    });
  }
  return discarded;
}

function resolveHandTacticEnergyEconomyEffect(player, card, target) {
  const c = normalizeHandTacticCard(card);
  if (!c || !c2c6bPlayableEffectKinds().has(c.effectKind)) return null;

  if (c.effectKind === "energy_gain_by_ps") {
    const ps = countControlledPS(player);
    const commanderBonus = activeCommanderCount(player) > 0 ? 1 : 0;
    const gain = Math.max(0, ps + commanderBonus);
    state.energy[player] += gain;
    log(`${c.name}: ${playerName(player)} guadagna +${gain} ENE (${ps} PS${commanderBonus ? ", +1 comandante" : ""}). Totale: ${state.energy[player]}.`, EventTypes.ECONOMY_CHANGED, {
      player, faction: state.factions[player], gain, ps, commanderBonus, source:"C2c-6b-energy-by-ps"
    });
    return { damage:0, extra:`+${gain} ENE` };
  }

  if (c.effectKind === "energy_gain_by_kills_this_turn") {
    const destroyed = typeof c2c6bEnemyDestroyedThisTurn === "function" ? c2c6bEnemyDestroyedThisTurn(player) : 0;
    const gain = Math.min(3, Math.max(0, destroyed));
    state.energy[player] += gain;
    log(`${c.name}: ${playerName(player)} guadagna +${gain} ENE per ${destroyed} unità nemiche distrutte questo turno (max 3). Totale: ${state.energy[player]}.`, EventTypes.ECONOMY_CHANGED, {
      player, faction: state.factions[player], gain, destroyed, source:"C2c-6b-energy-by-kills"
    });
    return { damage:0, extra:`+${gain} ENE` };
  }

  if (c.effectKind === "structure_income_seed") {
    if (!target || !handTacticIsStructure(target)) return { damage:0, extra:"bersaglio non valido" };
    if (typeof hasStatus === "function" && hasStatus(target, "agathoi_income_seed")) {
      log(`${c.name}: ${target.name} ha già Seme della Ricchezza.`);
      return { damage:0, extra:"già seminata" };
    }
    applyStatus(target, { kind:"agathoi_income_seed", value:1, turns:999, owner:player, source:c.name });
    return { damage:0, extra:"+1 income su struttura" };
  }

  if (c.effectKind === "enemy_kill_gives_fabeot_energy") {
    if (!target) return { damage:0, extra:"bersaglio assente" };
    applyStatus(target, { kind:"fabeot_sicario_contract", value:1, turns:999, owner:player, source:c.name });
    return { damage:0, extra:"tassa kill +1 ENE" };
  }

  if (c.effectKind === "usury_energy_income_debuff") {
    const enemy = enemyOf(player);
    const before = state.energy[enemy] || 0;
    state.energy[enemy] = Math.max(0, before - 1);
    addPlayerEffect(enemy, { kind:"income_delta", value:-1, minIncome:0, turns:2, timing:"afterIncome", source:c.name });
    const discarded = before === 0 ? c2c6bDiscardRandomEnemyCard(player, c.name) : null;
    log(`${c.name}: ${playerName(enemy)} perde ${before > 0 ? 1 : 0} ENE depot e subisce -1 income per 2 turni${discarded ? ", più 1 scarto casuale" : ""}.`, EventTypes.ECONOMY_CHANGED, {
      player: enemy, faction: state.factions[enemy], caster: player, energyBefore: before, energyAfter: state.energy[enemy], incomeDelta:-1, turns:2, discarded: discarded ? discarded.name : null, source:"C2c-6b-usury"
    });
    return { damage:0, extra:`usura su ${playerName(enemy)}` };
  }

  return null;
}


function resolveHandTacticLibertiSpawnEffect(player, card, target) {
  const c = normalizeHandTacticCard(card);
  if (!c || !target) return null;
  const militia = c2c5cMilitiaBlueprint();
  const predone = c2c5cPredoneBlueprint();

  if (c.effectKind === "spawn_two_militia") {
    const coords = c2c5cAdjacentSpawnCellPair(player, target.pos);
    if (!militia || coords.length < 2) {
      log(`${c.name}: servono due celle sbarcabili libere e adiacenti.`);
      return { damage:0, extra:"spawn non valido" };
    }
    let spawned = 0;
    for (const coord of coords) if (c2c5cSpawnUnitFromTactic(player, militia, coord, c.name, { ready:false })) spawned += 1;
    return { damage:0, extra:`${spawned} Miliziani schierati` };
  }

  if (c.effectKind === "spawn_predone_with_temp_vanguard") {
    const unit = c2c5cSpawnUnitFromTactic(player, predone, target.pos, c.name, { ready:true, tempVanguard:true });
    return { damage:0, extra: unit ? "Predone con Avanguardia" : "spawn non valido" };
  }

  if (c.effectKind === "spawn_clan_reinforcements") {
    const coords = c2c5cClanSpawnCoords(player, target.pos);
    if (!predone || !militia || !coords.length) {
      log(`${c.name}: nessun bordo alleato valido per i rinforzi.`);
      return { damage:0, extra:"spawn non valido" };
    }
    let spawned = 0;
    if (coords[0] && c2c5cSpawnUnitFromTactic(player, predone, coords[0], c.name, { ready:false })) spawned += 1;
    for (const coord of coords.slice(1, 3)) if (c2c5cSpawnUnitFromTactic(player, militia, coord, c.name, { ready:false })) spawned += 1;
    return { damage:0, extra:`${spawned} rinforzi dei clan` };
  }

  if (c.effectKind === "spawn_militia_around_commander") {
    const coords = c2c5cCommanderMilitiaCoords(player, target);
    if (!militia || !coords.length) {
      log(`${c.name}: nessuna cella libera adiacente al comandante.`);
      return { damage:0, extra:"spawn non valido" };
    }
    let spawned = 0;
    for (const coord of coords) {
      if (purchaseLimitReached(player, militia)) break;
      if (c2c5cSpawnUnitFromTactic(player, militia, coord, c.name, { ready:false })) spawned += 1;
    }
    return { damage:0, extra:`${spawned} Miliziani attorno al comandante` };
  }

  return null;
}


// =====================================================
// C2c-7a – Fabeot advanced hand / theft foundation
// =====================================================
function c2c7aIsCleanBounceTarget(unit) {
  return Boolean(unit && unit.alive && (handTacticIsInfantry(unit) || handTacticIsVehicle(unit)) && !handTacticIsCommanderOrPivot(unit) && unit.type !== "QG");
}

function c2c7aBounceUnitToOwnerHand(player, card, target) {
  const c = normalizeHandTacticCard(card);
  if (!c || !c2c7aIsCleanBounceTarget(target)) {
    log(`${c ? c.name : "Congedo Forzato"}: bersaglio non valido per il congedo.`);
    return { damage:0, extra:"bersaglio non valido" };
  }
  const owner = target.side;
  const blueprintId = target.id;
  const faction = target.faction;
  const created = typeof addBlueprintCardToHand === "function" ? addBlueprintCardToHand(owner, blueprintId, faction, c.name) : null;
  if (!created) {
    log(`${c.name}: impossibile ricostruire la carta base di ${target.name}; il congedo viene annullato.`);
    return { damage:0, extra:"carta base non trovata" };
  }
  const oldName = target.name;
  const oldUid = target.uid;
  target.alive = false;
  target.acted = true;
  target.pos = null;
  target.statuses = [];
  target.buffs = [];
  if (typeof updateControlFromOccupants === "function") updateControlFromOccupants();
  log(`${c.name}: ${oldName} rientra nella mano di ${playerName(owner)} come carta base pulita.`, EventTypes.LOG_MESSAGE, {
    player, owner, unitId: oldUid, unitName: oldName, createdCardUid: created ? created.cardUid : null, source:"C2c-7a-bounce-clean"
  });
  return { damage:0, extra:"unità rientrata in mano" };
}

function c2c7aApplyBountyCopy(player, card, target) {
  const c = normalizeHandTacticCard(card);
  if (!c || !target || target.side === player || handTacticIsStructure(target) || handTacticIsCommanderOrPivot(target)) {
    log(`${c ? c.name : "Taglia sulla Testa"}: bersaglio non valido.`);
    return { damage:0, extra:"bersaglio non valido" };
  }
  applyStatus(target, { kind:"fabeot_copy_bounty", turns:1, owner:player, source:c.name });
  log(`${c.name}: ${target.name} viene messo sotto taglia. Se muore entro questo turno, ${playerName(player)} ne aggiunge una copia base in mano.`, EventTypes.STATUS_APPLIED, {
    player, targetId: target.uid, targetName: target.name, source:"C2c-7a-bounty-copy"
  });
  return { damage:0, extra:"taglia copia attiva" };
}

function c2c7aDrawOne(player, source) {
  const drawn = typeof drawCards === "function" ? drawCards(player, 1) : [];
  const card = drawn && drawn[0] ? drawn[0] : null;
  if (card) log(`${source}: ${playerName(player)} pesca ${card.name}.`, EventTypes.LOG_MESSAGE, { player, cardUid:card.cardUid, cardName:card.name, source:"C2c-7a-draw-one" });
  else log(`${source}: ${playerName(player)} non pesca, deck vuoto.`);
  return card;
}

function c2c7aIsTacticCard(card) {
  return Boolean(card && !card.overdrawDiscarded && card.zone === "hand" && (card.sourceType === "tactic" || card.cardType === "tactic" || card.deckRole === "tactic"));
}

function c2c7aResolveMutualDrawSteal(player, card) {
  const c = normalizeHandTacticCard(card);
  const enemy = enemyOf(player);
  const ownDraw = c2c7aDrawOne(player, c.name);
  const enemyDraw = c2c7aDrawOne(enemy, c.name);
  let stolen = null;
  if (ownDraw && enemyDraw && c2c7aIsTacticCard(ownDraw) && typeof moveHandCardBetweenPlayers === "function") {
    stolen = moveHandCardBetweenPlayers(enemy, player, enemyDraw.cardUid, c.name);
  }
  log(`${c.name}: ${playerName(player)} pesca ${ownDraw ? ownDraw.name : "niente"}; ${playerName(enemy)} pesca ${enemyDraw ? enemyDraw.name : "niente"}${stolen ? `; Fabeot ruba ${stolen.name}` : "; nessun furto"}.`, EventTypes.LOG_MESSAGE, {
    player, enemy, ownDraw: ownDraw ? ownDraw.name : null, enemyDraw: enemyDraw ? enemyDraw.name : null, stolen: stolen ? stolen.name : null, source:"C2c-7a-mutual-draw-steal"
  });
  return { damage:0, extra: stolen ? `rubata ${stolen.name}` : "pesca reciproca" };
}

function c2c7aBlockRandomEnemyHandCards(player, card) {
  const c = normalizeHandTacticCard(card);
  const enemy = enemyOf(player);
  const ps = Math.max(0, countControlledPS(player));
  const pool = (state.hand && state.hand[enemy] ? state.hand[enemy] : []).filter(x => !(typeof handCardBlocked === "function" && handCardBlocked(x)));
  const count = Math.min(ps, pool.length);
  const blocked = [];
  for (let i = 0; i < count; i += 1) {
    const idx = Math.floor(Math.random() * pool.length);
    const [selected] = pool.splice(idx, 1);
    if (!selected) continue;
    selected.c2c7aBlockedTurns = Math.max(selected.c2c7aBlockedTurns || 0, 1);
    selected.c2c7aBlockedBy = player;
    selected.c2c7aBlockedSource = c.name;
    blocked.push(selected);
  }
  if (typeof syncCardDebugState === "function") syncCardDebugState();
  log(`${c.name}: ${playerName(player)} controlla ${ps} PS e blocca ${blocked.length} carta${blocked.length !== 1 ? "e" : ""} nella mano di ${playerName(enemy)}: ${blocked.map(x => x.name).join(", ") || "nessuna"}.`, EventTypes.LOG_MESSAGE, {
    player, enemy, ps, blocked: blocked.map(x => ({ cardUid:x.cardUid, name:x.name })), source:"C2c-7a-embargo"
  });
  return { damage:0, extra:`${blocked.length} carte bloccate` };
}

function c2c7aCleanupEndTurnEffects(player) {
  if (!state || !Array.isArray(state.units)) return;
  let removed = 0;
  for (const unit of state.units) {
    if (!unit || !Array.isArray(unit.statuses)) continue;
    const before = unit.statuses.length;
    unit.statuses = unit.statuses.filter(st => !(st && st.kind === "fabeot_copy_bounty" && st.owner === player));
    removed += before - unit.statuses.length;
  }
  if (removed > 0) log(`Taglia sulla Testa: ${removed} taglia${removed > 1 ? "e" : ""} non riscossa scade a fine turno.`, EventTypes.LOG_MESSAGE, { player, removed, source:"C2c-7a-cleanup-bounty" });
}



// =====================================================
// C2c-7b – Fabeot conversion / corruption pass
// =====================================================
function c2c7bEnemyAdjacencyCountForTarget(target) {
  if (!target || !Array.isArray(target.pos)) return 0;
  return combatUnits(target.side).filter(u => u.uid !== target.uid && u.alive && u.type !== "QG" && areAdjacent(u.pos, target.pos)).length;
}

function c2c7bIsIsolatedEnemyInfantry(player, target) {
  return Boolean(target && target.alive && target.side !== player && handTacticIsInfantry(target) && !handTacticIsCommanderOrPivot(target) && target.type !== "QG" && c2c7bEnemyAdjacencyCountForTarget(target) <= 0);
}

function c2c7bConversionCapAllows(player, target) {
  if (!target || !target.alive) return false;
  if (target.type !== "Fanteria" || handTacticIsCommanderOrPivot(target) || target.type === "QG") return false;
  if (countsAsLightCap(target)) return lightBucketCount(player, target) < lightFieldLimit(player, target.type);
  if (String(target.weight || "").toLowerCase().startsWith("pesant")) {
    const sameClass = combatUnits(player).filter(u => u.type === target.type && String(u.weight || "").toLowerCase().startsWith("pesant")).length;
    return sameClass < HEAVY_FIELD_LIMIT;
  }
  if (target.weight === "Elite") return combatUnits(player).filter(u => u.weight === "Elite").length < ELITE_FIELD_LIMIT;
  return true;
}

function c2c7bCanConvertByDoctrine(player, target, logReason=false) {
  if (!target || !target.alive) {
    if (logReason) log("Dottrina del Tradimento: bersaglio assente o non vivo.");
    return false;
  }
  if (target.side === player) {
    if (logReason) log(`Dottrina del Tradimento: ${target.name} è già alleata.`);
    return false;
  }
  if (!handTacticIsInfantry(target)) {
    if (logReason) log(`Dottrina del Tradimento: ${target.name} non è fanteria.`);
    return false;
  }
  if (handTacticIsCommanderOrPivot(target) || target.type === "QG") {
    if (logReason) log(`Dottrina del Tradimento: ${target.name} è comandante, pivot o QG.`);
    return false;
  }
  const adjacent = c2c7bEnemyAdjacencyCountForTarget(target);
  if (adjacent > 0) {
    if (logReason) log(`Dottrina del Tradimento: ${target.name} non è isolata (${adjacent} alleat${adjacent === 1 ? "o" : "i"} adiacenti).`);
    return false;
  }
  if (!c2c7bConversionCapAllows(player, target)) {
    if (logReason) log(`Dottrina del Tradimento: cap Fabeot non disponibile per ${target.name}.`);
    return false;
  }
  return true;
}

function c2c7bConvertByDoctrine(player, card, target) {
  const c = normalizeHandTacticCard(card);
  if (!c || !c2c7bCanConvertByDoctrine(player, target, true)) return { damage:0, extra:"conversione non valida" };
  const fakeUser = { side:player, faction:state.factions[player] || "Fabeot", name:playerName(player) };
  const oldSide = target.side;
  const oldFaction = target.faction;
  if (typeof performFabeotConversion === "function") {
    performFabeotConversion(fakeUser, target, { name:c.name }, "tradito");
  } else {
    target.side = player;
    target.faction = "Fabeot";
    target.acted = true;
    target.movedThisTurn = true;
    target.abilityUsedThisTurn = true;
    target.attacksMade = target.attacksPerTurn || 1;
    target.statuses = (target.statuses || []).filter(st => !["fabeot_bounty", "fabeot_vulnerable", "logistic_choke", "raid_mark", "fabeot_copy_bounty"].includes(st.kind));
    if (typeof applyStatus === "function") applyStatus(target, { kind:"inhibit_action", turns:1, source:c.name, owner:player });
    if (typeof updateControlFromOccupants === "function") updateControlFromOccupants();
    log(`${target.name} (${oldFaction} G${oldSide}) viene tradito da ${playerName(player)} e passa sotto controllo Fabeot. Entra esausto.`);
  }
  if (typeof updateControlFromOccupants === "function") updateControlFromOccupants();
  log(`${c.name}: ${target.name} passa da ${playerName(oldSide)} a ${playerName(player)}. Conversione permanente, unità inattiva.`, EventTypes.STATUS_APPLIED, {
    player,
    oldSide,
    oldFaction,
    unitId: target.uid,
    unitName: target.name,
    source: "C2c-7b-dottrina-tradimento"
  });
  return { damage:0, extra:"unità convertita" };
}

// =====================================================
// C2c-8 – Reactions / opportunity attacks foundation
// =====================================================

function c2c8CanReactionAttack(attacker, defender) {
  return Boolean(
    attacker && defender && attacker.alive && defender.alive
    && Array.isArray(attacker.pos) && Array.isArray(defender.pos)
    && attacker.side !== defender.side
    && attacker.type !== "Struttura" && attacker.type !== "QG"
    && effectiveAtt(attacker) > 0
    && areAdjacent(attacker.pos, defender.pos)
    && !statusBlocks(attacker, "attack")
    && !isUntargetableTo(defender, attacker.side)
  );
}

function c2c8ReactionAttack(attacker, defender, source="Reazione", options={}) {
  if (!c2c8CanReactionAttack(attacker, defender)) return false;
  const originalDefender = defender;
  const interceptor = typeof findFrontLineInterceptor === "function" ? findFrontLineInterceptor(attacker, defender) : null;
  if (interceptor) {
    defender = interceptor;
    log(`${defender.name} intercetta l'attacco di reazione diretto contro ${originalDefender.name} con Prima Linea.`);
  }
  if (!c2c8CanReactionAttack(attacker, defender)) return false;
  if (typeof revealStealth === "function") revealStealth(attacker, source);
  const lastRunStatus = typeof c2c8cLastRunStatus === "function" ? c2c8cLastRunStatus(attacker) : null;
  const lastRunBonus = lastRunStatus ? (lastRunStatus.value || 1) : 0;
  const rawAmount = effectiveAtt(attacker) + numericalSuperiorityBonus(attacker, defender) + attackContextBonus(attacker, defender) + lastRunBonus;
  const doubleStatus = typeof getStatus === "function" ? getStatus(attacker, "double_attack_next_attack") : null;
  const multiplier = doubleStatus ? Math.max(2, doubleStatus.value || 2) : 1;
  const amount = rawAmount * multiplier;
  const ignoreDefense = attackerHasIgnoreDefenseOnBasicAttack(attacker);
  log(`${source}: ${attacker.name} effettua un attacco di reazione contro ${defender.name} con ATT ${amount}${lastRunBonus ? ` (+${lastRunBonus} Ultima Corsa)` : ""}${multiplier > 1 ? ` (x${multiplier} Ordine di Varran)` : ""}.`, EventTypes.UNIT_ATTACKED, {
    attackerId: attacker.uid,
    attackerName: attacker.name,
    attackerSide: attacker.side,
    defenderId: defender.uid,
    defenderName: defender.name,
    defenderSide: defender.side,
    amount,
    rawAmount,
    multiplier,
    source: "C2c-8-reaction-attack"
  });
  const thorns = effectiveThorns(defender);
  if (lastRunStatus && Array.isArray(defender.pos)) defender._c2c8cLastRunPos = [...defender.pos];
  const defenderWasAlive = defender.alive;
  applyDamage(defender, amount, source, { amplifiable:true, attacker, baseAttack:true, directHp:ignoreDefense, reaction:true, skipC2c8Reactions:true });
  const defenderDiedFromAttack = defenderWasAlive && !defender.alive;
  resolvePostBasicAttackTacticStatuses(attacker, defender);
  if (doubleStatus) removeStatusKind(attacker, "double_attack_next_attack", "attacco base consumato");
  if (defenderDiedFromAttack && typeof c2c8cMaybeGrowSanguisHunter === "function") c2c8cMaybeGrowSanguisHunter(attacker, defender, defenderDiedFromAttack);
  const bleedTwo = typeof getStatus === "function" ? getStatus(attacker, "next_attack_bleed_two") : null;
  let specialBleedApplied = false;
  if (bleedTwo) {
    if (defender.alive && typeof canBleed === "function" && canBleed(defender)) {
      applyBleed(defender, bleedTwo.value || 2, 2, bleedTwo.source || "Marchio dei Sanguis");
      specialBleedApplied = true;
    }
    removeStatusKind(attacker, "next_attack_bleed_two", "attacco base consumato");
  }
  if (attacker.faction === "Liberti" && typeof hasBleedingAttackRule === "function" && hasBleedingAttackRule(attacker) && defender.alive && typeof canBleed === "function" && canBleed(defender) && !specialBleedApplied) applyBleed(defender, 1 + (attacker.c2c8cSanguisBleedBonus || 0), 2, attacker.name);
  if (lastRunStatus && typeof c2c8cResolveLastRunAfterAttack === "function") c2c8cResolveLastRunAfterAttack(attacker, defender, lastRunStatus);
  if (thorns && attacker.alive && attacker.type !== "QG") {
    const thornDamage = Math.max(1, thorns.value || 1);
    log(`${attacker.name} viene ferito dalle Spine di ${defender.name}.`);
    applyDamage(attacker, thornDamage, "Spine", { directHp:true, reaction:true, skipC2c8Reactions:true });
  }
  return true;
}

function c2c8AdjacentOpportunityAttackers(player, target) {
  if (!target || !target.alive || !Array.isArray(target.pos)) return [];
  return combatUnits(player)
    .filter(u => u && u.type === "Fanteria" && c2c8CanReactionAttack(u, target))
    .sort((a,b) => String(a.uid).localeCompare(String(b.uid)));
}

function c2c8ResolveReactionTactic(player, card, target) {
  const c = normalizeHandTacticCard(card);
  if (!c || !c2c8PlayableEffectKinds().has(c.effectKind)) return null;

  if (c.effectKind === "extra_attack_on_kill") {
    applyStatus(target, { kind:"extra_attack_on_kill", value:1, turns:1, owner:player, source:c.name });
    return { damage:0, extra:"attacco extra su kill" };
  }

  if (c.effectKind === "grant_ambush") {
    applyStatus(target, { kind:"ambush", value:1, turns:1, owner:player, source:c.name });
    return { damage:0, extra:"Agguato" };
  }

  if (c.effectKind === "grant_counterattack") {
    applyStatus(target, { kind:"counterattack", value:1, turns:1, owner:player, source:c.name });
    return { damage:0, extra:"Contrattacco" };
  }

  if (c.effectKind === "coordinated_opportunity_attacks") {
    const attackers = c2c8AdjacentOpportunityAttackers(player, target);
    if (!attackers.length) {
      log(`${c.name}: nessuna fanteria alleata adiacente valida per attaccare ${target ? target.name : "il bersaglio"}.`);
      return { damage:0, extra:"nessun attaccante valido" };
    }
    let hits = 0;
    for (const attacker of attackers) {
      if (!target || !target.alive) break;
      if (c2c8ReactionAttack(attacker, target, c.name, { coordinated:true })) hits += 1;
    }
    log(`${c.name}: ${hits}/${attackers.length} fanterie alleate effettuano attacchi d'opportunità contro ${target.name}.`, EventTypes.TACTIC_USED, {
      player,
      faction: state.factions[player],
      tacticId: c.tacticId || c.sourceId,
      tacticName: c.name,
      targetId: target.uid,
      targetName: target.name,
      attackers: attackers.map(a => a.uid),
      hits,
      source:"C2c-8-coordinated-opportunity"
    });
    return { damage:0, extra:`${hits} attacchi opportunità` };
  }

  return null;
}

// =====================================================
// C2c-8b – Offensive buffs / next attack / simple scaling
// =====================================================

function c2c8bAdjacentUnitsForChampion(target) {
  if (!target || !Array.isArray(target.pos)) return [];
  return combatUnits(null)
    .filter(u => u && u.uid !== target.uid && Array.isArray(u.pos) && areAdjacent(u.pos, target.pos))
    .sort((a, b) => String(a.uid).localeCompare(String(b.uid)));
}

function c2c8bResolveBuffHealTactic(player, card, target) {
  const c = normalizeHandTacticCard(card);
  if (!c || !c2c8bPlayableEffectKinds().has(c.effectKind)) return null;

  if (c.effectKind === "heal_to_max") {
    const before = target.currentHp;
    target.currentHp = Math.min(target.maxHp, target.maxHp);
    const healed = target.currentHp - before;
    log(`${c.name}: ${target.name} ripristina ${healed} HP fino al massimo.`, EventTypes.TACTIC_USED, {
      player,
      faction: state.factions[player],
      tacticId: c.tacticId || c.sourceId,
      tacticName: c.name,
      targetId: target.uid,
      targetName: target.name,
      healed,
      source: "C2c-8b-heal-to-max"
    });
    return { damage:0, extra:`+${healed} HP` };
  }

  if (c.effectKind === "double_attack_next_attack") {
    applyStatus(target, { kind:"double_attack_next_attack", value:2, turns:1, owner:player, source:c.name });
    return { damage:0, extra:"prossimo attacco ATT x2" };
  }

  if (c.effectKind === "next_attack_bleed_two") {
    applyStatus(target, { kind:"next_attack_bleed_two", value:2, turns:1, owner:player, source:c.name });
    return { damage:0, extra:"prossimo attacco Sanguinamento 2" };
  }

  if (c.effectKind === "arena_champion_permanent_attack") {
    const adjacent = c2c8bAdjacentUnitsForChampion(target);
    const bonus = Math.min(4, adjacent.length);
    if (bonus <= 0) {
      log(`${c.name}: ${target.name} non ha unità adiacenti, nessun bonus ATT applicato.`);
      return { damage:0, extra:"nessun bonus" };
    }
    target.baseAtt = (target.baseAtt || 0) + bonus;
    target.currentAtt = (target.currentAtt || 0) + bonus;
    target.c2c8bArenaChampionApplied = true;
    target.buffs = target.buffs || [];
    target.buffs.push({ stat:"att", value:bonus, turns:999, permanent:true, source:c.name, c2c8b:true });
    log(`${c.name}: ${target.name} diventa Campione della Fossa e ottiene +${bonus} ATT permanente (${adjacent.length} unità adiacenti, max 4).`, EventTypes.STATUS_APPLIED, {
      player,
      faction: state.factions[player],
      tacticId: c.tacticId || c.sourceId,
      tacticName: c.name,
      targetId: target.uid,
      targetName: target.name,
      adjacentCount: adjacent.length,
      bonus,
      source: "C2c-8b-arena-champion"
    });
    return { damage:0, extra:`+${bonus} ATT permanente` };
  }

  return null;
}

// =====================================================
// C2c-8c – Final advanced tactics: sacrifice / scaling / removal / ability tax
// =====================================================

function c2c8cResolveFinalAdvancedTactic(player, card, target) {
  const c = normalizeHandTacticCard(card);
  if (!c || !c2c8cPlayableEffectKinds().has(c.effectKind)) return null;

  if (c.effectKind === "last_run_sacrifice_aoe") {
    applyStatus(target, { kind:"last_run_sacrifice", value:1, aoeDamage:2, turns:1, owner:player, source:c.name });
    log(`${c.name}: ${target.name} prepara l'Ultima Corsa. Il prossimo attacco base avrà +1 danno, poi esplosione di sacrificio e autodistruzione.`, EventTypes.STATUS_APPLIED, {
      player,
      faction: state.factions[player],
      tacticId: c.tacticId || c.sourceId,
      tacticName: c.name,
      targetId: target.uid,
      targetName: target.name,
      source:"C2c-8c-last-run"
    });
    return { damage:0, extra:"Ultima Corsa" };
  }

  if (c.effectKind === "sanguis_hunter_scaling_bleed") {
    target.c2c8cSanguisHunter = true;
    target.c2c8cSanguisBleedBonus = target.c2c8cSanguisBleedBonus || 0;
    applyStatus(target, { kind:"sanguis_hunter", value:target.c2c8cSanguisBleedBonus, turns:999, owner:player, source:c.name });
    log(`${c.name}: ${target.name} diventa Cacciatore Sanguis. Ogni fanteria nemica terminata con attacco base aumenta di +1 il Sanguinamento futuro.`, EventTypes.STATUS_APPLIED, {
      player,
      faction: state.factions[player],
      tacticId: c.tacticId || c.sourceId,
      tacticName: c.name,
      targetId: target.uid,
      targetName: target.name,
      source:"C2c-8c-sanguis-hunter"
    });
    return { damage:0, extra:"Cacciatore Sanguis" };
  }

  if (c.effectKind === "destroy_non_unique_unit") {
    if (!target || !target.alive) return { damage:0, extra:"bersaglio assente" };
    if (typeof c2c6bRecordUnitDestroyed === "function") c2c6bRecordUnitDestroyed(target, null, c.name, { tactic:true, sourceCardUid:c.cardUid });
    if (typeof c1fBeforeUnitDestroyed === "function") c1fBeforeUnitDestroyed(target, null, c.name, { tactic:true, sourceCardUid:c.cardUid });
    target.alive = false;
    target.acted = true;
    log(`${c.name}: ${target.name} viene eliminato.`, EventTypes.UNIT_DESTROYED, {
      player,
      faction: state.factions[player],
      tacticId: c.tacticId || c.sourceId,
      tacticName: c.name,
      unitId: target.uid,
      unitName: target.name,
      side: target.side,
      source:"C2c-8c-obliterator"
    });
    handleUnitDestroyed(target);
    return { damage:0, extra:"bersaglio eliminato" };
  }

  if (c.effectKind === "enemy_ability_cost_tax") {
    const enemy = enemyOf(player);
    addPlayerEffect(enemy, { kind:"ability_cost_tax", value:1, turns:1, timing:"endTurn", source:c.name });
    log(`${c.name}: le abilità non gratuite di ${playerName(enemy)} costano +1 ENE fino alla fine del suo turno. Le abilità gratuite restano gratuite.`, EventTypes.ECONOMY_CHANGED, {
      player: enemy,
      faction: state.factions[enemy],
      value:1,
      source:"C2c-8c-campo-statico"
    });
    return { damage:0, extra:"abilità nemiche +1 ENE" };
  }

  return null;
}

function resolveHandTacticFabeotConversionEffect(player, card, target) {
  const c = normalizeHandTacticCard(card);
  if (!c || !c2c7bPlayableEffectKinds().has(c.effectKind)) return null;
  if (c.effectKind === "convert_isolated_enemy_infantry") return c2c7bConvertByDoctrine(player, c, target);
  return null;
}

function resolveHandTacticFabeotHandTheftEffect(player, card, target) {
  const c = normalizeHandTacticCard(card);
  if (!c || !c2c7aPlayableEffectKinds().has(c.effectKind)) return null;
  if (c.effectKind === "bounce_unit_to_owner_hand_clean") return c2c7aBounceUnitToOwnerHand(player, c, target);
  if (c.effectKind === "bounty_copy_on_death") return c2c7aApplyBountyCopy(player, c, target);
  if (c.effectKind === "mutual_draw_conditional_steal") return c2c7aResolveMutualDrawSteal(player, c);
  if (c.effectKind === "block_enemy_hand_cards_by_ps") return c2c7aBlockRandomEnemyHandCards(player, c);
  return null;
}

function resolveHandTacticEffect(player, card, target) {
  const c = normalizeHandTacticCard(card);
  const finalAdvanced = c2c8cResolveFinalAdvancedTactic(player, c, target);
  if (finalAdvanced) return finalAdvanced;
  const buffHeal = c2c8bResolveBuffHealTactic(player, c, target);
  if (buffHeal) return buffHeal;
  const reaction = c2c8ResolveReactionTactic(player, c, target);
  if (reaction) return reaction;
  const fabeotConversion = resolveHandTacticFabeotConversionEffect(player, c, target);
  if (fabeotConversion) return fabeotConversion;
  const fabeotHand = resolveHandTacticFabeotHandTheftEffect(player, c, target);
  if (fabeotHand) return fabeotHand;
  const drawEconomy = resolveHandTacticDrawCardEconomyEffect(player, c);
  if (drawEconomy) return drawEconomy;
  const energyEconomy = resolveHandTacticEnergyEconomyEffect(player, c, target);
  if (energyEconomy) return energyEconomy;
  const spawn = resolveHandTacticLibertiSpawnEffect(player, c, target);
  if (spawn) return spawn;
  if (c2c5bIsCellMovementBoost(c)) return resolveHandTacticCellMovementBoostEffect(player, c, target);
  if (c2c5IsCellTerrainEffect(c)) return resolveHandTacticCellTerrainEffect(player, c, target);
  if (isHandTacticCellTargetCard(c)) return resolveHandTacticAoeEffect(player, c, target);

  const movement = resolveHandTacticActiveMovementEffect(player, c, target);
  if (movement) return movement;

  const recovered = resolveHandTacticRecoveredBuffStructureEffect(player, c, target);
  if (recovered) return recovered;

  const amount = handTacticDamageAmount(c, target);
  const effectKind = c.effectKind;
  const result = { damage: amount || 0, extra: "" };

  if (effectKind === "damage_and_cleanse_buffs") {
    // C2-FINAL-A1: Missile Jam deve prima disattivare i buff/protezioni positive
    // e solo dopo risolvere il danno normale. Così il danno non viene mascherato
    // da bonus rimossi immediatamente dopo.
    if (target.alive) removeHandTacticPositiveEffects(target, c.name);
    if (amount > 0 && target.alive) {
      applyDamage(target, amount, c.name, { tactic:true, sourceCardUid: c.cardUid });
    }
    result.extra = "rimozione buff positivi prima del danno";
  } else {
    if (amount > 0) {
      applyDamage(target, amount, c.name, { tactic:true, sourceCardUid: c.cardUid });
    }
  }

  if (effectKind === "damage_and_cleanse_buffs") {
    // già risolto sopra: niente seconda rimozione buff.
  } else if (effectKind === "damage_and_permanent_att_debuff" || effectKind === "damage_and_permanent_attack_debuff") {
    if (target.alive) applyPermanentAttackDebuff(target, -1, c.name);
    result.extra = "-1 ATT permanente";
  } else if (effectKind === "damage_and_bleed") {
    if (target.alive && typeof canBleed === "function" && canBleed(target)) {
      applyBleed(target, 1, 2, c.name);
      result.extra = "Sanguinamento 1";
    } else if (target.alive) {
      log(`${c.name}: ${target.name} non può sanguinare.`);
      result.extra = "nessun sanguinamento";
    }
  } else if (effectKind === "set_def_to_one_round" || effectKind === "set_defense_to_one") {
    applyTemporaryDefToOne(target, c.name);
    result.extra = "DEF temporaneamente a 1";
  } else if (effectKind === "grant_thorns_temp" || effectKind === "grant_thorns_two") {
    applyStatus(target, { kind:"thorns", value:2, turns:1, source:c.name, owner:player });
    result.extra = "Spine 2";
  } else if (effectKind === "phase_shield") {
    applyStatus(target, { kind:"phase_shield", turns:1, source:c.name, owner:player });
    result.extra = "Scudo Fasico";
  } else if (effectKind === "stun_disable" || effectKind === "stun_unit") {
    applyStatus(target, { kind:"inhibit_action", turns:1, source:c.name, owner:player });
    result.extra = "Stordimento";
  } else if (effectKind === "inhibit_attack") {
    applyStatus(target, { kind:"inhibit_attack", turns:1, source:c.name, owner:player });
    result.extra = "Inibizione Attacco";
  } else if (effectKind === "grant_stealth_vehicle") {
    applyStatus(target, { kind:"stealth", turns:999, source:c.name, owner:player });
    result.extra = "Furtivo";
  }

  return result;
}


function handTacticLogSource(card) {
  if (isC2c8cFinalAdvancedTacticCard(card)) return "C2c-8c-hand-tactic";
  if (isC2c8bBuffHealTacticCard(card)) return "C2c-8b-hand-tactic";
  if (isC2c8ReactionTacticCard(card)) return "C2c-8-hand-tactic";
  if (isC2c7bFabeotConversionTacticCard(card)) return "C2c-7b-hand-tactic";
  if (isC2c7aFabeotHandTheftTacticCard(card)) return "C2c-7a-hand-tactic";
  if (isC2c6bEnergyEconomyTacticCard(card)) return "C2c-6b-hand-tactic";
  if (isC2c6aDrawCardEconomyTacticCard(card)) return "C2c-6a-hand-tactic";
  if (isC2c5cLibertiSpawnTacticCard(card)) return "C2c-5c-hand-tactic";
  if (isC2c5bActiveMovementTacticCard(card)) return "C2c-5b-hand-tactic";
  if (isC2c5MovementCellTacticCard(card)) return "C2c-5-hand-tactic";
  if (isC2c4aRecoveredBuffStructureTacticCard(card)) return "C2c-4a-hand-tactic";
  if (isC2c4SimpleAoeTacticCard(card)) return "C2c-4-hand-tactic";
  if (isC2c3ControlStatusTacticCard(card)) return "C2c-3-hand-tactic";
  if (isC2c2DamageDebuffCleanseTacticCard(card)) return "C2c-2-hand-tactic";
  return "C2c-1-hand-tactic";
}


function useHandTacticCard(player, rawCard, target) {
  if (!rawCard) return false;
  const card = normalizeHandTacticCard(rawCard);
  const immediate = isHandTacticImmediateNoTargetCard(card);
  if (!target && !immediate) return false;
  const check = canUseHandTacticCard(player, card);
  if (!check.ok) {
    log(`Carta ${card.name}: ${check.reason}.`);
    renderAll();
    return false;
  }
  if (!immediate && !handTacticTargets(player, card).some(t => t.uid === target.uid)) {
    log(`Bersaglio non valido per ${card.name}.`);
    renderAll();
    return false;
  }

  state.energy[player] -= card.cost || 0;
  const predictedDamage = target ? handTacticDamageAmount(card, target) : 0;
  const targetLabelText = target ? ` su ${target.name}` : "";
  log(`${playerName(player)} gioca dalla mano ${card.name} (${card.cost || 0} ENE)${targetLabelText}${predictedDamage ? `: ${predictedDamage} danni` : ""}.`, EventTypes.TACTIC_USED, {
    player,
    faction: state.factions[player],
    tacticId: card.tacticId || card.sourceId,
    tacticName: card.name,
    tacticKind: card.effectKind,
    cardUid: card.cardUid,
    cost: card.cost || 0,
    targetId: target && target.uid ? target.uid : null,
    targetName: target ? target.name : null,
    targetSide: target ? (target.side || null) : null,
    damage: predictedDamage,
    source: handTacticLogSource(card)
  });

  resolveHandTacticEffect(player, card, target);
  discardPlayedHandCard(player, card.cardUid);
  return true;
}


const TACTIC_HANDLERS = Object.freeze({
      healArmorOnPS(player, target) {
        const hpBefore = target.currentHp;
        const defBefore = target.currentDef;
        target.currentHp = Math.min(target.maxHp, target.currentHp + 1);
        target.currentDef = Math.min(target.maxDef, target.currentDef + 1);
        log(`${target.name} ricalcolata: +${target.currentHp - hpBefore} HP, +${target.currentDef - defBefore} DEF.`);
      },
      damageNearPS(player, target, tactic) { applyDamage(target, tactic.value || 2, tactic.name); },
      assaultOrder(player, target) {
        const partner = combatUnits(player).find(a => a.uid !== target.uid && areAdjacent(a.pos, target.pos) && ((a.type === "Fanteria" && handTacticIsVehicle(target)) || (a.type === "Veicolo" && handTacticIsInfantry(target))));
        if (!partner) return;
        applyAttackBuff(target, 1, "Ordine d’Assalto");
        applyAttackBuff(partner, 1, "Ordine d’Assalto");
      },
      warPush(player, target) {
        target.warPush = true;
        log(`${target.name} riceve Spinta di Guerra: movimento +1 e azione conservata dopo il movimento.`);
      },
      hordeCharge(player, target) {
        const affected = [target, ...combatUnits(player).filter(a => a.uid !== target.uid && areAdjacent(a.pos, target.pos))];
        for (const u of affected) applyAttackBuff(u, 1, "Carica dell’Orda");
      },
      raidMark(player, target) { applyStatus(target, { kind:"raid_mark", value:1, turns:1, owner:player, source:"Razzie Rapide" }); },
      defensiveRoots(player, target) { applyStatus(target, { kind:"thorns", value:2, turns:1, source:"Radici Difensive" }); },
      greenWall(player) {
        const affected = combatUnits(player).filter(u => u.type !== "Struttura" && combatUnits(player).some(s => s.type === "Struttura" && areAdjacent(s.pos, u.pos)));
        if (!affected.length) { log("Muro Verde non trova unità adiacenti a strutture."); return; }
        for (const u of affected) {
          const before = u.currentDef;
          u.currentDef = Math.max(before, Math.min(u.maxDef, u.currentDef + 1));
          const recovered = Math.max(0, u.currentDef - before);
          log(`${u.name} recupera ${recovered} DEF grazie a Muro Verde.`);
        }
      },
      logisticChoke(player, target) { applyStatus(target, { kind:"logistic_choke", value:2, turns:1, owner:player, source:"Strozzatura Logistica" }); },
      contractTrap(player, target, tactic) {
        addPlayerEffect(enemyOf(player), { kind:"cost_delta", value:1, minCost:1, turns:1, timing:"endTurn", filterSpec:"all", source:tactic.name });
      }
    });

