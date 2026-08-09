/**
 * Shared exercise library.
 *
 * Exists so AI-generated plans can be constrained to real, known movements: the model
 * returns exercise IDs from this catalog rather than inventing names, and anything it
 * invents anyway is mapped or dropped server-side.
 *
 * Also drives the injury guardrail — `contraindicatedFor` is what lets the generator
 * exclude movements for a flagged area without a medical model.
 *
 * Spec: docs/superpowers/specs/2026-08-09-workout-plans-design.md
 */

export type MuscleGroup =
  | "chest" | "back" | "shoulders" | "biceps" | "triceps" | "forearms"
  | "quads" | "hamstrings" | "glutes" | "calves" | "core" | "full_body" | "cardio";

export type Equipment =
  | "bodyweight" | "dumbbells" | "barbell" | "kettlebell" | "bands"
  | "machine" | "cable" | "bench" | "pullup_bar" | "mat" | "cardio_machine";

export type Difficulty = "beginner" | "intermediate" | "advanced";

/**
 * Body areas a client can flag as injured. Keyword-mapped rather than medical: the point
 * is to exclude the obviously wrong movements, not to diagnose.
 */
export type InjuryArea = "knee" | "lower_back" | "shoulder" | "wrist" | "ankle" | "neck" | "hip";

export interface ExerciseSeed {
  id: string;
  /** Italian is authoritative for the pilot; English kept for the AI prompt and search. */
  name: { it: string; en: string };
  primary: MuscleGroup;
  secondary?: MuscleGroup[];
  equipment: Equipment[];
  difficulty: Difficulty;
  /** Areas for which this movement should NOT be suggested. */
  contraindicatedFor: InjuryArea[];
  instructions: { it: string };
}

function ex(
  id: string,
  it: string,
  en: string,
  primary: MuscleGroup,
  equipment: Equipment[],
  difficulty: Difficulty,
  contraindicatedFor: InjuryArea[],
  instructions: string,
  secondary?: MuscleGroup[],
): ExerciseSeed {
  return {
    id, name: { it, en }, primary, secondary, equipment, difficulty,
    contraindicatedFor, instructions: { it: instructions },
  };
}

/**
 * Curated catalog covering the common movement patterns across the equipment levels the
 * anamnesi asks about (bodyweight / bands / dumbbells / full gym).
 *
 * This is ~90 entries, not the ~150 the brief estimated. Padding it with near-duplicate
 * variations would make the AI's choice harder rather than the library richer; it is
 * additive, so gaps get filled as trainers ask for them.
 */
/* eslint-disable max-len -- one line per exercise reads as a data table; wrapping ~90
   entries across 4 lines each would make it far harder to scan and diff. */
