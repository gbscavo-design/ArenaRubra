"use strict";

// Arena Rubra – Fase B8-final.
// Turn flow spostato in src/turns.js.
// Controller umano e UI helpers restano ancora qui.

                                                                                                            

    // =====================================================
    // v1.5 DATA / RULE REGISTRIES
    // =====================================================
    // La v1.6 mantiene stati, inibizioni ed economia data-driven, aggiungendo due fazioni complete:
    // modificatori costo unità, alterazioni reddito ENE e hook per future regole logistiche.
    
    
    // STATUS_DEFINITIONS spostato in src/statuses.js nella Fase B5b.

    
    // ABILITY_HANDLERS spostato in src/abilities.js nella Fase B5c.

    
    const FACTION_RULES = Object.freeze({
      numericalSuperiority: "Se il bersaglio è adiacente a un altro alleato Liberti: +1 danno.",
      bleedingAttacks: "Gli attacchi base Liberti applicano sanguinamento.",
      psControlBonuses: "Bonus Nexus legati al presidio/controllo PS.",
      assaultPressure: "Profilo Exordium orientato a pressione e doppio fronte.",
      agathoiEndurance: "Agathoi: difesa, strutture, presidio PS e logoramento con Spine.",
      fabeotManipulation: "Fabeot: stat deboli, corruzione, conversioni, posizionamento e manipolazione tattica."
    });

    // C1g-a: chiamata residua rimossa; la normalizzazione avviene in newGame(), dopo il caricamento di src/game.js.
    // normalizeBlueprints spostato in src/game.js nella Fase B8a.

    // capGroupForBlueprint spostato in src/game.js nella Fase B8a.

    // validateDataModel spostato in src/game.js nella Fase B8a.

    // Stato globale e helper bootstrap spostati in src/state.js nella Fase B4a.

    // newGame spostato in src/game.js nella Fase B8a.

    // chooseFirstPlayer spostato in src/game.js nella Fase B8a.

    // currentPace spostato in src/board.js nella Fase B6e.
    // pressureStartRound spostato in src/board.js nella Fase B6e.
    // lightFieldLimit spostato in src/economy.js nella Fase B6a.

    // movement_range_cluster spostato in src/movement.js nella Fase B6d.
    // paceLabel spostato in src/board.js nella Fase B6e.

    // generateMap spostato in src/board.js nella Fase B6e.

    // applyAttackBuff spostato in src/board.js nella Fase B6e.

    // isOnPS spostato in src/board.js nella Fase B6e.

    // isOnOrAdjacentToAnyPS spostato in src/board.js nella Fase B6e.

    // adjacentAllyOfOtherAssaultType spostato in src/board.js nella Fase B6e.

    // tickTacticCooldowns spostato in src/tactics.js nella Fase B5d.

    // cleanupTurnTactics spostato in src/tactics.js nella Fase B5d.

    // triggerLogisticChoke spostato in src/tactics.js nella Fase B5d.

    // handleUnitDestroyed spostata in src/combat.js nella Fase B5a.

    // isFabeotMarkedBy spostato in src/abilities.js nella Fase B5c.

    // conversionCapAllows spostato in src/abilities.js nella Fase B5c.

    // canConvertEnemy spostato in src/abilities.js nella Fase B5c.

    // canCorruptLightInfantry spostato in src/abilities.js nella Fase B5c.

    // performFabeotConversion spostato in src/abilities.js nella Fase B5c.

    // convertEnemyUnit spostato in src/abilities.js nella Fase B5c.

    // corruptLightInfantryUnit spostato in src/abilities.js nella Fase B5c.

    // bestDeceptivePositioningVictim spostato in src/abilities.js nella Fase B5c.

    // tacticsForFaction spostato in src/tactics.js nella Fase B5d.
    // tacticById spostato in src/tactics.js nella Fase B5d.
    // tacticCooldown spostato in src/tactics.js nella Fase B5d.
    // canUseTactic spostato in src/tactics.js nella Fase B5d.

    // toggleTacticMode spostato in src/tactics.js nella Fase B5d.

    // isTacticTarget spostato in src/tactics.js nella Fase B5d.

    // tacticTargets spostato in src/tactics.js nella Fase B5d.

    // useTactic spostato in src/tactics.js nella Fase B5d.

    
    // TACTIC_HANDLERS spostato in src/tactics.js nella Fase B5d.

    // staticLimitLabel spostato in src/render.js nella Fase B8-final.

    // unitCardHtml spostato in src/render.js nella Fase B8-final.

    // beginPurchase spostato in src/deployment.js nella Fase B6c.

    // handleCellClick spostato in src/controller.js nella Fase B8c.

    // toggleMoveMode spostato in src/movement.js nella Fase B6d.

    // toggleAbilityMode spostato in src/controller.js nella Fase B8c.

    // toggleBuildMode spostato in src/deployment.js nella Fase B6c.

    // passUnit spostato in src/controller.js nella Fase B8c.

    // postActionChecks spostato in src/turns.js nella Fase B8b.

    // endTurn spostato in src/turns.js nella Fase B8b.

    // startTurn spostato in src/turns.js nella Fase B8b.

    // applyStartTurnStatuses spostato in src/turns.js nella Fase B8b.

    // applyEndTurnStatuses spostato in src/turns.js nella Fase B8b.

    // applyAgathoiIdleGuardThorns spostato in src/turns.js nella Fase B8b.

    // tickStatuses spostato in src/statuses.js nella Fase B5b.

    // tickDurationOnly spostato in src/statuses.js nella Fase B5b.

    // tickPlayerEffects spostato in src/economy.js nella Fase B6b.

    // maybeRunBot spostato in src/ai.js nella Fase B7f.

    // chooseNextBotUnit spostato in src/ai.js nella Fase B7f.

    // strategicStatus spostato in src/ai.js nella Fase B7b.

    // logEmergencyIfNeeded spostato in src/ai.js nella Fase B7b.

    // strategicTargetCoords spostato in src/ai.js nella Fase B7b.
    // isStrategicEnemyTarget spostato in src/ai.js nella Fase B7b.

    // strategicMoveBonus spostato in src/ai.js nella Fase B7b.

    // chooseEmergencyMove spostato in src/ai.js nella Fase B7b.

    // botTryStationaryAction spostato in src/ai.js nella Fase B7d.

    // botTryAttackOnly spostato in src/ai.js nella Fase B7d.

    // finishBotMove spostato in src/ai.js nella Fase B7d.

    // emergencyBotAction spostato in src/ai.js nella Fase B7d.

    // chooseNextAdvancedBotUnit spostato in src/ai.js nella Fase B7f.

    // runBotTurn spostato in src/ai.js nella Fase B7f.

    // maybeUseBotTactic spostato in src/ai.js nella Fase B7c.

    // scoreBotTactic spostato in src/ai.js nella Fase B7c.

    // maybeUseBotPrePurchaseEconomyAbility spostato in src/ai.js nella Fase B7c.


    // botPurchasePhase spostato in src/ai.js nella Fase B7c.

    // chooseBotPurchase spostato in src/ai.js nella Fase B7c.

    // scoreFactionPurchase spostato in src/ai.js nella Fase B7c.

    // scoreLibertiPurchase spostato in src/ai.js nella Fase B7c.

    // botAct spostato in src/ai.js nella Fase B7f.

    // scoreAttackTarget spostato in src/ai.js nella Fase B7d.

    // scoreAbility spostato in src/ai.js nella Fase B7d.

    // chooseBotMove spostato in src/ai.js nella Fase B7e.

    // chooseAdvancedMove spostato in src/ai.js nella Fase B7e.

    // chooseAdvancedAgathoiMove spostato in src/ai.js nella Fase B7e.

    // chooseAdvancedFabeotMove spostato in src/ai.js nella Fase B7e.

    // chooseAdvancedNexusMove spostato in src/ai.js nella Fase B7e.

    // chooseAdvancedExordiumMove spostato in src/ai.js nella Fase B7e.

    // chooseAdvancedLibertiMove spostato in src/ai.js nella Fase B7e.

    // chooseLibertiMove spostato in src/ai.js nella Fase B7e.

    // chooseSpawnCell spostato in src/ai.js nella Fase B7c.

    // chooseAdvancedSpawnCell spostato in src/ai.js nella Fase B7c.

    // buildCellStrategicScore spostato in src/ai.js nella Fase B7c.

    // chooseBuildCell spostato in src/ai.js nella Fase B7c.
    // spawnUnit spostato in src/deployment.js nella Fase B6c.

    // applyAgathoiSpawnDefBonus spostato in src/deployment.js nella Fase B6c.

    // moveUnit spostato in src/movement.js nella Fase B6d.

    // buildStructure spostato in src/deployment.js nella Fase B6c.

    // psBonusActive spostato in src/board.js nella Fase B6e.

    // psBonusValue spostato in src/board.js nella Fase B6e.

    // effectiveAtt spostata in src/combat.js nella Fase B5a.

    // numericalSuperiorityBonus spostata in src/combat.js nella Fase B5a.

    // attackUnit spostata in src/combat.js nella Fase B5a.

    // abilityDamageValue spostato in src/abilities.js nella Fase B5c.

    // agathoiStructureCount spostato in src/economy.js nella Fase B6a.

    // agathoiStructureIncomeBonus spostato in src/economy.js nella Fase B6a.

    // agathoiStructureAdjacencyDefBonus spostato in src/board.js nella Fase B6e.

    // isAdjacentToAgathoiStructure spostato in src/abilities.js nella Fase B5c.

    // isUntargetableTo spostato in src/abilities.js nella Fase B5c.

    // effectiveThorns spostata in src/combat.js nella Fase B5a.

    // applyDamage spostata in src/combat.js nella Fase B5a.

    // targetLabel spostato in src/abilities.js nella Fase B5c.

    // abilityLogTarget spostato in src/abilities.js nella Fase B5c.

    // useAbility spostato in src/abilities.js nella Fase B5c.



    // vehicleHasFollowupAfterAbility spostato in src/abilities.js nella Fase B5c.

    // vehicleHasFollowupAfterAttack spostata in src/combat.js nella Fase B5a.

    // shouldEndAfterAbility spostato in src/abilities.js nella Fase B5c.

    // shouldEndAfterAttack spostata in src/combat.js nella Fase B5a.

    // canBleed spostata in src/combat.js nella Fase B5a.

    // applyBleed spostata in src/combat.js nella Fase B5a.

    // applyStatus spostato in src/statuses.js nella Fase B5b.

    // statusText spostato in src/statuses.js nella Fase B5b.

    // economicEffectsSummary spostato in src/economy.js nella Fase B6a.

    // doctrineSummary spostato in src/render.js nella Fase B8-final.

    // unitStatusSummary spostato in src/render.js nella Fase B8-final.

    // statusPillsHtml spostato in src/render.js nella Fase B8-final.

    // hasAnyInhibition spostato in src/render.js nella Fase B8-final.

    // hasStatus spostato in src/statuses.js nella Fase B5b.
    // getStatus spostato in src/statuses.js nella Fase B5b.

    // statusBlocks spostato in src/statuses.js nella Fase B5b.

    // canAct spostato in src/statuses.js nella Fase B5b.
    // canMove spostato in src/statuses.js nella Fase B5b.
    // canAttack spostata in src/combat.js nella Fase B5a.
    // canUseAbility spostato in src/statuses.js nella Fase B5b.


    // endUnitAction spostato in src/turns.js nella Fase B8b.

    // clearSelection spostato in src/controller.js nella Fase B8c.

    // isMoveTarget spostato in src/movement.js nella Fase B6d.

    // isAttackTarget spostato in src/controller.js nella Fase B8c.

    // isAbilityTarget spostato in src/controller.js nella Fase B8c.

    // isBuildTarget spostato in src/deployment.js nella Fase B6c.

    // isSpawnTarget spostato in src/deployment.js nella Fase B6c.

    // hqSideAt spostato in src/board.js nella Fase B6e.

    // hqOccupancyText spostato in src/board.js nella Fase B6e.

    // fieldUnitsByBlueprint spostato in src/economy.js nella Fase B6a.

    // activeBlueprintCount spostato in src/economy.js nella Fase B6a.

    // activeStructureCount spostato in src/economy.js nella Fase B6a.

    // activeCommanderCount spostato in src/economy.js nella Fase B6a.

    // isLight spostato in src/economy.js nella Fase B6a.

    // countsAsLightCap spostato in src/economy.js nella Fase B6a.

    // activeLightCount spostato in src/economy.js nella Fase B6a.

    // activeLightCountByType spostato in src/economy.js nella Fase B6a.

    // fieldLimitFor spostato in src/economy.js nella Fase B6a.

    // purchaseLimitReached spostato in src/economy.js nella Fase B6a.

    // limitLabel spostato in src/economy.js nella Fase B6a.

    // limitReason spostato in src/economy.js nella Fase B6a.

    // advancedAiEnabled spostato in src/ai.js nella Fase B7a.

    // controlledPsCells spostato in src/ai.js nella Fase B7a.
    // centerPsCell spostato in src/ai.js nella Fase B7a.
    // centerPsOccupant spostato in src/ai.js nella Fase B7a.
    // centerControlledBy spostato in src/ai.js nella Fase B7a.
    // centerControlledByEnemy spostato in src/ai.js nella Fase B7a.
    // centerOpeningActive spostato in src/ai.js nella Fase B7a.
    // centerContestUrgent spostato in src/ai.js nella Fase B7a.
    // centerMoveScore spostato in src/ai.js nella Fase B7b.
    // centerPurchaseBonus spostato in src/ai.js nella Fase B7c.
    // sidePsCells spostato in src/ai.js nella Fase B7a.
    // homePsCell spostato in src/ai.js nella Fase B7a.
    // homePsOccupant spostato in src/ai.js nella Fase B7a.
    // homePsControlled spostato in src/ai.js nella Fase B7a.
    // homePsDutyActive spostato in src/ai.js nella Fase B7a.
    // homePsMoveScore spostato in src/ai.js nella Fase B7b.
    // chooseHomePsDutyMove spostato in src/ai.js nella Fase B7b.
    // contestedPsCells spostato in src/ai.js nella Fase B7b.
    // alliesNear spostato in src/ai.js nella Fase B7a.
    // enemiesNear spostato in src/ai.js nella Fase B7a.
    // commanderOf spostato in src/ai.js nella Fase B7a.
    // nearestControlledPsNeedingGuard spostato in src/ai.js nella Fase B7b.

    // unitIsGarrisoningPs spostato in src/ai.js nella Fase B7a.

    // shouldReleasePsGarrison spostato in src/ai.js nella Fase B7b.

    // threatenedOwnHqUnits spostato in src/ai.js nella Fase B7a.

    // commanderThreatLevel spostato in src/ai.js nella Fase B7a.

    // commanderSafetyMove spostato in src/ai.js nella Fase B7b.

    // commanderProtectionMoveBonus spostato in src/ai.js nella Fase B7b.

    // psProtectionMoveBonus spostato in src/ai.js nella Fase B7b.

    // shouldHoldStrategicCell spostato in src/ai.js nella Fase B7b.

    // advancedPurchaseBonus spostato in src/ai.js nella Fase B7c.

    // exordiumFrontTargets spostato in src/ai.js nella Fase B7e.

    // chooseExordiumFrontForUnit spostato in src/ai.js nella Fase B7e.

    // libertiFlankTarget spostato in src/ai.js nella Fase B7e.

    // hashString spostato in src/ai.js nella Fase B7e.

    // adjacentAttackTargets spostata in src/combat.js nella Fase B5a.

    // adjacentAlliedAuras spostato in src/combat.js nella Fase B8-final.

    // attackAuraBonus spostato in src/combat.js nella Fase B8-final.

    // defenseAuraBonus spostato in src/combat.js nella Fase B8-final.

    // addPlayerEffect spostato in src/economy.js nella Fase B6a.

    // affectedPlayerForAbility spostato in src/economy.js nella Fase B6a.

    // activeEconomicEffect spostato in src/economy.js nella Fase B6a.

    // effectiveIncomeGain spostato in src/economy.js nella Fase B6a.

    // factionDoctrineIncome spostato in src/economy.js nella Fase B6a.

    // effectiveBlueprintCost spostato in src/economy.js nella Fase B6a.

    // playerCostModifiers spostato in src/economy.js nella Fase B6a.

    // matchesEconomyFilter spostato in src/economy.js nella Fase B6a.

    // consumeDeploymentDiscount spostato in src/economy.js nella Fase B6a.

    // canAffordBlueprint spostato in src/economy.js nella Fase B6a.

    // commanderUses spostato in src/economy.js nella Fase B6a.

    // commanderLimitReached spostato in src/economy.js nella Fase B6a.

    // movableCells spostato in src/movement.js nella Fase B6d.

    // spawnSourcesFor spostato in src/deployment.js nella Fase B6c.

    // spawnCellsFor spostato in src/deployment.js nella Fase B6c.

    // canBuildStructures spostato in src/deployment.js nella Fase B6c.

    // buildableCells spostato in src/deployment.js nella Fase B6c.

    // canAnyInfantryBuild spostato in src/deployment.js nella Fase B6c.

    // abilityTargets spostato in src/abilities.js nella Fase B5c.

    // rules_helpers spostato in src/rules.js nella Fase B4c.

    // ps_rules spostato in src/rules.js nella Fase B4c.


    // tickCooldownsAndBuffs spostato in src/statuses.js nella Fase B5b.

    // pressure_round_rules spostato in src/rules.js nella Fase B4c.

    // winner_rules spostato in src/rules.js nella Fase B4c.



    // Statistiche matchup spostate in src/stats.js nella Fase B4d.


    // checkVictory spostato in src/rules.js nella Fase B4c.
   // UI bindings spostati in src/ui.js nella Fase B3b.
