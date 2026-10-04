/** Kind of provider account: a person, or a company (P.IVA holder). Absent ⇒ 'individual'. */
export type ProviderType = "individual" | "business";

/** `instructors/{uid}.business` — company details of a business provider. */
export interface BusinessDetails {
  /** Ragione sociale. Admin-verified; owner read-only after approval. */
  legalName: string;
  /** Italian P.IVA, 11 digits. Admin-verified; owner read-only after approval. */
  vatNumber: string;
  /** Shown publicly; also copied to the instructor's name/fullName. */
  displayName: string;
  description?: string;
  website?: string | null;
  logoUrl?: string | null;
  city?: string;
}
