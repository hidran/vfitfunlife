import type { ServiceCategoryDoc } from '@/types/serviceCategory';

export type { ServiceCategory } from '@/types/serviceCategory';

/**
 * The launch tree: 8 groups, 21 leaves.
 *
 * Doubles as the bundled fallback (rendered when the Firestore catalogue is loading,
 * errored, or empty) and as the payload for the seedServiceCategories callable, so the two
 * can never disagree.
 *
 * The Italian labels of the leaves are EXACTLY the strings already stored in
 * instructors.specialties in production. That is what makes the phase-2 backfill an exact
 * match rather than a guess — including the three values that exist only in seeded data
 * (Yoga Therapy, Psicologia, Osteopatia) and appear in no other list in this codebase.
 *
 * Five leaves currently have no providers (Group Fitness, Danza, Arti Marziali, Nuoto,
 * Spinning). They ship active on purpose: deactivating an empty category later is trivial,
 * a missing one blocks a provider at signup.
 *
 * VFun has no group yet — the structure is ready for events, parties and VR.
 *
 * Spec: docs/superpowers/specs/2026-08-13-service-taxonomy-design.md §5
 */
export const SERVICE_CATEGORY_TREE: Record<string, ServiceCategoryDoc> = {
  // ---------------------------------------------------------------- groups
  strength_conditioning: {
    parentId: null, icon: '💪', sections: ['fit'], order: 10, isActive: true,
    names: {
      it: 'Forza e Condizionamento', en: 'Strength & Conditioning',
      es: 'Fuerza y Acondicionamiento', fr: 'Force et Conditionnement',
      de: 'Kraft & Konditionierung',
    },
  },
  cardio_endurance: {
    parentId: null, icon: '🏃', sections: ['fit'], order: 20, isActive: true,
    names: {
      it: 'Cardio e Resistenza', en: 'Cardio & Endurance',
      es: 'Cardio y Resistencia', fr: 'Cardio et Endurance',
      de: 'Cardio & Ausdauer',
    },
  },
  combat: {
    parentId: null, icon: '🥊', sections: ['fit'], order: 30, isActive: true,
    names: {
      it: 'Sport da Combattimento', en: 'Combat Sports',
      es: 'Deportes de Combate', fr: 'Sports de Combat', de: 'Kampfsport',
    },
  },
  mind_body: {
    parentId: null, icon: '🧘', sections: ['fit', 'life'], order: 40, isActive: true,
    names: {
      it: 'Mente e Corpo', en: 'Mind & Body', es: 'Mente y Cuerpo',
      fr: 'Corps et Esprit', de: 'Körper & Geist',
    },
  },
  dance_group: {
    parentId: null, icon: '💃', sections: ['fit'], order: 50, isActive: true,
    names: {
      it: 'Danza e Gruppo', en: 'Dance & Group', es: 'Baile y Grupo',
      fr: 'Danse et Groupe', de: 'Tanz & Gruppe',
    },
  },
  therapy_recovery: {
    parentId: null, icon: '🖐️', sections: ['life'], order: 60, isActive: true,
    names: {
      it: 'Terapia e Recupero', en: 'Therapy & Recovery',
      es: 'Terapia y Recuperación', fr: 'Thérapie et Récupération',
      de: 'Therapie & Regeneration',
    },
  },
  nutrition_lifestyle: {
    parentId: null, icon: '🥗', sections: ['fit', 'life'], order: 70, isActive: true,
    names: {
      it: 'Nutrizione e Stile di Vita', en: 'Nutrition & Lifestyle',
      es: 'Nutrición y Estilo de Vida', fr: 'Nutrition et Mode de Vie',
      de: 'Ernährung & Lebensstil',
    },
  },
  mental_wellness: {
    parentId: null, icon: '🧠', sections: ['life'], order: 80, isActive: true,
    names: {
      it: 'Benessere Mentale', en: 'Mental Wellness',
      es: 'Bienestar Mental', fr: 'Bien-être Mental', de: 'Mentales Wohlbefinden',
    },
  },

  // ------------------------------------------------- Strength & Conditioning
  personal_training: {
    parentId: 'strength_conditioning', icon: '💪', sections: ['fit'], order: 11, isActive: true,
    names: {
      it: 'Personal Training', en: 'Personal Training', es: 'Entrenamiento Personal',
      fr: 'Coaching Personnel', de: 'Personal Training',
    },
  },
  hiit: {
    parentId: 'strength_conditioning', icon: '🔥', sections: ['fit'], order: 12, isActive: true,
    names: { it: 'HIIT', en: 'HIIT', es: 'HIIT', fr: 'HIIT', de: 'HIIT' },
  },
  crossfit: {
    parentId: 'strength_conditioning', icon: '🏋️', sections: ['fit'], order: 13, isActive: true,
    names: { it: 'CrossFit', en: 'CrossFit', es: 'CrossFit', fr: 'CrossFit', de: 'CrossFit' },
  },
  strength_training: {
    parentId: 'strength_conditioning', icon: '🏋️‍♀️', sections: ['fit'], order: 14, isActive: true,
    names: {
      it: 'Strength Training', en: 'Strength Training', es: 'Entrenamiento de Fuerza',
      fr: 'Musculation', de: 'Krafttraining',
    },
  },
  functional_training: {
    parentId: 'strength_conditioning', icon: '🤾', sections: ['fit'], order: 15, isActive: true,
    names: {
      it: 'Functional Training', en: 'Functional Training', es: 'Entrenamiento Funcional',
      fr: 'Entraînement Fonctionnel', de: 'Funktionelles Training',
    },
  },

  // ------------------------------------------------------ Cardio & Endurance
  cardio: {
    parentId: 'cardio_endurance', icon: '❤️', sections: ['fit'], order: 21, isActive: true,
    names: { it: 'Cardio', en: 'Cardio', es: 'Cardio', fr: 'Cardio', de: 'Cardio' },
  },
  spinning: {
    parentId: 'cardio_endurance', icon: '🚴', sections: ['fit'], order: 22, isActive: true,
    names: { it: 'Spinning', en: 'Spinning', es: 'Spinning', fr: 'Spinning', de: 'Spinning' },
  },
  swimming: {
    parentId: 'cardio_endurance', icon: '🏊', sections: ['fit'], order: 23, isActive: true,
    names: { it: 'Nuoto', en: 'Swimming', es: 'Natación', fr: 'Natation', de: 'Schwimmen' },
  },

  // ----------------------------------------------------------------- Combat
  boxing: {
    parentId: 'combat', icon: '🥊', sections: ['fit'], order: 31, isActive: true,
    names: { it: 'Boxe', en: 'Boxing', es: 'Boxeo', fr: 'Boxe', de: 'Boxen' },
  },
  martial_arts: {
    parentId: 'combat', icon: '🥋', sections: ['fit'], order: 32, isActive: true,
    names: {
      it: 'Arti Marziali', en: 'Martial Arts', es: 'Artes Marciales',
      fr: 'Arts Martiaux', de: 'Kampfkunst',
    },
  },

  // -------------------------------------------------------------- Mind–Body
  yoga: {
    parentId: 'mind_body', icon: '🧘', sections: ['fit', 'life'], order: 41, isActive: true,
    names: { it: 'Yoga', en: 'Yoga', es: 'Yoga', fr: 'Yoga', de: 'Yoga' },
  },
  pilates: {
    parentId: 'mind_body', icon: '🤸', sections: ['fit', 'life'], order: 42, isActive: true,
    names: { it: 'Pilates', en: 'Pilates', es: 'Pilates', fr: 'Pilates', de: 'Pilates' },
  },
  yoga_therapy: {
    parentId: 'mind_body', icon: '🌿', sections: ['life'], order: 43, isActive: true,
    names: {
      it: 'Yoga Therapy', en: 'Yoga Therapy', es: 'Yoga Terapéutico',
      fr: 'Yoga Thérapeutique', de: 'Yogatherapie',
    },
  },

  // ----------------------------------------------------------- Dance & Group
  dance: {
    parentId: 'dance_group', icon: '💃', sections: ['fit'], order: 51, isActive: true,
    names: { it: 'Danza', en: 'Dance', es: 'Baile', fr: 'Danse', de: 'Tanz' },
  },
  group_fitness: {
    parentId: 'dance_group', icon: '👥', sections: ['fit'], order: 52, isActive: true,
    names: {
      it: 'Group Fitness', en: 'Group Fitness', es: 'Fitness en Grupo',
      fr: 'Fitness en Groupe', de: 'Gruppenfitness',
    },
  },

  // ------------------------------------------------------ Therapy & Recovery
  physio: {
    parentId: 'therapy_recovery', icon: '🏥', sections: ['life'], order: 61, isActive: true,
    names: {
      it: 'Fisioterapia', en: 'Physiotherapy', es: 'Fisioterapia',
      fr: 'Physiothérapie', de: 'Physiotherapie',
    },
  },
  osteopathy: {
    parentId: 'therapy_recovery', icon: '🦴', sections: ['life'], order: 62, isActive: true,
    names: {
      it: 'Osteopatia', en: 'Osteopathy', es: 'Osteopatía',
      fr: 'Ostéopathie', de: 'Osteopathie',
    },
  },
  massage: {
    parentId: 'therapy_recovery', icon: '💆', sections: ['life'], order: 63, isActive: true,
    names: { it: 'Massaggio', en: 'Massage', es: 'Masaje', fr: 'Massage', de: 'Massage' },
  },

  // --------------------------------------------------- Nutrition & Lifestyle
  nutrition: {
    parentId: 'nutrition_lifestyle', icon: '🥗', sections: ['fit', 'life'], order: 71, isActive: true,
    names: {
      it: 'Nutrizione', en: 'Nutrition', es: 'Nutrición',
      fr: 'Nutrition', de: 'Ernährung',
    },
  },

  // -------------------------------------------------------- Mental Wellness
  psychology: {
    parentId: 'mental_wellness', icon: '🧠', sections: ['life'], order: 81, isActive: true,
    names: {
      it: 'Psicologia', en: 'Psychology', es: 'Psicología',
      fr: 'Psychologie', de: 'Psychologie',
    },
  },
  mental_coaching: {
    parentId: 'mental_wellness', icon: '🎯', sections: ['life'], order: 82, isActive: true,
    names: {
      it: 'Mental Coaching', en: 'Mental Coaching', es: 'Coaching Mental',
      fr: 'Coaching Mental', de: 'Mentalcoaching',
    },
  },
};

/** Ids of every top-level group, in display order. */
export const GROUP_IDS = Object.entries(SERVICE_CATEGORY_TREE)
  .filter(([, c]) => c.parentId === null)
  .sort((a, b) => a[1].order - b[1].order)
  .map(([id]) => id);
