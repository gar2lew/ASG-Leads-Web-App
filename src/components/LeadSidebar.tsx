import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Lead, FormTemplate, CustomPinType } from '../types';
import { useAppStore } from '../stores/appStore';
import { sanitizePhone } from '../lib/utils';
import { SuburbInput } from './SuburbInput';
import {
  X, Phone, Trash2, Save, Paperclip, FileText, Image, File,
  Download, Camera, Upload, XCircle, ClipboardList, Loader, Mail,
} from 'lucide-react';
import { doc, setDoc, deleteDoc, collection, onSnapshot, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { uploadFile, formatFileSize, fileTypeIcon } from '../lib/storage';
import { useLeadFiles, useDeleteLeadFile, useFormTemplates } from '../hooks/useFirebase';

const FormFillerModal = lazy(() =>
  import('./FormFillerModal').then((m) => ({ default: m.FormFillerModal }))
);

// Built-in knock result colour map (mirrors Map.tsx KNOCK_COLORS)
const KNOCK_COLORS: Record<string, string> = {
  'not-interested':   '#ef4444',
  'no-answer':        '#f97316',
  'skipped':          '#6b7280',
  'dq-complete':      '#22c55e',
  'parents-not-home': '#3b82f6',
};
const KNOCK_LABELS: Record<string, string> = {
  'not-interested':   'Not Interested',
  'no-answer':        'No Answer',
  'skipped':          'Skipped',
  'dq-complete':      'DQ Complete',
  'parents-not-home': 'Parents Not Home',
};

interface LeadSidebarProps {
  lead: Lead;
  onClose: () => void;
  onSave: (lead: Lead) => void;
  onDelete: (lead: Lead) => void;
  onCall: (lead: Lead) => void;
  /** When passed (from Map page), shows a Knock Pin Type selector in the form */
  customPinTypes?: CustomPinType[];
  /** 'modal' (default) = fixed overlay with backdrop; 'panel' = inline, fills parent */
  mode?: 'modal' | 'panel';
}

const SUPER_OPTIONS = ['$0-75k', '$75k to 150k', '$150k+', 'Other'];
const STATUS_OPTIONS = ['DQ', 'Booked', 'Revisit', 'Not Interested', 'Wrong Number', 'No Answer'];

function buildAddress(lead: Lead): string {
  return [lead.houseNum, lead.street, lead.suburb, lead.postcode].filter(Boolean).join(' ');
}

function parseAddress(raw: string): { houseNum?: string; street?: string; suburb?: string; postcode?: string } {
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  const hasHouseNum = parts.length > 1 && /^\d+[A-Za-z]?$/.test(parts[0]);
  const houseNum = hasHouseNum ? parts[0] : undefined;
  const body = hasHouseNum ? parts.slice(1) : parts;
  if (body.length === 0) return { houseNum };
  const last = body[body.length - 1];
  if (/^\d{4}$/.test(last)) {
    const withoutPost = body.slice(0, -1);
    const suburb = withoutPost.length > 0 ? withoutPost[withoutPost.length - 1] : undefined;
    const street = withoutPost.slice(0, -1).join(' ') || undefined;
    return { houseNum, street, suburb, postcode: last };
  }
  if (body.length > 1) {
    const suburb = body[body.length - 1];
    const street = body.slice(0, -1).join(' ') || undefined;
    return { houseNum, street, suburb };
  }
  return { houseNum, street: body.join(' ') };
}

export function LeadSidebar({ lead, onClose, onSave, onDelete, onCall, customPinTypes, mode = 'modal' }: LeadSidebarProps) {
  const { reps, currentUser } = useAppStore();
  const [form, setForm] = useState<Lead>(lead);
  const [addressStr, setAddressStr] = useState<string>(buildAddress(lead));
  const [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [otherViewers, setOtherViewers] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  // Camera staging
  const [stagedPhotos, setStagedPhotos] = useState<File[]>([]);
  const [stagedPreviews, setStagedPreviews] = useState<string[]>([]);

  // Form filler
  const [formPickerOpen, setFormPickerOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<FormTemplate | null>(null);

  // Files & Documents panel (opens as a modal so it doesn't crush the lead details)
  const [showFilesPanel, setShowFilesPanel] = useState(false);

  const docInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const { files: leadFiles } = useLeadFiles(String(lead.id));
  const { remove: deleteLeadFile } = useDeleteLeadFile();
  const { templates } = useFormTemplates();

  // Reset when lead changes
  useEffect(() => {
    setForm(lead);
    setAddressStr(buildAddress(lead));
    setDirty(false);
    setConfirmDelete(false);
  }, [lead.id]);

  // Presence
  useEffect(() => {
    if (!currentUser) return;
    const presenceRef = doc(db, 'leads', String(lead.id), 'presence', String(currentUser.id));
    setDoc(presenceRef, { name: currentUser.name, ts: Date.now() });
    const unsub = onSnapshot(collection(db, 'leads', String(lead.id), 'presence'), (snap) => {
      const others = snap.docs
        .filter((d) => d.id !== String(currentUser.id))
        .map((d) => d.data().name as string);
      setOtherViewers(others);
    });
    return () => {
      unsub();
      void deleteDoc(presenceRef).catch((err) => console.warn('Presence cleanup failed:', err));
    };
  }, [lead.id, currentUser]);

  // Auto-save debounce — after 1.5s of no changes, save silently
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => {
      if (form.name?.trim()) {
        onSave(form);
        setDirty(false);
      }
    }, 1500);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, dirty]);

  const update = (field: keyof Lead, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setDirty(true);
  };

  const updateAddress = (raw: string) => {
    setAddressStr(raw);
    const parsed = parseAddress(raw);
    setForm((prev) => ({
      ...prev,
      houseNum: parsed.houseNum,
      street: parsed.street,
      suburb: parsed.suburb ?? prev.suburb,
      postcode: parsed.postcode,
    }));
    setDirty(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    onSave(form);
    setDirty(false);
  };

  const handleClose = () => {
    if (dirty && form.name?.trim()) {
      onSave(form);
    }
    onClose();
  };

  const handleDelete = () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    onDelete(lead);
  };

  const handleFileUpload = async (file: File, type: 'document' | 'photo' | 'file') => {
    if (!currentUser) return;
    setUploading(true);
    try {
      const path = `leadFiles/${lead.id}/${Date.now()}_${file.name}`;
      const url = await uploadFile(path, file);
      await addDoc(collection(db, 'leads', String(lead.id), 'files'), {
        name: file.name, storagePath: path, downloadUrl: url,
        fileType: file.type, fileSize: file.size, type,
        uploadedBy: currentUser.name, uploadedAt: Date.now(),
      });
    } catch (err) { console.error('Upload failed:', err); }
    finally { setUploading(false); }
  };

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setStagedPhotos((prev) => [...prev, file]);
    setStagedPreviews((prev) => [...prev, previewUrl]);
    e.target.value = '';
  };

  const handleRemoveStaged = (index: number) => {
    URL.revokeObjectURL(stagedPreviews[index]);
    setStagedPhotos((prev) => prev.filter((_, i) => i !== index));
    setStagedPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDiscardAllStaged = () => {
    stagedPreviews.forEach((url) => URL.revokeObjectURL(url));
    setStagedPhotos([]); setStagedPreviews([]);
  };

  const handleUploadStaged = async () => {
    if (!currentUser || stagedPhotos.length === 0) return;
    setUploading(true);
    try {
      for (const file of stagedPhotos) {
        const path = `leadFiles/${lead.id}/${Date.now()}_${file.name}`;
        const url = await uploadFile(path, file);
        await addDoc(collection(db, 'leads', String(lead.id), 'files'), {
          name: file.name, storagePath: path, downloadUrl: url,
          fileType: file.type, fileSize: file.size, type: 'photo',
          uploadedBy: currentUser.name, uploadedAt: Date.now(),
        });
      }
    } catch (err) { console.error('Camera upload failed:', err); }
    finally {
      stagedPreviews.forEach((url) => URL.revokeObjectURL(url));
      setStagedPhotos([]); setStagedPreviews([]); setUploading(false);
    }
  };

  const handleFillForm = () => {
    if (templates.length === 0) return;
    if (templates.length === 1) { setSelectedTemplate(templates[0]); return; }
    setFormPickerOpen(true);
  };

  const activeReps = reps.filter((r) => r.active !== false);
  const formerReps = reps.filter((r) => r.active === false);
  const allRepsForDropdown = [...activeReps, ...formerReps];
  const dqRepName = reps.find((r) => r.id === lead.dqRep)?.name || '—';
  const lastCall = lead.callHistory && lead.callHistory.length > 0
    ? lead.callHistory[lead.callHistory.length - 1] : null;
  const lastContactRep = lastCall?.rep || '—';
  const lastCallNotes = lastCall?.notes || '—';
  const lastCallDate = lead.lastCall
    ? new Date(lead.lastCall).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
    : 'Never';
  const callCount = lead.callHistory?.length || 0;

  const isPanel = mode === 'panel';

  return (
    <>
      {/* Backdrop — only in modal mode */}
      {!isPanel && <div className="fixed inset-0 bg-black/45 z-40" onClick={handleClose} />}

      {/* Card wrapper */}
      <div className={isPanel
        ? "flex flex-col h-full w-full bg-[var(--surface)] text-[var(--text)]"
        : "fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
      }>
        <div className={isPanel
          ? "flex flex-col h-full w-full"
          : "bg-[var(--surface)] text-[var(--text)] rounded-2xl shadow-2xl w-[90vw] max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
        }>

          {/* ── Header ─────────────────────────────────────────────────────── */}
          <div className="flex items-start justify-between px-5 py-4 border-b border-[var(--border)] flex-shrink-0">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-[var(--text)] leading-tight truncate">{lead.name}</h2>
              <p className="text-sm text-[var(--text-muted)] mt-0.5 flex items-center gap-1.5 flex-wrap">
                {dqRepName} · {lead.status}
                {lead.dnqFellOver && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-semibold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400">
                    ❌ Fell Over
                  </span>
                )}
              </p>
              <a href={`tel:${lead.phone.replace(/\s/g, '')}`}
                className="text-sm text-amber-500 hover:underline flex items-center gap-1 mt-0.5 w-fit"
                onClick={(e) => e.stopPropagation()}>
                <Phone size={12} /> {lead.phone}
              </a>
              {otherViewers.length > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                  ⚠️ {otherViewers.join(', ')} {otherViewers.length === 1 ? 'is' : 'are'} also viewing
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 ml-3 flex-shrink-0">
              <button
                onClick={() => onCall(lead)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-400 transition"
              >
                <Phone size={14} /> Log Call
              </button>
              <button
                onClick={handleDelete}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition ${
                  confirmDelete
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20'
                }`}
              >
                <Trash2 size={14} />
                {confirmDelete ? 'Confirm?' : 'Delete'}
              </button>
              <button
                onClick={handleClose}
                className="p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition text-[var(--text-muted)]"
                aria-label="Close lead details"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* ── Body: single scrollable column ─────────────────────────────── */}
          <div className="flex-1 overflow-hidden min-h-0">

            {/* Lead detail form */}
            <div className="h-full overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-2 gap-3">

                {/* Date + Status */}
                <Field label="Date">
                  <input type="date" className={inputCls} value={form.leadDate || ''}
                    onChange={(e) => update('leadDate', e.target.value)} />
                </Field>
                <Field label="Lead Status">
                  <select className={inputCls} value={form.status}
                    onChange={(e) => update('status', e.target.value as Lead['status'])}>
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>

                {/* Name + Phone */}
                <Field label="Lead Name *">
                  <input className={inputCls} value={form.name}
                    onChange={(e) => update('name', e.target.value)} placeholder="Full name" />
                </Field>
                <Field label="Contact Number">
                  <input className={inputCls} value={form.phone}
                    onChange={(e) => update('phone', sanitizePhone(e.target.value))} placeholder="04xx xxx xxx" />
                </Field>

                {/* Email + Owner/Renter */}
                <Field label={
                  <span className="flex items-center gap-1.5">
                    Email
                    {lead.email && (
                      <a href={`mailto:${lead.email}`} onClick={(e) => e.stopPropagation()}
                        className="text-amber-500 hover:text-amber-400 transition" title={`Email ${lead.email}`}>
                        <Mail size={10} />
                      </a>
                    )}
                  </span>
                }>
                  <input className={inputCls} value={form.email || ''}
                    onChange={(e) => update('email', e.target.value)} placeholder="optional" />
                </Field>
                <Field label="Renter / Owner">
                  <select className={inputCls} value={form.ownership || ''}
                    onChange={(e) => update('ownership', e.target.value)}>
                    <option value="">—</option>
                    <option>Renter</option>
                    <option>Owner</option>
                  </select>
                </Field>

                {/* Address — full width */}
                <div className="col-span-2">
                  <Field label="Address">
                    <input className={inputCls} value={addressStr}
                      onChange={(e) => updateAddress(e.target.value)}
                      placeholder="15 Smith St Bentleigh 3204" />
                  </Field>
                </div>

                {/* Suburb (with WA autocomplete) — full width */}
                <div className="col-span-2">
                  <Field label="Suburb">
                    <SuburbInput
                      value={form.suburb ?? ''}
                      onChange={(v) => { setForm((f) => ({ ...f, suburb: v })); setDirty(true); }}
                      className={inputCls}
                      placeholder="Suburb"
                    />
                  </Field>
                </div>

                {/* Super + DQ Rep */}
                <Field label="Superannuation">
                  <select className={inputCls} value={form.superannuation || ''}
                    onChange={(e) => update('superannuation', e.target.value)}>
                    <option value="">—</option>
                    {SUPER_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                  </select>
                </Field>
                <Field label="DQ Rep">
                  <select className={inputCls} value={form.dqRep || ''}
                    onChange={(e) => update('dqRep', Number(e.target.value))}>
                    <option value="">— Select —</option>
                    {activeReps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    {formerReps.length > 0 && (
                      <optgroup label="── Former Staff ──">
                        {formerReps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </optgroup>
                    )}
                  </select>
                </Field>

                {/* ── Booked Details — only shown when status is Booked ───── */}
                {form.status === 'Booked' && (
                  <div className="col-span-2 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-4 space-y-3">
                    <div className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide flex items-center gap-1.5 mb-1">
                      📋 Booked Details
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {/* DQ Rep — read-only */}
                      <Field label="DQ Rep">
                        <div className="px-3 py-2 text-sm rounded-lg bg-white/70 dark:bg-slate-800/70 border border-green-200 dark:border-green-700 text-gray-700 dark:text-gray-300 font-medium">
                          {dqRepName}
                        </div>
                      </Field>

                      {/* FC Rep */}
                      <Field label="FC Rep">
                        <select
                          className={`${inputCls} border-green-200 dark:border-green-700`}
                          value={form.fcRep || ''}
                          onChange={(e) => update('fcRep', e.target.value ? Number(e.target.value) : undefined)}
                        >
                          <option value="">— Select FC —</option>
                          {activeReps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                          {formerReps.length > 0 && (
                            <optgroup label="── Former Staff ──">
                              {formerReps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                            </optgroup>
                          )}
                        </select>
                      </Field>

                      {/* FR Rep */}
                      <Field label="FR Rep">
                        <select
                          className={`${inputCls} border-green-200 dark:border-green-700`}
                          value={form.frRep || ''}
                          onChange={(e) => update('frRep', e.target.value ? Number(e.target.value) : undefined)}
                        >
                          <option value="">— Select FR —</option>
                          {activeReps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                          {formerReps.length > 0 && (
                            <optgroup label="── Former Staff ──">
                              {formerReps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                            </optgroup>
                          )}
                        </select>
                      </Field>

                      {/* PS Rep — full width */}
                      <div className="col-span-2">
                        <Field label="PS Rep (Post-Settlement)">
                          <select
                            className={`${inputCls} border-green-200 dark:border-green-700`}
                            value={form.psRep || ''}
                            onChange={(e) => update('psRep', e.target.value ? Number(e.target.value) : undefined)}
                          >
                            <option value="">— Select PS Rep —</option>
                            {activeReps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                            {formerReps.length > 0 && (
                              <optgroup label="── Former Staff ──">
                                {formerReps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                              </optgroup>
                            )}
                          </select>
                        </Field>
                      </div>
                    </div>

                    {/* DNQ / Fell Over toggle */}
                    <div className="flex items-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          const next = !form.dnqFellOver;
                          update('dnqFellOver', next);
                          if (!next) update('dnqNotes', '');
                        }}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                          form.dnqFellOver
                            ? 'bg-red-500'
                            : 'bg-gray-300 dark:bg-slate-600'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                            form.dnqFellOver ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                      <span className={`text-sm font-semibold ${form.dnqFellOver ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                        {form.dnqFellOver ? '❌ DNQ / Fell Over' : 'DNQ / Fell Over?'}
                      </span>
                    </div>

                    {/* DNQ Notes — only when toggled on */}
                    {form.dnqFellOver && (
                      <div>
                        <label className="block text-xs font-medium text-red-600 dark:text-red-400 mb-1">
                          Reason / Notes *
                        </label>
                        <textarea
                          className="w-full px-3 py-2 text-sm rounded-lg border border-red-300 dark:border-red-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-red-400 resize-none"
                          rows={3}
                          placeholder="Why did this fall over? e.g. Client changed mind, couldn't verify super, no show…"
                          value={form.dnqNotes || ''}
                          onChange={(e) => update('dnqNotes', e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Callback — conditional, full width */}
                {(form.status === 'Revisit' || form.callbackDate) && (
                  <div className="col-span-2 grid grid-cols-2 gap-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-700">
                    <Field label="Callback Date">
                      <input type="date" className={inputCls} value={form.callbackDate || ''}
                        onChange={(e) => update('callbackDate', e.target.value)} />
                    </Field>
                    <Field label="Callback Time">
                      <input type="time" className={inputCls} value={form.callbackTime || ''}
                        onChange={(e) => update('callbackTime', e.target.value)} />
                    </Field>
                  </div>
                )}

                {/* Knock Pin Type — only shown when opened from Map page */}
                {customPinTypes !== undefined && (
                  <div className="col-span-2">
                    <Field label="Knock Pin Type">
                      <div className="flex flex-wrap gap-1.5 mt-0.5">
                        <button
                          type="button"
                          onClick={() => update('knockResult', '')}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                            !form.knockResult
                              ? 'bg-gray-700 text-white border-gray-700 dark:bg-gray-500 dark:border-gray-500'
                              : 'border-gray-300 dark:border-slate-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          None
                        </button>
                        {[
                          ...Object.entries(KNOCK_LABELS).map(([id, name]) => ({ id, name, color: KNOCK_COLORS[id] })),
                          ...customPinTypes.map((c) => ({ id: c.id, name: c.name, color: c.color })),
                        ].map(({ id, name, color }) => {
                          const active = form.knockResult === id;
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => update('knockResult', id)}
                              className="px-2.5 py-1 rounded-full text-xs font-medium border transition"
                              style={
                                active
                                  ? { backgroundColor: color, borderColor: color, color: '#fff' }
                                  : { borderColor: color, color: color }
                              }
                            >
                              {name}
                            </button>
                          );
                        })}
                      </div>
                    </Field>
                  </div>
                )}

                {/* Last Contact Rep + Last Call */}
                <Field label="Last Contact Rep">
                  <div className={readOnlyCls}>{lastContactRep}</div>
                </Field>
                <Field label="Last Call">
                  <div className={readOnlyCls}>{lastCallDate}</div>
                </Field>

                {/* Notes — editable lead-level notes */}
                <div className="col-span-2">
                  <Field label="Notes">
                    <textarea
                      className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-amber-400 resize-none"
                      rows={3}
                      placeholder="Add notes about this lead…"
                      value={form.notes || ''}
                      onChange={(e) => { setForm((f) => ({ ...f, notes: e.target.value })); setDirty(true); }}
                    />
                  </Field>
                </div>

              </div>

              {/* Save / Discard footer — only when dirty */}
              {dirty && (
                <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100 dark:border-slate-800">
                  <button
                    onClick={() => { setForm(lead); setAddressStr(buildAddress(lead)); setDirty(false); }}
                    className="flex-1 py-2 rounded-lg border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-800 transition"
                  >
                    Discard
                  </button>
                  <button
                    onClick={handleSave}
                    className="flex-1 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-400 transition flex items-center justify-center gap-2"
                  >
                    <Save size={14} /> Save Changes
                  </button>
                </div>
              )}

              {/* Files & Forms button — compact single-line button */}
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-800 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowFilesPanel(true)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-800 transition"
                >
                  <Paperclip size={14} />
                  Files &amp; Forms
                  {leadFiles.length > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-xs font-semibold">{leadFiles.length}</span>
                  )}
                  {uploading && <span className="text-amber-500 text-xs font-normal">Uploading…</span>}
                </button>
              </div>

              {/* ── Call History — kept in main column ───────────────────── */}
              {callCount > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-800">
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                    <Phone size={12} /> Call History ({callCount})
                  </div>
                  <div className="space-y-0">
                    {[...(lead.callHistory || [])].reverse().map((call, i, arr) => (
                      <div key={i} className="flex gap-3 relative">
                        <div className="flex flex-col items-center flex-shrink-0">
                          <div className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${
                            call.result === 'booked' ? 'bg-purple-500' :
                            call.result === 'not-interested' ? 'bg-red-500' :
                            call.result === 'callback' || call.result === 'callback-today' ? 'bg-orange-500' :
                            call.result === 'no-answer' ? 'bg-gray-400' :
                            'bg-amber-400'
                          }`} />
                          {i < arr.length - 1 && <div className="w-0.5 bg-gray-200 dark:bg-slate-700 flex-1 mt-1 mb-1 min-h-[12px]" />}
                        </div>
                        <div className="pb-3 flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 capitalize">
                              {call.result?.replace(/-/g, ' ')}
                            </span>
                            <span className="text-xs text-gray-400 flex-shrink-0">{call.rep}</span>
                          </div>
                          <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">
                            {(() => {
                              // Support both new format (date=YYYY-MM-DD, time=HH:MM) and old (ISO strings)
                              const isNewFmt = /^\d{4}-\d{2}-\d{2}$/.test(call.date ?? '') && /^\d{2}:\d{2}$/.test(call.time ?? '');
                              const dt = isNewFmt
                                ? new Date(`${call.date}T${call.time}`)
                                : new Date(call.time || call.date || '');
                              return isNaN(dt.getTime()) ? (call.date ?? '') : dt.toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' });
                            })()}
                          </div>
                          {call.notes && (
                            <p className="text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-slate-800 rounded-lg px-2 py-1.5 leading-relaxed">
                              {call.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Files & Forms modal — opened by the button above ──────────────────── */}
      {showFilesPanel && (
        <>
          <div className="fixed inset-0 bg-black/60 z-[60]" onClick={() => setShowFilesPanel(false)} />
          <div className="fixed inset-0 z-[61] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Paperclip size={15} className="text-amber-500" />
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                    Files &amp; Forms — {lead.name}
                  </h3>
                  {leadFiles.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-xs font-semibold">{leadFiles.length}</span>
                  )}
                </div>
                <button onClick={() => setShowFilesPanel(false)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-400 transition">
                  <X size={16} />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                {/* Fill Form button */}
                {templates.length > 0 && (
                  <button
                    type="button"
                    onClick={() => { setShowFilesPanel(false); handleFillForm(); }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-400 text-sm font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/30 transition"
                  >
                    <ClipboardList size={14} />
                    Fill a Form
                    {templates.length > 1 && (
                      <span className="ml-auto text-amber-500 font-normal text-xs">{templates.length} templates</span>
                    )}
                  </button>
                )}

                {/* Upload buttons */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Attach Files</p>
                  <div className="flex gap-2 flex-wrap">
                    <button type="button" onClick={() => docInputRef.current?.click()} disabled={uploading}
                      className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-slate-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition disabled:opacity-50">
                      <FileText size={13} /> Document
                    </button>
                    <button type="button" onClick={() => photoInputRef.current?.click()} disabled={uploading}
                      className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-slate-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition disabled:opacity-50">
                      <Image size={13} /> Photo
                    </button>
                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
                      className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-slate-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition disabled:opacity-50">
                      <File size={13} /> File
                    </button>
                    <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={uploading}
                      className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-amber-400 dark:border-amber-600 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition disabled:opacity-50">
                      <Camera size={13} /> Camera
                    </button>
                  </div>
                </div>

                {/* Hidden file inputs */}
                <input ref={docInputRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, 'document'); e.target.value = ''; }} />
                <input ref={photoInputRef} type="file" className="hidden" accept="image/*"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, 'photo'); e.target.value = ''; }} />
                <input ref={fileInputRef} type="file" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, 'file'); e.target.value = ''; }} />
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={handleCameraCapture} />

                {/* Camera staging area */}
                {stagedPhotos.length > 0 && (
                  <div className="rounded-xl border-2 border-dashed border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/10 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                        <Camera size={11} /> {stagedPhotos.length} photo{stagedPhotos.length !== 1 ? 's' : ''} staged
                      </span>
                      <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={uploading}
                        className="text-xs text-amber-600 dark:text-amber-400 hover:underline disabled:opacity-50">
                        + Take Another
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {stagedPreviews.map((src, i) => (
                        <div key={i} className="relative group">
                          <img src={src} alt={`Photo ${i + 1}`}
                            className="w-full h-16 object-cover rounded-lg border border-amber-200 dark:border-amber-700" />
                          <button type="button" onClick={() => handleRemoveStaged(i)}
                            className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition">
                            <XCircle size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={handleDiscardAllStaged} disabled={uploading}
                        className="flex-1 py-1.5 rounded-lg border border-gray-300 dark:border-slate-600 text-gray-600 dark:text-gray-400 text-xs font-medium hover:bg-gray-50 dark:hover:bg-slate-800 transition disabled:opacity-50 flex items-center justify-center gap-1">
                        <XCircle size={11} /> Discard
                      </button>
                      <button type="button" onClick={handleUploadStaged} disabled={uploading}
                        className="flex-1 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-400 transition disabled:opacity-50 flex items-center justify-center gap-1">
                        <Upload size={11} />
                        {uploading ? 'Uploading…' : `Upload ${stagedPhotos.length}`}
                      </button>
                    </div>
                  </div>
                )}

                {/* File list */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                    Attached Files {leadFiles.length > 0 && `(${leadFiles.length})`}
                  </p>
                  {leadFiles.length === 0 ? (
                    <p className="text-xs text-gray-400 dark:text-gray-500 italic">No files attached yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {leadFiles.map((lf) => (
                        <div key={lf.id} className="p-2.5 bg-gray-50 dark:bg-slate-800 rounded-lg">
                          {lf.type === 'photo' && (
                            <img src={lf.downloadUrl} alt={lf.name}
                              className="w-full h-28 object-cover rounded-md mb-2" />
                          )}
                          <div className="flex items-start gap-2">
                            <span className="text-base leading-none mt-0.5">{fileTypeIcon(lf.fileType)}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-900 dark:text-white truncate">{lf.name}</p>
                              <p className="text-xs text-gray-400 dark:text-gray-500">
                                {formatFileSize(lf.fileSize)} · {lf.uploadedBy} · {timeAgoMs(lf.uploadedAt)}
                              </p>
                            </div>
                            <a href={lf.downloadUrl} target="_blank" rel="noopener noreferrer"
                              className="p-1 text-gray-400 hover:text-amber-500 transition" title="Download">
                              <Download size={13} />
                            </a>
                            {(currentUser?.role === 'admin' || currentUser?.name === lf.uploadedBy) && (
                              <button type="button" onClick={() => deleteLeadFile(String(lead.id), lf)}
                                className="p-1 text-gray-400 hover:text-red-500 transition" title="Delete">
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Template picker — shown when >1 template exists */}
      {formPickerOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 z-[60]" onClick={() => setFormPickerOpen(false)} />
          <div className="fixed inset-0 z-[61] flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm flex flex-col max-h-[70vh]">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Select a Form Template</h3>
                <button onClick={() => setFormPickerOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-400">
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                {templates.map((t) => (
                  <button key={t.id} onClick={() => { setSelectedTemplate(t); setFormPickerOpen(false); }}
                    className="w-full text-left p-3 rounded-xl border border-gray-200 dark:border-slate-700 hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{t.name}</p>
                    {t.description && <p className="text-xs text-gray-400 mt-0.5">{t.description}</p>}
                    <p className="text-xs text-gray-400 mt-1">{t.fields.length} field{t.fields.length !== 1 ? 's' : ''}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Form Filler Modal */}
      {selectedTemplate && currentUser && (
        <Suspense fallback={
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
            <Loader size={32} className="animate-spin text-amber-500" />
          </div>
        }>
          <FormFillerModal
            template={selectedTemplate}
            lead={lead}
            currentUser={currentUser}
            onClose={() => setSelectedTemplate(null)}
            onSaved={() => setSelectedTemplate(null)}
          />
        </Suspense>
      )}
    </>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────

function timeAgoMs(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const inputCls =
  'w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm focus:outline-none focus:ring-2 focus:ring-amber-400';

const readOnlyCls =
  'w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text-muted)] text-sm';

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">{label}</label>
      {children}
    </div>
  );
}

export default LeadSidebar;
