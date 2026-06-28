"use strict";

// Arena Rubra – Fase B6b
// Economy helpers extraction prudente.
// Questo file contiene helper economici, effetti economici,
// income/dottrine, costi effettivi, sconti deployment,
// limiti di campo/acquisto e cap leggere.
// Contiene anche la risoluzione economica di inizio turno e il tick effetti giocatore.

// Dipendenze globali accettate in questa fase:
// - state.js: state, $
// - rules.js: countControlledPS, combatUnits, enemyOf, getHq
// - main.js/pace future: currentPace
// - render/events: log


    function capBonusFromUnits(player, group) {
      if (!state) return 0;
      return combatUnits(player).reduce((sum, u) => sum + (u.capBonus && u.capBonus.group === group ? (u.capBonus.value || 0) : 0), 0);
    }

    function lightFieldLimit(player, type=null) {
      const pace = currentPace();
      const faction = state && state.factions ? state.factions[player] : null;
      const base = (pace.lightCapByFaction && faction && pace.lightCapByFaction[faction]) || pace.lightCapDefault || LIGHT_FIELD_LIMIT;
      const vehicleBonus = type === "Veicolo" ? capBonusFromUnits(player, "light_vehicle") : 0;
      return base + vehicleBonus;
    }

    function structureFieldLimit(player=null) {
      const side = player || (state && state.currentPlayer) || 1;
      const faction = state && state.factions ? state.factions[side] : null;
      // C2e-3: cap strutture esplicito. Generale 6, Agathoi 7.
      // Il precedente capBonus struttura non alza oltre questi valori nello Starter Game.
      return faction === "Agathoi" ? AGATHOI_STRUCTURE_FIELD_LIMIT : STRUCTURE_FIELD_LIMIT;
    }



    function agathoiStructureCount(player) {
      return combatUnits(player).filter(u => u.faction === "Agathoi" && u.type === "Struttura").length;
    }



    function agathoiStructureIncomeBonus(player) {
      return Math.max(0, Math.min(3, agathoiStructureCount(player) - 1));
    }



    function c2c6bEnsureEconomyState() {
      if (!state) return null;
      if (!state.c2c6b) state.c2c6b = {};
      if (!state.c2c6b.enemyDestroyedThisTurn) state.c2c6b.enemyDestroyedThisTurn = { 1:0, 2:0 };
      for (const side of [1,2]) {
        if (!Number.isFinite(state.c2c6b.enemyDestroyedThisTurn[side])) state.c2c6b.enemyDestroyedThisTurn[side] = 0;
      }
      return state.c2c6b;
    }

    function c2c6bResetEnemyDestroyedThisTurn(player) {
      const data = c2c6bEnsureEconomyState();
      if (data) data.enemyDestroyedThisTurn[player] = 0;
    }

    function c2c6bEnemyDestroyedThisTurn(player) {
      const data = c2c6bEnsureEconomyState();
      return data ? (data.enemyDestroyedThisTurn[player] || 0) : 0;
    }

    function c2c6bRecordUnitDestroyed(unit, attacker=null, source="danno", options={}) {
      if (!state || !unit || !unit.side) return;
      const data = c2c6bEnsureEconomyState();
      const current = state.currentPlayer;
      if (data && current && unit.side !== current && unit.type !== "QG") {
        data.enemyDestroyedThisTurn[current] = (data.enemyDestroyedThisTurn[current] || 0) + 1;
      }

      // FABTAC05 – Taglia sulla Testa: se il bersaglio muore durante il turno
      // del Fabeot che ha posto la taglia, aggiunge una copia base pulita in mano.
      if (typeof getStatus === "function") {
        const copyBounty = getStatus(unit, "fabeot_copy_bounty");
        if (copyBounty && copyBounty.owner && state.currentPlayer === copyBounty.owner && typeof addBlueprintCardToHand === "function") {
          const created = addBlueprintCardToHand(copyBounty.owner, unit.id, unit.faction, copyBounty.source || "Taglia sulla Testa");
          if (created) {
            log(`${copyBounty.source || "Taglia sulla Testa"}: ${playerName(copyBounty.owner)} aggiunge alla mano una copia pulita di ${unit.name}.`, EventTypes.LOG_MESSAGE, {
              player: copyBounty.owner,
              faction: state.factions && state.factions[copyBounty.owner],
              destroyedId: unit.uid,
              destroyedName: unit.name,
              blueprintId: unit.id,
              createdCardUid: created.cardUid,
              source: "C2c-7a-bounty-copy-on-death"
            });
          }
        }
      }

      // FABTAC08 – Contratto da Sicario: il bersaglio marchiato paga ENE al Fabeot
      // quando uccide con attacco base proprio.
      if (options && options.baseAttack && attacker && typeof getStatus === "function") {
        const contract = getStatus(attacker, "fabeot_sicario_contract");
        if (contract && contract.owner && state.energy && state.energy[contract.owner] !== undefined) {
          const gain = contract.value || 1;
          state.energy[contract.owner] += gain;
          log(`Contratto da Sicario: ${playerName(contract.owner)} guadagna +${gain} ENE perché ${attacker.name} ha terminato ${unit.name}.`, EventTypes.ECONOMY_CHANGED, {
            player: contract.owner,
            faction: state.factions && state.factions[contract.owner],
            gain,
            killerId: attacker.uid,
            killerName: attacker.name,
            destroyedId: unit.uid,
            destroyedName: unit.name,
            source: "C2c-6b-sicario-contract"
          });
        }
      }
    }

    function c2c6bSeededIncomeBonus(player) {
      if (typeof hasStatus !== "function") return 0;
      return combatUnits(player).filter(u => u && u.alive && u.type === "Struttura" && hasStatus(u, "agathoi_income_seed")).length;
    }



    function economicEffectsSummary(player) {
      const effects = (state && state.playerEffects && state.playerEffects[player] || []);
      if (!effects.length) return "nessuno";
      return effects.map(e => {
        const sign = (e.value || 0) > 0 ? "+" : "";
        if (e.kind === "cost_delta") return `${e.source}: costo ${sign}${e.value} (${e.turns || 1})`;
        if (e.kind === "deploy_discount") return `${e.source}: prossimo sbarco ${sign}${e.value}`;
        if (e.kind === "hand_deploy_discount") return `${e.source}: prossima unità dalla mano ${sign}${e.value}`;
        if (e.kind === "income_delta") return `${e.source}: income ${sign}${e.value}`;
        if (e.kind === "ability_cost_tax") return `${e.source}: abilità non gratuite ${sign}${e.value} ENE`;
        return `${e.source || e.kind}`;
      }).join("; ");
    }



    function fieldUnitsByBlueprint(player, bp) {
      return combatUnits(player).filter(u => u.id === bp.id);
    }



    function activeBlueprintCount(player, bp) {
      return fieldUnitsByBlueprint(player, bp).length;
    }



    function activeStructureCount(player) {
      return combatUnits(player).filter(u => u.type === "Struttura").length;
    }



    function activeCommanderCount(player) {
      return combatUnits(player).filter(u => u.type === "Comandante").length;
    }



    function isLight(bp) {
      return bp && String(bp.weight || "").toLowerCase().startsWith("legger");
    }



    function countsAsLightCap(obj) {
      // v1.8.11: il cap “unità leggere” riguarda solo unità combattenti leggere.
      // Le strutture leggere Agathoi hanno un cap separato da edifici e non devono gonfiare il conteggio leggere.
      return Boolean(obj && isLight(obj) && obj.type !== "Struttura" && obj.type !== "QG");
    }



    function activeLightCount(player) {
      return combatUnits(player).filter(u => countsAsLightCap(u)).length;
    }



    function activeLightCountByType(player, type) {
      return combatUnits(player).filter(u => countsAsLightCap(u) && u.type === type).length;
    }



    

    function lightBucketCount(player, obj) {
      return activeLightCountByType(player, obj && obj.type);
    }
