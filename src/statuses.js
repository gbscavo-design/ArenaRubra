"use strict";

// Arena Rubra – Fase B5b
// Status extraction prudente.
// Questo file contiene definizioni status, lettura/applicazione stati,
// blocchi azione/movimento/attacco/abilità, tick/durate e cooldown/buff.
// Non contiene AI, economia, abilità o rendering.

// Dipendenze globali accettate in questa fase:
// - combat.js: applyDamage
// - rules.js: combatUnits
// - render/events: log, EventTypes
// - state.js: state

const STATUS_DEFINITIONS = Object.freeze({
      bleed: {
        label: "Sanguinamento",
        timing: "startTurn",
        stack: "refresh",
        directHp: true,
        blocks: {},
        tick(unit, status) {
          applyDamage(unit, status.value, this.label, { status:true, directHp:true });
          status.turns -= 1;
          return status.turns > 0 && unit.alive;
        }
      },
      inhibit_action: {
        label: "Inibizione Azione",
        timing: "endTurn",
        stack: "refresh",
        blocks: { act:true, move:true, attack:true, ability:true },
        description: "Non può muovere, attaccare o usare abilità fino a fine turno."
      },
      inhibit_attack: {
        label: "Inibizione Attacco",
        timing: "endTurn",
        stack: "refresh",
        blocks: { attack:true },
        description: "Può muovere e usare abilità, ma non può attaccare fino a fine turno."
      },
      inhibit_move: {
        label: "Inibizione Movimento",
        timing: "endTurn",
        stack: "refresh",
        blocks: { move:true },
        description: "Può attaccare o usare abilità, ma non può muovere fino a fine turno."
      },
      move_only: {
        label: "Movimento obbligato",
        timing: "endTurn",
        stack: "refresh",
        blocks: { attack:true, ability:true },
        description: "Può solo muovere; dopo il movimento viene considerata agita."
      },
      thorns: {
        label: "Spine",
        // v1.8.11c: scade a inizio turno del possessore, non a fine turno.
        // Così le Spine applicate nel turno Agathoi restano attive durante il turno nemico.
        timing: "startTurn",
        stack: "refresh",
        blocks: {},
        description: "Chi attacca questa unità subisce danno diretto da logoramento fino al prossimo turno del possessore.",
        tick(unit, status) {
          status.turns = Math.max(0, (status.turns || 1) - 1);
          return status.turns > 0 && unit.alive;
        }
      },
      untargetable: {
        label: "Manto della Selva",
        timing: "startTurn",
        stack: "refresh",
        blocks: {},
        description: "Non può essere bersagliata da attacchi o abilità nemiche fino al prossimo turno del possessore."
      },
      phase_shield: {
        label: "Scudo Fasico",
        timing: "startTurn",
        stack: "refresh",
        blocks: {},
        description: "Non può essere bersagliata da attacchi, abilità o tattiche nemiche fino al prossimo turno del possessore."
      },
      raid_mark: {
        label: "Marcato per Razzie",
        timing: "manual",
        stack: "refresh",
        blocks: {},
        description: "Se muore entro il turno Liberti, il giocatore Liberti guadagna +1 ENE."
      },
      logistic_choke: {
        label: "Strozzatura Logistica",
        timing: "endTurn",
        stack: "refresh",
        blocks: {},
        description: "Se questa unità attacca, il Fabeot che l’ha marchiata guadagna +2 ENE."
      },
      fabeot_vulnerable: {
        label: "Sentenza Porpora",
        timing: "endTurn",
        stack: "refresh",
        blocks: {},
        description: "Subisce +1 danno da attacchi e abilità offensive fino a fine turno."
      },
      stealth: {
        label: "Furtivo",
        timing: "manual",
        stack: "refresh",
        blocks: {},
        description: "Non può essere bersagliata da nemici finché non attacca, usa abilità o viene rilevata da Visione."
      },
      next_attack_ignore_defense: {
        label: "Attacco a Sorpresa",
        timing: "endTurn",
        stack: "refresh",
        blocks: {},
        description: "Il prossimo attacco base ignora la DEF e colpisce direttamente gli HP."
      },
      ignore_defense_permanent: {
        label: "Puntatori Avanzati",
        timing: "manual",
        stack: "refresh",
        blocks: {},
        description: "Gli attacchi base ignorano la DEF finché l'unità resta in gioco."
      },
      stun_on_basic_attack: {
        label: "Diploma da Mentalista",
        timing: "manual",
        stack: "refresh",
        blocks: {},
        description: "Gli attacchi base che colpiscono applicano Stordimento al bersaglio."
      },
      ambush: {
        label: "Agguato",
        timing: "startTurn",
        stack: "refresh",
        blocks: {},
        description: "Effettua un attacco d'opportunità la prima volta che un nemico entra adiacente. Massimo 1."
      },
      counterattack: {
        label: "Contrattacco",
        timing: "startTurn",
        stack: "refresh",
        blocks: {},
        description: "Se subisce un attacco base nemico e sopravvive, attacca immediatamente l'aggressore. Massimo 1."
      },
      extra_attack_on_kill: {
        label: "Dispositivo di Puntamento",
        timing: "endTurn",
        stack: "refresh",
        blocks: {},
        description: "Se questa unità uccide con attacco base, ottiene un attacco extra. Massimo 1."
      },
      double_attack_next_attack: {
        label: "Ordine di Varran",
        timing: "endTurn",
        stack: "refresh",
        blocks: {},
        description: "Il prossimo attacco base raddoppia l'ATT risultante e poi consuma l'effetto."
      },
      next_attack_bleed_two: {
        label: "Marchio dei Sanguis",
        timing: "endTurn",
        stack: "refresh",
        blocks: {},
        description: "Il prossimo attacco base applica Sanguinamento 2 al bersaglio se sopravvive e può sanguinare."
      },
      enemy_effect_immune: {
        label: "Immunità Effetti Nemici",
        timing: "startTurn",
        stack: "refresh",
        blocks: {},
        description: "Ignora effetti da abilità/tattiche nemiche fino al prossimo turno."
      },
      ability_untargetable: {
        label: "Non bersagliabile da abilità",
        timing: "startTurn",
        stack: "refresh",
        blocks: {},
        description: "Non può essere bersagliato da abilità/tattiche nemiche."
      },
      fabeot_bounty: {
        label: "Contratto di Riscossione",
        timing: "manual",
        stack: "refresh",
        blocks: {},
        description: "Se muore entro il turno Fabeot, il giocatore Fabeot guadagna +2 ENE al prossimo income."
      },
      agathoi_income_seed: {
        label: "Seme della Ricchezza",
        timing: "manual",
        stack: "refresh",
        blocks: {},
        description: "Questa struttura genera +1 ENE income finché resta viva."
      },
      fabeot_sicario_contract: {
        label: "Contratto da Sicario",
        timing: "manual",
        stack: "refresh",
        blocks: {},
        description: "Quando questa unità uccide con attacco base, il Fabeot guadagna +1 ENE."
      },
      fabeot_copy_bounty: {
        label: "Taglia sulla Testa",
        timing: "manual",
        stack: "refresh",
        blocks: {},
        description: "Se muore entro il turno del Fabeot che ha posto la taglia, quel Fabeot aggiunge in mano una copia base pulita dell'unità."
      },
      last_run_sacrifice: {
        label: "Ultima Corsa",
        timing: "endTurn",
        stack: "refresh",
        blocks: {},
        description: "Il prossimo attacco base ottiene +1 danno, poi genera esplosione di sacrificio e l'unità viene distrutta."
      },
      sanguis_hunter: {
        label: "Cacciatore Sanguis",
        timing: "manual",
        stack: "refresh",
        blocks: {},
        description: "Ogni fanteria nemica uccisa con attacco base aumenta di +1 il Sanguinamento futuro degli attacchi base."
      },
      enemy_ability_cost_tax: {
        label: "Campo statico",
        timing: "endTurn",
        stack: "refresh",
        blocks: {},
        description: "Le abilità non gratuite di questo giocatore costano +1 ENE fino alla fine del turno."
      },
      enhanced_superiority_next_attack: {
        label: "Superiorità Potenziata",
        timing: "endTurn",
        stack: "refresh",
        blocks: {},
        description: "Il prossimo attacco base usa Superiorità Numerica +2 invece di +1 se la condizione è rispettata."
      },
    });



    function tickStatuses(unit, timing) {
      const next = [];
      for (const status of unit.statuses || []) {
        const def = STATUS_DEFINITIONS[status.kind];
        if (!def || def.timing !== timing) {
          next.push(status);
          continue;
        }
        const keep = typeof def.tick === "function" ? def.tick(unit, status) : tickDurationOnly(unit, status);
        if (keep) next.push(status);
        else log(`${def.label || status.kind} termina su ${unit.name}.`, EventTypes.STATUS_EXPIRED, {
          unitId: unit.uid,
          unitName: unit.name,
          side: unit.side,
          statusKind: status.kind,
          statusLabel: def.label || status.kind,
          source: status.source || null
        });
      }
      unit.statuses = next;
    }



    function tickDurationOnly(unit, status) {
      status.turns = Math.max(0, (status.turns || 1) - 1);
      return status.turns > 0 && unit.alive;
    }



    function applyStatus(target, status) {
      const def = STATUS_DEFINITIONS[status.kind] || { label:status.kind, stack:"refresh" };
      let existing = getStatus(target, status.kind);
      if (!existing || def.stack === "stack") {
        existing = { ...status };
        target.statuses.push(existing);
      } else {
        existing.value = Math.max(existing.value || 0, status.value || 0);
        existing.turns = Math.max(existing.turns || 0, status.turns || 0);
        existing.source = status.source || existing.source;
      }
      log(`${target.name} subisce ${def.label} (${statusText(existing)}).`, EventTypes.STATUS_APPLIED, {
        targetId: target.uid,
        targetName: target.name,
        targetSide: target.side,
        statusKind: status.kind,
        statusLabel: def.label,
        value: existing.value || status.value || 0,
        turns: existing.turns || status.turns || 0,
        source: existing.source || status.source || null,
        owner: existing.owner || status.owner || null
      });
    }



    function statusText(status) {
      if (status.kind === "bleed") return `${status.value} danno/turno per ${status.turns} turni`;
      if (status.kind === "thorns") return `${status.value || 1} danno a chi attacca · fino al prossimo turno (${status.turns || 1})`;
      if (status.kind === "raid_mark") return `taglia: +${status.value || 1} ENE se muore questo turno`;
      if (status.kind === "logistic_choke") return `se attacca: -${status.value || 1} ENE`;
      if (status.kind === "fabeot_vulnerable") return `+${status.value || 1} danno da attacchi/abilità · ${status.turns || 1} turni`;
      if (status.kind === "fabeot_bounty") return `+${status.value || 2} ENE al prossimo income se muore questo turno`;
      if (status.kind === "agathoi_income_seed") return `+${status.value || 1} ENE income finché viva`;
      if (status.kind === "fabeot_sicario_contract") return `+${status.value || 1} ENE al Fabeot quando uccide con attacco base`;
      if (status.kind === "untargetable") return `non bersagliabile da nemici · ${status.turns || 1} turno`;
      if (status.kind === "phase_shield") return `Scudo Fasico · non bersagliabile da nemici · ${status.turns || 1} turno`;
      if (status.kind === "stealth") return `furtivo · finché non attacca/usa abilità o viene rilevato`;
      if (status.kind === "next_attack_ignore_defense") return `prossimo attacco base ignora DEF · ${status.turns || 1} turno`;
      if (status.kind === "ignore_defense_permanent") return `attacchi base ignorano DEF`;
      if (status.kind === "stun_on_basic_attack") return `attacchi base applicano Stordimento`;
      if (status.kind === "ambush") return `Agguato: attacco d'opportunità al primo nemico adiacente · ${status.turns || 1} turno`;
      if (status.kind === "counterattack") return `Contrattacco: risponde al prossimo attacco base subito e sopravvissuto · ${status.turns || 1} turno`;
      if (status.kind === "extra_attack_on_kill") return `ottiene 1 attacco extra se uccide con attacco base · ${status.turns || 1} turno`;
      if (status.kind === "double_attack_next_attack") return `prossimo attacco base: ATT x${status.value || 2} · ${status.turns || 1} turno`;
      if (status.kind === "next_attack_bleed_two") return `prossimo attacco base applica Sanguinamento ${status.value || 2} · ${status.turns || 1} turno`;
      if (status.kind === "enhanced_superiority_next_attack") return `Superiorità Numerica +${status.value || 2} al prossimo attacco se supportata`;
      if (status.kind === "enemy_effect_immune") return `immune a effetti nemici · ${status.turns || 1} turno`;
      if (status.kind === "ability_untargetable") return `non bersagliabile da abilità/tattiche · ${status.turns || 1} turno`;
      const def = STATUS_DEFINITIONS[status.kind];
      return `${status.turns || 1} turno${(status.turns || 1) === 1 ? "" : "i"}${def && def.description ? " · " + def.description : ""}`;
    }



    function hasStatus(unit, kind) { return Boolean(getStatus(unit, kind)); }



    function getStatus(unit, kind) { return (unit.statuses || []).find(st => st.kind === kind) || null; }



    function removeStatusKind(unit, kind, source="effetto") {
      if (!unit || !Array.isArray(unit.statuses)) return false;
      const before = unit.statuses.length;
      unit.statuses = unit.statuses.filter(st => st.kind !== kind);
      const removed = before !== unit.statuses.length;
      if (removed) {
        const def = STATUS_DEFINITIONS[kind] || { label: kind };
        log(`${def.label || kind} termina su ${unit.name} (${source}).`, EventTypes.STATUS_EXPIRED, {
          unitId: unit.uid,
          unitName: unit.name,
          side: unit.side,
          statusKind: kind,
          statusLabel: def.label || kind,
          source
        });
      }
      return removed;
    }



    function revealStealth(unit, source="azione") {
      if (!unit || !hasStatus(unit, "stealth")) return false;
      return removeStatusKind(unit, "stealth", source);
    }



    function statusBlocks(unit, action) {
      return (unit.statuses || []).some(st => {
        const def = STATUS_DEFINITIONS[st.kind];
        return Boolean(def && def.blocks && def.blocks[action]);
      });
    }



    function canAct(unit) { return Boolean(unit && unit.alive && !unit.acted && !statusBlocks(unit, "act")); }



    function canMove(unit) { return canAct(unit) && !unit.movedThisTurn && !statusBlocks(unit, "move"); }



    // C2-FINAL-A1: audit centrale dei veicoli.
    // Regola Starter: un veicolo che ha mosso non può attaccare/usare abilità nello stesso turno,
    // salvo eccezioni esplicite.
    // - warPush conserva l'azione completa dopo il movimento.
    // - moveAttack consente solo attacco dopo movimento, non abilità.
    function vehicleMovedBlocksAttack(unit) {
      return Boolean(unit && unit.type === "Veicolo" && unit.movedThisTurn && !unit.warPush && !unit.moveAttack);
    }



    function vehicleMovedBlocksAbility(unit) {
      return Boolean(unit && unit.type === "Veicolo" && unit.movedThisTurn && !unit.warPush);
    }



    function canUseAbility(unit, ab=null) {
      if (!canAct(unit) || unit.abilityUsedThisTurn || statusBlocks(unit, "ability")) return false;
      if (!ab) return true;
      if (ab.passive || unit.cooldownLeft > 0) return false;
      const abilityCost = typeof effectiveAbilityCost === "function" ? effectiveAbilityCost(unit.side, ab) : (ab.cost || 0);
      if (typeof playerEnergyLocked === "function" && playerEnergyLocked(unit.side) && abilityCost > 0) return false;
      if (abilityCost > state.energy[unit.side]) return false;
      if (vehicleMovedBlocksAbility(unit)) return false;
      if (ab.economyLock && unit.faction === "Fabeot" && state.fabeotEconomyAbilityUsed && state.fabeotEconomyAbilityUsed[unit.side]) return false;
      if (ab.conversionLock && unit.faction === "Fabeot" && state.fabeotConversionUsed && state.fabeotConversionUsed[unit.side]) return false;
      return true;
    }



    function tickCooldownsAndBuffs(player) {
      for (const u of combatUnits(player)) {
        if (u.cooldownLeft > 0) u.cooldownLeft -= 1;
        const remaining = [];
        for (const buff of u.buffs) {
          buff.turns -= 1;
          if (buff.turns <= 0) {
            if (buff.stat === "att") u.currentAtt -= buff.value;
            if (buff.stat === "def") u.currentDef = Math.max(0, u.currentDef - buff.value);
          } else remaining.push(buff);
        }
        u.buffs = remaining;
      }
    }

