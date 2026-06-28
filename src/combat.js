"use strict";

// Arena Rubra – Fase B5a
// Combat extraction prudente.
// Questo file contiene attacco, danni, distruzione unità,
// Spine e sanguinamento legato al combattimento.
// Non contiene ancora AI, economia, abilità o gestione generale degli stati.

// Dipendenze globali accettate in questa fase:
// - rules.js: combatUnits, enemyOf, effectiveLife, updateControlFromOccupants
// - main.js/status future: getStatus, applyStatus, statusBlocks, canAct
// - main.js/economy future: addPlayerEffect, triggerLogisticChoke
// - main.js/passive future: psBonusValue, attackAuraBonus, defenseAuraBonus,
//   agathoiStructureAdjacencyDefBonus, isUntargetableTo, abilityTargets, canUseAbility
// - render/events: log, EventTypes


    function handleUnitDestroyed(unit) {
      if (!unit || unit._destroyHandled) return;
      unit._destroyHandled = true;
      const raid = getStatus(unit, "raid_mark");
      if (raid && raid.owner && state.currentPlayer === raid.owner) {
        state.energy[raid.owner] += raid.value || 1;
        log(`Razzie Rapide riesce: ${playerName(raid.owner)} guadagna +${raid.value || 1} ENE.`);
      }
      const bounty = getStatus(unit, "fabeot_bounty");
      if (bounty && bounty.owner && state.currentPlayer === bounty.owner) {
        addPlayerEffect(bounty.owner, { kind:"income_delta", value:bounty.value || 2, minIncome:0, turns:1, timing:"afterIncome", source:"Contratto di Riscossione" });
        log(`Contratto di Riscossione riesce: ${playerName(bounty.owner)} guadagnerà +${bounty.value || 2} ENE al prossimo income.`);
      }
      // v1.8.11c: le unità distrutte vengono rimosse dal campo logico.
      // Così i limiti unità contano sempre e solo le unità realmente in campo, non gli sbarchi storici.
      unit.alive = false;
      unit.acted = true;
      unit.pos = null;
      unit.statuses = [];
      unit.buffs = [];
      updateControlFromOccupants();
    }



    function effectiveAtt(unit) { return unit.currentAtt + psBonusValue(unit, "att") + attackAuraBonus(unit); }

    function isLightUnit(unit) { return Boolean(unit && String(unit.weight || "").toLowerCase().startsWith("legger")); }
    function hasNegativeEffect(unit) {
      return Boolean(unit && (unit.statuses || []).some(st => ["bleed","inhibit_action","inhibit_attack","inhibit_move","raid_mark","logistic_choke","fabeot_vulnerable","fabeot_bounty"].includes(st.kind)));
    }
    function isAdjacentToAlliedStructure(unit) {
      return Boolean(unit && unit.pos && combatUnits(unit.side).some(s => s.uid !== unit.uid && s.type === "Struttura" && s.type !== "QG" && areAdjacent(s.pos, unit.pos)));
    }
    function enemyAdjacentToAlliedStructure(attacker, defender) {
      return Boolean(attacker && defender && defender.pos && combatUnits(attacker.side).some(s => s.type === "Struttura" && areAdjacent(s.pos, defender.pos)));
    }
    function attackContextBonus(attacker, defender) {
      let bonus = 0;
      if (attacker.antiStructureAtt && defender.type === "Struttura") bonus += attacker.antiStructureAtt || 0;
      if (attacker.antiInfantryAtt && defender.type === "Fanteria") bonus += attacker.antiInfantryAtt || 0;
      if (attacker.attackBonusVsEnemiesAdjacentToAllyStructure && enemyAdjacentToAlliedStructure(attacker, defender)) bonus += attacker.attackBonusVsEnemiesAdjacentToAllyStructure || 0;
      if (attacker.bonusVsDebuffed && hasNegativeEffect(defender)) bonus += attacker.bonusVsDebuffed || 0;
      return bonus;
    }
    function dynamicDefenseBonus(target, attacker=null, options={}) {
      if (!target) return 0;
      let bonus = 0;
      if (target.adjacentVehicleDef && combatUnits(target.side).some(v => v.type === "Veicolo" && areAdjacent(v.pos, target.pos))) bonus += target.adjacentVehicleDef || 0;
      if (target.defVsInfantryAttacker && attacker && attacker.type === "Fanteria") bonus += target.defVsInfantryAttacker || 0;
      if (target.defVsLightAttacker && attacker && isLightUnit(attacker)) bonus += target.defVsLightAttacker || 0;
      if (target.adjacentAllyDef && combatUnits(target.side).some(ally => ally.uid !== target.uid && ally.type !== "QG" && areAdjacent(ally.pos, target.pos))) bonus += target.adjacentAllyDef || 0;
      if (target.structureAdjDef && isAdjacentToAlliedStructure(target)) bonus += target.structureAdjDef || 0;
      // C2c-1a hotfix: dynamicDefAdjacentUnits non deve agire come scudo rinnovabile a ogni attacco.
      if (target.dynamicDefAdjacentStructures) {
        const count = combatUnits(target.side).filter(u => u.uid !== target.uid && u.type === "Struttura" && areAdjacent(u.pos, target.pos)).length;
        bonus += Math.min(target.dynamicDefAdjacentStructures.max || 0, count * (target.dynamicDefAdjacentStructures.value || 1));
      }
      if (target.stationaryDefBonus) bonus += target.stationaryDefBonus || 0;
      return bonus;
    }

    function findFrontLineInterceptor(attacker, defender) {
      if (!attacker || !defender || !defender.pos) return null;
      return combatUnits(defender.side)
        .filter(u => u.uid !== defender.uid && u.frontLine && areAdjacent(u.pos, defender.pos) && !isUntargetableTo(u, attacker.side))
        .sort((a,b) => effectiveLife(b) - effectiveLife(a))[0] || null;
    }



    function hasFactionRule(unit, ruleName) {
      return Boolean(unit && Array.isArray(unit.factionRules) && unit.factionRules.includes(ruleName));
    }

    function hasNumericalSuperiorityRule(unit) {
      return hasFactionRule(unit, "Superiorità Numerica");
    }

    function hasBleedingAttackRule(unit) {
      return hasFactionRule(unit, "Sanguinamento");
    }

    function numericalSuperiorityBonus(attacker, defender) {
      if (!attacker || !defender || attacker.faction !== "Liberti" || attacker.type === "QG" || attacker.type === "Struttura") return 0;
      if (!hasNumericalSuperiorityRule(attacker)) return 0;
      const support = combatUnits(attacker.side).some(ally => ally.uid !== attacker.uid && areAdjacent(ally.pos, defender.pos));
      if (!support) return 0;
      const enhanced = typeof getStatus === "function" ? getStatus(attacker, "enhanced_superiority_next_attack") : null;
      return enhanced ? Math.max(2, enhanced.value || 2) : 1;
    }



    function attackerHasIgnoreDefenseOnBasicAttack(attacker) {
      return Boolean(attacker && (hasStatus(attacker, "ignore_defense_permanent") || hasStatus(attacker, "next_attack_ignore_defense")));
    }



    function resolvePostBasicAttackTacticStatuses(attacker, defender) {
      if (!attacker) return;
      if (hasStatus(attacker, "next_attack_ignore_defense")) {
        removeStatusKind(attacker, "next_attack_ignore_defense", "attacco base consumato");
      }
      if (defender && defender.alive && hasStatus(attacker, "stun_on_basic_attack")) {
        applyStatus(defender, { kind:"inhibit_action", turns:1, source:"Diploma da Mentalista", owner:attacker.side });
        log(`${attacker.name} applica Stordimento mentale a ${defender.name}.`, EventTypes.STATUS_APPLIED, {
          attackerId: attacker.uid,
          attackerName: attacker.name,
          defenderId: defender.uid,
          defenderName: defender.name,
          source: "Diploma da Mentalista"
        });
      }
    }



    function c2c8MaybeGrantExtraAttackOnKill(attacker, defender) {
      if (!attacker || !defender || defender.alive || !hasStatus(attacker, "extra_attack_on_kill")) return false;
      const original = attacker.attacksPerTurn || 1;
      attacker.c2c8BaseAttacksPerTurn = attacker.c2c8BaseAttacksPerTurn || original;
      attacker.attacksPerTurn = Math.max(attacker.attacksPerTurn || 1, attacker.c2c8BaseAttacksPerTurn + 1);
      removeStatusKind(attacker, "extra_attack_on_kill", "kill confermata");
      log(`${attacker.name} ottiene un attacco extra da Dispositivo di Puntamento.`, EventTypes.STATUS_APPLIED, {
        attackerId: attacker.uid,
        attackerName: attacker.name,
        defenderId: defender.uid,
        defenderName: defender.name,
        source: "C2c-8-extra-attack-on-kill"
      });
      return true;
    }

    function c2c8MaybeCounterattack(defender, attacker) {
      if (!defender || !attacker || !defender.alive || !attacker.alive || !hasStatus(defender, "counterattack")) return false;
      removeStatusKind(defender, "counterattack", "contrattacco risolto");
      if (typeof c2c8ReactionAttack !== "function") return false;
      return c2c8ReactionAttack(defender, attacker, "Contrattacco", { counterattack:true });
    }


    function c2c8cLastRunStatus(attacker) {
      return typeof getStatus === "function" && attacker ? getStatus(attacker, "last_run_sacrifice") : null;
    }

    function c2c8cSanguisHunterStatus(attacker) {
      return typeof getStatus === "function" && attacker ? getStatus(attacker, "sanguis_hunter") : null;
    }

    function c2c8cMaybeGrowSanguisHunter(attacker, defender, defenderDiedFromAttack) {
      if (!attacker || !defender || !defenderDiedFromAttack || !c2c8cSanguisHunterStatus(attacker)) return false;
      if (defender.type !== "Fanteria") return false;
      attacker.c2c8cSanguisHunter = true;
      attacker.c2c8cSanguisBleedBonus = (attacker.c2c8cSanguisBleedBonus || 0) + 1;
      const status = getStatus(attacker, "sanguis_hunter");
      if (status) status.value = attacker.c2c8cSanguisBleedBonus;
      log(`${attacker.name} cresce come Cacciatore Sanguis: sanguinamento futuro +${attacker.c2c8cSanguisBleedBonus}.`, EventTypes.STATUS_APPLIED, {
        attackerId: attacker.uid,
        attackerName: attacker.name,
        defenderId: defender.uid,
        defenderName: defender.name,
        bonus: attacker.c2c8cSanguisBleedBonus,
        source:"C2c-8c-sanguis-hunter-growth"
      });
      return true;
    }

    function c2c8cLastRunAreaCoords(attackerPos, defenderPos) {
      const coords = [];
      for (const pos of [attackerPos, defenderPos]) {
        if (!Array.isArray(pos)) continue;
        coords.push(...neighbors(pos));
      }
      return uniqueCoords(coords).filter(c => isInsideMap(c));
    }

    function c2c8cResolveLastRunAfterAttack(attacker, defender, lastRunStatus) {
      if (!attacker || !lastRunStatus) return;
      const attackerPos = Array.isArray(attacker.pos) ? [...attacker.pos] : (Array.isArray(attacker._c2c8cLastRunPos) ? [...attacker._c2c8cLastRunPos] : null);
      const defenderPos = defender && Array.isArray(defender.pos) ? [...defender.pos] : (defender && Array.isArray(defender._c2c8cLastRunPos) ? [...defender._c2c8cLastRunPos] : null);
      removeStatusKind(attacker, "last_run_sacrifice", "attacco base consumato");
      const affected = new Set();
      const targets = [];
      for (const coord of c2c8cLastRunAreaCoords(attackerPos, defenderPos)) {
        const u = getUnitAt(coord);
        if (u && u.alive && u.uid !== attacker.uid && !affected.has(u.uid)) {
          affected.add(u.uid);
          targets.push(u);
        }
      }
      const dmg = lastRunStatus.aoeDamage || 2;
      for (const u of targets) {
        applyDamage(u, dmg, "Ultima Corsa", { tactic:true, directHp:false, skipC2c8Reactions:true });
      }
      if (attacker.alive) {
        log(`${attacker.name} completa l'Ultima Corsa e viene distrutto dal sacrificio.`, EventTypes.UNIT_DESTROYED, {
          unitId: attacker.uid,
          unitName: attacker.name,
          side: attacker.side,
          faction: attacker.faction,
          source:"C2c-8c-last-run-sacrifice"
        });
        if (typeof c1fBeforeUnitDestroyed === "function") c1fBeforeUnitDestroyed(attacker, null, "Ultima Corsa", { tactic:true, sacrifice:true });
        attacker.alive = false;
        attacker.acted = true;
        handleUnitDestroyed(attacker);
      }
      log(`Ultima Corsa esplode su ${targets.length} unità nell'area attorno ad attaccante e bersaglio.`, EventTypes.TACTIC_USED, {
        attackerId: attacker.uid,
        attackerName: attacker.name,
        affected: targets.map(u => u.uid),
        damage: dmg,
        source:"C2c-8c-last-run-area"
      });
    }

    function triggerAmbushesAt(movedUnit) {
      if (!movedUnit || !movedUnit.alive || !Array.isArray(movedUnit.pos)) return 0;
      const ambushers = combatUnits(enemyOf(movedUnit.side))
        .filter(u => u && hasStatus(u, "ambush") && typeof c2c8CanReactionAttack === "function" && c2c8CanReactionAttack(u, movedUnit))
        .sort((a,b) => String(a.uid).localeCompare(String(b.uid)));
      let triggered = 0;
      for (const ambusher of ambushers) {
        if (!movedUnit.alive) break;
        removeStatusKind(ambusher, "ambush", "Agguato attivato");
        if (typeof c2c8ReactionAttack === "function" && c2c8ReactionAttack(ambusher, movedUnit, "Agguato", { ambush:true })) triggered += 1;
      }
      return triggered;
    }

    function attackUnit(attacker, defender) {
      if (!canAttack(attacker) || !defender || !defender.alive || !Array.isArray(attacker.pos) || !Array.isArray(defender.pos) || isUntargetableTo(defender, attacker.side)) return;
      const originalDefender = defender;
      const interceptor = findFrontLineInterceptor(attacker, defender);
      if (interceptor) {
        defender = interceptor;
        log(`${defender.name} intercetta l'attacco diretto contro ${originalDefender.name} con Prima Linea.`);
      }
      if (typeof revealStealth === "function") revealStealth(attacker, "attacco base");
      const baseAmount = effectiveAtt(attacker);
      const ps = psBonusValue(attacker, "att");
      const aura = attackAuraBonus(attacker);
      const superiority = numericalSuperiorityBonus(attacker, defender);
      const context = attackContextBonus(attacker, defender);
      const lastRunStatus = c2c8cLastRunStatus(attacker);
      const lastRunBonus = lastRunStatus ? (lastRunStatus.value || 1) : 0;
      const rawAmount = baseAmount + superiority + context + lastRunBonus;
      const doubleStatus = typeof getStatus === "function" ? getStatus(attacker, "double_attack_next_attack") : null;
      const multiplier = doubleStatus ? Math.max(2, doubleStatus.value || 2) : 1;
      const amount = rawAmount * multiplier;
      attacker.attacksMade = (attacker.attacksMade || 0) + 1;
      const parts = [];
      if (ps) parts.push(`+${ps} PS`);
      if (aura) parts.push(`+${aura} aura`);
      if (superiority) parts.push(`+${superiority} superiorità numerica`);
      if (context) parts.push(`+${context} bonus condizionale`);
      if (lastRunBonus) parts.push(`+${lastRunBonus} Ultima Corsa`);
      if (multiplier > 1) parts.push(`x${multiplier} Ordine di Varran`);
      const multi = attacker.attacksPerTurn > 1 ? ` [attacco ${attacker.attacksMade}/${attacker.attacksPerTurn}]` : "";
      log(`${attacker.name} attacca ${defender.name} con ATT ${amount}${parts.length ? ` (${parts.join(", ")})` : ""}${multi}.`, EventTypes.UNIT_ATTACKED, {
        attackerId: attacker.uid,
        attackerName: attacker.name,
        attackerSide: attacker.side,
        defenderId: defender.uid,
        defenderName: defender.name,
        defenderSide: defender.side,
        amount,
        rawAmount,
        multiplier,
        psBonus: ps || 0,
        auraBonus: aura || 0,
        superiorityBonus: superiority || 0,
        contextBonus: context || 0,
        lastRunBonus: lastRunBonus || 0,
        attackNo: attacker.attacksMade || 1,
        attacksPerTurn: attacker.attacksPerTurn || 1
      });
      triggerLogisticChoke(attacker);
      const thorns = effectiveThorns(defender);
      const ignoreDefense = attackerHasIgnoreDefenseOnBasicAttack(attacker);
      if (ignoreDefense) {
        log(`${attacker.name} ignora la DEF di ${defender.name} con un attacco a sorpresa.`, EventTypes.LOG_MESSAGE, {
          attackerId: attacker.uid,
          attackerName: attacker.name,
          defenderId: defender.uid,
          defenderName: defender.name,
          source: "C2c-4a-ignore-defense"
        });
      }
      if (lastRunStatus && Array.isArray(defender.pos)) defender._c2c8cLastRunPos = [...defender.pos];
      const defenderWasAlive = defender.alive;
      applyDamage(defender, amount, "attacco", { amplifiable:true, attacker, baseAttack:true, directHp:ignoreDefense });
      const defenderDiedFromAttack = defenderWasAlive && !defender.alive;
      resolvePostBasicAttackTacticStatuses(attacker, defender);
      if (doubleStatus) removeStatusKind(attacker, "double_attack_next_attack", "attacco base consumato");
      if (typeof getStatus === "function" && getStatus(attacker, "enhanced_superiority_next_attack")) removeStatusKind(attacker, "enhanced_superiority_next_attack", "attacco base consumato");
      if (defenderDiedFromAttack) {
        c2c8MaybeGrantExtraAttackOnKill(attacker, defender);
        c2c8cMaybeGrowSanguisHunter(attacker, defender, defenderDiedFromAttack);
        c2finalc2MaybeHealOnInfantryKill(attacker, defender);
      }
      const bleedTwo = typeof getStatus === "function" ? getStatus(attacker, "next_attack_bleed_two") : null;
      let specialBleedApplied = false;
      if (bleedTwo) {
        if (defender.alive && typeof canBleed === "function" && canBleed(defender)) {
          applyBleed(defender, bleedTwo.value || 2, 2, bleedTwo.source || "Marchio dei Sanguis");
          specialBleedApplied = true;
        }
        removeStatusKind(attacker, "next_attack_bleed_two", "attacco base consumato");
      }
      if (attacker.faction === "Liberti" && hasBleedingAttackRule(attacker) && defender.alive && canBleed(defender) && !specialBleedApplied) applyBleed(defender, (attacker.bleedValue || 1) + (attacker.c2c8cSanguisBleedBonus || 0), 2, attacker.name);
      if (lastRunStatus) c2c8cResolveLastRunAfterAttack(attacker, defender, lastRunStatus);
      if (thorns && attacker.alive && attacker.type !== "QG") {
        const thornDamage = Math.max(1, thorns.value || 1);
        log(`${attacker.name} viene ferito dalle Spine di ${defender.name}.`);
        applyDamage(attacker, thornDamage, "Spine", { directHp:true });
      }
      if (!defenderDiedFromAttack && defender.alive && attacker.alive) c2c8MaybeCounterattack(defender, attacker);
    }



    function effectiveThorns(unit) {
      const st = getStatus(unit, "thorns");
      const values = [];
      if (st) values.push(st.value || 1);
      if (unit && unit.passiveThorns) values.push(unit.passiveThorns || 1);
      if (unit && unit.structureAdjThorns && isAdjacentToAlliedStructure(unit)) values.push(unit.structureAdjThorns || 1);
      if (!values.length) return null;
      return { kind:"thorns", value:Math.max(...values), turns:st ? st.turns : 1, passive:true };
    }



    function applyDamage(target, amount, source="danno", options={}) {
      const vulnerable = options.amplifiable ? getStatus(target, "fabeot_vulnerable") : null;
      if (vulnerable) {
        amount += vulnerable.value || 1;
        log(`${target.name} subisce +${vulnerable.value || 1} danno da Sentenza Porpora.`, EventTypes.UNIT_DAMAGED, {
          targetId: target.uid,
          targetName: target.name,
          modifier: "Sentenza Porpora",
          extraDamage: vulnerable.value || 1
        });
      }
      if (options.directHp) {
        const hpLoss = Math.min(target.currentHp, amount);
        target.currentHp -= hpLoss;
        log(`${target.name} subisce ${amount} da ${source}: -${hpLoss} HP diretti, DEF ignorata.`, EventTypes.UNIT_DAMAGED, {
          targetId: target.uid,
          targetName: target.name,
          targetSide: target.side,
          amount,
          source,
          defLoss: 0,
          hpLoss,
          directHp: true
        });
        if (target.currentHp <= 0) {
          if (typeof c2c6bRecordUnitDestroyed === "function") c2c6bRecordUnitDestroyed(target, options.attacker || null, source, options);
          target.alive = false;
          target.acted = true;
          log(`${target.name} è distrutto.`, EventTypes.UNIT_DESTROYED, {
          unitId: target.uid,
          unitName: target.name,
          side: target.side,
          faction: target.faction,
          source
        });
          if (typeof c1fBeforeUnitDestroyed === "function") c1fBeforeUnitDestroyed(target, options.attacker || null, source, options);
          handleUnitDestroyed(target);
        }
        return;
      }
      let remaining = amount;
      const auraBlock = options.status ? 0 : Math.min(defenseAuraBonus(target), remaining);
      remaining -= auraBlock;
      const structureDefBlock = options.status ? 0 : Math.min(agathoiStructureAdjacencyDefBonus(target), remaining);
      remaining -= structureDefBlock;
      const dynamicBlock = options.status ? 0 : Math.min(dynamicDefenseBonus(target, options.attacker || null, options), remaining);
      remaining -= dynamicBlock;

      // C2c-2a: danno normale non perforante.
      // Se il bersaglio ha ancora DEF attuale, il danno normale consuma solo DEF.
      // L'eventuale eccesso NON passa agli HP. Gli HP vengono colpiti solo se la DEF era già a 0.
      let defLoss = 0;
      let hpLoss = 0;
      let overflowLost = 0;
      if (target.currentDef > 0) {
        defLoss = Math.min(target.currentDef, remaining);
        target.currentDef -= defLoss;
        overflowLost = Math.max(0, remaining - defLoss);
      } else {
        hpLoss = Math.min(target.currentHp, remaining);
        target.currentHp -= hpLoss;
      }

      const auraText = auraBlock ? `, -${auraBlock} bloccato da aura DEF` : "";
      const structureText = structureDefBlock ? `, -${structureDefBlock} bloccato da struttura Agathoi` : "";
      const dynamicText = dynamicBlock ? `, -${dynamicBlock} bloccato da bonus condizionale` : "";
      const overflowText = overflowLost ? `, ${overflowLost} danno non perforante perso` : "";
      log(`${target.name} subisce ${amount} da ${source}: -${defLoss} DEF, -${hpLoss} HP${auraText}${structureText}${dynamicText}${overflowText}.`, EventTypes.UNIT_DAMAGED, {
        targetId: target.uid,
        targetName: target.name,
        targetSide: target.side,
        amount,
        source,
        defLoss,
        hpLoss,
        auraBlock,
        structureDefBlock,
        dynamicBlock,
        overflowLost,
        directHp: false,
        noOverflow: true
      });
      if (target.currentHp <= 0) {
        if (typeof c2c6bRecordUnitDestroyed === "function") c2c6bRecordUnitDestroyed(target, options.attacker || null, source, options);
        target.alive = false;
        target.acted = true;
        log(`${target.name} è distrutto.`, EventTypes.UNIT_DESTROYED, {
          unitId: target.uid,
          unitName: target.name,
          side: target.side,
          faction: target.faction,
          source
        });
        if (typeof c1fBeforeUnitDestroyed === "function") c1fBeforeUnitDestroyed(target, options.attacker || null, source, options);
        handleUnitDestroyed(target);
      }
    }




    function c2finalc2MaybeHealOnInfantryKill(attacker, defeated) {
      if (!attacker || !defeated || !attacker.alive || defeated.type !== "Fanteria" || !(attacker.onKillHealInfantry || 0)) return;
      const before = attacker.currentHp;
      attacker.currentHp = Math.min(attacker.maxHp, attacker.currentHp + (attacker.onKillHealInfantry || 1));
      const healed = attacker.currentHp - before;
      if (healed > 0) log(`${attacker.name} recupera ${healed} HP da Predazione Sanguis.`);
    }

    function vehicleHasFollowupAfterAttack(unit) {
      return unit && unit.type === "Veicolo" && !(unit.moveAttack && unit.movedThisTurn && !unit.warPush) && unit.ability && canUseAbility(unit, unit.ability) && abilityTargets(unit, unit.ability).length > 0;
    }



    function shouldEndAfterAttack(unit) {
      if ((unit.attacksMade || 0) < (unit.attacksPerTurn || 1) && adjacentAttackTargets(unit).length > 0) return false;
      if (vehicleHasFollowupAfterAttack(unit)) return false;
      return true;
    }



    function canBleed(unit) { return unit.type !== "QG" && unit.type !== "Struttura" && !unit.bleedImmune; }



    function applyBleed(target, value, turns, source) {
      applyStatus(target, { kind:"bleed", value, turns, source });
    }



    function canAttack(unit) {
      return Boolean(
        canAct(unit)
        && Array.isArray(unit.pos)
        && unit.type !== "Struttura"
        && unit.type !== "QG"
        && effectiveAtt(unit) > 0
        && !statusBlocks(unit, "attack")
        && !(typeof vehicleMovedBlocksAttack === "function" && vehicleMovedBlocksAttack(unit))
        && (unit.attacksMade || 0) < (unit.attacksPerTurn || 1)
      );
    }



    function adjacentAttackTargets(unit) {
      return combatUnits(enemyOf(unit.side)).filter(e => areAdjacent(unit.pos, e.pos) && !isUntargetableTo(e, unit.side));
    }



