export default function Loading() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-slate-100 font-sans">
      <div className="text-center space-y-2">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="text-xs text-slate-400 font-mono">Carregando TheoryLab...</p>
      </div>
    </div>
  );
}