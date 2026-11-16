import { Plus, Search, Wrench, X } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { StatusTag } from '../components/StatusBadge.tsx';
import { useToast } from '../components/ToastContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { Asset, DropdownOption, Location, User, Vendor } from '../types.ts';

export function AssetsPage({ user }: { user: User }) {
  const { showToast } = useToast();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [categories, setCategories] = useState<DropdownOption[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [search, setSearch] = useState('');
  const [locationId, setLocationId] = useState('');
  const [condition, setCondition] = useState('all');

  const [showCreate, setShowCreate] = useState(false);
  const [assetTag, setAssetTag] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [category, setCategory] = useState('Laptop');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [purchaseCost, setPurchaseCost] = useState('0');
  const [warrantyExpiry, setWarrantyExpiry] = useState('');
  const [assetLocId, setAssetLocId] = useState('');
  const [assetCond, setAssetCond] = useState<'Operational' | 'Under Repair' | 'Decommissioned' | 'Spare'>('Operational');

  // Maintenance Drawer
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [maintenanceLogs, setMaintenanceLogs] = useState<
    Array<{
      id: number;
      maintenance_type: string;
      vendor_name: string;
      cost: number;
      description: string;
      performed_by: string;
      maintenance_date: string;
      next_due_date: string;
    }>
  >([]);
  const [maintType, setMaintType] = useState<'Preventive' | 'Repair' | 'Parts Replacement'>('Repair');
  const [maintVendorId, setMaintVendorId] = useState('');
  const [maintCost, setMaintCost] = useState('0');
  const [maintDesc, setMaintDesc] = useState('');
  const [maintDate, setMaintDate] = useState(new Date().toISOString().slice(0, 10));

  const canEdit = user.role === 'super_admin' || user.role === 'moderator';

  const loadAssets = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (locationId) params.set('locationId', locationId);
      if (condition !== 'all') params.set('condition', condition);
      const res = await apiFetch<{ assets: Asset[] }>(`/api/assets?${params.toString()}`);
      setAssets(res.assets);
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  }, [search, locationId, condition, showToast]);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  useEffect(() => {
    apiFetch<{ locations: Location[] }>('/api/locations')
      .then((r) => {
        setLocations(r.locations);
        if (r.locations[0]) setAssetLocId(String(r.locations[0].id));
      })
      .catch(() => {});
    apiFetch<{ options: DropdownOption[] }>('/api/dropdowns?listKey=asset_categories')
      .then((r) => {
        setCategories(r.options);
        if (r.options[0]) setCategory(r.options[0].value);
      })
      .catch(() => {});
    apiFetch<{ vendors: Vendor[] }>('/api/vendors').then((r) => setVendors(r.vendors)).catch(() => {});
  }, []);

  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/assets', {
        method: 'POST',
        body: JSON.stringify({
          assetTag,
          serialNumber,
          category,
          brand,
          model,
          purchaseDate,
          purchaseCost: Number(purchaseCost),
          warrantyExpiry,
          locationId: assetLocId ? Number(assetLocId) : null,
          condition: assetCond,
        }),
      });
      showToast(`Asset ${assetTag} registered`, 'success');
      setAssetTag('');
      setSerialNumber('');
      setBrand('');
      setModel('');
      setShowCreate(false);
      loadAssets();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const openMaintenance = async (asset: Asset) => {
    setSelectedAsset(asset);
    try {
      const res = await apiFetch<{ maintenance: typeof maintenanceLogs }>(`/api/assets/${asset.id}/maintenance`);
      setMaintenanceLogs(res.maintenance);
    } catch {
      setMaintenanceLogs([]);
    }
  };

  const handleAddMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset) return;
    try {
      await apiFetch(`/api/assets/${selectedAsset.id}/maintenance`, {
        method: 'POST',
        body: JSON.stringify({
          maintenanceType: maintType,
          vendorId: maintVendorId ? Number(maintVendorId) : null,
          cost: Number(maintCost),
          description: maintDesc,
          maintenanceDate: maintDate,
        }),
      });
      showToast('Maintenance log recorded', 'success');
      setMaintDesc('');
      setMaintCost('0');
      openMaintenance(selectedAsset);
      loadAssets();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleConditionChange = async (asset: Asset, nextCond: string) => {
    try {
      await apiFetch(`/api/assets/${asset.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ condition: nextCond }),
      });
      showToast(`Updated ${asset.asset_tag} to ${nextCond}`, 'success');
      loadAssets();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">IT Assets & Inventory</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Track warehouse scanners, thermal printers, CCTV, servers, and maintenance history.
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="px-3.5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Register IT Asset
          </button>
        )}
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreateAsset}
          className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3.5"
        >
          <h2 className="font-display text-sm font-bold">Register New Hardware Asset</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              required
              value={assetTag}
              onChange={(e) => setAssetTag(e.target.value)}
              placeholder="Asset Tag * (e.g. SDG-BWD-PRN-01)"
              className="px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <input
              type="text"
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              placeholder="Serial Number"
              className="px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Brand (e.g. Zebra, Dell, Cisco)"
              className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Model (e.g. ZT411, DS2278)"
              className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <select
              value={assetLocId}
              onChange={(e) => setAssetLocId(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Purchase Date</label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full px-3 py-1.5 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Cost (INR)</label>
              <input
                type="number"
                min="0"
                value={purchaseCost}
                onChange={(e) => setPurchaseCost(e.target.value)}
                className="w-full px-3 py-1.5 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Warranty Expiry</label>
              <input
                type="date"
                value={warrantyExpiry}
                onChange={(e) => setWarrantyExpiry(e.target.value)}
                className="w-full px-3 py-1.5 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Condition</label>
              <select
                value={assetCond}
                onChange={(e) => setAssetCond(e.target.value as typeof assetCond)}
                className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {['Operational', 'Under Repair', 'Spare', 'Decommissioned'].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold"
            >
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold">
              Save Asset
            </button>
          </div>
        </form>
      )}

      {/* Filter Bar */}
      <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search asset tag, serial, brand, model..."
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
          />
        </div>
        <select
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
        >
          <option value="">All Locations</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.code} — {l.city}
            </option>
          ))}
        </select>
        <select
          value={condition}
          onChange={(e) => setCondition(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
        >
          <option value="all">All Conditions</option>
          {['Operational', 'Under Repair', 'Spare', 'Decommissioned'].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Assets Table */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500">
              <tr>
                <th className="text-left px-4 py-2.5">Asset Tag & Serial</th>
                <th className="text-left px-4 py-2.5">Hardware</th>
                <th className="text-left px-4 py-2.5">Location</th>
                <th className="text-left px-4 py-2.5">Condition</th>
                <th className="text-right px-4 py-2.5">Purchase Cost</th>
                <th className="text-right px-4 py-2.5">Maint. Cost</th>
                <th className="text-right px-4 py-2.5">History</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {assets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    No IT assets registered yet. Click "Register IT Asset" to build your hub inventory.
                  </td>
                </tr>
              ) : (
                assets.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <div className="font-mono font-semibold text-blue-700 dark:text-blue-400">{a.asset_tag}</div>
                      <div className="font-mono text-[11px] text-slate-400">{a.serial_number || 'No S/N'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {a.brand} {a.model}
                      </div>
                      <div className="text-slate-500">{a.category}</div>
                    </td>
                    <td className="px-4 py-3">{a.location_name || 'Unassigned'}</td>
                    <td className="px-4 py-3">
                      {canEdit ? (
                        <select
                          value={a.condition}
                          onChange={(e) => handleConditionChange(a, e.target.value)}
                          className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        >
                          {['Operational', 'Under Repair', 'Spare', 'Decommissioned'].map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <StatusTag status={a.condition} />
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      ₹{(a.purchase_cost || 0).toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      ₹{(a.total_maintenance_cost || 0).toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openMaintenance(a)}
                        className="text-blue-600 dark:text-blue-400 hover:underline font-medium inline-flex items-center gap-1"
                      >
                        <Wrench className="w-3.5 h-3.5" /> Log ({a.maintenance_count || 0})
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Maintenance History Drawer */}
      {selectedAsset && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/50">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 h-full flex flex-col p-6 overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <div className="font-mono text-xs text-blue-600 font-bold">{selectedAsset.asset_tag}</div>
                <h2 className="font-display text-lg font-bold">
                  Maintenance History — {selectedAsset.brand} {selectedAsset.model}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAsset(null)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {canEdit && (
              <form onSubmit={handleAddMaintenance} className="my-5 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                <h3 className="text-xs font-bold">Record Maintenance Event</h3>
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={maintType}
                    onChange={(e) => setMaintType(e.target.value as typeof maintType)}
                    className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option value="Preventive">Preventive</option>
                    <option value="Repair">Repair</option>
                    <option value="Parts Replacement">Parts Replacement</option>
                  </select>
                  <select
                    value={maintVendorId}
                    onChange={(e) => setMaintVendorId(e.target.value)}
                    className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option value="">In-House IT Team</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="date"
                    value={maintDate}
                    onChange={(e) => setMaintDate(e.target.value)}
                    className="px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <input
                    type="number"
                    min="0"
                    value={maintCost}
                    onChange={(e) => setMaintCost(e.target.value)}
                    placeholder="Cost (INR)"
                    className="px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <textarea
                  required
                  rows={2}
                  value={maintDesc}
                  onChange={(e) => setMaintDesc(e.target.value)}
                  placeholder="Work performed / parts replaced..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <button type="submit" className="px-4 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold">
                  Save Maintenance Log
                </button>
              </form>
            )}

            <div className="space-y-3">
              {maintenanceLogs.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">No maintenance history logged yet.</div>
              ) : (
                maintenanceLogs.map((m) => (
                  <div key={m.id} className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                    <div className="flex justify-between font-semibold">
                      <span>{m.maintenance_type}</span>
                      <span className="font-mono tabular-nums">₹{m.cost.toLocaleString('en-IN')}</span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300">{m.description}</p>
                    <div className="text-slate-400 font-mono text-[11px]">
                      {m.maintenance_date} · {m.vendor_name || m.performed_by}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
