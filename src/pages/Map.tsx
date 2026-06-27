/**
 * Map Page — Google Maps lead visualisation
 *
 * Features:
 * - Leads plotted as colour-coded pins by status
 * - Marker clustering for dense areas
 * - Status filter chips, rep + suburb dropdowns, text search
 * - Click marker → info panel (name, phone, address, rep, status)
 * - Suburb stats panel (when suburb filter is active)
 * - Knock Mode — click map → reverse-geocode → save new lead
 * - Geolocation — centers on user's location on first load, cached in localStorage
 * - Always starts in Hybrid (satellite + labels) view
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { GoogleMap, useJsApiLoader, Marker, Polygon, OverlayView } from "@react-google-maps/api";
import { MarkerClusterer as GMClusterer } from "@googlemaps/markerclusterer";
import { Lead, LeadStatus, KnockResult, KnockZone, CustomPinType } from "../types";
import { useAppStore } from "../stores/appStore";
import { generateLeadId } from "../lib/idGenerator";
import { normalizeAUPhone } from "../lib/utils";
import { getStatusColor, normalizeLeadStatus } from "../lib/statusConfig";
import {
  useLeads,
  useSaveLead,
  useDeleteLead,
  useKnockZones,
  useSaveKnockZone,
  useDeleteKnockZone,
  useCustomPinTypes,
  useSaveCustomPinType,
  useDeleteCustomPinType,
} from "../hooks/useFirebase";
import { useToast } from "../context/ToastContext";
import {
  MapPin,
  X,
  Navigation,
  Crosshair,
  Layers,
  Trash2,
  PenLine,
  Undo2,
  Plus,
  Maximize2,
  Minimize2,
  Eye,
  EyeOff,
  Search,
  Thermometer,
  SlidersHorizontal,
  Car,
} from "lucide-react";
import { LeadSidebar } from "../components/LeadSidebar";
import CallLogger from "../components/CallLogger";

const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? import.meta.env.VITE_GOOGLE_PLACES_API_KEY;
const LIBRARIES: ("places" | "geometry" | "geocoding" | "visualization" | "marker")[] = ["visualization", "marker"];
const MAPS_MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID ?? "";

if (!MAPS_API_KEY) {
  console.error("Missing Google Maps API key — set VITE_GOOGLE_MAPS_API_KEY or VITE_GOOGLE_PLACES_API_KEY env var");
}

// Fallback centre when geolocation is unavailable and no cached position
const PERTH: google.maps.LatLngLiteral = { lat: -31.9505, lng: 115.8605 };

const LOCATION_CACHE_KEY = "asg-crm:userLocation";

function getCachedLocation(): google.maps.LatLngLiteral {
  try {
    const stored = localStorage.getItem(LOCATION_CACHE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    /* ignore */
  }
  return PERTH;
}

const ALL_STATUSES: LeadStatus[] = ["DQ", "Booked", "Revisit", "Not Interested", "Wrong Number", "No Answer"];

// Knock outcome → pin colour (built-in types)
const KNOCK_COLORS: Record<string, string> = {
  "not-interested": "#ef4444",
  "no-answer": "#f97316",
  skipped: "#6b7280",
  "dq-complete": "#22c55e",
  "parents-not-home": "#3b82f6",
};
const KNOCK_LABELS: Record<string, string> = {
  "not-interested": "🔴 Not Interested",
  "no-answer": "🟠 No Answer",
  skipped: "⚫ Skipped",
  "dq-complete": "🟢 DQ Complete",
  "parents-not-home": "🔵 Parents Not Home",
};

// Zone colour palette (cycles through per rep index)
const REP_ZONE_COLORS = ["#f59e0b", "#3b82f6", "#22c55e", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316", "#ec4899"];

// Polygon centroid helper
function centroid(polygon: Array<{ lat: number; lng: number }>): { lat: number; lng: number } {
  return {
    lat: polygon.reduce((s, p) => s + p.lat, 0) / polygon.length,
    lng: polygon.reduce((s, p) => s + p.lng, 0) / polygon.length,
  };
}

// Format YYYY-MM-DD for zone labels
function fmtZoneDate(d: string): string {
  if (!d) return "";
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" });
  } catch {
    return d;
  }
}

/** @deprecated Only used by the legacy <Marker> JSX component for drawing vertices */
function markerSvgUrl(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="36" viewBox="0 0 24 36">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="${color}" stroke="white" stroke-width="1.5"/>
    <circle cx="12" cy="12" r="5" fill="white" opacity="0.9"/>
  </svg>`;
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
}

/** Creates an HTMLElement containing the pin SVG — used by AdvancedMarkerElement content.
 *  IMPORTANT: cursor:pointer + pointer-events:auto on the container are required for
 *  gmpclick to fire reliably. The SVG itself uses pointer-events:none so the div
 *  (not the SVG paths) receives the click, which is what AdvancedMarkerElement expects.
 */
function markerSvgElement(color: string, width = 24, height = 36): HTMLElement {
  const div = document.createElement("div");
  div.style.cssText = `width:${width}px;height:${height}px;display:block;cursor:pointer;pointer-events:auto;position:relative;z-index:1;`;
  div.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 24 36" style="pointer-events:none;display:block;">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="${color}" stroke="white" stroke-width="1.5"/>
    <circle cx="12" cy="12" r="5" fill="white" opacity="0.9"/>
  </svg>`;
  return div;
}

// ── Knock modal ───────────────────────────────────────────────────────────────
interface KnockForm {
  name: string;
  phone: string;
  houseNum: string;
  street: string;
  suburb: string;
  postcode: string;
  notes: string;
  knockResult: KnockResult;
}

const KNOCK_RESULT_KEYS: KnockResult[] = ["no-answer", "not-interested", "skipped", "dq-complete", "parents-not-home"];

