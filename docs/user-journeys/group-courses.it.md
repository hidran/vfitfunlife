# Corsi e attività di gruppo: riepilogo per il cliente

[English version](group-courses.md) (guida completa: cliente, singolo professionista e strutture). Questo riepilogo italiano copre solo la **Parte A, cliente**. Per il percorso del titolare di un’azienda vedi [company-owner-venue.it.md](company-owner-venue.it.md). [Indice dei percorsi](README.md).

Un **corso** è il modello (nome, orario, prezzi, posti, regole); una **lezione** è una singola data del corso (una sola lezione per giorno). Una prenotazione occupa un posto in una lezione; l’**intero corso** occupa un posto in ogni lezione, in una sola operazione. Vale per i corsi dei singoli professionisti e per quelli delle strutture (palestre, scuole, studi).

**Schermate.** Per ora nessuna è inserita. Mentre questo testo veniva scritto era in corso una sessione di cattura (file `courses-NN-*.png` non ancora versionati in `screenshots/` e `screenshots-it/`; vedi l’[indice](README.md#screenshots-status)). Le etichette sono i testi italiani dell’app.

**Solo con accesso.** Tutte le schermate qui descritte (`/courses`, `/venue`, `/fit/gyms`, `/fit/gyms/timetable`) stanno nell’area dell’app che richiede l’accesso: chi non ha effettuato l’accesso viene mandato a `/auth/login`, senza tornare poi alla pagina richiesta (lettura del codice, `src/app/(main)/layout.tsx`; non riverificato nel browser). I dati sono leggibili pubblicamente dalle regole di Firestore, ma le pagine no.

---

## A1. Trovare una lezione

**Obiettivo.** Arrivare alla lezione o al corso che vuoi prenotare.

**Prerequisiti.** Un account cliente con accesso. Il corso è **Pubblicato**, il fornitore è verificato e, per un corso di una struttura, la struttura è un partner attivo.

**Passi.**

1. **Pagina della struttura → Prossime lezioni.** Apri una palestra, scuola o studio da **Palestre e scuole** (`/fit/gyms`; lista o mappa, ricerca per nome o città, **Vicino a me** con raggio). La pagina della struttura (`/venue?id=…`) ha il pulsante **Palinsesto palestra** e, per una struttura partner attiva, l’elenco **Prossime lezioni** con le tre lezioni più vicine. Scegliendo una lezione si apre `/courses?id=<corso>&lesson=<giorno>`: si apre la scheda del corso e il riepilogo di quella lezione parte da solo (una lezione al completo si apre con la proposta della lista d’attesa, vedi A5). **Orario completo** porta al punto 2.
2. **Orario settimanale** (`/fit/gyms/timetable?id=<struttura>`). Una settimana alla volta (schede dei giorni sul telefono, sette colonne da 1024 px) con filtri **Tutte le sedi**, **Tutte le sale**, **Tutti gli istruttori** e settimana precedente/successiva. Ogni scheda mostra corso, ora di inizio e fine nel fuso della struttura, sala, istruttore, **Posti liberi: N** (oppure **Lista d’attesa aperta** / **Completo**) e il prezzo. Una lezione già iniziata si vede ma non è un collegamento. Se la struttura non è un partner attivo (o è disattivata) la pagina dice «L’orario non è disponibile: la struttura non è al momento un partner attivo.»
3. **Elenco dei corsi.** **Corsi e attività di gruppo** (`/courses`; anche dal menu laterale): filtri categoria, città/luogo, **A partire dal**, **Prezzo massimo (€)**; 50 corsi per pagina, **Carica altri corsi**. Compaiono solo i corsi con la prossima lezione nel futuro. **Lezioni** apre la scheda del corso.
4. **Ricerca generale.** Cerca il nome di un corso o di un’attività: i corsi pubblicati compaiono accanto ai professionisti, con il collegamento **Lezioni**. La ricerca ignora maiuscole e accenti.

**Prezzi.** Il tuo prezzo è il prezzo del corso meno lo sconto iscritti della struttura e, quando l’istruttore della lezione è un partner attivo, l’extra istruttore partner (al massimo 100%). Non serve nessuna iscrizione: ogni cliente con accesso ha lo sconto. Orario ed elenco lezioni mostrano il tuo prezzo con il prezzo di listino barrato e `−X%` quando risparmi; i corsi indipendenti non hanno sconti. Per l’orario il server calcola i prezzi al massimo di 8 corsi alla volta e accetta 60 richieste di prezzo ogni 10 minuti per utente; oltre, le lezioni mostrano il prezzo di listino.

**Errori.** «Impossibile caricare i corsi. Riprova.» (con **Riprova**); nessun risultato: «Nessun corso trovato. Prova altri filtri.» o «Nessuna lezione in programma.»

## A2. Prenotare una lezione

**Obiettivo.** Un posto in una lezione.

**Prerequisiti.** Lezione programmata, con un posto libero, che inizia oltre il preavviso del corso (predefinito 2 ore), corso pubblicato con iscrizioni aperte; non hai già una prenotazione; non è un tuo corso. Per un corso di una struttura serve anche che la struttura sia un partner attivo.

**Passi.**

1. **Scheda del corso → Lezioni.** Ogni lezione mostra data e ora, luogo e istruttore, **Posti disponibili: liberi / totali** (i posti in attesa di pagamento contano come occupati) e il tuo stato se hai già la lezione (**Confermato** o **Posto in attesa del pagamento**). Sopra l’elenco c’è la regola di cancellazione («Puoi cancellare fino a N ore prima della lezione.»).
2. **Prenota la lezione · prezzo.** Il pulsante chiede al server un preventivo nuovo di quella lezione e apre **Controlla la prenotazione**: lezione, prezzo di listino, righe dei vantaggi («Vantaggio struttura partner (10%)», «Vantaggio istruttore partner (5%)» quando valgono), **Risparmio totale**, **Il tuo prezzo**, la regola di cancellazione e il metodo di pagamento («Paga direttamente al fornitore» o «Paga online»). Una lezione gratuita mostra **Gratis** e nessuna scelta di pagamento.
3. **Conferma prenotazione.** Il server ricalcola il prezzo. La prenotazione si fa solo se importo e revisione della lezione sono quelli che hai visto.
4. **Esito.** La scheda si chiude, compare «Prenotazione confermata» e si apre **I miei corsi** (A6). Con pagamento diretto il posto è confermato subito e resta **Da pagare** finché il fornitore non registra il pagamento; una prenotazione gratuita è confermata e risulta **Pagato**.

**Errori** (in rosso nel riepilogo o sotto l’elenco). Il pulsante è semplicemente disattivato, senza messaggio, quando la lezione è al completo senza lista d’attesa, è dentro il preavviso, è annullata, l’hai già prenotata, o il corso è chiuso o non pubblicato.

| Situazione | Cosa vedi |
|---|---|
| Qualcuno ha preso l’ultimo posto (`lesson_full`) | «La lezione è al completo.» e, se la lista d’attesa è ammessa, il pulsante **Iscriviti alla lista d’attesa** |
| Il prezzo è cambiato mentre controllavi | Non viene prenotato nulla. Avviso «Il prezzo è cambiato. Controlla il nuovo totale e conferma di nuovo.» e il riepilogo mostra i nuovi importi |
| La lezione è cambiata (posti, orario, sala, istruttore) | «La lezione è stata modificata (ad esempio posti o orario). Controlla i dettagli e conferma di nuovo.» |
| La lezione è ormai dentro il preavviso | «Il termine per prenotare questa lezione è scaduto.» |
| Corso chiuso o non pubblicato | «Le iscrizioni a questo corso sono chiuse.» |
| Hai già la lezione | «Hai già una prenotazione per questa lezione.» |
| Struttura disattivata o non partner attivo | «Questa struttura al momento non è attiva.» |
| Corso tuo | «Non puoi prenotare il tuo stesso corso.» |
| Account sospeso / fornitore non più verificato | «L’account non è attivo.» / «Il fornitore non è disponibile al momento.» |
| Pagamento online non attivo o totale sotto 0,50 € | «I pagamenti online per i corsi non sono attivi. Scegli il pagamento diretto.» / «Il pagamento online richiede almeno 0,50 €. Scegli il pagamento diretto.» |
| Più di 60 richieste di prezzo in 10 minuti | «Troppe richieste. Attendi qualche minuto e riprova.» |
| Qualsiasi altro errore | «Operazione non riuscita. Controlla i dati e riprova.» |

**Casi particolari.** Lezione dentro il preavviso: il pulsante è disattivato, la lista d’attesa non viene proposta e una lezione che diventa troppo vicina chiude la sua lista d’attesa. Chi viene promosso dalla lista d’attesa paga il prezzo del momento della promozione, senza passaggio di controllo.

## A3. Iscriversi all’intero corso

**Obiettivo.** Un posto in ogni lezione, in una sola operazione.

**Prerequisiti.** Il corso ha un prezzo per l’intero corso, la prima lezione non è iniziata e ogni lezione è programmata, ha posto ed è fuori dal preavviso.

**Passi.** Scheda del corso → pulsante **Intero corso · prezzo** («Un posto riservato in ogni lezione. Iscrizione prima dell’inizio del corso.») → **Controlla la prenotazione** con tutte le date e le stesse righe di risparmio → **Conferma prenotazione**. Il prezzo dell’intero corso è diviso tra le lezioni in centesimi interi e ogni quota riceve il suo sconto; le quote salvate sommano al totale e i rimborsi le usano.

**Errori.** Se una lezione è al completo, annullata o dentro il preavviso il pulsante è disattivato senza messaggio. Se durante la conferma un’altra persona prende l’ultimo posto di una lezione: «La lezione è al completo.» e nulla viene riservato (nessun corso parziale; un corso intero non ha lista d’attesa). Dopo l’inizio della prima lezione: «Il corso è già iniziato: puoi prenotare solo le singole lezioni.» Una prenotazione già presente in una lezione blocca l’intero corso.

**Non incluso.** Un posto per lezione per cliente; nessun acquisto per famiglia o gruppo; nessun calcolo proporzionale a corso iniziato.

## A4. Capire perché il prezzo cambia

1. In orario o elenco lezioni vedi il prezzo di listino barrato e il tuo prezzo.
2. Nel riepilogo le righe spiegano: percentuale della struttura, percentuale dell’istruttore (solo se **attivo** come partner della struttura), **Risparmio totale** e **Il tuo prezzo**.
3. Se a una lezione viene assegnato un istruttore sostituto, lo sconto del sostituto vale per le *nuove* prenotazioni; chi ha già prenotato conserva il prezzo pagato.
4. Se prezzo, sconto o lezione cambiano tra il tuo controllo e la tua conferma, compare l’avviso di A2 e devi confermare i nuovi importi.

## A5. Lista d’attesa e promozione

**Obiettivo.** Ottenere un posto in una lezione al completo senza ricontrollare.

**Prerequisiti.** Lezione al completo, lista d’attesa ammessa dal corso (attiva di default), lezione fuori dal preavviso, lezione singola. Meno di 100 persone in attesa.

**Passi.**

1. **Elenco lezioni → Iscriviti alla lista d’attesa** (proposto anche nel riepilogo dopo «La lezione è al completo.» e quando apri dall’orario una lezione al completo). La lezione mostra **In lista d’attesa · posizione N** con **Esci dalla lista d’attesa**. A 100 persone il pulsante diventa **Lista d’attesa piena**.
2. Si libera un posto (cancellazione, rimozione da parte dello staff, scadenza di una prenotazione online non pagata, rimborso di un pagamento tardivo, aumento dei posti): il primo in lista viene prenotato automaticamente, in ordine.
   - Pagamento diretto: la prenotazione è **Confermato** e ricevi la notifica «Posto liberato».
   - Pagamento online: il posto è **riservato per 30 minuti**; la notifica dice «Posto liberato: paga entro 30 minuti» e in **I miei corsi** compare «Paga entro N minuti per mantenere il posto.» accanto a **Continua al pagamento**. Se la riserva scade si passa alla persona successiva.
3. **I miei corsi → Liste d’attesa** elenca le tue iscrizioni (corso, data, posizione, **Esci dalla lista d’attesa** → «Uscire dalla lista d’attesa?» → **Conferma prenotazione**). Le lezioni già iniziate non compaiono.

**Errori.** «Sei già in lista d’attesa per questa lezione.», «Questo corso non ha la lista d’attesa.», «La lista d’attesa è piena.», «La lista d’attesa non è disponibile per questa lezione.» (lezione non al completo, corso chiuso o dentro il preavviso), più i messaggi su struttura, account e pagamento online di A2.

**Casi particolari.** Una richiesta che non potrà mai essere promossa (account non attivo, pagamento online non disponibile o troppo basso, corso tuo) viene rimossa e ne ricevi il motivo («Rimosso dalla lista d’attesa»). Se la lezione viene annullata o spostata, il corso archiviato o la lezione entra nel preavviso, l’intera lista si chiude e tutti vengono avvisati («Lista d’attesa chiusa»). Se la struttura viene disattivata, la promozione si ferma e le richieste restano.

## A6. I miei corsi e le cancellazioni

**Obiettivo.** Vedere le prenotazioni e cancellare una lezione in tempo.

**Passi.** `/courses?tab=bookings` (**I miei corsi**, anche da **Le mie prenotazioni**). Ogni scheda mostra il corso (collegamento), lo stato (**Confermato**, **Posto in attesa del pagamento**, **Annullato**, **Scaduto**), **Singola lezione** / **Intero corso**, il totale, **Pagato** o **Da pagare**, come paghi, l’eventuale importo in **Rimborsi** e le lezioni con le date nel fuso del corso. Una prenotazione online in attesa mostra **Continua al pagamento**. **Cancella prenotazione** accanto a una lezione → «Annullare questa prenotazione?» → **Conferma prenotazione** (stessa etichetta della prenotazione).

**Regole.** Il pulsante c’è solo se la lezione inizia più tardi del termine di cancellazione (predefinito 24 ore, salvato sulla tua prenotazione); una prenotazione online non pagata si può annullare sempre. Dopo il termine non c’è pulsante né spiegazione; una richiesta fatta comunque mostra «Il termine per cancellare gratuitamente è scaduto.»

**Rimborsi.** Se il fornitore aveva registrato un pagamento diretto, la cancellazione crea un **Rimborso da effettuare** per il fornitore, che restituisce il denaro fuori da VFit; la tua scheda mostra l’importo. Una cancellazione di un pagamento online (Stripe) crea un rimborso automatico. Le prenotazioni gratuite non generano rimborsi.

**Casi particolari.** Rimozione da parte dello staff dopo il tuo termine: viene registrata come cancellazione tardiva (nessuna penale, solo un contatore visibile al fornitore). Assenza: chi viene segnato **Assente** è contrassegnato e il fornitore vede il conteggio per corso; nessuna penale. Lezione annullata dal fornitore: sei liberato, avvisato e rimborsato come sopra. Lezione spostata: ricevi una notifica e la prenotazione segue la lezione.

## A7. Pagare online (facoltativo)

Il pagamento diretto è quello predefinito. Quando un superadmin attiva **Pagamenti con Stripe** e **Checkout online per corsi**, il riepilogo propone **Paga online**: **Conferma prenotazione** crea una riserva di 30 minuti e apre il Checkout Stripe. Solo il webhook Stripe verificato conferma il pagamento; il ritorno dal browser aggiorna soltanto le prenotazioni. Importi da 0,01 € a 0,49 € non si addebitano online e si pagano direttamente.

## Struttura sospesa o azienda convertita

Una struttura non partner attivo o disattivata mostra l’avviso dell’orario, nasconde **Prossime lezioni** e rifiuta nuove prenotazioni e iscrizioni alla lista con «Questa struttura al momento non è attiva.» I suoi corsi già pubblicati restano in elenco e le prenotazioni esistenti restano intatte. Rifiutare un’azienda, convertirla o eliminarne il titolare disattiva la sua sede; un’approvazione successiva la riattiva (salvo che un amministratore l’abbia spenta a mano). I corsi di un fornitore rifiutato o sospeso escono da elenco e orario; un’azienda convertita resta verificata, quindi i suoi corsi restano in elenco ma quelli della struttura non si possono prenotare.

## Limiti noti

- Senza accesso nessuna di queste pagine si apre (vedi la nota in alto).
- L’intero corso è disattivato, senza spiegazione, se una lezione è al completo, annullata o dentro il preavviso; un intero corso non ha lista d’attesa.
- Dopo il termine di cancellazione il pulsante **Cancella prenotazione** scompare senza messaggio.
- Il pulsante di conferma della cancellazione si chiama **Conferma prenotazione**.
- **I miei corsi** mostra le ultime 500 prenotazioni; l’elenco dei corsi carica 50 elementi alla volta.
- Una lezione ha al massimo 100 persone in lista; chi viene promosso non vede un controllo del prezzo.
- Il pagamento online è disattivato di default e su staging non ci sono chiavi Stripe di prova valide finché la [guida di staging](../deployment/staging.md) non dice altrimenti (stato del rilascio, non verificabile nel codice).
