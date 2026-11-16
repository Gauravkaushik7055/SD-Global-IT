import { ArrowRight, KeyRound, Lock, Mail, Moon, Phone, ShieldAlert, Sun, Warehouse } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { BrandLogo } from '../components/BrandLogo.tsx';
import { useToast } from '../components/ToastContext.tsx';
import { apiFetch, setToken } from '../lib/api.ts';
import { Department, Location, User } from '../types.ts';

interface LoginPageProps {
  onSuccess: (user: User, mustReset: boolean) => void;
  dark: boolean;
  onToggleDark: () => void;
}

export function LoginPage({ onSuccess, dark, onToggleDark }: LoginPageProps) {
  const { showToast } = useToast();
  const [heroError, setHeroError] = useState(false);

  // Check URL params for invite / reset tokens
  const params = new URLSearchParams(window.location.search);
  const inviteTokenParam = params.get('invite') || params.get('commonInvite') || '';
  const resetTokenParam = params.get('reset') || '';

  const [mode, setMode] = useState<'employee' | 'staff' | 'forgot' | 'reset' | 'invite'>(
    inviteTokenParam ? 'invite' : resetTokenParam ? 'reset' : 'employee'
  );

  // Public metadata for employee onboarding
  const [locations, setLocations] = useState<Location[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  // Staff Email login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [staffLoading, setStaffLoading] = useState(false);

  // Employee Mobile OTP state
  const [mobile, setMobile] = useState('');
  const [otpStep, setOtpStep] = useState<'mobile' | 'otp' | 'profile'>('mobile');
  const [otpCode, setOtpCode] = useState('');
  const [previewOtp, setPreviewOtp] = useState('');
  const [fullName, setFullName] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [designation, setDesignation] = useState('');
  const [reportingManager, setReportingManager] = useState('');
  const [locationId, setLocationId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);

  // Forgot / Reset Password state
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetToken, setResetToken] = useState(resetTokenParam);
  const [newPassword, setNewPassword] = useState('');

  // Invite Onboarding state
  const [inviteToken, setInviteToken] = useState(inviteTokenParam);
  const [inviteInfo, setInviteInfo] = useState<{
    valid: boolean;
    type: 'invite' | 'common';
    fullName?: string;
    email?: string;
    specialization?: string;
  } | null>(null);
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteMobile, setInviteMobile] = useState('');
  const [inviteSpec, setInviteSpec] = useState('Warehouse Hardware & Network');

  useEffect(() => {
    apiFetch<{ locations: Location[]; departments: Department[] }>('/api/public/metadata')
      .then((res) => {
        setLocations(res.locations);
        setDepartments(res.departments);
        if (res.locations[0]) setLocationId(String(res.locations[0].id));
        if (res.departments[0]) setDepartmentId(String(res.departments[0].id));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (mode === 'invite' && inviteToken) {
      apiFetch<{
        valid: boolean;
        type: 'invite' | 'common';
        fullName?: string;
        email?: string;
        specialization?: string;
      }>(`/api/auth/invite/${encodeURIComponent(inviteToken)}`)
        .then((res) => setInviteInfo(res))
        .catch((err) => {
          showToast(err.message, 'error');
          setInviteInfo(null);
        });
    }
  }, [mode, inviteToken, showToast]);

  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setStaffLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: User; mustResetPassword: boolean }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setToken(res.token);
      onSuccess(res.user, res.mustResetPassword);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setStaffLoading(false);
    }
  };

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpLoading(true);
    try {
      const res = await apiFetch<{ sent: boolean; isNewEmployee: boolean; previewOtp?: string }>(
        '/api/auth/request-otp',
        {
          method: 'POST',
          body: JSON.stringify({ mobile }),
        }
      );
      setOtpStep('otp');
      if (res.previewOtp) {
        setPreviewOtp(res.previewOtp);
        showToast(`OTP generated: ${res.previewOtp}`, 'info');
      } else {
        showToast('6-digit OTP sent to your mobile number', 'success');
      }
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpLoading(true);
    try {
      const payload: Record<string, unknown> = { mobile, otp: otpCode };
      if (otpStep === 'profile') {
        payload.fullName = fullName;
        payload.locationId = Number(locationId);
        payload.departmentId = Number(departmentId);
        payload.employeeCode = employeeCode;
        payload.designation = designation;
        payload.reportingManager = reportingManager;
      }
      const res = await apiFetch<{ token?: string; user?: User; requiresProfile?: boolean }>(
        '/api/auth/verify-otp',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );

      if (res.requiresProfile) {
        setOtpStep('profile');
        showToast('Mobile verified. Select your branch & department to continue.', 'info');
      } else if (res.token && res.user) {
        setToken(res.token);
        onSuccess(res.user, false);
      }
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ message: string; resetTokenPreview?: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: forgotEmail }),
      });
      showToast(res.message, 'info');
      if (res.resetTokenPreview) {
        setResetToken(res.resetTokenPreview);
        setMode('reset');
      }
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: resetToken, newPassword }),
      });
      showToast('Password updated. Please sign in with your new password.', 'success');
      setMode('staff');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleAcceptInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ token: string; user: User }>('/api/auth/accept-invite', {
        method: 'POST',
        body: JSON.stringify({
          token: inviteToken,
          password: invitePassword,
          fullName: inviteName,
          email: inviteEmail,
          mobile: inviteMobile,
          specialization: inviteSpec,
        }),
      });
      setToken(res.token);
      window.history.replaceState({}, '', '/');
      onSuccess(res.user, false);
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-50 dark:bg-slate-950">
      {/* Left Hero Column */}
      <div className="relative lg:w-1/2 min-h-[260px] lg:min-h-screen overflow-hidden bg-slate-900 flex flex-col justify-between p-8 lg:p-12">
        {!heroError ? (
          <img
            src="/src/assets/images/logistics_hero_1794830367513.jpg"
            alt="SD Global Logistics automated distribution hub and barcode workstation"
            referrerPolicy="no-referrer"
            onError={() => setHeroError(true)}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center">
            <Warehouse className="w-32 h-32 text-blue-500/20" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/55 to-slate-950/40" />

        <div className="relative z-10 flex items-center justify-between">
          <BrandLogo lightText />
          <span className="text-xs font-mono text-slate-300 tracking-wide">ISO 27001 · SLA Operations</span>
        </div>

        <div className="relative z-10 max-w-lg mt-10 lg:mt-0 space-y-4">
          <h1 className="font-display text-2xl sm:text-4xl font-bold text-white leading-tight [text-wrap:balance]">
            Enterprise IT Command for Multi-Hub Logistics
          </h1>
          <p className="text-sm sm:text-base text-slate-200 leading-relaxed">
            Centralized helpdesk ticketing, SLA escalation, IT asset lifecycle, and location budget governance across
            SD Global warehouses, cold-chain branches, and port hubs.
          </p>
          <div className="pt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300 font-medium">
            <span>6 Indian Logistics Hubs</span>
            <span aria-hidden="true">·</span>
            <span>Real-Time SLA Engine</span>
            <span aria-hidden="true">·</span>
            <span>Asset & Expense Control</span>
          </div>
        </div>
      </div>

      {/* Right Authentication Form Column */}
      <div className="flex-1 flex flex-col justify-between p-6 sm:p-10 lg:p-14 bg-white dark:bg-slate-950">
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            SD Global Logistics Pvt. Ltd. · Internal IT Portal
          </div>
          <button
            type="button"
            onClick={onToggleDark}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
            aria-label="Toggle color theme"
          >
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>

        <div className="w-full max-w-md mx-auto my-auto py-8">
          {(mode === 'employee' || mode === 'staff') && (
            <>
              <div className="mb-6">
                <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Sign in to LogiCore</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Select your portal access method below.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 mb-6">
                <button
                  type="button"
                  onClick={() => setMode('employee')}
                  className={`py-2 px-3 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                    mode === 'employee'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Employee (Mobile OTP)
                </button>
                <button
                  type="button"
                  onClick={() => setMode('staff')}
                  className={`py-2 px-3 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                    mode === 'staff'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Staff (Email)
                </button>
              </div>
            </>
          )}

          {mode === 'employee' && (
            <div className="space-y-4">
              {otpStep === 'mobile' && (
                <form onSubmit={handleRequestOtp} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Mobile Number (10 digits)
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="tel"
                        required
                        value={mobile}
                        onChange={(e) => setMobile(e.target.value)}
                        placeholder="9876543210"
                        className="w-full pl-9 pr-3 py-2.5 text-sm font-mono tabular-nums rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                      No pre-registration required. First-time employees select their hub and department after OTP verification.
                    </p>
                  </div>
                  <button
                    type="submit"
                    disabled={otpLoading}
                    className="w-full py-2.5 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
                  >
                    <span>{otpLoading ? 'Sending OTP...' : 'Send 6-Digit OTP'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              )}

              {otpStep === 'otp' && (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  {previewOtp && (
                    <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 text-xs text-blue-900 dark:text-blue-200">
                      Local SMS Preview OTP: <span className="font-mono font-bold text-sm">{previewOtp}</span>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Enter 6-Digit OTP sent to {mobile}
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="••••••"
                      className="w-full px-3 py-2.5 text-center tracking-[0.4em] text-lg font-mono tabular-nums rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setOtpStep('mobile');
                        setOtpCode('');
                      }}
                      className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900"
                    >
                      Change Number
                    </button>
                    <button
                      type="submit"
                      disabled={otpLoading}
                      className="flex-1 py-2.5 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold transition-colors disabled:opacity-60"
                    >
                      {otpLoading ? 'Verifying...' : 'Verify & Continue'}
                    </button>
                  </div>
                </form>
              )}

              {otpStep === 'profile' && (
                <form onSubmit={handleVerifyOtp} className="space-y-3.5">
                  <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-200">
                    Mobile verified. Complete your branch profile to raise IT tickets.
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Full Name *</label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Amit Kulkarni"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Employee Code</label>
                      <input
                        type="text"
                        value={employeeCode}
                        onChange={(e) => setEmployeeCode(e.target.value)}
                        placeholder="SDG-2041"
                        className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Designation</label>
                      <input
                        type="text"
                        value={designation}
                        onChange={(e) => setDesignation(e.target.value)}
                        placeholder="Floor Executive"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Location / Hub *</label>
                    <select
                      required
                      value={locationId}
                      onChange={(e) => setLocationId(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    >
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name} ({l.code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Department *</label>
                      <select
                        required
                        value={departmentId}
                        onChange={(e) => setDepartmentId(e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      >
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Reporting Manager</label>
                      <input
                        type="text"
                        value={reportingManager}
                        onChange={(e) => setReportingManager(e.target.value)}
                        placeholder="Shift Lead"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={otpLoading}
                    className="w-full py-2.5 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold"
                  >
                    {otpLoading ? 'Completing Setup...' : 'Complete Setup & Enter Portal'}
                  </button>
                </form>
              )}
            </div>
          )}

          {mode === 'staff' && (
            <form onSubmit={handleStaffLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Corporate Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ithead@sdgloballogistics.com"
                    className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Password</label>
                  <button
                    type="button"
                    onClick={() => setMode('forgot')}
                    className="text-xs text-blue-700 dark:text-blue-400 hover:underline font-medium"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={staffLoading}
                className="w-full py-2.5 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
              >
                <span>{staffLoading ? 'Signing In...' : 'Sign In as Staff'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Have a moderator invite token?</span>
                <button
                  type="button"
                  onClick={() => setMode('invite')}
                  className="text-blue-700 dark:text-blue-400 font-medium hover:underline"
                >
                  Activate Invite
                </button>
              </div>
            </form>
          )}

          {mode === 'forgot' && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="mb-2">
                <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">Reset Staff Password</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Enter your corporate email to generate an expiring password reset token.
                </p>
              </div>
              <input
                type="email"
                required
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="staff@sdgloballogistics.com"
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setMode('staff')}
                  className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium"
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold"
                >
                  Request Reset Token
                </button>
              </div>
            </form>
          )}

          {mode === 'reset' && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="mb-2">
                <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">Set New Password</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Enter the reset token and your new password (min 8 characters).
                </p>
              </div>
              <input
                type="text"
                required
                value={resetToken}
                onChange={(e) => setResetToken(e.target.value)}
                placeholder="Reset Token"
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password (min 8 chars)"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setMode('staff')}
                  className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium"
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold"
                >
                  Update Password
                </button>
              </div>
            </form>
          )}

          {mode === 'invite' && (
            <form onSubmit={handleAcceptInvite} className="space-y-4">
              <div className="mb-2">
                <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-blue-600" />
                  Moderator Onboarding
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Activate your IT technician profile using your invite or shared access link.
                </p>
              </div>
              {!inviteTokenParam && (
                <div>
                  <label className="block text-xs font-semibold mb-1">Invite Token</label>
                  <input
                    type="text"
                    required
                    value={inviteToken}
                    onChange={(e) => setInviteToken(e.target.value)}
                    placeholder="Paste invite token"
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
              )}

              {inviteInfo && inviteInfo.type === 'invite' && (
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-xs space-y-1">
                  <div>
                    Invited Technician: <strong>{inviteInfo.fullName}</strong>
                  </div>
                  <div className="font-mono text-slate-600 dark:text-slate-300">{inviteInfo.email}</div>
                </div>
              )}

              {(!inviteInfo || inviteInfo.type === 'common') && (
                <>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Full Name *</label>
                    <input
                      type="text"
                      required
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      placeholder="Vikram Singh"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold mb-1">Corporate Email *</label>
                      <input
                        type="email"
                        required
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="tech@sdgloballogistics.com"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">Mobile</label>
                      <input
                        type="tel"
                        value={inviteMobile}
                        onChange={(e) => setInviteMobile(e.target.value)}
                        placeholder="9876543210"
                        className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Specialization</label>
                    <input
                      type="text"
                      value={inviteSpec}
                      onChange={(e) => setInviteSpec(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-semibold mb-1">Set Account Password *</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={invitePassword}
                  onChange={(e) => setInvitePassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    window.history.replaceState({}, '', '/');
                    setMode('staff');
                  }}
                  className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium"
                >
                  Back to Login
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold"
                >
                  Activate Moderator Account
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-900 pt-4">
          <span>LogiCore IT Support CRM</span>
          <span className="inline-flex items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5" /> Audited Access
          </span>
        </div>
      </div>
    </div>
  );
}
