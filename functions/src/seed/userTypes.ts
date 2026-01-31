/* eslint-disable max-len */
import * as admin from "firebase-admin";

/**
 * User type category definitions
 */
export type UserTypeCategory =
  | "fitness"
  | "wellness"
  | "beauty"
  | "mental_health"
  | "education"
  | "medical";

/**
 * Pricing type for services
 */
export type PricingType = "fixed" | "hourly" | "session";

/**
 * Service definition for a user type
 */
export interface UserTypeService {
  id: string;
  name: string;
  description: string;
  durationOptions: number[]; // in minutes
  pricingType: PricingType;
  basePrice?: number;
}

/**
 * Requirements to become a provider of this type
 */
export interface UserTypeRequirements {
  certifications?: string[];
  yearsExperience?: number;
  backgroundCheck?: boolean;
  insuranceRequired?: boolean;
  licenseRequired?: boolean;
  licenseTypes?: string[];
}

/**
 * User type definition
 */
export interface UserType {
  id: string;
  name: string;
  slug: string;
  description: string;
  shortDescription?: string;
  icon: string;
  category: UserTypeCategory;

  // Provider capabilities
  services: UserTypeService[];

  // Requirements to become this type of provider
  requirements: UserTypeRequirements;

  // Metadata
  isActive: boolean;
  displayOrder: number;
  tags?: string[];
  createdAt: admin.firestore.Timestamp | null;
  updatedAt: admin.firestore.Timestamp | null;
}

/**
 * User type data for seeding (without timestamps)
 */
export type UserTypeSeedData = Omit<UserType, "createdAt" | "updatedAt">;

/**
 * Seed data for all user types
 */
