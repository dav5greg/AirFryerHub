# AirFryerHub — Persistenza

## Obiettivo

Usare `data/recipes.json` come unica fonte di verità del ricettario, condivisa tra tutti i dispositivi.

## Modello dati

Il file contiene un array JSON di ricette. Il file iniziale è volutamente vuoto:

```json
[]
```

Ogni ricetta manterrà il modello attuale dell'app: `id`, `name`, `category`, `temp`, `time`, `shake`.

## Architettura prevista

```text
AirFryerHub (browser)
        |
        | HTTPS
        v
API Vercel Function
        |
        | GitHub API autenticata
        v
GitHub / data/recipes.json
```

GitHub resta la fonte di verità e conserva anche la cronologia delle modifiche.

## Requisiti

- Nessun dato ricette salvato come fonte alternativa in `localStorage`.
- Se il browser non riesce a raggiungere il servizio dati, l'app non deve rendere utilizzabile il ricettario.
- Tutti i dispositivi leggono lo stesso archivio centrale.
- Le scritture devono usare controllo di versione/concorrenza per evitare sovrascritture silenziose.
- L'interfaccia e le funzioni esistenti devono rimanere invariate.

## Migrazione

Non viene eseguita alcuna migrazione dal vecchio servizio KVDB. Il nuovo archivio parte vuoto, come richiesto.

## Nota operativa

Un browser pubblico non deve contenere un token GitHub con permessi di scrittura. Per questo la scrittura richiede un componente server-side (API Vercel Function) che custodisca le credenziali fuori dal codice pubblico.

Prima di collegare `index.html` al nuovo servizio è necessario definire dove verrà eseguito il Vercel Function e configurare le sue credenziali. Fino a quel momento il branch contiene soltanto la nuova struttura dati e la specifica, senza alterare `main`.


## Public write mode

The API now intentionally allows anonymous browser writes, as agreed for this app. The GitHub token remains server-side in the Vercel Function and is never sent to the browser.

Writes use optimistic concurrency: the browser sends the GitHub file SHA it last read, and the Vercel Function rejects a write if another device changed the file first. This prevents one device from silently overwriting another device's newer recipe list.

The browser does not use localStorage as a recipe database and does not fall back to stale local data when offline. Recipe functionality therefore requires a successful API read.
