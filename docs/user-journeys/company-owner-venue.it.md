# Titolare di un’azienda: la sede e i suoi corsi

[English version](company-owner-venue.md). Parte da [business-signup.it.md](business-signup.it.md) (registrazione, verifica, scheda pubblica, profilo) e da [group-courses.md](group-courses.md) (come funzionano corsi, lezioni e prenotazioni; la guida è in inglese, il [riepilogo per il cliente](group-courses.it.md) è in italiano). Altri ruoli: [personale della struttura](venue-staff.md), [amministratore](admin-business-and-venues.md), [indice](README.md).

Il **titolare** è un account in Italia che si è candidato come **Azienda o associazione** con tipo di sede Palestra, Scuola o Studio. Quando un amministratore verifica l’azienda, il sistema crea la sede dell’azienda; il titolare gestisce poi sedi, sale e corsi della struttura. Per ora c’è un solo titolare per azienda.

**Schermate.** Esistono le schermate di registrazione, verifica admin, sede creata all’approvazione e pagina della sede (nuovo scatto del 20 ottobre 2026 su staging, vedi [business-screenshots](business-screenshots/README.md)). Per ora non è inserita nessuna schermata dei corsi del titolare (il pannello **Sedi e sale**, l’editor dei corsi della struttura); era in corso la cattura della pagina corsi della struttura (vedi l’[indice](README.md#screenshots-status)). Le etichette sono i testi italiani dell’app.

---

## C1. Registrarsi come azienda e farsi approvare

**Obiettivo.** Un’azienda verificata con la sua sede.

**Prerequisiti.** Nessun altro account possiede la P.IVA; il titolare ha un account (nuovo o già acceso).

**Passi** (dettagli e schermate in [business-signup.it.md](business-signup.it.md)).

1. **Registrati** → **Voglio anche offrire servizi come professionista** → **Azienda o associazione**.
2. Compila **Ragione sociale**, **P.IVA / Codice fiscale** (11 cifre, cifra di controllo), **Forma giuridica** (Società (SRL, SAS…), Ditta individuale, Associazione / ente, Altro), il **Numero di affiliazione** facoltativo, il **Nome pubblico**, il **Tipo di sede** (Palestra, Scuola, Studio, Nessuna sede fissa), **Indirizzo** e **Città** (obbligatori per Palestra, Scuola e Studio), descrizione e sito web facoltativi e almeno una categoria di servizi.
3. Accetta termini e informativa e crea l’account. La richiesta resta **in attesa**, anche quando l’approvazione automatica dei singoli professionisti è attiva; non compare ancora nella ricerca pubblica (un account in attesa può aprire l’area professionisti, ma nulla è pubblico).
4. Un amministratore controlla e preme **Verifica** ([percorso dell’amministratore](admin-business-and-venues.md#a1-review-and-approve-a-company)). L’azienda compare nell’elenco pubblico (nome pubblico, logo, badge **Azienda**) e, per Palestra, Scuola e Studio, nello stesso passaggio viene creata la sede `biz_<id del titolare>`.

**Cosa vede il titolare in caso di errore** (sotto il campo, con il cursore sul campo; l’account già creato viene riutilizzato se si invia di nuovo il modulo).

| Situazione | Testo |
|---|---|
| Cifra di controllo errata | «P.IVA o codice fiscale non valido: controlla le 11 cifre.» |
| P.IVA già di un altro account | «Il numero inserito (P.IVA o codice fiscale) è già registrato da un altro account. Se è la tua attività, contatta il supporto.» |
| Si cambia la P.IVA di un’azienda approvata | «La P.IVA / il codice fiscale di un’attività già approvata non si può cambiare. Contatta il supporto.» |
| Nomi troppo lunghi | «Nome non valido o troppo lungo (massimo 120 caratteri).» |
| Sede senza indirizzo o città | «L’indirizzo è obbligatorio per una sede» / «La città è obbligatoria per una sede» |
| Tipo di sede non scelto | «Scegli un tipo di sede» |
| Altri limiti | città al massimo 80, indirizzo 200, numero di affiliazione 40, descrizione 1000, sito web 200 caratteri, ognuno con il suo messaggio |
| Azienda già approvata | «La tua attività è già approvata. Per modificarne i dati vai al profilo o contatta il supporto.» |
| Singolo professionista verificato che si candida come azienda | «Il tipo di account professionale non può più essere cambiato. Contatta il supporto.» |
| Candidatura da singolo da un account azienda | «Questo account è già registrato come azienda o associazione: non puoi candidarti come singolo professionista. Contatta il supporto per cambiare tipo di account.» |
| Conflitto di salvataggio | «Qualcosa è cambiato durante il salvataggio. Riprova.» |

**Casi particolari.**

- *In attesa di verifica:* il profilo mostra «Il nostro team sta verificando questi dati: per modificarli contatta il supporto.»
- *Rifiutata:* l’area professionisti è chiusa all’account; il profilo mostra «La tua richiesta non è stata approvata. Per saperne di più o per modificare questi dati, contatta il supporto.» La P.IVA resta riservata all’account finché un amministratore non la libera. Ripresentare la domanda la rimette in attesa; decide un amministratore.
- *Approvata senza sede («Nessuna sede fissa»):* non viene creata alcuna sede; l’azienda è un professionista come gli altri e gestisce [corsi indipendenti](group-courses.md#part-b-individual-provider).
- *L’amministratore vede dati diversi da quelli appena cambiati:* l’approvazione viene rifiutata all’amministratore («I dati dell’azienda sono cambiati da quando li hai aperti: controlla i nuovi dati e approva di nuovo.»); non viene approvato nulla finché non ha riesaminato i nuovi dati.

## C2. La sede creata dal sistema

**Obiettivo.** Capire che cos’è la sede e dove compare.

1. La sede porta il tuo **nome pubblico** (la ragione sociale se è vuoto), il **tipo di sede**, l’**indirizzo** e la **città** indicati, tu come titolare, stato partnership *In attesa* e nessuno sconto. È **attiva** ma **non ancora partner**.
2. Compare in **Palestre e scuole** (`/fit/gyms`) solo quando ha le coordinate: salva l’indirizzo in **Posizione** nel menu professionista (`/provider/location`) e la sede lo segue (e segue anche le successive modifiche del nome pubblico). I clienti la trovano con **Vicino a me**; senza posizione nota l’elenco mostra solo le 50 strutture con la valutazione migliore, quindi una sede nuova senza valutazioni può mancare.
3. Gli amministratori la trovano in **Admin → Sedi** con il tuo account nella colonna **Titolare**.
4. Tipo di sede e indirizzo sono fissi dopo la registrazione, come gli altri dati legali; per cambiarli contatta il supporto. Solo gli amministratori modificano la sede (foto in **Admin → Sedi**, stato partner e sconti nella sua pagina); il titolare non ha schermate per foto, orari o descrizione della sede.

## C3. Configurare sedi e sale

**Obiettivo.** Sale che i corsi possano usare.

**Prerequisiti.** Sei titolare della struttura (o personale, o amministratore); la struttura è una palestra, scuola o studio.

**Passi.**

1. Menu professionista → **Gestisci corsi**. Se gestisci una struttura, il selettore **Struttura** la elenca; sceglila (`/provider/courses?venue=<id>`, con titolo «Corsi di <nome struttura>»).
2. Scorri fino a **Sedi e sale** (si raggiunge anche dal collegamento **Aggiungi sedi e sale** dell’editor dei corsi). Una struttura vuota dice «Nessuna sede per ora. Aggiungi la prima per poter creare corsi.»
3. **Aggiungi sede**: **Sede** (nome), **Indirizzo**, **Città**, **Fuso orario** (una zona IANA come Europe/Rome; il valore predefinito è Europe/Rome) → **Aggiungi sede**. Ogni sede mostra indirizzo, città e fuso, con **Attivo** / **Non attiva** e **Disattiva** / **Riattiva**.
4. **Aggiungi sala**: scegli la sede, scrivi il nome della **Sala** → **Aggiungi sala**. Le sale hanno gli stessi pulsanti **Disattiva** / **Riattiva**.
5. Il pannello elenca gli **Istruttori collegati** (nome, Attivo / Non attiva) quando un amministratore ne ha collegati ([percorso dell’amministratore](admin-business-and-venues.md#a4-instructor-links)).

**Errori** (testo rosso sotto i moduli): un nome o indirizzo più corto di 2 caratteri viene rifiutato dal modulo; un fuso sconosciuto dà «Fuso orario non valido.»; chi non gestisce la struttura vede «Non hai l’autorizzazione a gestire questa struttura.»; una struttura che non è palestra, scuola o studio dà «Struttura non trovata.»; una sede mancante dà «Sede non trovata.»

**Casi particolari.** Sedi e sale non si eliminano, si disattivano, perché le lezioni tengono bloccata la loro sala e un corso prende il fuso orario dalla sua sede. Un corso continua a mostrare una sala disattivata dopo la scelta.

## C4. Preparare la struttura: stato partner e istruttori

Sono azioni dell’amministratore; il titolare non le può fare.

1. La struttura parte **In attesa**. Finché un amministratore non imposta **Stato partnership** su **Attivo** (e la struttura è attiva), il titolare può salvare bozze ma non pubblicare un corso della struttura («Questa struttura al momento non è attiva.»), la pagina della struttura non ha il pulsante **Palinsesto palestra** né **Prossime lezioni**, e l’orario dice di non essere disponibile.
2. L’amministratore può impostare anche **Sconto iscritti (%)** e **Sconto extra istruttore partner (%)** (0–100). I clienti ottengono lo sconto iscritti su ogni lezione della struttura; l’extra istruttore vale quando l’istruttore della lezione è un partner attivo.
3. L’amministratore collega istruttori verificati alla struttura e ne imposta lo stato partner. Il titolare, scrivendo un corso, sceglie solo istruttori collegati e attivi (oppure **Altro (scrivi un nome)**).

Nessuna schermata mostra al titolare lo stato partner della struttura; lo scopre quando la pubblicazione viene rifiutata.

## C5. Creare e pubblicare i corsi della struttura

**Obiettivo.** Corsi nelle tue sale, con i tuoi istruttori, nell’orario settimanale.

**Prerequisiti.** C3 completato (una sede attiva con una sala attiva); per pubblicare, C4 punto 1; sei un professionista verificato (sei il fornitore di riferimento e chi incassa).

**Passi.** Come in [group-courses.md, C1](group-courses.md#c1-create-and-publish-a-venue-course): **Gestisci corsi → (struttura) → Crea corso** → **Struttura**, **Sede**, **Sala**, **Istruttore della struttura**, programma, prezzi, preavviso e cancellazione → **Anteprima lezioni** (segnala le lezioni con sala o istruttore già occupati) → **Pubblicato** → **Salva corso**.

**Errori.** Vale la tabella di [group-courses.md, C1](group-courses.md#c1-create-and-publish-a-venue-course): «La sala è già occupata da «X» (orario).», «L’istruttore ha già «X» nello stesso orario (orario).», «Questa struttura al momento non è attiva.», «La sede o la sala scelta non è valida oppure non è attiva.», «L’istruttore scelto non è valido per questa struttura.», «Un corso con sala o istruttore collegati può avere al massimo 400 lezioni. Accorcia il periodo.»

**Casi particolari.**

- *Protezione dalle sovrapposizioni:* le lezioni future di un corso pubblicato tengono bloccate la sala e l’istruttore; lezioni una dopo l’altra vanno bene; annullare la pubblicazione, archiviare, annullare o spostare una lezione libera lo spazio.
- *Corso con prenotazioni:* programma, prezzi, struttura, sala e istruttore sono bloccati; si usano le azioni sulla lezione ([personale della struttura](venue-staff.md#s3-lesson-actions)).
- *Struttura disattivata o sospesa in seguito:* i corsi pubblicati restano in elenco ma non si possono prenotare («Questa struttura al momento non è attiva.»); per modificarne uno riportalo prima a **Bozza**.

## C6. Personale

Il personale della struttura sono account che gestiscono i corsi insieme a te ([percorso del personale](venue-staff.md)). **Non c’è una schermata per aggiungerlo**: un amministratore crea il record `venueStaff/{uid del collaboratore}` (`venueId`, `isActive`) direttamente nel database. Chiedi al supporto.

## C7. Modificare il profilo dell’azienda

**Profilo → Modifica → Professionale** («Dati aziendali»): nome pubblico, descrizione, sito web, città e logo; si salva con **Salva i dati dell’attività**. Ragione sociale, P.IVA, forma giuridica, numero di affiliazione, tipo di sede e indirizzo sono in sola lettura. Rinominare aggiorna anche il nome della sede (il suo indirizzo web non cambia). Vedi [business-signup.it.md](business-signup.it.md).

## C8. Quando le cose finiscono

| Evento | Cosa succede alla sede e ai corsi |
|---|---|
| Azienda **rifiutata** da un amministratore | L’area professionisti si chiude; la sede viene disattivata; i corsi del fornitore escono da elenco e orario (non è più idoneo); le prenotazioni esistenti restano |
| Azienda **convertita in singolo professionista** da un amministratore | Dati aziendali e riserva sulla P.IVA vengono eliminati, la sede viene disattivata, l’account resta un professionista verificato. I suoi corsi restano in elenco ma quelli della struttura non si possono prenotare; la struttura esce dal selettore del titolare mentre i corsi restano nel suo elenco **Gestisci corsi**. Il titolare non può tornare azienda candidandosi («Il tipo di account professionale non può più essere cambiato. Contatta il supporto.»); prima un amministratore deve rifiutare l’account |
| Azienda **approvata di nuovo** | La sede viene riattivata (se l’aveva disattivata il sistema); foto, sconti e stato partner impostati da un amministratore restano; non si crea una seconda sede |
| Account del titolare **eliminato** (superadmin) | La sede `biz_<id del titolare>` viene disattivata, non eliminata; la riserva sulla P.IVA viene liberata; prenotazioni e pagamenti restano come registri. Le altre strutture solo gestite dall’account non vengono toccate |

## Limiti noti

- Tipo di sede, indirizzo e gli altri dati legali sono fissi dopo la registrazione; i cambi passano dal supporto.
- Il titolare non può aggiungere personale, collegare istruttori, impostare stato partner e sconti, né modificare foto, orari e descrizione della sede: sono azioni degli amministratori.
- Nessuna schermata mostra al titolare lo stato partner della struttura.
- Una sede con stato partner *in attesa* e coordinate è visibile pubblicamente in Palestre e scuole prima di qualsiasi azione dell’amministratore (decisione: mantenere). Il suo orario non è disponibile finché non è un partner attivo.
- Senza posizione nota `/fit/gyms` mostra solo le 50 strutture con la valutazione migliore, quindi una sede nuova e senza valutazioni compare con **Vicino a me**.
- Un’azienda convertita non può candidarsi di nuovo come azienda se prima un amministratore non rifiuta l’account.
- Lo stato «in verifica» si vede solo come nota nel profilo; il codice della decisione non invia notifiche (lettura del codice), quindi il titolare vede l’esito alla visita successiva.
- Un solo titolare per azienda; l’elenco strutture nelle pagine dei corsi mostra le strutture del titolare o l’unica del record di personale.
- Limiti dei campi: nome pubblico e ragione sociale 120, città 80, indirizzo 200, sito web 200, descrizione 1000, numero di affiliazione 40 caratteri.
- Il plurale «1 servizi selezionati» nel selettore dei servizi non è gestito (da sistemare, D9).
