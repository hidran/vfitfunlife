# VFit / VFun / VLife — Preventivo aggiornato

**Data:** 6 ottobre 2026 · **Versione:** 2 · **Valuta:** EUR

## Sintesi

Il preventivo originale riguardava un MVP fitness/wellness con profili, ricerca, prenotazioni, pagamenti ed embedding streaming. Il perimetro attuale comprende anche strumenti professionali, gestione clienti, AI, amministrazione estesa, cinque lingue e account aziendali pianificati.

**Stima complessiva del perimetro aggiornato: 725–1.065 ore, pari a 36.250–74.550 €**, con un senior full-stack a 50–70 €/h. Con una riserva del 15%: **41.687,50–85.732,50 €** (budget arrotondato: **42.000–86.000 €**).

Questa è una stima del lavoro necessario per realizzare il perimetro complessivo, incluso ciò che è già sviluppato. **Non è un saldo da pagare né una stima delle ore residue.** Per il lavoro futuro identificato, la gestione aziende fase 1 è stimata separatamente in **65–95 ore, 3.250–6.650 €** prima della riserva.

Le cifre sono stime tecniche, non un'offerta vincolante. Tariffa ripresa dal preventivo originale, senza nuova ricerca di mercato; importi al netto di IVA, contributi eventualmente applicabili e costi di terze parti. Non sono disponibili consuntivi delle ore già lavorate.

## Confronto con il preventivo originale

| Perimetro | Ore | Costo a 50–70 €/h |
|---|---:|---:|
| MVP originale, sviluppo manuale | 400–560 | 20.000–39.200 € |
| MVP originale, sintesi AI-assisted | 300–420 | 15.000–29.400 € |
| Perimetro aggiornato, AI-assisted | 725–1.065 | 36.250–74.550 € |
| Differenza rispetto alla sintesi AI-assisted originale | +425–645 | +21.250–45.150 € |

La differenza confronta gli estremi delle due stime; non rappresenta una fattura per nuove funzionalità. Le righe AI-assisted del PDF originale sommano 300–420 ore e la nuova tabella mantiene un unico criterio di calcolo.

## Perimetro e stima per area

Le ore includono analisi locale, sviluppo e test mirati. La voce QA finale copre regressioni trasversali e verifica degli ambienti; non ripete i test già inclusi nei moduli. L'uso di AI è già considerato: non applicare un secondo sconto percentuale.

| Area | Contenuto incluso | Ore | Costo |
|---|---|---:|---:|
| Analisi, architettura e ambienti | Flussi, modello dati, Firebase/Next.js, configurazione dev/staging/prod | 40–60 | 2.000–4.200 € |
| Account, profili e interfaccia | Auth email/social, ruoli, onboarding professionista, profili, gallerie, navigazione responsive e temi | 100–140 | 5.000–9.800 € |
| Prenotazioni e disponibilità | Slot reali, conflitti, conferma/rifiuto, cancellazione, riprogrammazione, eccezioni, appuntamenti creati dal trainer, blocchi, export calendario | 100–140 | 5.000–9.800 € |
| Comunicazione e pagamento manuale | Chat realtime, notifiche in-app/push/email, promemoria, pagamento registrato dal trainer, conferma/contestazione cliente, recensioni | 50–75 | 2.500–5.250 € |
| Area professionista e gestione clienti | Catalogo servizi, directory e schede clienti, creazione account cliente, note private, obiettivi e programmi di allenamento | 80–120 | 4.000–8.400 € |
| AI e ricette | Assistente concierge, authoring dei programmi, suggerimenti generici di ricette, condivisione, quote e controllo accessi | 50–75 | 2.500–5.250 € |
| Backoffice, metriche e configurazione | CRUD amministrativo, verifiche, tassonomia servizi, audit log, cruscotto pilota, feature flag, allowlist staging, esclusione dati demo | 60–90 | 3.000–6.300 € |
| Ricerca, mappe e posizione | Ricerca per categoria/zona, prossimità e raggio, posizione professionista, mappe e popup | 35–55 | 1.750–3.850 € |
| Streaming e sezioni VFun/VLife | Collegamenti live/embed, discovery attività e servizi, integrazione nei percorsi di prenotazione | 30–45 | 1.500–3.150 € |
| Cinque lingue, PWA e mobile | it/en/es/fr/de, formati locali, shell offline, configurazione Capacitor iOS/Android e autenticazione nativa | 45–70 | 2.250–4.900 € |
| Gestione aziende — fase 1 | Registrazione azienda, validazione e unicità P.IVA, approvazione admin, profilo, ricerca e prenotazione | 65–95 | 3.250–6.650 € |
| QA finale, sicurezza e rilascio | Regressioni, regole e permessi, accessibilità, verifica mobile, documentazione e smoke test staging/prod | 70–100 | 3.500–7.000 € |
| **Totale** | | **725–1.065** | **36.250–74.550 €** |

## Stato delle funzionalità

La base esistente è documentata dai file del progetto e dalla cronologia Git fino al commit `4fff23e`. Prenotazioni, gestione clienti, comunicazione, pagamento fuori piattaforma e miglioramenti UI sono supportati dai piani e dai commit recenti. La presenza del codice non equivale a una nuova certificazione di tutte le funzionalità in produzione.

