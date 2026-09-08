'use client';

export const dynamic = 'force-dynamic';
export const dynamicParams = true;

import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import AuthModal from './AuthModal';
import ShareStudyModal from './ShareStudyModal';
import { parseBibliographicData, Article } from './risParser';
import { defaultCategories, CodeCategory, CodedSegment } from './codebook';
import { calculateMultiReviewerCalibration, drawRandomSample, CalibrationConfig } from './kappa';
import { exportMatrixToCSV, downloadCSV } from './exporter';
import { deduplicateArticles } from './deduplicator';
import { groupSegmentsByOverlap, OverlapGroup } from './alignmentEngine';
import PrismaDiagram from './prismaDiagram';
import { saveLocalPDF, getLocalPDFUrl, extractTextFromLocalPDF } from './pdfStorage';
import { 
  BookOpen, Users, Lock, Unlock, FileUp, Tag, 
  Quote, Plus, X, Shuffle, Check, AlertCircle, 
  FileSpreadsheet, GitPullRequest, SlidersHorizontal, 
  UserCheck, FileText, Eye, Layers, CopyX, Sparkles, Scale, 
  FolderPlus, Share2, ArrowLeft, LogOut, Folder, Calendar, User, ClipboardPaste
} from 'lucide-react';

export interface Member {
  id: string;
  name: string;
}

interface MultiReviewerArticle extends Article {
  screeningDecisions: Record<string, 'INCLUDED' | 'EXCLUDED' | 'MAYBE' | undefined>;
  screeningFinal?: 'INCLUDED' | 'EXCLUDED' | 'MAYBE';
  fullTextDecisions: Record<string, { status: 'INCLUDED' | 'EXCLUDED' | 'MAYBE'; reason?: string } | undefined>;
  fullTextFinal?: 'INCLUDED' | 'EXCLUDED';
  fullTextExclusionReason?: string;
  fullTextContent?: string;
  pdfFile?: File | null;
  pdfUrl?: string;
  hasPdf?: boolean;
}

interface StudySummary {
  id: string;
  title: string;
  description?: string;
  created_at: string;
  owner_email: string;
  user_role: string;
  total_articles: number;
}

