/**
 * Server copy of the professional services taxonomy.
 *
 * Duplicated from src/lib/serviceCategories.ts for the same reason the audit vocabulary is
 * duplicated: `src/` and `functions/` are separate TypeScript projects with no shared
 * module. Kept import-free so a test can load both halves and compare them —
 * src/lib/serviceCategories.test.ts fails if they drift.
 *
 * Existing Italian fitness/wellness leaf labels retain their stored spelling for legacy
 * matching; additional localized leaves broaden professional onboarding and discovery.
 *
 * Spec: docs/superpowers/specs/2026-08-13-service-taxonomy-design.md §5
 */

export interface CategoryDoc {
  parentId: string | null;
  names: { it: string; en: string; es: string; fr: string; de: string };
  icon: string;
  sections: string[];
  order: number;
  isActive: boolean;
}

export const SERVICE_CATEGORY_TREE: Record<string, CategoryDoc> = {
  strength_conditioning: {
    parentId: null, icon: "💪", sections: ["fit"], order: 10, isActive: true,
    names: {
      it: "Forza e Condizionamento", en: "Strength & Conditioning",
      es: "Fuerza y Acondicionamiento", fr: "Force et Conditionnement",
      de: "Kraft & Konditionierung",
    },
  },
  cardio_endurance: {
    parentId: null, icon: "🏃", sections: ["fit"], order: 20, isActive: true,
    names: {
      it: "Cardio e Resistenza", en: "Cardio & Endurance",
      es: "Cardio y Resistencia", fr: "Cardio et Endurance",
      de: "Cardio & Ausdauer",
    },
  },
  combat: {
    parentId: null, icon: "🥊", sections: ["fit"], order: 30, isActive: true,
    names: {
      it: "Sport da Combattimento", en: "Combat Sports",
      es: "Deportes de Combate", fr: "Sports de Combat", de: "Kampfsport",
    },
  },
  mind_body: {
    parentId: null, icon: "🧘", sections: ["fit", "life"], order: 40, isActive: true,
    names: {
      it: "Mente e Corpo", en: "Mind & Body", es: "Mente y Cuerpo",
      fr: "Corps et Esprit", de: "Körper & Geist",
    },
  },
  dance_group: {
    parentId: null, icon: "💃", sections: ["fit"], order: 50, isActive: true,
    names: {
      it: "Danza e Gruppo", en: "Dance & Group", es: "Baile y Grupo",
      fr: "Danse et Groupe", de: "Tanz & Gruppe",
    },
  },
  therapy_recovery: {
    parentId: null, icon: "🖐️", sections: ["life"], order: 60, isActive: true,
    names: {
      it: "Terapia e Recupero", en: "Therapy & Recovery",
      es: "Terapia y Recuperación", fr: "Thérapie et Récupération",
      de: "Therapie & Regeneration",
    },
  },
  nutrition_lifestyle: {
    parentId: null, icon: "🥗", sections: ["fit", "life"], order: 70, isActive: true,
    names: {
      it: "Nutrizione e Stile di Vita", en: "Nutrition & Lifestyle",
      es: "Nutrición y Estilo de Vida", fr: "Nutrition et Mode de Vie",
      de: "Ernährung & Lebensstil",
    },
  },
  mental_wellness: {
    parentId: null, icon: "🧠", sections: ["life"], order: 80, isActive: true,
    names: {
      it: "Benessere Mentale", en: "Mental Wellness",
      es: "Bienestar Mental", fr: "Bien-être Mental", de: "Mentales Wohlbefinden",
    },
  },

  personal_training: {
    parentId: "strength_conditioning", icon: "💪", sections: ["fit"], order: 11, isActive: true,
    names: {
      it: "Personal Training", en: "Personal Training", es: "Entrenamiento Personal",
      fr: "Coaching Personnel", de: "Personal Training",
    },
  },
  hiit: {
    parentId: "strength_conditioning", icon: "🔥", sections: ["fit"], order: 12, isActive: true,
    names: { it: "HIIT", en: "HIIT", es: "HIIT", fr: "HIIT", de: "HIIT" },
  },
  crossfit: {
    parentId: "strength_conditioning", icon: "🏋️", sections: ["fit"], order: 13, isActive: true,
    names: { it: "CrossFit", en: "CrossFit", es: "CrossFit", fr: "CrossFit", de: "CrossFit" },
  },
  strength_training: {
    parentId: "strength_conditioning", icon: "🏋️‍♀️", sections: ["fit"], order: 14, isActive: true,
    names: {
      it: "Strength Training", en: "Strength Training", es: "Entrenamiento de Fuerza",
      fr: "Musculation", de: "Krafttraining",
    },
  },
  functional_training: {
    parentId: "strength_conditioning", icon: "🤾", sections: ["fit"], order: 15, isActive: true,
    names: {
      it: "Functional Training", en: "Functional Training", es: "Entrenamiento Funcional",
      fr: "Entraînement Fonctionnel", de: "Funktionelles Training",
    },
  },

  cardio: {
    parentId: "cardio_endurance", icon: "❤️", sections: ["fit"], order: 21, isActive: true,
    names: { it: "Cardio", en: "Cardio", es: "Cardio", fr: "Cardio", de: "Cardio" },
  },
  spinning: {
    parentId: "cardio_endurance", icon: "🚴", sections: ["fit"], order: 22, isActive: true,
    names: { it: "Spinning", en: "Spinning", es: "Spinning", fr: "Spinning", de: "Spinning" },
  },
  swimming: {
    parentId: "cardio_endurance", icon: "🏊", sections: ["fit"], order: 23, isActive: true,
    names: { it: "Nuoto", en: "Swimming", es: "Natación", fr: "Natation", de: "Schwimmen" },
  },

  boxing: {
    parentId: "combat", icon: "🥊", sections: ["fit"], order: 31, isActive: true,
    names: { it: "Boxe", en: "Boxing", es: "Boxeo", fr: "Boxe", de: "Boxen" },
  },
  martial_arts: {
    parentId: "combat", icon: "🥋", sections: ["fit"], order: 32, isActive: true,
    names: {
      it: "Arti Marziali", en: "Martial Arts", es: "Artes Marciales",
      fr: "Arts Martiaux", de: "Kampfkunst",
    },
  },

  yoga: {
    parentId: "mind_body", icon: "🧘", sections: ["fit", "life"], order: 41, isActive: true,
    names: { it: "Yoga", en: "Yoga", es: "Yoga", fr: "Yoga", de: "Yoga" },
  },
  pilates: {
    parentId: "mind_body", icon: "🤸", sections: ["fit", "life"], order: 42, isActive: true,
    names: { it: "Pilates", en: "Pilates", es: "Pilates", fr: "Pilates", de: "Pilates" },
  },
  yoga_therapy: {
    parentId: "mind_body", icon: "🌿", sections: ["life"], order: 43, isActive: true,
    names: {
      it: "Yoga Therapy", en: "Yoga Therapy", es: "Yoga Terapéutico",
      fr: "Yoga Thérapeutique", de: "Yogatherapie",
    },
  },

  dance: {
    parentId: "dance_group", icon: "💃", sections: ["fit"], order: 51, isActive: true,
    names: { it: "Danza", en: "Dance", es: "Baile", fr: "Danse", de: "Tanz" },
  },
  group_fitness: {
    parentId: "dance_group", icon: "👥", sections: ["fit"], order: 52, isActive: true,
    names: {
      it: "Group Fitness", en: "Group Fitness", es: "Fitness en Grupo",
      fr: "Fitness en Groupe", de: "Gruppenfitness",
    },
  },

  physio: {
    parentId: "therapy_recovery", icon: "🏥", sections: ["life"], order: 61, isActive: true,
    names: {
      it: "Fisioterapia", en: "Physiotherapy", es: "Fisioterapia",
      fr: "Physiothérapie", de: "Physiotherapie",
    },
  },
  osteopathy: {
    parentId: "therapy_recovery", icon: "🦴", sections: ["life"], order: 62, isActive: true,
    names: {
      it: "Osteopatia", en: "Osteopathy", es: "Osteopatía",
      fr: "Ostéopathie", de: "Osteopathie",
    },
  },
  massage: {
    parentId: "therapy_recovery", icon: "💆", sections: ["life"], order: 63, isActive: true,
    names: { it: "Massaggio", en: "Massage", es: "Masaje", fr: "Massage", de: "Massage" },
  },

  nutrition: {
    parentId: "nutrition_lifestyle", icon: "🥗", sections: ["fit", "life"], order: 71, isActive: true,
    names: {
      it: "Nutrizione", en: "Nutrition", es: "Nutrición",
      fr: "Nutrition", de: "Ernährung",
    },
  },

  psychology: {
    parentId: "mental_wellness", icon: "🧠", sections: ["life"], order: 81, isActive: true,
    names: {
      it: "Psicologia", en: "Psychology", es: "Psicología",
      fr: "Psychologie", de: "Psychologie",
    },
  },
  mental_coaching: {
    parentId: "mental_wellness", icon: "🎯", sections: ["life"], order: 82, isActive: true,
    names: {
      it: "Mental Coaching", en: "Mental Coaching", es: "Coaching Mental",
      fr: "Coaching Mental", de: "Mentalcoaching",
    },
  },

  // --------------------------------------------------------- Photo & video
  photo_video: {
    parentId: null, icon: "📷", sections: ["fun"], order: 90, isActive: true,
    names: {
      it: "Foto e Video", en: "Photography & Video", es: "Fotografía y Vídeo",
      fr: "Photo et Vidéo", de: "Foto & Video",
    },
  },
  photographer: {
    parentId: "photo_video", icon: "📸", sections: ["fun"], order: 91, isActive: true,
    names: {
      it: "Fotografo", en: "Photographer", es: "Fotógrafo",
      fr: "Photographe", de: "Fotograf",
    },
  },
  videographer: {
    parentId: "photo_video", icon: "🎥", sections: ["fun"], order: 92, isActive: true,
    names: {
      it: "Videomaker", en: "Videographer", es: "Videógrafo",
      fr: "Vidéaste", de: "Videograf",
    },
  },
  wedding_photographer: {
    parentId: "photo_video", icon: "💍", sections: ["fun"], order: 93, isActive: true,
    names: {
      it: "Fotografo per Matrimoni", en: "Wedding Photographer",
      es: "Fotógrafo de Bodas", fr: "Photographe de Mariage", de: "Hochzeitsfotograf",
    },
  },
  photo_booth: {
    parentId: "photo_video", icon: "🖼️", sections: ["fun"], order: 94, isActive: true,
    names: {
      it: "Photo Booth", en: "Photo Booth", es: "Fotomatón",
      fr: "Photobooth", de: "Fotobox",
    },
  },

  // ------------------------------------------------------ Events & parties
  events_parties: {
    parentId: null, icon: "🎉", sections: ["fun"], order: 100, isActive: true,
    names: {
      it: "Eventi e Feste", en: "Events & Parties", es: "Eventos y Fiestas",
      fr: "Événements et Fêtes", de: "Events & Feiern",
    },
  },
  event_planner: {
    parentId: "events_parties", icon: "🗓️", sections: ["fun"], order: 101, isActive: true,
    names: {
      it: "Organizzatore di Eventi", en: "Event Planner", es: "Organizador de Eventos",
      fr: "Organisateur d’Événements", de: "Eventplaner",
    },
  },
  wedding_planner: {
    parentId: "events_parties", icon: "💍", sections: ["fun"], order: 102, isActive: true,
    names: {
      it: "Wedding Planner", en: "Wedding Planner", es: "Organizador de Bodas",
      fr: "Organisateur de Mariage", de: "Hochzeitsplaner",
    },
  },
  party_venue: {
    parentId: "events_parties", icon: "🏛️", sections: ["fun"], order: 103, isActive: true,
    names: {
      it: "Location per Feste ed Eventi", en: "Party & Event Venue",
      es: "Espacio para Fiestas y Eventos", fr: "Lieu de Réception", de: "Eventlocation",
    },
  },
  dj: {
    parentId: "events_parties", icon: "🎧", sections: ["fun"], order: 104, isActive: true,
    names: { it: "DJ", en: "DJ", es: "DJ", fr: "DJ", de: "DJ" },
  },
  live_music: {
    parentId: "events_parties", icon: "🎸", sections: ["fun"], order: 105, isActive: true,
    names: {
      it: "Musica dal Vivo", en: "Live Music", es: "Música en Directo",
      fr: "Musique Live", de: "Live-Musik",
    },
  },
  entertainer: {
    parentId: "events_parties", icon: "🎭", sections: ["fun"], order: 106, isActive: true,
    names: {
      it: "Animatore e Intrattenitore", en: "Entertainer",
      es: "Animador", fr: "Animateur", de: "Unterhalter",
    },
  },
  catering: {
    parentId: "events_parties", icon: "🍽️", sections: ["fun"], order: 107, isActive: true,
    names: {
      it: "Catering", en: "Catering", es: "Catering", fr: "Traiteur", de: "Catering",
    },
  },
  event_decoration: {
    parentId: "events_parties", icon: "🎈", sections: ["fun"], order: 108, isActive: true,
    names: {
      it: "Allestimenti e Decorazioni", en: "Event Decoration",
      es: "Decoración de Eventos", fr: "Décoration Événementielle", de: "Eventdekoration",
    },
  },

  // ------------------------------------------------- Beauty & personal care
  beauty_personal_care: {
    parentId: null, icon: "💄", sections: ["life"], order: 110, isActive: true,
    names: {
      it: "Bellezza e Cura della Persona", en: "Beauty & Personal Care",
      es: "Belleza y Cuidado Personal", fr: "Beauté et Soins Personnels",
      de: "Beauty & Körperpflege",
    },
  },
  esthetician: {
    parentId: "beauty_personal_care", icon: "✨", sections: ["life"], order: 111, isActive: true,
    names: {
      it: "Estetista", en: "Beautician", es: "Esteticista",
      fr: "Esthéticienne", de: "Kosmetiker",
    },
  },
  hairdresser: {
    parentId: "beauty_personal_care", icon: "💇", sections: ["life"], order: 112, isActive: true,
    names: {
      it: "Parrucchiere", en: "Hairdresser", es: "Peluquero",
      fr: "Coiffeur", de: "Friseur",
    },
  },
  barber: {
    parentId: "beauty_personal_care", icon: "💈", sections: ["life"], order: 113, isActive: true,
    names: {
      it: "Barbiere", en: "Barber", es: "Barbero", fr: "Barbier", de: "Barbier",
    },
  },
  nail_technician: {
    parentId: "beauty_personal_care", icon: "💅", sections: ["life"], order: 114, isActive: true,
    names: {
      it: "Onicotecnica", en: "Nail Technician", es: "Técnico de Uñas",
      fr: "Prothésiste Ongulaire", de: "Nageldesigner",
    },
  },
  makeup_artist: {
    parentId: "beauty_personal_care", icon: "💄", sections: ["life"], order: 115, isActive: true,
    names: {
      it: "Make-up Artist", en: "Makeup Artist", es: "Maquillador",
      fr: "Maquilleur", de: "Make-up-Artist",
    },
  },
  waxing: {
    parentId: "beauty_personal_care", icon: "🌿", sections: ["life"], order: 116, isActive: true,
    names: {
      it: "Depilazione", en: "Waxing & Hair Removal", es: "Depilación",
      fr: "Épilation", de: "Haarentfernung",
    },
  },
  bridal_beauty: {
    parentId: "beauty_personal_care", icon: "👰", sections: ["life", "fun"], order: 117, isActive: true,
    names: {
      it: "Beauty Sposa", en: "Bridal Beauty", es: "Belleza para Novias",
      fr: "Beauté de la Mariée", de: "Brautstyling",
    },
  },

  // -------------------------------------------------------- Home services
  home_maintenance: {
    parentId: null, icon: "🏠", sections: ["life"], order: 120, isActive: true,
    names: {
      it: "Casa e Manutenzione", en: "Home & Maintenance",
      es: "Hogar y Mantenimiento", fr: "Maison et Entretien", de: "Haus & Instandhaltung",
    },
  },
  plumbing: {
    parentId: "home_maintenance", icon: "🚰", sections: ["life"], order: 121, isActive: true,
    names: { it: "Idraulico", en: "Plumber", es: "Fontanero", fr: "Plombier", de: "Klempner" },
  },
  electrician: {
    parentId: "home_maintenance", icon: "🔌", sections: ["life"], order: 122, isActive: true,
    names: { it: "Elettricista", en: "Electrician", es: "Electricista", fr: "Électricien", de: "Elektriker" },
  },
  cleaning: {
    parentId: "home_maintenance", icon: "🧹", sections: ["life"], order: 123, isActive: true,
    names: {
      it: "Pulizie", en: "Cleaning", es: "Limpieza", fr: "Nettoyage", de: "Reinigung",
    },
  },
  gardening: {
    parentId: "home_maintenance", icon: "🌱", sections: ["life"], order: 124, isActive: true,
    names: {
      it: "Giardinaggio", en: "Gardening", es: "Jardinería",
      fr: "Jardinage", de: "Gartenpflege",
    },
  },
  handyman: {
    parentId: "home_maintenance", icon: "🛠️", sections: ["life"], order: 125, isActive: true,
    names: {
      it: "Tuttofare", en: "Handyman", es: "Manitas", fr: "Homme à tout faire", de: "Allround-Handwerker",
    },
  },
  carpenter: {
    parentId: "home_maintenance", icon: "🪚", sections: ["life"], order: 126, isActive: true,
    names: {
      it: "Falegname", en: "Carpenter", es: "Carpintero",
      fr: "Menuisier", de: "Tischler",
    },
  },
  painter: {
    parentId: "home_maintenance", icon: "🖌️", sections: ["life"], order: 127, isActive: true,
    names: {
      it: "Imbianchino", en: "Painter & Decorator", es: "Pintor",
      fr: "Peintre en Bâtiment", de: "Maler",
    },
  },
  locksmith: {
    parentId: "home_maintenance", icon: "🔑", sections: ["life"], order: 128, isActive: true,
    names: { it: "Fabbro", en: "Locksmith", es: "Cerrajero", fr: "Serrurier", de: "Schlosser" },
  },
  appliance_repair: {
    parentId: "home_maintenance", icon: "🧰", sections: ["life"], order: 129, isActive: true,
    names: {
      it: "Riparazione Elettrodomestici", en: "Appliance Repair",
      es: "Reparación de Electrodomésticos", fr: "Réparation Électroménager",
      de: "Gerätereparatur",
    },
  },
  moving: {
    parentId: "home_maintenance", icon: "📦", sections: ["life"], order: 130, isActive: true,
    names: { it: "Traslochi", en: "Moving Services", es: "Mudanzas", fr: "Déménagement", de: "Umzug" },
  },
  pest_control: {
    parentId: "home_maintenance", icon: "🪲", sections: ["life"], order: 131, isActive: true,
    names: {
      it: "Disinfestazione", en: "Pest Control", es: "Control de Plagas",
      fr: "Désinsectisation", de: "Schädlingsbekämpfung",
    },
  },

  // -------------------------------------------------------- Lessons & tutors
  lessons_tutoring: {
    parentId: null, icon: "📚", sections: ["life"], order: 140, isActive: true,
    names: {
      it: "Lezioni e Ripetizioni", en: "Lessons & Tutoring",
      es: "Clases y Tutorías", fr: "Cours et Soutien Scolaire", de: "Unterricht & Nachhilfe",
    },
  },
  tutor: {
    parentId: "lessons_tutoring", icon: "📖", sections: ["life"], order: 141, isActive: true,
    names: {
      it: "Ripetizioni", en: "Tutor", es: "Profesor Particular",
      fr: "Soutien Scolaire", de: "Nachhilfelehrer",
    },
  },
  language_tutor: {
    parentId: "lessons_tutoring", icon: "🌍", sections: ["life"], order: 142, isActive: true,
    names: {
      it: "Lezioni di Lingua", en: "Language Tutor", es: "Clases de Idiomas",
      fr: "Cours de Langues", de: "Sprachunterricht",
    },
  },
  music_teacher: {
    parentId: "lessons_tutoring", icon: "🎹", sections: ["life"], order: 143, isActive: true,
    names: {
      it: "Lezioni di Musica", en: "Music Teacher", es: "Profesor de Música",
      fr: "Professeur de Musique", de: "Musiklehrer",
    },
  },
  dance_teacher: {
    parentId: "lessons_tutoring", icon: "🩰", sections: ["fit", "life"], order: 144, isActive: true,
    names: {
      it: "Insegnante di Danza", en: "Dance Teacher", es: "Profesor de Baile",
      fr: "Professeur de Danse", de: "Tanzlehrer",
    },
  },

  // ----------------------------------------------------------- Technology
  technology_support: {
    parentId: null, icon: "💻", sections: ["life"], order: 150, isActive: true,
    names: {
      it: "Informatica e Tecnologia", en: "Technology & IT",
      es: "Tecnología e Informática", fr: "Technologie et Informatique",
      de: "Technologie & IT",
    },
  },
  computer_repair: {
    parentId: "technology_support", icon: "🖥️", sections: ["life"], order: 151, isActive: true,
    names: {
      it: "Riparazione Computer", en: "Computer Repair", es: "Reparación de Ordenadores",
      fr: "Dépannage Informatique", de: "Computerreparatur",
    },
  },
  web_design: {
    parentId: "technology_support", icon: "🌐", sections: ["life"], order: 152, isActive: true,
    names: {
      it: "Web Design", en: "Web Design", es: "Diseño Web",
      fr: "Conception Web", de: "Webdesign",
    },
  },
  graphic_design: {
    parentId: "technology_support", icon: "🎨", sections: ["life"], order: 153, isActive: true,
    names: {
      it: "Graphic Design", en: "Graphic Design", es: "Diseño Gráfico",
      fr: "Design Graphique", de: "Grafikdesign",
    },
  },
  it_support: {
    parentId: "technology_support", icon: "🛜", sections: ["life"], order: 154, isActive: true,
    names: {
      it: "Assistenza Informatica", en: "IT Support", es: "Soporte Informático",
      fr: "Assistance Informatique", de: "IT-Support",
    },
  },

  // ------------------------------------------------ Professional services
  professional_services: {
    parentId: null, icon: "💼", sections: ["life"], order: 160, isActive: true,
    names: {
      it: "Servizi Professionali", en: "Professional Services",
      es: "Servicios Profesionales", fr: "Services Professionnels", de: "Professionelle Dienste",
    },
  },
  accountant: {
    parentId: "professional_services", icon: "🧾", sections: ["life"], order: 161, isActive: true,
    names: {
      it: "Commercialista", en: "Accountant", es: "Contable",
      fr: "Expert-Comptable", de: "Steuerberater",
    },
  },
  lawyer: {
    parentId: "professional_services", icon: "⚖️", sections: ["life"], order: 162, isActive: true,
    names: {
      it: "Avvocato", en: "Lawyer", es: "Abogado", fr: "Avocat", de: "Rechtsanwalt",
    },
  },
  translator: {
    parentId: "professional_services", icon: "🗣️", sections: ["life"], order: 163, isActive: true,
    names: {
      it: "Traduttore", en: "Translator", es: "Traductor",
      fr: "Traducteur", de: "Übersetzer",
    },
  },
  marketing_consultant: {
    parentId: "professional_services", icon: "📈", sections: ["life"], order: 164, isActive: true,
    names: {
      it: "Consulente Marketing", en: "Marketing Consultant",
      es: "Consultor de Marketing", fr: "Consultant Marketing", de: "Marketingberater",
    },
  },
  interior_designer: {
    parentId: "professional_services", icon: "🛋️", sections: ["life"], order: 165, isActive: true,
    names: {
      it: "Interior Designer", en: "Interior Designer", es: "Diseñador de Interiores",
      fr: "Architecte d’Intérieur", de: "Innenarchitekt",
    },
  },

  // ------------------------------------------------------ Automotive services
  automotive: {
    parentId: null, icon: "🚗", sections: ["life"], order: 170, isActive: true,
    names: {
      it: "Auto e Veicoli", en: "Automotive", es: "Automoción",
      fr: "Automobile", de: "Auto & Fahrzeuge",
    },
  },
  mechanic: {
    parentId: "automotive", icon: "🔧", sections: ["life"], order: 171, isActive: true,
    names: { it: "Meccanico", en: "Mechanic", es: "Mecánico", fr: "Mécanicien", de: "Mechaniker" },
  },
  auto_electrician: {
    parentId: "automotive", icon: "🔋", sections: ["life"], order: 172, isActive: true,
    names: {
      it: "Elettrauto", en: "Auto Electrician", es: "Electricista de Automóviles",
      fr: "Électricien Automobile", de: "Kfz-Elektriker",
    },
  },
  car_wash: {
    parentId: "automotive", icon: "🚿", sections: ["life"], order: 173, isActive: true,
    names: {
      it: "Autolavaggio e Detailing", en: "Car Wash & Detailing",
      es: "Lavado y Detallado de Coches", fr: "Lavage et Entretien Auto",
      de: "Autowäsche & Fahrzeugpflege",
    },
  },
};

