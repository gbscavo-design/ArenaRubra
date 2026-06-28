"use strict";

// Arena Rubra – Fase B3a
// Render isolation prudente.
// Questo file contiene funzioni di rendering/UI/log DOM estratte da src/main.js.
// Non introduce nuove meccaniche e non modifica il gameplay.

// Nota architetturale:
// Le funzioni qui presenti usano ancora lo stato globale e varie funzioni del motore.
// È una separazione fisica controllata, non ancora un renderer puro/headless.


    function renderAll() {
      renderBoard();
      renderPanels();
      renderMarket();
      renderRoster();
      renderCardZonePanel();
      renderMatchupStats();
      if (typeof renderCurrentMatchStatsPanel === "function") renderCurrentMatchStatsPanel();
      if (typeof renderGameHud === "function") renderGameHud();
      if (typeof syncBoardCameraAfterRender === "function") syncBoardCameraAfterRender();
    }



    function renderBoard() {
      const board = $("board");
      board.innerHTML = "";
      for (const cell of state.cells) {
        const [x, y, z] = cell.coord;
        const q = x;
        const r = z;
        const left = CENTER_X + HEX_SIZE * Math.sqrt(3) * (q + r / 2);
        const top = CENTER_Y + HEX_SIZE * 1.5 * r;
        const unit = getUnitAt(cell.coord);
        const hqSide = hqSideAt(cell.coord);
        const div = document.createElement("button");
        div.className = "hex";
        if (cell.ps) div.classList.add("ps");
        if (cell.ps && isPsLocked(cell.coord)) div.classList.add("psLocked");
        if (typeof isCellBlockedByEffect === "function" && isCellBlockedByEffect(cell.coord)) div.classList.add("cellBlocked");
        if (typeof hasCellEffect === "function" && hasCellEffect(cell.coord, "cell_movement_trap")) div.classList.add("cellTrapNexus");
        if (typeof hasCellEffect === "function" && hasCellEffect(cell.coord, "cell_movement_boost")) div.classList.add("cellPassageNexus");
        if (typeof hasCellEffect === "function" && hasCellEffect(cell.coord, "vegetal_anathema_trap")) div.classList.add("cellTrapAgathoi");
        if (typeof hasCellEffect === "function" && hasCellEffect(cell.coord, "bramble_path_trap")) div.classList.add("cellBramble");
        if (hqSide) div.classList.add("hq", `hq${hqSide}`);
        if (selectedId && unit && unit.uid === selectedId) div.classList.add("selected");
        if (isMoveTarget(cell.coord)) div.classList.add("moveTarget");
        if (isAttackTarget(cell.coord)) div.classList.add("attackTarget");
        if (isAbilityTarget(cell.coord) || isTacticTarget(cell.coord)) div.classList.add("abilityTarget");
        if (isBuildTarget(cell.coord)) div.classList.add("buildTarget");
        if (isSpawnTarget(cell.coord)) div.classList.add("spawnTarget");
        div.style.left = left + "px";
        div.style.top = top + "px";
        if (cell.control) div.style.boxShadow = `inset 0 0 0 3px ${factionMetaBySide(cell.control).color}cc`;
        const notes = [];
        if (cell.ps) notes.push(isPsLocked(cell.coord) ? "Punto Strategico bloccato" : "Punto Strategico");
        if (hqSide) notes.push(`QG ${playerName(hqSide)} · cella obiettivo`);
        if (typeof cellEffectsSummary === "function" && cellEffectsSummary(cell.coord)) notes.push(cellEffectsSummary(cell.coord));
        div.title = `${cell.coord.join(",")} ${notes.length ? "· " + notes.join(" · ") : ""}`;
        div.addEventListener("click", () => handleCellClick(cell.coord));

        if (unit) {
          const token = document.createElement("div");
          token.className = `unitToken faction-${factionMeta(unit.faction).key} ${tokenTypeClass(unit)} ${tokenWeightClass(unit)}`;
          if (unit.acted && unit.type !== "QG") token.classList.add("acted");
          if (hasStatus(unit, "bleed")) token.classList.add("bleeding");
          if (hasAnyInhibition(unit)) token.classList.add("inhibited");
          if (effectiveThorns(unit)) token.classList.add("thorns");
          div.classList.add("occupied");
          token.innerHTML = `<span class="symbol">${unitIcon(unit)}</span>${unitOverlay(unit)}<span class="mini statMini"><span class="statNum statHp">${unit.currentHp}</span><span class="statNum statDef">${unit.currentDef}</span><span class="statNum statAtt">${effectiveAtt(unit)}</span></span>`;
          token.title = `${unit.name}
HP ${unit.currentHp}/${unit.maxHp} · DEF ${unit.currentDef} · ATT ${effectiveAtt(unit)}${unitStatusSummary(unit) ? "\nStati: " + unitStatusSummary(unit) : ""}`;
          div.appendChild(token);
        }
        const coord = document.createElement("span");
        coord.className = "coord";
        coord.textContent = `${x},${y},${z}`;
        div.appendChild(coord);
        board.appendChild(div);
      }
    }



    function renderPanels() {
      const currentName = playerName(state.currentPlayer);
      const currentMode = state.modes[state.currentPlayer] === "bot" ? "Bot" : "Umano";
      const hq1 = getHq(1);
      const hq2 = getHq(2);
      const field1 = combatUnits(1).length;
      const field2 = combatUnits(2).length;
      $("p1Title").textContent = playerName(1);
      $("p2Title").textContent = playerName(2);
      $("p1Title").className = `faction-${factionMetaBySide(1).key}-text`;
      $("p2Title").className = `faction-${factionMetaBySide(2).key}-text`;
      $("p1Score").textContent = `QG: ${hqOccupancyText(1)} · ENE: ${state.energy[1]} · PS: ${countControlledPS(1)} · Pressione: ${state.pressure[1]}/${PRESSURE_WIN} · Campo: ${field1}`;
      $("p2Score").textContent = `QG: ${hqOccupancyText(2)} · ENE: ${state.energy[2]} · PS: ${countControlledPS(2)} · Pressione: ${state.pressure[2]}/${PRESSURE_WIN} · Campo: ${field2}`;
      $("turnInfo").innerHTML = `
        <h4>Round ${state.turn} <span>${currentName}</span></h4>
        <div class="meta">Giocatore corrente: ${currentMode} · AI bot: ${state.aiMode === "advanced" ? "Avanzata" : "Base"} · Ritmo: ${paceLabel()} · ENE disponibili: ${state.energy[state.currentPlayer]} · PS presidiati: ${countControlledPS(state.currentPlayer)}</div>
        <div class="meta">Effetti economici: ${economicEffectsSummary(state.currentPlayer)}</div>
        <div class="meta">Dottrina fazione: ${doctrineSummary(state.currentPlayer)}</div>
        <div class="stats">
          <span class="pill">QG occupabile</span>
          <span class="pill">Vittoria: PS + QG nemico</span>
          <span class="pill">Income: ${BASE_INCOME}+PS</span>
          <span class="pill">Leggere campo ${activeLightCount(state.currentPlayer)}/${lightFieldLimit(state.currentPlayer)}</span>
          <span class="pill">Pesanti 2x tipo</span>
          <span class="pill">Elite/Pivot 1x campo</span>
          <span class="pill">Pressione ${state.pressure[state.currentPlayer]}/${PRESSURE_WIN}</span>
          <span class="pill">Round max ${MAX_ROUND}</span>
          <span class="pill">Pressione dal round ${pressureStartRound()}</span>
          <span class="pill">Mov. veicoli ${vehicleMoveRange()}</span>
          <span class="pill">Edifici max ${STRUCTURE_FIELD_LIMIT} · Agathoi ${AGATHOI_STRUCTURE_FIELD_LIMIT}</span>
          <span class="pill">Tattica: ${state.tacticUsedThisTurn[state.currentPlayer] ? "usata" : "disponibile"}</span>
        </div>`;

      const selected = getSelectedUnit();
      const panel = $("selectedPanel");
      const actions = $("actionPanel");
      const tactics = $("tacticPanel") || actions;
      actions.innerHTML = "";
      if (tactics !== actions) tactics.innerHTML = "";
      if (!selected) {
        panel.innerHTML = `<h4>Nessuna unità selezionata</h4><div class="meta">Clicca una tua unità attiva sulla mappa, oppure compra dal mercato.</div>`;
      } else {
        panel.innerHTML = unitCardHtml(selected, true);
        const isHumanTurn = state.modes[state.currentPlayer] === "human";
        const canCommand = isHumanTurn && selected.side === state.currentPlayer && selected.type !== "QG" && !selected.acted && selected.alive && !state.winner;
        const moveBtn = document.createElement("button");
        moveBtn.textContent = mode === "move" ? "Annulla movimento" : `Muovi di ${movementRangeFor(selected)} cella${movementRangeFor(selected) > 1 ? "e" : ""}`;
        moveBtn.disabled = !canCommand || !canMove(selected) || movableCells(selected).length === 0;
        moveBtn.addEventListener("click", () => toggleMoveMode());
        actions.appendChild(moveBtn);

        const abilityBtn = document.createElement("button");
        const ab = selected.ability;
        abilityBtn.textContent = ab ? `Abilità: ${ab.name}${ab.cost ? ` (${ab.cost} ENE)` : ""}` : "Nessuna abilità";
        abilityBtn.disabled = !canCommand || !ab || ab.passive || !canUseAbility(selected, ab) || abilityTargets(selected, ab).length === 0;
        abilityBtn.addEventListener("click", () => toggleAbilityMode(selected));
        actions.appendChild(abilityBtn);

        const structure = structureBlueprintFor(selected.side);
        const buildBtn = document.createElement("button");
        buildBtn.textContent = structure ? `Costruisci: ${structure.name} (${effectiveBlueprintCost(selected.side, structure)} ENE)` : "Struttura non disponibile";
        buildBtn.disabled = !canCommand || !canBuildStructures(selected) || !structure || state.energy[selected.side] < effectiveBlueprintCost(selected.side, structure) || purchaseLimitReached(selected.side, structure) || buildableCells(selected).length === 0;
        buildBtn.addEventListener("click", () => toggleBuildMode(selected));
        actions.appendChild(buildBtn);

        const passBtn = document.createElement("button");
        passBtn.className = "ghost";
        passBtn.textContent = "Passa azione unità";
        passBtn.disabled = !canCommand;
        passBtn.addEventListener("click", () => passUnit(selected));
        actions.appendChild(passBtn);
      }
      renderTacticPanel(tactics);

      $("endTurnBtn").disabled = Boolean(state.winner) || state.modes[state.currentPlayer] === "bot" || botRunning;
      $("runBotBtn").disabled = Boolean(state.winner) || botRunning;
      $("concedeBtn").disabled = Boolean(state.winner) || state.modes[state.currentPlayer] === "bot" || botRunning;
      const banner = $("winnerBanner");
      if (state.winner) {
        banner.classList.add("show");
        banner.textContent = state.winner;
      } else {
        banner.classList.remove("show");
        banner.textContent = "";
      }
    }



    function renderTacticPanel(container) {
      if (!state) return;
      const player = state.currentPlayer;
      const faction = state.factions[player];
      const isHuman = state.modes[player] === "human";
      const wrap = document.createElement("div");
      wrap.innerHTML = `<h3 style="padding-left:0; background:transparent; border-bottom:1px solid var(--line); margin-top:10px;">Tattiche ${faction}</h3>`;
      for (const tactic of tacticsForFaction(faction)) {
        const cd = tacticCooldown(player, tactic);
        const blocked = !canUseTactic(player, tactic);
        const card = document.createElement("div");
        card.className = "tacticCard" + (blocked ? " unavailable" : "");
        const targets = tactic.target === "none" ? [] : tacticTargets(player, tactic);
        let reason = "Pronta";
        if (state.tacticUsedThisTurn[player]) reason = "Tattica già usata questo turno";
        else if (cd > 0) reason = `Cooldown ${cd}`;
        else if (state.energy[player] < tactic.cost) reason = "ENE insufficiente";
        else if (tactic.target !== "none" && targets.length === 0) reason = "Nessun bersaglio valido";
        card.innerHTML = `<h4>${tactic.name}<span>${tactic.cost} ENE · CD ${tactic.cooldown}</span></h4><div class="meta">${tactic.description}</div><div class="stats"><span class="pill">${reason}</span></div>`;
        const btn = document.createElement("button");
        btn.textContent = tactic.target === "none" ? "Usa tattica" : (mode === "tactic" && pendingTacticId === tactic.id ? "Annulla bersaglio" : "Scegli bersaglio");
        btn.disabled = !isHuman || blocked || botRunning || Boolean(state.winner);
        btn.addEventListener("click", () => toggleTacticMode(tactic));
        card.appendChild(btn);
        wrap.appendChild(card);
      }
      container.appendChild(wrap);
    }




    // =====================================================
    // C1b – Hand/deck debug UI foundation
    // =====================================================

    function cardTypeLabel(card) {
      if (!card) return "Carta";
      const labels = {
        commander: "Comandante",
        pivot: "Pivot",
        unit_structure: "Struttura",
        unit_infantry: "Fanteria",
        unit_vehicle: "Veicolo",
        unit: "Unità",
        tactic: "Tattica"
      };
      return labels[card.cardType] || card.cardType || card.sourceType || "Carta";
    }

    function cardRoleLabel(card) {
      if (!card) return "—";
      if (card.starterRole) {
        const starterLabels = {
          starter_infantry: "Starter fanteria",
          starter_vehicle: "Starter veicolo",
          starter_structure: "Starter struttura"
        };
        return starterLabels[card.starterRole] || card.starterRole;
      }
      const roleLabels = {
        commander: "Deck · comandante",
        pivot: "Deck · pivot",
        base: "Deck · base",
        heavy: "Deck · pesante",
        elite: "Deck · elite",
        tactic: "Deck · tattica"
      };
      return roleLabels[card.deckRole] || card.deckRole || "Debug";
    }

    function cardCostLabel(card) {
      if (!card || !Number.isFinite(card.cost)) return "costo —";
      const base = Number.isFinite(card.basePrintedCost) && card.basePrintedCost !== card.cost ? ` (base ${card.basePrintedCost})` : "";
      return `${card.cost} ENE${base}`;
    }

    function cardLabel(card) {
      if (!card) return "—";
      const name = escapeHtml(card.name || card.id || "Carta");
      const type = escapeHtml(cardTypeLabel(card));
      const cost = cardCostLabel(card);
      return `${name} · ${type} · ${cost}`;
    }

    function tacticRangeDebugLabel(card) {
      if (!card || card.sourceType !== "tactic") return "—";
      const mode = card.rangeMode || "none";
      const range = Number.isFinite(card.range) ? `R${card.range}` : "";
      if (mode === "none") return "Nessun raggio mappa";
      if (mode === "ally_network") return range ? `Rete alleata ${range}` : "Rete alleata";
      if (mode === "deployment_points") return "Punti di sbarco validi";
      if (mode === "ally_half_edge") return "Bordo metà campo alleata";
      if (mode === "commander_adjacency") return "Adiacenza comandante";
      if (mode === "liberti_unit_range") return range ? `R${card.range} da unità Liberti` : "Da unità Liberti";
      return range ? `${mode} · ${range}` : mode;
    }

    function tacticTargetDebugLabel(card) {
      if (!card || card.sourceType !== "tactic") return "—";
      const target = card.target || card.targetDomain || "Bersaglio non definito";
      const side = card.targetSide ? ` · ${card.targetSide}` : "";
      return `${target}${side}`;
    }

    function renderTacticCardDebugDetails(card) {
      if (!card || card.sourceType !== "tactic") return "";
      const quality = escapeHtml(card.quality || "Tattica");
      const category = escapeHtml(card.category || "Categoria n/d");
      const target = escapeHtml(tacticTargetDebugLabel(card));
      const range = escapeHtml(tacticRangeDebugLabel(card));
      const duration = escapeHtml(card.duration || "Durata n/d");
      const condition = escapeHtml(card.condition || "Nessuna");
      const effect = escapeHtml(card.effectText || "Effetto data-only C2");
      const kind = escapeHtml(card.effectKind || "effectKind n/d");
      const status = escapeHtml(card.implementationStatus || "data_only");
      const full = escapeHtml([
        `Categoria: ${card.category || "n/d"}`,
        `Qualità: ${card.quality || "n/d"}`,
        `Bersaglio: ${tacticTargetDebugLabel(card)}`,
        `Raggio: ${tacticRangeDebugLabel(card)}`,
        `Condizione: ${card.condition || "Nessuna"}`,
        `Durata: ${card.duration || "n/d"}`,
        `Kind: ${card.effectKind || "n/d"}`,
        `Stato: ${card.implementationStatus || "data_only"}`,
        `Effetto: ${card.effectText || ""}`
      ].join("\n"));
      return `
          <div class="tacticDebugDetails tacticCompactDetails" title="${full}">
            <div class="tacticTags">
              <span class="pill tacticPill">${quality}</span>
              <span class="pill">${category}</span>
            </div>
            <div class="tacticEffect"><strong>Effetto:</strong> ${effect}</div>
            <div class="tacticTinyMeta">
              <span>${target}</span>
              <span>${range}</span>
              <span>Condizione: ${condition}</span>
              <span>${duration}</span>
              <span>${kind}</span>
              <span>${status}</span>
            </div>
          </div>`;
    }

    function renderCardInstanceDebug(card) {
      if (!card) return `<div class="debugCard empty">Slot vuoto</div>`;
      const role = escapeHtml(cardRoleLabel(card));
      const name = escapeHtml(card.name || card.id || "Carta");
      const type = escapeHtml(cardTypeLabel(card));
      const cost = cardCostLabel(card);
      const faction = escapeHtml(card.faction || "—");
      const copy = Number.isFinite(card.deckCopyNo) ? `<span class="pill">Copia ${card.deckCopyNo}</span>` : "";
      const overflow = card.debugOverflowCopy ? `<span class="pill bad">Extra debug</span>` : "";
      const sourceClass = card.sourceType === "tactic" ? " tacticCardDebug" : " unitCardDebug";
      const isPlayableTactic = card.sourceType === "tactic" && typeof isC2c1SingleDamageTacticCard === "function" && isC2c1SingleDamageTacticCard(card);
      const tacticPlayablePill = card.sourceType === "tactic" ? `<span class="pill ${isPlayableTactic ? "good" : "tacticPill"}">${isPlayableTactic ? "Giocabile" : "Data-only"}</span>` : "";
      const c2c6aCost = card.c2c6aCostAdjusted ? `<span class="pill good">Sconto pesca</span>` : "";
      const c2c6aAtt = card.c2c6aSpawnAttBonus ? `<span class="pill good">+${card.c2c6aSpawnAttBonus} ATT spawn</span>` : "";
      const c2c7aBlocked = (typeof handCardBlocked === "function" && handCardBlocked(card)) ? `<span class="pill bad">Bloccata: ${escapeHtml(card.c2c7aBlockedSource || "Embargo")}</span>` : "";
      const tacticMeta = renderTacticCardDebugDetails(card);
      if (card.sourceType === "tactic") {
        const compactCategory = escapeHtml(card.category || card.quality || "Tattica");
        return `
        <div class="debugCard${sourceClass}${card.debugOverflowCopy ? " overflow" : ""}">
          <strong>${name}</strong>
          <span>${compactCategory}</span>
          <div class="stats compactStats">
            <span class="pill enePill">${cost}</span>
            ${tacticPlayablePill}${copy}${overflow}${c2c6aCost}${c2c6aAtt}${c2c7aBlocked}
          </div>
          ${tacticMeta}
        </div>`;
      }
      return `
        <div class="debugCard${sourceClass}${card.debugOverflowCopy ? " overflow" : ""}">
          <strong>${name}</strong>
          <span>${type}</span>
          <div class="stats">
            <span class="pill">${cost}</span>
            <span class="pill">${role}</span>
            <span class="pill">${faction}</span>
            ${copy}${overflow}${tacticPlayablePill}${c2c6aCost}${c2c6aAtt}${c2c7aBlocked}
          </div>
          ${tacticMeta}
        </div>`;
    }

    function renderStarterCardSlotDebug(side, key, label, card) {
      const action = typeof starterCardActionState === "function"
        ? starterCardActionState(side, card)
        : { canUse: false, reason: "Starter controller non disponibile", actionText: "Non disponibile" };
      const disabled = action.canUse ? "" : " disabled";
      const playableClass = action.canUse ? " playable" : "";
      const safeUid = card && card.cardUid ? String(card.cardUid).replace(/'/g, "\\'") : "";
      const button = card
        ? `<button type="button"${disabled} onclick="beginStarterCardPurchase('${safeUid}')">${escapeHtml(action.actionText)}</button>`
        : `<button type="button" disabled>Non disponibile</button>`;
      return `
        <div class="debugStarterSlot${playableClass}">
          <div class="miniLabel">${escapeHtml(label)}</div>
          ${renderCardInstanceDebug(card)}
          <div class="starterAction">
            ${button}
            <div class="meta">${escapeHtml(action.reason)}</div>
          </div>
        </div>`;
    }

    function renderStarterCardsDebug(side) {
      const starters = state && state.starterCards ? state.starterCards[side] || {} : {};
      const order = [
        ["starter_infantry", "Fanteria"],
        ["starter_vehicle", "Veicolo"],
        ["starter_structure", "Struttura"]
      ];
      return `
        <div class="debugStarterGrid">
          ${order.map(([key, label]) => renderStarterCardSlotDebug(side, key, label, starters[key])).join("")}
        </div>`;
    }

    function renderHandCardSlotDebug(side, card) {
      const action = typeof handCardActionState === "function"
        ? handCardActionState(side, card)
        : { canUse: false, reason: "Hand card controller non disponibile", actionText: "Non disponibile" };
      const disabled = action.canUse ? "" : " disabled";
      const playableClass = action.canUse ? " playable" : "";
      const pendingClass = pendingHandCardUid && card && pendingHandCardUid === card.cardUid ? " pending" : "";
      const safeUid = card && card.cardUid ? String(card.cardUid).replace(/'/g, "\\'") : "";
      const button = card
        ? `<button type="button"${disabled} onclick="beginHandCardPlay('${safeUid}')">${escapeHtml(action.actionText)}</button>`
        : `<button type="button" disabled>Non disponibile</button>`;
      return `
        <div class="debugHandSlot${playableClass}${pendingClass}">
          ${renderCardInstanceDebug(card)}
          <div class="handAction">
            ${button}
            <div class="meta">${escapeHtml(action.reason)}</div>
          </div>
        </div>`;
    }

    function renderPlayerHandDebug(side) {
      const hand = state && state.hand ? state.hand[side] || [] : [];
      if (!hand.length) return `<div class="meta">Mano vuota.</div>`;
      return `<div class="debugHandList">${hand.map(card => renderHandCardSlotDebug(side, card)).join("")}</div>`;
    }

    function cardZoneCountsForSide(side) {
      return {
        deck: state && state.deck && state.deck[side] ? state.deck[side].length : 0,
        hand: state && state.hand && state.hand[side] ? state.hand[side].length : 0,
        discard: state && state.discard && state.discard[side] ? state.discard[side].length : 0
      };
    }

    function incomeSummaryForSide(side) {
      if (typeof effectiveIncomeGain !== "function") {
        const ps = typeof countControlledPS === "function" ? countControlledPS(side) : 0;
        return { total: BASE_INCOME + ps, sourceText: `${ps} PS`, delta: 0, doctrineLabel: "n/d" };
      }
      return effectiveIncomeGain(side);
    }

    function handBannerPlayerSummary(side) {
      const counts = cardZoneCountsForSide(side);
      const income = incomeSummaryForSide(side);
      const current = state && state.currentPlayer === side ? " current" : "";
      const faction = state && state.factions ? state.factions[side] : "—";
      const commander = typeof selectedCommanderCardForSide === "function" ? selectedCommanderCardForSide(side, state && state.cardCatalog ? state.cardCatalog : null) : null;
      const commanderName = commander ? commander.name : "—";
      const depot = state && state.energy ? state.energy[side] : 0;
      const incomeTitle = escapeHtml(`Income ${income.total}: base/territorio ${income.sourceText || "n/d"}; delta ${income.delta || 0}; dottrina ${income.doctrineLabel || "nessuna"}`);
      return `
        <div class="handBannerPlayer${current}">
          <strong>G${side} · ${escapeHtml(faction)}</strong>
          <div class="meta">Comandante: ${escapeHtml(commanderName)}</div>
          <div class="handBannerPills">
            <span class="pill">Deck ${counts.deck}</span>
            <span class="pill">Mano ${counts.hand}</span>
            <span class="pill">Scarti ${counts.discard}</span>
            <span class="pill enePill">Depot ${depot} ENE</span>
            <span class="pill good" title="${incomeTitle}">Income ${income.total}</span>
          </div>
        </div>`;
    }

    function renderDeckRecoveryControl() {
      if (!state || typeof canRecoverDeck !== "function") return "";
      const side = state.currentPlayer || 1;
      const check = canRecoverDeck(side);
      const isHuman = state.modes && state.modes[side] === "human";
      const visible = check.ok || ((state.deck && state.deck[side] && state.deck[side].length <= 0) && (state.hand && state.hand[side] && state.hand[side].length <= 0));
      if (!visible) return "";
      const disabled = !check.ok || !isHuman ? " disabled" : "";
      const title = escapeHtml(check.ok ? `Paga ${check.cost} ENE, rimescola gli scarti nel deck e pesca ${check.draw}` : check.reason);
      return `<button class="deckRecoveryBtn" type="button" onclick="recoverCurrentPlayerDeck()"${disabled} title="${title}">Riorganizza deck · ${check.cost} ENE</button>`;
    }

    function renderHandStatusBanner() {
      const current = state ? state.currentPlayer : 1;
      const catalog = state && state.cardDebug ? state.cardDebug.catalogSize : 0;
      const config = typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG : {};
      const draw = Number.isFinite(config.drawPerTurn) ? config.drawPerTurn : 1;
      const cap = Number.isFinite(config.maxHandSize) ? config.maxHandSize : "∞";
      const rec = typeof deckRecoveryConfig === "function" ? deckRecoveryConfig() : { cost:5, draw:3 };
      return `
        <div class="handStatusBanner">
          <div class="handBannerTitle">
            <strong>Mano / deck C2</strong>
            <span>Round ${state.turn} · turno: ${escapeHtml(playerName(current))} · pesca ${draw}/turno · cap mano ${cap} · recupero ${rec.cost} ENE → ${rec.draw} carte · catalogo ${catalog}</span>
          </div>
          ${renderDeckRecoveryControl()}
          <div class="handStatusGrid">
            ${handBannerPlayerSummary(1)}
            ${handBannerPlayerSummary(2)}
          </div>
        </div>`;
    }

    function cardZoneDebugHtml(side) {
      return `
        <div class="cardZonePlayer">
          <h4>${escapeHtml(playerName(side))}<span>${escapeHtml(state.factions[side])}</span></h4>
          <div class="miniSectionTitle">Starter fuori deck</div>
          ${renderStarterCardsDebug(side)}
          <div class="miniSectionTitle">Carte in mano</div>
          ${renderPlayerHandDebug(side)}
        </div>`;
    }

    function renderCardZonePanel() {
      const panel = $("cardZonePanel");
      if (!panel) return;

      if (!state || !state.cardDebug || !state.cardDebug.initialized) {
        panel.innerHTML = `
          <div class="unitCard">
            <h4>Mano / deck C2</h4>
            <div class="meta">Fondazione carte non ancora inizializzata. Avvia una nuova partita.</div>
          </div>`;
        return;
      }

      panel.innerHTML = `
        ${renderHandStatusBanner()}
        <div class="cardZoneGrid handScrollContent">
          ${cardZoneDebugHtml(1)}
          ${cardZoneDebugHtml(2)}
        </div>`;
    }


    function factionRulesPillsHtml(unitOrBlueprint) {
      const rules = Array.isArray(unitOrBlueprint && unitOrBlueprint.factionRules) ? unitOrBlueprint.factionRules : [];
      if (!rules.length) return "";
      return rules.map(rule => {
        const cls = rule === "Sanguinamento" ? "pill bad" : "pill";
        return `<span class="${cls}">${rule}</span>`;
      }).join("");
    }

    function factionRulesText(unitOrBlueprint) {
      const rules = Array.isArray(unitOrBlueprint && unitOrBlueprint.factionRules) ? unitOrBlueprint.factionRules : [];
      return rules.length ? rules.join("; ") : "—";
    }

    function renderMarket() {
      const box = $("marketPanel");
      const player = state.currentPlayer;
      const isHuman = state.modes[player] === "human";
      const faction = state.factions[player];
      const items = BLUEPRINTS.filter(u => u.faction === faction);
      box.innerHTML = "";
      for (const bp of items) {
        const normal = bp.type !== "Struttura";
        const blockedLimit = purchaseLimitReached(player, bp);
        const canBuy = isHuman && !state.winner && canAffordBlueprint(player, bp) && !blockedLimit && (normal ? spawnCellsFor(player, bp).length > 0 : canAnyInfantryBuild(player, bp));
        const card = document.createElement("div");
        card.className = "buyCard" + (canBuy ? "" : " unavailable");
        const actionText = normal ? "Acquista e piazza" : "Costruisci con fanteria";
        let reason = "Pronto";
        if (blockedLimit) reason = limitReason(player, bp);
        else if (!canAffordBlueprint(player, bp)) reason = "ENE insufficiente";
        else if (normal) reason = spawnCellsFor(player, bp).length ? "Pronto" : "Nessuna cella di sbarco";
        else reason = canAnyInfantryBuild(player, bp) ? "Serve costruttore selezionato" : "Serve costruttore attivo e cella libera";
        const psText = bp.psBonus ? `<span class="pill">PS: ${bp.psBonus.description}</span>` : "";
        const libText = factionRulesPillsHtml(bp);
        const specialText = bp.ability && bp.ability.passive ? `<span class="pill">${bp.ability.name}</span>` : "";
        const c1fText = bp.vanguard ? `<span class="pill">Avanguardia</span>` : "";
        const copiesText = limitLabel(player, bp);
        card.innerHTML = `
          <div class="head">
            <div class="iconBadge faction-${factionMeta(bp.faction).key} ${tokenTypeClass(bp)} ${tokenWeightClass(bp)}">${unitIcon(bp)}</div>
            <div class="titleWrap">
              <div class="titleRow"><strong>${bp.name}</strong><span>${effectiveBlueprintCost(player, bp)} ENE · ${copiesText}</span></div>
              <div class="subRow">${bp.type} · ${bp.weight} · HP ${bp.hp} · ATT ${bp.att} · DEF ${bp.def}</div>
            </div>
          </div>
          <div class="stats"><span class="pill">${bp.ability ? bp.ability.name : "Nessuna abilità"}</span><span class="pill">${reason}</span>${specialText}${c1fText}${psText}${libText}</div>`;
        const btn = document.createElement("button");
        btn.textContent = actionText;
        btn.disabled = !canBuy || botRunning;
        btn.addEventListener("click", () => beginPurchase(bp));
        card.appendChild(btn);
        box.appendChild(card);
      }
    }



    function renderRoster() {
      const rows = BLUEPRINTS.map(u => `
        <tr>
          <td>${u.faction}</td><td>${u.name}</td><td>${u.type}</td><td>${u.weight}</td>
          <td>${u.cost}</td><td>${u.hp}</td><td>${u.att}</td><td>${u.def}</td><td>${staticLimitLabel(u)}</td>
          <td>${u.type === "Struttura" ? "Costruibile da fanteria" : "Acquistabile/sbarco QG o edifici"}</td>
          <td>${u.ability ? u.ability.name : "—"}</td>
          <td>${u.psBonus ? u.psBonus.description : "—"}</td>
          <td>${factionRulesText(u)}</td>
        </tr>`).join("");
      $("rosterTable").innerHTML = `
        <table>
          <thead><tr><th>Fazione</th><th>Unità</th><th>Tipo</th><th>Classe</th><th>ENE</th><th>HP</th><th>ATT</th><th>DEF</th><th>Copie</th><th>Regola</th><th>Abilità</th><th>Bonus PS</th><th>Regole fazione</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
    }



    function renderMatchupStats() {
      const panel = $("matchupStatsPanel");
      const recent = $("recentStatsPanel");
      if (!panel || !recent) return;
      const items = loadMatchStats();
      if (!items.length) {
        panel.innerHTML = `<div class="help">Nessuna partita registrata. Il registro si aggiorna automaticamente a fine match.</div>`;
        recent.innerHTML = "";
        return;
      }
      const agg = aggregateMatchStats(items);
      const total = items.length;
      const avgRound = (items.reduce((s,r) => s + Number(r.round || 0), 0) / total).toFixed(1);
      const last = items[0];
      panel.innerHTML = `
        <div class="statGrid">
          <div class="statTile"><strong>${total}</strong><span>partite registrate</span></div>
          <div class="statTile"><strong>${avgRound}</strong><span>round medio</span></div>
        </div>
        <div class="miniTable"><table>
          <thead><tr><th>Matchup</th><th>Partite</th><th>Vittorie</th><th>Round medio</th><th>Tipi vittoria</th></tr></thead>
          <tbody>${agg.map(r => `<tr><td>${escapeHtml(r.key)}</td><td>${r.games}</td><td>${formatWins(r.wins)}</td><td>${(r.roundTotal/r.games).toFixed(1)}</td><td>${formatTypes(r.types)}</td></tr>`).join("")}</tbody>
        </table></div>`;
      recent.innerHTML = `<div class="miniTable"><table>
        <thead><tr><th>Ultime partite</th><th>Vincitore</th><th>Tipo</th><th>Round</th><th>Preset</th></tr></thead>
        <tbody>${items.slice(0,8).map(r => `<tr><td>${escapeHtml(r.p1Faction)} vs ${escapeHtml(r.p2Faction)}</td><td class="${factionWinClass(r.winnerFaction)}">${escapeHtml(r.winnerFaction)}</td><td>${escapeHtml(r.winType)}</td><td>${r.round}</td><td>${escapeHtml(r.pacePreset)}</td></tr>`).join("")}</tbody>
      </table></div>`;
    }



    function tokenTypeClass(unit) {
      const type = String(unit.type || "").toLowerCase();
      if (type === "fanteria") return "type-fanteria";
      if (type === "veicolo") return "type-veicolo";
      if (type === "struttura") return "type-struttura";
      if (type === "comandante") return "type-comandante";
      if (type === "qg") return "type-qg";
      return "";
    }



    function tokenWeightClass(unit) {
      const w = String(unit.weight || "").toLowerCase();
      if (w.includes("pivot")) return "weight-pivot";
      if (w.includes("elite")) return "weight-elite";
      if (w.includes("pesante")) return "weight-pesante";
      if (w.includes("leggera")) return "weight-leggera";
      return "";
    }



    function svgWrap(inner, vb = "0 0 24 24") {
      return `<svg viewBox="${vb}" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><g fill="currentColor">${inner}</g></svg>`;
    }



    function infantryIconSvg() {
      return svgWrap(`<circle cx="12" cy="5.2" r="2.2"/>
        <path d="M8.3 10.2c.7-1.5 2.2-2.4 3.7-2.4s3 .9 3.7 2.4l.8 1.8c.2.5 0 .9-.5.9H14.6v3.2l2 4.5h-2.6l-1.3-3.2-1.3 3.2H8.8l2-4.5v-3.2H8c-.5 0-.7-.4-.5-.9l.8-1.8Z"/>`);
    }



    function vehicleIconSvg() {
      return svgWrap(`<path d="M6 8h8l2.1 2.2H18c1.1 0 2 .9 2 2v2H4v-2c0-1.1.9-2 2-2h.8L8 8Zm2 7h2.2l-.6 1.7H7.2L8 15Zm5.8 0H16l.8 1.7h-2.4l-.6-1.7ZM6.5 17.2a1.4 1.4 0 1 1 0-2.8 1.4 1.4 0 0 1 0 2.8Zm11 0a1.4 1.4 0 1 1 0-2.8 1.4 1.4 0 0 1 0 2.8ZM7.5 10.2h6.3l.9 1H6.9l.6-1Z"/>`);
    }



    function structureIconSvg() {
      return svgWrap(`<path d="M5 18V9.6l2-1V6h2v1.4h2V6h2v1.4h2V6h2v2.6l2 1V18h-4v-3h-2v3H9v-3H7v3H5Zm3-5h2v-2H8v2Zm6 0h2v-2h-2v2Z"/>`);
    }



    function commanderIconSvg() {
      return svgWrap(`<path d="m12 2 2.4 4.9 5.4.8-3.9 3.8.9 5.5L12 14.9 7.2 17l.9-5.5L4.2 7.7l5.4-.8L12 2Z"/>`);
    }



    function qgIconSvg() {
      return svgWrap(`<path d="M5 18V9.8L12 4l7 5.8V18h-4v-4h-6v4H5Z"/>`);
    }



    function pivotOverlaySvg() {
      return `<span class="pivotOverlay" style="position:absolute;top:-7px;right:-5px;color:#ffd75e;font-size:13px;text-shadow:0 0 8px rgba(255,215,94,.8)">✦</span>`;
    }



    function unitIcon(unit) {
      let icon = "";
      if (unit.type === "Fanteria") icon = infantryIconSvg();
      else if (unit.type === "Veicolo") icon = vehicleIconSvg();
      else if (unit.type === "Struttura") icon = structureIconSvg();
      else if (unit.type === "Comandante") icon = commanderIconSvg();
      else if (unit.type === "QG") icon = qgIconSvg();
      else icon = initials(unit.name || "?");
      return icon;
    }



    function unitOverlay(unit) {
      return String(unit.weight || "").toLowerCase().includes("pivot") ? pivotOverlaySvg() : "";
    }



function initials(name) {
      const clean = name.replace(/[^A-Za-zÀ-ÿ0-9 ]/g, "").trim().split(/\s+/);
      if (clean.length === 1) return clean[0].slice(0,3).toUpperCase();
      return (clean[0][0] + clean[clean.length-1][0]).toUpperCase();
    }



    function clearLog() { $("log").innerHTML = ""; }



    function appendLogLine(msg) {
      if (!state) return;
      state.logSeq += 1;
      const item = document.createElement("div");
      item.className = "logItem";
      item.innerHTML = `<small>#${state.logSeq}</small> ${escapeHtml(msg)}`;
      const logBox = $("log");
      logBox.prepend(item);
    }



    function log(msg, type = EventTypes.LOG_MESSAGE, data = {}) {
      if (!state) return;
      if (typeof logGameEvent === "function") {
        return logGameEvent({ type, message: msg, data });
      }
      appendLogLine(msg);
      return null;
    }



    function escapeHtml(str) { return String(str).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c])); }