- **Già presenti nel progetto:** area cliente/professionista, servizi, prenotazioni e calendario, clienti, chat/notifiche, AI e ricette, amministrazione, ricerca/mappe, lingue, streaming e infrastruttura PWA/Capacitor.
- **Pianificata, non completata:** gestione aziende fase 1. Il piano del 4 ottobre riporta B1–B11 ancora da iniziare.
- **Modifiche locali in corso:** ricerca/posizione, booking, categorie e interfaccia hanno modifiche non committate. Rientrano nelle rispettive aree e non sono dichiarate rilasciate.
- **Pagamenti online:** esistono integrazioni Stripe e interruttori amministrativi, disattivati di default. Il flusso operativo documentato è il pagamento fuori piattaforma. Un marketplace con split/payout automatici non è una consegna inclusa nella stima aggiornata.

## Gestione aziende: dettaglio del lavoro futuro

La fase 1 riutilizza il catalogo professionisti: un'azienda è un provider di tipo business, con un solo account proprietario. Riutilizza servizi, disponibilità, prenotazioni e recensioni; non introduce un nuovo motore di booking.

| Attività | Riferimento al piano | Ore |
|---|---|---:|
| Validatore P.IVA, tipi e schema | B1–B2 | 5–7 |
| Registrazione backend, unicità e approvazione obbligatoria | B3 | 12–18 |
| Regole di sicurezza e protezione dati verificati | B4 | 6–9 |
| Registrazione azienda e conversione da cliente | B5 | 10–14 |
| Modifica profilo pubblico e logo | B6 | 6–9 |
| Ricerca, indicizzazione e badge azienda | B7 | 5–8 |
| Filtri admin, dettaglio e rilascio P.IVA con audit | B8 | 8–12 |
| Traduzioni, accessibilità e guide | B9 | 5–7 |
| Verifica end-to-end e deploy staging/prod | B10–B11 | 8–11 |
| **Totale fase 1** | | **65–95** |

**Budget fase 1 con riserva 15%: 3.737,50–7.647,50 €**, arrotondato a **3.800–7.700 €**. Queste ore sono già nella stima complessiva: non aggiungerle una seconda volta.

Assunzioni: aziende italiane, P.IVA obbligatoria e unica, approvazione manuale anche quando i professionisti individuali sono auto-approvati. Dopo l'approvazione il proprietario modifica nome pubblico, logo, sito, descrizione e città; ragione sociale e P.IVA restano protette. L'admin può verificare e gestire le aziende.

### Estensioni opzionali, fuori dal totale

| Estensione | Perimetro indicativo | Ore | Costo |
|---|---|---:|---:|
| Fase 2 — Team aziendale | Inviti, appartenenza e ruoli, assegnazione prenotazioni, disponibilità per membro, team pubblico | 60–90 | 3.000–6.300 € |
| Fase 3 — Sedi e palestre | Proprietario/manager, venueStaff, assegnazione admin, richiesta di adesione palestra e permessi | 45–70 | 2.250–4.900 € |
| **Totale opzionale** | | **105–160** | **5.250–11.200 €** |

Le fasi 2–3 sono stime preliminari, da affinare dopo la definizione dei flussi e dei permessi. Non includono payroll, turnistica avanzata o contabilità aziendale.

## Tempi e lavoro residuo

Con un solo senior e **30 ore produttive/settimana**, ricostruire l'intero perimetro richiederebbe circa **25–36 settimane**, oppure **28–41** con riserva 15%. Sono tempi equivalenti di sviluppo totale; il progetto esistente non riparte da zero.

Per la sola fase aziende 1: circa **3–4 settimane**, inclusa la riserva, a parità di capacità. Revisioni, disponibilità per approvazioni e attese dei servizi esterni possono estendere il calendario.

Non è possibile dedurre il residuo sottraendo ore ipotetiche al totale. Prima di un preventivo a corpo per completare tutto, serve verificare il backlog effettivo, le modifiche locali e i test ancora aperti. Il lavoro futuro quantificato qui è la fase aziende 1; le estensioni sono opzionali.

## Costi ricorrenti e limiti

Firebase/Hosting, Maps, email, AI, streaming e account store sono separati dallo sviluppo. Il tetto infrastruttura di 100 €/mese nel vecchio PDF non viene confermato: il perimetro include ora più servizi e non sono disponibili misure di consumo. Un budget operativo richiede volumi utenti, richieste AI, messaggi, storage e fatture reali. Le commissioni di pagamento si applicano quando i pagamenti online sono attivati.

Fuori dal totale: split/payout Stripe automatici, escrow, contabilità/fatturazione fiscale, gestione aziende estere, pubblicazione e revisione sugli store, manutenzione continuativa, tracking live, produzione video, marketplace token/blockchain, completamento di tutta la roadmap gamification/famiglie/challenge. Suggerimenti di ricette inclusi; piani dietetici personalizzati esclusi come da perimetro documentato.

La riserva copre incertezza tecnica entro il perimetro descritto; nuove funzionalità richiedono una nuova stima. Non include costi operativi né attività opzionali.

## Fonti interne

- [Preventivo originale](PREVENTIVO%20DEL%20PROGETTO%20FATTO%20DA%20UN%20SOFTWARE%20ENGINEER.pdf): baseline economica e perimetro MVP.
- [Piano account aziendali](plans/2026-10-04-business-accounts-plan.md): decisioni, B1–B11 e fasi successive.
- [Piano comunicazione e booking](plans/2026-09-29-communication-booking-plan.md): stato dei flussi e scelta dei pagamenti fuori piattaforma.
- [Piano correzioni UI](plans/2026-10-01-journey-ui-fixes-plan.md): verifiche dei percorsi, accessibilità e formattazione.
- [Catalogo funzionalità](features.md), [schema dati](database-schema.md) e [guide dei percorsi](user-journeys/signup-to-booking.it.md).
- Cronologia Git e stato locale del repository al 6 ottobre 2026. Le ore sono valutazioni tecniche per area, non ore estratte da Git.
