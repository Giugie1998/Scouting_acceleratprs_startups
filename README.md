# AI Scouting (Google Sheets + Apps Script)

Url utilizzato per l'estrapolazione degli accelerators https://rankings.ft.com/incubator-accelerator-programmes-europe

Prototipo per:
- fare scouting di acceleratori in Europa
- estrarre startup dai portfolio degli acceleratori
- generare una value proposition per le startup via LLM

## Google Sheet
- Link: https://docs.google.com/spreadsheets/d/1BuJTGiLtYHDWRh5ur6Tp4_cSQro8l4WvvVH6dC2pabI/edit?usp=sharing

## Setup file sheet 
Predisporre il file sheet con i seguenti 2 fogli e le relative colonne: 
    - accelerators : website, name, country
    - startups : website, name, country, accelerator, value_proposition



## Setup (Apps Script)
1) Apri il Google Sheet -> Extensions -> Apps Script.
2) Copia i file `.gs` di questo repo nel progetto Apps Script (1:1).
3) Apps Script -> Project Settings -> Script properties:
   - `LLM_API_KEY`: API key generabile su OpenRouter
   - `LLM_API_URL`: default `https://openrouter.ai/api/v1/chat/completions` 
   - `LLM_MODEL`: default `openai/gpt-oss-20b:free`
   - Nota OpenRouter: per usare modelli `:free` potrebbe essere necessario abilitare la Data/Privacy policy sul tuo account (Settings -> Privacy).

   - `ACCELERATORS_SOURCE_OFFSET`: `0` (inizializza batch)
   - (opzionale) `ACCELERATORS_SOURCE_URL`: default `https://rankings.ft.com/incubator-accelerator-programmes-europe`

## Uso (menu)
Nel foglio trovi `Startup Scouting AI`:
1) `Setup LLM API Key`: Pulsante che permette l'inserimento della api key senza dover aggiungerla nelle Script properties.
------
2) `Scouting accelerators`: aggiunge ~10 acceleratori per run in `accelerators`
3) `Aggiorna startups dagli acceleratori`: trova startup (portfolio/alumni/batch) e inserisce nuove righe in `startups`
4) `Genera value proposition mancanti`: compila `value_proposition` per le startup mancanti

## Scelte tecniche (come richiesto)
- `website` primarykey con normalizzazione URL (niente duplicati).
- Robustezza: 
    - error handling "skip + log" (no blocco dell'intero processo).
    - Check pre-inserimento startup: fetch del sito con timeout 10s + contenuto minimo (evita righe non processabili per value_proposition).
- Filtri per evitare falsi positivi (social/shortener/search) nello scouting startup.
- API_URL: openrouter piena libertà sulla selezione del modello LLM scelto. 

## LLM (scelta modello)
- Default: `openai/gpt-oss-20b:free`, dopo aver testato altri modelli (free), mi è risultato il più solido in termini di Velocità/Risultato.

## Limiti noti
- `country` startup non sempre deducibile dal portfolio: puo' restare vuoto (oppure derivato via formula dal country dell'acceleratore).

## Info su clasp
Non avendolo usato prima ho decido di non utilizzare clasp e di procedere con un semplice repository Github.
