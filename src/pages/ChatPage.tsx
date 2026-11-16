import { MessageSquare, Send } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../components/ToastContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { ChatContact, ChatMessage, User } from '../types.ts';

interface ChatPageProps {
  user: User;
  onlineUserIds: number[];
  incomingMessage: ChatMessage | null;
  onUnreadChange: () => void;
}

export function ChatPage({ user, onlineUserIds, incomingMessage, onUnreadChange }: ChatPageProps) {
  const { showToast } = useToast();
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [selectedPeer, setSelectedPeer] = useState<ChatContact | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadContacts = useCallback(async () => {
    try {
      const res = await apiFetch<{ contacts: ChatContact[] }>('/api/chat/contacts');
      setContacts(res.contacts);
      if (!selectedPeer && res.contacts[0]) {
        setSelectedPeer(res.contacts[0]);
      }
    } catch {
      // ignore
    }
  }, [selectedPeer]);

  const loadMessages = useCallback(async (peerId: number) => {
    try {
      const res = await apiFetch<{ messages: ChatMessage[] }>(`/api/chat/messages/${peerId}`);
      setMessages(res.messages);
      onUnreadChange();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  }, [onUnreadChange, showToast]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  useEffect(() => {
    if (selectedPeer) {
      loadMessages(selectedPeer.id);
    }
  }, [selectedPeer, loadMessages]);

  useEffect(() => {
    if (!incomingMessage) return;
    if (
      selectedPeer &&
      ((incomingMessage.sender_id === selectedPeer.id && incomingMessage.receiver_id === user.id) ||
        (incomingMessage.sender_id === user.id && incomingMessage.receiver_id === selectedPeer.id))
    ) {
      setMessages((prev) => (prev.some((m) => m.id === incomingMessage.id) ? prev : [...prev, incomingMessage]));
      if (incomingMessage.sender_id === selectedPeer.id) {
        apiFetch(`/api/chat/read/${selectedPeer.id}`, { method: 'PATCH' }).then(onUnreadChange).catch(() => {});
      }
    }
    loadContacts();
  }, [incomingMessage, selectedPeer, user.id, loadContacts, onUnreadChange]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPeer || !text.trim()) return;
    const body = text.trim();
    setText('');
    try {
      const res = await apiFetch<{ message: ChatMessage }>(`/api/chat/messages/${selectedPeer.id}`, {
        method: 'POST',
        body: JSON.stringify({ message: body }),
      });
      setMessages((prev) => (prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]));
      loadContacts();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  return (
    <div className="h-[calc(100vh-8.5rem)] rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden flex">
      {/* Contacts List */}
      <div className="w-72 border-r border-slate-200 dark:border-slate-800 flex flex-col">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <h1 className="font-display text-sm font-bold text-slate-900 dark:text-white">
            {user.role === 'super_admin' ? 'IT Moderators' : 'IT Head Direct Line'}
          </h1>
          <p className="text-[11px] text-slate-500">Real-time WebSocket dispatch</p>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {contacts.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              No active {user.role === 'super_admin' ? 'moderators' : 'administrators'} available yet.
            </div>
          ) : (
            contacts.map((c) => {
              const online = onlineUserIds.includes(c.id) || c.is_online;
              const active = selectedPeer?.id === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedPeer(c)}
                  className={`w-full text-left px-4 py-3 flex items-start justify-between gap-2 transition-colors ${
                    active ? 'bg-blue-50 dark:bg-blue-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {c.full_name}
                      </span>
                      <span
                        className={`text-[10px] font-medium ${
                          online ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                        }`}
                      >
                        {online ? 'Online' : 'Offline'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 truncate mt-0.5">
                      {c.last_message || c.specialization || c.email}
                    </div>
                  </div>
                  {c.unread_count > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-blue-700 text-white font-mono text-[10px] font-bold">
                      {c.unread_count}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Chat Thread */}
      <div className="flex-1 flex flex-col">
        {selectedPeer ? (
          <>
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-slate-900 dark:text-white">{selectedPeer.full_name}</div>
                <div className="text-xs text-slate-500">
                  {onlineUserIds.includes(selectedPeer.id) ? 'Connected now' : 'Offline'} · {selectedPeer.email}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-slate-50/50 dark:bg-slate-950/30">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-xs text-slate-400 gap-2">
                  <MessageSquare className="w-6 h-6" />
                  <span>Start a direct conversation with {selectedPeer.full_name}</span>
                </div>
              ) : (
                messages.map((m) => {
                  const mine = m.sender_id === user.id;
                  return (
                    <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-md px-3.5 py-2 rounded-xl text-sm ${
                          mine
                            ? 'bg-blue-700 text-white'
                            : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        <div className="whitespace-pre-wrap">{m.message}</div>
                        <div
                          className={`text-[10px] font-mono tabular-nums mt-1 ${
                            mine ? 'text-blue-200 text-right' : 'text-slate-400'
                          }`}
                        >
                          {new Date(m.created_at).toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            <form onSubmit={handleSend} className="p-3 border-t border-slate-200 dark:border-slate-800 flex gap-2">
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={`Message ${selectedPeer.full_name}...`}
                className="flex-1 px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" /> Send
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
            Select a contact to view chat history.
          </div>
        )}
      </div>
    </div>
  );
}
