import { Download, Plus, Search, Upload } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { useToast } from '../components/ToastContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { downloadEmployeeImportTemplate } from '../lib/exporters.ts';
import { Department, Location, User } from '../types.ts';

export function EmployeesPage() {
  const { showToast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);

  // Create form
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'employee' | 'management'>('employee');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [designation, setDesignation] = useState('');
  const [locationId, setLocationId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [reportingManager, setReportingManager] = useState('');

  const loadData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (roleFilter !== 'all') params.set('role', roleFilter);
      if (search) params.set('search', search);
      const [uRes, lRes, dRes] = await Promise.all([
        apiFetch<{ users: User[] }>(`/api/users?${params.toString()}`),
        apiFetch<{ locations: Location[] }>('/api/locations'),
        apiFetch<{ departments: Department[] }>('/api/departments'),
      ]);
      setUsers(uRes.users);
      setLocations(lRes.locations);
      setDepartments(dRes.departments);
      if (!locationId && lRes.locations[0]) setLocationId(String(lRes.locations[0].id));
      if (!departmentId && dRes.departments[0]) setDepartmentId(String(dRes.departments[0].id));
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  }, [roleFilter, search, locationId, departmentId, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          fullName,
          role,
          email: email || undefined,
          mobile: mobile || undefined,
          password: password || undefined,
          employeeCode,
          designation,
          locationId: locationId ? Number(locationId) : null,
          departmentId: departmentId ? Number(departmentId) : null,
          reportingManager,
          mustResetPassword: role === 'management' && Boolean(password),
        }),
      });
      showToast(`${role === 'management' ? 'Management user' : 'Employee'} created`, 'success');
      setFullName('');
      setEmail('');
      setMobile('');
      setPassword('');
      setEmployeeCode('');
      setShowCreate(false);
      loadData();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet);
      const res = await apiFetch<{ created: number; skipped: number }>('/api/users/import', {
        method: 'POST',
        body: JSON.stringify({ rows }),
      });
      showToast(`Imported ${res.created} employee(s), skipped ${res.skipped}`, 'success');
      loadData();
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      e.target.value = '';
    }
  };

  const toggleActive = async (u: User) => {
    try {
      await apiFetch(`/api/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !u.is_active }),
      });
      loadData();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const forceReset = async (u: User) => {
    try {
      await apiFetch(`/api/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ mustResetPassword: true }),
      });
      showToast(`Forced password reset enabled for ${u.full_name}`, 'info');
      loadData();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">Employee & HR Directory</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Manage branch staff, management read-only accounts, and bulk Excel HR onboarding.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={downloadEmployeeImportTemplate}
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> Template (.xlsx)
          </button>
          <label className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
            <Upload className="w-3.5 h-3.5" /> Bulk Import Excel
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelImport} className="hidden" />
          </label>
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="px-3.5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Add User
          </button>
        </div>
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3.5"
        >
          <h2 className="font-display text-sm font-bold">Create Employee or Management Account</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'employee' | 'management')}
              className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              <option value="employee">Employee (Mobile OTP)</option>
              <option value="management">Management (Read-Only Email)</option>
            </select>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Full Name *"
              className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <input
              type="text"
              value={employeeCode}
              onChange={(e) => setEmployeeCode(e.target.value)}
              placeholder="Employee Code (e.g. SDG-1088)"
              className="px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="email"
              required={role === 'management'}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={role === 'management' ? 'Corporate Email *' : 'Email (Optional)'}
              className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <input
              type="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="10-Digit Mobile"
              className="px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            {role === 'management' ? (
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Initial Password *"
                className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            ) : (
              <input
                type="text"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                placeholder="Designation"
                className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={reportingManager}
              onChange={(e) => setReportingManager(e.target.value)}
              placeholder="Reporting Manager"
              className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
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
              Save Account
            </button>
          </div>
        </form>
      )}

      {/* Search & Role Filter */}
      <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, mobile, code..."
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
        >
          <option value="all">All Roles</option>
          <option value="employee">Employees</option>
          <option value="management">Management</option>
          <option value="moderator">Moderators</option>
          <option value="super_admin">Super Admin</option>
        </select>
      </div>

      {/* Directory Table */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500">
              <tr>
                <th className="text-left px-4 py-2.5">User</th>
                <th className="text-left px-4 py-2.5">Role</th>
                <th className="text-left px-4 py-2.5">Contact</th>
                <th className="text-left px-4 py-2.5">Location & Dept</th>
                <th className="text-left px-4 py-2.5">Account State</th>
                <th className="text-right px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900 dark:text-white">{u.full_name}</div>
                    <div className="font-mono text-[11px] text-slate-400">
                      {u.employee_code || '—'} · {u.designation || 'Staff'}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono uppercase text-[11px]">{u.role}</td>
                  <td className="px-4 py-3 font-mono text-[11px]">
                    <div>{u.email || '—'}</div>
                    <div className="text-slate-500">{u.mobile || '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div>{u.location_name || '—'}</div>
                    <div className="text-slate-500">{u.department_name || '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded border text-[11px] font-medium ${
                        u.is_active
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-300'
                          : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950/40 dark:border-red-900 dark:text-red-300'
                      }`}
                    >
                      {u.is_active ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                    {u.role !== 'super_admin' && (
                      <>
                        {u.email && (
                          <button
                            type="button"
                            onClick={() => forceReset(u)}
                            className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                          >
                            Force Reset
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleActive(u)}
                          className="text-red-600 dark:text-red-400 hover:underline font-medium"
                        >
                          {u.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
