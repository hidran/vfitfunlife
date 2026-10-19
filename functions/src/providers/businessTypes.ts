/**
 * Kind of provider account: a person, or a company or association (holder of a P.IVA /
 * codice fiscale). Absent ⇒ 'individual'.
 */
export type ProviderType = "individual" | "business";

/** Legal form of a business provider (B3b). Absent on documents written before B3b ⇒ 'company'. */
export type BusinessLegalForm = "company" | "sole_trader" | "association" | "other";

/** `instructors/{uid}.business` — company details of a business provider. */
export interface BusinessDetails {
  /** Ragione sociale. Admin-verified; owner read-only after approval. */
  legalName: string;
  /**
   * Italian tax id, 11 digits: the P.IVA, or an association's codice fiscale (D3).
   * Admin-verified; owner read-only after approval.
   */
  vatNumber: string;
  /** Admin-verified, like the tax id. Always written since B3b; absent on older docs ⇒ 'company'. */
  legalForm?: BusinessLegalForm;
  /**
   * CONI / RASD / ente di promozione registration, "" when none; always written since B3b.
   * Informational, shown in the admin UI only — not secret: the instructors doc is publicly
   * readable once verified.
   */
  affiliationNumber?: string;
  /** Shown publicly; also copied to the instructor's name/fullName. */
  displayName: string;
  description?: string;
  website?: string | null;
  logoUrl?: string | null;
  city?: string;
}
