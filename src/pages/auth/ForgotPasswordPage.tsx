import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Mail, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-stone-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center">
            <Camera className="w-6 h-6 text-stone-950" />
          </div>
          <div>
            <span className="text-white font-bold text-xl tracking-tight">Zuragchin</span>
            <span className="text-amber-400 font-bold text-xl">.mn</span>
          </div>
        </div>

        {sent ? (
          <div className="text-center">
            <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>
            <h2 className="text-white text-2xl font-bold mb-3">Имэйлээ шалгана уу</h2>
            <p className="text-stone-400 mb-2">
              Нууц үг сэргээх холбоосыг илгээлээ:
            </p>
            <p className="text-white font-medium mb-6">{email}</p>
            <p className="text-stone-500 text-sm mb-8">
              Хүлээж аваагүй юу? Spam хавтаснаа шалгах эсвэл{' '}
              <button
                onClick={() => setSent(false)}
                className="text-amber-400 hover:text-amber-300 transition-colors"
              >
                дахин оролдох
              </button>
            </p>
            <Link
              to="/auth/login"
              className="flex items-center justify-center gap-2 text-stone-400 hover:text-white transition-colors text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Нэвтрэх рүү буцах
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-white text-3xl font-bold mb-2">Нууц үг мартсан уу?</h1>
            <p className="text-stone-400 mb-8">
              Имэйлээ оруулаад нууц үг сэргээх холбоос илгээнэ.
            </p>

            {error && (
              <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-stone-300 text-sm font-medium mb-2">Имэйл хаяг</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="w-full bg-white/5 border border-white/10 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 text-white placeholder-stone-600 rounded-xl pl-11 pr-4 py-3 outline-none transition-all duration-200"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold rounded-xl py-3 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-stone-950/30 border-t-stone-950 rounded-full animate-spin" />
                ) : 'Холбоос илгээх'}
              </button>
            </form>

            <Link
              to="/auth/login"
              className="flex items-center justify-center gap-2 text-stone-400 hover:text-white transition-colors text-sm mt-6"
            >
              <ArrowLeft className="w-4 h-4" />
              Нэвтрэх рүү буцах
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
