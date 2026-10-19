import { Suspense } from 'react';
import { GymManageClient } from '@/components/gym/GymManageClient';

export default function GymManagePage() {
  return <Suspense><GymManageClient /></Suspense>;
}
