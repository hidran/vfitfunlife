export type AuthMethod = 'phone' | 'google' | 'apple';

export interface PhoneAuthState {
  phoneNumber: string;
  countryCode: string;
  isOtpSent: boolean;
  otpCode: string;
}

export interface LoginFormData {
  phoneNumber: string;
  countryCode: string;
}

export interface OtpFormData {
  code: string;
}

export interface AuthError {
  code: string;
  message: string;
}

export interface RegistrationData {
  fullName: string;
  email?: string;
  dateOfBirth?: Date;
  preferredSection?: 'fit' | 'fun' | 'life';
}