function fieldLimitFor(bp, player=null) {
      if (bp.type === "Comandante") return COMMANDER_FIELD_LIMIT;
      if (bp.weight === "Pivot") return PIVOT_FIELD_LIMIT;
      if (bp.weight === "Elite") return ELITE_FIELD_LIMIT;
      if (bp.type === "Struttura") return structureFieldLimit(player || state.currentPlayer || 1);
      if (String(bp.weight || "").toLowerCase().startsWith("pesant")) return HEAVY_FIELD_LIMIT;
      if (countsAsLightCap(bp)) return lightFieldLimit(player || state.currentPlayer || 1, bp.type);
      return Infinity;
    }



    function purchaseLimitReached(player, bp) {
      if (!bp) return true;
      if (bp.type === "Comandante") return activeCommanderCount(player) >= COMMANDER_FIELD_LIMIT;
      if (bp.weight === "Pivot") return activeBlueprintCount(player, bp) >= PIVOT_FIELD_LIMIT;
      if (bp.weight === "Elite") return activeBlueprintCount(player, bp) >= ELITE_FIELD_LIMIT;
      if (bp.type === "Struttura") return activeStructureCount(player) >= structureFieldLimit(player);
      if (countsAsLightCap(bp)) return lightBucketCount(player, bp) >= lightFieldLimit(player, bp.type);
      const limit = fieldLimitFor(bp, player);
      return Number.isFinite(limit) && activeBlueprintCount(player, bp) >= limit;
    }



    function limitLabel(player, bp) {
      if (!bp) return "—";
      if (bp.type === "Comandante") return `${activeCommanderCount(player)}/${COMMANDER_FIELD_LIMIT} comandante`;
      if (bp.weight === "Pivot") return `${activeBlueprintCount(player, bp)}/${PIVOT_FIELD_LIMIT} pivot`;
      if (bp.weight === "Elite") return `${activeBlueprintCount(player, bp)}/${ELITE_FIELD_LIMIT} elite`;
      if (bp.type === "Struttura") return `${activeStructureCount(player)}/${structureFieldLimit(player)} edifici`;
      if (countsAsLightCap(bp)) return `${lightBucketCount(player, bp)}/${lightFieldLimit(player, bp.type)} ${String(bp.type || "unità").toLowerCase()} leggere campo`;
      const limit = fieldLimitFor(bp, player);
      if (!Number.isFinite(limit)) return "∞";
      const count = activeBlueprintCount(player, bp);
      return `${count}/${limit} campo`;
    }



    function limitReason(player, bp) {
      if (bp.type === "Comandante") return "Comandante già in campo";
      if (bp.weight === "Pivot") return "Pivot già in campo";
      if (bp.weight === "Elite") return "Elite già in campo";
      if (bp.type === "Struttura") return `Limite edifici raggiunto (${structureFieldLimit(player)})`;
      if (countsAsLightCap(bp)) return `Limite ${String(bp.type || "unità").toLowerCase()} leggere raggiunto (${lightFieldLimit(player, bp.type)})`;
      if (String(bp.weight || "").toLowerCase().startsWith("pesant")) return "Limite pesanti raggiunto";
      return "Limite unità raggiunto";
    }



    function addPlayerEffect(player, effect) {
      if (!state || !state.playerEffects || !state.playerEffects[player]) return;
      const existing = state.playerEffects[player].find(e => e.kind === effect.kind && e.source === effect.source && e.filterSpec === effect.filterSpec);
      if (existing) {
        existing.value = effect.value;
        existing.turns = Math.max(existing.turns || 0, effect.turns || 1);
        existing.timing = effect.timing || existing.timing;
        existing.minCost = effect.minCost ?? existing.minCost;
        existing.minIncome = effect.minIncome ?? existing.minIncome;
      } else {
        state.playerEffects[player].push({ ...effect });
      }
      const sign = (effect.value || 0) > 0 ? "+" : "";
      const targetName = playerName(player);
      if (effect.kind === "cost_delta") log(`${targetName} riceve effetto economico: costo unità ${sign}${effect.value} ENE (${effect.turns || 1} turno/i).`);
      else if (effect.kind === "deploy_discount") log(`${targetName} riceve effetto economico: prossima unità non struttura ${sign}${effect.value} ENE questo turno.`);
      else if (effect.kind === "hand_deploy_discount") log(`${targetName} riceve effetto economico: prossima unità dalla mano ${sign}${effect.value} ENE, minimo ${effect.minCost ?? 1}.`);
      else if (effect.kind === "income_delta") log(`${targetName} riceve effetto economico: guadagno ENE ${sign}${effect.value} al prossimo income.`);
      else if (effect.kind === "ability_cost_tax") log(`${targetName} riceve effetto economico: abilità non gratuite ${sign}${effect.value} ENE (${effect.turns || 1} turno/i).`);
      else log(`${targetName} riceve effetto economico: ${effect.source || effect.kind}.`);
    }



    function affectedPlayerForAbility(user, target, ab) {
      if (ab.affects === "enemy") return enemyOf(user.side);
      if (ab.affects === "target" && target && target.side) return target.side;
      return user.side;
    }



    function activeEconomicEffect(player, kind, source) {
      return (state && state.playerEffects && state.playerEffects[player] || []).find(e => e.kind === kind && (!source || e.source === source));
    }


    function playerAbilityCostTax(player, ab=null) {
      if (!ab || (ab.cost || 0) <= 0) return 0;
      return (state && state.playerEffects && state.playerEffects[player] || [])
        .filter(e => e.kind === "ability_cost_tax")
        .reduce((sum, e) => sum + (e.value || 0), 0);
    }

    function effectiveAbilityCost(player, ab=null) {
      if (!ab) return 0;
      const base = ab.cost || 0;
      if (base <= 0) return 0;
      return Math.max(0, base + playerAbilityCostTax(player, ab));
    }



    function effectiveIncomeGain(player, ps=countControlledPS(player)) {
      const effects = (state && state.playerEffects && state.playerEffects[player] || []).filter(e => e.kind === "income_delta");
      const effectDelta = effects.reduce((sum, e) => sum + (e.value || 0), 0);
      const minIncome = effects.reduce((min, e) => Math.max(min, e.minIncome || 0), 0);
      const doctrine = factionDoctrineIncome(player, ps);
      const doctrineDelta = doctrine.value || 0;
      const seedBonus = c2c6bSeededIncomeBonus(player);
      const structureBonus = state && state.factions && state.factions[player] === "Agathoi" ? agathoiStructureIncomeBonus(player) : 0;
      const territoryIncome = state && state.factions && state.factions[player] === "Agathoi" ? Math.max(ps, structureBonus) : ps;
      const sourceText = state && state.factions && state.factions[player] === "Agathoi"
        ? (structureBonus > ps ? `${agathoiStructureCount(player)} strutture = +${structureBonus}` : `${ps} PS`)
        : `${ps} PS`;
      const base = BASE_INCOME + territoryIncome;
      return {
        base,
        ps,
        structureBonus,
        territoryIncome,
        sourceText,
        effectDelta,
        seedBonus,
        doctrineDelta,
        doctrineLabel: doctrine.label || "nessuna",
        delta: effectDelta + seedBonus + doctrineDelta,
        total: Math.max(minIncome, base + effectDelta + seedBonus + doctrineDelta)
      };
    }



    function factionDoctrineIncome(player, ps=countControlledPS(player)) {
      if (!state || !state.factions) return { value:0, label:"nessuna" };
      const faction = state.factions[player];
      const enemy = enemyOf(player);
      if (faction === "Nexus") {
        const eneLead = (state.energy[player] || 0) - (state.energy[enemy] || 0);
        if (ps >= 2 && eneLead < 5) return { value:1, label:"Nexus · Rete PS" };
        if (ps >= 2 && eneLead >= 5) return { value:0, label:"Nexus · vantaggio ENE eccessivo" };
      }
      if (faction === "Exordium") {
        const infantry = combatUnits(player).filter(u => u.type === "Fanteria").length;
        const vehicles = combatUnits(player).filter(u => u.type === "Veicolo").length;
        if (infantry > 0 && vehicles > 0 && infantry === vehicles) return { value:1, label:"Exordium · assetto combinato" };
      }
      if (faction === "Liberti") {
        const enemyHq = getHq(enemy);
        const hasAtLeastOnePs = countControlledPS(player) >= 1;
        const threatening = enemyHq && combatUnits(player).some(u => u.type !== "Struttura" && hexDistance(u.pos, enemyHq.pos) <= 5);
        if (hasAtLeastOnePs && threatening) return { value:1, label:"Liberti · pressione sul QG + PS" };
      }
      if (faction === "Agathoi") {
        const v = Math.min(3, state.pressure[enemy] || 0);
        if (v > 0) return { value:v, label:`Agathoi · resilienza (${v})` };
      }
      if (faction === "Fabeot") {
        if ((state.energy[enemy] || 0) === 0) return { value:1, label:"Fabeot · nemico a secco" };
      }
      return { value:0, label:"nessuna" };
    }



    function c1fPlacementCostModifier(player, bp, coord=null) {
      if (!bp || !bp.costAdjacencyVehicle) return { value:0, minCost:0 };
      if (!coord) return { value:bp.costAdjacencyVehicle.value || 0, minCost:bp.costAdjacencyVehicle.minCost || 1, optimistic:true };
      const adjacentVehicle = combatUnits(player).some(u => u.type === "Veicolo" && areAdjacent(u.pos, coord));
      return adjacentVehicle ? { value:bp.costAdjacencyVehicle.value || -1, minCost:bp.costAdjacencyVehicle.minCost || 1 } : { value:0, minCost:0 };
    }

    function effectiveBlueprintCost(player, bp, coord=null) {
      if (!bp) return Infinity;
      const modifiers = playerCostModifiers(player, bp);
      const placement = c1fPlacementCostModifier(player, bp, coord);
      const delta = modifiers.reduce((sum, mod) => sum + (mod.value || 0), 0) + (placement.value || 0);
      const minCost = Math.max(modifiers.reduce((min, mod) => Math.max(min, mod.minCost || 0), 0), placement.minCost || 0);
      return Math.max(minCost, bp.cost + delta);
    }



    function playerCostModifiers(player, bp) {
      return (state && state.playerEffects && state.playerEffects[player] || [])
        .filter(effect => (effect.kind === "cost_delta" || effect.kind === "deploy_discount") && matchesEconomyFilter(effect, bp))
        .map(effect => ({ value:effect.value || 0, minCost:effect.minCost || 0, source:effect.source || "effetto" }));
    }



    function playerHandUnitCostModifiers(player, bp) {
      return (state && state.playerEffects && state.playerEffects[player] || [])
        .filter(effect => effect.kind === "hand_deploy_discount" && matchesEconomyFilter(effect, bp))
        .map(effect => ({ value:effect.value || 0, minCost:effect.minCost || 0, source:effect.source || "effetto mano" }));
    }

    function matchesEconomyFilter(effect, bp) {
      if (!effect) return true;
      if (typeof effect.filter === "function") return effect.filter(bp);
      const spec = effect.filterSpec || "all";
      if (spec === "all") return true;
      if (spec === "nonStructure") return bp.type !== "Struttura";
      if (spec === "unitOnly") return bp.type !== "Struttura" && bp.type !== "Comandante";
      if (spec === "light") return isLight(bp);
      if (spec === "heavy") return String(bp.weight || "").toLowerCase().startsWith("pesant");
      if (spec === "vehicle") return bp.type === "Veicolo";
      if (spec === "infantry") return bp.type === "Fanteria";
      if (spec === "nexusHandUnit") return bp.faction === "Nexus" && bp.type !== "Struttura";
      return true;
    }



    function consumeDeploymentDiscount(player, bp) {
      if (!bp || bp.type === "Struttura") return;
      const effects = state.playerEffects[player] || [];
      const idx = effects.findIndex(e => e.kind === "deploy_discount" && matchesEconomyFilter(e, bp));
      if (idx >= 0) {
        const used = effects.splice(idx, 1)[0];
        log(`${used.source || "Sconto"} consumato: ${bp.name} ha ricevuto lo sconto di sbarco.`);
      }
    }





    function consumeHandDeploymentDiscount(player, bp) {
      if (!bp) return;
      const effects = state.playerEffects[player] || [];
      const idx = effects.findIndex(e => e.kind === "hand_deploy_discount" && matchesEconomyFilter(e, bp));
      if (idx >= 0) {
        const used = effects.splice(idx, 1)[0];
        log(`${used.source || "Sconto mano"} consumato: ${bp.name} ha ricevuto lo sconto dalla mano.`);
      }
    }

    function playerEnergyLocked(player) { return Boolean(state && state.energyLocked && (state.energyLocked[player] || 0) > 0); }
    function playerHandLocked(player) { return Boolean(state && state.handLocked && (state.handLocked[player] || 0) > 0); }

    function canAffordBlueprint(player, bp) {
      if (playerEnergyLocked(player)) return false;
      return state.energy[player] >= effectiveBlueprintCost(player, bp);
    }



    function commanderUses(player, bp) {
      if (!bp || bp.type !== "Comandante") return 0;
      return activeCommanderCount(player);
    }



    function commanderLimitReached(player, bp) {
      return bp && bp.type === "Comandante" && activeCommanderCount(player) >= COMMANDER_FIELD_LIMIT;
    }




