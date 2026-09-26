import type { AppLocale } from '@/types/locale';

export interface LandingWorld {
  name: 'VFit' | 'VFun' | 'VLife';
  label: string;
  text: string;
  items: string[];
}

export interface LandingStep {
  title: string;
  text: string;
}

export interface LandingFeature {
  title: string;
  text: string;
}

export interface LandingCopy {
  login: string;
  signUp: string;
  tagline: string;
  homeLabel: string;
  heroTitle: string;
  heroText: string;
  registerCustomer: string;
  registerProvider: string;
  stats: [string, string, string];
  worldsTitle: string;
  worldsText: string;
  worlds: LandingWorld[];
  customerBadge: string;
  customerTitle: string;
  customerText: string;
  customerCta: string;
  customerSteps: LandingStep[];
  providerBadge: string;
  providerTitle: string;
  providerText: string;
  providerCta: string;
  providerSteps: LandingStep[];
  aroundTitle: string;
  aroundText: string;
  features: LandingFeature[];
  footerText: string;
  language: string;
  appearance: string;
}

const english: LandingCopy = {
  login: 'Log in',
  signUp: 'Sign up',
  tagline: '#DOitDIFFERENTLY',
  homeLabel: 'Vfitfunlife home',
  heroTitle: 'Connect, train, transform',
  heroText: 'One mobile-first marketplace where customers book fitness, events and wellness, while providers turn their skills, calendar and service area into real appointments.',
  registerCustomer: 'Register as a customer',
  registerProvider: 'Register as a provider',
  stats: ['connected verticals', 'account for customers and providers', 'built around the Italian pilot'],
  worldsTitle: 'Three ways into the same active life',
  worldsText: 'One account across VFit, VFun and VLife, with a clear path to the service that fits the moment.',
  worlds: [
    { name: 'VFit', label: 'Training and gym', text: 'Gyms, classes, personal trainers and home workouts for people who want to train in the place that fits their day.', items: ['Gyms', 'Classes', 'At home', 'Virtual'] },
    { name: 'VFun', label: 'Events and social', text: 'Events, parties, VR experiences and social moments built around movement, discovery and shared energy.', items: ['Events', 'Parties', 'VR', 'Streaming'] },
    { name: 'VLife', label: 'Wellness and care', text: 'Spa, aesthetics, massage and mental wellness services for recovery, beauty and everyday wellbeing.', items: ['Wellness', 'Beauty', 'Massage', 'Mental wellness'] },
  ],
  customerBadge: 'Customer journey',
  customerTitle: 'For customers',
  customerText: 'Find the right trainer, gym, event, wellness center or home service without jumping between vertical apps. Profiles, pricing, availability and reviews stay in one flow.',
  customerCta: 'Start as a customer',
  customerSteps: [
    { title: 'Discover nearby services', text: 'Search by category, price, availability, rating and distance, then compare verified profiles.' },
    { title: 'Book with context', text: 'Choose a service, date, time and location type, then review notes, policies and the final price.' },
    { title: 'Stay on track', text: 'Get confirmations, reminders and review prompts across the same account you use for Fit, Fun and Life.' },
  ],
  providerBadge: 'Provider journey',
  providerTitle: 'For providers',
  providerText: 'Register with email, phone or social login, select the provider option, choose the categories you serve and move into verification, scheduling and bookings.',
  providerCta: 'Apply as a provider',
  providerSteps: [
    { title: 'Apply with your services', text: 'Choose service categories, set availability and submit for verification before your profile goes live.' },
    { title: 'Build trust', text: 'Add bio, certifications, languages, gallery, service radius and pricing that customers can understand quickly.' },
    { title: 'Run the calendar', text: 'Receive bookings, message customers, manage schedule and track payments from the provider workspace.' },
  ],
  aroundTitle: 'Built for the moments around the booking',
  aroundText: 'Vfitfunlife is more than a catalog. Messages, reminders, payments, reviews, maps and mobile permissions keep the experience moving before and after every session.',
  features: [
    { title: 'Nearby discovery', text: 'Map and list views help customers compare what is around them.' },
    { title: 'Customer contact', text: 'Profiles include messaging and service context before booking.' },
    { title: 'Reviews and trust', text: 'Ratings, verification badges and profile details make choices easier.' },
    { title: 'Payment ready', text: 'Stripe, deposits, promo codes and wallet concepts are already in the flow.' },
  ],
  footerText: 'One account for customers and providers across fitness, entertainment, wellness and beauty. Sign up now, or log in from the menu if you are already part of the pilot.',
  language: 'Language',
  appearance: 'Appearance',
};

