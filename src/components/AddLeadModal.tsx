import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Lead } from '../types';
import { useAppStore } from '../stores/appStore';
import { useLeads } from '../hooks/useFirebase';
import { sanitizePhone } from '../lib/utils';
import { SuburbInput } from './SuburbInput';
import { X, UserPlus } from 'lucide-react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyWindow = Window & { google?: any };

interface AddLeadModalProps {
  onClose: () => void;
  onSave: (lead: Lead) => void;
}

const EMPTY: Partial<Lead> = {
  name: '',
  phone: '',
  email: '',
  houseNum: '',
  street: '',
  suburb: '',
  postcode: '',
  ownership: '',
  superannuation: '',
  status: 'DQ',
  leadDate: new Date().toISOString().split('T')[0],
};

function validateAUPhone(raw: string): { valid: boolean; formatted: string } {
  const digits = raw.replace(/\D/g, '');
  // AU mobile: 04XX XXX XXX (10 digits starting with 04)
  if (digits.length === 10 && digits.startsWith('04')) {
    const formatted = `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
    return { valid: true, formatted };
  }
  // Landline: 08 XXXX XXXX etc
  if (digits.length === 10) {
    const formatted = `${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}`;
    return { valid: true, formatted };
  }
  // International: +61...
  if (digits.startsWith('61') && digits.length === 11) {
    const local = '0' + digits.slice(2);
    const formatted = `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
    return { valid: true, formatted };
  }
  return { valid: false, formatted: raw };
}