/** Normalizes a label for matching: case-folded, accent-stripped, whitespace-collapsed. */
export function foldLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Folded label (every locale) -> category id, for resolving legacy specialty strings. */
export function buildLabelIndex(): Map<string, string> {
  const index = new Map<string, string>();
  for (const [id, doc] of Object.entries(SERVICE_CATEGORY_TREE)) {
    index.set(foldLabel(id.replace(/_/g, " ")), id);
    for (const label of Object.values(doc.names)) {
      // First writer wins: a group and a leaf never share a label in this tree, but if one
      // were ever added, the leaf must not silently displace the group or vice versa.
      const key = foldLabel(label);
      if (!index.has(key)) index.set(key, id);
    }
  }
  return index;
}

/** A category plus every ancestor, for the denormalized categoryIds array. */
export function withAncestors(categoryId: string): string[] {
  const out: string[] = [];
  let cursor: string | null = categoryId;
  // Bounded: a hand-edited self-referencing collection can form a cycle, and an unbounded
  // walk would hang the function rather than fail.
  for (let depth = 0; cursor && depth < 10; depth++) {
    if (out.includes(cursor)) break;
    out.push(cursor);
    cursor = SERVICE_CATEGORY_TREE[cursor]?.parentId ?? null;
  }
  return out;
}
