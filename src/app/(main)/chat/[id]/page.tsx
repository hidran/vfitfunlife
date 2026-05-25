import ChatClient from './ChatClient';

export const dynamicParams = false;

export function generateStaticParams() {
  return [{ id: 'placeholder' }];
}

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  await params;
  return <ChatClient />;
}
