/**
 * Public, crawlable landing pages for the Torino pilot.
 *
 * The product itself is behind the auth gate in src/app/(main)/layout.tsx, so it contributes
 * nothing to organic search: Google only ever sees a login wall there. These pages are the
 * crawlable surface — one page per search intent ("palestre Torino", "personal trainer
 * Torino", "spa Torino", "eventi Torino"), each with its own title, description, H1 and copy.
 *
 * They are deliberately *not* generated from a template with swapped keywords: pages that
 * differ only in the city or the noun are treated as doorway pages. Every entry below has its
 * own angle, its own FAQ answers and its own links into the app.
 *
 * Copy is Italian only, like /diventa-trainer: these target Italian local searches, and the
 * product UI stays fully localised in the five app locales.
 */

export interface TorinoLandingSection {
  title: string;
  text: string;
}

export interface TorinoLandingFaq {
  question: string;
  answer: string;
}

export interface TorinoLanding {
  /** URL segment, without slashes. */
  slug: string;
  /** Browser title; the root template appends "| Vfitfunlife". */
  title: string;
  h1: string;
  /** Meta description, also reused as the page intro's summary. */
  description: string;
  intro: string;
  keywords: string[];
  sections: TorinoLandingSection[];
  faq: TorinoLandingFaq[];
  /** Deep link into the app, carried through the sign-in screen. */
  appHref: string;
  appLabel: string;
  /** Slugs of sibling pages, rendered as internal links. */
  related: string[];
}

const SITE_URL = 'https://vfit-funlife.web.app';

export function torinoLandingUrl(slug: string): string {
  return `${SITE_URL}/${slug}/`;
}

