/**
 * Team Chat Page
 *
 * Features:
 * - Group chat (all reps) via Firestore `teamChat` collection
 * - Direct messages via `dmChannels/{channelId}/messages` sub-collections
 * - Location sharing — sends current GPS as a Google Maps link in chat
 * - Quick status presets — one-tap status announcements
 * - Unread badge tracking via React state + localStorage
 * - Auto-scroll to bottom on new messages
 * - File/image sharing via Firebase Storage
 * - DM push notifications via Browser Notification API
 * - Emoji reactions on messages (toggle per rep)
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { MessageCircle, MapPin, Send, ArrowLeft, ChevronDown, ChevronUp, Paperclip, Download } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import {
  useTeamChat,
  useSendChatMessage,
  useDirectMessages,
  useSendDirectMessage,
  useToggleReaction,
} from '../hooks/useFirebase';
import { ChatMessage } from '../types';
import { uploadFile } from '../lib/storage';
import { useToast } from '../context/ToastContext';

// ── Helpers ────────────────────────────────────────────────────────────────────

function dmChannelId(a: number, b: number): string {
  return `${Math.min(a, b)}_${Math.max(a, b)}`;
}

function lastReadKey(channel: 'group' | string): string {
  return channel === 'group' ? 'asgChat_lastRead_group' : `asgChat_lastRead_dm_${channel}`;
}

function getLastRead(channel: 'group' | string): number {
  return parseInt(localStorage.getItem(lastReadKey(channel)) ?? '0', 10);
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
}

// ── Status presets ─────────────────────────────────────────────────────────────
const STATUS_PRESETS = [
  { label: '🚪 Out knocking',   suffix: 'is out knocking' },
  { label: '🚗 Driving',        suffix: 'is driving between areas' },
  { label: '☕ On a break',      suffix: 'is on a break' },
  { label: '🏠 Back at office', suffix: 'is back at the office' },
  { label: '📋 In a meeting',   suffix: 'is in a meeting' },
];

// ── Emoji reaction constants ───────────────────────────────────────────────────
const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '🎉', '✅'];

// ── Unread count hook — uses passed-in lastReadTime (reactive via state) ──────
function useUnreadCount(messages: ChatMessage[], lastReadTime: number): number {
  return useMemo(() => {
    return messages.filter((m) => m.timestamp > lastReadTime).length;
  }, [messages, lastReadTime]);
}

// ── Message bubble ─────────────────────────────────────────────────────────────
function MessageBubble({
  msg,
  isOwn,
  currentRepId,
  isDm,
  dmChannelId: dmChanId,
}: {
  msg: ChatMessage;
  isOwn: boolean;
  currentRepId: number;
  isDm?: boolean;
  dmChannelId?: string;
}) {
  const { toggle } = useToggleReaction();
  const [showPicker, setShowPicker] = useState(false);

  // Close picker on outside click
  useEffect(() => {
    if (!showPicker) return;
    const handler = () => setShowPicker(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [showPicker]);

  if (msg.type === 'status') {
    return (
      <div className="flex justify-center my-1">
        <div className="px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-medium">
          {msg.text}
          <span className="ml-2 text-amber-400 dark:text-amber-600 text-xs">{fmtTime(msg.timestamp)}</span>
        </div>
      </div>
    );
  }

  const hasReactions = msg.reactions && Object.keys(msg.reactions).length > 0;

  return (
    <div className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar (others only) */}
      {!isOwn && (
        <div className="w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-xs font-bold flex items-center justify-center flex-shrink-0 mb-0.5">
          {msg.repName[0]}
        </div>
      )}

      <div className={`flex flex-col gap-0.5 max-w-[70%] ${isOwn ? 'items-end' : 'items-start'}`}>
        {/* Name (others only) */}
        {!isOwn && (
          <span className="text-xs text-gray-400 dark:text-gray-500 pl-1">{msg.repName}</span>
        )}

        {/* Bubble wrapper with reaction trigger */}
        <div className="relative group/rx">
          {/* Bubble */}
          <div className={`px-3 py-2 rounded-2xl text-sm leading-snug break-words ${
            isOwn
              ? 'bg-amber-500 text-white rounded-br-sm'
              : 'bg-white dark:bg-slate-800 text-gray-900 dark:text-white border border-gray-200 dark:border-slate-700 rounded-bl-sm'
          }`}>
            {msg.type === 'location' ? (
              <span>
                {msg.text}{' '}
                <a
                  href={`https://maps.google.com/?q=${msg.lat},${msg.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`underline ${isOwn ? 'text-amber-100' : 'text-blue-500 dark:text-blue-400'}`}
                >
                  Open in Maps →
                </a>
              </span>
            ) : msg.type === 'file' ? (
              <a
                href={msg.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 hover:opacity-80 transition"
                title="Download file"
              >
                <Download size={14} className="flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate max-w-[180px]">{msg.fileName}</p>
                  {msg.fileSize !== undefined && (
                    <p className="text-xs opacity-70">
                      {msg.fileSize < 1024 * 1024
                        ? `${Math.round(msg.fileSize / 1024)}KB`
                        : `${(msg.fileSize / (1024 * 1024)).toFixed(1)}MB`}
                    </p>
                  )}
                </div>
              </a>
            ) : (
              <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>
            )}
          </div>

          {/* Hover reaction trigger button */}
          <button
            className={`absolute -top-2 ${isOwn ? 'left-0' : 'right-0'} opacity-0 group-hover/rx:opacity-100 transition-opacity text-xs bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-full px-1.5 py-0.5 shadow-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 z-10`}
            onClick={(e) => { e.stopPropagation(); setShowPicker((p) => !p); }}
            title="Add reaction"
          >
            😊+
          </button>

          {/* Emoji picker dropdown */}
          {showPicker && (
            <div
              className={`absolute z-20 bottom-full mb-1 ${isOwn ? 'right-0' : 'left-0'} bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg p-1.5 flex gap-1`}
              onClick={(e) => e.stopPropagation()}
            >
              {REACTION_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  className="text-lg hover:scale-125 transition-transform p-0.5 rounded"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(msg.id, emoji, currentRepId, !!isDm, dmChanId);
                    setShowPicker(false);
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Reactions row */}
        {hasReactions && (
          <div className={`flex flex-wrap gap-1 mt-0.5 ${isOwn ? 'justify-end' : 'justify-start'}`}>
            {Object.entries(msg.reactions!)
              .filter(([, reactors]) => reactors.length > 0)
              .map(([emoji, reactors]) => {
                const iReacted = reactors.includes(currentRepId);
                return (
                  <button
                    key={emoji}
                    onClick={() => toggle(msg.id, emoji, currentRepId, !!isDm, dmChanId)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-all ${
                      iReacted
                        ? 'bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 font-semibold'
                        : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-slate-500'
                    }`}
                    title={`${reactors.length} reaction${reactors.length !== 1 ? 's' : ''}`}
                  >
                    <span>{emoji}</span>
                    <span>{reactors.length}</span>
                  </button>
                );
              })}
          </div>
        )}

        {/* Timestamp */}
        <span className="text-xs text-gray-400 dark:text-gray-600 px-1">{fmtTime(msg.timestamp)}</span>
      </div>
    </div>
  );
}