export const userTypesSeedData: UserTypeSeedData[] = [
  {
    id: "personal-trainer",
    name: "Personal Trainer",
    slug: "personal-trainer",
    description:
      "Certified fitness professionals who provide personalized workout plans, one-on-one training sessions, and guidance to help clients achieve their fitness goals. They specialize in strength training, cardio, weight loss, muscle building, and overall physical conditioning.",
    shortDescription: "Expert guidance for your fitness journey",
    icon: "Dumbbell",
    category: "fitness",
    services: [
      {
        id: "pt-one-on-one",
        name: "One-on-One Training",
        description: "Personalized training session tailored to your goals",
        durationOptions: [30, 45, 60, 90],
        pricingType: "session",
        basePrice: 50,
      },
      {
        id: "pt-group",
        name: "Small Group Training",
        description: "Train with 2-4 people for a motivating group experience",
        durationOptions: [45, 60],
        pricingType: "session",
        basePrice: 30,
      },
      {
        id: "pt-online",
        name: "Online Coaching",
        description: "Virtual training sessions via video call",
        durationOptions: [30, 45, 60],
        pricingType: "session",
        basePrice: 40,
      },
      {
        id: "pt-program",
        name: "Custom Workout Program",
        description: "Personalized workout plan designed for your needs",
        durationOptions: [0], // Not a session-based service
        pricingType: "fixed",
        basePrice: 150,
      },
    ],
    requirements: {
      certifications: ["NASM", "ACE", "ACSM", "NSCA-CPT", "ISSA"],
      yearsExperience: 1,
      backgroundCheck: true,
      insuranceRequired: true,
    },
    isActive: true,
    displayOrder: 1,
    tags: ["fitness", "strength", "cardio", "weight-loss", "muscle-building"],
  },
  {
    id: "yoga-instructor",
    name: "Yoga Instructor",
    slug: "yoga-instructor",
    description:
      "Certified yoga teachers who guide students through yoga practice, including asanas (poses), pranayama (breathing techniques), and meditation. They create a supportive environment for physical flexibility, mental clarity, and spiritual growth.",
    shortDescription: "Find balance and flexibility through yoga",
    icon: "Flower2",
    category: "wellness",
    services: [
      {
        id: "yoga-private",
        name: "Private Yoga Session",
        description: "Personalized yoga practice tailored to your level",
        durationOptions: [45, 60, 90],
        pricingType: "session",
        basePrice: 60,
      },
      {
        id: "yoga-group",
        name: "Group Yoga Class",
        description: "Yoga class for small groups (up to 8 people)",
        durationOptions: [60, 75, 90],
        pricingType: "session",
        basePrice: 25,
      },
      {
        id: "yoga-prenatal",
        name: "Prenatal Yoga",
        description: "Specialized yoga for expectant mothers",
        durationOptions: [45, 60],
        pricingType: "session",
        basePrice: 55,
      },
      {
        id: "yoga-meditation",
        name: "Meditation & Breathwork",
        description: "Guided meditation and pranayama sessions",
        durationOptions: [30, 45, 60],
        pricingType: "session",
        basePrice: 40,
      },
    ],
    requirements: {
      certifications: ["RYT-200", "RYT-500", "Yoga Alliance Certified"],
      yearsExperience: 1,
      backgroundCheck: true,
      insuranceRequired: true,
    },
    isActive: true,
    displayOrder: 2,
    tags: ["yoga", "meditation", "flexibility", "mindfulness", "wellness"],
  },
  {
    id: "nutritionist",
    name: "Nutritionist",
    slug: "nutritionist",
    description:
      "Health professionals who specialize in food and nutrition. They assess clients' dietary needs, create personalized meal plans, and provide guidance on healthy eating habits to achieve specific health goals, manage medical conditions, or improve athletic performance.",
    shortDescription: "Personalized nutrition plans for optimal health",
    icon: "Apple",
    category: "wellness",
    services: [
      {
        id: "nutrition-consultation",
        name: "Initial Nutrition Consultation",
        description: "Comprehensive assessment and dietary analysis",
        durationOptions: [60, 90],
        pricingType: "session",
        basePrice: 80,
      },
      {
        id: "nutrition-followup",
        name: "Follow-up Session",
        description: "Progress review and plan adjustments",
        durationOptions: [30, 45],
        pricingType: "session",
        basePrice: 50,
      },
      {
        id: "nutrition-plan",
        name: "Custom Meal Plan",
        description: "Personalized 4-week meal plan with recipes",
        durationOptions: [0],
        pricingType: "fixed",
        basePrice: 120,
      },
      {
        id: "nutrition-coaching",
        name: "Monthly Coaching Package",
        description: "Ongoing support with weekly check-ins",
        durationOptions: [0],
        pricingType: "fixed",
        basePrice: 200,
      },
    ],
    requirements: {
      certifications: [
        "Registered Nutritionist",
        "Certified Nutrition Specialist",
        "Precision Nutrition",
      ],
      yearsExperience: 2,
      backgroundCheck: true,
      insuranceRequired: true,
      licenseRequired: true,
    },
    isActive: true,
    displayOrder: 3,
    tags: [
      "nutrition",
      "diet",
      "healthy-eating",
      "weight-management",
      "meal-planning",
    ],
  },
  {
    id: "hairstylist",
    name: "Hairstylist",
    slug: "hairstylist",
    description:
      "Professional hair care specialists who provide cutting, coloring, styling, and treatment services. They stay current with the latest trends and techniques to help clients achieve their desired look while maintaining hair health.",
    shortDescription: "Expert hair care and styling services",
    icon: "Scissors",
    category: "beauty",
    services: [
      {
        id: "haircut",
        name: "Haircut & Style",
        description: "Professional haircut and styling",
        durationOptions: [30, 45, 60],
        pricingType: "fixed",
        basePrice: 45,
      },
      {
        id: "hair-color",
        name: "Hair Coloring",
        description: "Full color, highlights, balayage, or root touch-up",
        durationOptions: [90, 120, 180],
        pricingType: "fixed",
        basePrice: 85,
      },
      {
        id: "hair-treatment",
        name: "Hair Treatment",
        description: "Deep conditioning, keratin, or repair treatment",
        durationOptions: [30, 45, 60],
        pricingType: "fixed",
        basePrice: 55,
      },
      {
        id: "hair-styling",
        name: "Special Occasion Styling",
        description: "Updos, braids, or styling for events",
        durationOptions: [45, 60, 90],
        pricingType: "fixed",
        basePrice: 65,
      },
    ],
    requirements: {
      certifications: ["Cosmetology License", "Barber License"],
      yearsExperience: 1,
      backgroundCheck: true,
      insuranceRequired: true,
      licenseRequired: true,
      licenseTypes: ["State Cosmetology License"],
    },
    isActive: true,
    displayOrder: 4,
    tags: ["hair", "beauty", "styling", "coloring", "salon"],
  },
  {
    id: "psychologist",
    name: "Psychologist",
    slug: "psychologist",
    description:
      "Licensed mental health professionals who provide therapy and counseling services. They help individuals, couples, and families navigate emotional challenges, mental health conditions, life transitions, and personal growth through evidence-based therapeutic approaches.",
    shortDescription: "Professional mental health support",
    icon: "Brain",
    category: "mental_health",
    services: [
      {
        id: "psych-individual",
        name: "Individual Therapy",
        description: "One-on-one therapy session",
        durationOptions: [45, 50, 60],
        pricingType: "session",
        basePrice: 120,
      },
      {
        id: "psych-couples",
        name: "Couples Therapy",
        description: "Relationship counseling for partners",
        durationOptions: [60, 75, 90],
        pricingType: "session",
        basePrice: 150,
      },
      {
        id: "psych-online",
        name: "Online Therapy",
        description: "Virtual therapy session via secure video",
        durationOptions: [45, 50, 60],
        pricingType: "session",
        basePrice: 100,
      },
      {
        id: "psych-assessment",
        name: "Psychological Assessment",
        description: "Comprehensive psychological evaluation",
        durationOptions: [90, 120],
        pricingType: "fixed",
        basePrice: 250,
      },
    ],
    requirements: {
      certifications: [
        "Licensed Psychologist",
        "PhD/PsyD in Psychology",
        "State License",
      ],
      yearsExperience: 3,
      backgroundCheck: true,
      insuranceRequired: true,
      licenseRequired: true,
      licenseTypes: ["State Psychology License"],
    },
    isActive: true,
    displayOrder: 5,
    tags: [
      "therapy",
      "counseling",
      "mental-health",
      "psychology",
      "wellness",
    ],
  },
  {
    id: "pronunciation-coach",
    name: "Pronunciation Coach",
    slug: "pronunciation-coach",
    description:
      "Language specialists who help clients improve their pronunciation, accent, and speaking clarity. They work with non-native speakers, actors, public speakers, and professionals who want to communicate more effectively in various languages.",
    shortDescription: "Speak clearly and confidently",
    icon: "Mic",
    category: "education",
    services: [
      {
        id: "pronunciation-private",
        name: "Private Coaching",
        description: "One-on-one pronunciation and accent training",
        durationOptions: [45, 60],
        pricingType: "session",
        basePrice: 55,
      },
      {
        id: "pronunciation-group",
        name: "Group Workshop",
        description: "Small group pronunciation classes",
        durationOptions: [60, 90],
        pricingType: "session",
        basePrice: 35,
      },
      {
        id: "pronunciation-business",
        name: "Business Communication",
        description: "Professional speaking for work contexts",
        durationOptions: [60, 90],
        pricingType: "session",
        basePrice: 70,
      },
      {
        id: "pronunciation-assessment",
        name: "Speech Assessment",
        description: "Comprehensive evaluation of pronunciation",
        durationOptions: [45, 60],
        pricingType: "fixed",
        basePrice: 80,
      },
    ],
    requirements: {
      certifications: [
        "TEFL/TESOL",
        "Speech-Language Pathology",
        "Linguistics Degree",
      ],
      yearsExperience: 2,
      backgroundCheck: true,
      insuranceRequired: false,
    },
    isActive: true,
    displayOrder: 6,
    tags: [
      "language",
      "pronunciation",
      "accent",
      "speaking",
      "communication",
    ],
  },
  {
    id: "massage-therapist",
    name: "Massage Therapist",
    slug: "massage-therapist",
    description:
      "Licensed professionals who provide therapeutic massage treatments to promote relaxation, reduce stress, relieve pain, and support overall wellness. They are trained in various massage techniques and can address specific physical conditions or injuries.",
    shortDescription: "Therapeutic massage for relaxation and healing",
    icon: "Hand",
    category: "wellness",
    services: [
      {
        id: "massage-swedish",
        name: "Swedish Massage",
        description: "Classic relaxation massage",
        durationOptions: [60, 90, 120],
        pricingType: "session",
        basePrice: 70,
      },
      {
        id: "massage-deep",
        name: "Deep Tissue Massage",
        description: "Therapeutic massage for muscle tension",
        durationOptions: [60, 90],
        pricingType: "session",
        basePrice: 85,
      },
      {
        id: "massage-sports",
        name: "Sports Massage",
        description: "Massage for athletes and active individuals",
        durationOptions: [45, 60, 90],
        pricingType: "session",
        basePrice: 75,
      },
      {
        id: "massage-mobile",
        name: "Mobile Massage",
        description: "In-home massage service",
        durationOptions: [60, 90],
        pricingType: "session",
        basePrice: 95,
      },
    ],
    requirements: {
      certifications: [
        "Licensed Massage Therapist",
        "NCBTMB",
        "State Massage License",
      ],
      yearsExperience: 1,
      backgroundCheck: true,
      insuranceRequired: true,
      licenseRequired: true,
      licenseTypes: ["State Massage Therapy License"],
    },
    isActive: true,
    displayOrder: 7,
    tags: [
      "massage",
      "relaxation",
      "therapy",
      "wellness",
      "pain-relief",
    ],
  },
  {
    id: "life-coach",
    name: "Life Coach",
    slug: "life-coach",
    description:
      "Professional coaches who help clients identify personal and professional goals, overcome obstacles, and create actionable plans for success. They provide accountability, motivation, and guidance for life transitions, career changes, and personal development.",
    shortDescription: "Guidance for achieving your life goals",
    icon: "Target",
    category: "mental_health",
    services: [
      {
        id: "coaching-discovery",
        name: "Discovery Session",
        description: "Initial consultation to explore your goals",
        durationOptions: [30, 45],
        pricingType: "session",
        basePrice: 50,
      },
      {
        id: "coaching-session",
        name: "One-on-One Coaching",
        description: "Personalized coaching session",
        durationOptions: [45, 60, 90],
        pricingType: "session",
        basePrice: 80,
      },
      {
        id: "coaching-package",
        name: "Monthly Coaching Package",
        description: "4 sessions per month with email support",
        durationOptions: [0],
        pricingType: "fixed",
        basePrice: 280,
      },
      {
        id: "coaching-career",
        name: "Career Transition Coaching",
        description: "Specialized support for career changes",
        durationOptions: [60, 90],
        pricingType: "session",
        basePrice: 90,
      },
    ],
    requirements: {
      certifications: [
        "ICF Credential",
        "Certified Professional Coach",
        "Life Coach Certification",
      ],
      yearsExperience: 2,
      backgroundCheck: true,
      insuranceRequired: false,
    },
    isActive: true,
    displayOrder: 8,
    tags: [
      "coaching",
      "goals",
      "personal-development",
      "career",
      "motivation",
    ],
  },
  {
    id: "physical-therapist",
    name: "Physical Therapist",
    slug: "physical-therapist",
    description:
      "Licensed healthcare professionals who help patients recover from injuries, surgeries, and physical impairments. They design rehabilitation programs, provide hands-on treatment, and educate patients on exercises and techniques to restore mobility and reduce pain.",
    shortDescription: "Expert rehabilitation and pain management",
    icon: "Activity",
    category: "medical",
    services: [
      {
        id: "pt-evaluation",
        name: "Initial Evaluation",
        description: "Comprehensive physical assessment",
        durationOptions: [60, 90],
        pricingType: "session",
        basePrice: 100,
      },
      {
        id: "pt-treatment",
        name: "Treatment Session",
        description: "Therapeutic exercises and manual therapy",
        durationOptions: [45, 60],
        pricingType: "session",
        basePrice: 85,
      },
      {
        id: "pt-sport",
        name: "Sports Rehabilitation",
        description: "Specialized rehab for athletes",
        durationOptions: [60, 90],
        pricingType: "session",
        basePrice: 95,
      },
      {
        id: "pt-home",
        name: "Home Exercise Program",
        description: "Custom exercise plan for home recovery",
        durationOptions: [0],
        pricingType: "fixed",
        basePrice: 75,
      },
    ],
    requirements: {
      certifications: [
        "DPT (Doctor of Physical Therapy)",
        "State PT License",
        "Board Certified Specialist",
      ],
      yearsExperience: 2,
      backgroundCheck: true,
      insuranceRequired: true,
      licenseRequired: true,
      licenseTypes: ["State Physical Therapy License"],
    },
    isActive: true,
    displayOrder: 9,
    tags: [
      "physical-therapy",
      "rehabilitation",
      "pain-management",
      "injury-recovery",
      "medical",
    ],
  },
  {
    id: "dietitian",
    name: "Dietitian",
    slug: "dietitian",
    description:
      "Registered healthcare professionals who are experts in food and nutrition science. They provide medical nutrition therapy for chronic diseases, eating disorders, weight management, and specialized diets. Dietitians work in hospitals, clinics, and private practice.",
    shortDescription: "Medical nutrition therapy and counseling",
    icon: "Utensils",
    category: "medical",
    services: [
      {
        id: "rd-assessment",
        name: "Nutritional Assessment",
        description: "Comprehensive diet and health evaluation",
        durationOptions: [60, 90],
        pricingType: "session",
        basePrice: 90,
      },
      {
        id: "rd-medical",
        name: "Medical Nutrition Therapy",
        description: "Dietary management for medical conditions",
        durationOptions: [45, 60],
        pricingType: "session",
        basePrice: 85,
      },
      {
        id: "rd-followup",
        name: "Follow-up Consultation",
        description: "Progress monitoring and plan adjustments",
        durationOptions: [30, 45],
        pricingType: "session",
        basePrice: 60,
      },
      {
        id: "rd-group",
        name: "Group Nutrition Education",
        description: "Educational sessions for small groups",
        durationOptions: [60, 90],
        pricingType: "session",
        basePrice: 40,
      },
    ],
    requirements: {
      certifications: [
        "RD/RDN (Registered Dietitian)",
        "State License",
        "Commission on Dietetic Registration",
      ],
      yearsExperience: 2,
      backgroundCheck: true,
      insuranceRequired: true,
      licenseRequired: true,
      licenseTypes: ["State Dietitian License", "RD/RDN Credential"],
    },
    isActive: true,
    displayOrder: 10,
    tags: [
      "dietitian",
      "medical-nutrition",
      "clinical-nutrition",
      "health",
      "diet-therapy",
    ],
  },
];

/**
 * Get user type by ID
 */
export function getUserTypeById(id: string): UserTypeSeedData | undefined {
  return userTypesSeedData.find((ut) => ut.id === id);
}

/**
 * Get user types by category
 */
export function getUserTypesByCategory(
  category: UserTypeCategory
): UserTypeSeedData[] {
  return userTypesSeedData.filter((ut) => ut.category === category);
}

/**
 * Get active user types
 */
export function getActiveUserTypes(): UserTypeSeedData[] {
  return userTypesSeedData.filter((ut) => ut.isActive);
}