export const EXERCISE_CATALOG: ExerciseSeed[] = [
  // ---------- Chest ----------
  ex("push_up", "Piegamenti sulle braccia", "Push-up", "chest", ["bodyweight"], "beginner", ["wrist", "shoulder"], "Corpo in linea, gomiti a circa 45°, scendi fino a sfiorare il pavimento.", ["triceps", "core"]),
  ex("push_up_knees", "Piegamenti sulle ginocchia", "Knee push-up", "chest", ["bodyweight", "mat"], "beginner", ["wrist"], "Come i piegamenti, con appoggio sulle ginocchia.", ["triceps"]),
  ex("incline_push_up", "Piegamenti inclinati", "Incline push-up", "chest", ["bodyweight", "bench"], "beginner", ["wrist"], "Mani su rialzo: riduce il carico rispetto al piegamento classico.", ["triceps"]),
  ex("bench_press_bb", "Panca piana bilanciere", "Barbell bench press", "chest", ["barbell", "bench"], "intermediate", ["shoulder"], "Scapole addotte, discesa controllata al petto, spinta senza rimbalzo.", ["triceps", "shoulders"]),
  ex("bench_press_db", "Panca piana manubri", "Dumbbell bench press", "chest", ["dumbbells", "bench"], "beginner", ["shoulder"], "Manubri sopra le spalle, discesa fino all'altezza del petto.", ["triceps"]),
  ex("incline_press_db", "Panca inclinata manubri", "Incline dumbbell press", "chest", ["dumbbells", "bench"], "intermediate", ["shoulder"], "Schienale a 30-45°, spinta verso l'alto senza bloccare i gomiti.", ["shoulders"]),
  ex("chest_fly_db", "Croci su panca", "Dumbbell fly", "chest", ["dumbbells", "bench"], "intermediate", ["shoulder"], "Gomiti leggermente flessi, apertura controllata, nessun rimbalzo in basso."),
  ex("cable_crossover", "Croci ai cavi", "Cable crossover", "chest", ["cable"], "intermediate", ["shoulder"], "Busto leggermente inclinato, chiusura davanti al petto."),
  ex("chest_press_machine", "Chest press macchina", "Machine chest press", "chest", ["machine"], "beginner", [], "Regola il sedile in modo che le maniglie siano all'altezza del petto.", ["triceps"]),
  ex("band_chest_press", "Spinte con elastico", "Band chest press", "chest", ["bands"], "beginner", [], "Elastico dietro la schiena, spingi in avanti fino a distendere le braccia.", ["triceps"]),

  // ---------- Back ----------
  ex("pull_up", "Trazioni alla sbarra", "Pull-up", "back", ["pullup_bar"], "advanced", ["shoulder", "wrist"], "Presa prona, sali fino a portare il mento sopra la sbarra.", ["biceps"]),
  ex("chin_up", "Trazioni presa supina", "Chin-up", "back", ["pullup_bar"], "advanced", ["shoulder", "wrist"], "Presa supina, più coinvolgimento dei bicipiti.", ["biceps"]),
  ex("lat_pulldown", "Lat machine", "Lat pulldown", "back", ["machine", "cable"], "beginner", [], "Tira la barra al petto mantenendo il busto leggermente indietro.", ["biceps"]),
  ex("seated_row_cable", "Rematore ai cavi", "Seated cable row", "back", ["cable"], "beginner", ["lower_back"], "Schiena neutra, tira verso l'addome chiudendo le scapole.", ["biceps"]),
  ex("bent_over_row_bb", "Rematore con bilanciere", "Barbell bent-over row", "back", ["barbell"], "intermediate", ["lower_back"], "Busto inclinato, schiena neutra, tira verso l'ombelico.", ["biceps"]),
  ex("one_arm_row_db", "Rematore manubrio", "One-arm dumbbell row", "back", ["dumbbells", "bench"], "beginner", ["lower_back"], "Appoggio su panca, tira il manubrio verso il fianco.", ["biceps"]),
  ex("inverted_row", "Rematore australiano", "Inverted row", "back", ["bodyweight"], "beginner", ["shoulder"], "Corpo in linea sotto una barra bassa, tira il petto verso la barra.", ["biceps"]),
  ex("band_row", "Rematore con elastico", "Band row", "back", ["bands"], "beginner", [], "Elastico ancorato davanti, tira verso l'addome.", ["biceps"]),
  ex("face_pull", "Face pull", "Face pull", "back", ["cable", "bands"], "beginner", [], "Tira verso il viso separando le mani: ottimo per la salute della spalla.", ["shoulders"]),
  ex("superman", "Superman", "Superman", "back", ["bodyweight", "mat"], "beginner", ["lower_back"], "Prono, solleva braccia e gambe mantenendo il collo neutro.", ["glutes"]),

  // ---------- Shoulders ----------
  ex("overhead_press_bb", "Lento avanti bilanciere", "Barbell overhead press", "shoulders", ["barbell"], "intermediate", ["shoulder", "lower_back"], "In piedi, core attivo, spingi sopra la testa senza inarcare la schiena.", ["triceps"]),
  ex("shoulder_press_db", "Spinte sopra la testa manubri", "Dumbbell shoulder press", "shoulders", ["dumbbells"], "beginner", ["shoulder"], "Seduto o in piedi, spingi i manubri sopra la testa.", ["triceps"]),
  ex("lateral_raise", "Alzate laterali", "Lateral raise", "shoulders", ["dumbbells"], "beginner", ["shoulder"], "Alza fino all'altezza delle spalle, gomiti morbidi."),
  ex("front_raise", "Alzate frontali", "Front raise", "shoulders", ["dumbbells", "bands"], "beginner", ["shoulder"], "Alza davanti fino all'altezza delle spalle."),
  ex("rear_delt_fly", "Alzate posteriori", "Rear delt fly", "shoulders", ["dumbbells"], "beginner", [], "Busto inclinato, apri le braccia verso l'esterno.", ["back"]),
  ex("upright_row_band", "Tirate al mento elastico", "Band upright row", "shoulders", ["bands"], "intermediate", ["shoulder"], "Tira verso il mento tenendo i gomiti alti."),
  ex("pike_push_up", "Piegamenti a V", "Pike push-up", "shoulders", ["bodyweight"], "intermediate", ["shoulder", "wrist"], "Bacino alto, scendi con la testa verso il pavimento.", ["triceps"]),

  // ---------- Arms ----------
  ex("biceps_curl_db", "Curl con manubri", "Dumbbell biceps curl", "biceps", ["dumbbells"], "beginner", ["wrist"], "Gomiti fermi al fianco, salita controllata."),
  ex("hammer_curl", "Curl a martello", "Hammer curl", "biceps", ["dumbbells"], "beginner", ["wrist"], "Presa neutra, coinvolge anche l'avambraccio.", ["forearms"]),
  ex("barbell_curl", "Curl con bilanciere", "Barbell curl", "biceps", ["barbell"], "beginner", ["wrist"], "Evita di usare la schiena per slanciare il peso."),
  ex("band_curl", "Curl con elastico", "Band curl", "biceps", ["bands"], "beginner", ["wrist"], "Elastico sotto i piedi, salita e discesa controllate."),
  ex("triceps_pushdown", "Push-down ai cavi", "Triceps pushdown", "triceps", ["cable"], "beginner", ["wrist"], "Gomiti fermi al fianco, distendi completamente."),
  ex("overhead_triceps_db", "French press manubrio", "Overhead triceps extension", "triceps", ["dumbbells"], "intermediate", ["shoulder", "wrist"], "Manubrio sopra la testa, scendi dietro la nuca in controllo."),
  ex("dips_bench", "Dip su panca", "Bench dips", "triceps", ["bench", "bodyweight"], "beginner", ["shoulder", "wrist"], "Mani sulla panca dietro di te, scendi piegando i gomiti."),
  ex("diamond_push_up", "Piegamenti a diamante", "Diamond push-up", "triceps", ["bodyweight"], "intermediate", ["wrist", "shoulder"], "Mani ravvicinate sotto il petto.", ["chest"]),

  // ---------- Legs: quads ----------
  ex("bodyweight_squat", "Squat a corpo libero", "Bodyweight squat", "quads", ["bodyweight"], "beginner", ["knee"], "Piedi larghezza spalle, scendi mantenendo i talloni a terra.", ["glutes"]),
  ex("goblet_squat", "Goblet squat", "Goblet squat", "quads", ["dumbbells", "kettlebell"], "beginner", ["knee"], "Peso al petto, busto eretto, scendi in controllo.", ["glutes", "core"]),
  ex("back_squat", "Squat con bilanciere", "Barbell back squat", "quads", ["barbell"], "advanced", ["knee", "lower_back"], "Bilanciere sui trapezi, schiena neutra, profondità in base alla mobilità.", ["glutes"]),
  ex("front_squat", "Front squat", "Front squat", "quads", ["barbell"], "advanced", ["knee", "wrist"], "Bilanciere davanti, gomiti alti, busto verticale.", ["core"]),
  ex("leg_press", "Leg press", "Leg press", "quads", ["machine"], "beginner", ["knee"], "Non bloccare le ginocchia in estensione.", ["glutes"]),
  ex("walking_lunge", "Affondi in camminata", "Walking lunge", "quads", ["bodyweight", "dumbbells"], "intermediate", ["knee"], "Passo lungo, ginocchio posteriore verso il pavimento.", ["glutes"]),
  ex("reverse_lunge", "Affondi indietro", "Reverse lunge", "quads", ["bodyweight", "dumbbells"], "beginner", ["knee"], "Più gentile sul ginocchio rispetto all'affondo in avanti.", ["glutes"]),
  ex("bulgarian_split_squat", "Squat bulgaro", "Bulgarian split squat", "quads", ["bodyweight", "dumbbells", "bench"], "advanced", ["knee"], "Piede posteriore su rialzo, scendi in verticale.", ["glutes"]),
  ex("step_up", "Step-up", "Step-up", "quads", ["bench", "dumbbells"], "beginner", ["knee"], "Sali su un rialzo spingendo con la gamba sopra.", ["glutes"]),
  ex("leg_extension", "Leg extension", "Leg extension", "quads", ["machine"], "beginner", ["knee"], "Estensione controllata, evita di bloccare bruscamente."),
  ex("wall_sit", "Wall sit", "Wall sit", "quads", ["bodyweight"], "beginner", ["knee"], "Schiena al muro, ginocchia a 90°, mantieni la posizione."),

  // ---------- Legs: posterior ----------
  ex("glute_bridge", "Ponte glutei", "Glute bridge", "glutes", ["bodyweight", "mat"], "beginner", [], "Spingi con i talloni, contrai i glutei in alto.", ["hamstrings"]),
  ex("hip_thrust", "Hip thrust", "Hip thrust", "glutes", ["barbell", "bench"], "intermediate", [], "Spalle su panca, spingi il bacino verso l'alto.", ["hamstrings"]),
  ex("romanian_deadlift", "Stacco rumeno", "Romanian deadlift", "hamstrings", ["barbell", "dumbbells"], "intermediate", ["lower_back"], "Ginocchia morbide, spingi il bacino indietro, schiena neutra.", ["glutes"]),
  ex("deadlift", "Stacco da terra", "Deadlift", "hamstrings", ["barbell"], "advanced", ["lower_back"], "Tecnica prioritaria sul carico: schiena neutra per tutta l'alzata.", ["back", "glutes"]),
  ex("leg_curl", "Leg curl", "Leg curl", "hamstrings", ["machine"], "beginner", [], "Flessione controllata, evita di staccare il bacino."),
  ex("good_morning", "Good morning", "Good morning", "hamstrings", ["barbell"], "advanced", ["lower_back"], "Carico leggero, movimento d'anca con schiena neutra.", ["glutes"]),
  ex("nordic_curl", "Nordic curl", "Nordic curl", "hamstrings", ["bodyweight", "mat"], "advanced", ["knee"], "Discesa lentissima controllando con i femorali."),
  ex("band_kickback", "Slanci con elastico", "Band glute kickback", "glutes", ["bands"], "beginner", [], "Slancio indietro controllato, senza inarcare la schiena."),
  ex("calf_raise", "Calf raise", "Calf raise", "calves", ["bodyweight", "dumbbells"], "beginner", ["ankle"], "Sali sulle punte, pausa in alto, discesa lenta."),
  ex("seated_calf_raise", "Calf raise seduto", "Seated calf raise", "calves", ["machine"], "beginner", ["ankle"], "Enfatizza il soleo con il ginocchio flesso."),

  // ---------- Core ----------
  ex("plank", "Plank", "Plank", "core", ["bodyweight", "mat"], "beginner", ["shoulder", "wrist"], "Corpo in linea, bacino né alto né basso, respira."),
  ex("side_plank", "Plank laterale", "Side plank", "core", ["bodyweight", "mat"], "beginner", ["shoulder"], "Su un gomito, bacino alto, corpo allineato."),
  ex("dead_bug", "Dead bug", "Dead bug", "core", ["bodyweight", "mat"], "beginner", [], "Zona lombare a contatto col pavimento per tutto il movimento."),
  ex("bird_dog", "Bird dog", "Bird dog", "core", ["bodyweight", "mat"], "beginner", [], "Estendi braccio e gamba opposti mantenendo il bacino fermo.", ["back"]),
  ex("crunch", "Crunch", "Crunch", "core", ["bodyweight", "mat"], "beginner", ["neck"], "Solleva solo le scapole, non tirare il collo con le mani."),
  ex("reverse_crunch", "Crunch inverso", "Reverse crunch", "core", ["bodyweight", "mat"], "beginner", ["lower_back"], "Porta le ginocchia al petto sollevando il bacino."),
  ex("russian_twist", "Russian twist", "Russian twist", "core", ["bodyweight", "dumbbells"], "intermediate", ["lower_back"], "Busto inclinato, ruota controllando il movimento."),
  ex("hanging_knee_raise", "Ginocchia al petto alla sbarra", "Hanging knee raise", "core", ["pullup_bar"], "intermediate", ["shoulder"], "Appeso alla sbarra, porta le ginocchia verso il petto."),
  ex("mountain_climber", "Mountain climber", "Mountain climber", "core", ["bodyweight"], "intermediate", ["wrist", "shoulder"], "In posizione di plank, porta le ginocchia al petto alternando.", ["cardio"]),
  ex("hollow_hold", "Hollow hold", "Hollow hold", "core", ["bodyweight", "mat"], "intermediate", ["lower_back"], "Lombare a terra, braccia e gambe distese e sollevate."),
  ex("pallof_press", "Pallof press", "Pallof press", "core", ["cable", "bands"], "intermediate", [], "Resisti alla rotazione mentre distendi le braccia."),

  // ---------- Full body / conditioning ----------
  ex("burpee", "Burpee", "Burpee", "full_body", ["bodyweight"], "intermediate", ["knee", "wrist", "lower_back"], "Squat, piegamento, salto: alta intensità.", ["cardio"]),
  ex("kb_swing", "Kettlebell swing", "Kettlebell swing", "full_body", ["kettlebell"], "intermediate", ["lower_back"], "Movimento d'anca esplosivo, non di braccia.", ["glutes", "hamstrings"]),
  ex("thruster", "Thruster", "Thruster", "full_body", ["dumbbells", "barbell"], "advanced", ["knee", "shoulder"], "Squat seguito da spinta sopra la testa.", ["shoulders"]),
  ex("clean_and_press", "Girata e spinta", "Clean and press", "full_body", ["dumbbells", "barbell"], "advanced", ["lower_back", "shoulder"], "Movimento tecnico: richiede supervisione.", ["shoulders"]),
  ex("bear_crawl", "Bear crawl", "Bear crawl", "full_body", ["bodyweight"], "intermediate", ["wrist", "shoulder"], "Ginocchia sollevate da terra, avanza mantenendo il bacino basso.", ["core"]),
  ex("farmer_walk", "Farmer walk", "Farmer walk", "full_body", ["dumbbells", "kettlebell"], "beginner", [], "Cammina con carichi ai fianchi, spalle basse e core attivo.", ["forearms", "core"]),
  ex("turkish_getup", "Turkish get-up", "Turkish get-up", "full_body", ["kettlebell"], "advanced", ["shoulder"], "Movimento lento e tecnico dalla posizione supina alla stazione eretta.", ["core"]),

  // ---------- Cardio ----------
  ex("brisk_walk", "Camminata veloce", "Brisk walk", "cardio", ["bodyweight"], "beginner", [], "Ritmo sostenuto ma conversazionale."),
  ex("run_easy", "Corsa lenta", "Easy run", "cardio", ["bodyweight"], "beginner", ["knee", "ankle"], "Ritmo aerobico, respirazione controllata."),
  ex("interval_run", "Corsa a intervalli", "Interval run", "cardio", ["bodyweight"], "advanced", ["knee", "ankle"], "Alternanza di tratti veloci e recupero."),
  ex("cycling", "Cyclette", "Cycling", "cardio", ["cardio_machine"], "beginner", [], "Ottima alternativa a basso impatto per le articolazioni."),
  ex("rowing_machine", "Vogatore", "Rowing machine", "cardio", ["cardio_machine"], "intermediate", ["lower_back"], "Sequenza gambe-busto-braccia, ritorno inverso.", ["back"]),
  ex("elliptical", "Ellittica", "Elliptical", "cardio", ["cardio_machine"], "beginner", [], "Basso impatto, adatta anche in presenza di fastidi articolari."),
  ex("jump_rope", "Corda", "Jump rope", "cardio", ["bodyweight"], "intermediate", ["knee", "ankle"], "Salti bassi e rapidi, atterraggio morbido."),
  ex("stair_climber", "Stair climber", "Stair climber", "cardio", ["cardio_machine"], "intermediate", ["knee"], "Mantieni il busto eretto senza appoggiarti."),
  ex("swimming", "Nuoto", "Swimming", "cardio", ["bodyweight"], "beginner", [], "Impatto articolare minimo, ottimo per il recupero.", ["full_body"]),

  // ---------- Mobility ----------
  ex("cat_cow", "Cat-cow", "Cat-cow", "core", ["bodyweight", "mat"], "beginner", [], "Alterna flessione ed estensione della colonna, lentamente.", ["back"]),
  ex("hip_flexor_stretch", "Allungamento flessori dell'anca", "Hip flexor stretch", "quads", ["mat"], "beginner", [], "Affondo basso, bacino in retroversione, senza forzare."),
  ex("hamstring_stretch", "Allungamento femorali", "Hamstring stretch", "hamstrings", ["mat"], "beginner", [], "Schiena neutra, piega dall'anca."),
  ex("thoracic_rotation", "Rotazione toracica", "Thoracic rotation", "back", ["mat"], "beginner", [], "Da quadrupedia, apri il braccio verso l'alto ruotando il torace."),
  ex("shoulder_dislocate_band", "Mobilità spalle con elastico", "Band shoulder dislocate", "shoulders", ["bands"], "beginner", [], "Presa larga, porta l'elastico dalla fronte dietro la schiena."),
  ex("ankle_mobility", "Mobilità caviglia", "Ankle mobility drill", "calves", ["bodyweight"], "beginner", [], "Ginocchio oltre la punta mantenendo il tallone a terra."),
  ex("child_pose", "Posizione del bambino", "Child's pose", "back", ["mat"], "beginner", [], "Rilassamento della zona lombare, respira profondamente."),
  ex("worlds_greatest_stretch", "World's greatest stretch", "World's greatest stretch", "full_body", ["mat"], "intermediate", [], "Affondo con rotazione: mobilità di anca e torace."),
];
/* eslint-enable max-len */

/** Injury → the muscle groups whose loaded work should be reduced, beyond the explicit
 *  per-exercise contraindications. Deliberately coarse; v1 keyword mapping, not medicine. */
export const INJURY_CAUTION_GROUPS: Record<InjuryArea, MuscleGroup[]> = {
  knee: ["quads", "hamstrings", "calves"],
  lower_back: ["back", "hamstrings", "glutes"],
  shoulder: ["shoulders", "chest"],
  wrist: ["forearms", "biceps", "triceps"],
  ankle: ["calves", "cardio"],
  neck: ["shoulders"],
  hip: ["glutes", "quads"],
};

export function exercisesFor(injuries: InjuryArea[]): ExerciseSeed[] {
  if (!injuries.length) return EXERCISE_CATALOG;
  return EXERCISE_CATALOG.filter(
    (e) => !e.contraindicatedFor.some((area) => injuries.includes(area)),
  );
}
