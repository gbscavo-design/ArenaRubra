# F9P1b – Saved Deck Gallery Microfix

## Baseline

`C2-STABLE-1-F9P1a-APK-M4c Storage Import/Export UX Hotfix`.

## Obiettivo

Rendere visibili e richiamabili dal Deck Builder i deck salvati/importati, invece di limitarli a una scelta implicita nel SetupScreen.

## Modifiche

- Aggiunta sezione `Deck salvati / importati` nel Deck Builder.
- La gallery legge tutti i payload persistenti dallo storage deck custom.
- Ogni scheda mostra:
  - fazione;
  - comandante;
  - chiave storage;
  - numero carte;
  - data salvataggio/importazione;
  - stato valido/non valido;
  - eventuali motivi di invalidità.
- Ogni deck può essere:
  - caricato nel draft;
  - copiato come JSON importabile;
  - eliminato dallo storage.
- Il caricamento da gallery imposta automaticamente fazione e comandante del Deck Builder.
- I deck non validi restano visibili, ma non caricabili nel draft.
- L’import JSON continua a funzionare da file o da testo incollato e aggiorna la gallery.

## Non modificato

- Nessun cambio alla logica Starter.
- Nessun cambio a AI, deck runtime, tattiche, effetti, mappa, roster, costi, HP, DEF, ATT.
- Nessun cambio alla regola danno no-overflow.
- Nessun cambio al peso asset: nessuna illustrazione carta aggiunta.

## Nota

Lo storage resta `localStorage` tramite `src/storage.js`. La gallery migliora il controllo utente sui deck salvati/importati, ma il backend file JSON nativo per EXE/APK resta un futuro cambio del solo storage layer.