function KnockModal({
  latLng,
  geocodedAddress,
  onClose,
  onSave,
}: {
  latLng: google.maps.LatLngLiteral;
  geocodedAddress: Partial<KnockForm> | null;
  onClose: () => void;
  onSave: (form: KnockForm & { lat: number; lng: number }) => void;
}) {
  const [form, setForm] = useState<KnockForm>({
    name: "",
    phone: "",
    knockResult: "no-answer",
    houseNum: geocodedAddress?.houseNum ?? "",
    street: geocodedAddress?.street ?? "",
    suburb: geocodedAddress?.suburb ?? "",
    postcode: geocodedAddress?.postcode ?? "",
    notes: "",
  });
  const sf = (k: keyof KnockForm, v: string) => setForm((p) => ({ ...p, [k]: v }));

  // Fill address fields when geocoding resolves
  const prevGeo = useRef<Partial<KnockForm> | null>(null);
  if (geocodedAddress && geocodedAddress !== prevGeo.current) {
    prevGeo.current = geocodedAddress;
    // Sync address fields only (don't touch name/notes/knockResult)
    const addressKeys = ["houseNum", "street", "suburb", "postcode"] as const;
    addressKeys.forEach((k) => {
      const val = (geocodedAddress as Record<string, string>)[k];
      if (val) (form as unknown as Record<string, string>)[k] = val;
    });
  }

  const handleSave = () => {
    if (!form.houseNum || !form.street || !form.suburb || !form.postcode) return;
    onSave({ ...form, lat: latLng.lat, lng: latLng.lng });
  };

  const inp =
    "w-full px-2 py-1.5 rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400";

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
        <div className="bg-white dark:bg-[var(--surface)] rounded-xl shadow-2xl w-full max-w-md">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-white/[0.06]">
            <span className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <MapPin size={16} className="text-amber-500" /> Log Door Knock
            </span>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-[var(--hover)] rounded transition">
              <X size={16} />
            </button>
          </div>
          <div className="px-5 py-4 space-y-3">
            <p className="text-xs text-gray-400">
              {geocodedAddress === null ? "Geocoding…" : `📍 ${latLng.lat.toFixed(5)}, ${latLng.lng.toFixed(5)}`}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Name</label>
                <input
                  className={inp}
                  value={form.name}
                  onChange={(e) => sf("name", e.target.value)}
                  placeholder="Resident name"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Phone</label>
                <input
                  className={inp}
                  value={form.phone}
                  onChange={(e) => sf("phone", e.target.value)}
                  placeholder="04xx xxx xxx"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">House # *</label>
                <input
                  className={inp}
                  value={form.houseNum}
                  onChange={(e) => sf("houseNum", e.target.value)}
                  placeholder="12"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Street *</label>
                <input
                  className={inp}
                  value={form.street}
                  onChange={(e) => sf("street", e.target.value)}
                  placeholder="Main St"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Suburb *</label>
                <input
                  className={inp}
                  value={form.suburb}
                  onChange={(e) => sf("suburb", e.target.value)}
                  placeholder="Suburb"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Postcode *</label>
                <input
                  className={inp}
                  value={form.postcode}
                  onChange={(e) => sf("postcode", e.target.value)}
                  placeholder="3000"
                />
              </div>
            </div>
            {/* Knock result — colour-coded chips */}
            <div>
              <label className="text-xs text-amber-600 dark:text-amber-400 font-semibold mb-2 block tracking-wide">
                Knock Result
              </label>
              <div className="grid grid-cols-1 gap-1.5">
                {KNOCK_RESULT_KEYS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => sf("knockResult", k)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition"
                    style={
                      form.knockResult === k
                        ? {
                            backgroundColor: KNOCK_COLORS[k] + "22",
                            borderColor: KNOCK_COLORS[k],
                            color: KNOCK_COLORS[k],
                          }
                        : { borderColor: "#e5e7eb", color: "#9ca3af" }
                    }
                  >
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: KNOCK_COLORS[k] }} />
                    {KNOCK_LABELS[k].replace(/^[^ ]+ /, "")}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Notes</label>
              <textarea
                className={inp + " resize-none"}
                rows={2}
                value={form.notes}
                onChange={(e) => sf("notes", e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-3 px-5 py-4 border-t border-gray-200 dark:border-white/[0.06]">
            <button
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-gray-300 dark:border-white/[0.08] text-gray-700 dark:text-gray-300 text-sm hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!form.houseNum || !form.street || !form.suburb || !form.postcode}
              className="flex-1 py-2 rounded-lg bg-amber-500 text-white font-semibold text-sm hover:bg-amber-400 disabled:opacity-50 transition"
            >
              Save Lead
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Knock Zone modal (multi-rep) ──────────────────────────────────────────────
function KnockZoneModal({
  vertices,
  reps,
  onClose,
  onSave,
}: {
  vertices: Array<{ lat: number; lng: number }>;
  reps: Array<{ id: number; name: string }>;
  onClose: () => void;
  onSave: (zone: { name: string; repIds: number[]; date: string }) => void;
}) {
  const today = new Date().toISOString().split("T")[0];
  const [zoneName, setZoneName] = useState("");
  const [selectedRepIds, setSelectedRepIds] = useState<Set<number>>(new Set());
  const [date, setDate] = useState(today);
  const inp =
    "w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400";

  const toggleRep = (id: number) => {
    setSelectedRepIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-[var(--surface)] rounded-xl shadow-2xl w-full max-w-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-white/[0.06]">
            <span className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Layers size={16} className="text-amber-500" /> Save Zone
            </span>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-[var(--hover)] rounded transition">
              <X size={16} />
            </button>
          </div>
          <div className="px-5 py-4 space-y-3">
            <p className="text-xs text-gray-400">{vertices.length} vertices drawn</p>
            <div>
              <label className="text-xs text-amber-600 dark:text-amber-400 font-semibold mb-1 block">
                Zone Name <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <input
                className={inp}
                value={zoneName}
                onChange={(e) => setZoneName(e.target.value)}
                placeholder="e.g. Block A North"
              />
            </div>
            {/* Multi-rep checkboxes */}
            <div>
              <label className="text-xs text-amber-600 dark:text-amber-400 font-semibold mb-2 block">
                Assign Reps * <span className="font-normal text-gray-400">({selectedRepIds.size} selected)</span>
              </label>
              <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                {reps.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggleRep(r.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-sm transition ${
                      selectedRepIds.has(r.id)
                        ? "bg-amber-50 dark:bg-amber-900/20 border-amber-400 text-amber-700 dark:text-amber-400"
                        : "border-gray-200 dark:border-white/[0.06] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[var(--hover)]"
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition ${
                        selectedRepIds.has(r.id)
                          ? "bg-amber-500 border-amber-500"
                          : "border-gray-300 dark:border-white/[0.08]"
                      }`}
                    >
                      {selectedRepIds.has(r.id) && <span className="text-white text-xs leading-none">✓</span>}
                    </span>
                    {r.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-amber-600 dark:text-amber-400 font-semibold mb-1 block">Date *</label>
              <input type="date" className={inp} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-3 px-5 py-4 border-t border-gray-200 dark:border-white/[0.06]">
            <button
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-gray-300 dark:border-white/[0.08] text-gray-700 dark:text-gray-300 text-sm hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (selectedRepIds.size > 0 && date) onSave({ name: zoneName, repIds: [...selectedRepIds], date });
              }}
              disabled={selectedRepIds.size === 0 || !date}
              className="flex-1 py-2 rounded-lg bg-amber-500 text-white font-semibold text-sm hover:bg-amber-400 disabled:opacity-50 transition"
            >
              Save Zone
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Pin Legend + Quick Add widget ─────────────────────────────────────────────
function PinLegend({
  quickPinMode,
  customPinTypes,
  isAdmin,
  onSelectQuickPin,
  onClearQuickPin,
  onSaveCustomPin,
  onDeleteCustomPin,
}: {
  quickPinMode: string | null;
  customPinTypes: CustomPinType[];
  isAdmin: boolean;
  onSelectQuickPin: (r: string) => void;
  onClearQuickPin: () => void;
  onSaveCustomPin: (pin: { name: string; color: string }) => void;
  onDeleteCustomPin: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [showNewPin, setShowNewPin] = useState(false);
  const [newPinName, setNewPinName] = useState("");
  const [newPinColor, setNewPinColor] = useState("#9333ea");

  // Merge built-in + custom types into one list
  const allPinTypes = [
    ...KNOCK_RESULT_KEYS.map((k) => ({
      id: k as string,
      name: KNOCK_LABELS[k].replace(/^[^ ]+ /, ""),
      color: KNOCK_COLORS[k],
      isCustom: false,
    })),
    ...customPinTypes.map((c) => ({ id: c.id, name: c.name, color: c.color, isCustom: true })),
  ];

  const activeType = allPinTypes.find((p) => p.id === quickPinMode);

  return (
    <div className="absolute bottom-24 left-3 z-10 select-none">
      <div className="bg-white dark:bg-[var(--surface)] rounded-xl shadow-2xl border border-gray-200 dark:border-white/[0.06] overflow-hidden w-52">
        {/* Header */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2.5 border-b border-gray-100 dark:border-white/[0.06] hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition"
        >
          <span className="text-xs font-bold text-amber-600 dark:text-amber-400 tracking-wide">🚪 PIN LEGEND</span>
          <span className="text-gray-400 text-xs">{expanded ? "▲" : "▼"}</span>
        </button>

        {expanded && (
          <>
            {/* Colour key rows + quick-add buttons */}
            <div className="py-1.5">
              {allPinTypes.map((pt) => (
                <div
                  key={pt.id}
                  className="flex items-center justify-between px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: pt.color }} />
                    <span className="text-xs text-gray-700 dark:text-gray-300 leading-tight truncate">{pt.name}</span>
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0 ml-1">
                    {/* Admin: delete custom pin type */}
                    {pt.isCustom && isAdmin && (
                      <button
                        onClick={() => onDeleteCustomPin(pt.id)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 text-red-400 hover:text-red-600 dark:hover:text-red-300 transition rounded"
                        title="Delete this pin type"
                      >
                        <X size={11} />
                      </button>
                    )}
                    {/* Quick-pin toggle */}
                    <button
                      onClick={() => (quickPinMode === pt.id ? onClearQuickPin() : onSelectQuickPin(pt.id))}
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 px-1.5 py-0.5 rounded text-xs font-bold transition"
                      style={
                        quickPinMode === pt.id
                          ? { backgroundColor: pt.color, color: "#fff" }
                          : { backgroundColor: pt.color + "22", color: pt.color }
                      }
                      title={quickPinMode === pt.id ? "Exit quick-pin mode" : "Quick-drop a pin of this type"}
                    >
                      {quickPinMode === pt.id ? "✕" : "+"}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Quick pin active CTA */}
            <div
              className={`px-3 pt-1 border-t border-gray-100 dark:border-white/[0.06] ${showNewPin ? "" : "pb-2.5"}`}
            >
              {quickPinMode && activeType ? (
                <div
                  className="w-full py-1.5 rounded-lg text-xs font-semibold text-center"
                  style={{ backgroundColor: activeType.color + "22", color: activeType.color }}
                >
                  Tap map to drop pin
                  <button
                    onClick={onClearQuickPin}
                    className="block w-full mt-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 font-normal text-xs"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <p className="text-xs text-gray-400 text-center">Tap + next to a colour to place a quick pin</p>
              )}
            </div>

            {/* Admin: create new pin type */}
            {isAdmin && (
              <div className="border-t border-gray-100 dark:border-white/[0.06]">
                {!showNewPin ? (
                  <button
                    onClick={() => setShowNewPin(true)}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition"
                  >
                    <Plus size={12} /> New Pin Type
                  </button>
                ) : (
                  <div className="p-3 space-y-2">
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">New Pin Type</p>
                    <input
                      type="text"
                      placeholder="Pin name…"
                      value={newPinName}
                      onChange={(e) => setNewPinName(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">Colour</label>
                      <input
                        type="color"
                        value={newPinColor}
                        onChange={(e) => setNewPinColor(e.target.value)}
                        className="w-8 h-7 rounded cursor-pointer border border-gray-300 dark:border-white/[0.08] flex-shrink-0"
                      />
                      <span className="text-xs truncate" style={{ color: newPinColor }}>
                        ● {newPinName || "Preview"}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setShowNewPin(false);
                          setNewPinName("");
                          setNewPinColor("#9333ea");
                        }}
                        className="flex-1 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.06] text-gray-500 dark:text-gray-400 text-xs hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          if (newPinName.trim()) {
                            onSaveCustomPin({ name: newPinName.trim(), color: newPinColor });
                            setNewPinName("");
                            setNewPinColor("#9333ea");
                            setShowNewPin(false);
                          }
                        }}
                        disabled={!newPinName.trim()}
                        className="flex-1 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-400 disabled:opacity-50 transition"
                      >
                        Add Pin
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Resolve knock colour — checks built-in first, then custom types
function resolveKnockColor(result: string, customPinTypes: CustomPinType[]): string {
  if (result in KNOCK_COLORS) return KNOCK_COLORS[result];
  return customPinTypes.find((c) => c.id === result)?.color ?? "#9ca3af";
}

// Resolve knock label — checks built-in first, then custom types
function resolveKnockLabel(result: string, customPinTypes: CustomPinType[]): string {
  if (result in KNOCK_LABELS) return KNOCK_LABELS[result].replace(/^[^ ]+ /, "");
  return customPinTypes.find((c) => c.id === result)?.name ?? result;
}
// ── Main Map page ─────────────────────────────────────────────────────────────
// ── Pin Action Panel — compact popup that appears when any marker is tapped ───
function PinActionPanel({
  lead,
  customPinTypes,
  onClose,
  onSave,
  onDelete,
  onOpenProfile,
  onOpenCallLogger,
}: {
  lead: Lead;
  customPinTypes: CustomPinType[];
  onClose: () => void;
  onSave: (updated: Lead) => void;
  onDelete: (lead: Lead) => void;
  onOpenProfile: () => void;
  onOpenCallLogger: () => void;
}) {
  const isQuickPin = !lead.name || lead.name === "Quick Pin";

  // All pin types: built-in + custom
  const allPinTypes = [
    ...KNOCK_RESULT_KEYS.map((k) => ({ id: k, name: KNOCK_LABELS[k].replace(/^[^ ]+ /, ""), color: KNOCK_COLORS[k] })),
    ...customPinTypes.map((c) => ({ id: c.id, name: c.name, color: c.color })),
  ];

  const [form, setForm] = useState({
    name: isQuickPin ? "" : lead.name,
    phone: lead.phone ?? "",
    houseNum: lead.houseNum ?? "",
    street: lead.street ?? "",
    suburb: lead.suburb ?? "",
    postcode: lead.postcode ?? "",
    knockResult: lead.knockResult ?? "no-answer",
  });
  const sf = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSave = () => {
    onSave({
      ...lead,
      name: form.name.trim() || (isQuickPin ? "Quick Pin" : lead.name),
      phone: form.phone,
      houseNum: form.houseNum,
      street: form.street,
      suburb: form.suburb,
      postcode: form.postcode,
      knockResult: form.knockResult,
    });
  };

  const inp =
    "w-full px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-white/[0.08] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400";

  const activeColor = allPinTypes.find((p) => p.id === form.knockResult)?.color ?? "#9ca3af";

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      {/* Bottom sheet on mobile, floating card on desktop */}
      <div className="fixed inset-x-0 bottom-0 z-50 sm:inset-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-sm p-3 sm:p-0">
        <div className="bg-white dark:bg-[var(--surface)] rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] sm:max-h-[80vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/[0.06] flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: activeColor }} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                  {isQuickPin ? "📍 Quick Pin — fill in details" : lead.name}
                </p>
                {!isQuickPin && lead.phone && <p className="text-xs text-gray-400">{lead.phone}</p>}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-[var(--hover)] rounded-lg transition text-gray-400 flex-shrink-0 ml-2"
            >
              <X size={15} />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="overflow-y-auto flex-1">
            <div className="px-4 py-3 space-y-3">
              {/* Quick-pin detail form */}
              {isQuickPin && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Name</label>
                    <input
                      className={inp}
                      value={form.name}
                      onChange={(e) => sf("name", e.target.value)}
                      placeholder="Resident name"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Phone</label>
                    <input
                      className={inp}
                      value={form.phone}
                      onChange={(e) => sf("phone", e.target.value)}
                      placeholder="04xx xxx xxx"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">House #</label>
                    <input
                      className={inp}
                      value={form.houseNum}
                      onChange={(e) => sf("houseNum", e.target.value)}
                      placeholder="12"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Street</label>
                    <input
                      className={inp}
                      value={form.street}
                      onChange={(e) => sf("street", e.target.value)}
                      placeholder="Main St"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Suburb</label>
                    <input
                      className={inp}
                      value={form.suburb}
                      onChange={(e) => sf("suburb", e.target.value)}
                      placeholder="Suburb"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Postcode</label>
                    <input
                      className={inp}
                      value={form.postcode}
                      onChange={(e) => sf("postcode", e.target.value)}
                      placeholder="6000"
                    />
                  </div>
                </div>
              )}

              {/* Pin colour / outcome selector */}
              <div>
                <label className="text-xs text-amber-600 dark:text-amber-400 font-semibold mb-2 block tracking-wide">
                  {isQuickPin ? "Pin Type" : "Change Pin Colour"}
                </label>
                <div className="grid grid-cols-1 gap-1">
                  {allPinTypes.map((pt) => (
                    <button
                      key={pt.id}
                      type="button"
                      onClick={() => sf("knockResult", pt.id)}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg border text-sm font-medium transition"
                      style={
                        form.knockResult === pt.id
                          ? { backgroundColor: pt.color + "22", borderColor: pt.color, color: pt.color }
                          : { borderColor: "#e5e7eb", color: "#9ca3af" }
                      }
                    >
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: pt.color }} />
                      {pt.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="px-4 py-3 border-t border-gray-100 dark:border-white/[0.06] space-y-2 flex-shrink-0">
            {isQuickPin ? (
              <button
                onClick={handleSave}
                className="w-full py-2.5 rounded-xl bg-amber-500 text-white font-semibold text-sm hover:bg-amber-400 transition"
              >
                Save Pin Details
              </button>
            ) : (
              <>
                <button
                  onClick={() => {
                    handleSave();
                    onClose();
                    onOpenProfile();
                  }}
                  className="w-full py-2.5 rounded-xl bg-amber-500 text-white font-semibold text-sm hover:bg-amber-400 transition"
                >
                  Save & Open Full Profile
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      handleSave();
                      onClose();
                    }}
                    className="flex-1 py-2 rounded-xl border border-gray-200 dark:border-white/[0.06] text-gray-700 dark:text-gray-300 text-sm hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition"
                  >
                    💾 Save Only
                  </button>
                  <button
                    onClick={() => {
                      onClose();
                      onOpenProfile();
                    }}
                    className="flex-1 py-2 rounded-xl border border-gray-200 dark:border-white/[0.06] text-gray-700 dark:text-gray-300 text-sm hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition"
                  >
                    📋 Full Profile
                  </button>
                  <button
                    onClick={() => {
                      onClose();
                      onOpenCallLogger();
                    }}
                    className="flex-1 py-2 rounded-xl border border-gray-200 dark:border-white/[0.06] text-gray-700 dark:text-gray-300 text-sm hover:bg-gray-50 dark:hover:bg-[var(--hover)] transition"
                  >
                    📞 Log Call
                  </button>
                </div>
              </>
            )}
            <button
              onClick={() => onDelete(lead)}
              className="w-full py-2 rounded-xl border border-red-200 dark:border-red-900 text-red-500 dark:text-red-400 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition"
            >
              🗑️ Delete Pin
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Main Map page ─────────────────────────────────────────────────────────────
void PinActionPanel;

export function MapPage() {
  const { reps, currentUser, statusColors } = useAppStore();
  const { save: saveLead } = useSaveLead();
  const { remove: deleteLead } = useDeleteLead();
  const { save: saveZone } = useSaveKnockZone();
  const { remove: deleteZone } = useDeleteKnockZone();
  const { customPinTypes } = useCustomPinTypes();
  const { save: saveCustomPin } = useSaveCustomPinType();
  const { remove: deleteCustomPin } = useDeleteCustomPinType();
  const { showToast } = useToast();

  // Own Firestore subscriptions — map page may be visited without Leads page ever mounting
  const { leads } = useLeads();
  const { zones: allZones } = useKnockZones();

  // Failsafe: prevent loading script if API key is missing
  if (!MAPS_API_KEY) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#f0f0ee] dark:bg-[#0e0e0d] p-6">
        <div className="bg-white dark:bg-[#1a1a18] border border-[#e2e2de] dark:border-[#2e2e2b] rounded-2xl p-8 max-w-sm w-full text-center shadow-xl">
          <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
            <MapPin className="text-red-500" size={24} />
          </div>
          <h2 className="text-base font-semibold text-[#1a1a18] dark:text-[#f0f0ee] mb-2">
            Configuration Error
          </h2>
          <p className="text-xs text-[#6b6b65] dark:text-[#8a8a84] mb-3">
            Google Maps API key is not configured. Please set the <code className="bg-gray-100 dark:bg-gray-900 px-1 py-0.5 rounded text-[11px]">VITE_GOOGLE_MAPS_API_KEY</code> environment variable.
          </p>
        </div>
      </div>
    );
  }

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: MAPS_API_KEY,
    libraries: LIBRARIES as ("places" | "geometry" | "geocoding" | "visualization" | "marker")[],
    ...(MAPS_MAP_ID ? { mapIds: [MAPS_MAP_ID] } : {}),
  });

  const mapRef = useRef<google.maps.Map | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const clustererRef = useRef<GMClusterer | null>(null);
  // Keep a ref to imperative AdvancedMarkerElement instances for clustering
  const markerInstancesRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  // Heatmap layer ref (visualization library)
  const heatmapRef = useRef<google.maps.visualization.HeatmapLayer | null>(null);
  // Auto-geocode queue processing lock
  const geocodingRef = useRef(false);
  // Stable ref to leads — prevents stale closures inside imperative gmpclick listeners
  const leadsRef = useRef<typeof leads>([]);
  leadsRef.current = leads;

  // Start from cached location (updated after successful geolocation)
  const [center, setCenter] = useState<google.maps.LatLngLiteral>(getCachedLocation);
  // Tracks when the GoogleMap instance is ready — used as a useEffect dependency
  // (mapRef is a ref so doesn't trigger re-renders; isMapReady is state so it does)
  const [isMapReady, setIsMapReady] = useState(false);

  const [activeStatuses, setActiveStatuses] = useState<Set<LeadStatus>>(new Set(ALL_STATUSES));
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRep, setFilterRep] = useState<number | "">("");
  const [filterSuburb, setFilterSuburb] = useState("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showCallLogger, setShowCallLogger] = useState(false);
  const [knockMode, setKnockMode] = useState(false);
  const [knockLatLng, setKnockLatLng] = useState<google.maps.LatLngLiteral | null>(null);
  const [knockAddress, setKnockAddress] = useState<Partial<KnockForm> | null>(null);
  const [geocodingId, setGeocodingId] = useState<number | null>(null);
  // Zone drawing
  const [drawingZone, setDrawingZone] = useState(false);
  const [drawVertices, setDrawVertices] = useState<Array<{ lat: number; lng: number }>>([]);
  const [pendingZoneVertices, setPendingZoneVertices] = useState<Array<{ lat: number; lng: number }> | null>(null);
  // Zone library
  const [showZoneLibrary, setShowZoneLibrary] = useState(false);
  const [zoneFromDate, setZoneFromDate] = useState("");
  const [zoneToDate, setZoneToDate] = useState("");
  // Knock-only filter
  const [showKnockOnly, setShowKnockOnly] = useState(false);
  // Quick pin mode — when set, map clicks drop that knock result instantly (string = built-in or custom id)
  const [quickPinMode, setQuickPinMode] = useState<string | null>(null);
  // Geocoding status filter — '' = geocode any unmapped lead
  const [geoFilterStatus, setGeoFilterStatus] = useState<LeadStatus | "">("");
  // User location ref for Locate Me
  const userLocationRef = useRef<google.maps.LatLngLiteral | null>(null);
  // Overlay visibility — when false, all UI panels hide leaving a clean map
  const [overlaysVisible, setOverlaysVisible] = useState(true);
  // Fullscreen state (synced with browser fullscreenchange event)
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Ref for the map page container (used for requestFullscreen)
  const containerRef = useRef<HTMLDivElement>(null);
  // Heatmap toggle
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [heatmapDate, setHeatmapDate] = useState<string>(""); // YYYY-MM-DD, empty = all dates
  // Traffic layer
  const trafficLayerRef = useRef<google.maps.TrafficLayer | null>(null);
  const [showTrafficLayer, setShowTrafficLayer] = useState(false);
  // Map Controls panel
  const [showMapControls, setShowMapControls] = useState(false);
  // Auto-geocode queue — populated when <= 5 new un-geocoded leads are detected
  const [autoGeocodeQueue, setAutoGeocodeQueue] = useState<Lead[]>([]);

  const activeReps = useMemo(() => reps.filter((r) => r.active), [reps]);
  const suburbs = useMemo(() => [...new Set(leads.map((l) => l.suburb).filter(Boolean))].sort(), [leads]);

  // Filtered zones by date range
  const filteredZones = useMemo(() => {
    return allZones.filter((z) => {
      if (zoneFromDate && z.date < zoneFromDate) return false;
      if (zoneToDate && z.date > zoneToDate) return false;
      return true;
    });
  }, [allZones, zoneFromDate, zoneToDate]);

  // Zone colour helper — stable per rep (by rep index in list)
  const getZoneColor = useCallback(
    (repId: number) => {
      const idx = reps.findIndex((r) => r.id === repId);
      return REP_ZONE_COLORS[idx >= 0 ? idx % REP_ZONE_COLORS.length : 0];
    },
    [reps],
  );

  // Map load — set satellite view, geolocate user
  const onMapLoad = useCallback(
    (map: google.maps.Map) => {
      mapRef.current = map;
      geocoderRef.current = new google.maps.Geocoder();
      setIsMapReady(true);

      // Always satellite + labels (hybrid)
      map.setMapTypeId("hybrid");

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            // Cache so next visit skips the Melbourne/Perth flash
            localStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(loc));
            setCenter(loc);
            map.setCenter(loc);
            map.setZoom(14);
            // Blue dot for current position (AdvancedMarkerElement)
            const blueDotEl = document.createElement("div");
            blueDotEl.style.cssText = "width:20px;height:20px;display:block;";
            blueDotEl.innerHTML =
              '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#4285f4" stroke="white" stroke-width="2.5"/><circle cx="12" cy="12" r="4" fill="white"/></svg>';
            new google.maps.marker.AdvancedMarkerElement({
              position: loc,
              map,
              content: blueDotEl,
              title: "Your Location",
            });
          },
          () => showToast("📍 Location access denied — showing last known area", "error"),
          { timeout: 8000, maximumAge: 60000 },
        );
      }
    },
    [showToast],
  );

  // Filtered leads — only those with geocoded lat/lng
  const visibleLeads = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return leads.filter((l) => {
      if (!l.lat || !l.lng) return false;
      if (showKnockOnly) {
        if (!l.knockResult) return false; // Knock view: only show knock pins
      } else {
        if (l.knockResult) return false; // Default view: hide knock pins
        if (!activeStatuses.has(normalizeLeadStatus(l.status) as LeadStatus)) return false;
      }
      if (filterRep && l.dqRep !== filterRep) return false;
      if (filterSuburb && l.suburb !== filterSuburb) return false;
      if (term && !l.name.toLowerCase().includes(term) && !(l.suburb ?? "").toLowerCase().includes(term)) return false;
      return true;
    });
  }, [leads, activeStatuses, filterRep, filterSuburb, searchTerm, showKnockOnly]);

  // Suburb stats
  const suburbStats = useMemo(() => {
    if (!filterSuburb) return null;
    const all = leads.filter((l) => l.suburb === filterSuburb);
    if (all.length === 0) return null;
    const counts: Record<string, number> = {};
    all.forEach((l) => {
      const status = normalizeLeadStatus(l.status);
      counts[status] = (counts[status] || 0) + 1;
    });
    return { total: all.length, counts };
  }, [leads, filterSuburb]);

  // Drill-down: which status cell is selected in the suburb stats panel
  const [statDrillStatus, setStatDrillStatus] = useState<LeadStatus | null>(null);

  // Leads in the selected suburb + status that have coordinates (for snap-to)
  const drillLeads = useMemo(() => {
    if (!statDrillStatus || !filterSuburb) return [];
    return leads.filter((l) => normalizeLeadStatus(l.status) === statDrillStatus && l.suburb === filterSuburb);
  }, [statDrillStatus, filterSuburb, leads]);

  // Reset drill when suburb filter changes
  useEffect(() => {
    setStatDrillStatus(null);
  }, [filterSuburb]);

  // Pan + zoom to a lead on the map
  const snapToLead = useCallback((lead: Lead) => {
    if (lead.lat && lead.lng && mapRef.current) {
      mapRef.current.panTo({ lat: lead.lat, lng: lead.lng });
      mapRef.current.setZoom(18);
    }
  }, []);

  // Geocode a lead on demand
  const geocodeLead = useCallback(
    (lead: Lead) => {
      if (!geocoderRef.current) return;
      if (lead.lat && lead.lng) {
        setSelectedLead(lead);
        setSidebarOpen(true);
        mapRef.current?.setCenter({ lat: lead.lat, lng: lead.lng });
        mapRef.current?.setZoom(16);
        return;
      }
      const address =
        `${lead.houseNum ?? ""} ${lead.street ?? ""} ${lead.suburb} ${lead.postcode ?? ""} Australia`.trim();
      setGeocodingId(lead.id);
      geocoderRef.current.geocode({ address }, async (results, status) => {
        setGeocodingId(null);
        if (status === "OK" && results?.[0]) {
          const loc = results[0].geometry.location;
          const updated = { ...lead, lat: loc.lat(), lng: loc.lng() };
          await saveLead(updated);
          setSelectedLead(updated);
          setSidebarOpen(true);
          mapRef.current?.setCenter({ lat: updated.lat!, lng: updated.lng! });
          mapRef.current?.setZoom(17);
        } else {
          showToast("Could not geocode this address", "error");
        }
      });
    },
    [saveLead, showToast],
  );

  // Geocode ALL unmapped leads in sequence (respects geoFilterStatus)
  const geocodeAllLeads = useCallback(async () => {
    if (!geocoderRef.current) return;
    const allUnmapped = leads.filter((l) => !l.lat || !l.lng);
    const unmapped = geoFilterStatus ? allUnmapped.filter((l) => normalizeLeadStatus(l.status) === geoFilterStatus) : allUnmapped;
    if (unmapped.length === 0) return;
    showToast(`Geocoding ${unmapped.length} leads…`, "success");
    for (const lead of unmapped) {
      await new Promise<void>((resolve) => {
        const address =
          `${lead.houseNum ?? ""} ${lead.street ?? ""} ${lead.suburb} ${lead.postcode ?? ""} Australia`.trim();
        geocoderRef.current!.geocode({ address }, async (results, status) => {
          if (status === "OK" && results?.[0]) {
            const loc = results[0].geometry.location;
            await saveLead({ ...lead, lat: loc.lat(), lng: loc.lng() });
          }
          // Rate-limit: ~1 request per 200ms to stay within quota
          setTimeout(resolve, 200);
        });
      });
    }
    showToast("✅ Geocoding complete", "success");
  }, [leads, geoFilterStatus, saveLead, showToast]);

  // Quick pin save — drops a pin instantly with no modal
  const handleQuickPinSave = useCallback(
    async (latLng: google.maps.LatLngLiteral, result: string) => {
      const lead: Lead = {
        id: generateLeadId(),
        name: "Quick Pin",
        phone: "",
        suburb: "",
        status: "DQ",
        dqRep: currentUser?.id ?? 1,
        lat: latLng.lat,
        lng: latLng.lng,
        knockResult: result,
        createdAt: Date.now(),
        leadDate: new Date().toISOString().split("T")[0],
        callHistory: [],
      };
      await saveLead(lead);
      const label = resolveKnockLabel(result, customPinTypes);
      showToast(`📍 ${label} pin dropped`, "success");
    },
    [saveLead, showToast, currentUser],
  );

  // Map click — zone drawing takes priority, then quick pin, then knock mode
  const handleMapClick = useCallback(
    (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      const latLng = { lat: e.latLng.lat(), lng: e.latLng.lng() };

      // Zone drawing mode — accumulate vertices
      if (drawingZone) {
        setDrawVertices((v) => [...v, latLng]);
        return;
      }

      // Quick pin mode — instant drop, no modal
      if (quickPinMode) {
        handleQuickPinSave(latLng, quickPinMode);
        return;
      }

      if (!knockMode) return;
      setKnockLatLng(latLng);
      setKnockAddress(null);
      if (geocoderRef.current) {
        geocoderRef.current.geocode({ location: e.latLng }, (results, status) => {
          if (status === "OK" && results?.[0]) {
            const comps = results[0].address_components;
            const get = (type: string) => comps.find((c) => c.types.includes(type))?.short_name ?? "";
            setKnockAddress({
              houseNum: get("street_number"),
              street: get("route"),
              suburb: get("locality") || get("sublocality"),
              postcode: get("postal_code"),
            });
          } else {
            setKnockAddress({});
          }
        });
      } else {
        setKnockAddress({});
      }
    },
    [knockMode, drawingZone, quickPinMode, handleQuickPinSave],
  );

  const handleKnockSave = useCallback(
    async (form: KnockForm & { lat: number; lng: number }) => {
      const lead: Lead = {
        id: generateLeadId(),
        name: form.name || "Unknown Resident",
        phone: normalizeAUPhone(form.phone),
        houseNum: form.houseNum,
        street: form.street,
        suburb: form.suburb,
        postcode: form.postcode,
        notes: form.notes,
        status: "DQ",
        dqRep: currentUser?.id ?? 1,
        lat: form.lat,
        lng: form.lng,
        knockResult: form.knockResult,
        createdAt: Date.now(),
        leadDate: new Date().toISOString().split("T")[0],
        callHistory: [],
      };
      await saveLead(lead);
      setKnockLatLng(null);
      setKnockAddress(null);
      showToast(`✅ Knock saved — ${KNOCK_LABELS[form.knockResult].replace(/^[^ ]+ /, "")}`, "success");
    },
    [saveLead, showToast, currentUser],
  );

  // Save a finished drawn zone (multi-rep)
  const handleZoneSave = useCallback(
    async ({ name, repIds, date }: { name: string; repIds: number[]; date: string }) => {
      const repNames = repIds.map((id) => reps.find((r) => r.id === id)?.name ?? `Rep ${id}`);
      // Colour based on first rep for consistency
      const color = getZoneColor(repIds[0] ?? 0);
      const zone: KnockZone = {
        id: `zone_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        name: name || undefined,
        repIds,
        repNames,
        date,
        polygon: pendingZoneVertices ?? drawVertices,
        color,
        createdAt: Date.now(),
        createdBy: currentUser?.name ?? "Unknown",
      };
      const ok = await saveZone(zone);
      if (ok) {
        showToast(`✅ Zone saved — ${repNames.join(", ")}`, "success");
        setDrawVertices([]);
        setPendingZoneVertices(null);
        setDrawingZone(false);
      } else {
        showToast("❌ Failed to save zone", "error");
      }
    },
    [reps, pendingZoneVertices, drawVertices, getZoneColor, currentUser, saveZone, showToast],
  );

  const toggleStatus = (s: LeadStatus) => {
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  };

  // Helper — get display names from a zone (supports legacy single-rep + new multi-rep)
  const getZoneRepNames = (zone: KnockZone): string[] => {
    if (zone.repNames && zone.repNames.length > 0) return zone.repNames;
    if (zone.repName) return [zone.repName];
    return [];
  };

  // ── Imperative marker clustering (replaces buggy @react-google-maps/api MarkerClusterer) ──
  // Uses @googlemaps/markerclusterer v2 which is compatible with Maps JS API v64+
  useEffect(() => {
    if (!mapRef.current || !isMapReady) return;

    // Clear previous imperative markers
    markerInstancesRef.current.forEach((m) => { m.map = null; });
    markerInstancesRef.current = [];
    clustererRef.current?.clearMarkers();

    if (visibleLeads.length === 0) return;

    // Build AdvancedMarkerElement instances for each visible geocoded lead
    const newMarkers = visibleLeads.map((lead) => {
      const color = lead.knockResult
        ? resolveKnockColor(lead.knockResult, customPinTypes)
        : getStatusColor(normalizeLeadStatus(lead.status), statusColors);

      const marker = new google.maps.marker.AdvancedMarkerElement({
        position: { lat: lead.lat!, lng: lead.lng! },
        title: lead.knockResult ? `${lead.name} — ${resolveKnockLabel(lead.knockResult, customPinTypes)}` : lead.name,
        content: markerSvgElement(color),
      });

      marker.addListener("gmpclick", () => {
        // Read from ref to avoid stale closure — leads may have updated since this effect ran
        const freshLead = leadsRef.current.find((l) => l.id === lead.id) ?? lead;
        setSelectedLead(freshLead);
        setSidebarOpen(true);
      });

      return marker;
    });

    markerInstancesRef.current = newMarkers;

    // Create or re-create the clusterer (AdvancedMarkerElement is supported by @googlemaps/markerclusterer v2)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    clustererRef.current = new GMClusterer({ map: mapRef.current, markers: newMarkers as any });

    return () => {
      clustererRef.current?.clearMarkers();
      newMarkers.forEach((m) => { m.map = null; });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleLeads, isMapReady, customPinTypes]);

  // Custom pin type management
  const handleSaveCustomPin = useCallback(
    async ({ name, color }: { name: string; color: string }) => {
      const pinType: CustomPinType = {
        id: `pin_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        name,
        color,
        createdAt: Date.now(),
        createdBy: currentUser?.name ?? "Unknown",
      };
      const ok = await saveCustomPin(pinType);
      if (ok) showToast(`✅ Pin type "${name}" created`, "success");
      else showToast("❌ Failed to save pin type", "error");
    },
    [saveCustomPin, showToast, currentUser],
  );

  const handleDeleteCustomPin = useCallback(
    async (id: string) => {
      const ok = await deleteCustomPin(id);
      if (ok) showToast("🗑️ Pin type deleted", "success");
    },
    [deleteCustomPin, showToast],
  );

  // Fullscreen — sync with native fullscreenchange event
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      const el = containerRef.current ?? document.documentElement;
      (el.requestFullscreen?.() ?? Promise.reject(new Error("not supported"))).catch(() =>
        showToast("Fullscreen not supported on this device", "error"),
      );
    } else {
      document.exitFullscreen?.();
    }
  }, [showToast]);

  // Locate Me — pan/zoom to current GPS position
  const locateMe = useCallback(() => {
    if (!navigator.geolocation) {
      showToast("Geolocation not supported", "error");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        userLocationRef.current = loc;
        localStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(loc));
        mapRef.current?.panTo(loc);
        mapRef.current?.setZoom(16);
        showToast("📍 Located you", "success");
      },
      () => showToast("📍 Could not get your location", "error"),
      { timeout: 8000, maximumAge: 10000 },
    );
  }, [showToast]);

  // ── Heatmap layer — creates/destroys based on showHeatmap toggle ──────────────
  useEffect(() => {
    if (!isMapReady || !mapRef.current) return;
    if (!showHeatmap) {
      heatmapRef.current?.setMap(null);
      heatmapRef.current = null;
      return;
    }
    const geocodedLeads = visibleLeads.filter((l) => {
      if (!l.lat || !l.lng) return false;
      if (heatmapDate && l.leadDate !== heatmapDate) return false;
      return true;
    });
    const heatmapData = geocodedLeads.map((l) => ({
      location: new window.google.maps.LatLng(l.lat!, l.lng!),
      weight: 1,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const HeatmapLayer = (window as any).google.maps.visualization?.HeatmapLayer;
    if (!HeatmapLayer) return; // visualization library not loaded yet
    if (heatmapRef.current) {
      heatmapRef.current.setData(heatmapData);
    } else {
      heatmapRef.current = new HeatmapLayer({
        data: heatmapData,
        map: mapRef.current,
        radius: 40,
        opacity: 0.7,
      });
    }
    return () => {
      heatmapRef.current?.setMap(null);
      heatmapRef.current = null;
    };
  }, [showHeatmap, visibleLeads, isMapReady, heatmapDate]);

  // ── Traffic layer — shows live traffic conditions on the map ──────────────
  useEffect(() => {
    if (!isMapReady || !mapRef.current) return;
    if (showTrafficLayer) {
      if (!trafficLayerRef.current) {
        trafficLayerRef.current = new window.google.maps.TrafficLayer();
      }
      trafficLayerRef.current.setMap(mapRef.current);
    } else {
      trafficLayerRef.current?.setMap(null);
    }
    return () => {
      trafficLayerRef.current?.setMap(null);
    };
  }, [showTrafficLayer, isMapReady]);

  // ── Route optimisation — open Google Maps directions with up to 9 geocoded leads ──
  const handleOpenRoute = useCallback(() => {
    const geocoded = visibleLeads.filter((l) => l.lat && l.lng).slice(0, 9); // origin + up to 8 waypoints
    if (geocoded.length < 2) {
      showToast("Need at least 2 geocoded leads to plan a route", "error");
      return;
    }
    const origin = `${geocoded[0].lat},${geocoded[0].lng}`;
    const destination = `${geocoded[geocoded.length - 1].lat},${geocoded[geocoded.length - 1].lng}`;
    const waypoints = geocoded
      .slice(1, -1)
      .map((l) => `${l.lat},${l.lng}`)
      .join("|");
    const url = `https://www.google.com/maps/dir/${origin}/${waypoints ? waypoints + "/" : ""}${destination}`;
    window.open(url, "_blank");
  }, [visibleLeads, showToast]);

  // ── Auto-geocode: detect newly added un-geocoded leads (small batches only) ──
  useEffect(() => {
    const ungeocodedWithAddress = leads.filter((l) => !l.lat && !l.lng && l.suburb && (l.street || l.houseNum));
    // Only auto-geocode when <= 5 are pending (avoids flooding on initial load of 2000+ leads)
    if (ungeocodedWithAddress.length > 0 && ungeocodedWithAddress.length <= 5) {
      setAutoGeocodeQueue(ungeocodedWithAddress);
    }
  }, [leads]);

  // ── Auto-geocode: process queue one at a time with 3s delay ──────────────────
  useEffect(() => {
    if (autoGeocodeQueue.length === 0 || geocodingRef.current || !isLoaded) return;
    const processNext = async () => {
      const lead = autoGeocodeQueue[0];
      if (!lead) return;
      geocodingRef.current = true;
      const address = [lead.houseNum, lead.street, lead.suburb, lead.postcode, "Australia"].filter(Boolean).join(" ");
      const geocoder = new window.google.maps.Geocoder();
      try {
        const results = await new Promise<google.maps.GeocoderResult[]>((resolve, reject) => {
          geocoder.geocode({ address }, (res, status) => {
            if (status === "OK" && res?.length) resolve(res);
            else reject(new Error(status ?? "UNKNOWN_ERROR"));
          });
        });
        const loc = results[0].geometry.location;
        await saveLead({ ...lead, lat: loc.lat(), lng: loc.lng() });
      } catch {
        // Geocode failed — skip this lead silently
      } finally {
        geocodingRef.current = false;
        setAutoGeocodeQueue((prev) => prev.slice(1));
      }
    };
    const timer = setTimeout(processNext, 3000);
    return () => clearTimeout(timer);
  }, [autoGeocodeQueue, isLoaded, saveLead]);

  if (loadError)
    return (
      <div className="flex-1 flex items-center justify-center bg-[#f0f0ee] dark:bg-[#0e0e0d] p-6">
        <div className="bg-white dark:bg-[#1a1a18] border border-[#e2e2de] dark:border-[#2e2e2b] rounded-2xl p-8 max-w-sm w-full text-center shadow-xl">
          <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
            <MapPin className="text-red-500" size={24} />
          </div>
          <h2 className="text-base font-semibold text-[#1a1a18] dark:text-[#f0f0ee] mb-2">
            Map failed to load
          </h2>
          <p className="text-xs text-[#6b6b65] dark:text-[#8a8a84] mb-3">
            Google Maps couldn't be initialised. Check that the Maps JavaScript API is enabled in your Google Cloud
            Console and that your API key is unrestricted for this domain.
          </p>
          {loadError.message && (
            <p className="text-xs text-red-500 dark:text-red-400 font-mono bg-red-50 dark:bg-red-900/20 rounded px-3 py-2 mb-4 text-left break-all">
              {loadError.message}
            </p>
          )}
          <button
            onClick={() => window.location.reload()}
            className="w-full py-2 rounded-lg bg-[#b8933a] text-white text-sm font-semibold hover:bg-[#d4aa55] transition"
          >
            Retry
          </button>
        </div>
      </div>
    );

  if (!isLoaded)
    return <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Loading Maps…</div>;

  const allUnmapped = leads.filter((l) => !l.lat || !l.lng);
  const filteredUnmapped = geoFilterStatus ? allUnmapped.filter((l) => normalizeLeadStatus(l.status) === geoFilterStatus) : allUnmapped;
  const unmappedCount = allUnmapped.length;

  return (
    <div ref={containerRef} className="h-full w-full overflow-hidden relative">
      {/* Map — fills entire container */}
      <div className="absolute inset-0 h-full w-full">
        {/* ── Floating toolbar ──────────────────────────────────────────── */}
        {overlaysVisible && (
          <div className="absolute top-3 left-3 right-3 z-20 flex flex-col gap-2 pointer-events-none">
            {/* Row 1: Search / filters (left) + action icons (right) */}
            <div className="flex items-stretch gap-2">
              {/* Filter pill */}
              <div className="flex items-center bg-[#111110]/90 backdrop-blur-md border border-white/[0.07] rounded-2xl shadow-2xl overflow-hidden pointer-events-auto min-w-0">
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <Search size={13} className="text-gray-500 flex-shrink-0" />
                  <input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search…"
                    className="bg-transparent text-gray-100 text-sm placeholder-gray-600 outline-none w-28"
                  />
                </div>
                <div className="self-stretch w-px bg-white/[0.07]" />
                <select
                  value={filterRep}
                  onChange={(e) => setFilterRep(e.target.value ? Number(e.target.value) : "")}
                  className="px-3 py-2.5 bg-transparent text-gray-300 text-sm outline-none cursor-pointer appearance-none"
                >
                  <option value="" className="bg-[#1a1a18]">
                    All Reps
                  </option>
                  {activeReps.map((r) => (
                    <option key={r.id} value={r.id} className="bg-[#1a1a18]">
                      {r.name}
                    </option>
                  ))}
                </select>
                <div className="self-stretch w-px bg-white/[0.07]" />
                <select
                  value={filterSuburb}
                  onChange={(e) => setFilterSuburb(e.target.value)}
                  className="px-3 py-2.5 bg-transparent text-gray-300 text-sm outline-none cursor-pointer appearance-none"
                >
                  <option value="" className="bg-[#1a1a18]">
                    All Suburbs
                  </option>
                  {suburbs.map((s) => (
                    <option key={s} value={s} className="bg-[#1a1a18]">
                      {s}
                    </option>
                  ))}
                </select>
                <div className="self-stretch w-px bg-white/[0.07]" />
                <span className="px-3 text-xs text-gray-500 whitespace-nowrap">
                  {visibleLeads.length} pins{unmappedCount > 0 ? ` · ${unmappedCount} ⚠` : ""}
                </span>
              </div>

              <div className="flex-1" />

              {/* Action icon buttons */}
              <div className="flex items-center gap-0.5 bg-[#111110]/90 backdrop-blur-md border border-white/[0.07] rounded-2xl px-1.5 py-1.5 shadow-2xl pointer-events-auto flex-shrink-0">
                <button
                  onClick={() => setShowZoneLibrary((v) => !v)}
                  title="Zone Library"
                  className={`flex items-center gap-1.5 p-2 rounded-xl transition text-xs font-medium ${showZoneLibrary ? "bg-amber-500/20 text-amber-400" : "text-gray-400 hover:bg-white/[0.06] hover:text-gray-200"}`}
                >
                  <Layers size={15} />
                  {allZones.length > 0 && (
                    <span className="w-4 h-4 bg-amber-500 text-white rounded-full text-[10px] flex items-center justify-center font-bold leading-none">
                      {allZones.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setShowMapControls((v) => !v)}
                  title="Map Controls"
                  className={`flex items-center gap-1.5 p-2 rounded-xl transition text-xs font-medium ${showMapControls || showHeatmap || showTrafficLayer || knockMode ? "bg-amber-500/20 text-amber-400" : "text-gray-400 hover:bg-white/[0.06] hover:text-gray-200"}`}
                >
                  <SlidersHorizontal size={15} />
                  {(showHeatmap || showTrafficLayer || knockMode) && (
                    <span className="w-1.5 h-1.5 bg-amber-400 rounded-full" />
                  )}
                </button>
                <button
                  onClick={handleOpenRoute}
                  title="Open optimised route in Google Maps (up to 9 geocoded leads)"
                  className="p-2 rounded-xl text-gray-400 hover:bg-white/[0.06] hover:text-gray-200 transition"
                >
                  <Navigation size={15} />
                </button>
                <div className="w-px self-stretch bg-white/[0.07] mx-0.5" />
                <button
                  onClick={() => setOverlaysVisible(false)}
                  title="Clean View — hide all overlays"
                  className="p-2 rounded-xl text-gray-400 hover:bg-white/[0.06] hover:text-gray-200 transition"
                >
                  <EyeOff size={15} />
                </button>
                <button
                  onClick={toggleFullscreen}
                  title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                  className="p-2 rounded-xl text-gray-400 hover:bg-white/[0.06] hover:text-gray-200 transition"
                >
                  {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                </button>
              </div>
            </div>

            {/* Map Controls panel */}
            {showMapControls && (
              <div className="flex items-center gap-2 flex-wrap pointer-events-auto">
                <div className="flex items-center gap-1 bg-[#111110]/90 backdrop-blur-md border border-white/[0.07] rounded-2xl px-2 py-1.5 shadow-2xl">
                  {/* Heatmap */}
                  <button
                    onClick={() => setShowHeatmap((h) => !h)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition ${showHeatmap ? "bg-orange-500/20 text-orange-400" : "text-gray-400 hover:bg-white/[0.06] hover:text-gray-200"}`}
                  >
                    <Thermometer size={13} />
                    Heatmap
                  </button>
                  {showHeatmap && (
                    <div className="flex items-center gap-1 pl-1">
                      <input
                        type="date"
                        value={heatmapDate}
                        onChange={(e) => setHeatmapDate(e.target.value)}
                        title="Filter heatmap to a specific date"
                        className="bg-white/[0.08] text-gray-300 text-xs rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-amber-400 w-28"
                      />
                      {heatmapDate && (
                        <button onClick={() => setHeatmapDate("")} className="text-gray-500 hover:text-gray-200 transition p-0.5">
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  )}
                  <div className="w-px self-stretch bg-white/[0.07] mx-0.5" />
                  {/* Traffic */}
                  <button
                    onClick={() => setShowTrafficLayer((t) => !t)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition ${showTrafficLayer ? "bg-blue-500/20 text-blue-400" : "text-gray-400 hover:bg-white/[0.06] hover:text-gray-200"}`}
                  >
                    <Car size={13} />
                    Traffic
                  </button>
                  <div className="w-px self-stretch bg-white/[0.07] mx-0.5" />
                  {/* Knock Mode */}
                  <button
                    onClick={() => {
                      const entering = !knockMode;
                      setKnockMode(entering);
                      setShowKnockOnly(entering);
                      if (!entering) {
                        setKnockLatLng(null);
                        setDrawingZone(false);
                        setDrawVertices([]);
                      }
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition ${knockMode ? "bg-amber-500/20 text-amber-400" : "text-gray-400 hover:bg-white/[0.06] hover:text-gray-200"}`}
                  >
                    <MapPin size={13} />
                    {knockMode ? "Exit Knock" : "Knock Mode"}
                  </button>
                </div>
                {/* Zone drawing — shown when in knock mode */}
                {knockMode && !drawingZone && (
                  <button
                    onClick={() => setDrawingZone(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-2xl text-sm font-medium bg-[#111110]/90 backdrop-blur-md border border-white/[0.07] text-gray-300 hover:text-amber-400 hover:border-amber-500/30 shadow-2xl transition"
                  >
                    <PenLine size={14} /> Draw Zone
                  </button>
                )}
                {knockMode && drawingZone && (
                  <>
                    <span className="text-xs font-medium text-amber-400 bg-[#111110]/90 backdrop-blur-md border border-white/[0.07] rounded-2xl px-3 py-2 shadow-2xl">
                      {drawVertices.length} pts
                    </span>
                    {drawVertices.length > 0 && (
                      <button
                        onClick={() => setDrawVertices((v) => v.slice(0, -1))}
                        className="flex items-center gap-1 px-3 py-2 rounded-2xl text-sm font-medium bg-[#111110]/90 backdrop-blur-md border border-white/[0.07] text-gray-300 hover:text-white shadow-2xl transition"
                      >
                        <Undo2 size={13} /> Undo
                      </button>
                    )}
                    {drawVertices.length >= 3 && (
                      <button
                        onClick={() => setPendingZoneVertices(drawVertices)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-2xl text-sm font-semibold bg-green-600 text-white hover:bg-green-500 shadow-2xl transition"
                      >
                        Finish Zone
                      </button>
                    )}
                    <button
                      onClick={() => { setDrawingZone(false); setDrawVertices([]); }}
                      className="flex items-center gap-1 px-3 py-2 rounded-2xl text-sm font-medium bg-[#111110]/90 backdrop-blur-md border border-red-500/20 text-red-400 hover:text-red-300 shadow-2xl transition"
                    >
                      <X size={13} /> Cancel
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Row 2: Status chips */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Status chips */}
              <div className="flex items-center gap-0.5 bg-[#111110]/90 backdrop-blur-md border border-white/[0.07] rounded-2xl px-2 py-1.5 shadow-2xl pointer-events-auto flex-wrap">
                {ALL_STATUSES.map((s) => {
                  const col = getStatusColor(s, statusColors);
                  const active = !showKnockOnly && activeStatuses.has(s);
                  return (
                    <button
                      key={s}
                      onClick={() => {
                        setShowKnockOnly(false);
                        toggleStatus(s);
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium transition"
                      style={active ? { backgroundColor: col + "28", color: col } : { color: "#6b7280" }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: col, opacity: active ? 1 : 0.4 }}
                      />
                      {s}
                    </button>
                  );
                })}
                <div className="w-px self-stretch bg-white/[0.07] mx-1" />
                <button
                  onClick={() => setShowKnockOnly((v) => !v)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium transition ${showKnockOnly ? "bg-white/[0.1] text-gray-200" : "text-gray-500 hover:text-gray-300"}`}
                >
                  <MapPin size={11} />
                  Knock Pins
                </button>
              </div>

            </div>
          </div>
        )}{" "}
        {/* end floating toolbar */}
        {/* Floating restore bar — shown when overlays are hidden */}
        {!overlaysVisible && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2">
            <button
              onClick={() => setOverlaysVisible(true)}
              className="flex items-center gap-2 bg-white dark:bg-[var(--surface)] border border-gray-200 dark:border-white/[0.06] rounded-full shadow-xl px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:text-amber-600 dark:hover:text-amber-400 transition"
            >
              <Eye size={14} className="text-amber-500" />
              Show Overlays
            </button>
            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              className="flex items-center gap-1.5 bg-white dark:bg-[var(--surface)] border border-gray-200 dark:border-white/[0.06] rounded-full shadow-xl px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:text-amber-600 transition"
            >
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>
        )}
        {knockMode && !drawingZone && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-amber-500 text-white px-4 py-2 rounded-full text-sm font-semibold shadow-lg pointer-events-none">
            🚪 Knock Mode — click the map to log a door knock
          </div>
        )}
        {drawingZone && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-green-600 text-white px-4 py-2 rounded-full text-sm font-semibold shadow-lg pointer-events-none">
            ✏️ Drawing Zone — click to add points ({drawVertices.length} so far)
          </div>
        )}
        {quickPinMode && !drawingZone && (
          <div
            className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-4 py-2 rounded-full text-sm font-semibold shadow-lg pointer-events-none text-white"
            style={{ backgroundColor: resolveKnockColor(quickPinMode, customPinTypes) }}
          >
            📍 Quick Pin — tap anywhere to drop a {resolveKnockLabel(quickPinMode, customPinTypes)} pin
          </div>
        )}
        <GoogleMap
          mapContainerStyle={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          center={center}
          zoom={13}
          onLoad={onMapLoad}
          onClick={handleMapClick}
          options={{
            mapTypeId: "hybrid",
            mapTypeControl: true,
            mapTypeControlOptions: {
              position: 3, // TOP_RIGHT
              mapTypeIds: ["hybrid", "satellite", "roadmap"],
            },
            streetViewControl: false,
            fullscreenControl: true,
            clickableIcons: false,
            draggableCursor: knockMode || drawingZone || quickPinMode ? "crosshair" : undefined,
            ...(MAPS_MAP_ID ? { mapId: MAPS_MAP_ID } : {}),
          }}
        >
          {/* Saved knock zones */}
          {filteredZones.map((zone) => (
            <React.Fragment key={zone.id}>
              <Polygon
                paths={zone.polygon}
                options={{
                  strokeColor: zone.color,
                  strokeOpacity: 0.85,
                  strokeWeight: 2,
                  fillColor: zone.color,
                  fillOpacity: 0.13,
                  clickable: false,
                }}
              />
              {zone.polygon.length >= 3 && (
                <OverlayView position={centroid(zone.polygon)} mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}>
                  <div
                    className="px-2 py-0.5 rounded-full text-xs font-semibold shadow-md pointer-events-none whitespace-nowrap select-none"
                    style={{
                      background: "rgba(15,23,42,0.82)",
                      color: zone.color,
                      border: `1px solid ${zone.color}55`,
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    {getZoneRepNames(zone).join(", ")} · {fmtZoneDate(zone.date)}
                    {zone.name ? ` · ${zone.name}` : ""}
                  </div>
                </OverlayView>
              )}
            </React.Fragment>
          ))}

          {/* Active drawing preview polygon */}
          {drawVertices.length >= 2 && (
            <Polygon
              paths={drawVertices}
              options={{
                strokeColor: "#22c55e",
                strokeOpacity: 0.9,
                strokeWeight: 2.5,
                fillColor: "#22c55e",
                fillOpacity: 0.15,
                clickable: false,
              }}
            />
          )}
          {/* Vertex dots for active drawing */}
          {drawVertices.map((v, i) => (
            <Marker
              key={`v-${i}`}
              position={v}
              icon={{
                url: markerSvgUrl("#22c55e"),
                scaledSize: new google.maps.Size(14, 21),
              }}
              title={`Point ${i + 1}`}
              clickable={false}
            />
          ))}

          {/* Lead markers are managed imperatively via useEffect + @googlemaps/markerclusterer
              to avoid the crash in the bundled MarkerClustererPlus with Maps JS API v64+ */}
        </GoogleMap>
        {/* Lead Sidebar — full profile */}
        {selectedLead && sidebarOpen && (
          <LeadSidebar
            lead={selectedLead}
            onClose={() => {
              setSidebarOpen(false);
              setSelectedLead(null);
            }}
            onSave={async (updated) => {
              const ok = await saveLead(updated);
              if (!ok) {
                showToast("Failed to save lead", "error");
                return false;
              }

              setSelectedLead(updated);
              showToast("✅ Lead saved", "success");
              return true;
            }}
            onDelete={async (lead) => {
              await deleteLead(lead.id);
              setSidebarOpen(false);
              setSelectedLead(null);
              showToast("🗑️ Lead deleted", "success");
            }}
            onCall={(lead) => {
              setSelectedLead(lead);
              setShowCallLogger(true);
            }}
            customPinTypes={customPinTypes}
          />
        )}
        {/* Call Logger */}
        {selectedLead && showCallLogger && (
          <CallLogger
            lead={selectedLead}
            isOpen={showCallLogger}
            onClose={() => setShowCallLogger(false)}
            onSave={async (updated) => {
              await saveLead(updated);
              setSelectedLead(updated);
              setShowCallLogger(false);
              showToast("✅ Call logged", "success");
            }}
          />
        )}
        {/* Suburb stats panel — hidden when overlays off, positioned below floating toolbar */}
        {overlaysVisible && suburbStats && filterSuburb && (
          <div className="absolute right-3 z-10 w-56" style={{ top: "112px" }}>
            <div className="bg-[#111110]/90 backdrop-blur-md border border-white/[0.07] rounded-2xl shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.07]">
                <p className="font-semibold text-white text-sm flex items-center gap-1.5">
                  <MapPin size={12} className="text-amber-400" />
                  {filterSuburb}
                </p>
                {statDrillStatus && (
                  <button
                    onClick={() => setStatDrillStatus(null)}
                    className="text-gray-500 hover:text-gray-200 transition p-0.5"
                    title="Clear selection"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Stats grid — each status cell is tappable */}
              <div className="grid grid-cols-3">
                {(
                  [
                    { label: "Total", value: suburbStats.total, status: null, color: "#f0f0ee" },
                    { label: "DQ", value: suburbStats.counts["DQ"] ?? 0, status: "DQ" as LeadStatus, color: "#60a5fa" },
                    {
                      label: "Booked",
                      value: suburbStats.counts["Booked"] ?? 0,
                      status: "Booked" as LeadStatus,
                      color: "#f59e0b",
                    },
                    {
                      label: "Revisit",
                      value: suburbStats.counts["Revisit"] ?? 0,
                      status: "Revisit" as LeadStatus,
                      color: "#facc15",
                    },
                    {
                      label: "N/I",
                      value: suburbStats.counts["Not Interested"] ?? 0,
                      status: "Not Interested" as LeadStatus,
                      color: "#f87171",
                    },
                    {
                      label: "Conv%",
                      value:
                        suburbStats.total > 0
                          ? `${(((suburbStats.counts["Booked"] ?? 0) / suburbStats.total) * 100).toFixed(0)}%`
                          : "0%",
                      status: null,
                      color: "#4ade80",
                    },
                  ] as { label: string; value: string | number; status: LeadStatus | null; color: string }[]
                ).map(({ label, value, status, color }) => {
                  const isActive = statDrillStatus === status && status !== null;
                  const isClickable = status !== null && (suburbStats.counts[status] ?? 0) > 0;
                  return (
                    <button
                      key={label}
                      onClick={() => (isClickable ? setStatDrillStatus(isActive ? null : status) : undefined)}
                      disabled={!isClickable}
                      className={`flex flex-col items-center py-3 transition border-b border-r border-white/[0.04] last:border-r-0 ${
                        isActive
                          ? "bg-white/[0.1]"
                          : isClickable
                            ? "hover:bg-white/[0.05] cursor-pointer"
                            : "cursor-default opacity-70"
                      }`}
                    >
                      <span className="text-base font-bold leading-none" style={{ color }}>
                        {value}
                      </span>
                      <span className="text-[10px] text-gray-500 mt-1 uppercase tracking-wide">{label}</span>
                      {isClickable && <span className="text-[9px] text-gray-600 mt-0.5">tap to list</span>}
                    </button>
                  );
                })}
              </div>

              {/* Drill-down lead list */}
              {statDrillStatus && (
                <div className="border-t border-white/[0.07]">
                  {drillLeads.length === 0 ? (
                    <p className="text-xs text-gray-500 text-center py-4 px-3">No leads found</p>
                  ) : (
                    <div className="max-h-52 overflow-y-auto scrollbar-none">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wide px-3 pt-2 pb-1">
                        {drillLeads.length} {statDrillStatus} lead{drillLeads.length !== 1 ? "s" : ""} — tap to snap
                      </p>
                      {drillLeads.map((lead) => (
                        <button
                          key={lead.id}
                          onClick={() => snapToLead(lead)}
                          className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.05] transition text-left ${!lead.lat || !lead.lng ? "opacity-40" : ""}`}
                          title={!lead.lat || !lead.lng ? "Not geocoded — cannot snap" : `Snap to ${lead.name}`}
                        >
                          <Navigation size={11} className="text-amber-400 flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-white text-xs font-medium truncate">{lead.name}</p>
                            <p className="text-gray-500 text-[10px] truncate">
                              {[lead.houseNum, lead.street].filter(Boolean).join(" ") || "No address"}
                            </p>
                          </div>
                          {lead.lat && lead.lng && <span className="text-[9px] text-amber-500 flex-shrink-0">📍</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        {/* Zone Library panel — hidden when overlays off */}
        {overlaysVisible && showZoneLibrary && (
          <div className="absolute top-0 right-0 bottom-0 w-72 bg-white dark:bg-[var(--surface)] border-l border-gray-200 dark:border-white/[0.06] z-20 flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-white/[0.06]">
              <span className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Layers size={15} className="text-amber-500" /> Zone Library
              </span>
              <button
                onClick={() => setShowZoneLibrary(false)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-[var(--hover)] rounded transition text-gray-400"
              >
                <X size={15} />
              </button>
            </div>
            {/* Date range filter */}
            <div className="px-4 py-3 border-b border-gray-100 dark:border-white/[0.06] space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Filter by Date</p>
              <div className="flex gap-2 items-center">
                <input
                  type="date"
                  value={zoneFromDate}
                  onChange={(e) => setZoneFromDate(e.target.value)}
                  className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                />
                <span className="text-gray-400 text-xs">→</span>
                <input
                  type="date"
                  value={zoneToDate}
                  onChange={(e) => setZoneToDate(e.target.value)}
                  className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                />
              </div>
              {(zoneFromDate || zoneToDate) && (
                <button
                  onClick={() => {
                    setZoneFromDate("");
                    setZoneToDate("");
                  }}
                  className="text-xs text-amber-600 dark:text-amber-400 hover:underline"
                >
                  Clear dates
                </button>
              )}
            </div>
            {/* Zone list */}
            <div className="flex-1 overflow-y-auto">
              {filteredZones.length === 0 ? (
                <p className="text-xs text-gray-400 text-center mt-8 px-4">
                  No zones found{zoneFromDate || zoneToDate ? " in date range" : ""}.<br />
                  Draw one in Knock Mode.
                </p>
              ) : (
                <ul className="divide-y divide-gray-100 dark:divide-slate-800">
                  {filteredZones.map((zone) => (
                    <li
                      key={zone.id}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-[var(--hover)]/50 transition group"
                    >
                      <span
                        className="mt-1 w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: zone.color }}
                      />
                      <div className="flex-1 min-w-0">
                        {zone.name && (
                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{zone.name}</p>
                        )}
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          {getZoneRepNames(zone).join(", ") || "—"}
                        </p>
                        <p className="text-xs text-gray-400">
                          {fmtZoneDate(zone.date)} · {zone.polygon.length} pts
                        </p>
                      </div>
                      <button
                        onClick={async () => {
                          await deleteZone(zone.id);
                          showToast("🗑️ Zone deleted", "success");
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition flex-shrink-0"
                        title="Delete zone"
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="px-4 py-3 border-t border-gray-100 dark:border-white/[0.06]">
              <p className="text-xs text-gray-400">
                {filteredZones.length} / {allZones.length} zone{allZones.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        )}
        {/* Locate Me button — hidden when overlays off */}
        {overlaysVisible && (
          <button
            onClick={locateMe}
            className="absolute bottom-24 right-3 z-10 bg-white dark:bg-[var(--surface)] border border-gray-200 dark:border-white/[0.06] rounded-xl shadow-lg px-3 py-2.5 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:border-amber-400 hover:text-amber-600 dark:hover:text-amber-400 transition"
            title="Pan to my current location"
          >
            <Navigation size={15} className="text-amber-500" />
            <span className="hidden sm:inline">Locate Me</span>
          </button>
        )}
        {/* Pin legend + quick-add widget — hidden when overlays off */}
        {overlaysVisible && (
          <PinLegend
            quickPinMode={quickPinMode}
            customPinTypes={customPinTypes}
            isAdmin={currentUser?.role === "admin"}
            onSelectQuickPin={(r) => {
              setQuickPinMode(r);
              // Exit knock mode so clicks go to quick-pin handler instead
              setKnockMode(false);
              setDrawingZone(false);
            }}
            onClearQuickPin={() => setQuickPinMode(null)}
            onSaveCustomPin={handleSaveCustomPin}
            onDeleteCustomPin={handleDeleteCustomPin}
          />
        )}
        {/* Unmapped leads panel — hidden when overlays off */}
        {overlaysVisible && unmappedCount > 0 && (
          <div className="absolute bottom-4 left-4 sm:left-4 bg-white dark:bg-[var(--surface)] rounded-xl shadow-lg border border-gray-200 dark:border-white/[0.06] p-3 z-10 max-w-xs">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2 flex items-center gap-1">
              <Crosshair size={11} />
              {unmappedCount} lead{unmappedCount !== 1 ? "s" : ""} not geocoded
            </p>
            {/* Status filter chips */}
            <div className="flex flex-wrap gap-1 mb-2">
              <button
                onClick={() => setGeoFilterStatus("")}
                className={`px-2 py-0.5 rounded-full text-xs font-medium border transition ${
                  geoFilterStatus === ""
                    ? "bg-gray-700 text-white border-gray-700 dark:bg-gray-500 dark:border-gray-500"
                    : "border-gray-300 dark:border-white/[0.08] text-gray-500 dark:text-gray-400"
                }`}
              >
                All ({unmappedCount})
              </button>
              {(["DQ", "Booked", "Revisit", "Not Interested", "Wrong Number", "No Answer"] as LeadStatus[]).map((s) => {
                const cnt = allUnmapped.filter((l) => normalizeLeadStatus(l.status) === s).length;
                if (cnt === 0) return null;
                return (
                  <button
                    key={s}
                    onClick={() => setGeoFilterStatus(s)}
                    className={`px-2 py-0.5 rounded-full text-xs font-medium border transition ${
                      geoFilterStatus === s
                        ? "bg-amber-500 text-white border-amber-500"
                        : "border-gray-300 dark:border-white/[0.08] text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    {s} ({cnt})
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const lead = filteredUnmapped[0];
                  if (lead) geocodeLead(lead);
                }}
                disabled={geocodingId !== null || filteredUnmapped.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-[var(--surface)] text-gray-700 dark:text-gray-300 text-xs font-medium hover:bg-gray-200 dark:hover:bg-[var(--hover)] disabled:opacity-50 transition"
              >
                <Navigation size={12} />
                {geocodingId ? "Geocoding…" : "Next"}
              </button>
              <button
                onClick={geocodeAllLeads}
                disabled={geocodingId !== null || filteredUnmapped.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-medium hover:bg-amber-400 disabled:opacity-50 transition"
              >
                <Navigation size={12} />
                All ({filteredUnmapped.length})
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Knock modal */}
      {knockLatLng && (
        <KnockModal
          latLng={knockLatLng}
          geocodedAddress={knockAddress}
          onClose={() => {
            setKnockLatLng(null);
            setKnockAddress(null);
          }}
          onSave={handleKnockSave}
        />
      )}

      {/* Zone save modal — triggered after finishing a drawn zone */}
      {pendingZoneVertices && (
        <KnockZoneModal
          vertices={pendingZoneVertices}
          reps={activeReps}
          onClose={() => {
            setPendingZoneVertices(null);
            setDrawVertices([]);
            setDrawingZone(false);
          }}
          onSave={handleZoneSave}
        />
      )}
    </div>
  );
}

export default MapPage;