export function AddLeadModal({ onClose, onSave }: AddLeadModalProps) {
  const { reps, currentUser } = useAppStore();
  const { leads: existingLeads } = useLeads();

  const [form, setForm] = useState<Partial<Lead>>({
    ...EMPTY,
    dqRep: currentUser?.id,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [phoneError, setPhoneError] = useState('');

  const addressInputRef = useRef<HTMLInputElement>(null);

  // --- Google Places Autocomplete ---
  useEffect(() => {
    const w = window as AnyWindow;
    const initAutocomplete = () => {
      if (!addressInputRef.current || !w.google?.maps?.places) return;
      const autocomplete = new w.google.maps.places.Autocomplete(addressInputRef.current, {
        componentRestrictions: { country: 'au' },
        fields: ['address_components', 'geometry'],
        types: ['address'],
      });
      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (!place.address_components) return;
        let houseNum = '', street = '', suburb = '', postcode = '';
        for (const comp of place.address_components) {
          const type = comp.types[0];
          if (type === 'street_number') houseNum = comp.long_name;
          else if (type === 'route') street = comp.long_name;
          else if (type === 'locality') suburb = comp.long_name;
          else if (type === 'postal_code') postcode = comp.long_name;
        }
        setForm((prev) => ({ ...prev, houseNum, street, suburb, postcode }));
      });
    };

    if (w.google?.maps?.places) {
      initAutocomplete();
    } else {
      const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
      if (!existingScript) {
        const apiKey = import.meta.env.VITE_GOOGLE_PLACES_API_KEY ?? import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
        if (!apiKey) return;
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
        script.async = true;
        script.onload = initAutocomplete;
        document.head.appendChild(script);
      } else {
        // Script already loading — poll until Places is available
        const poll = setInterval(() => {
          if (w.google?.maps?.places) {
            clearInterval(poll);
            initAutocomplete();
          }
        }, 200);
        return () => clearInterval(poll);
      }
    }
  }, []);

  // --- Duplicate address detection ---
  const existingAddressKeys = useMemo(() => {
    const keys = new Set<string>();
    existingLeads.forEach((l) => {
      const key = `${l.houseNum ?? ''} ${l.street ?? ''} ${l.suburb ?? ''}`
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
      if (key.replace(/\s/g, '')) keys.add(key);
    });
    return keys;
  }, [existingLeads]);

  const isDuplicateAddress = useMemo(() => {
    if (!form.suburb?.trim()) return false;
    const key = `${form.houseNum ?? ''} ${form.street ?? ''} ${form.suburb ?? ''}`
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');
    return existingAddressKeys.has(key);
  }, [form.houseNum, form.street, form.suburb, existingAddressKeys]);

  const activeReps = reps.filter((r) => r.active !== false);
  const formerReps = reps.filter((r) => r.active === false);

  const update = (field: keyof Lead, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => { const e = { ...prev }; delete e[field]; return e; });
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.name?.trim()) e.name = 'Name is required';
    if (!form.phone?.trim()) e.phone = 'Contact number is required';
    if (!form.suburb?.trim()) e.suburb = 'Suburb is required';
    if (!form.dqRep) e.dqRep = 'Rep is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (phoneError) return;
    if (!validate()) return;
    const newLead: Lead = {
      id: Date.now(),
      name: form.name!.trim(),
      phone: form.phone!.trim(),
      email: form.email?.trim() || undefined,
      houseNum: form.houseNum?.trim() || undefined,
      street: form.street?.trim() || undefined,
      suburb: form.suburb!.trim(),
      postcode: form.postcode?.trim() || undefined,
      ownership: form.ownership || undefined,
      superannuation: form.superannuation || undefined,
      dqRep: form.dqRep!,
      status: form.status || 'DQ',
      leadDate: form.leadDate,
      createdAt: Date.now(),
      callHistory: [],
    };
    onSave(newLead);
    onClose();
  };

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserPlus size={18} className="text-amber-500" />
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Add New Lead</h2>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded transition text-gray-500">
              <X size={18} />
            </button>
          </div>

          <div className="px-6 py-5 space-y-4">
            {/* Contact */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Full Name *</Label>
                <input
                  className={inputCls(!!errors.name)}
                  placeholder="John Smith"
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                  autoFocus
                />
                {errors.name && <Err>{errors.name}</Err>}
              </div>

              <div>
                <Label>Contact Number *</Label>
                <input
                  className={inputCls(!!errors.phone || !!phoneError)}
                  placeholder="04xx xxx xxx"
                  value={form.phone}
                  onChange={(e) => {
                    update('phone', sanitizePhone(e.target.value));
                    if (phoneError) setPhoneError('');
                  }}
                  onBlur={(e) => {
                    const { valid, formatted } = validateAUPhone(e.target.value);
                    if (!valid && e.target.value.trim()) {
                      setPhoneError('Enter a valid AU phone number (e.g. 0412 345 678)');
                    } else {
                      setPhoneError('');
                      setForm((prev) => ({ ...prev, phone: formatted }));
                    }
                  }}
                />
                {phoneError && <p className="text-xs text-red-500 mt-1">{phoneError}</p>}
                {errors.phone && !phoneError && <Err>{errors.phone}</Err>}
              </div>

              <div>
                <Label>Email</Label>
                <input
                  className={inputCls(false)}
                  placeholder="optional"
                  value={form.email}
                  onChange={(e) => update('email', e.target.value)}
                />
              </div>
            </div>

            {/* Address */}
            <div className="grid grid-cols-4 gap-3">
              {/* Google Places address search */}
              <div className="col-span-4">
                <Label>Address Search</Label>
                <input
                  ref={addressInputRef}
                  type="text"
                  placeholder="Start typing address for autocomplete…"
                  className={inputCls(false)}
                />
                <p className="text-xs text-gray-400 mt-1">Or fill fields manually below</p>
              </div>

              <div>
                <Label>House #</Label>
                <input
                  className={inputCls(false)}
                  value={form.houseNum}
                  onChange={(e) => update('houseNum', e.target.value)}
                />
              </div>
              <div className="col-span-3">
                <Label>Street</Label>
                <input
                  className={inputCls(false)}
                  placeholder="Street name"
                  value={form.street}
                  onChange={(e) => update('street', e.target.value)}
                />
              </div>
              <div className="col-span-3">
                <Label>Suburb *</Label>
                <SuburbInput
                  value={form.suburb ?? ''}
                  onChange={(v) => update('suburb', v)}
                  className={inputCls(!!errors.suburb)}
                  placeholder="Suburb"
                />
                {errors.suburb && <Err>{errors.suburb}</Err>}
              </div>
              <div>
                <Label>Postcode</Label>
                <input
                  className={inputCls(false)}
                  placeholder="3000"
                  value={form.postcode}
                  onChange={(e) => update('postcode', e.target.value)}
                />
              </div>

              {/* Duplicate address warning */}
              {isDuplicateAddress && (
                <div className="col-span-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-400 text-xs">
                  ⚠️ This address may already exist in leads. You can still save.
                </div>
              )}
            </div>

            {/* Lead details */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Rep Name *</Label>
                <select
                  className={inputCls(!!errors.dqRep)}
                  value={form.dqRep || ''}
                  onChange={(e) => update('dqRep', Number(e.target.value))}
                >
                  <option value="">— Select Rep —</option>
                  {activeReps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  {formerReps.length > 0 && (
                    <optgroup label="── Former Staff ──">
                      {formerReps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </optgroup>
                  )}
                </select>
                {errors.dqRep && <Err>{errors.dqRep}</Err>}
              </div>

              <div>
                <Label>Lead Status</Label>
                <select className={inputCls(false)} value={form.status} onChange={(e) => update('status', e.target.value)}>
                  {['DQ', 'Booked', 'Revisit', 'Not Interested', 'Wrong Number', 'No Answer'].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Renter/Owner</Label>
                <select className={inputCls(false)} value={form.ownership || ''} onChange={(e) => update('ownership', e.target.value)}>
                  <option value="">—</option>
                  <option>Renter</option>
                  <option>Owner</option>
                </select>
              </div>

              <div>
                <Label>Superannuation</Label>
                <select className={inputCls(false)} value={form.superannuation || ''} onChange={(e) => update('superannuation', e.target.value)}>
                  <option value="">—</option>
                  <option>$0-75k</option>
                  <option>$75k to 150k</option>
                  <option>$150k+</option>
                  <option>Other</option>
                </select>
              </div>

              <div>
                <Label>Lead Date</Label>
                <input type="date" className={inputCls(false)} value={form.leadDate} onChange={(e) => update('leadDate', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-gray-50 dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700 px-6 py-4 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-slate-700 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex-1 py-2 rounded-lg bg-amber-500 text-white font-semibold hover:bg-amber-400 transition"
            >
              Add Lead
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

const inputCls = (hasError: boolean) =>
  `w-full px-3 py-2 rounded-lg border ${hasError ? 'border-red-500' : 'border-gray-300 dark:border-slate-600'} bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400`;

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{children}</label>;
}

function Err({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-red-500 mt-1">{children}</p>;
}

export default AddLeadModal;
