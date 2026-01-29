import * as admin from "firebase-admin";

export interface UserData {
  fullName: string;
  phone: string;
  email: string;
  isVip: boolean;
  pointsBalance: number;
  [key: string]: unknown;
}

export interface VenueData {
  name: string;
  address: string;
  [key: string]: unknown;
}

export interface ServiceData {
  name: string;
  price: number;
  vipPrice?: number;
  isHomeService?: boolean;
  homeServiceFee?: number;
  requiresDeposit?: boolean;
  depositAmount?: number;
  durationMinutes: number;
  [key: string]: unknown;
}

export interface InstructorData {
  fullName: string;
  [key: string]: unknown;
}

export interface PromotionData {
  validFrom: admin.firestore.Timestamp;
  validUntil: admin.firestore.Timestamp;
  maxUses: number | null;
  currentUses: number;
  discountType: "percentage" | "fixed_amount";
  discountValue: number;
  maxDiscount?: number;
  [key: string]: unknown;
}