// =====================================================
// B8-final – Aura helpers moved from main.js
// =====================================================

function adjacentAlliedAuras(unit, kind) {
      if (!unit || !unit.pos) return [];
      return combatUnits(unit.side).filter(a => a.uid !== unit.uid && a.ability && a.ability.kind === kind && a.ability.passive && areAdjacent(a.pos, unit.pos));
    }

function attackAuraBonus(unit) {
      return adjacentAlliedAuras(unit, "auraAtt").reduce((sum, a) => sum + (a.ability.value || 0), 0);
    }

function defenseAuraBonus(unit) {
      return adjacentAlliedAuras(unit, "auraDef").reduce((sum, a) => sum + (a.ability.value || 0), 0);
    }


// =====================================================
// C1f – death triggers and mines
// =====================================================
function c1fBeforeUnitDestroyed(unit, attacker=null, source="distruzione", options={}) {
  if (!unit || unit._c1fDeathHandled) return;
  unit._c1fDeathHandled = true;
  const deathPos = Array.isArray(unit.pos) ? [...unit.pos] : null;

  if (attacker && attacker.alive && attacker.side !== unit.side && source === "attacco") {
    if (attacker.eneOnAttackKill) {
      state.energy[attacker.side] += attacker.eneOnAttackKill || 1;
      log(`${attacker.name} espropria risorse: +${attacker.eneOnAttackKill || 1} ENE immediato.`);
    }
    if (attacker.enemyIncomeLossOnKill) {
      addPlayerEffect(unit.side, { kind:"income_delta", value:-(attacker.enemyIncomeLossOnKill || 1), minIncome:0, turns:1, timing:"afterIncome", source:attacker.name });
      log(`${attacker.name} sabota l'economia nemica: ${playerName(unit.side)} avrà -${attacker.enemyIncomeLossOnKill || 1} ENE al prossimo income.`);
    }
  }

  if (deathPos) {
    for (const m of combatUnits(null).filter(u => u.createCardFromEnemyDeathRange && u.side !== unit.side && hexDistance(u.pos, deathPos) <= (u.createCardFromEnemyDeathRange || 1))) {
      if (typeof addBlueprintCardToHand === "function") addBlueprintCardToHand(m.side, unit.id, unit.faction, `${m.name} · matrice`);
    }
  }

  if (unit.dislocateAttackerOnDestroy && attacker && options.baseAttack && attacker.alive && attacker.pos) {
    const target = nearestEnemySpawnCellFor(attacker.side, attacker.pos);
    if (target) {
      attacker.pos = [...target];
      log(`${unit.name} collassa: ${attacker.name} viene dislocato al punto di sbarco nemico più vicino [${target.join(",")}].`);
    }
  }
}

function nearestEnemySpawnCellFor(player, fromCoord) {
  const enemy = enemyOf(player);
  return spawnCellsFor(enemy).sort((a,b) => hexDistance(a, fromCoord) - hexDistance(b, fromCoord))[0] || null;
}

function triggerMinesAt(coord, unit) {
  if (!state || !state.mines || !unit || !unit.alive || unit.type === "QG" || unit.type === "Struttura") return;
  const mine = state.mines.find(m => sameCoord(m.coord, coord));
  if (!mine) return;
  state.mines = state.mines.filter(m => m !== mine);
  const dmg = unit.type === "Veicolo" ? (mine.vehicleDamage || 3) : (mine.infantryDamage || 1);
  if (typeof recordAiHazardTrigger === "function") recordAiHazardTrigger(unit.side, "mine", mine.owner === unit.side);
  log(`${unit.name} attiva una mina in [${coord.join(",")}]: ${dmg} danni diretti.`);
  applyDamage(unit, dmg, mine.name || "Mina", { directHp:true, status:true });
}
