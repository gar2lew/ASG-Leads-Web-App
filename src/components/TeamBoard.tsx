import React, { useState, useEffect } from "react";
import {
  StickyNote,
  ListTodo,
  Link,
  Pin,
  PinOff,
  Plus,
  Trash2,
} from "lucide-react";
import { db } from "../lib/firebase";
import {
  collection,
  addDoc,
  deleteDoc,
  updateDoc,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { useFirebaseAuthUser } from "../hooks/useFirebaseAuthUser";

interface TeamPost {
  id: string;
  content: string;
  type: "note" | "todo" | "link";
  createdAt: number;
  createdBy: string;
  teamId: string;
  pinned: boolean;
}

const WIDGET_CARD =
  "bg-white dark:bg-[#16161A] rounded-xl border border-gray-200 dark:border-white/[0.06] overflow-hidden shadow-sm";
const WIDGET_HEADER = "flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/5";
const WIDGET_TITLE = "flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-white";
const WIDGET_BODY = "p-4";
const INPUT_CLS =
  "w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#b8933a]/40";
const BTN_AMBER =
  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#b8933a] text-white hover:bg-[#d4aa55] transition";

const NOTE_TYPE_ICONS: Record<TeamPost["type"], React.ReactNode> = {
  note: <StickyNote size={11} />,
  todo: <ListTodo size={11} />,
  link: <Link size={11} />,
};

const NOTE_TYPE_COLORS: Record<TeamPost["type"], string> = {
  note: "text-blue-500 bg-blue-50 dark:bg-blue-900/20",
  todo: "text-green-500 bg-green-50 dark:bg-green-900/20",
  link: "text-purple-500 bg-purple-50 dark:bg-purple-900/20",
};

function renderMd(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let last = 0,
    m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1] !== undefined) parts.push(<strong key={key++}>{m[1]}</strong>);
    else if (m[2] !== undefined) parts.push(<em key={key++}>{m[2]}</em>);
    else if (m[3] !== undefined)
      parts.push(
        <code
          key={key++}
          className="px-1 py-0.5 rounded bg-gray-100 dark:bg-white/10 text-[10px] font-mono"
        >
          {m[3]}
        </code>,
      );
    else if (m[4] !== undefined)
      parts.push(
        <a
          key={key++}
          href={m[5]}
          target="_blank"
          rel="noreferrer"
          className="underline text-[#b8933a] hover:text-[#d4aa55]"
        >
          {m[4]}
        </a>,
      );
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function TeamBoard({
  teamId,
  currentUserName,
}: {
  teamId: string;
  currentUserName: string;
}) {
  const { currentUser, authLoading } = useFirebaseAuthUser();
  const [posts, setPosts] = useState<TeamPost[]>([]);
  const [input, setInput] = useState("");
  const [type, setType] = useState<TeamPost["type"]>("note");

  useEffect(() => {
    if (authLoading || !currentUser) return;

    const q = query(
      collection(db, "teamPosts"),
      where("teamId", "==", teamId),
      orderBy("pinned", "desc"),
      orderBy("createdAt", "desc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TeamPost)));
      },
      (err) => {
        console.error("[TeamBoard] Firestore error:", err);
      },
    );
    return unsub;
  }, [authLoading, currentUser, teamId]);

  const add = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    await addDoc(collection(db, "teamPosts"), {
      teamId,
      content: trimmed,
      type,
      pinned: false,
      createdAt: Date.now(),
      createdBy: currentUserName,
    });
    setInput("");
  };

  const remove = (id: string) => deleteDoc(doc(db, "teamPosts", id));

  const togglePin = (post: TeamPost) =>
    updateDoc(doc(db, "teamPosts", post.id), { pinned: !post.pinned });

  const pinned = posts.filter((p) => p.pinned);
  const rest = posts.filter((p) => !p.pinned);
  const sorted = [...pinned, ...rest];

  return (
    <div className={WIDGET_CARD}>
      <div className={WIDGET_HEADER}>
        <span className={WIDGET_TITLE}>
          <StickyNote size={15} className="text-[#b8933a]" /> Team Board
        </span>
        <span className="text-xs text-gray-400">{posts.length} posts</span>
      </div>
      <div className={WIDGET_BODY + " space-y-3"}>
        {/* Input row */}
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
            placeholder="Share with team… (Enter)"
            className={INPUT_CLS}
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as TeamPost["type"])}
            className="px-2 py-1.5 rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-xs text-gray-700 dark:text-gray-300 focus:outline-none"
          >
            <option value="note">Note</option>
            <option value="todo">Todo</option>
            <option value="link">Link</option>
          </select>
          <button onClick={add} disabled={!input.trim()} className={BTN_AMBER}>
            <Plus size={14} />
          </button>
        </div>

        {/* List */}
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {sorted.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-2">
              Nothing posted yet. Share something above.
            </p>
          )}
          {sorted.map((post) => (
            <div
              key={post.id}
              className={`group flex items-start gap-2 p-2.5 rounded-lg border ${
                post.pinned
                  ? "border-[#b8933a]/40 bg-amber-50/40 dark:bg-amber-900/10"
                  : "border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-white/5"
              }`}
            >
              {/* Type badge */}
              <span
                className={`flex-shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${NOTE_TYPE_COLORS[post.type]}`}
              >
                {NOTE_TYPE_ICONS[post.type]}
                <span className="hidden sm:inline capitalize">{post.type}</span>
              </span>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap break-words">
                  {renderMd(post.content)}
                </p>
                <p className="text-[10px] text-gray-400 mt-1">
                  {post.createdBy} • {new Date(post.createdAt).toLocaleDateString()}
                </p>
              </div>

              {/* Actions */}
              <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                <button
                  onClick={() => togglePin(post)}
                  title={post.pinned ? "Unpin" : "Pin"}
                  className={`p-0.5 transition ${
                    post.pinned ? "text-[#b8933a]" : "text-gray-400 hover:text-[#b8933a]"
                  }`}
                >
                  {post.pinned ? <PinOff size={11} /> : <Pin size={11} />}
                </button>
                <button
                  onClick={() => remove(post.id)}
                  className="text-red-400 hover:text-red-600 p-0.5"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
