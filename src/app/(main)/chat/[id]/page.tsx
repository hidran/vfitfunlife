import ChatClient from './ChatClient';

export function generateStaticParams() {
  return [{ id: 'placeholder' }];
}

export default function ChatPage() {
  return <ChatClient />;
}
