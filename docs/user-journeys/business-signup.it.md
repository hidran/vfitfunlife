# VFit: percorsi di registrazione aziendale

Come un'**azienda** (palestra, scuola o studio) si registra come provider, viene approvata dal back office, compare nella ricerca e in **Palestre e scuole**, gestisce il proprio profilo, e come un amministratore libera una partita IVA, passo per passo.

*English version: [business-signup.md](business-signup.md).*

> **Screenshot in attesa di B10.** I passaggi qui sotto descrivono il codice così com'è. Gli screenshot non sono ancora stati catturati: il task B10 del [piano account aziendali](../plans/2026-10-04-business-accounts-plan.md) li registra su staging e li salva in `screenshots-it/` (questa guida) e `screenshots/` (la guida inglese). Fino ad allora ogni passaggio elenca i nomi dei file attesi in una tabella `Schermata | File`.

| | |
|--------|----------------------------|
| **Stato** | Scritta dal codice su `main`; non ancora percorsa su staging |
| **Dispositivo** | Viewport mobile 390 × 844, come in [signup-to-booking.it.md](signup-to-booking.it.md) |
| **Account** | Un account aziendale nuovo (nessun dato aziendale reale), l'account admin demo e un cliente per cercare |
| **Riferimenti** | [Account aziendali](../features.md#business-company-accounts), [`applyAsProvider` e funzioni collegate](../backend/cloud-functions.md#provider-signup-and-business-accounts-functionssrcproviders) |

---

## Il percorso in sintesi

| # | Titolare dell'azienda | Admin | Cliente |
|--|------------------|------------------|------------------|
| 1 | Si registra come **Azienda** con ragione sociale, P.IVA, nome pubblico, tipo di sede e indirizzo | | |
| 2 | Vede **Richiesta in revisione**: la P.IVA è in verifica | Apre `/admin/providers`, filtra **Aziende**, apre l'azienda e la **verifica** | |
| 3 | L'azienda è attiva | | Cerca in **Prenota un servizio** il nome pubblico o la ragione sociale e vede logo e badge **Azienda** |
| 4 | Modifica nome pubblico, descrizione, sito web, città e logo | | |
| 5 | Salva una posizione perché la sede possa essere trovata | | Apre **Palestre e scuole** e trova la sede dell'azienda |
| 6 | | Libera una P.IVA perché un'altra azienda possa registrarla | |

Un'azienda è **sempre** esaminata da una persona, anche con l'approvazione automatica dei provider attiva (i privati continuano ad approvarsi da soli).

---

## 1. L'azienda si registra

Un nuovo visitatore sceglie **Registrati come provider**, che apre `/auth/register?as=provider`. Dopo i dati personali (nome, email, password) l'opzione professionale è già spuntata: **Voglio anche offrire servizi come professionista**.

Un controllo a due opzioni, **Ti registri come**, propone **Privato** e **Azienda**. Scegliendo **Azienda** compare il modulo aziendale:

- **Ragione sociale** e **Partita IVA** (11 cifre, con cifra di controllo verificata). Spazi o prefisso `IT` incollati vanno bene: il numero viene normalizzato.
- **Nome pubblico**, il nome che vedranno i clienti. Se lo lasci vuoto usiamo la ragione sociale.
- **Tipo di sede**: Palestra, Scuola, Studio o *Nessuna sede fissa*. Ogni tipo tranne *Nessuna sede fissa* richiede **indirizzo** e **città**, e ottiene una sede all'approvazione.
- **Sito web** (facoltativo, `http://` o `https://`).

Il titolare sceglie poi i servizi offerti, accetta i termini e tocca **Crea account**.

Gli errori compaiono sotto il campo che li ha causati, vengono annunciati agli screen reader e il focus passa al primo:

- Una partita IVA non valida: *Partita IVA non valida: servono 11 cifre con cifra di controllo corretta*.
- Una partita IVA già registrata da un'altra azienda: *Questa partita IVA è già registrata*.

Un cliente già registrato può fare lo stesso da **Diventa un professionista** in `/profile`, che ha lo stesso controllo Privato / Azienda.

| Schermata | File |
|--------|------|
| Modulo di registrazione con **Azienda** selezionata e i campi compilati | `business-01-signup-company.png` |
| Errore sotto la partita IVA (non valida o già registrata) | `business-02-signup-vat-error.png` |

> **Dietro le quinte.** `applyAsProvider` valida i dati e, in un'unica transazione, registra il claim `businessVat/<P.IVA>` e salva la domanda come *in attesa*: `users.providerStatus: 'pending'`, `providerType: 'business'` e la mappa `business` in `instructors/<uid>`. Nulla è ancora pubblico. Vedi il [riferimento delle funzioni](../backend/cloud-functions.md#provider-signup-and-business-accounts-functionssrcproviders).

Dopo l'invio il titolare arriva sulla schermata esistente **Richiesta in revisione**. Per un'azienda il testo dice che stiamo verificando la partita IVA e i dati aziendali.

| Schermata | File |
|--------|------|
| Schermata di attesa per un'azienda | `business-03-pending.png` |

---

## 2. L'admin esamina e approva

Un admin (o superadmin) apre **Provider** (`/admin/providers`). Il filtro **Tipo** offre **Tutti**, **Privati** e **Aziende**: scegli **Aziende**. Ogni riga di un'azienda ha il badge **Azienda**.

Aprendo l'azienda si vedono i dettagli consueti del provider più un blocco **Azienda**: ragione sociale, P.IVA, nome pubblico, tipo di sede, indirizzo, città, sito web e logo. L'admin controlla ragione sociale e P.IVA, poi tocca **Verifica** (o **Rifiuta**).

L'approvazione:

- promuove l'account a provider, assegna gli orari predefiniti lun-ven 09:00-17:00 e una bozza di servizio per ogni servizio scelto;
- crea la **sede** dell'azienda, `venues/biz_<uid>`, per ogni tipo di sede tranne *Nessuna sede fissa*: di proprietà dell'azienda, **stato partner in attesa**, non ancora partner;
- scrive una voce nel registro di audit.

Approvare due volte non crea mai una seconda sede. Se esiste già una sede con quell'id (per esempio creata a mano da un admin), l'approvazione viene rifiutata per intero e l'admin vede *La sede di questa azienda esiste già, quindi non è stato approvato nulla. Controlla la sede in Sedi, poi riprova.* Risolto il conflitto, si approva di nuovo.

| Schermata | File |
|--------|------|
| `/admin/providers` filtrato su **Aziende** | `business-04-admin-list-companies.png` |
| Dettaglio azienda con il blocco **Azienda** e le azioni Verifica / Rifiuta | `business-05-admin-company-detail.png` |

---

## 3. L'azienda compare nella ricerca con il badge

Un cliente apre **Prenota un servizio** (`/booking`) e digita il nome pubblico dell'azienda, oppure la ragione sociale: sono indicizzati entrambi. La riga del risultato mostra il **logo** (dopo il caricamento) e il badge **Azienda** accanto al nome. Toccandola si apre la pagina dell'azienda (`/providers/detail?id=...`), con lo stesso badge, e da lì la prenotazione funziona come per i provider privati. Le schede dei provider privati non cambiano.

| Schermata | File |
|--------|------|
| Risultato di ricerca dell'azienda, con logo e badge | `business-06-search-badge.png` |
| La pagina provider dell'azienda | `business-07-provider-page.png` |

---

## 4. Il titolare modifica profilo e logo

Il titolare apre `/profile/edit` e la scheda **Professionale**. La sezione **Dati aziendali** si salva da sola con **Salva dati aziendali**. Può cambiare:

- il **nome pubblico**: aggiorna anche il nome mostrato nella ricerca (l'indice si allinea in pochi istanti);
- **descrizione**, **sito web** e **città**;
- il **logo**: **Cambia logo** apre il selettore di file; la nuova immagine compare nella ricerca e nella pagina dell'azienda.

**Ragione sociale, partita IVA, tipo di sede e indirizzo sono di sola lettura.** Sono ciò che l'admin ha verificato: il modulo mostra un avviso (*Verificato da un amministratore: contatta il supporto per modificarlo.*) e le regole di Firestore rifiutano ogni tentativo di modificarli.

Dopo il salvataggio il modulo conferma *Dati aziendali salvati*.

| Schermata | File |
|--------|------|
| **Dati aziendali** nella scheda Professionale, campi bloccati in sola lettura | `business-08-edit-profile.png` |

---

## 5. La sede compare in Palestre e scuole

`/fit/gyms` (**Palestre e scuole**) elenca ogni sede di tipo palestra, scuola o studio. La sede dell'azienda compare quando ha una posizione: il titolare salva la posizione dalla schermata **La tua posizione** (`/provider/location`), la sede ne copia coordinate e città e le segue quando il titolare la sposta (`syncBusinessVenueLocation`). Compaiono anche le sedi in attesa che hanno coordinate.

La sede nasce con stato partner *in attesa*. Un admin può aprirla in **Sedi** (`/admin/venues`, che ha una colonna **Proprietario** con l'azienda) e impostarne lo stato partner e gli sconti. Solo una sede partner *attiva* può pubblicare e vendere un calendario di lezioni.

| Schermata | File |
|--------|------|
| Elenco **Palestre e scuole** con la sede dell'azienda | `business-09-gyms-and-schools.png` |

---

## 6. L'admin libera una P.IVA

Ogni partita IVA appartiene a una sola azienda. Un'azienda rifiutata mantiene il suo claim, così la stessa persona può ripresentare la domanda; se un numero è occupato per errore o abbandonato, un admin lo libera.

Nella pagina di dettaglio dell'azienda, nel blocco **Azienda**, tocca **Libera P.IVA**. Una finestra ripete il numero (*La partita IVA ... tornerà disponibile per una nuova registrazione. I dati dell'azienda restano invariati.*) e aggiunge un avviso più forte se l'azienda è già verificata e attiva. L'admin può indicare un **Motivo**, poi tocca **Libera**. La pagina conferma *P.IVA liberata* (oppure *La P.IVA era già libera*). Il rilascio viene scritto nel registro di audit nella stessa transazione; la scheda dell'azienda conserva il numero dichiarato.

Da quel momento un'altra azienda può registrare quella partita IVA.

| Schermata | File |
|--------|------|
| Finestra **Libera P.IVA** con il campo motivo | `business-10-admin-release-vat.png` |