// ── Date divider ───────────────────────────────────────────────────────────────
function DateDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-3">
      <div className="flex-1 h-px bg-gray-200 dark:bg-slate-700" />
      <span className="text-xs text-gray-400 dark:text-gray-500 font-medium px-2">{label}</span>
      <div className="flex-1 h-px bg-gray-200 dark:bg-slate-700" />
    </div>
  );
}

// ── Message list with date grouping ───────────────────────────────────────────
function MessageList({
  messages,
  currentRepId,
  onMarkRead,
  isDm,
  dmChannelId: dmChanId,
}: {
  messages: ChatMessage[];
  currentRepId: number;
  onMarkRead: () => void;
  isDm?: boolean;
  dmChannelId?: string;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);

  // Track whether user is near the bottom
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  }, []);

  // Auto-scroll only when already at bottom
  useEffect(() => {
    if (atBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, atBottom]);

  // Initial scroll to bottom on load
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'instant' });
  }, []);

  // Mark read whenever new messages arrive while actively viewing
  useEffect(() => {
    if (messages.length > 0) onMarkRead();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // Inject date dividers
  const rendered: React.ReactNode[] = [];
  let lastDateLabel = '';

  messages.forEach((msg) => {
    const label = fmtDate(msg.timestamp);
    if (label !== lastDateLabel) {
      rendered.push(<DateDivider key={`date-${msg.timestamp}`} label={label} />);
      lastDateLabel = label;
    }
    rendered.push(
      <MessageBubble
        key={msg.id}
        msg={msg}
        isOwn={msg.repId === currentRepId}
        currentRepId={currentRepId}
        isDm={isDm}
        dmChannelId={dmChanId}
      />
    );
  });

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto p-4 space-y-1"
    >
      {messages.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 dark:text-gray-600">
          <MessageCircle size={36} className="mb-3 opacity-30" />
          <p className="text-sm">No messages yet</p>
          <p className="text-xs mt-1">Say hello to the team 👋</p>
        </div>
      )}
      {rendered}
      <div ref={bottomRef} />
    </div>
  );
}