export const TORINO_LANDINGS: readonly TorinoLanding[] = [
  {
    slug: 'palestre-torino',
    title: 'Palestre e centri fitness a Torino',
    h1: 'Palestre e centri fitness a Torino',
    description:
      'Trova palestre e centri fitness a Torino su Vfitfunlife: orari, corsi e lezioni di gruppo, ' +
      'prenotazione online e pagamento tracciato, con recensioni dei clienti.',
    intro:
      'Scegliere una palestra a Torino significa confrontare tre cose che di solito stanno su siti ' +
      'diversi: gli orari reali, i corsi che ti interessano e quanto costa provarli. Su Vfitfunlife ' +
      'stanno nella stessa scheda, con la disponibilità aggiornata dal centro.',
    keywords: [
      'palestre Torino',
      'centri fitness Torino',
      'palestra Torino orari',
      'corsi fitness Torino',
      'lezioni di gruppo Torino',
      'sala pesi Torino',
      'prenotare palestra online',
    ],
    sections: [
      {
        title: 'Orari e calendario dei corsi',
        text: 'Il calendario del centro mostra le lezioni della settimana con posti e orari. Filtri per zona e distanza, così vedi prima quello che raggiungi a piedi o in metro.',
      },
      {
        title: 'Lezioni di gruppo e sale pesi',
        text: 'Corsi fitness, functional training, sala attrezzi: ogni servizio ha la sua scheda con durata, livello e prezzo, invece di un listino indistinguibile.',
      },
      {
        title: 'Prenotazione e pagamento in un passaggio',
        text: 'Scegli lo slot, confermi e paghi con Stripe. La prenotazione resta nel tuo account con lo storico degli accessi e degli importi.',
      },
      {
        title: 'Recensioni di chi si allena lì',
        text: 'Le valutazioni arrivano da clienti che hanno prenotato su Vfitfunlife, non da schede anonime: leggi cosa dicono di pulizia, affollamento e istruttori.',
      },
    ],
    faq: [
      {
        question: 'Come trovo una palestra vicino a casa a Torino?',
        answer:
          'Apri la ricerca, filtra per categoria palestre e ordina per distanza: la mappa e la lista usano la tua posizione per mostrare prima i centri raggiungibili a piedi o in metro.',
      },
      {
        question: 'Serve un abbonamento per prenotare un corso?',
        answer:
          'No. Puoi prenotare una singola lezione o un singolo ingresso e pagarlo online, senza sottoscrivere un abbonamento annuale al buio.',
      },
      {
        question: 'Posso disdire una prenotazione?',
        answer:
          'Sì, secondo la politica di cancellazione del centro, che è indicata nella scheda del servizio prima che tu confermi e paghi.',
      },
    ],
    appHref: '/fit/gyms',
    appLabel: 'Cerca palestre a Torino',
    related: ['personal-trainer-torino', 'spa-benessere-torino'],
  },
  {
    slug: 'personal-trainer-torino',
    title: 'Personal trainer a Torino: come sceglierlo',
    h1: 'Personal trainer a Torino',
    description:
      'Personal trainer a Torino su Vfitfunlife: sessioni in palestra, a domicilio, all’aperto o ' +
      'online, con certificazioni, recensioni e prenotazione diretta dal profilo.',
    intro:
      'Un personal trainer non si sceglie dal prezzo a seduta: conta l’esperienza sul tuo obiettivo, ' +
      'dove si allena e se le sue certificazioni sono verificabili. Su Vfitfunlife ogni profilo ' +
      'mostra queste informazioni prima che tu prenoti la prima sessione.',
    keywords: [
      'personal trainer Torino',
      'trainer a domicilio Torino',
      'personal trainer online',
      'scheda di allenamento personalizzata',
      'trovare personal trainer Torino',
      'prezzo personal trainer Torino',
    ],
    sections: [
      {
        title: 'Sessioni in palestra, a domicilio o online',
        text: 'Lo stesso trainer può offrire più formati: in sala pesi, a casa tua, in un parco o in videochiamata. Il tipo di location è scritto nella scheda del servizio, non concordato a posteriori in chat.',
      },
      {
        title: 'Specialità e certificazioni',
        text: 'Ogni profilo dichiara le specialità — ricomposizione, forza, posturale, gravidanza, sport agonistico — e le certificazioni, che lo staff verifica prima della pubblicazione.',
      },
      {
        title: 'Prezzo trasparente per singola sessione',
        text: 'Vedi il prezzo della seduta e l’eventuale pacchetto prima di scrivere al trainer. La commissione della piattaforma è a carico del professionista: il prezzo che leggi è quello che paghi.',
      },
      {
        title: 'Continuità, non una lezione sola',
        text: 'Prenoti la prima sessione, poi le successive dallo stesso profilo: storico, appunti e pagamenti restano insieme nel tuo account.',
      },
    ],
    faq: [
      {
        question: 'Quanto costa un personal trainer a Torino?',
        answer:
          'Dipende dal formato e dall’esperienza: le sessioni a domicilio e quelle online hanno prezzi diversi, e i pacchetti da più sedute costano meno della singola. Il prezzo esatto è indicato su ogni servizio prima della prenotazione.',
      },
      {
        question: 'Come capisco se il trainer è qualificato?',
        answer:
          'Le certificazioni dichiarate nel profilo vengono controllate dallo staff di Vfitfunlife prima della pubblicazione, e le recensioni arrivano solo da clienti che hanno prenotato e pagato tramite la piattaforma.',
      },
      {
        question: 'Posso fare una prova prima di impegnarmi?',
        answer:
          'Sì: prenoti una singola sessione, senza pacchetto. Se il metodo funziona, continui; se non ti trovi, non hai firmato nulla.',
      },
    ],
    appHref: '/booking?query=personal%20trainer',
    appLabel: 'Cerca un personal trainer',
    related: ['palestre-torino', 'spa-benessere-torino'],
  },
  {
    slug: 'spa-benessere-torino',
    title: 'Spa, massaggi ed estetica a Torino',
    h1: 'Spa, massaggi ed estetica a Torino',
    description:
      'Spa, massaggi e trattamenti estetici a Torino su Vfitfunlife: durata, prezzo e ' +
      'disponibilità trasparenti, prenotazione online e recensioni verificate.',
    intro:
      'Massaggi e trattamenti estetici si prenotano quasi sempre al telefono, con la disponibilità ' +
      'che cambia mentre parli. Su Vfitfunlife l’agenda del centro è visibile: scegli trattamento, ' +
      'durata e orario, e paghi quello che hai letto.',
    keywords: [
      'spa Torino',
      'massaggi Torino',
      'centro estetico Torino',
      'trattamenti viso Torino',
      'massaggio sportivo Torino',
      'benessere Torino prenotazione',
      'wellness Torino',
    ],
    sections: [
      {
        title: 'Massaggi e trattamenti con durata dichiarata',
        text: 'Massaggio sportivo, decontratturante, linfatico, trattamenti viso e corpo: ogni voce ha durata e prezzo, così confronti lo stesso servizio tra centri diversi senza telefonare.',
      },
      {
        title: 'Disponibilità reale, non “ti richiamiamo”',
        text: 'Gli orari liberi del centro compaiono nel calendario. Prenoti quello che vedi, e la conferma arriva subito.',
      },
      {
        title: 'Benessere mentale e percorsi',
        text: 'Oltre a estetica e massaggi, VLife raccoglie percorsi di benessere mentale e rilassamento, con professionisti selezionati.',
      },
      {
        title: 'Il giorno prima, il promemoria',
        text: 'Ricevi conferma e reminder prima dell’appuntamento, così non perdi il posto in agenda — e se devi spostare, lo fai dalle tue prenotazioni.',
      },
    ],
    faq: [
      {
        question: 'Come prenoto un massaggio a Torino?',
        answer:
          'Cerca la categoria massaggi, apri il centro che ti interessa, scegli il trattamento e l’orario disponibile, poi conferma e paga. Non serve chiamare la reception.',
      },
      {
        question: 'I centri sono verificati?',
        answer:
          'I professionisti e i centri passano una verifica dello staff prima di essere pubblicati, e le recensioni possono essere lasciate solo dopo un servizio prenotato tramite Vfitfunlife.',
      },
      {
        question: 'Posso regalare un trattamento?',
        answer:
          'Puoi prenotare e pagare un servizio per un’altra persona: il trattamento resta collegato all’appuntamento scelto con il centro.',
      },
    ],
    appHref: '/life/home-services',
    appLabel: 'Cerca spa e trattamenti',
    related: ['personal-trainer-torino', 'eventi-torino'],
  },
  {
    slug: 'eventi-torino',
    title: 'Eventi, feste ed esperienze VR a Torino',
    h1: 'Eventi, feste ed esperienze VR a Torino',
    description:
      'Eventi, feste private ed esperienze VR a Torino su Vfitfunlife: posti, prezzo e ' +
      'prenotazione online, con recensioni di chi c’è già stato.',
    intro:
      'Organizzare una serata a Torino richiede di mettere d’accordo posto, capienza e prezzo per ' +
      'un gruppo di persone. VFun raccoglie eventi, feste private ed esperienze immersive con ' +
      'capienza e prezzo visibili, e un solo link da girare al gruppo.',
    keywords: [
      'eventi Torino',
      'feste private Torino',
      'esperienze VR Torino',
      'cosa fare a Torino stasera',
      'eventi Torino prenotazione',
      'addio al celibato Torino',
      'compleanno Torino locale',
    ],
    sections: [
      {
        title: 'Posti e capienza in chiaro',
        text: 'Ogni evento indica quanti posti restano: quando organizzi per dieci persone sai subito se il tavolo c’è, senza catene di messaggi.',
      },
      {
        title: 'Feste private e gruppi',
        text: 'Compleanni, addii, serate aziendali: prenoti la data e il numero di partecipanti, e il locale conferma dalla sua agenda.',
      },
      {
        title: 'Esperienze VR e streaming',
        text: 'Le esperienze immersive e gli eventi in diretta hanno la stessa scheda degli altri servizi, con durata e requisiti.',
      },
      {
        title: 'Un link per tutto il gruppo',
        text: 'Paghi online e condividi la conferma: ognuno sa dove andare e a che ora, e tu non fai da tesoriere con i contanti.',
      },
    ],
    faq: [
      {
        question: 'Come prenoto un evento per un gruppo?',
        answer:
          'Apri l’evento, indica il numero di partecipanti e la data, poi conferma e paga. La capienza residua è aggiornata in tempo reale, quindi non prenoti un posto che non esiste.',
      },
      {
        question: 'Posso organizzare una festa privata a Torino?',
        answer:
          'Sì: molti locali su VFun accettano feste private e serate riservate. Scegli la struttura, indica data e persone, e ricevi la conferma dall’organizzatore.',
      },
      {
        question: 'Gli eventi si possono disdire?',
        answer:
          'Dipende dalla politica dell’organizzatore, che è scritta nella scheda dell’evento prima del pagamento.',
      },
    ],
    appHref: '/fun/events',
    appLabel: 'Cerca eventi a Torino',
    related: ['palestre-torino', 'spa-benessere-torino'],
  },
] as const;

export function findTorinoLanding(slug: string): TorinoLanding | undefined {
  return TORINO_LANDINGS.find((page) => page.slug === slug);
}

/** Build-time lookup for the page modules: a missing slug is a coding error, not a 404. */
export function requireTorinoLanding(slug: string): TorinoLanding {
  const page = findTorinoLanding(slug);
  if (!page) throw new Error(`Unknown Torino landing page: ${slug}`);
  return page;
}