const italian: LandingCopy = {
  login: 'Accedi', signUp: 'Registrati', tagline: '#DOitDIFFERENTLY', homeLabel: 'Home Vfitfunlife',
  heroTitle: 'Connetti, allenati, trasformati',
  heroText: 'Un marketplace pensato per il mobile dove i clienti prenotano fitness, eventi e benessere, mentre i professionisti trasformano competenze, agenda e zona di servizio in appuntamenti reali.',
  registerCustomer: 'Registrati come cliente', registerProvider: 'Registrati come provider',
  stats: ['verticali connesse', 'account per clienti e provider', 'nato dal pilota italiano'],
  worldsTitle: 'Tre strade per la stessa vita attiva', worldsText: 'Un account per VFit, VFun e VLife, con un percorso chiaro verso il servizio giusto per ogni momento.',
  worlds: [
    { name: 'VFit', label: 'Allenamento e palestre', text: 'Palestre, corsi, personal trainer e allenamenti a casa per allenarti dove si adatta meglio alla tua giornata.', items: ['Palestre', 'Corsi', 'A domicilio', 'Virtuale'] },
    { name: 'VFun', label: 'Eventi e socialità', text: 'Eventi, feste, esperienze VR e momenti social costruiti intorno a movimento, scoperta ed energia condivisa.', items: ['Eventi', 'Feste', 'VR', 'Streaming'] },
    { name: 'VLife', label: 'Benessere e cura', text: 'Spa, estetica, massaggi e benessere mentale per recupero, bellezza e benessere quotidiano.', items: ['Wellness', 'Estetica', 'Massaggi', 'Benessere mentale'] },
  ],
  customerBadge: 'Percorso cliente', customerTitle: 'Per i clienti',
  customerText: 'Trova il trainer, la palestra, l’evento, il centro benessere o il servizio a domicilio giusto senza saltare tra app diverse. Profili, prezzi, disponibilità e recensioni restano nello stesso percorso.',
  customerCta: 'Inizia come cliente',
  customerSteps: [
    { title: 'Scopri i servizi vicini', text: 'Cerca per categoria, prezzo, disponibilità, valutazione e distanza, poi confronta profili verificati.' },
    { title: 'Prenota con tutti i dettagli', text: 'Scegli servizio, data, ora e tipo di luogo, poi controlla note, regole e prezzo finale.' },
    { title: 'Resta aggiornato', text: 'Ricevi conferme, promemoria e richieste di recensione dallo stesso account per Fit, Fun e Life.' },
  ],
  providerBadge: 'Percorso provider', providerTitle: 'Per i professionisti',
  providerText: 'Registrati con email, telefono o social, seleziona l’opzione provider, scegli le categorie che offri e passa a verifica, agenda e prenotazioni.', providerCta: 'Candidati come provider',
  providerSteps: [
    { title: 'Candidati con i tuoi servizi', text: 'Scegli le categorie, imposta la disponibilità e invia il profilo alla verifica prima di renderlo visibile.' },
    { title: 'Costruisci fiducia', text: 'Aggiungi bio, certificazioni, lingue, galleria, area di servizio e prezzi facili da capire.' },
    { title: 'Gestisci la tua agenda', text: 'Ricevi prenotazioni, scrivi ai clienti, organizza gli orari e controlla i pagamenti dal tuo spazio provider.' },
  ],
  aroundTitle: 'Pensato per tutto ciò che accade intorno alla prenotazione',
  aroundText: 'Vfitfunlife è più di un catalogo. Messaggi, promemoria, pagamenti, recensioni, mappe e permessi mobile accompagnano l’esperienza prima e dopo ogni sessione.',
  features: [
    { title: 'Scopri cosa c’è vicino', text: 'Mappa ed elenco aiutano a confrontare i servizi nella tua zona.' },
    { title: 'Contatta il professionista', text: 'I profili includono messaggi e contesto sul servizio prima di prenotare.' },
    { title: 'Recensioni e fiducia', text: 'Valutazioni, verifiche e dettagli del profilo rendono più semplice scegliere.' },
    { title: 'Pagamenti pronti', text: 'Stripe, caparre, codici promozionali e wallet sono già parte del percorso.' },
  ],
  footerText: 'Un account per clienti e provider tra fitness, intrattenimento, benessere e bellezza. Registrati ora oppure accedi dal menu se fai già parte del pilota.', language: 'Lingua', appearance: 'Aspetto',
};

