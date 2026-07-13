/**
 * MyDashboard.tsx — Modular rep personal dashboard
 *
 * Features:
 *  - Drag/drop reorderable widgets (HTML5 drag API — no external deps)
 *  - Toggle widgets on/off
 *  - Layout persisted to Firestore: users/{userId}/dashboard/main
 *  - Daily reset for "daily" policy widgets
 *  - Widgets: Performance Snapshot, Today Panel, Focus Panel,
 *             Quick Notes, Pinned Resources, Todo List, Checklist,
 *             Weekly Planner, Affirmations
 */

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useAppStore } from "../stores/appStore";
import { useDashboardLayout } from "../hooks/useDashboard";
import { useFirebaseAuthUser } from "../hooks/useFirebaseAuthUser";
import {
  LayoutDashboard,
  Zap,
  FileText,
  Pin,
  PinOff,
  CheckSquare,
  Square,
  List,
  Calendar,
  Star,
  Plus,
  X,
  Loader,
  Settings,
  BarChart3,
  Phone,
  Briefcase,
  Clock,
  ArrowRight,
  Check,
  Trash2,
  Edit3,
  StickyNote,
  Link,
  ListTodo,
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
import { TeamBoard } from "../components/TeamBoard";
import type { DashboardWidgetConfig, DashboardWidgetType, QuickNote, TodoItem, ChecklistItem, UserNote } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Shared styles
// ─────────────────────────────────────────────────────────────────────────────

const WIDGET_CARD =
  "bg-white dark:bg-[#16161A] rounded-xl border border-gray-200 dark:border-white/[0.06] overflow-hidden shadow-sm";
const WIDGET_HEADER = "flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/5";
const WIDGET_TITLE = "flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-white";
const WIDGET_BODY = "p-4";
const INPUT_CLS =
  "w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#b8933a]/40";
const BTN_AMBER =
  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#b8933a] text-white hover:bg-[#d4aa55] transition";
const BTN_GHOST =
  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 transition";

// ─────────────────────────────────────────────────────────────────────────────
// Widget: Performance Snapshot
// ─────────────────────────────────────────────────────────────────────────────

function PerformanceSnapshotWidget({ repId }: { repId: number }) {
  const { leads, drapsEntries, settings } = useAppStore();
  const today = new Date().toISOString().split("T")[0];

  const myDraps = drapsEntries.filter((d) => d.repId === repId && d.date === today);
  const todayDraps = myDraps[0];

  const repTarget = settings.repTargets?.[repId] ?? {};
  const dailyCallTarget = Math.ceil((repTarget.weeklyDQ ?? 20) / 5);
  const dailyApptTarget = Math.ceil((repTarget.weeklyBookings ?? 5) / 5);
  const dailyDealsTarget = 1;

  const stats = useMemo(() => {
    const myLeads = leads.filter((l) => l.dqRep === repId);
    const todayCalls = myLeads.filter((l) => l.callHistory?.some((c) => c.date === today)).length;
    const booked = myLeads.filter((l) => l.status === "booked").length;
    const appointments = todayDraps?.appointments ?? 0;
    const dq = todayDraps?.dq ?? 0;
    return { calls: todayCalls, booked, appointments, dq };
  }, [leads, repId, today, todayDraps]);

  const metrics = [
    { label: "Calls", value: stats.calls, icon: <Phone size={14} />, color: "text-blue-500", target: dailyCallTarget },
    {
      label: "Appointments",
      value: stats.appointments,
      icon: <Calendar size={14} />,
      color: "text-amber-500",
      target: dailyApptTarget,
    },
    {
      label: "Deals",
      value: stats.booked,
      icon: <Briefcase size={14} />,
      color: "text-green-500",
      target: dailyDealsTarget,
    },
    { label: "DRAPS", value: stats.dq, icon: <BarChart3 size={14} />, color: "text-purple-500", target: 5 },
  ];

  return (
    <div className={WIDGET_CARD}>
      <div className={WIDGET_HEADER}>
        <span className={WIDGET_TITLE}>
          <BarChart3 size={15} className="text-[#b8933a]" /> Today's Performance
        </span>
        <span className="text-xs text-gray-400">{today}</span>
      </div>
      <div className={WIDGET_BODY}>
        <div className="grid grid-cols-2 gap-3">
          {metrics.map((m) => {
            const pct = Math.min(100, (m.value / m.target) * 100);
            return (
              <div key={m.label} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className={`flex items-center gap-1 ${m.color}`}>
                    {m.icon} {m.label}
                  </span>
                  <span className="font-bold text-gray-900 dark:text-white tabular-nums">{m.value}</span>
                </div>
                <div className="h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${pct}%`,
                      background: pct >= 100 ? "#22c55e" : pct >= 60 ? "#b8933a" : "#6b7280",
                    }}
                  />
                </div>
                <p className="text-[10px] text-gray-400">Target: {m.target}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Widget: Today Panel
// ─────────────────────────────────────────────────────────────────────────────

function TodayPanelWidget({ repId }: { repId: number }) {
  const { leads } = useAppStore();
  const today = new Date().toISOString().split("T")[0];
  const now = new Date().toTimeString().slice(0, 5);

  const { callbacks, followUps } = useMemo(() => {
    const myLeads = leads.filter((l) => l.dqRep === repId);
    const callbacks = myLeads.filter((l) => l.callbackDate && l.callbackDate <= today).slice(0, 5);
    const followUps = myLeads
      .filter((l) => l.nextContactDate && l.nextContactDate <= today && l.status !== "booked")
      .slice(0, 5);
    return { callbacks, followUps };
  }, [leads, repId, today]);

  return (
    <div className={WIDGET_CARD}>
      <div className={WIDGET_HEADER}>
        <span className={WIDGET_TITLE}>
          <Clock size={15} className="text-amber-500" /> Today
        </span>
        <span className="text-xs text-gray-400">{now}</span>
      </div>
      <div className={WIDGET_BODY + " space-y-3"}>
        {callbacks.length === 0 && followUps.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-2">All clear — nothing due today.</p>
        ) : (
          <>
            {callbacks.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Callbacks due</p>
                <div className="space-y-1.5">
                  {callbacks.map((l) => (
                    <div
                      key={l.id}
                      className="flex items-center justify-between gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-700/30"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-800 dark:text-white truncate">{l.name}</p>
                        <p className="text-[10px] text-gray-400">
                          {l.callbackDate} {l.callbackTime ?? ""}
                        </p>
                      </div>
                      <Phone size={12} className="text-amber-500 flex-shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {followUps.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Follow-ups</p>
                <div className="space-y-1.5">
                  {followUps.map((l) => (
                    <div
                      key={l.id}
                      className="flex items-center justify-between gap-2 p-2 rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-200/50 dark:border-blue-700/30"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-800 dark:text-white truncate">{l.name}</p>
                        <p className="text-[10px] text-gray-400">{l.status}</p>
                      </div>
                      <ArrowRight size={12} className="text-blue-500 flex-shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Widget: Focus Panel (Next Best Action)
// ─────────────────────────────────────────────────────────────────────────────

function FocusPanelWidget({ repId }: { repId: number }) {
  const { leads } = useAppStore();
  const today = new Date().toISOString().split("T")[0];

  const nextActions = useMemo(() => {
    const myLeads = leads.filter((l) => l.dqRep === repId && l.status !== "lost");
    const actions: Array<{ lead: (typeof myLeads)[0]; action: string; priority: "high" | "medium" | "low" }> = [];

    myLeads.forEach((l) => {
      // Overdue callback
      if (l.callbackDate && l.callbackDate < today) {
        actions.push({ lead: l, action: "Overdue callback", priority: "high" });
        return;
      }
      // No contact yet
      if (!l.lastCall && l.status === "new") {
        actions.push({ lead: l, action: "First contact", priority: "high" });
        return;
      }
      // Booked deal with no recent contact
      if (l.status === "booked" && l.dealStage && !["Complete", "Settlement"].includes(l.dealStage)) {
        actions.push({ lead: l, action: "Deal follow-up", priority: "medium" });
        return;
      }
      // Stale qualified lead
      if (l.status === "qualified" && l.lastCall) {
        const daysSince = Math.floor((Date.now() - new Date(l.lastCall).getTime()) / 86400000);
        if (daysSince >= 7) {
          actions.push({ lead: l, action: `No contact for ${daysSince}d`, priority: "medium" });
        }
      }
    });

    return actions.sort((a, b) => (a.priority === "high" ? -1 : b.priority === "high" ? 1 : 0)).slice(0, 5);
  }, [leads, repId, today]);

  const priorityStyle = (p: "high" | "medium" | "low") =>
    ({
      high: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 border-red-200/50 dark:border-red-700/30",
      medium:
        "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10 border-amber-200/50 dark:border-amber-700/30",
      low: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/10 border-blue-200/50 dark:border-blue-700/30",
    })[p];

  return (
    <div className={WIDGET_CARD}>
      <div className={WIDGET_HEADER}>
        <span className={WIDGET_TITLE}>
          <Zap size={15} className="text-purple-500" /> Focus: Next Best Actions
        </span>
        <span className="text-xs text-gray-400">{nextActions.length} items</span>
      </div>
      <div className={WIDGET_BODY + " space-y-2"}>
        {nextActions.length === 0 ? (
          <div className="text-center py-3">
            <Check size={20} className="mx-auto text-green-500 mb-1" />
            <p className="text-sm text-gray-400">All caught up! Check back later.</p>
          </div>
        ) : (
          nextActions.map((item, i) => (
            <div
              key={i}
              className={`flex items-center justify-between gap-2 p-2.5 rounded-lg border ${priorityStyle(item.priority)}`}
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">{item.lead.name}</p>
                <p className="text-[10px] opacity-80">{item.action}</p>
              </div>
              <span className="text-[10px] font-bold uppercase opacity-60 flex-shrink-0">{item.priority}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Widget: Quick Notes
// ─────────────────────────────────────────────────────────────────────────────

function QuickNotesWidget({
  notes,
  onSave,
  onDelete,
}: {
  notes: QuickNote[];
  onSave: (note: QuickNote) => void;
  onDelete: (id: string) => void;
}) {
  const [text, setText] = useState("");
  const [editId, setEditId] = useState<string | null>(null);

  const handleSave = () => {
    if (!text.trim()) return;
    const now = Date.now();
    if (editId) {
      const existing = notes.find((n) => n.id === editId);
      if (existing) onSave({ ...existing, text: text.trim(), updatedAt: now });
      setEditId(null);
    } else {
      onSave({ id: `note_${now}`, text: text.trim(), createdAt: now, updatedAt: now });
    }
    setText("");
  };

  const startEdit = (note: QuickNote) => {
    setEditId(note.id);
    setText(note.text);
  };

  return (
    <div className={WIDGET_CARD}>
      <div className={WIDGET_HEADER}>
        <span className={WIDGET_TITLE}>
          <FileText size={15} className="text-blue-500" /> Quick Notes
        </span>
        <span className="text-xs text-gray-400">{notes.length} notes</span>
      </div>
      <div className={WIDGET_BODY + " space-y-3"}>
        <div className="flex gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSave();
            }}
            placeholder="Jot something down… (⌘+Enter to save)"
            rows={2}
            className={INPUT_CLS + " resize-none"}
          />
          <button onClick={handleSave} disabled={!text.trim()} className={BTN_AMBER + " self-start"}>
            {editId ? <Check size={14} /> : <Plus size={14} />}
          </button>
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {notes.map((note) => (
            <div
              key={note.id}
              className="group flex items-start gap-2 p-2.5 rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5"
            >
              <p className="flex-1 text-xs text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                {note.text}
              </p>
              <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                <button
                  onClick={() => startEdit(note)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-0.5"
                >
                  <Edit3 size={11} />
                </button>
                <button onClick={() => onDelete(note.id)} className="text-red-400 hover:text-red-600 p-0.5">
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          ))}
          {notes.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-2">No notes yet. Write something above.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Widget: Pinned Resources
// ─────────────────────────────────────────────────────────────────────────────

function PinnedResourcesWidget({
  items,
  onUnpin,
}: {
  items: Array<{ id: string; type: string; title: string; resourceId: string }>;
  onUnpin: (resourceId: string) => void;
}) {
  const typeIcon = (type: string) => {
    if (type === "video") return "🎥";
    if (type === "script") return "📋";
    return "📄";
  };

  return (
    <div className={WIDGET_CARD}>
      <div className={WIDGET_HEADER}>
        <span className={WIDGET_TITLE}>
          <Pin size={15} className="text-[#b8933a]" /> Pinned Resources
        </span>
        <span className="text-xs text-gray-400">{items.length}</span>
      </div>
      <div className={WIDGET_BODY}>
        {items.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-2">
            Pin documents and videos from the Training Hub to see them here.
          </p>
        ) : (
          <div className="space-y-1.5">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 group transition"
              >
                <span className="text-sm">{typeIcon(item.type)}</span>
                <span className="flex-1 text-xs text-gray-700 dark:text-gray-300 truncate">{item.title}</span>
                <button
                  onClick={() => onUnpin(item.resourceId)}
                  className="opacity-0 group-hover:opacity-100 transition text-gray-400 hover:text-red-500"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Widget: Todo List
// ─────────────────────────────────────────────────────────────────────────────

function TodoListWidget({
  items,
  onSave,
  onDelete,
}: {
  items: TodoItem[];
  onSave: (item: TodoItem) => void;
  onDelete: (id: string) => void;
}) {
  const [text, setText] = useState("");

  const add = () => {
    if (!text.trim()) return;
    const now = Date.now();
    onSave({ id: `todo_${now}`, text: text.trim(), done: false, createdAt: now });
    setText("");
  };

  const toggle = (item: TodoItem) => onSave({ ...item, done: !item.done });

  const pending = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);

  return (
    <div className={WIDGET_CARD}>
      <div className={WIDGET_HEADER}>
        <span className={WIDGET_TITLE}>
          <List size={15} className="text-green-500" /> To-Do
        </span>
        <span className="text-xs text-gray-400">{pending.length} remaining</span>
      </div>
      <div className={WIDGET_BODY + " space-y-3"}>
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
            placeholder="Add a task… (Enter)"
            className={INPUT_CLS}
          />
          <button onClick={add} disabled={!text.trim()} className={BTN_AMBER}>
            <Plus size={14} />
          </button>
        </div>
        <div className="space-y-1.5 max-h-52 overflow-y-auto">
          {pending.map((item) => (
            <div key={item.id} className="flex items-center gap-2.5 group">
              <button
                onClick={() => toggle(item)}
                className="flex-shrink-0 text-gray-300 hover:text-green-500 transition"
              >
                <Square size={15} />
              </button>
              <span className="flex-1 text-xs text-gray-700 dark:text-gray-300">{item.text}</span>
              <button
                onClick={() => onDelete(item.id)}
                className="opacity-0 group-hover:opacity-100 transition text-red-400 hover:text-red-600 flex-shrink-0"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
          {done.length > 0 && (
            <div className="border-t border-gray-100 dark:border-white/5 pt-1.5 mt-1.5 space-y-1.5">
              {done.map((item) => (
                <div key={item.id} className="flex items-center gap-2.5 group opacity-50">
                  <button onClick={() => toggle(item)} className="flex-shrink-0 text-green-500">
                    <CheckSquare size={15} />
                  </button>
                  <span className="flex-1 text-xs text-gray-500 dark:text-gray-400 line-through">{item.text}</span>
                  <button
                    onClick={() => onDelete(item.id)}
                    className="opacity-0 group-hover:opacity-100 transition text-red-400 flex-shrink-0"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {items.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-2">Nothing on your list. Add a task above.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Widget: Checklist
// ─────────────────────────────────────────────────────────────────────────────

function ChecklistWidget({ items, onChange }: { items: ChecklistItem[]; onChange: (items: ChecklistItem[]) => void }) {
  const [newText, setNewText] = useState("");

  const add = () => {
    if (!newText.trim()) return;
    onChange([...items, { id: `cl_${Date.now()}`, text: newText.trim(), done: false }]);
    setNewText("");
  };

  const toggle = (id: string) => onChange(items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));

  const remove = (id: string) => onChange(items.filter((i) => i.id !== id));

  const pct = items.length === 0 ? 0 : Math.round((items.filter((i) => i.done).length / items.length) * 100);

  return (
    <div className={WIDGET_CARD}>
      <div className={WIDGET_HEADER}>
        <span className={WIDGET_TITLE}>
          <CheckSquare size={15} className="text-purple-500" /> Daily Checklist
        </span>
        <span className="text-xs text-gray-400">{pct}%</span>
      </div>
      <div className={WIDGET_BODY + " space-y-3"}>
        {items.length > 0 && (
          <div className="h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        )}
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-2.5 group">
              <button
                onClick={() => toggle(item.id)}
                className={`flex-shrink-0 transition ${item.done ? "text-purple-500" : "text-gray-300 hover:text-purple-400"}`}
              >
                {item.done ? <CheckSquare size={15} /> : <Square size={15} />}
              </button>
              <span
                className={`flex-1 text-xs ${item.done ? "line-through text-gray-400" : "text-gray-700 dark:text-gray-300"}`}
              >
                {item.text}
              </span>
              <button
                onClick={() => remove(item.id)}
                className="opacity-0 group-hover:opacity-100 transition text-red-400 flex-shrink-0"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
            placeholder="Add checklist item…"
            className={INPUT_CLS}
          />
          <button onClick={add} disabled={!newText.trim()} className={BTN_AMBER}>
            <Plus size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Widget: Affirmations
// ─────────────────────────────────────────────────────────────────────────────

function AffirmationsWidget({ affirmations }: { affirmations: string[] }) {
  const [idx] = useState(() => Math.floor(Math.random() * Math.max(1, affirmations.length)));
  const shown = affirmations.length > 0 ? affirmations[idx % affirmations.length] : "You've got this.";

  return (
    <div className={WIDGET_CARD}>
      <div className={WIDGET_HEADER}>
        <span className={WIDGET_TITLE}>
          <Star size={15} className="text-amber-400" /> Daily Affirmation
        </span>
      </div>
      <div className={WIDGET_BODY + " text-center py-6"}>
        <p className="text-sm font-medium italic text-gray-700 dark:text-gray-300 leading-relaxed">"{shown}"</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Widget: Weekly Planner
// ─────────────────────────────────────────────────────────────────────────────

function WeeklyPlannerWidget({
  plan,
  onChange,
}: {
  plan: Record<string, string>;
  onChange: (p: Record<string, string>) => void;
}) {
  const days = [
    { key: "mon", label: "Mon" },
    { key: "tue", label: "Tue" },
    { key: "wed", label: "Wed" },
    { key: "thu", label: "Thu" },
    { key: "fri", label: "Fri" },
  ];

  const todayDay = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date().getDay()];

  return (
    <div className={WIDGET_CARD}>
      <div className={WIDGET_HEADER}>
        <span className={WIDGET_TITLE}>
          <Calendar size={15} className="text-blue-500" /> Weekly Planner
        </span>
      </div>
      <div className={WIDGET_BODY + " space-y-2"}>
        {days.map((d) => (
          <div
            key={d.key}
            className={`flex items-start gap-2.5 ${d.key === todayDay ? "ring-1 ring-[#b8933a]/30 rounded-lg p-1 -mx-1" : ""}`}
          >
            <span
              className={`flex-shrink-0 w-8 text-xs font-semibold pt-1.5 ${d.key === todayDay ? "text-[#b8933a]" : "text-gray-400"}`}
            >
              {d.label}
            </span>
            <input
              value={plan[d.key] ?? ""}
              onChange={(e) => onChange({ ...plan, [d.key]: e.target.value })}
              placeholder={d.key === todayDay ? "What's the plan today?" : "…"}
              className={INPUT_CLS + " text-xs py-1.5"}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Widget: Notice Board
// ─────────────────────────────────────────────────────────────────────────────

const NOTE_TYPE_ICONS: Record<UserNote["type"], React.ReactNode> = {
  note: <StickyNote size={11} />,
  todo: <ListTodo size={11} />,
  link: <Link size={11} />,
};

const NOTE_TYPE_COLORS: Record<UserNote["type"], string> = {
  note:  "text-blue-500 bg-blue-50 dark:bg-blue-900/20",
  todo:  "text-green-500 bg-green-50 dark:bg-green-900/20",
  link:  "text-purple-500 bg-purple-50 dark:bg-purple-900/20",
};

/** Minimal markdown: **bold**, *italic*, `code`, [label](url) */
function renderMd(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let last = 0, m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1] !== undefined) parts.push(<strong key={key++}>{m[1]}</strong>);
    else if (m[2] !== undefined) parts.push(<em key={key++}>{m[2]}</em>);
    else if (m[3] !== undefined) parts.push(<code key={key++} className="px-1 py-0.5 rounded bg-gray-100 dark:bg-white/10 text-[10px] font-mono">{m[3]}</code>);
    else if (m[4] !== undefined) parts.push(<a key={key++} href={m[5]} target="_blank" rel="noreferrer" className="underline text-[#b8933a] hover:text-[#d4aa55]">{m[4]}</a>);
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function NoticeBoardWidget({ userId }: { userId: number }) {
  const { currentUser, authLoading } = useFirebaseAuthUser();
  const [notes, setNotes] = useState<UserNote[]>([]);
  const [input, setInput] = useState("");
  const [type, setType] = useState<UserNote["type"]>("note");

  useEffect(() => {
    if (authLoading || !currentUser) return;

    const q = query(
      collection(db, "userNotes"),
      where("userId", "==", String(userId)),
      orderBy("pinned", "desc"),
      orderBy("createdAt", "desc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setNotes(snap.docs.map((d) => ({ id: d.id, ...d.data() } as UserNote)));
      },
      (err) => {
        console.error("[NoticeBoardWidget] Firestore error:", err);
      },
    );
    return unsub;
  }, [authLoading, currentUser, userId]);

  const add = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    await addDoc(collection(db, "userNotes"), {
      userId: String(userId),
      content: trimmed,
      type,
      pinned: false,
      createdAt: Date.now(),
    });
    setInput("");
  };

  const remove = (id: string) => deleteDoc(doc(db, "userNotes", id));

  const togglePin = (note: UserNote) =>
    updateDoc(doc(db, "userNotes", note.id), { pinned: !note.pinned });

  const pinned = notes.filter((n) => n.pinned);
  const rest   = notes.filter((n) => !n.pinned);
  const sorted = [...pinned, ...rest];

  return (
    <div className={WIDGET_CARD}>
      <div className={WIDGET_HEADER}>
        <span className={WIDGET_TITLE}>
          <StickyNote size={15} className="text-[#b8933a]" /> Notice Board
        </span>
        <span className="text-xs text-gray-400">{notes.length} items</span>
      </div>
      <div className={WIDGET_BODY + " space-y-3"}>
        {/* Input row */}
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            placeholder="Add a note, todo, or link… (Enter)"
            className={INPUT_CLS}
          />
          {/* Type selector */}
          <select
            value={type}
            onChange={(e) => setType(e.target.value as UserNote["type"])}
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
            <p className="text-xs text-gray-400 text-center py-2">Nothing on the board. Add something above.</p>
          )}
          {sorted.map((note) => (
            <div
              key={note.id}
              className={`group flex items-start gap-2 p-2.5 rounded-lg border ${note.pinned ? "border-[#b8933a]/40 bg-amber-50/40 dark:bg-amber-900/10" : "border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-white/5"}`}
            >
              {/* Type badge */}
              <span className={`flex-shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${NOTE_TYPE_COLORS[note.type]}`}>
                {NOTE_TYPE_ICONS[note.type]}
                <span className="hidden sm:inline capitalize">{note.type}</span>
              </span>

              {/* Content */}
              <p className="flex-1 text-xs text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap break-words min-w-0">
                {renderMd(note.content)}
              </p>

              {/* Actions */}
              <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                <button
                  onClick={() => togglePin(note)}
                  title={note.pinned ? "Unpin" : "Pin"}
                  className={`p-0.5 transition ${note.pinned ? "text-[#b8933a]" : "text-gray-400 hover:text-[#b8933a]"}`}
                >
                  {note.pinned ? <PinOff size={11} /> : <Pin size={11} />}
                </button>
                <button onClick={() => remove(note.id)} className="text-red-400 hover:text-red-600 p-0.5">
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

// ─────────────────────────────────────────────────────────────────────────────
// Widget Manager (customise panel)
// ─────────────────────────────────────────────────────────────────────────────

const WIDGET_META: Record<DashboardWidgetType, { label: string; desc: string; icon: React.ReactNode }> = {
  performance_snapshot: {
    label: "Performance Snapshot",
    desc: "Today's calls, appointments, deals, DRAPS",
    icon: <BarChart3 size={14} />,
  },
  today_panel: { label: "Today Panel", desc: "Callbacks, follow-ups due today", icon: <Clock size={14} /> },
  focus_panel: { label: "Focus Panel", desc: "AI-powered next best actions", icon: <Zap size={14} /> },
  quick_notes: { label: "Quick Notes", desc: "Auto-saving freeform notes", icon: <FileText size={14} /> },
  pinned_resources: { label: "Pinned Resources", desc: "Docs, videos and scripts you pinned", icon: <Pin size={14} /> },
  todo_list: { label: "To-Do List", desc: "Personal task list", icon: <List size={14} /> },
  checklist: { label: "Daily Checklist", desc: "Reset daily or manually", icon: <CheckSquare size={14} /> },
  weekly_planner: { label: "Weekly Planner", desc: "Plan your week day by day", icon: <Calendar size={14} /> },
  affirmations: { label: "Affirmations", desc: "Daily motivational prompt", icon: <Star size={14} /> },
  notice_board: { label: "Notice Board", desc: "Pin notes, todos, and links", icon: <StickyNote size={14} /> },
  team_board: { label: "Team Board", desc: "Share posts with your team", icon: <StickyNote size={14} /> },
};

function WidgetManagerPanel({
  widgets,
  onUpdate,
  onClose,
}: {
  widgets: DashboardWidgetConfig[];
  onUpdate: (id: DashboardWidgetType, patch: Partial<DashboardWidgetConfig>) => void;
  onClose: () => void;
}) {
  return (
    <div className="bg-white dark:bg-[#16161A] rounded-xl border border-gray-200 dark:border-white/[0.06] overflow-hidden shadow-xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Settings size={14} className="text-[#b8933a]" /> Customise Widgets
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
          <X size={16} />
        </button>
      </div>
      <div className="p-4 space-y-2">
        {widgets.map((w) => {
          const meta = WIDGET_META[w.id];
          if (!meta) return null;
          return (
            <div
              key={w.id}
              className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 transition"
            >
              <span className="text-gray-400 flex-shrink-0">{meta.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-800 dark:text-white">{meta.label}</p>
                <p className="text-[10px] text-gray-400">{meta.desc}</p>
              </div>
              <button
                onClick={() => onUpdate(w.id, { enabled: !w.enabled })}
                className={`relative inline-flex h-4 w-8 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  w.enabled ? "bg-[#b8933a]" : "bg-gray-200 dark:bg-white/10"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow transform transition ${w.enabled ? "translate-x-4" : "translate-x-0"}`}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Draggable Widget Wrapper
// ─────────────────────────────────────────────────────────────────────────────

function DraggableWidget({
  widgetId,
  children,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  widgetId: string;
  children: React.ReactNode;
  onDragStart: (id: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (targetId: string) => void;
}) {
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <div
      draggable
      onDragStart={() => onDragStart(widgetId)}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
        onDragOver(e);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={() => {
        setIsDragOver(false);
        onDrop(widgetId);
      }}
      className={`transition-opacity ${isDragOver ? "opacity-50 ring-2 ring-[#b8933a]/40 rounded-xl" : ""}`}
    >
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export function MyDashboardPage() {
  const { currentUser } = useAppStore();
  const {
    layout,
    loading,
    updateWidget,
    reorderWidgets,
    saveNote,
    deleteNote,
    saveTodo,
    deleteTodo,
    saveChecklist,
    saveLayout,
    togglePin,
  } = useDashboardLayout(currentUser?.id);

  const [showManager, setShowManager] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const enabledWidgets = useMemo(
    () => [...layout.widgets].filter((w) => w.enabled).sort((a, b) => a.order - b.order),
    [layout.widgets],
  );

  // Drag and drop
  const handleDragStart = useCallback((id: string) => setDraggingId(id), []);

  const handleDrop = useCallback(
    (targetId: string) => {
      if (!draggingId || draggingId === targetId) {
        setDraggingId(null);
        return;
      }
      const all = [...layout.widgets].sort((a, b) => a.order - b.order);
      const fromIdx = all.findIndex((w) => w.id === draggingId);
      const toIdx = all.findIndex((w) => w.id === targetId);
      if (fromIdx < 0 || toIdx < 0) {
        setDraggingId(null);
        return;
      }
      const reordered = [...all];
      const [moved] = reordered.splice(fromIdx, 1);
      reordered.splice(toIdx, 0, moved);
      reorderWidgets(reordered);
      setDraggingId(null);
    },
    [draggingId, layout.widgets, reorderWidgets],
  );

  if (!currentUser) return null;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <Loader size={20} className="animate-spin mr-2" /> Loading your dashboard…
      </div>
    );
  }

  const repId = currentUser.id;

  const renderWidget = (widget: DashboardWidgetConfig) => {
    switch (widget.id) {
      case "performance_snapshot":
        return <PerformanceSnapshotWidget key={widget.id} repId={repId} />;
      case "today_panel":
        return <TodayPanelWidget key={widget.id} repId={repId} />;
      case "focus_panel":
        return <FocusPanelWidget key={widget.id} repId={repId} />;
      case "quick_notes":
        return <QuickNotesWidget key={widget.id} notes={layout.notes} onSave={saveNote} onDelete={deleteNote} />;
      case "pinned_resources":
        return (
          <PinnedResourcesWidget
            key={widget.id}
            items={layout.pinnedItems}
            onUnpin={(id) => togglePin(layout.pinnedItems.find((p) => p.resourceId === id)!)}
          />
        );
      case "todo_list":
        return <TodoListWidget key={widget.id} items={layout.todoItems} onSave={saveTodo} onDelete={deleteTodo} />;
      case "checklist":
        return <ChecklistWidget key={widget.id} items={layout.checklistItems} onChange={saveChecklist} />;
      case "weekly_planner":
        return (
          <WeeklyPlannerWidget
            key={widget.id}
            plan={layout.weeklyPlan}
            onChange={(weeklyPlan) => saveLayout({ weeklyPlan })}
          />
        );
      case "affirmations":
        return <AffirmationsWidget key={widget.id} affirmations={layout.affirmations} />;
      case "notice_board":
        return <NoticeBoardWidget key={widget.id} userId={repId} />;
      case "team_board":
        return currentUser?.teamId ? (
          <TeamBoard
            key={widget.id}
            teamId={currentUser.teamId}
            currentUserName={currentUser.name}
          />
        ) : null;
      default:
        return null;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <LayoutDashboard size={22} className="text-[#b8933a]" />
              My Dashboard
            </h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Good {getGreeting()}, {currentUser.name.split(" ")[0]}.{" "}
              <span className="text-gray-300 dark:text-gray-500">
                {new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}
              </span>
            </p>
          </div>
          <button onClick={() => setShowManager((s) => !s)} className={BTN_GHOST + " gap-1.5"}>
            <Settings size={14} /> Customise
          </button>
        </div>

        {/* Widget manager */}
        {showManager && (
          <div className="mb-5">
            <WidgetManagerPanel
              widgets={layout.widgets}
              onUpdate={updateWidget}
              onClose={() => setShowManager(false)}
            />
          </div>
        )}

        {/* Drag hint */}
        {draggingId && <p className="text-xs text-gray-400 text-center mb-3">Drop onto another widget to reorder</p>}

        {/* Widgets grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {enabledWidgets.map((widget) => (
            <DraggableWidget
              key={widget.id}
              widgetId={widget.id}
              onDragStart={handleDragStart}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              {renderWidget(widget)}
            </DraggableWidget>
          ))}
        </div>

        {enabledWidgets.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <LayoutDashboard size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm mb-3">No widgets enabled. Customise your dashboard to add some.</p>
            <button onClick={() => setShowManager(true)} className={BTN_AMBER + " mx-auto"}>
              <Plus size={14} /> Add Widgets
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

export default MyDashboardPage;
