import React, { useState } from 'react';
import {
  AuthUser,
  requestAdminOtp,
  requestAdminSignupOtp,
  verifyAdminOtp,
  verifySignupOtpAndRequestAccess,
} from '../lib/auth';
import { AradadLogo } from './AradadLogo';
import { AlertCircle, CheckCircle2, KeyRound, Mail, ShieldCheck, UserRound, X } from 'lucide-react';

interface AdminAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: AuthUser) => void;
}

type AuthMode = 'login' | 'signup';

export const AdminAuthModal: React.FC<AdminAuthModalProps> = ({ isOpen, onClose, onAuthSuccess }) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [signupSubmitted, setSignupSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen) return null;

  const sendOtp = async () => {
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const result = mode === 'signup'
        ? await requestAdminSignupOtp(email)
        : await requestAdminOtp(email);
      if (result.success) {
        setOtpSent(true);
        setSuccessMsg(mode === 'signup'
          ? 'If this email can request access, a one-time verification code has been sent.'
          : 'If this email is authorized, a one-time sign-in code has been sent.');
      } else {
        setErrorMsg(result.error || 'Could not send a one-time code.');
      }
    } catch {
      setErrorMsg('Could not send a one-time code. Check the email and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'signup' && (fullName.trim().length < 2 || fullName.trim().length > 120)) {
      setErrorMsg('Enter your name (2 to 120 characters).');
      return;
    }
    await sendOtp();
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    try {
      if (mode === 'signup') {
        const result = await verifySignupOtpAndRequestAccess(email, otp, fullName);
        if (result.success) {
          setSignupSubmitted(true);
          setSuccessMsg('Your email is verified. An administrator will review your access request.');
        } else {
          setErrorMsg(result.error || 'Could not submit your access request.');
        }
        return;
      }

      const result = await verifyAdminOtp(email, otp);
      if (result.success && result.user) {
        onAuthSuccess(result.user);
        handleClose();
      } else {
        setErrorMsg(result.error || 'Could not verify this code.');
      }
    } catch {
      setErrorMsg(mode === 'signup'
        ? 'Could not submit your request. Request a new code and try again.'
        : 'Could not verify this code. Request a new code and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleUseDifferentEmail = () => {
    setOtpSent(false);
    setSignupSubmitted(false);
    setOtp('');
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleModeChange = (nextMode: AuthMode) => {
    setMode(nextMode);
    setOtpSent(false);
    setSignupSubmitted(false);
    setOtp('');
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleClose = () => {
    setMode('login');
    setFullName('');
    setEmail('');
    setOtp('');
    setOtpSent(false);
    setSignupSubmitted(false);
    setErrorMsg('');
    setSuccessMsg('');
    onClose();
  };

  const heading = signupSubmitted
    ? 'Request received'
    : otpSent
      ? 'Check your email'
      : mode === 'signup'
        ? 'Request Management Access'
        : 'Management Sign In';

  const description = signupSubmitted
    ? 'Your verified email is waiting for approval. After approval, return here and sign in with a new one-time code.'
    : otpSent
      ? `Enter the one-time code sent to ${email}.`
      : mode === 'signup'
        ? 'Verify your work email to request access. An administrator must approve your account before you can enter the portal.'
        : 'Sign in with a one-time code sent to an approved management email address.';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-stone-900 border border-stone-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col text-stone-100">
        <div className="p-6 border-b border-stone-800 flex items-center justify-between bg-stone-950/70">
          <AradadLogo size="md" />
          <button onClick={handleClose} aria-label="Close sign in" className="w-8 h-8 rounded-full bg-stone-800 hover:bg-stone-700 flex items-center justify-center text-stone-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <span className="text-xs uppercase tracking-widest text-amber-500 font-semibold block">Internal Portal</span>
            <h3 className="font-serif text-2xl font-bold text-white mt-1">{heading}</h3>
            <p className="text-xs text-stone-400 mt-1 font-light">{description}</p>
          </div>

          {errorMsg && (
            <div role="alert" className="p-3 bg-red-950/80 border border-red-800 text-red-200 rounded-lg text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div role="status" className="p-3 bg-emerald-950/80 border border-emerald-800 text-emerald-200 rounded-lg text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {signupSubmitted ? (
            <div className="space-y-3">
              <button type="button" onClick={() => handleModeChange('login')} className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold rounded-lg text-sm transition-colors shadow-md">
                Return to sign in
              </button>
              <p className="text-center text-[11px] text-stone-400">You can close this window while your request is reviewed.</p>
            </div>
          ) : !otpSent ? (
            <>
              <form onSubmit={handleRequestOtp} className="space-y-4">
                {mode === 'signup' && (
                  <label className="block text-xs font-semibold text-stone-300 uppercase tracking-wider">
                    Full name
                    <span className="relative mt-1.5 block">
                      <UserRound className="w-4 h-4 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        autoComplete="name"
                        value={fullName}
                        onChange={e => setFullName(e.target.value)}
                        minLength={2}
                        maxLength={120}
                        placeholder="Your name"
                        className="w-full bg-stone-950 border border-stone-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400"
                        required
                      />
                    </span>
                  </label>
                )}
                <label className="block text-xs font-semibold text-stone-300 uppercase tracking-wider">
                  {mode === 'signup' ? 'Work email' : 'Management email'}
                  <span className="relative mt-1.5 block">
                    <Mail className="w-4 h-4 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full bg-stone-950 border border-stone-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400 font-mono"
                      required
                    />
                  </span>
                </label>
                <button type="submit" disabled={loading} className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold rounded-lg text-sm transition-colors shadow-md disabled:opacity-50">
                  {loading ? 'Sending code…' : mode === 'signup' ? 'Verify email and request access' : 'Email me a sign-in code'}
                </button>
              </form>

              <div className="text-center text-xs text-stone-400">
                {mode === 'login' ? 'Need staff access? ' : 'Already approved? '}
                <button type="button" onClick={() => handleModeChange(mode === 'login' ? 'signup' : 'login')} className="text-amber-400 hover:underline font-semibold">
                  {mode === 'login' ? 'Request access' : 'Sign in'}
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <label className="block text-xs font-semibold text-stone-300 uppercase tracking-wider">
                One-time email code
                <span className="relative mt-1.5 block">
                  <KeyRound className="w-4 h-4 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6,8}"
                    maxLength={8}
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter the code"
                    className="w-full bg-stone-950 border border-stone-700 rounded-lg pl-9 pr-3 py-2.5 text-lg tracking-[0.35em] text-white focus:outline-none focus:border-amber-400 font-mono"
                    required
                  />
                </span>
              </label>
              <button type="submit" disabled={loading || otp.length < 6} className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold rounded-lg text-sm transition-colors shadow-md disabled:opacity-50">
                {loading ? 'Verifying…' : mode === 'signup' ? 'Verify code and submit request' : 'Verify code and sign in'}
              </button>
              <div className="flex items-center justify-between text-xs">
                <span className="text-stone-400">Sent to {email}</span>
                <button type="button" onClick={handleUseDifferentEmail} className="text-amber-400 hover:underline">Use another email</button>
              </div>
              <button type="button" disabled={loading} onClick={() => void sendOtp()} className="w-full text-xs text-stone-400 hover:text-white disabled:opacity-50">
                Resend code
              </button>
            </form>
          )}

          <div className="flex gap-2 border-t border-stone-800 pt-4 text-[11px] text-stone-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <p>One-time codes verify email ownership. New staff access stays pending until an active administrator approves it.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
