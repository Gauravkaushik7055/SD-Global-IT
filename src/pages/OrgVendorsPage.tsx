import { Building2, MapPin, Plus, Truck } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useToast } from '../components/ToastContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { Department, Location, User, Vendor } from '../types.ts';

export function OrgVendorsPage({ user }: { user: User }) {
  const { showToast } = useToast();
  const [tab, setTab] = useState<'locations' | 'departments' | 'vendors'>('locations');
  const [locations, setLocations] = useState<Location[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);

  // Forms
  const [locName, setLocName] = useState('');
  const [locCode, setLocCode] = useState('');
  const [locType, setLocType] = useState('warehouse');
  const [locCity, setLocCity] = useState('');
  const [locState, setLocState] = useState('');

  const [deptName, setDeptName] = useState('');
  const [deptCode, setDeptCode] = useState('');
  const [deptCc, setDeptCc] = useState('');
  const [deptHead, setDeptHead] = useState('');

  const [vName, setVName] = useState('');
  const [vCat, setVCat] = useState('');
  const [vPerson, setVPerson] = useState('');
  const [vPhone, setVPhone] = useState('');
  const [vCity, setVCity] = useState('');

  const isAdmin = user.role === 'super_admin';

  const loadAll = useCallback(async () => {
    try {
      const [l, d, v] = await Promise.all([
        apiFetch<{ locations: Location[] }>('/api/locations'),
        apiFetch<{ departments: Department[] }>('/api/departments'),
        apiFetch<{ vendors: Vendor[] }>('/api/vendors'),
      ]);
      setLocations(l.locations);
      setDepartments(d.departments);
      setVendors(v.vendors);
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  }, [showToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const addLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/locations', {
        method: 'POST',
        body: JSON.stringify({ name: locName, code: locCode, type: locType, city: locCity, state: locState }),
      });
      setLocName('');
      setLocCode('');
      setLocCity('');
      setLocState('');
      showToast('Location added', 'success');
      loadAll();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const addDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/departments', {
        method: 'POST',
        body: JSON.stringify({ name: deptName, code: deptCode, costCenter: deptCc, headName: deptHead }),
      });
      setDeptName('');
      setDeptCode('');
      setDeptCc('');
      setDeptHead('');
      showToast('Department added', 'success');
      loadAll();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const addVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/vendors', {
        method: 'POST',
        body: JSON.stringify({ name: vName, category: vCat, contactPerson: vPerson, phone: vPhone, city: vCity }),
      });
      setVName('');
      setVCat('');
      setVPerson('');
      setVPhone('');
      setVCity('');
      showToast('Vendor added', 'success');
      loadAll();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
          Locations, Departments & IT Vendors
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Manage SD Global Logistics hubs, cost centers, and approved IT service vendors.
        </p>
      </div>

      <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg w-fit">
        {[
          { id: 'locations', label: `Locations (${locations.length})`, icon: MapPin },
          { id: 'departments', label: `Departments (${departments.length})`, icon: Building2 },
          { id: 'vendors', label: `Vendors (${vendors.length})`, icon: Truck },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as typeof tab)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 ${
                tab === item.id
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {item.label}
            </button>
          );
        })}
      </div>

      {tab === 'locations' && (
        <div className="space-y-4">
          {isAdmin && (
            <form onSubmit={addLocation} className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-6 gap-2.5">
              <input required value={locName} onChange={(e) => setLocName(e.target.value)} placeholder="Hub Name *" className="sm:col-span-2 px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
              <input required value={locCode} onChange={(e) => setLocCode(e.target.value)} placeholder="Code (e.g. DEL-WH2)" className="px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
              <select value={locType} onChange={(e) => setLocType(e.target.value)} className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950">
                <option value="warehouse">Warehouse</option>
                <option value="distribution_center">Distribution Center</option>
                <option value="branch">Branch</option>
                <option value="port_hub">Port Hub</option>
                <option value="cargo_hub">Cargo Hub</option>
                <option value="corporate_hq">Corporate HQ</option>
              </select>
              <input required value={locCity} onChange={(e) => setLocCity(e.target.value)} placeholder="City *" className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
              <button type="submit" className="px-3 py-1.5 rounded-lg bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Add Hub
              </button>
            </form>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {locations.map((l) => (
              <div key={l.id} className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400">{l.code}</span>
                  <span className="text-[11px] uppercase font-medium text-slate-400">{l.type.replace('_', ' ')}</span>
                </div>
                <div className="font-display text-sm font-bold text-slate-900 dark:text-white">{l.name}</div>
                <div className="text-xs text-slate-500">
                  {l.city}, {l.state}
                </div>
                {l.address && <div className="text-[11px] text-slate-400">{l.address}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'departments' && (
        <div className="space-y-4">
          {isAdmin && (
            <form onSubmit={addDepartment} className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-5 gap-2.5">
              <input required value={deptName} onChange={(e) => setDeptName(e.target.value)} placeholder="Department Name *" className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
              <input required value={deptCode} onChange={(e) => setDeptCode(e.target.value)} placeholder="Code (OPS-CLD)" className="px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
              <input required value={deptCc} onChange={(e) => setDeptCc(e.target.value)} placeholder="Cost Center (CC-1070)" className="px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
              <input value={deptHead} onChange={(e) => setDeptHead(e.target.value)} placeholder="Department Head" className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
              <button type="submit" className="px-3 py-1.5 rounded-lg bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Add Dept
              </button>
            </form>
          )}
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <tr>
                  <th className="text-left px-4 py-2.5">Code</th>
                  <th className="text-left px-4 py-2.5">Department</th>
                  <th className="text-left px-4 py-2.5">Cost Center</th>
                  <th className="text-left px-4 py-2.5">Head</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {departments.map((d) => (
                  <tr key={d.id}>
                    <td className="px-4 py-2.5 font-mono font-semibold text-blue-700 dark:text-blue-400">{d.code}</td>
                    <td className="px-4 py-2.5 font-medium">{d.name}</td>
                    <td className="px-4 py-2.5 font-mono">{d.cost_center}</td>
                    <td className="px-4 py-2.5 text-slate-500">{d.head_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'vendors' && (
        <div className="space-y-4">
          {isAdmin && (
            <form onSubmit={addVendor} className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-6 gap-2.5">
              <input required value={vName} onChange={(e) => setVName(e.target.value)} placeholder="Vendor Name *" className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
              <input required value={vCat} onChange={(e) => setVCat(e.target.value)} placeholder="Specialty *" className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
              <input value={vPerson} onChange={(e) => setVPerson(e.target.value)} placeholder="Contact Person" className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
              <input value={vPhone} onChange={(e) => setVPhone(e.target.value)} placeholder="Phone" className="px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
              <input value={vCity} onChange={(e) => setVCity(e.target.value)} placeholder="City" className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
              <button type="submit" className="px-3 py-1.5 rounded-lg bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Add Vendor
              </button>
            </form>
          )}
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <tr>
                  <th className="text-left px-4 py-2.5">Vendor</th>
                  <th className="text-left px-4 py-2.5">Category</th>
                  <th className="text-left px-4 py-2.5">Contact</th>
                  <th className="text-left px-4 py-2.5">City / GSTIN</th>
                  <th className="text-right px-4 py-2.5">Rating</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {vendors.map((v) => (
                  <tr key={v.id}>
                    <td className="px-4 py-2.5 font-semibold">{v.name}</td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{v.category}</td>
                    <td className="px-4 py-2.5">
                      <div>{v.contact_person || '—'}</div>
                      <div className="font-mono text-[11px] text-slate-400">{v.phone}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div>{v.city || '—'}</div>
                      <div className="font-mono text-[11px] text-slate-400">{v.gstin || ''}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{v.rating.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