const translated: Record<Exclude<AppLocale, 'it' | 'en'>, LandingCopy> = {
  es: { ...english, login: 'Iniciar sesión', signUp: 'Registrarse', heroTitle: 'Conecta, entrena, transfórmate', heroText: 'Un marketplace pensado para móvil donde los clientes reservan fitness, eventos y bienestar, y los profesionales convierten sus habilidades y agenda en citas reales.', registerCustomer: 'Registrarse como cliente', registerProvider: 'Registrarse como proveedor', worldsTitle: 'Tres caminos para una vida activa', customerTitle: 'Para clientes', customerBadge: 'Ruta del cliente', customerCta: 'Empezar como cliente', providerTitle: 'Para proveedores', providerBadge: 'Ruta del proveedor', providerCta: 'Solicitar como proveedor', aroundTitle: 'Pensado para todo lo que rodea una reserva', language: 'Idioma', appearance: 'Apariencia' },
  fr: { ...english, login: 'Se connecter', signUp: "S'inscrire", heroTitle: 'Connecte, entraîne-toi, transforme-toi', heroText: 'Une marketplace pensée pour le mobile où les clients réservent fitness, événements et bien-être, tandis que les professionnels transforment leurs compétences en rendez-vous réels.', registerCustomer: "S'inscrire comme client", registerProvider: "S'inscrire comme prestataire", worldsTitle: 'Trois chemins vers une vie active', customerTitle: 'Pour les clients', customerBadge: 'Parcours client', customerCta: 'Commencer comme client', providerTitle: 'Pour les prestataires', providerBadge: 'Parcours prestataire', providerCta: 'Devenir prestataire', aroundTitle: 'Pensé pour tout ce qui entoure la réservation', language: 'Langue', appearance: 'Apparence' },
  de: { ...english, login: 'Anmelden', signUp: 'Registrieren', heroTitle: 'Verbinden, trainieren, verwandeln', heroText: 'Ein mobiler Marktplatz, auf dem Kunden Fitness, Events und Wellness buchen und Anbieter ihre Fähigkeiten in echte Termine verwandeln.', registerCustomer: 'Als Kunde registrieren', registerProvider: 'Als Anbieter registrieren', worldsTitle: 'Drei Wege zu einem aktiven Leben', customerTitle: 'Für Kunden', customerBadge: 'Kundenweg', customerCta: 'Als Kunde starten', providerTitle: 'Für Anbieter', providerBadge: 'Anbieterweg', providerCta: 'Als Anbieter bewerben', aroundTitle: 'Für alles rund um die Buchung', language: 'Sprache', appearance: 'Darstellung' },
};

export const landingCopy: Record<AppLocale, LandingCopy> = { it: italian, en: english, ...translated };