// =====================================================
// B8-final – UI/card/status helpers moved from main.js
// =====================================================

function staticLimitLabel(bp) {
      if (bp.type === "Struttura") return `max ${structureFieldLimit(state.currentPlayer || 1)} edifici`;
      if (bp.type === "Comandante") return `max ${COMMANDER_FIELD_LIMIT}`;
      if (bp.weight === "Pivot") return `max ${PIVOT_FIELD_LIMIT}`;
      if (bp.weight === "Elite") return `max ${ELITE_FIELD_LIMIT}`;
      if (String(bp.weight || "").toLowerCase().startsWith("pesant")) return `max ${HEAVY_FIELD_LIMIT} per tipo`;
      if (countsAsLightCap(bp)) return `cap ${lightFieldLimit(state.currentPlayer)} leggere campo`;
      return "∞";
    }

function unitCardHtml(u, detailed=false) {
      const hpPct = Math.max(0, Math.round((u.currentHp / u.maxHp) * 100));
      const defDen = Math.max(u.maxDef, u.currentDef, 1);
      const defPct = Math.max(0, Math.round((u.currentDef / defDen) * 100));
      const cd = u.ability ? (u.ability.passive ? "passiva" : (u.cooldownLeft > 0 ? `CD ${u.cooldownLeft}` : "pronta")) : "—";
      const attBonus = psBonusValue(u, "att");
      const auraAtt = attackAuraBonus(u);
      const auraDef = defenseAuraBonus(u);
      const statuses = statusPillsHtml(u);
      const libRules = factionRulesPillsHtml(u);
      const doubleText = u.attacksPerTurn > 1 ? `<span class="pill">Attacchi ${u.attacksMade}/${u.attacksPerTurn}</span>` : "";
      return `
        <h4>${u.name} <span>${u.faction}</span></h4>
        <div class="meta">${u.type} · ${u.weight || "Base"}${u.instanceNo ? ` · #${u.instanceNo}` : ""} · ENE ${u.cost} · ${u.source}</div>
        <div class="bars">
          <div>HP ${u.currentHp}/${u.maxHp}</div><div class="bar"><i style="width:${hpPct}%"></i></div>
          <div>DEF ${u.currentDef}${auraDef ? ` (+${auraDef} aura)` : ""}</div><div class="bar def"><i style="width:${defPct}%"></i></div>
        </div>
        <div class="stats">
          <span class="pill">ATT ${effectiveAtt(u)}${attBonus ? ` (+${attBonus} PS)` : ""}${auraAtt ? ` (+${auraAtt} aura)` : ""}</span>
          <span class="pill">DEF base ${u.maxDef}</span>
          <span class="pill">Abilità: ${cd}</span>
          ${doubleText}
          ${statuses}
          ${u.acted && u.type !== "QG" ? `<span class="pill">Ha agito</span>` : ""}
          ${libRules}
        </div>
        ${detailed && u.ability ? `<p class="help"><strong>${u.ability.name}</strong>: ${u.ability.description}</p>` : ""}`;
    }

function doctrineSummary(player) {
      const info = factionDoctrineIncome(player, countControlledPS(player));
      return info.value ? `attiva: +${info.value} ENE (${info.label})` : `non attiva (${info.label})`;
    }

function unitStatusSummary(unit) {
      const parts = (unit.statuses || []).map(st => `${(STATUS_DEFINITIONS[st.kind] || {}).label || st.kind} (${statusText(st)})`);
      if (unit.passiveThorns) parts.push(`Spine passive (${unit.passiveThorns})`);
      if (unit.bleedImmune) parts.push(`Immune a Sanguinamento`);
      if (unit.guardThornsOnIdle) parts.push(`Guardia Spinosa: Spine 1 se non agisce`);
      if (agathoiStructureAdjacencyDefBonus(unit)) parts.push(`+1 DEF da struttura Agathoi`);
      return parts.join("; ");
    }

function statusPillsHtml(unit) {
      const pills = (unit.statuses || []).map(st => {
        const def = STATUS_DEFINITIONS[st.kind] || { label:st.kind };
        const cls = st.kind === "bleed" ? "bad" : "warn";
        const label = st.kind === "bleed" ? `Sanguina ${st.value}/turno · ${st.turns}` : `${def.label} · ${st.turns || 1}`;
        return `<span class="pill ${cls}">${label}</span>`;
      });
      if (unit.passiveThorns) pills.push(`<span class="pill warn">Spine passive · ${unit.passiveThorns}</span>`);
      if (unit.guardThornsOnIdle && !hasStatus(unit, "thorns")) pills.push(`<span class="pill warn">Guardia Spinosa</span>`);
      return pills.join("");
    }

function hasAnyInhibition(unit) {
      return hasStatus(unit, "inhibit_action") || hasStatus(unit, "inhibit_attack") || hasStatus(unit, "inhibit_move");
    }
