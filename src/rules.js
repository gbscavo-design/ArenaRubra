"use strict";

// Arena Rubra – Fase B4c
// Rules extraction prudente.
// Questo file contiene:
// - helper generali di accesso stato/identità;
// - regole PS/QG;
// - pressione strategica;
// - vittoria/concessione/resa tecnica.
// Non contiene ancora combattimento, economia, stati, abilità o AI.


// =====================================================
// B4b – Rules/access helpers
// =====================================================

function getSelectedUnit() { return state.units.find(u => u.uid === selectedId && u.alive && u.pos) || null; }
    function getCellAt(coord) { return state.cells.find(c => sameCoord(c.coord, coord)) || null; }
    function isFieldUnit(u) { return Boolean(u && u.alive === true && u.currentHp > 0 && Array.isArray(u.pos) && u.type !== "QG"); }
    function getUnitAt(coord) { return state.units.find(u => isFieldUnit(u) && sameCoord(u.pos, coord)) || null; }
    function getHq(side) { return state.units.find(u => u.side === side && u.type === "QG"); }
    function combatUnits(side=null) { return state.units.filter(u => isFieldUnit(u) && (side === null || u.side === side)); }
    function activeCombatUnits(side) { return combatUnits(side).filter(u => canAct(u)); }
    function hasAnyCombatUnits(side) { return combatUnits(side).length > 0; }
    function structureBlueprintFor(side) { return BLUEPRINTS.find(u => u.faction === state.factions[side] && u.type === "Struttura") || null; }
    function blueprintById(id, faction) { return BLUEPRINTS.find(u => u.id === id && u.faction === faction) || null; }
    function enemyOf(side) { return side === 1 ? 2 : 1; }
    function factionMeta(faction) { return FACTIONS[faction] || FACTIONS.Nexus; }
    function factionMetaBySide(side) { return factionMeta(state.factions[side]); }
    function playerName(side) { return `G${side} ${state.factions[side]}`; }
    function effectiveLife(u) { return u.currentHp + u.currentDef; }  function isInsideMap(coord) { return state.cells.some(c => sameCoord(c.coord, coord)); }


// =====================================================
// B4c – PS control / locks
// =====================================================

function isPsLocked(coord) { return Boolean(state && state.psLocks && state.psLocks.some(l => sameCoord(l.coord, coord))); }
    function addPsLock(owner, coord, source) {
      if (!state.psLocks) state.psLocks = [];
      const existing = state.psLocks.find(l => sameCoord(l.coord, coord));
      if (existing) {
        existing.owner = owner;
        existing.source = source || existing.source;
      } else {
        state.psLocks.push({ owner, coord:[...coord], source:source || "Blocco PS" });
      }
      updateControlFromOccupants();
      log(`Il Punto Strategico [${coord.join(",")}] viene bloccato da ${source || "effetto Fabeot"} fino al prossimo turno di ${playerName(owner)}.`);
    }
    function tickPsLocksAtStart(player) {
      if (!state.psLocks || !state.psLocks.length) return;
      const before = state.psLocks.length;
      const removed = state.psLocks.filter(l => l.owner === player);
      state.psLocks = state.psLocks.filter(l => l.owner !== player);
      for (const l of removed) log(`Il blocco sul Punto Strategico [${l.coord.join(",")}] termina.`);
      if (before !== state.psLocks.length) updateControlFromOccupants();
    }

    function updateControlFromOccupants() {
      for (const cell of state.cells) {
        if (!cell.ps) continue;
        const previousControl = cell.control ?? null;
        let nextControl = null;
        let occupant = null;
        let locked = false;

        if (isPsLocked(cell.coord)) {
          locked = true;
        } else {
          occupant = getUnitAt(cell.coord);
          nextControl = occupant && occupant.type !== "QG" ? occupant.side : null;
        }

        cell.control = nextControl;

        if (previousControl !== nextControl && typeof emitGameEvent === "function") {
          emitGameEvent({
            type: EventTypes.PS_CONTROL_CHANGED,
            message: "",
            data: {
              coord: [...cell.coord],
              previousControl,
              nextControl,
              locked,
              occupantId: occupant ? occupant.uid : null,
              occupantName: occupant ? occupant.name : null,
              round: state.turn
            }
          });
        }
      }
    }
    function removeDeadControl() { updateControlFromOccupants(); }
    function countControlledPS(player) { return state.cells.filter(c => c.ps && !isPsLocked(c.coord) && c.control === player).length; }


// =====================================================
// B4c – Pressure / round limit
// =====================================================

