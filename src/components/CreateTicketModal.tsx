import { Paperclip, Trash2, UploadCloud, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useToast } from '../components/ToastContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { Asset, Department, DropdownOption, Location, User } from '../types.ts';

interface CreateTicketModalProps {
  open: boolean;
  user: User;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateTicketModal({ open, user, onClose, onCreated }: CreateTicketModalProps) {
  const { showToast } = useToast();
  const [categories, setCategories] = useState<DropdownOption[]>([]);
  const [deviceTypes, setDeviceTypes] = useState<DropdownOption[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);

  const [locationId, setLocationId] = useState(String(user.location_id || ''));
  const [departmentId, setDepartmentId] = useState(String(user.department_id || ''));
  const [category, setCategory] = useState('');
  const [deviceType, setDeviceType] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [assetId, setAssetId] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [businessImpact, setBusinessImpact] = useState<'Low' | 'Moderate' | 'High' | 'Operations Halted'>('Moderate');
  const [priority, setPriority] = useState<'Critical' | 'High' | 'Medium' | 'Low'>('Medium');
  const [issueTime, setIssueTime] = useState(new Date().toISOString().slice(0, 16));
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      apiFetch<{ options: DropdownOption[] }>('/api/dropdowns'),
      apiFetch<{ locations: Location[] }>('/api/locations'),
      apiFetch<{ departments: Department[] }>('/api/departments'),
      apiFetch<{ assets: Asset[] }>('/api/assets'),
    ])
      .then(([dd, loc, dept, ast]) => {
        const cats = dd.options.filter((o) => o.list_key === 'ticket_categories');
        const devs = dd.options.filter((o) => o.list_key === 'device_types');
        setCategories(cats);
        setDeviceTypes(devs);
        setLocations(loc.locations);
        setDepartments(dept.departments);
        setAssets(ast.assets);
        if (!category && cats[0]) setCategory(cats[0].value);
        if (!deviceType && devs[0]) setDeviceType(devs[0].value);
        if (!locationId && loc.locations[0]) setLocationId(String(loc.locations[0].id));
        if (!departmentId && dept.departments[0]) setDepartmentId(String(dept.departments[0].id));
      })
      .catch(() => {});
  }, [open]);

  if (!open) return null;

  const filteredAssets = locationId
    ? assets.filter((a) => String(a.location_id) === locationId)
    : assets;

  const handleAssetSelect = (val: string) => {
    setAssetId(val);
    const found = assets.find((a) => String(a.id) === val);
    if (found) {
      setSerialNumber(found.serial_number || '');
      if (!deviceName) setDeviceName(`${found.brand} ${found.model}`.trim());
    }
  };

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    const merged = [...files, ...picked].slice(0, 12);
    if (files.length + picked.length > 12) {
      showToast('Maximum 12 attachments allowed per ticket', 'info');
    }
    setFiles(merged);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('locationId', locationId);
      formData.append('departmentId', departmentId);
      formData.append('category', category);
      formData.append('deviceType', deviceType);
      formData.append('deviceName', deviceName);
      if (assetId) formData.append('assetId', assetId);
      formData.append('serialNumber', serialNumber);
      formData.append('businessImpact', businessImpact);
      formData.append('priority', priority);
      formData.append('issueTime', new Date(issueTime).toISOString());
      formData.append('description', description);
      files.forEach((f) => formData.append('attachments', f));

      const res = await apiFetch<{ ticket: { ticket_number: string } }>('/api/tickets', {
        method: 'POST',
        body: formData,
      });

      showToast(`Ticket ${res.ticket.ticket_number} submitted successfully`, 'success');
      setDescription('');
      setDeviceName('');
      setSerialNumber('');
      setAssetId('');
      setFiles([]);
      onCreated();
      onClose();
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl my-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">Raise IT Support Ticket</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Reporter: {user.full_name} {user.employee_code ? `(${user.employee_code})` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[82vh] overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Location / Hub *</label>
              <select
                required
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Department *</label>
              <select
                required
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Issue Category *</label>
              <select
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Device Type *</label>
              <select
                required
                value={deviceType}
                onChange={(e) => setDeviceType(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {deviceTypes.map((d) => (
                  <option key={d.id} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Linked Asset (Optional)</label>
              <select
                value={assetId}
                onChange={(e) => handleAssetSelect(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="">-- Manual / Unlisted --</option>
                {filteredAssets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.asset_tag} · {a.brand} {a.model}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Device Name / Model</label>
              <input
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="e.g. Zebra ZT411 Dock-3"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Serial Number</label>
              <input
                type="text"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                placeholder="SN-XXXX"
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Business Impact *</label>
              <select
                value={businessImpact}
                onChange={(e) => {
                  const val = e.target.value as typeof businessImpact;
                  setBusinessImpact(val);
                  if (val === 'Operations Halted') setPriority('Critical');
                  else if (val === 'High') setPriority('High');
                }}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="Low">Low</option>
                <option value="Moderate">Moderate</option>
                <option value="High">High</option>
                <option value="Operations Halted">Operations Halted</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Priority *</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as typeof priority)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="Critical">Critical (15m / 4h)</option>
                <option value="High">High (30m / 8h)</option>
                <option value="Medium">Medium (4h / 24h)</option>
                <option value="Low">Low (8h / 48h)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Issue Observed Time *</label>
              <input
                type="datetime-local"
                required
                value={issueTime}
                onChange={(e) => setIssueTime(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Detailed Description & Error Symptoms *
            </label>
            <textarea
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the hardware/network/software issue, dock bay or workstation number, and any error codes shown..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Attachments (Photos / Videos / Documents — up to 12 files)
            </label>
            <label className="flex flex-col items-center justify-center p-4 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <UploadCloud className="w-5 h-5 text-blue-600 mb-1" />
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Click to attach photos, videos, or logs ({files.length}/12 selected)
              </span>
              <input
                type="file"
                multiple
                accept="image/*,video/*,.pdf,.doc,.docx,.txt,.csv,.xlsx,.log"
                onChange={handleFiles}
                className="hidden"
              />
            </label>
            {files.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {files.map((f, idx) => (
                  <div
                    key={`${f.name}-${idx}`}
                    className="flex items-center justify-between px-3 py-1.5 rounded bg-slate-100 dark:bg-slate-800 text-xs"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{f.name}</span>
                      <span className="font-mono text-slate-400">({Math.round(f.size / 1024)} KB)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-red-500 hover:text-red-700 ml-2 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold disabled:opacity-60"
            >
              {submitting ? 'Submitting...' : 'Submit Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
