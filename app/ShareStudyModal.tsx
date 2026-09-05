'use client';

import React, { useState } from 'react';
import { UserPlus, X, Mail, Shield, Check, Users } from 'lucide-react';

interface ShareStudyModalProps {
  isOpen: boolean;
  onClose: () => void;
  studyId: string;
  studyTitle: string;
  onSharedSuccess: () => void;
}

export default function ShareStudyModal({
  isOpen,
  onClose,
  studyId,
  studyTitle,
  onSharedSuccess,
}: ShareStudyModalProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'SCREENER' | 'CODER' | 'ARBITER'>('SCREENER');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/studies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SHARE_STUDY',
          payload: {
            studyId,
            targetEmail: email,
            role,
          },
        }),
      });

      if (res.ok) {
        setSuccess(true);
        onSharedSuccess();
        setTimeout(() => {
          setSuccess(false);
          setEmail('');
          onClose();
        }, 1500);
      } else {
        const data = await res.json();
        setErrorMsg(data.error || 'Erro ao compartilhar');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-bold text-white">Compartilhar Estudo</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-400">
          Estudo: <strong className="text-indigo-300 font-semibold">{studyTitle}</strong>
        </p>

        {success ? (
          <div className="p-3.5 bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs rounded-lg flex items-center gap-2">
            <Check className="w-4 h-4" /> Acesso concedido com sucesso para {email}!
          </div>
        ) : (
          <form onSubmit={handleShare} className="space-y-3.5 text-xs">
            {errorMsg && <p className="text-rose-400 text-[11px]">{errorMsg}</p>}

            <div>
              <label className="block text-slate-300 font-semibold mb-1">E-mail do Pesquisador:</label>
              <input
                type="email"
                required
                placeholder="colega@universidade.br"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200 outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Papel atribuído:</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200 outline-none"
              >
                <option value="SCREENER">Triador (Avalia Título e Resumo)</option>
                <option value="CODER">Codificador (Leitura Integral e Extração Qualitativa)</option>
                <option value="ARBITER">Árbitro / Consenso (Voto de Desempate)</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded bg-slate-800 text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
              >
                {loading ? 'Salvando...' : 'Conceder Acesso'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}