function resolveEndOfRound() {
      updateControlFromOccupants();
      if (state.turn >= pressureStartRound()) {
        const p1 = countControlledPS(1);
        const p2 = countControlledPS(2);
        if (p1 > p2) {
          state.pressure[1] += 1;
          log(`Pressione Strategica: ${playerName(1)} controlla più PS (${p1}-${p2}) e sale a ${state.pressure[1]}/${PRESSURE_WIN}.`);
        } else if (p2 > p1) {
          state.pressure[2] += 1;
          log(`Pressione Strategica: ${playerName(2)} controlla più PS (${p2}-${p1}) e sale a ${state.pressure[2]}/${PRESSURE_WIN}.`);
        } else {
          log(`Pressione Strategica: parità PS (${p1}-${p2}), nessuno avanza.`);
        }
        if (state.pressure[1] >= PRESSURE_WIN) setWinner(`Vittoria ${playerName(1)} per dominio operativo: Pressione Strategica ${state.pressure[1]}/${PRESSURE_WIN}.`, { winner:1, type:"pressione" });
        if (state.pressure[2] >= PRESSURE_WIN) setWinner(`Vittoria ${playerName(2)} per dominio operativo: Pressione Strategica ${state.pressure[2]}/${PRESSURE_WIN}.`, { winner:2, type:"pressione" });
      }
      if (!state.winner && state.turn >= MAX_ROUND) resolveRoundLimit();
    }

    function resolveRoundLimit() {
      const metrics = [1,2].map(p => ({
        player:p,
        ps:countControlledPS(p),
        units:combatUnits(p).length,
        ene:state.energy[p]
      }));
      const a = metrics[0], b = metrics[1];
      let winner = null;
      let reason = "";
      if (a.ps !== b.ps) { winner = a.ps > b.ps ? 1 : 2; reason = `più PS controllati (${a.ps}-${b.ps})`; }
      else if (a.units !== b.units) { winner = a.units > b.units ? 1 : 2; reason = `più unità in campo (${a.units}-${b.units})`; }
      else if (a.ene !== b.ene) { winner = a.ene > b.ene ? 1 : 2; reason = `più ENE non spesa (${a.ene}-${b.ene})`; }
      if (winner) setWinner(`Vittoria ${playerName(winner)} allo spareggio del round ${MAX_ROUND}: ${reason}.`, { winner, type:"spareggio" });
      else setWinner(`Pareggio tecnico al round ${MAX_ROUND}: PS, unità ed ENE sono equivalenti.`, { winner:null, type:"pareggio" });
    }


// =====================================================
// B4c – Resign / winner inference
// =====================================================

function maybeAutoResign(player) {
      if (!state || state.winner || !state.autoResignEnabled) return;
      if (state.modes[player] !== "bot" || state.turn < AUTO_RESIGN_ROUND) return;
      const enemy = enemyOf(player);
      const ownUnits = combatUnits(player);
      const enemyUnits = combatUnits(enemy);
      const enemyHq = getHq(enemy);
      const noReach = ownUnits.length === 0 || ownUnits.every(u => hexDistance(u.pos, enemyHq.pos) > 3);
      const hopeless = countControlledPS(player) === 0 && countControlledPS(enemy) >= 2 && ownUnits.length * 2 < Math.max(enemyUnits.length, 1) && noReach;
      state.desperation[player] = hopeless ? (state.desperation[player] || 0) + 1 : 0;
      if (state.desperation[player] >= AUTO_RESIGN_STREAK) {
        setWinner(`${playerName(player)} concede per resa tecnica: 0 PS, forte inferiorità numerica e nessuna pressione sul QG nemico. Vittoria ${playerName(enemy)}.`, { winner:enemy, type:"resa_tecnica" });
      }
    }

    function concedeMatch(player) {
      if (!state || state.winner) return;
      setWinner(`${playerName(player)} concede la partita. Vittoria ${playerName(enemyOf(player))}.`, { winner:enemyOf(player), type:"concessione" });
      renderAll();
    }

    function setWinner(message, meta = {}) {
      if (state.winner) return;
      state.winner = message;
      state.winnerSide = Object.prototype.hasOwnProperty.call(meta, "winner") ? meta.winner : inferWinnerSide(message);
      state.winType = meta.type || inferWinType(message);
      log(message, EventTypes.VICTORY, {
        winner: state.winnerSide,
        winnerFaction: state.winnerSide ? state.factions[state.winnerSide] : null,
        winType: state.winType,
        round: state.turn,
        message
      });
      recordMatchResult();
      renderMatchupStats();
    }

    function inferWinnerSide(message) {
      if (!state) return null;
      if (message.includes(`Vittoria ${playerName(1)}`)) return 1;
      if (message.includes(`Vittoria ${playerName(2)}`)) return 2;
      return null;
    }

    function inferWinType(message) {
      const m = String(message).toLowerCase();
      if (m.includes("pressione") || m.includes("dominio operativo")) return "pressione";
      if (m.includes("qg")) return "qg";
      if (m.includes("spareggio")) return "spareggio";
      if (m.includes("resa tecnica")) return "resa_tecnica";
      if (m.includes("concede")) return "concessione";
      if (m.includes("pareggio")) return "pareggio";
      return "altro";
    }


// =====================================================
// B4c – QG victory
// =====================================================

function checkVictory() {
      if (state.winner) return;
      for (const player of [1, 2]) {
        const enemy = enemyOf(player);
        const enemyHq = getHq(enemy);
        const occupant = getUnitAt(enemyHq.pos);
        if (occupant && occupant.side === player && countControlledPS(player) >= 1) {
          setWinner(`Vittoria ${playerName(player)}: occupa il QG di ${playerName(enemy)} controllando almeno un PS.`, { winner:player, type:"qg" });
          break;
        }
      }
    }
