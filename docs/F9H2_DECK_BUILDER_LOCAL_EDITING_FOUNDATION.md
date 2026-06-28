# F9H2 – Deck Builder Local Editing Foundation

Base: `C2-STABLE-1-F9H1-APK-M4c Deck Builder Read/Validate Foundation`.

Build: `C2-STABLE-1-F9H2-APK-M4c`.

## Obiettivo

Aprire la seconda sottofase del Deck Builder senza integrare ancora i deck personalizzati nel gameplay.

F9H2 trasforma la schermata `Costruisci deck` da lettura/validazione a editor locale in memoria.

## Modifiche

- `src/deck_builder.js` aggiornato a F9H2.
- Il Deck Builder ora mantiene draft separati per coppia fazione/comandante.
- Il draft iniziale viene generato dal template legale già usato in F9H1.
- Il pool legale mostra un pulsante `+` per aggiungere carte.
- Il deck draft mostra un pulsante `−` per rimuovere una copia.
- I pulsanti `+` vengono disabilitati quando il deck è pieno o la carta ha raggiunto il limite copie.
- Validazione realtime:
  - deck 30 carte;
  - comandante esattamente 1;
  - pivot massimo 1;
  - comandante/pivot/elite max 1;
  - altre carte/tattiche max 2;
  - starter esclusi dal deck;
  - no overflow debug nel draft.
- Nuovi pulsanti:
  - `Copia report JSON`;
  - `Copia deck JSON`;
  - `Ripristina template`;
  - `Svuota draft`.
- UI/CSS aggiornati con colonna azione e highlight violazioni.
- `BUILD_INFO` aggiornato a F9H2.

## Non modificato

- Nessun cambio gameplay.
- Nessun cambio AI.
- Nessun cambio a deck runtime usato in partita.
- Nessun salvataggio persistente.
- Nessuna integrazione col SetupScreen.
- Nessun cambio tattiche/effetti.
- Nessun cambio mappa.
- Nessun cambio roster/stat/costi/HP/DEF/ATT.
- Nessun cambio splash/audio.
- Nessun cambio alla regola danno no-overflow.

## Nota roadmap

F9H2 è volutamente locale e non pericolosa. F9H3 potrà introdurre Save/Load e scelta deck nel setup, dopo validazione di questa fase.
