# VFit: registrare e prenotare un’azienda o associazione

[English version](business-signup.md).

Questa guida riguarda un’attività italiana con un solo account titolare. Aziende e associazioni usano gli stessi servizi, disponibilità, prenotazioni e pagamenti dei professionisti individuali. Le richieste delle attività richiedono sempre un’approvazione manuale.

## Registrare il titolare e l’attività

1. Apri **Registrati**, scegli email e password (o un altro metodo disponibile) e inserisci i dati personali del titolare. Il nome del titolare è separato dal nome pubblico dell’attività.
2. Seleziona **Voglio anche offrire servizi come professionista**, poi **Azienda o associazione**.
3. Inserisci ragione sociale e P.IVA italiana di 11 cifre. Un’associazione senza P.IVA inserisce il codice fiscale dell’ente, anch’esso di 11 cifre. Sono accettati spazi e prefisso `IT`; una cifra di controllo errata mostra un errore sotto il campo.
4. Scegli la forma giuridica. Il numero di affiliazione o iscrizione è facoltativo. Puoi inserire nome pubblico, città e sito web; senza nome pubblico viene usata la ragione sociale. Scegli almeno una categoria di servizi.
5. Accetta termini e informativa privacy e crea l’account. La richiesta resta **in attesa di verifica** del numero fiscale. L’attività non appare ancora nella ricerca, anche quando i professionisti individuali vengono approvati automaticamente.

Se il numero appartiene a un altro account, compare un errore sul campo fiscale. Correggilo e riprova nello stesso modulo: l’account titolare già creato viene riutilizzato. Contatta il supporto se il numero registrato appartiene alla tua organizzazione.

## Verifica dell’amministratore

Un amministratore apre **Admin → Provider**, filtra le attività e apre la richiesta. Controlla ragione sociale, numero fiscale, forma giuridica e affiliazione rispetto ai dati del richiedente. Approva o rifiuta con le azioni mostrate. Se i dati verificati sono cambiati mentre la pagina era aperta, ricarica e ricontrollali prima di approvare.

L’approvazione abilita l’area professionista e la presenza pubblica. Il titolare deve impostare un prezzo, attivare almeno un servizio e controllare la disponibilità. Imposta una posizione per comparire nelle ricerche nelle vicinanze. I servizi creati automaticamente sono bozze non attive.

Per le correzioni, gli amministratori usano le azioni dell’attività nella pagina di dettaglio. Cambiare numero fiscale sposta la sua assegnazione univoca; convertire in professionista individuale rimuove dati aziendali e assegnazione. Un’attività rifiutata mantiene il numero finché un amministratore lo libera. Il numero di un’attività attiva non può essere liberato direttamente.

## Cercare e prenotare

Un cliente apre **Prenota un servizio**, cerca il nome pubblico o la ragione sociale e apre l’attività con il badge **Azienda**. Sceglie un servizio attivo, una data e un orario disponibile, accetta i termini e invia la richiesta. Richiesta e dettaglio della prenotazione mostrano il nome pubblico aziendale. Conferma e pagamenti seguono il percorso descritto in [signup-to-booking.it.md](signup-to-booking.it.md).

## Modificare il profilo dell’attività

Apri **Profilo → Modifica → Professionale**. Modifica nome pubblico, descrizione, città o sito, oppure carica, cambia o rimuovi il logo. Salva i dati dell’attività: il logo scelto viene pubblicato solo dopo il salvataggio. La ricerca riflette il nuovo nome quando l’indice si aggiorna.

Ragione sociale, numero fiscale, forma giuridica e affiliazione sono in sola lettura per il titolare. Per correggerli contatta il supporto. Modificare il nome personale del titolare non cambia il nome pubblico dell’attività.

## Registro delle verifiche

Il percorso è stato verificato il 5 ottobre 2026 su staging, codice `1777547`, in italiano e nei temi chiaro/scuro. Registrazione, errore sul numero duplicato, approvazione admin, ricerca, prenotazione e modifica nome/logo sono passati. Le prove di registrazione in italiano/tedesco sono state eseguite a 320 e 390px. Gli account e la prenotazione di prova sono stati rimossi.

Vedi [screenshot e risultati](business-screenshots/README.md) e il [piano degli account aziendali](../plans/2026-10-04-business-accounts-plan.md). La pubblicazione in produzione (B11) resta da completare.
