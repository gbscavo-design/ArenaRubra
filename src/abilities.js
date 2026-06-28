"use strict";

// Arena Rubra – Fase B5c
// Abilities extraction prudente.
// Questo file contiene handler abilità unità, target abilità,
// conversioni Fabeot, uso abilità e follow-up dopo abilità.
// Non contiene AI, economia generale, tattiche o rendering.

// Dipendenze globali accettate in questa fase:
// - combat.js: applyDamage, canAttack, adjacentAttackTargets
// - statuses.js: applyStatus, getStatus, hasStatus, canUseAbility
// - rules.js: combatUnits, enemyOf, playerName, updateControlFromOccupants, effectiveLife
// - main.js/economy future: addPlayerEffect, countsAsLightCap, activeLightCount, lightFieldLimit
// - main.js/map/movement future: isOnPS
// - render/events: log, EventTypes

const ABILITY_HANDLERS = Object.freeze({
      damage(user, target, ab) { applyDamage(target, abilityDamageValue(ab, target), ab.name, { amplifiable:true }); },
      heal(user, target, ab) {
        const before = target.currentHp;
        target.currentHp = Math.min(target.maxHp, target.currentHp + ab.value);
        log(`${target.name} recupera ${target.currentHp - before} HP.`);
      },
      armor(user, target, ab) {
        const before = target.currentDef;
        target.currentDef = Math.min(target.maxDef, target.currentDef + ab.value);
        log(`${target.name} ripristina ${target.currentDef - before} DEF.`);
      },
      shred(user, target, ab) {
        const loss = Math.min(target.currentDef, ab.value);
        target.currentDef -= loss;
        log(`${target.name} perde ${loss} DEF.`);
      },
      buffAtt(user, target, ab) {
        target.currentAtt += ab.value;
        target.buffs.push({ stat:"att", value:ab.value, turns:1, source:ab.name });
        log(`${target.name} guadagna +${ab.value} ATT fino alla fine del turno.`);
      },
      status(user, target, ab) {
        applyStatus(target, {
          kind: ab.statusKind,
          value: ab.value || 0,
          turns: ab.turns || 1,
          source: ab.name
        });
      },
      incomeSwing(user, target, ab) {
        addPlayerEffect(user.side, {
          kind: "income_delta",
          value: ab.ownValue || 1,
          minIncome: ab.minIncome ?? 0,
          turns: ab.turns || 1,
          timing: ab.timing || "afterIncome",
          source: ab.name
        });
        addPlayerEffect(enemyOf(user.side), {
          kind: "income_delta",
          value: ab.enemyValue || -1,
          minIncome: ab.minIncome ?? 0,
          turns: ab.turns || 1,
          timing: ab.timing || "afterIncome",
          source: ab.name
        });
      },
      costDelta(user, target, ab) {
        const side = affectedPlayerForAbility(user, target, ab);
        addPlayerEffect(side, {
          kind: "cost_delta",
          value: ab.value || 0,
          minCost: ab.minCost ?? 1,
          turns: ab.turns || 1,
          timing: ab.timing || "endTurn",
          filterSpec: ab.filterSpec || "all",
          source: ab.name
        });
      },
      incomeDelta(user, target, ab) {
        const side = affectedPlayerForAbility(user, target, ab);
        addPlayerEffect(side, {
          kind: "income_delta",
          value: ab.value || 0,
          minIncome: ab.minIncome ?? 0,
          turns: ab.turns || 1,
          timing: ab.timing || "afterIncome",
          source: ab.name
        });
      },
      psLock(user, target, ab) {
        const coord = target && (target.coord || target.pos);
        if (coord) addPsLock(user.side, coord, ab.name);
      },
      swapAlly(user, target, ab) {
        if (!target || target.side !== user.side || target.uid === user.uid || target.type === "Struttura") return;
        const a = [...user.pos];
        const b = [...target.pos];
        user.pos = b;
        target.pos = a;
        log(`${user.name} scambia posizione con ${target.name}.`);
      },
      deceptivePositioning(user, target, ab) {
        if (!target || target.side !== user.side || target.uid === user.uid || target.type === "Struttura") return;
        const a = [...user.pos];
        const b = [...target.pos];
        user.pos = b;
        target.pos = a;
        user.movedThisTurn = true;
        target.movedThisTurn = true;
        log(`${user.name} scambia posizione con ${target.name}.`);
        if (typeof triggerCellEffectsAt === "function") {
          triggerCellEffectsAt(user.pos, user);
          triggerCellEffectsAt(target.pos, target);
        }
        const victim = bestDeceptivePositioningVictim(user);
        if (victim && victim.currentDef > 0) {
          victim.currentDef -= 1;
          user.currentDef += 1;
          user.buffs.push({ stat:"def", value:1, turns:1, source:ab.name });
          log(`${user.name} ruba 1 DEF a ${victim.name}: ${victim.name} -1 DEF, ${user.name} +1 DEF temporaneo.`);
        } else {
          log(`${user.name} non trova DEF nemica da rubare dopo il posizionamento.`);
        }
      },
      corruptLightInfantry(user, target, ab) {
        corruptLightInfantryUnit(user, target, ab);
      },
      vulnerableMark(user, target, ab) {
        applyStatus(target, { kind:"fabeot_vulnerable", value:ab.value || 1, turns:ab.turns || 1, owner:user.side, source:ab.name });
      },
      deploymentDiscount(user, target, ab) {
        addPlayerEffect(user.side, {
          kind:"deploy_discount",
          value:ab.value || -1,
          minCost:ab.minCost ?? 1,
          turns:ab.turns || 1,
          timing:ab.timing || "endTurn",
          filterSpec:ab.filterSpec || "nonStructure",
          source:ab.name
        });
      },

      nexusPsPresidium(user, target, ab) {
        if (!target || target.side !== user.side || target.faction !== "Nexus") {
          log(`${ab.name} fallisce: serve una unità Nexus alleata valida.`);
          return;
        }
        const psCells = state.cells.filter(c => c.ps && target.pos && hexDistance(target.pos, c.coord) <= 1);
        if (!psCells.length) {
          log(`${ab.name} fallisce: il bersaglio deve essere su PS o adiacente a PS.`);
          return;
        }
        const defGain = ab.value || 1;
        target.currentDef += defGain;
        target.buffs.push({ stat:"def", value:defGain, turns:1, source:ab.name });
        log(`${target.name} riceve +${defGain} DEF da ${ab.name}.`);
        const controlled = psCells.some(c => c.control === user.side);
        if (controlled) {
          const attGain = ab.attValue || 1;
          target.currentAtt += attGain;
          target.buffs.push({ stat:"att", value:attGain, turns:1, source:ab.name });
          log(`${target.name} riceve anche +${attGain} ATT: Nexus controlla il PS presidiato.`);
        }
      },
      nexusAdvancedLogistics(user, target, ab) {
        addPlayerEffect(user.side, {
          kind:"hand_deploy_discount",
          value:ab.value || -1,
          minCost:ab.minCost ?? 1,
          turns:1,
          timing:ab.timing || "endTurn",
          filterSpec:"nexusHandUnit",
          source:ab.name
        });
      },
      varranOrder(user, target, ab) {
        if (!target || target.side !== user.side || target.faction !== "Exordium") {
          log(`${ab.name} fallisce: serve una unità Exordium alleata valida.`);
          return;
        }
        const gain = ab.value || 1;
        target.currentAtt += gain;
        target.buffs.push({ stat:"att", value:gain, turns:1, source:ab.name });
        user.c2finalc2ReadyAfterAbility = true;
        log(`${target.name} riceve +${gain} ATT da ${ab.name}. ${user.name} resta pronto ad agire.`);
      },
      nemiraCommand(user, target, ab) {
        if (!target || target.side !== user.side || target.faction !== "Exordium") {
          log(`${ab.name} fallisce: serve una unità Exordium alleata valida.`);
          return;
        }
        const before = target.currentHp;
        target.currentHp = Math.min(target.maxHp, target.currentHp + (ab.heal || 1));
        const healed = target.currentHp - before;
        const gain = ab.value || 1;
        target.currentAtt += gain;
        target.buffs.push({ stat:"att", value:gain, turns:1, source:ab.name });
        log(`${target.name} recupera ${healed} HP e riceve +${gain} ATT da ${ab.name}.`);
      },
      enhancedSuperiority(user, target, ab) {
        if (!target || target.side !== user.side || target.faction !== "Liberti") {
          log(`${ab.name} fallisce: serve una unità Liberti alleata valida.`);
          return;
        }
        applyStatus(target, { kind:"enhanced_superiority_next_attack", value:ab.value || 2, turns:1, owner:user.side, source:ab.name });
      },
      primarchMandate(user, target, ab) {
        const gain = ab.value || 1;
        const allies = combatUnits(user.side).filter(u => u && u.alive && u.faction === "Agathoi" && (u.uid === user.uid || areAdjacent(u.pos, user.pos)));
        if (!allies.length) {
          log(`${ab.name}: nessuna unità Agathoi valida in formazione.`);
          return;
        }
        for (const ally of allies) {
          ally.currentDef += gain;
          log(`${ally.name} riceve +${gain} DEF senza cap da ${ab.name}.`);
        }
      },
      agoraOrders(user, target, ab) {
        if (!target || target.side !== user.side || target.faction !== "Agathoi" || !(target.type === "Fanteria" || target.uid === user.uid)) {
          log(`${ab.name} fallisce: serve una fanteria Agathoi alleata o Dycaios stesso.`);
          return;
        }
        applyStatus(target, { kind:"counterattack", value:1, turns:1, owner:user.side, source:ab.name });
      },
      compromisedLogistics(user, target, ab) {
        const enemy = enemyOf(user.side);
        const drawn = typeof drawCards === "function" ? drawCards(enemy, 1, { source:ab.name }) : [];
        const card = drawn && drawn[0] ? drawn[0] : null;
        if (!card) {
          log(`${ab.name}: ${playerName(enemy)} non ha carte da pescare.`);
          return;
        }
        if (card.zone !== "hand") {
          log(`${ab.name}: ${card.name} non entra in mano a ${playerName(enemy)} e non può essere rubata.`);
          return;
        }
        if (!c2finalc2CanStealDrawnCombatUnit(card)) {
          log(`${ab.name}: ${playerName(enemy)} pesca ${card.name}, ma non è fanteria/veicolo rubabile.`);
          return;
        }
        c2finalc2StealDrawnCardToFabeot(user.side, enemy, card, ab.name);
      },
      fabeotBounty(user, target, ab) {
        applyStatus(target, { kind:"fabeot_bounty", value:ab.value || 2, turns:1, owner:user.side, source:ab.name });
      },
      adjacentDefBuff(user, target, ab) {
        const allies = combatUnits(user.side).filter(u => u.uid !== user.uid && areAdjacent(u.pos, user.pos));
        if (!allies.length) log(`${user.name} non ha alleati adiacenti da proteggere.`);
        for (const ally of allies) {
          ally.currentDef += ab.value || 1;
          ally.buffs.push({ stat:"def", value:ab.value || 1, turns:1, source:ab.name });
          log(`${ally.name} riceve +${ab.value || 1} DEF temporaneo da ${ab.name}.`);
        }
      },
      damageShred(user, target, ab) {
        applyDamage(target, ab.damage || 1, ab.name, { amplifiable:true });
        if (target.alive && (ab.shred || 0) > 0) {
          const loss = Math.min(target.currentDef, ab.shred || 1);
          target.currentDef -= loss;
          log(`${target.name} perde ${loss} DEF da ${ab.name}.`);
        }
      },
      areaHealInfantry(user, target, ab) {
        const allies = combatUnits(user.side).filter(u => u.type === "Fanteria" && u.currentHp < u.maxHp && hexDistance(u.pos, user.pos) <= (ab.range || 1));
        if (!allies.length) log(`${user.name} non trova fanterie ferite da curare.`);
        for (const ally of allies) {
          const before = ally.currentHp;
          ally.currentHp = Math.min(ally.maxHp, ally.currentHp + (ab.value || 1));
          const healed = ally.currentHp - before;
          if (healed > 0) log(`${ally.name} recupera ${healed} HP da ${ab.name}.`);
        }
      },
      agathoiPivotHeal(user, target, ab) {
        const structures = combatUnits(user.side).filter(u => u.faction === "Agathoi" && u.type === "Struttura");
        for (const s of structures) {
          const before = s.currentHp;
          s.currentHp = Math.min(s.maxHp, s.currentHp + 2);
          log(`${s.name} recupera ${s.currentHp - before} HP da ${ab.name}.`);
        }
        const adjacent = combatUnits(user.side).filter(u => u.uid !== user.uid && u.type !== "QG" && areAdjacent(u.pos, user.pos));
        for (const ally of adjacent) {
          const before = ally.currentHp;
          ally.currentHp = Math.min(ally.maxHp, ally.currentHp + 1);
          log(`${ally.name} recupera ${ally.currentHp - before} HP da ${ab.name}.`);
        }
      },
      agathoiShroud(user, target, ab) {
        if (!target || target.side !== user.side || target.type === "Struttura" || !isAdjacentToAgathoiStructure(target)) {
          log(`${ab.name} fallisce: il bersaglio deve essere una unità alleata non struttura adiacente a una struttura Agathoi.`);
          return;
        }
        applyStatus(target, { kind:"untargetable", turns:ab.turns || 1, owner:user.side, source:ab.name });
      },
      armorThorns(user, target, ab) {
        const before = target.currentDef;
        target.currentDef = Math.min(target.maxDef, target.currentDef + (ab.value || 1));
        log(`${target.name} ripristina ${target.currentDef - before} DEF da ${ab.name}.`);
        applyStatus(target, { kind:"thorns", value:ab.thorns || 1, turns:ab.turns || 1, source:ab.name });
      },

      buffDef(user, target, ab) {
        target.currentDef += ab.value || 1;
        target.buffs.push({ stat:"def", value:ab.value || 1, turns:1, source:ab.name });
        log(`${target.name} riceve +${ab.value || 1} DEF temporaneo da ${ab.name}.`);
      },
      abilityUntargetable(user, target, ab) {
        if (!target || target.side !== user.side || target.type !== "Struttura") {
          log(`${ab.name} fallisce: serve una struttura alleata valida.`);
          return;
        }
        applyStatus(target, { kind:"ability_untargetable", turns:ab.turns || 1, owner:user.side, source:ab.name });
      },
      placeMine(user, target, ab) {
        const coord = target && (target.coord || target.pos);
        if (!coord || getUnitAt(coord) || !isCellEnterable(coord)) { log(`${ab.name} fallisce: cella non libera o invalicabile.`); return; }
        state.mines = state.mines || [];
        state.mines.push({ owner:user.side, coord:[...coord], name:ab.name, infantryDamage:ab.infantryDamage || 1, vehicleDamage:ab.vehicleDamage || 3 });
        log(`${user.name} piazza una mina in [${coord.join(",")}].`);
      },
      spawnBlueprint(user, target, ab) {
        const bp = BLUEPRINTS.find(x => x.id === ab.spawnBlueprintId && x.faction === user.faction) || BLUEPRINTS.find(x => x.id === ab.spawnBlueprintId);
        if (!bp) { log(`${ab.name} fallisce: blueprint ${ab.spawnBlueprintId} non trovato.`); return; }
        if (purchaseLimitReached(user.side, bp)) { log(`${ab.name} salta: cap pieno per ${bp.name}.`); return; }
        const cells = neighbors(user.pos).filter(c => isCellEnterable(c) && !getUnitAt(c));
        if (!cells.length) { log(`${ab.name} salta: nessuna cella libera adiacente.`); return; }
        const unit = createUnitFromBlueprint(bp, user.side);
        unit.pos = [...cells[0]];
        if (typeof applyAgathoiSpawnDefBonus === "function") applyAgathoiSpawnDefBonus(unit);
        if (typeof applyC1fSpawnAdjacencyBonuses === "function") applyC1fSpawnAdjacencyBonuses(unit);
        unit.acted = true;
        state.units.push(unit);
        if (typeof triggerCellEffectsAt === "function") triggerCellEffectsAt(unit.pos, unit);
        log(`${user.name} crea ${unit.name} #${unit.instanceNo} in [${unit.pos.join(",")}]. Entra esausto.`);
        if (typeof triggerMinesAt === "function") triggerMinesAt(unit.pos, unit);
      },
      flameArea(user, target, ab) {
        if (!target || !target.alive) {
          log(`${ab.name} fallisce: bersaglio non valido.`);
          return;
        }
        const splash = combatUnits(enemyOf(user.side))
          .filter(e => e.uid !== target.uid && e.alive && areAdjacent(e.pos, target.pos))
          .filter(e => typeof isAbilityUntargetableTo !== "function" || !isAbilityUntargetableTo(e, user.side))
          .slice(0, 2);
        const targets = [target, ...splash];
        log(`${user.name} investe ${targets.map(t => t.name).join(", ")} con ${ab.name}.`);
        for (const t of targets) {
          if (t && t.alive) applyDamage(t, ab.value || 2, ab.name, { amplifiable:true, attacker:user });
        }
      },
      relocateAlly(user, target, ab) {
        if (!target || target.side !== user.side || target.type === "QG") return;
        const destRange = ab.destRange || 1;
        const origin = user.pos;
        let cells = [];
        for (const c of state.cells.map(x => x.coord)) {
          if (!isInsideMap(c) || !isCellEnterable(c) || getUnitAt(c)) continue;
          if (hexDistance(c, origin) <= destRange) cells.push(c);
        }
        if (!cells.length) { log(`${ab.name} fallisce: nessuna destinazione libera.`); return; }
        cells.sort((a,b) => hexDistance(a, target.pos) - hexDistance(b, target.pos));
        const old = [...target.pos];
        target.pos = [...cells[0]];
        target.movedThisTurn = true;
        log(`${user.name} sposta ${target.name} da [${old.join(",")}] a [${target.pos.join("," )}].`);
        if (typeof triggerMinesAt === "function") triggerMinesAt(target.pos, target);
        if (typeof triggerCellEffectsAt === "function") triggerCellEffectsAt(target.pos, target);
      },
      copyRandomEnemyHandCard(user, target, ab) {
        if (typeof copyRandomEnemyHandCard !== "function") return;
        copyRandomEnemyHandCard(user.side);
      },
      lockEnemyEnergy(user, target, ab) {
        const enemy = enemyOf(user.side);
        state.energyLocked[enemy] = Math.max(state.energyLocked[enemy] || 0, 1);
        log(`${playerName(enemy)} non potrà spendere ENE per 1 turno.`);
        if ((state.energy[enemy] || 0) === 0) {
          state.handLocked[enemy] = Math.max(state.handLocked[enemy] || 0, 1);
          log(`${playerName(enemy)} ha ENE 0: anche la mano viene bloccata per 1 turno.`);
        }
      },
      cleansePositive(user, target, ab) {
        removePositiveEffects(target, ab.name);
      },
      duplicateStructureAbility(user, target, ab) {
        if (!target || target.side !== user.side || target.type !== "Struttura" || !target.ability || target.ability.passive) {
          log(`${ab.name} fallisce: serve una struttura alleata con abilità attiva.`);
          return;
        }
        const copied = { ...target.ability, cost:0, cooldown:0, name:`Eco di ${target.ability.name}` };
        const handler = ABILITY_HANDLERS[copied.kind];
        if (!handler || !(copied.target === "self" || ["spawnBlueprint","incomeDelta","costDelta","deploymentDiscount"].includes(copied.kind))) {
          log(`${ab.name}: abilità ${target.ability.name} non duplicabile in C1f senza selezione bersaglio complessa.`);
          return;
        }
        log(`${user.name} duplica ${target.ability.name} di ${target.name}.`);
        handler(user, target, copied);
      },
      convertEnemy(user, target, ab) {
        convertEnemyUnit(user, target, ab);
      }
    });


    function c2finalc2CanStealDrawnCombatUnit(card) {
      if (!card || card.sourceType !== "unit" || !card.blueprintId) return false;
      const bp = typeof BLUEPRINTS !== "undefined" ? BLUEPRINTS.find(x => x && x.id === card.blueprintId) : null;
      if (!bp) return false;
      if (!(bp.type === "Fanteria" || bp.type === "Veicolo")) return false;
      if (bp.type === "Comandante" || bp.role === "commander" || bp.weight === "Pivot") return false;
      if (card.cardType === "commander" || card.deckRole === "commander" || card.deckRole === "pivot") return false;
      return true;
    }

    function c2finalc2StealDrawnCardToFabeot(toSide, fromSide, card, source) {
      if (!state || !state.hand || !state.hand[fromSide] || !state.hand[toSide]) return null;
      const idx = state.hand[fromSide].findIndex(c => c && c.cardUid === card.cardUid);
      if (idx < 0) return null;
      const [original] = state.hand[fromSide].splice(idx, 1);
      const moved = createCardInstance(original, toSide, "hand", state.hand[toSide].length);
      moved.stolenFrom = fromSide;
      moved.stolenSource = source;
      delete moved.c2c7aBlockedTurns;
      delete moved.c2c7aBlockedBy;
      delete moved.c2c7aBlockedSource;
      if (typeof handIsFullForDraw === "function" && handIsFullForDraw(toSide)) {
        moved.zone = "discard";
        moved.overdrawDiscarded = true;
        moved.overdrawSource = source;
        state.discard[toSide].push(moved);
        log(`${source}: ${playerName(toSide)} ruba ${moved.name}, ma la mano è piena: la carta va negli scarti Fabeot.`);
      } else {
        state.hand[toSide].push(moved);
        log(`${source}: ${playerName(toSide)} ruba ${moved.name} appena pescata da ${playerName(fromSide)}.`);
      }
      if (typeof syncCardDebugState === "function") syncCardDebugState();
      return moved;
    }

    function applyAgathoiRaduraAutoHeal(player) {
      if (!state || state.factions[player] !== "Agathoi") return;
      const radure = combatUnits(player).filter(u => u.alive && u.faction === "Agathoi" && u.name === "Radura Curativa" && u.type === "Struttura");
      for (const radura of radure) {
        const target = combatUnits(player)
          .filter(u => u.type === "Fanteria" && u.currentHp < u.maxHp && hexDistance(u.pos, radura.pos) <= 1)
          .sort((a,b) => (b.maxHp - b.currentHp) - (a.maxHp - a.currentHp) || effectiveLife(a) - effectiveLife(b))[0];
        if (!target) continue;
        const before = target.currentHp;
        target.currentHp = Math.min(target.maxHp, target.currentHp + 1);
        const healed = target.currentHp - before;
        if (healed > 0) {
          log(`${radura.name} cura ${target.name}: +${healed} HP a inizio turno.`);
        }
      }
    }



    function isFabeotMarkedBy(unit, side) {
      return Boolean((unit.statuses || []).some(st => st.owner === side && ["fabeot_bounty", "fabeot_vulnerable", "logistic_choke"].includes(st.kind)));
    }



    function conversionCapAllows(player, target) {
      if (target.type === "Struttura" || target.type === "Comandante" || target.weight === "Pivot") return false;
      if (target.cost > 3) return false;
      if (countsAsLightCap(target)) return lightBucketCount(player, target) < lightFieldLimit(player);
      if (String(target.weight || "").toLowerCase().startsWith("pesant")) {
        const sameClass = combatUnits(player).filter(u => u.type === target.type && String(u.weight || "").toLowerCase().startsWith("pesant")).length;
        return sameClass < HEAVY_FIELD_LIMIT;
      }
      if (target.weight === "Elite") return combatUnits(player).filter(u => u.weight === "Elite").length < ELITE_FIELD_LIMIT;
      return true;
    }



    function canConvertEnemy(user, target) {
      return Boolean(user && target && target.side !== user.side && target.type !== "Struttura" && target.type !== "Comandante" && target.weight !== "Pivot" && target.cost <= 3 && target.currentHp <= 2 && isFabeotMarkedBy(target, user.side) && conversionCapAllows(user.side, target));
    }



    function canCorruptLightInfantry(user, target) {
      return Boolean(user && target && target.side !== user.side && target.type === "Fanteria" && String(target.weight || "").toLowerCase().startsWith("legger") && target.type !== "Comandante" && target.weight !== "Pivot" && conversionCapAllows(user.side, target));
    }



    function performFabeotConversion(user, target, ab, label="acquisito") {
      const oldSide = target.side;
      const oldFaction = target.faction;
      target.side = user.side;
      target.faction = user.faction;
      target.acted = true;
      target.movedThisTurn = true;
      target.abilityUsedThisTurn = true;
      target.attacksMade = target.attacksPerTurn || 1;
      target.statuses = (target.statuses || []).filter(st => !["fabeot_bounty", "fabeot_vulnerable", "logistic_choke", "raid_mark"].includes(st.kind));
      applyStatus(target, { kind:"inhibit_action", turns:1, source:ab.name });
      updateControlFromOccupants();
      log(`${target.name} (${oldFaction} G${oldSide}) viene ${label} da ${playerName(user.side)} e passa sotto controllo Fabeot. Entra esausto.`);
    }



    function convertEnemyUnit(user, target, ab) {
      if (!canConvertEnemy(user, target)) {
        log(`${ab.name} fallisce: ${target ? target.name : "bersaglio"} non rispetta le clausole di acquisizione.`);
        return;
      }
      performFabeotConversion(user, target, ab, "acquisito");
    }



    function corruptLightInfantryUnit(user, target, ab) {
      if (!canCorruptLightInfantry(user, target)) {
        log(`${ab.name} fallisce: ${target ? target.name : "bersaglio"} non è una fanteria leggera convertibile o violerebbe i cap.`);
        return;
      }
      performFabeotConversion(user, target, ab, "corrotto");
    }



    function bestDeceptivePositioningVictim(user) {
      return combatUnits(enemyOf(user.side))
        .filter(e => areAdjacent(user.pos, e.pos) && e.currentDef > 0 && !isUntargetableTo(e, user.side))
        .map(e => ({ unit:e, score:(e.currentDef * 3) + effectiveLife(e) + (isOnPS(e) ? 2 : 0) + (e.type === "Comandante" ? 2 : 0) }))
        .sort((a,b) => b.score - a.score)[0]?.unit || null;
    }




    function removePositiveEffects(target, source="Cleansing") {
      if (!target) return;
      let removed = 0;
      for (const buff of target.buffs || []) {
        if (buff.stat === "att") target.currentAtt = Math.max(0, target.currentAtt - (buff.value || 0));
        if (buff.stat === "def") target.currentDef = Math.max(0, target.currentDef - (buff.value || 0));
        removed += 1;
      }
      target.buffs = [];
      const positive = new Set(["thorns","untargetable","phase_shield","ability_untargetable","ambush","counterattack","extra_attack_on_kill","stealth","enemy_effect_immune"]);
      const before = (target.statuses || []).length;
      target.statuses = (target.statuses || []).filter(st => !positive.has(st.kind));
      removed += before - target.statuses.length;
      log(`${source}: rimossi ${removed} buff/effetti positivi da ${target.name}.`);
    }

    function isAbilityUntargetableTo(target, attackerSide) {
      if (!target || target.side === attackerSide) return false;
      if (hasStatus(target, "enemy_effect_immune")) return true;
      if (hasStatus(target, "untargetable") || hasStatus(target, "ability_untargetable")) return true;
      if (target.abilityUntargetableAdjacentStructure && isAdjacentToAgathoiStructure(target)) return true;
      return false;
    }

    function abilityDamageValue(ab, target) {
      if (target && target.type === "Veicolo" && typeof ab.vehicleValue === "number") return ab.vehicleValue;
      if (target && target.type === "Struttura" && typeof ab.structureValue === "number") return ab.structureValue;
      return ab.value;
    }



    function isAdjacentToAgathoiStructure(unit) {
      return Boolean(unit && unit.pos && combatUnits(unit.side).some(s => s.faction === "Agathoi" && s.type === "Struttura" && s.uid !== unit.uid && areAdjacent(s.pos, unit.pos)));
    }



    function sideHasVisionOnTarget(observerSide, target) {
      if (!target || !Array.isArray(target.pos) || !observerSide) return false;
      return combatUnits(observerSide).some(unit => {
        if (!unit || !Array.isArray(unit.pos)) return false;
        const tags = Array.isArray(unit.tags) ? unit.tags : [];
        const hasVisionTag = tags.includes("vision") || (unit.ability && unit.ability.tag === "vision");
        if (!hasVisionTag) return false;
        const range = unit.ability && Number.isFinite(unit.ability.range) ? unit.ability.range : 2;
        return hexDistance(unit.pos, target.pos) <= range;
      });
    }



    function isUntargetableTo(target, attackerSide) {
      if (!target || target.side === attackerSide) return false;
      if (hasStatus(target, "untargetable") || hasStatus(target, "phase_shield")) return true;
      if (hasStatus(target, "stealth") && !sideHasVisionOnTarget(attackerSide, target)) return true;
      return false;
    }



    function targetLabel(target) {
      if (!target) return "bersaglio";
      if (target.name) return target.name;
      const coord = target.coord || target.pos;
      if (coord) return `PS [${coord.join(",")}]`;
      return "bersaglio";
    }



    function abilityLogTarget(user, target, ab) {
      if (!user || !ab) return targetLabel(target);
      if (ab.affects === "enemy") return playerName(enemyOf(user.side));
      if (ab.affects === "self") return playerName(user.side);
      return targetLabel(target);
    }



    function useAbility(user, target, ab) {
      if (!canUseAbility(user, ab) || !target || target.type === "QG") return;
      if (target.side && target.side !== user.side && hasStatus(target, "enemy_effect_immune")) { log(`${target.name} ignora ${ab.name}: immune a effetti nemici.`); return; }
      const handler = ABILITY_HANDLERS[ab.kind];
      if (!handler) {
        log(`⚠️ Abilità ${ab.name} non gestita dal motore v1.8.8 (${ab.kind}).`);
        return;
      }
      const cost = typeof effectiveAbilityCost === "function" ? effectiveAbilityCost(user.side, ab) : (ab.cost || 0);
      if (typeof revealStealth === "function") revealStealth(user, `usa abilità ${ab.name || ab.kind}`);
      const displayedTarget = abilityLogTarget(user, target, ab);
      if (cost > 0) state.energy[user.side] -= cost;
      log(`${user.name} usa ${ab.name} su ${displayedTarget}${cost ? ` (${cost} ENE)` : ""}.`, EventTypes.ABILITY_USED, {
        player: user.side,
        faction: state.factions[user.side],
        unitId: user.uid,
        unitName: user.name,
        abilityName: ab.name,
        abilityKind: ab.kind,
        targetId: target.uid || null,
        targetName: displayedTarget,
        rawTargetName: targetLabel(target),
        cost,
        baseCost: ab.cost || 0
      });
      handler(user, target, ab);
      if (ab.economyLock && user.faction === "Fabeot" && state.fabeotEconomyAbilityUsed) state.fabeotEconomyAbilityUsed[user.side] = true;
      if (ab.conversionLock && user.faction === "Fabeot" && state.fabeotConversionUsed) state.fabeotConversionUsed[user.side] = true;
      user.cooldownLeft = ab.cooldown || 0;
      user.abilityUsedThisTurn = true;
    }



    function vehicleHasFollowupAfterAbility(unit) {
      return unit && unit.type === "Veicolo" && canAttack(unit) && adjacentAttackTargets(unit).length > 0;
    }



    function shouldEndAfterAbility(unit) {
      if (unit && unit.c2finalc2ReadyAfterAbility) {
        unit.c2finalc2ReadyAfterAbility = false;
        return false;
      }
      return !vehicleHasFollowupAfterAbility(unit);
    }



    function abilityTargets(unit, ab) {
      if (!ab || !canUseAbility(unit, ab)) return [];
      if (ab.target === "cell_ps" || ab.kind === "psLock") {
        return state.cells.filter(c => c.ps && !isPsLocked(c.coord) && hexDistance(unit.pos, c.coord) <= (ab.range || 0))
          .map(c => ({ ...c, pos:c.coord, type:"PS", name:`Punto Strategico [${c.coord.join(",")}]` }));
      }
      if (ab.target === "cell_empty") {
        return state.cells.filter(c => hexDistance(unit.pos, c.coord) <= (ab.range || 0) && !getUnitAt(c.coord))
          .map(c => ({ ...c, pos:c.coord, type:"Cella", name:`Cella libera [${c.coord.join(",")}]` }));
      }
      if (ab.target === "self") return [unit];
      const candidates = ab.target === "ally" ? combatUnits(unit.side) : combatUnits(enemyOf(unit.side));
      return candidates.filter(t => {
        if (t.type === "QG") return false;
        if (ab.kind === "nexusPsPresidium") return t.side === unit.side && t.faction === "Nexus" && hexDistance(unit.pos, t.pos) <= (ab.range || 0) && state.cells.some(c => c.ps && t.pos && hexDistance(t.pos, c.coord) <= 1);
        if (ab.kind === "enhancedSuperiority") return t.side === unit.side && t.faction === "Liberti" && t.type !== "Struttura" && t.type !== "QG" && hexDistance(unit.pos, t.pos) <= (ab.range || 0);
        if (ab.kind === "agoraOrders") return t.side === unit.side && t.faction === "Agathoi" && (t.type === "Fanteria" || t.uid === unit.uid) && hexDistance(unit.pos, t.pos) <= (ab.range || 0);
        if (ab.target !== "ally" && isAbilityUntargetableTo(t, unit.side)) return false;
        if (t.uid === unit.uid && ab.target !== "ally") return false;
        if (ab.kind === "agathoiShroud") return t.side === unit.side && t.type !== "Struttura" && isAdjacentToAgathoiStructure(t);
        if (hexDistance(unit.pos, t.pos) > ab.range) return false;
        if (ab.filter && ab.filter !== "Any" && t.type !== ab.filter) return false;
        if (ab.kind === "heal" && t.currentHp >= t.maxHp) return false;
        if (ab.kind === "armor" && t.currentDef >= t.maxDef) return false;
        if (ab.kind === "armorThorns" && t.currentDef >= t.maxDef && hasStatus(t, "thorns")) return false;
        if (ab.kind === "shred" && t.currentDef <= 0) return false;
        if (ab.kind === "swapAlly" && (t.uid === unit.uid || t.type === "Struttura")) return false;
        if (ab.kind === "deceptivePositioning" && (t.uid === unit.uid || t.type === "Struttura")) return false;
        if (ab.kind === "convertEnemy" && !canConvertEnemy(unit, t)) return false;
        if (ab.kind === "corruptLightInfantry" && !canCorruptLightInfantry(unit, t)) return false;
        return true;
      });
    }

