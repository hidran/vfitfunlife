import { Suspense } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import ChatThreadClient from './ChatThreadClient';

/**
 * Chat thread, addressed as `/chat/detail?id=<conversationId>` or
 * `/chat/detail?with=<otherUid>` (see chatHref in src/lib/routes.ts). A `[id]` segment cannot
 * serve Firestore ids under `output: 'export'` (dynamicParams = false).
 */
export default function ChatThreadPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <Spinner size="md" />
        </div>
      }
    >
      <ChatThreadClient />
    </Suspense>
  );
}