// ── Shared input bar (used by both GroupChannel and DMChannel) ─────────────────
interface InputBarProps {
  placeholder: string;
  input: string;
  setInput: (v: string) => void;
  showStatus: boolean;
  setShowStatus: (v: boolean | ((prev: boolean) => boolean)) => void;
  locLoading: boolean;
  uploadingFile: boolean;
  onSend: () => void;
  onLocation: () => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function InputBar({
  placeholder,
  input,
  setInput,
  showStatus,
  setShowStatus,
  locLoading,
  uploadingFile,
  onSend,
  onLocation,
  onFileChange,
}: InputBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="border-t border-gray-200 dark:border-slate-700 px-3 py-2.5 flex items-center gap-2 flex-shrink-0">
      <button
        onClick={() => setShowStatus((s) => !s)}
        title="Quick status"
        className={`p-2 rounded-lg transition text-sm ${
          showStatus
            ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600'
            : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800'
        }`}
      >
        {showStatus ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
      </button>
      <button
        onClick={onLocation}
        disabled={locLoading}
        title="Share location"
        className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-blue-500 transition"
      >
        <MapPin size={16} className={locLoading ? 'animate-pulse text-blue-500' : ''} />
      </button>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploadingFile}
        title="Attach file"
        className="p-2 text-gray-400 hover:text-amber-500 transition disabled:opacity-50"
      >
        <Paperclip size={16} className={uploadingFile ? 'animate-pulse text-amber-500' : ''} />
      </button>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={onFileChange}
      />
      <input
        className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder-gray-400"
        placeholder={placeholder}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
      />
      <button
        onClick={onSend}
        disabled={!input.trim() || uploadingFile}
        className="p-2 rounded-xl bg-amber-500 text-white hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        <Send size={16} />
      </button>
    </div>
  );
}

