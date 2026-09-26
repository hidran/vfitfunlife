import { Suspense } from 'react';
import { RegisterClient } from './RegisterClient';

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-background-dark via-background-dark to-primary-dark/20" />
      }
    >
      <RegisterClient />
    </Suspense>
  );
}