// =====================================================
// B6b – Turn economy
// =====================================================

function resetTurnEconomyFlags(player) {
  if (typeof c2c6bResetEnemyDestroyedThisTurn === "function") c2c6bResetEnemyDestroyedThisTurn(player);
  if (state.fabeotEconomyAbilityUsed) state.fabeotEconomyAbilityUsed[player] = false;
  if (state.fabeotConversionUsed) state.fabeotConversionUsed[player] = false;
}

function resolveStartTurnIncome(player, first=false) {
  if (state.turnsStarted[player] > 0) {
    const ps = countControlledPS(player);
    const gainInfo = effectiveIncomeGain(player, ps);
    const gain = gainInfo.total;
    state.energy[player] += gain;

    const modParts = [];
    if (gainInfo.effectDelta) modParts.push(`${gainInfo.effectDelta > 0 ? "+" : ""}${gainInfo.effectDelta} effetti economici`);
    if (gainInfo.seedBonus) modParts.push(`+${gainInfo.seedBonus} Seme della Ricchezza`);
    if (gainInfo.doctrineDelta) modParts.push(`${gainInfo.doctrineDelta > 0 ? "+" : ""}${gainInfo.doctrineDelta} dottrina: ${gainInfo.doctrineLabel}`);
    const modText = modParts.length ? `, ${modParts.join(", ")}` : "";

    log(`${playerName(player)} guadagna ${gain} ENE (${BASE_INCOME} base + ${gainInfo.sourceText || `${ps} PS`}${modText}). Totale: ${state.energy[player]}.`, EventTypes.ECONOMY_CHANGED, {
      player,
      faction: state.factions[player],
      gain,
      baseIncome: BASE_INCOME,
      ps,
      effectDelta: gainInfo.effectDelta || 0,
      seedBonus: gainInfo.seedBonus || 0,
      doctrineDelta: gainInfo.doctrineDelta || 0,
      totalEnergy: state.energy[player],
      round: state.turn
    });

    tickPlayerEffects(player, "afterIncome");
  } else if (!first) {
    log(`${playerName(player)} usa l'ENE iniziale: ${state.energy[player]}.`, EventTypes.ECONOMY_CHANGED, {
      player,
      faction: state.factions[player],
      initialEnergy: state.energy[player],
      round: state.turn
    });
  }
}

function tickPlayerEffects(player, timing) {
      const next = [];
      for (const effect of state.playerEffects[player] || []) {
        if (effect.timing === timing) effect.turns = Math.max(0, (effect.turns || 1) - 1);
        if ((effect.turns || 0) > 0) next.push(effect);
      }
      state.playerEffects[player] = next;
    }



// =====================================================
// C1f – player-level locks
// =====================================================
function tickPlayerLocksAtEnd(player) {
  if (state.energyLocked && (state.energyLocked[player] || 0) > 0) {
    state.energyLocked[player] = Math.max(0, state.energyLocked[player] - 1);
    if (state.energyLocked[player] === 0) log(`${playerName(player)} può di nuovo spendere ENE.`);
  }
  if (state.handLocked && (state.handLocked[player] || 0) > 0) {
    state.handLocked[player] = Math.max(0, state.handLocked[player] - 1);
    if (state.handLocked[player] === 0) log(`${playerName(player)} può di nuovo giocare carte dalla mano.`);
  }
}
