import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

type ConvCb = (conv: unknown, committed: boolean) => void;
type MsgCb = (msgs: Array<{ id: string; senderId: string; text: string; createdAt: null; pending: boolean }>) => void;

const h = vi.hoisted(() => ({
  convCb: null as ConvCb | null,
  msgCb: null as MsgCb | null,
  send: vi.fn(),
  markRead: vi.fn(),
  nextId: 0,
}));

vi.mock('@/lib/firebase/chat', () => ({
  subscribeToConversations: vi.fn(() => () => {}),
  subscribeToConversation: vi.fn((_id: string, cb: ConvCb) => {
    h.convCb = cb;
    return () => {};
  }),
  subscribeToMessages: vi.fn((_id: string, cb: MsgCb) => {
    h.msgCb = cb;
    return () => {};
  }),
  sendChatMessage: (...args: unknown[]) => h.send(...args),
  markConversationRead: (...args: unknown[]) => h.markRead(...args),
  newMessageId: () => `m${++h.nextId}`,
}));

import { useChatThread } from './useChat';

const participants = { me: { name: 'Me', photoUrl: null }, you: { name: 'You', photoUrl: null } };

function renderThread() {
  return renderHook(() =>
    useChatThread({ conversationId: 'me_you', me: 'me', other: 'you', participants, bookingId: 'b1' }),
  );
}

beforeEach(() => {
  h.convCb = null;
  h.msgCb = null;
  h.nextId = 0;
  h.send.mockReset();
  h.markRead.mockReset().mockResolvedValue(undefined);
});

describe('useChatThread', () => {
  it('first message creates the conversation and shows optimistically until delivered', async () => {
    let resolveSend: () => void = () => {};
    h.send.mockImplementation(() => new Promise<void>((r) => { resolveSend = r; }));
    const { result } = renderThread();
    act(() => h.convCb?.(null, false));
    expect(result.current.state).toBe('ready');

    act(() => {
      expect(result.current.send('  hello  ')).toBe(true);
    });
    expect(h.send).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'me_you',
        messageId: 'm1',
        senderId: 'me',
        text: 'hello',
        create: { me: 'me', other: 'you', participants, bookingId: 'b1' },
      }),
    );
    expect(result.current.messages).toEqual([
      expect.objectContaining({ id: 'm1', text: 'hello', status: 'sending' }),
    ]);

    await act(async () => resolveSend());
    // Acknowledged but the listener has not delivered it yet: still shown once.
    expect(result.current.messages.map((m) => m.id)).toEqual(['m1']);

    act(() => h.convCb?.({ id: 'me_you', participants, unread: {} }, true));
    act(() => h.msgCb?.([{ id: 'm1', senderId: 'me', text: 'hello', createdAt: null, pending: false }]));
    await waitFor(() => expect(result.current.messages).toEqual([
      expect.objectContaining({ id: 'm1', status: 'sent' }),
    ]));
  });

  it('does not re-create an existing conversation', () => {
    h.send.mockResolvedValue(undefined);
    const { result } = renderThread();
    act(() => h.convCb?.({ id: 'me_you', participants, unread: {} }, true));
    act(() => { result.current.send('hi'); });
    expect(h.send).toHaveBeenCalledWith(expect.objectContaining({ create: undefined }));
  });

  it('rejects blank and over-long text', () => {
    const { result } = renderThread();
    act(() => h.convCb?.(null, false));
    expect(result.current.send('   ')).toBe(false);
    expect(result.current.send('x'.repeat(2001))).toBe(false);
    expect(h.send).not.toHaveBeenCalled();
  });

  it('marks a failed send and retries it with the same id', async () => {
    h.send.mockRejectedValueOnce(new Error('denied')).mockResolvedValueOnce(undefined);
    const { result } = renderThread();
    act(() => h.convCb?.({ id: 'me_you', participants, unread: {} }, true));
    await act(async () => { result.current.send('oops'); });
    expect(result.current.messages).toEqual([expect.objectContaining({ id: 'm1', status: 'failed' })]);

    await act(async () => result.current.retry('m1'));
    expect(h.send).toHaveBeenLastCalledWith(expect.objectContaining({ messageId: 'm1', text: 'oops' }));
    // Acknowledged; shown as sending until the listener delivers it.
    expect(result.current.messages).toEqual([expect.objectContaining({ id: 'm1', status: 'sending' })]);
    act(() => h.msgCb?.([{ id: 'm1', senderId: 'me', text: 'oops', createdAt: null, pending: false }]));
    expect(result.current.messages).toEqual([expect.objectContaining({ id: 'm1', status: 'sent' })]);
  });

  it('resets my unread counter while the thread is open', () => {
    renderThread();
    act(() => h.convCb?.({ id: 'me_you', participants, unread: { me: 2 } }, true));
    expect(h.markRead).toHaveBeenCalledWith('me_you', 'me');
  });
});
