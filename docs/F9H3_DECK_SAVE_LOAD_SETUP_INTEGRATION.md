# F9H3 – Deck Save/Load + Setup Integration

Base: `C2-STABLE-1-F9H2-APK-M4c Deck Builder Local Editing Foundation`.

Build: `C2-STABLE-1-F9H3-APK-M4c`.

## Obiettivo

Portare il Deck Builder dalla sandbox locale a un primo uso controllato nel flusso partita, senza modificare la logica Starter congelata.

## Modifiche

- Aggiunto salvataggio locale dei deck draft validi in `localStorage`.
- Aggiunto caricamento del deck salvato nel draft.
- Aggiunta cancellazione del deck salvato.
- Il SetupScreen ora permette, per ogni giocatore, di scegliere:
  - `Deck automatico Starter`;
  - `Deck personalizzato salvato`.
- Se si sceglie un deck personalizzato, l'avvio partita viene bloccato se il deck non è presente o non supera la validazione.
- `initializeCardZonesForGame()` usa il deck personalizzato solo se validato per fazione/comandante selezionati.
- `state.selectedDecks` e `state.cardDebug.selectedDecks` registrano la scelta deck per lato.

## Regole preservate

Validazione rigida:

- deck esattamente da 30 carte;
- comandante esattamente 1;
- pivot max 1;
- comandante/pivot/elite max 1 copia;
- altre carte/tattiche max 2 copie;
- starter esclusi dal deck;
- fazione e comandante coerenti col setup.

## Non modificato

- gameplay;
- AI;
- effetti tattiche;
- mappa;
- roster;
- costi, HP, DEF, ATT;
- UI mobile partita;
- splash/audio;
- regola danno no-overflow.
