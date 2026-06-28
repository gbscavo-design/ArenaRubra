"use strict";

// Arena Rubra – Fase B8a
// Game lifecycle extraction.
// Contiene bootstrap partita, validazione minima data model e scelta iniziativa.
// Non contiene turn flow generale, controller umano o AI.

function normalizeBlueprints() {
      for (const bp of BLUEPRINTS) {
        bp.tags = bp.tags || [];
        bp.factionRules = Array.isArray(bp.factionRules) ? [...bp.factionRules] : [];
        bp.capGroup = capGroupForBlueprint(bp);
      }
    }

function capGroupForBlueprint(bp) {
      if (bp.type === "Struttura") return "structure";
      if (bp.type === "Comandante") return "commander";
      if (bp.weight === "Pivot") return "pivot";
      if (bp.weight === "Elite") return "elite";
      if (String(bp.weight || "").toLowerCase().startsWith("pesant")) return "heavy";
      if (String(bp.weight || "").toLowerCase().startsWith("legger")) return "light";
      return "free";
    }

function validateDataModel() {
      const problems = [];
      for (const f of Object.keys(FACTIONS)) {
        const roster = BLUEPRINTS.filter(bp => bp.faction === f);
        if (!roster.length) problems.push(`Fazione senza roster: ${f}`);
        if (!roster.some(bp => bp.type === "Comandante")) problems.push(`Fazione senza comandante: ${f}`);
        if (!roster.some(bp => bp.type === "Struttura")) problems.push(`Fazione senza struttura: ${f}`);
        if (!roster.some(bp => bp.weight === "Pivot")) problems.push(`Fazione senza pivot: ${f}`);
      }
      for (const bp of BLUEPRINTS) {
        if (!FACTIONS[bp.faction]) problems.push(`Blueprint con fazione sconosciuta: ${bp.id}`);
        if (!Number.isFinite(bp.cost) || bp.cost < 0) problems.push(`Costo non valido: ${bp.id}`);
        if (!Number.isFinite(bp.hp) || bp.hp < 0) problems.push(`HP non validi: ${bp.id}`);
      }
      for (const f of Object.keys(FACTIONS)) {
        const tactics = TACTICS.filter(t => t.faction === f);
        if (tactics.length !== 2) problems.push(`Fazione ${f} dovrebbe avere 2 tattiche, trovate ${tactics.length}`);
      }
      if (problems.length) console.warn("Arena Rubra data model warnings", problems);
      return problems;
    }

function newGame() {
      if (typeof normalizeBlueprints === "function") normalizeBlueprints();
      const setup = readGameSetupFromDom();
      const factions = setup.factions;
      const firstPlayer = chooseFirstPlayer();
      state = createInitialGameState({ ...setup, firstPlayer });
      state.units.push(createHq(1), createHq(2));
      if (typeof initializeCardZonesForGame === "function") initializeCardZonesForGame();
      resetInteractionContext();
      clearLog();
      updateControlFromOccupants();
      if (typeof initializeMatchStats === "function") initializeMatchStats();
      validateDataModel();
      if (typeof runPrecheck === "function") runPrecheck({ quiet: true, source: "newGame" });
      const buildLabel = typeof buildInfoLabel === "function" ? buildInfoLabel() : (CONFIG && CONFIG.version ? CONFIG.version : "unknown");
      const buildName = typeof BUILD_INFO !== "undefined" && BUILD_INFO && BUILD_INFO.buildName ? BUILD_INFO.buildName : "Starter Logic Freeze Candidate";
      log(`Arena Rubra – ${buildName} ${buildLabel} avviata. ${playerName(1)} contro ${playerName(2)}. QG occupabili: per vincere serve almeno 1 PS e occupare il QG nemico. Deck/Roster Sanity Pass: deck da 30; comandanti/pivot/elite max 1 copia; altre carte, incluse tattiche, max 2 copie; starter loadout escluso dal deck; mano/deck C2 attivi; cap mano 10; recupero deck a 5 ENE; Missile Jam audit + blocco centrale azioni veicoli; Nexus + Exordium + Liberti + Agathoi + Fabeot numerical/faction-rules balance pass attivi; Bot Strategic Layer C2e-4g Integration/Regression attivo; Superior Doctrine Calibration C2e-4h attiva per Exordium/Fabeot/Agathoi; Fine Balance C2e-5a: Protocollo di Blocco Nexus 1 danno / 1 ENE; MAP1 C2e-6a validata; Starter Logic Freeze C2-STABLE-1: mappa radius 6, QG sui nuovi bordi, PS invariati con margine esterno; F9I1 Card Renderer Preview Foundation attiva: BUILD_INFO centralizzato, Main Menu, SetupScreen, HUD contestuale, PanelManager, Fit ritorna alla mappa, Mano/Azioni si chiudono sui flussi di targeting, matchStats/export strutturati, camera UI separata con Fit/Focus, Deck Builder con salvataggio locale/export-import dei deck validi, storico partite persistente, manifest asset carte e preview renderer nel Deck Builder; Tactical UX D1 attivo: ATT visibile in mappa e movimento evidenziato alla selezione unità; APK-M1/M2b/M3b ereditati; APK-M4 Fixed Mobile Game Layout attivo: pagina bloccata, mappa centrata, preset camera, pannelli mobile Mano/Azioni/Log/Opz e scheda unità flottante; ogni fazione sceglie 1 comandante tra 2 opzioni prima della partita; mercato unità in pannello debug a scomparsa. Iniziativa: ${playerName(firstPlayer)}.`, EventTypes.GAME_STARTED, {
        player1: 1,
        player2: 2,
        faction1: state.factions[1],
        faction2: state.factions[2],
        firstPlayer,
        pacePreset: state.pacePreset,
        aiMode: state.aiMode,
        buildLabel,
        buildInfo: typeof buildInfoExportMeta === "function" ? buildInfoExportMeta() : {},
        selectedCommanders: state.selectedCommanders ? { ...state.selectedCommanders } : {},
        cardFoundation: state.cardDebug ? state.cardDebug.mode : "unknown",
        drawPerTurn: typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG.drawPerTurn : null,
        drawOnFirstTurn: typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG.drawOnFirstTurn : null,
        handUnitCardsPlayable: typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG.handUnitCardsPlayable : null,
        handTacticCardsPlayable: typeof CARD_CATALOG_CONFIG !== "undefined" ? CARD_CATALOG_CONFIG.handTacticCardsPlayable : null,
        botRosterAdoption: true
      });
      startTurn(firstPlayer, true);
      renderAll();
      maybeRunBot();
    }

function chooseFirstPlayer() {
      const modeValue = $("initiativeMode").value;
      if (modeValue === "1" || modeValue === "2") return Number(modeValue);
      return Math.random() < 0.5 ? 1 : 2;
    }