export default function Home() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);

  const [studies, setStudies] = useState<StudySummary[]>([]);
  const [activeStudy, setActiveStudy] = useState<StudySummary | null>(null);
  const [loadingStudies, setLoadingStudies] = useState<boolean>(false);

  const [isNewStudyModalOpen, setIsNewStudyModalOpen] = useState<boolean>(false);
  const [newStudyTitle, setNewStudyTitle] = useState('');
  const [newStudyDesc, setNewStudyDesc] = useState('');
  const [sharingStudy, setSharingStudy] = useState<StudySummary | null>(null);

  const [articles, setArticles] = useState<MultiReviewerArticle[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const [rawImportedArticles, setRawImportedArticles] = useState<MultiReviewerArticle[]>([]);
  const [rawImportedCount, setRawImportedCount] = useState<number>(0);
  const [pendingDuplicatesCount, setPendingDuplicatesCount] = useState<number>(0);
  const [duplicatesRemovedCount, setDuplicatesRemovedCount] = useState<number>(0);
  const [isDeduplicated, setIsDeduplicated] = useState<boolean>(false);

  const [screeningReviewers] = useState<Member[]>([
    { id: 'scr-1', name: 'Triador 1' },
    { id: 'scr-2', name: 'Triador 2' },
  ]);
  const [activeScreeningId] = useState<string>('scr-1');

  const [codingReviewers] = useState<Member[]>([
    { id: 'cod-1', name: 'Codificador 1' },
    { id: 'cod-2', name: 'Codificador 2' },
  ]);
  const [activeCoderId] = useState<string>('cod-1');

  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8>(1);
  const [codingSubTab, setCodingSubTab] = useState<'CODING' | 'ALIGNMENT'>('CODING');

  const [pilotPercentage, setPilotPercentage] = useState<number>(15);
  const [pilotSampleIds, setPilotSampleIds] = useState<string[]>([]);
  const [calibrationConfig] = useState<CalibrationConfig>({
    method: 'PERCENTAGE',
    minPercentage: 80,
    minKappa: 0.6,
  });

  const [exclusionReasonDraft, setExclusionReasonDraft] = useState<string>('');
  const [categories, setCategories] = useState<CodeCategory[]>(defaultCategories);
  const [selectedCodeId, setSelectedCodeId] = useState<string>(defaultCategories[0]?.id || '');
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState<boolean>(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatDefinition, setNewCatDefinition] = useState('');

  const [codedSegments, setCodedSegments] = useState<CodedSegment[]>([]);
  const [pastedQuoteDraft, setPastedQuoteDraft] = useState<string>('');
  const [notesDraft, setNotesDraft] = useState<string>('');

  useEffect(() => {
    if (!activeStudy) return;
    const saveProgress = async () => {
      try {
        await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'SAVE_PROGRESS',
            payload: { projectId: activeStudy.id, currentStep, codedSegments },
          }),
        });
      } catch (err) {
        console.error('Erro ao salvar progresso:', err);
      }
    };
    saveProgress();
  }, [currentStep, codedSegments, activeStudy]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setCurrentUser(session.user);
        loadStudies(session.user.email!);
      } else {
        setIsAuthModalOpen(true);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setCurrentUser(session.user);
        loadStudies(session.user.email!);
        setIsAuthModalOpen(false);
      } else {
        setCurrentUser(null);
        setActiveStudy(null);
        setIsAuthModalOpen(true);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const loadStudies = async (email: string) => {
    setLoadingStudies(true);
    try {
      const res = await fetch(`/api/studies?email=${encodeURIComponent(email)}`);
      if (res.ok) {
        const data = await res.json();
        setStudies(data.studies || []);
      } else {
        setStudies([]);
      }
    } catch (err) {
      setStudies([]);
    } finally {
      setLoadingStudies(false);
    }
  };

  const handleCreateStudy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudyTitle.trim() || !currentUser?.email) return;

    try {
      const res = await fetch('/api/studies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CREATE_STUDY',
          payload: {
            title: newStudyTitle.trim(),
            description: newStudyDesc.trim(),
            ownerEmail: currentUser.email,
            ownerId: currentUser.id,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao criar estudo.');

      setNewStudyTitle('');
      setNewStudyDesc('');
      setIsNewStudyModalOpen(false);
      loadStudies(currentUser.email);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleOpenStudy = async (study: StudySummary) => {
    setActiveStudy(study);
    setArticles([]);
    setSelectedIndex(0);
    setCurrentStep(1);
    setCodedSegments([]);

    try {
      const res = await fetch(`/api/sync?projectId=${study.id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.currentStep) setCurrentStep(data.currentStep);
        if (data.codedSegments) setCodedSegments(data.codedSegments);

        if (data.articles) {
          const mapped: MultiReviewerArticle[] = await Promise.all(
            data.articles.map(async (dbArt: any) => {
              let localUrl = null;
              let hasPdf = false;
              try {
                localUrl = await getLocalPDFUrl(dbArt.id);
                if (localUrl) hasPdf = true;
              } catch (e) {}
              return {
                id: dbArt.id,
                title: dbArt.title,
                authors: dbArt.authors || [],
                year: dbArt.year || '',
                abstract: dbArt.abstract || '',
                doi: dbArt.doi || '',
                screeningDecisions: dbArt.screening_decisions || {},
                screeningFinal: dbArt.screening_final,
                fullTextDecisions: dbArt.full_text_decisions || {},
                fullTextFinal: dbArt.full_text_final,
                fullTextExclusionReason: dbArt.full_text_exclusion_reason,
                hasPdf,
                pdfUrl: localUrl || undefined,
              };
            })
          );
          setArticles(mapped);
          setRawImportedCount(mapped.length);
          setIsDeduplicated(true);
        }
      }
    } catch (err) {
      console.error('Erro ao carregar estudo:', err);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setActiveStudy(null);
    setCurrentUser(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeStudy) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (text) {
        const rawParsed = parseBibliographicData(text);
        const { duplicatesCount: dups } = deduplicateArticles(rawParsed);

        const mapped: MultiReviewerArticle[] = rawParsed.map((a) => ({
          ...a,
          screeningDecisions: {},
          fullTextDecisions: {},
          screeningFinal: undefined,
          fullTextFinal: undefined,
          pdfFile: null,
          hasPdf: false,
        }));

        setRawImportedArticles(mapped);
        setRawImportedCount(rawParsed.length);
        setPendingDuplicatesCount(dups);
        setDuplicatesRemovedCount(0);
        setIsDeduplicated(false);
        setArticles(mapped);
        setPilotSampleIds([]);
        setSelectedIndex(0);

        setIsSyncing(true);
        try {
          await fetch('/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'BULK_INSERT_ARTICLES',
              payload: { articles: mapped, projectId: activeStudy.id },
            }),
          });
          loadStudies(currentUser.email);
        } finally {
          setIsSyncing(false);
        }
      }
    };
    reader.readAsText(file);
  };

  const handleExecuteDeduplication = () => {
    if (rawImportedArticles.length === 0) return;
    const { uniqueArticles, duplicatesCount: dups } = deduplicateArticles(rawImportedArticles);
    setArticles(uniqueArticles);
    setDuplicatesRemovedCount(dups);
    setPendingDuplicatesCount(0);
    setIsDeduplicated(true);
    setSelectedIndex(0);
  };

  const handleSortearPiloto = () => {
    const sample = drawRandomSample(articles, pilotPercentage);
    setPilotSampleIds(sample.map((s) => s.id));
    setSelectedIndex(0);
    setCurrentStep(2);
  };

  const recordScreeningDecision = async (decision: 'INCLUDED' | 'EXCLUDED' | 'MAYBE') => {
    if (!activeArticle || !activeStudy) return;

    setArticles((prev) =>
      prev.map((art) =>
        art.id === activeArticle.id
          ? { 
              ...art, 
              screeningFinal: decision === 'INCLUDED' || decision === 'EXCLUDED' ? decision : art.screeningFinal,
              screeningDecisions: { ...art.screeningDecisions, [activeScreeningId]: decision } 
            }
          : art
      )
    );
    if (selectedIndex < visibleArticles.length - 1) setSelectedIndex((prev) => prev + 1);

    setIsSyncing(true);
    try {
      await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'VOTE_SCREENING',
          payload: { articleId: activeArticle.id, projectId: activeStudy.id, reviewerId: activeScreeningId, decision },
        }),
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const resolveScreeningConsensus = (articleId: string, finalChoice: 'INCLUDED' | 'EXCLUDED') => {
    setArticles((prev) =>
      prev.map((art) => (art.id === articleId ? { ...art, screeningFinal: finalChoice } : art))
    );
  };

  const recordFullTextDecision = (status: 'INCLUDED' | 'EXCLUDED') => {
    if (!activeArticle) return;
    setArticles((prev) =>
      prev.map((art) =>
        art.id === activeArticle.id
          ? {
              ...art,
              fullTextFinal: status,
              fullTextDecisions: {
                ...art.fullTextDecisions,
                [activeCoderId]: { status, reason: status === 'EXCLUDED' ? exclusionReasonDraft : undefined },
              },
            }
          : art
      )
    );
    setExclusionReasonDraft('');
    if (selectedIndex < visibleArticles.length - 1) setSelectedIndex((prev) => prev + 1);
  };

  const resolveFullTextConsensus = (articleId: string, finalChoice: 'INCLUDED' | 'EXCLUDED', reason?: string) => {
    setArticles((prev) =>
      prev.map((art) =>
        art.id === articleId ? { ...art, fullTextFinal: finalChoice, fullTextExclusionReason: reason } : art
      )
    );
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>, articleId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await saveLocalPDF(articleId, file);
      const localUrl = URL.createObjectURL(file);
      setArticles((prev) =>
        prev.map((art) => (art.id === articleId ? { ...art, pdfFile: file, pdfUrl: localUrl, hasPdf: true } : art))
      );
    } catch (err) {
      console.error('Erro ao salvar PDF:', err);
    }
  };

  const handleSavePastedAnchor = () => {
    if (!activeArticle || !pastedQuoteDraft.trim() || !selectedCodeId) return;

    const newSegment: CodedSegment = {
      id: `seg-${Date.now()}`,
      articleId: activeArticle.id,
      codeId: selectedCodeId,
      reviewerId: activeCoderId,
      selectedText: pastedQuoteDraft.trim(),
      notes: notesDraft.trim(),
      status: 'PROPOSED',
      createdAt: new Date().toLocaleTimeString(),
    };

    setCodedSegments((prev) => [newSegment, ...prev]);
    setPastedQuoteDraft('');
    setNotesDraft('');
  };

  const deleteSegment = (segmentId: string) => {
    setCodedSegments((prev) => prev.filter((s) => s.id !== segmentId));
  };

  const approveGroupInConsensus = (group: OverlapGroup, targetCategoryId: string) => {
    setCodedSegments((prev) =>
      prev.map((s) => {
        if (group.segments.some((g) => g.id === s.id)) {
          return { ...s, codeId: targetCategoryId, status: 'CONSENSUS_APPROVED' };
        }
        return s;
      })
    );
  };

  const rejectGroupInConsensus = (group: OverlapGroup) => {
    setCodedSegments((prev) =>
      prev.map((s) => {
        if (group.segments.some((g) => g.id === s.id)) {
          return { ...s, status: 'REJECTED' };
        }
        return s;
      })
    );
  };

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    const newCategory: CodeCategory = {
      id: `cat-${Date.now()}`,
      name: newCatName.trim(),
      color: '#6366f1',
      definition: newCatDefinition.trim() || 'Sem definição.',
      codingRule: 'Sem regra explícita.',
      anchorSample: 'Sem amostra-âncora.',
    };
    setCategories((prev) => [...prev, newCategory]);
    if (!selectedCodeId) setSelectedCodeId(newCategory.id);
    setNewCatName('');
    setNewCatDefinition('');
    setIsCategoryModalOpen(false);
  };

  const visibleArticles = articles.filter((art) => {
    if (currentStep === 2) return pilotSampleIds.includes(art.id);
    if (currentStep === 3) return !pilotSampleIds.includes(art.id);
    if (currentStep === 4) return true;
    if (currentStep === 5) return art.screeningFinal !== 'EXCLUDED';
    if (currentStep === 6) return true;
    if (currentStep === 7) return art.fullTextFinal !== 'EXCLUDED';
    return true;
  });

  const activeArticle = visibleArticles[selectedIndex] || visibleArticles[0] || null;
  const pilotArticles = articles.filter((a) => pilotSampleIds.includes(a.id));
  const screeningIds = screeningReviewers.map((r) => r.id);
  const calibrationResult = calculateMultiReviewerCalibration(
    pilotArticles.map((a) => ({ decisions: a.screeningDecisions })),
    screeningIds,
    calibrationConfig
  );

  const totalExcludedScreening = articles.filter((a) => a.screeningFinal === 'EXCLUDED').length;
  const totalAssessedFullText = articles.filter((a) => a.screeningFinal === 'INCLUDED' || Object.values(a.screeningDecisions).includes('INCLUDED')).length;
  const totalExcludedFullText = articles.filter((a) => a.fullTextFinal === 'EXCLUDED').length;
  const totalIncludedFinal = articles.filter((a) => a.fullTextFinal === 'INCLUDED' || a.screeningFinal === 'INCLUDED').length;

  const allArticleSegments = codedSegments.filter((s) => s.articleId === activeArticle?.id);
  const displayedSegments = codingSubTab === 'CODING'
    ? allArticleSegments.filter((s) => s.reviewerId === activeCoderId)
    : allArticleSegments;

  const approvedSegmentsCount = codedSegments.filter((s) => s.status === 'CONSENSUS_APPROVED').length;
  const overlapGroups = activeArticle ? groupSegmentsByOverlap(codedSegments, activeArticle.id, codingReviewers.length) : [];

  const handleExportMatrixCSV = () => {
    try {
      const csv = exportMatrixToCSV(codedSegments, categories, articles, codingReviewers);
      downloadCSV('matriz_evidencias_qualitativas.csv', csv);
    } catch (err) {
      console.error('Erro ao exportar CSV:', err);
      alert('Erro ao gerar o arquivo CSV. Verifique se há segmentos codificados.');
    }
  };

  if (!activeStudy) {
    return (
      <main className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col font-sans">
        <header className="h-16 border-b border-slate-800 bg-slate-900/60 backdrop-blur px-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BookOpen className="w-6 h-6 text-indigo-400" />
            <span className="font-bold text-base tracking-wide text-white">TheoryLab</span>
            <span className="text-[11px] bg-indigo-950/60 text-indigo-300 border border-indigo-800 px-2 py-0.5 rounded font-mono">
              Workspace Acadêmico
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs">
            {currentUser ? (
              <div className="flex items-center gap-3">
                <span className="text-slate-400 flex items-center gap-1.5 font-mono">
                  <User className="w-3.5 h-3.5 text-indigo-400" /> {currentUser.email}
                </span>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg font-medium transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-400" /> Sair
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-lg transition-colors"
              >
                Entrar / Cadastrar
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 max-w-6xl w-full mx-auto p-8 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Meus Estudos</h1>
              <p className="text-xs text-slate-400 mt-1">Gerencie seus projetos de revisão sistemática em tempo real.</p>
            </div>
            <button
              onClick={() => setIsNewStudyModalOpen(true)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors shadow-lg shadow-indigo-600/20"
            >
              <Plus className="w-4 h-4" /> Novo Estudo
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="py-3.5 px-6 font-semibold">Título do Estudo</th>
                    <th className="py-3.5 px-6 font-semibold">Meu Papel</th>
                    <th className="py-3.5 px-6 font-semibold">Artigos</th>
                    <th className="py-3.5 px-6 font-semibold">Criado em</th>
                    <th className="py-3.5 px-6 font-semibold text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {loadingStudies ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-500">Carregando estudos...</td>
                    </tr>
                  ) : studies.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-16 text-center text-slate-500 space-y-2">
                        <Folder className="w-8 h-8 mx-auto text-slate-600 opacity-60 mb-2" />
                        <p className="font-semibold text-slate-400 text-sm">Nenhum estudo encontrado.</p>
                      </td>
                    </tr>
                  ) : (
                    studies.map((std) => (
                      <tr
                        key={std.id}
                        className="hover:bg-slate-800/50 transition-colors group cursor-pointer"
                        onClick={() => handleOpenStudy(std)}
                      >
                        <td className="py-4 px-6">
                          <div className="font-bold text-slate-100 group-hover:text-indigo-400 transition-colors text-sm">{std.title}</div>
                          {std.description && <div className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{std.description}</div>}
                        </td>
                        <td className="py-4 px-6">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-indigo-950 text-indigo-300 border-indigo-800">
                            {std.user_role}
                          </span>
                        </td>
                        <td className="py-4 px-6 font-mono text-slate-300">{std.total_articles} referências</td>
                        <td className="py-4 px-6 text-slate-400 font-mono text-[11px]">{new Date(std.created_at).toLocaleDateString()}</td>
                        <td className="py-4 px-6 text-right" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setSharingStudy(std)}
                            className="inline-flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors border border-slate-700"
                          >
                            <Share2 className="w-3.5 h-3.5 text-indigo-400" /> Compartilhar
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {isNewStudyModalOpen && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <FolderPlus className="w-4 h-4 text-indigo-400" /> Criar Novo Estudo
                </h3>
                <button onClick={() => setIsNewStudyModalOpen(false)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
              </div>
              <form onSubmit={handleCreateStudy} className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Título:</label>
                  <input
                    type="text"
                    required
                    value={newStudyTitle}
                    onChange={(e) => setNewStudyTitle(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Descrição:</label>
                  <textarea
                    rows={3}
                    value={newStudyDesc}
                    onChange={(e) => setNewStudyDesc(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                  <button type="button" onClick={() => setIsNewStudyModalOpen(false)} className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300">Cancelar</button>
                  <button type="submit" className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold">Criar</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {sharingStudy && (
          <ShareStudyModal
            isOpen={!!sharingStudy}
            onClose={() => setSharingStudy(null)}
            studyId={sharingStudy.id}
            studyTitle={sharingStudy.title}
            onSharedSuccess={() => loadStudies(currentUser.email)}
          />
        )}
        <AuthModal isOpen={isAuthModalOpen} onSuccess={(user) => { setCurrentUser(user); setIsAuthModalOpen(false); loadStudies(user.email); }} />
      </main>
    );
  }

  return (
    <main className="flex h-screen w-screen bg-slate-900 text-slate-100 font-sans overflow-hidden">
      <aside className="w-80 border-r border-slate-800 flex flex-col bg-slate-950">
        <header className="p-4 border-b border-slate-800 space-y-3">
          <button onClick={() => setActiveStudy(null)} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-indigo-400 font-semibold">
            <ArrowLeft className="w-3.5 h-3.5" /> Voltar aos Estudos
          </button>
          <div className="flex items-center justify-between">
            <h1 className="text-sm font-bold text-white line-clamp-1">{activeStudy.title}</h1>
            <span className="text-xs bg-slate-800 px-2 py-0.5 rounded text-slate-400 font-mono">{articles.length} ref.</span>
          </div>

          <label className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg cursor-pointer text-xs font-semibold transition-colors shadow-lg">
            <FileUp className="w-4 h-4" /> Importar Arquivo (.ris)
            <input type="file" accept=".ris,.txt,.nbib" className="hidden" onChange={handleFileUpload} />
          </label>

          <div className="flex flex-col gap-1 pt-1 text-[11px]">
            <button onClick={() => setCurrentStep(1)} className={`p-1.5 rounded text-left flex items-center justify-between ${currentStep === 1 ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:bg-slate-900'}`}>
              <span>1. Equipes, Piloto & Desduplicação</span>
            </button>
            <button onClick={() => setCurrentStep(2)} disabled={pilotSampleIds.length === 0} className={`p-1.5 rounded text-left flex items-center justify-between disabled:opacity-40 ${currentStep === 2 ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:bg-slate-900'}`}>
              <span>2. Piloto (Resumos)</span>
            </button>
            <button onClick={() => setCurrentStep(3)} disabled={pilotSampleIds.length === 0} className={`p-1.5 rounded text-left flex items-center justify-between disabled:opacity-40 ${currentStep === 3 ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:bg-slate-900'}`}>
              <span>3. Triagem Restante</span>
            </button>
            <button onClick={() => setCurrentStep(4)} className={`p-1.5 rounded text-left flex items-center justify-between ${currentStep === 4 ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:bg-slate-900'}`}>
              <span>4. Consenso (Resumos)</span>
            </button>
            <button onClick={() => setCurrentStep(5)} className={`p-1.5 rounded text-left flex items-center justify-between ${currentStep === 5 ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:bg-slate-900'}`}>
              <span>5. Leitura Integral (PDFs)</span>
            </button>
            <button onClick={() => setCurrentStep(6)} className={`p-1.5 rounded text-left flex items-center justify-between ${currentStep === 6 ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:bg-slate-900'}`}>
              <span>6. Consenso (Leitura Integral)</span>
            </button>
            <button onClick={() => setCurrentStep(7)} className={`p-1.5 rounded text-left flex items-center justify-between ${currentStep === 7 ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:bg-slate-900'}`}>
              <span>7. Análise & Ancoragem</span>
            </button>
            <button onClick={() => setCurrentStep(8)} className={`p-1.5 rounded text-left flex items-center justify-between ${currentStep === 8 ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:bg-slate-900'}`}>
              <span>8. Diagrama PRISMA</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-800">
          {currentStep === 1 || currentStep === 8 ? (
            <div className="p-4 text-xs text-slate-500 text-center">Painel Geral</div>
          ) : (
            visibleArticles.map((art, idx) => {
              const isSelected = activeArticle?.id === art.id;
              return (
                <div key={art.id} onClick={() => setSelectedIndex(idx)} className={`p-3 cursor-pointer transition-colors ${isSelected ? 'bg-slate-800 border-l-4 border-indigo-500' : 'hover:bg-slate-900'}`}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-mono text-slate-400">{art.year}</span>
                    {art.hasPdf && <span className="text-[9px] bg-emerald-950 text-emerald-400 border border-emerald-800 px-1 rounded font-bold">PDF</span>}
                  </div>
                  <h3 className="text-xs font-medium text-slate-200 line-clamp-2">{art.title}</h3>
                </div>
              );
            })
          )}
        </div>
      </aside>

      <section className="flex-1 flex flex-col h-full bg-slate-900 overflow-hidden">
        {currentStep === 1 && (
          <div className="flex-1 p-8 overflow-y-auto max-w-3xl mx-auto flex flex-col justify-center">
            <div className="bg-slate-950 border border-slate-800 p-8 rounded-xl space-y-6 shadow-xl">
              <h2 className="text-xl font-bold text-indigo-400">{activeStudy.title}</h2>
              {rawImportedCount > 0 && (
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3 text-xs">
                  <div className="flex justify-between font-bold">
                    <span>Desduplicação</span>
                    <span>{articles.length} únicos</span>
                  </div>
                  {!isDeduplicated && pendingDuplicatesCount > 0 && (
                    <button onClick={handleExecuteDeduplication} className="w-full bg-rose-600 text-white py-2 rounded-lg font-bold">
                      Remover {pendingDuplicatesCount} Duplicatas
                    </button>
                  )}
                </div>
              )}
              <div className="space-y-2 text-xs">
                <span className="text-slate-300 font-semibold">Tamanho da Amostra Piloto: {pilotPercentage}%</span>
                <input type="range" min={5} max={50} step={5} value={pilotPercentage} onChange={(e) => setPilotPercentage(Number(e.target.value))} className="w-full accent-indigo-500" />
              </div>
              <button onClick={handleSortearPiloto} disabled={articles.length === 0} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white p-3 rounded-lg text-sm font-bold shadow-lg">
                Sortear Amostra e Iniciar Triagem
              </button>
            </div>
          </div>
        )}

        {(currentStep === 2 || currentStep === 3) && activeArticle && (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <div className="flex-1 p-8 overflow-y-auto max-w-4xl mx-auto w-full space-y-4">
              <h2 className="text-xl font-bold text-slate-100">{activeArticle.title}</h2>
              <p className="text-sm text-slate-300 bg-slate-950 p-4 rounded-lg border border-slate-800">{activeArticle.abstract}</p>
            </div>
            <footer className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end gap-3 px-8">
              <button onClick={() => recordScreeningDecision('EXCLUDED')} className="bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white px-4 py-2 rounded-lg text-sm font-semibold">Excluir</button>
              <button onClick={() => recordScreeningDecision('INCLUDED')} className="bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white px-4 py-2 rounded-lg text-sm font-semibold">Incluir</button>
            </footer>
          </div>
        )}

        {currentStep === 4 && (
          <div className="flex-1 p-8 overflow-y-auto max-w-4xl mx-auto w-full space-y-4">
            <h2 className="text-xl font-bold text-indigo-400">Consenso de Resumos</h2>
            {visibleArticles.map((art) => (
              <div key={art.id} className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
                <h3 className="font-bold text-slate-200 text-sm">{art.title}</h3>
                <div className="flex gap-2">
                  <button onClick={() => resolveScreeningConsensus(art.id, 'INCLUDED')} className="px-3 py-1 rounded bg-emerald-600 text-xs font-bold text-white">Aprovar</button>
                  <button onClick={() => resolveScreeningConsensus(art.id, 'EXCLUDED')} className="px-3 py-1 rounded bg-rose-600 text-xs font-bold text-white">Excluir</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {currentStep === 5 && activeArticle && (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <div className="flex-1 p-6 overflow-y-auto max-w-5xl mx-auto w-full space-y-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <h2 className="text-lg font-bold text-slate-100">{activeArticle.title}</h2>
                <label className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded text-xs cursor-pointer border border-slate-700 font-medium">
                  {activeArticle.hasPdf ? 'Substituir PDF Local' : 'Anexar PDF Local'}
                  <input type="file" accept="application/pdf" className="hidden" onChange={(e) => handlePdfUpload(e, activeArticle.id)} />
                </label>
              </div>
              <p className="text-sm text-slate-300 bg-slate-950 p-4 rounded-lg border border-slate-800">{activeArticle.abstract}</p>
            </div>
            <footer className="p-4 bg-slate-950 border-t border-slate-800 flex justify-between px-8">
              <input type="text" placeholder="Motivo PRISMA de exclusão..." value={exclusionReasonDraft} onChange={(e) => setExclusionReasonDraft(e.target.value)} className="bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-200 flex-1 mr-4" />
              <div className="flex gap-3">
                <button onClick={() => recordFullTextDecision('EXCLUDED')} className="bg-rose-600 text-white px-4 py-2 rounded-lg text-sm font-semibold">Excluir</button>
                <button onClick={() => recordFullTextDecision('INCLUDED')} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-semibold">Incluir</button>
              </div>
            </footer>
          </div>
        )}

        {currentStep === 6 && (
          <div className="flex-1 p-8 overflow-y-auto max-w-4xl mx-auto w-full space-y-4">
            <h2 className="text-xl font-bold text-purple-400">Consenso de Texto Integral</h2>
            {visibleArticles.map((art) => (
              <div key={art.id} className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
                <h3 className="font-bold text-slate-200 text-sm">{art.title}</h3>
                <div className="flex gap-2">
                  <button onClick={() => resolveFullTextConsensus(art.id, 'INCLUDED')} className="px-3 py-1 rounded bg-emerald-600 text-xs font-bold text-white">Aprovar Inclusão</button>
                  <button onClick={() => resolveFullTextConsensus(art.id, 'EXCLUDED', 'Consenso')} className="px-3 py-1 rounded bg-rose-600 text-xs font-bold text-white">Confirmar Exclusão</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {currentStep === 7 && (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <div className="bg-slate-950 border-b border-slate-800 px-6 py-2.5 flex items-center justify-between">
              <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-xs">
                <button onClick={() => setCodingSubTab('CODING')} className={`px-3 py-1 rounded ${codingSubTab === 'CODING' ? 'bg-purple-600 text-white font-bold' : 'text-slate-400'}`}>1. Codificação</button>
                <button onClick={() => setCodingSubTab('ALIGNMENT')} className={`px-3 py-1 rounded flex items-center gap-1.5 ${codingSubTab === 'ALIGNMENT' ? 'bg-purple-600 text-white font-bold' : 'text-slate-400'}`}>
                  <Scale className="w-3.5 h-3.5" /> 2. Mesa de Alinhamento
                </button>
              </div>
            </div>

            {activeArticle ? (
              <div className="flex-1 flex flex-col h-full overflow-hidden">
                {codingSubTab === 'CODING' && (
                  <div className="flex-1 flex flex-col h-full overflow-hidden">
                    <div className="flex-1 flex h-1/2 overflow-hidden border-b border-slate-800">
                      <div className="w-1/2 h-full border-r border-slate-800 flex flex-col bg-slate-950">
                        <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs">
                          <span className="text-slate-300 font-bold flex items-center gap-1.5">
                            <FileText className="w-4 h-4 text-indigo-400" /> Leitor do PDF Oficial
                          </span>
                          {activeArticle.pdfUrl && (
                            <a href={activeArticle.pdfUrl} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline text-[11px]">Abrir em Nova Aba ↗</a>
                          )}
                        </div>
                        <div className="flex-1 bg-slate-950 flex items-center justify-center p-2 overflow-hidden">
                          {activeArticle.pdfUrl ? (
                            <iframe src={activeArticle.pdfUrl} className="w-full h-full border-0 rounded" title="PDF Viewer" />
                          ) : (
                            <div className="text-center p-6 text-slate-500 text-xs space-y-2">
                              <p>Nenhum PDF local anexado a este artigo.</p>
                              <p className="text-[11px] text-slate-600">Vá na Etapa 5 ou anexe um PDF para visualizá-lo diretamente na tela.</p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="w-1/2 h-full flex flex-col p-6 overflow-y-auto bg-slate-900/50 space-y-4">
                        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
                          <div className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider">Artigo Selecionado:</div>
                          <div className="text-xs font-semibold text-white line-clamp-2">{activeArticle.title}</div>
                        </div>

                        <div>
                          <label className="text-xs text-slate-300 font-semibold block mb-1.5">Selecione a Categoria Teórica:</label>
                          <select
                            value={selectedCodeId}
                            onChange={(e) => setSelectedCodeId(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 outline-none focus:border-purple-500"
                          >
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-xs text-slate-300 font-semibold block mb-1.5">Nota ou comentário analítico (opcional):</label>
                          <input
                            type="text"
                            placeholder="Ex: Evidência importante sobre o fenômeno..."
                            value={notesDraft}
                            onChange={(e) => setNotesDraft(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 outline-none focus:border-purple-500"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="h-48 bg-slate-950 border-t border-slate-800 p-4 flex flex-col justify-between shadow-2xl z-20">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                          <ClipboardPaste className="w-4 h-4 text-purple-400" /> Caixa de Ancoragem (Cole aqui o trecho do PDF e clique em Ancorar na Matriz):
                        </label>
                      </div>

                      <div className="flex gap-3 h-full">
                        <textarea
                          value={pastedQuoteDraft}
                          onChange={(e) => setPastedQuoteDraft(e.target.value)}
                          placeholder="Clique aqui dentro, digite ou cole (Ctrl+V) livremente o trecho do PDF..."
                          className="flex-1 bg-slate-900 border border-slate-700 rounded-xl p-3 text-slate-100 text-xs font-serif outline-none focus:border-purple-500 shadow-inner resize-none leading-relaxed select-text cursor-text"
                        />
                        <button
                          onClick={handleSavePastedAnchor}
                          disabled={!pastedQuoteDraft.trim()}
                          className="w-48 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-colors shadow-lg shadow-purple-600/20 flex flex-col items-center justify-center gap-1.5 disabled:opacity-40"
                        >
                          <Check className="w-5 h-5" /> Ancorar na Matriz
                        </button>
                      </div>
                    </div>

                    <div className="w-full border-t border-slate-800 p-3 bg-slate-900 flex gap-3 overflow-x-auto max-h-36">
                      <span className="text-[11px] font-bold text-slate-400 flex items-center shrink-0">
                        <Tag className="w-3.5 h-3.5 mr-1 text-purple-400" /> Ancoragens Salvas ({displayedSegments.length}):
                      </span>
                      {displayedSegments.map((seg) => {
                        const cat = categories.find((c) => c.id === seg.codeId);
                        return (
                          <div key={seg.id} className="p-2 rounded border border-slate-800 bg-slate-950 text-xs flex flex-col justify-between shrink-0 w-64">
                            <div>
                              <span className="text-[10px] text-indigo-400 font-bold block mb-0.5">[{cat?.name || 'Categoria'}]</span>
                              <p className="italic text-slate-300 line-clamp-2">"{seg.selectedText}"</p>
                            </div>
                            <button onClick={() => deleteSegment(seg.id)} className="text-rose-400 hover:underline text-[10px] text-right mt-1">Excluir</button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {codingSubTab === 'ALIGNMENT' && (
                  <div className="flex-1 p-8 overflow-y-auto max-w-5xl mx-auto w-full space-y-6">
                    <h3 className="text-lg font-bold text-purple-400">Mesa de Alinhamento Inter-Codificadores</h3>
                    {overlapGroups.length === 0 ? (
                      <div className="p-8 bg-slate-950 border border-slate-800 rounded-xl text-center text-slate-500 text-xs">Nenhum trecho codificado ainda.</div>
                    ) : (
                      <div className="space-y-4">
                        {overlapGroups.map((group) => (
                          <div key={group.id} className="p-5 rounded-xl border bg-slate-950 border-slate-800 space-y-4">
                            <blockquote className="text-sm italic text-slate-200 p-3.5 bg-slate-900 rounded-lg border border-slate-800 font-serif">"{group.representativeText}"</blockquote>
                            <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-800">
                              <button onClick={() => rejectGroupInConsensus(group)} className="px-3 py-1.5 rounded bg-rose-600/20 text-rose-300">Rejeitar</button>
                              <button onClick={() => approveGroupInConsensus(group, categories[0].id)} className="px-4 py-1.5 rounded bg-emerald-600 text-white font-bold">Validar Acordo</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-slate-500">Nenhum artigo incluído.</div>
            )}
          </div>
        )}

        {currentStep === 8 && (
          <div className="flex-1 p-8 overflow-y-auto max-w-5xl mx-auto w-full space-y-6">
            <header className="pb-4 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-xl font-bold text-indigo-400">Fluxograma PRISMA-ScR</h2>
              <button onClick={handleExportMatrixCSV} className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold">
                <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-400" /> Matriz Qualitativa (.csv)
              </button>
            </header>
            <PrismaDiagram metrics={{ totalImported: rawImportedCount || articles.length, duplicatesRemoved: duplicatesRemovedCount, recordsScreened: articles.length, pilotCount: pilotSampleIds.length, pilotAgreements: calibrationResult?.agreements || 0, pilotPo: calibrationResult?.po || 0, pilotKappa: calibrationResult?.kappa || 0, excludedScreening: totalExcludedScreening, includedScreening: totalAssessedFullText, reportsSought: totalAssessedFullText, reportsNotRetrieved: 0, reportsAssessed: totalAssessedFullText, excludedFullText: totalExcludedFullText, includedFinal: totalIncludedFinal, codedSegments: codedSegments.length, consensusApprovedSegments: approvedSegmentsCount }} />
          </div>
        )}
      </section>

      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h3 className="text-md font-bold text-slate-100 flex items-center gap-2"><Tag className="w-4 h-4 text-indigo-400" /> Nova Categoria Teórica</h3>
              <button onClick={() => setIsCategoryModalOpen(false)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleAddCategory} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Nome:</label>
                <input type="text" required value={newCatName} onChange={(e) => setNewCatName(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200 outline-none" />
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Definição:</label>
                <textarea rows={2} value={newCatDefinition} onChange={(e) => setNewCatDefinition(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200 outline-none" />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button type="button" onClick={() => setIsCategoryModalOpen(false)} className="px-3 py-1.5 rounded bg-slate-800 text-slate-300">Cancelar</button>
                <button type="submit" className="px-4 py-1.5 rounded bg-indigo-600 text-white font-bold">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}