// ── Group chat channel (uses useTeamChat) ──────────────────────────────────────
function GroupChannel({
  currentRepId,
  onMarkRead,
}: {
  currentRepId: number;
  onMarkRead: () => void;
}) {
  const { messages, loading } = useTeamChat();
  const { send } = useSendChatMessage();
  const [input, setInput] = useState('');
  const [showStatus, setShowStatus] = useState(false);
  const [locLoading, setLocLoading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const { currentUser } = useAppStore();
  const { showToast } = useToast();

  // Request notification permission on first load
  useEffect(() => {
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !currentUser) return;
    setInput('');
    await send({
      repId: currentUser.id,
      repName: currentUser.name,
      text,
      type: 'text',
      timestamp: Date.now(),
      createdAt: Date.now(),
    });
  };

  const handleStatus = async (suffix: string) => {
    if (!currentUser) return;
    setShowStatus(false);
    await send({
      repId: currentUser.id,
      repName: currentUser.name,
      text: `${currentUser.name} ${suffix}`,
      type: 'status',
      timestamp: Date.now(),
      createdAt: Date.now(),
    });
  };

  const handleLocation = async () => {
    if (!currentUser) return;
    if (!navigator.geolocation) {
      showToast('Location is not supported on this device', 'error');
      return;
    }
    // Check current permission state first (avoids a silent no-op)
    if (navigator.permissions) {
      try {
        const perm = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        if (perm.state === 'denied') {
          showToast('Location permission is blocked. Please enable it in your browser settings (Settings → Privacy → Location)', 'error');
          return;
        }
      } catch {
        // permissions API not supported — proceed and let getCurrentPosition handle it
      }
    }
    setLocLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await send({
          repId: currentUser.id,
          repName: currentUser.name,
          text: `📍 ${currentUser.name} shared their location`,
          type: 'location',
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          timestamp: Date.now(),
          createdAt: Date.now(),
        });
        setLocLoading(false);
      },
      (err) => {
        setLocLoading(false);
        if (err.code === 1 /* PERMISSION_DENIED */) {
          showToast('Location permission denied. Enable location for this site in browser settings', 'error');
        } else if (err.code === 2 /* POSITION_UNAVAILABLE */) {
          showToast('Location unavailable. Make sure location services are enabled on this device', 'error');
        } else {
          showToast('Could not get your location. Please try again', 'error');
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;
    e.target.value = '';
    setUploadingFile(true);
    try {
      const path = `chatFiles/${Date.now()}_${file.name}`;
      const url = await uploadFile(path, file);
      await send({
        repId: currentUser.id,
        repName: currentUser.name,
        text: file.name,
        type: 'file',
        fileUrl: url,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        timestamp: Date.now(),
        createdAt: Date.now(),
      });
    } catch (err) {
      console.error('File upload failed:', err);
    } finally {
      setUploadingFile(false);
    }
  };

  if (loading) return <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Loading…</div>;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <MessageList
        messages={messages}
        currentRepId={currentRepId}
        onMarkRead={onMarkRead}
        isDm={false}
      />

      {/* Status presets */}
      {showStatus && (
        <div className="border-t border-gray-100 dark:border-slate-800 px-3 py-2 flex flex-wrap gap-1.5">
          {STATUS_PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => handleStatus(p.suffix)}
              className="px-3 py-1 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition"
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      <InputBar
        placeholder="Message the team…"
        input={input}
        setInput={setInput}
        showStatus={showStatus}
        setShowStatus={setShowStatus}
        locLoading={locLoading}
        uploadingFile={uploadingFile}
        onSend={handleSend}
        onLocation={handleLocation}
        onFileChange={handleFileChange}
      />
    </div>
  );
}

// ── DM channel (uses useDirectMessages) ───────────────────────────────────────
function DMChannel({
  channelId,
  currentRepId,
  otherRepName,
  activeDmChannel,
  onMarkRead,
}: {
  channelId: string;
  currentRepId: number;
  otherRepName: string;
  activeDmChannel: string;
  onMarkRead: () => void;
}) {
  const { messages, loading } = useDirectMessages(channelId);
  const { send: sendDM } = useSendDirectMessage();
  const [input, setInput] = useState('');
  const [showStatus, setShowStatus] = useState(false);
  const [locLoading, setLocLoading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const { currentUser } = useAppStore();
  const { showToast } = useToast();

  // Push notification for incoming DMs
  useEffect(() => {
    if (!messages.length || !currentUser) return;
    const lastMsg = messages[messages.length - 1];
    // Only notify about messages from others
    if (lastMsg.repId === currentUser.id) return;
    // Only notify when not viewing this DM channel
    if (activeDmChannel === channelId) return;
    // Only notify if message is recent (< 10s old)
    if (Date.now() - lastMsg.timestamp > 10000) return;

    if (Notification.permission === 'granted') {
      new Notification(`💬 ${lastMsg.repName}`, {
        body: lastMsg.type === 'file'
          ? `Sent a file: ${lastMsg.fileName}`
          : lastMsg.text,
        tag: `dm-${lastMsg.repId}`,
      });
    }
  }, [messages, currentUser, activeDmChannel, channelId]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !currentUser) return;
    setInput('');
    await sendDM(channelId, {
      repId: currentUser.id,
      repName: currentUser.name,
      text,
      type: 'text',
      timestamp: Date.now(),
      createdAt: Date.now(),
    });
  };

  const handleStatus = async (suffix: string) => {
    if (!currentUser) return;
    setShowStatus(false);
    await sendDM(channelId, {
      repId: currentUser.id,
      repName: currentUser.name,
      text: `${currentUser.name} ${suffix}`,
      type: 'status',
      timestamp: Date.now(),
      createdAt: Date.now(),
    });
  };

  const handleLocation = async () => {
    if (!currentUser) return;
    if (!navigator.geolocation) {
      showToast('Location is not supported on this device', 'error');
      return;
    }
    if (navigator.permissions) {
      try {
        const perm = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        if (perm.state === 'denied') {
          showToast('Location permission is blocked. Please enable it in your browser settings (Settings → Privacy → Location)', 'error');
          return;
        }
      } catch { /* permissions API not supported — let getCurrentPosition handle it */ }
    }
    setLocLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await sendDM(channelId, {
          repId: currentUser.id,
          repName: currentUser.name,
          text: `📍 ${currentUser.name} shared their location`,
          type: 'location',
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          timestamp: Date.now(),
          createdAt: Date.now(),
        });
        setLocLoading(false);
      },
      (err) => {
        setLocLoading(false);
        if (err.code === 1) showToast('Location permission denied. Enable location for this site in browser settings', 'error');
        else if (err.code === 2) showToast('Location unavailable. Make sure location services are enabled on this device', 'error');
        else showToast('Could not get your location. Please try again', 'error');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;
    e.target.value = '';
    setUploadingFile(true);
    try {
      const path = `chatFiles/${Date.now()}_${file.name}`;
      const url = await uploadFile(path, file);
      await sendDM(channelId, {
        repId: currentUser.id,
        repName: currentUser.name,
        text: file.name,
        type: 'file',
        fileUrl: url,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        timestamp: Date.now(),
        createdAt: Date.now(),
      });
    } catch (err) {
      console.error('File upload failed:', err);
    } finally {
      setUploadingFile(false);
    }
  };

  if (loading) return <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Loading…</div>;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <MessageList
        messages={messages}
        currentRepId={currentRepId}
        onMarkRead={onMarkRead}
        isDm={true}
        dmChannelId={channelId}
      />

      {showStatus && (
        <div className="border-t border-gray-100 dark:border-slate-800 px-3 py-2 flex flex-wrap gap-1.5">
          {STATUS_PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => handleStatus(p.suffix)}
              className="px-3 py-1 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition"
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      <InputBar
        placeholder={`Message ${otherRepName}…`}
        input={input}
        setInput={setInput}
        showStatus={showStatus}
        setShowStatus={setShowStatus}
        locLoading={locLoading}
        uploadingFile={uploadingFile}
        onSend={handleSend}
        onLocation={handleLocation}
        onFileChange={handleFileChange}
      />
    </div>
  );
}

// ── DM sidebar item — subscribes to its own channel for unread count ───────────
function DMSidebarItem({
  rep,
  isActive,
  onSelect,
  currentUserId,
  lastReadTime,
}: {
  rep: { id: number; name: string };
  isActive: boolean;
  onSelect: () => void;
  currentUserId: number;
  lastReadTime: number;
}) {
  const chId = dmChannelId(currentUserId, rep.id);
  const { messages } = useDirectMessages(chId);
  const unread = useUnreadCount(messages, lastReadTime);

  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition ${
        isActive
          ? 'bg-amber-500 text-white'
          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800'
      }`}
    >
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 relative ${
        isActive
          ? 'bg-amber-400 text-white'
          : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400'
      }`}>
        {rep.name[0]}
        {unread > 0 && !isActive && (
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-amber-500 rounded-full border-2 border-white dark:border-slate-900" />
        )}
      </div>
      <span className="flex-1 text-left truncate">{rep.name}</span>
      {unread > 0 && !isActive && (
        <span className="bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none min-w-[18px] text-center">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  );
}

// ── Main TeamChat page ─────────────────────────────────────────────────────────
export function TeamChatPage() {
  const { currentUser, reps } = useAppStore();
  const { messages: groupMessages } = useTeamChat();

  // activeChannel: 'group' or a rep.id number (DM target)
  const [activeChannel, setActiveChannel] = useState<'group' | number>('group');
  // On mobile, hide sidebar when in a channel
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(true);

  // ── Unread tracking via React state (fixes stale localStorage reads) ────────
  const [lastReadTimes, setLastReadTimes] = useState<Record<string, number>>(() => {
    const obj: Record<string, number> = {};
    try {
      const g = localStorage.getItem('asgChat_lastRead_group');
      if (g) obj['group'] = parseInt(g, 10);
    } catch { /* ignore */ }
    return obj;
  });

  const handleMarkRead = useCallback((channelKey: string) => {
    const now = Date.now();
    try {
      localStorage.setItem(lastReadKey(channelKey === 'group' ? 'group' : channelKey), String(now));
    } catch { /* ignore */ }
    setLastReadTimes((prev) => ({ ...prev, [channelKey]: now }));
  }, []);

  // Request notification permission on mount
  useEffect(() => {
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const groupLastRead = lastReadTimes['group'] ?? getLastRead('group');
  const groupUnread = useUnreadCount(groupMessages, groupLastRead);

  if (!currentUser) return null;

  const otherReps = reps.filter((r) => r.active && r.id !== currentUser.id);

  const handleSelectChannel = (ch: 'group' | number) => {
    setActiveChannel(ch);
    const key = ch === 'group' ? 'group' : dmChannelId(currentUser.id, ch as number);
    handleMarkRead(key);
    setMobileSidebarOpen(false);
  };

  const currentDmChannelId = activeChannel !== 'group'
    ? dmChannelId(currentUser.id, activeChannel as number)
    : '';

  const activeDmRep = activeChannel !== 'group'
    ? reps.find((r) => r.id === activeChannel)
    : null;

  return (
    <div className="flex-1 flex overflow-hidden bg-gray-50 dark:bg-slate-950">

      {/* ── Sidebar ── */}
      <div className={`w-64 flex-shrink-0 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-700 flex flex-col ${
        mobileSidebarOpen ? 'flex' : 'hidden sm:flex'
      }`}>
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-gray-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <MessageCircle size={16} className="text-amber-500" />
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Team Chat</h2>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">Logged in as <strong>{currentUser.name}</strong></p>
        </div>

        {/* Group chat */}
        <div className="px-2 pt-3 pb-1">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide px-2 mb-1">Channels</p>
          <button
            onClick={() => handleSelectChannel('group')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
              activeChannel === 'group'
                ? 'bg-amber-500 text-white'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800'
            }`}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
              activeChannel === 'group' ? 'bg-amber-400' : 'bg-amber-100 dark:bg-amber-900/40'
            }`}>
              <MessageCircle size={14} className={activeChannel === 'group' ? 'text-white' : 'text-amber-600 dark:text-amber-400'} />
            </div>
            <span className="flex-1 text-left">Group Chat</span>
            {groupUnread > 0 && activeChannel !== 'group' && (
              <span className="bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none min-w-[18px] text-center">
                {groupUnread > 9 ? '9+' : groupUnread}
              </span>
            )}
          </button>
        </div>

        {/* DM list */}
        <div className="px-2 pt-3 pb-2 flex-1 overflow-y-auto">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide px-2 mb-1">Direct Messages</p>
          {otherReps.length === 0 ? (
            <p className="text-xs text-gray-400 px-2 py-2">No other active reps</p>
          ) : (
            <div className="space-y-0.5">
              {otherReps.map((rep) => {
                const dmKey = dmChannelId(currentUser.id, rep.id);
                const dmLastRead = lastReadTimes[dmKey] ?? getLastRead(dmKey);
                return (
                  <DMSidebarItem
                    key={rep.id}
                    rep={rep}
                    isActive={activeChannel === rep.id}
                    onSelect={() => handleSelectChannel(rep.id)}
                    currentUserId={currentUser.id}
                    lastReadTime={dmLastRead}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Chat panel ── */}
      <div className={`flex-1 flex flex-col min-w-0 ${!mobileSidebarOpen ? 'flex' : 'hidden sm:flex'}`}>
        {/* Channel header */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center gap-3 flex-shrink-0">
          {/* Mobile back button */}
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="sm:hidden p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition"
          >
            <ArrowLeft size={16} />
          </button>

          {activeChannel === 'group' ? (
            <>
              <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
                <MessageCircle size={14} className="text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Group Chat</p>
                <p className="text-xs text-gray-400">{reps.filter((r) => r.active).length} members</p>
              </div>
            </>
          ) : (
            <>
              <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-sm font-bold flex items-center justify-center flex-shrink-0">
                {activeDmRep?.name?.[0] ?? '?'}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{activeDmRep?.name ?? '—'}</p>
                <p className="text-xs text-gray-400">Direct message</p>
              </div>
            </>
          )}
        </div>

        {/* Channel content */}
        {activeChannel === 'group' ? (
          <GroupChannel
            currentRepId={currentUser.id}
            onMarkRead={() => handleMarkRead('group')}
          />
        ) : (
          <DMChannel
            channelId={currentDmChannelId}
            currentRepId={currentUser.id}
            otherRepName={activeDmRep?.name ?? '—'}
            activeDmChannel={currentDmChannelId}
            onMarkRead={() => handleMarkRead(currentDmChannelId)}
          />
        )}
      </div>
    </div>
  );
}

export default TeamChatPage;
