'use client';

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
import { saveLocalPDF, getLocalPDFUrl } from './pdfStorage';
import { 
  BookOpen, Users, Lock, Unlock, FileUp, Tag, 
  Quote, Plus, X, Shuffle, Check, AlertCircle, 
  FileSpreadsheet, GitPullRequest, SlidersHorizontal, 
  UserCheck, FileText, Eye, Layers, CopyX, Sparkles, Scale, 
  FolderPlus, Share2, ArrowLeft, LogOut, Folder, Calendar, User
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
  pdfFile?: File | null;
  pdfUrl?: string;
  fullTextContent?: string;
}

interface StudySummary {
  id: string;
  title: string;
  description?: string;
  created_at: string;
  owner_email: string;
  user_role: string;
  total_articles: number;
  shared_members?: Array<{ email: string; role: string }>;
}

export default function Home() {
  // Autenticação
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);

  // Lista de Estudos (Dashboard)
  const [studies, setStudies] = useState<StudySummary[]>([]);
  const [activeStudy, setActiveStudy] = useState<StudySummary | null>(null);
  const [loadingStudies, setLoadingStudies] = useState<boolean>(false);

  // Modal Novo Estudo
  const [isNewStudyModalOpen, setIsNewStudyModalOpen] = useState<boolean>(false);
  const [newStudyTitle, setNewStudyTitle] = useState('');
  const [newStudyDesc, setNewStudyDesc] = useState('');

  // Modal Compartilhar
  const [sharingStudy, setSharingStudy] = useState<StudySummary | null>(null);

  // Estado do Estudo Ativo
  const [articles, setArticles] = useState<MultiReviewerArticle[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const [rawImportedArticles, setRawImportedArticles] = useState<MultiReviewerArticle[]>([]);
  const [rawImportedCount, setRawImportedCount] = useState<number>(0);
  const [pendingDuplicatesCount, setPendingDuplicatesCount] = useState<number>(0);
  const [duplicatesRemovedCount, setDuplicatesRemovedCount] = useState<number>(0);
  const [isDeduplicated, setIsDeduplicated] = useState<boolean>(false);

  // 1. Equipe de Triagem de Resumos
  const [screeningReviewers, setScreeningReviewers] = useState<Member[]>([
    { id: 'scr-1', name: 'Triador 1' },
    { id: 'scr-2', name: 'Triador 2' },
  ]);
  const [activeScreeningId, setActiveScreeningId] = useState<string>('scr-1');
  const [newScreeningDraft, setNewScreeningDraft] = useState<string>('');

  // 2. Equipe de Leitura Integral & Codificação
  const [codingReviewers, setCodingReviewers] = useState<Member[]>([
    { id: 'cod-1', name: 'Codificador 1' },
    { id: 'cod-2', name: 'Codificador 2' },
  ]);
  const [activeCoderId, setActiveCoderId] = useState<string>('cod-1');
  const [newCoderDraft, setNewCoderDraft] = useState<string>('');

  const [isBlinded, setIsBlinded] = useState<boolean>(true);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8>(1);
  const [codingSubTab, setCodingSubTab] = useState<'CODING' | 'ALIGNMENT'>('CODING');
  const [analysisViewType, setAnalysisViewType] = useState<'SPLIT' | 'PDF_ONLY' | 'TEXT_ONLY'>('SPLIT');

  const [pilotPercentage, setPilotPercentage] = useState<number>(15);
  const [pilotSampleIds, setPilotSampleIds] = useState<string[]>([]);
  const [calibrationConfig, setCalibrationConfig] = useState<CalibrationConfig>({
    method: 'PERCENTAGE',
    minPercentage: 80,
    minKappa: 0.6,
  });

  const [exclusionReasonDraft, setExclusionReasonDraft] = useState<string>('');
  const [categories, setCategories] = useState<CodeCategory[]>([]);
  const [selectedCodeId, setSelectedCodeId] = useState<string>('');
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState<boolean>(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatDefinition, setNewCatDefinition] = useState('');
  const [newCatRule, setNewCatRule] = useState('');
  const [newCatAnchor, setNewCatAnchor] = useState('');

  const [codedSegments, setCodedSegments] = useState<CodedSegment[]>([]);
  const [selectedTextDraft, setSelectedTextDraft] = useState<string>('');
  const [notesDraft, setNotesDraft] = useState<string>('');

  // Gerenciamento de Membros das Equipes
  const handleAddScreeningReviewer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newScreeningDraft.trim()) return;
    setScreeningReviewers((prev) => [
      ...prev,
      { id: `scr-${Date.now()}`, name: newScreeningDraft.trim() },
    ]);
    setNewScreeningDraft('');
  };

  const handleRemoveScreeningReviewer = (id: string) => {
    if (screeningReviewers.length <= 1) return;
    const remaining = screeningReviewers.filter((r) => r.id !== id);
    setScreeningReviewers(remaining);
    if (activeScreeningId === id) setActiveScreeningId(remaining[0]?.id || '');
  };

  const handleAddCodingReviewer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCoderDraft.trim()) return;
    setCodingReviewers((prev) => [
      ...prev,
      { id: `cod-${Date.now()}`, name: newCoderDraft.trim() },
    ]);
    setNewCoderDraft('');
  };

  const handleRemoveCodingReviewer = (id: string) => {
    if (codingReviewers.length <= 1) return;
    const remaining = codingReviewers.filter((r) => r.id !== id);
    setCodingReviewers(remaining);
    if (activeCoderId === id) setActiveCoderId(remaining[0]?.id || '');
  };

  // 1. Checa Sessão do Usuário
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

  // 2. Busca lista de estudos do usuário logado
  const loadStudies = async (email: string) => {
    setLoadingStudies(true);
    try {
      const res = await fetch(`/api/studies?email=${encodeURIComponent(email)}`);
      if (res.ok) {
        const data = await res.json();
        setStudies(data.studies || []);
      }
    } finally {
      setLoadingStudies(false);
    }
  };

  // 3. Criar Novo Estudo
  const handleCreateStudy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudyTitle.trim() || !currentUser?.email) return;

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

    if (res.ok) {
      setNewStudyTitle('');
      setNewStudyDesc('');
      setIsNewStudyModalOpen(false);
      loadStudies(currentUser.email);
    }
  };

  // 4. Selecionar um Estudo para Trabalhar
  const handleOpenStudy = async (study: StudySummary) => {
    setActiveStudy(study);
    setArticles([]);
    setSelectedIndex(0);
    setCurrentStep(1);

    try {
      const res = await fetch(`/api/sync?projectId=${study.id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.articles) {
          const mapped: MultiReviewerArticle[] = data.articles.map((dbArt: any) => ({
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
            fullTextContent: dbArt.full_text_content || '',
          }));
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

  // Upload dos Artigos Brutos (.ris)
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
          fullTextContent: `[Texto do Estudo: ${a.title}]\n\n1. Introdução Teórica\nEstudo direcionado à fundamentação conceitual e levantamento de evidências empíricas.\n\n2. Métodos e Evidências Empíricas\nResultados obtidos mediante observação de campo e análise documental.\n\n3. Discussão dos Resultados\nApresentação de dados com implicações diretas sobre as categorias a priori.`,
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
          ? { ...art, screeningDecisions: { ...art.screeningDecisions, [activeScreeningId]: decision } }
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
          payload: {
            articleId: activeArticle.id,
            projectId: activeStudy.id,
            reviewerId: activeScreeningId,
            decision,
          },
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

    await saveLocalPDF(articleId, file);
    const localUrl = URL.createObjectURL(file);

    setArticles((prev) =>
      prev.map((art) => (art.id === articleId ? { ...art, pdfFile: file, pdfUrl: localUrl, hasPdf: true } : art))
    );
  };

  const handleTextSelection = () => {
    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : '';
    if (text.length > 5) setSelectedTextDraft(text);
  };

  const saveCodedSegment = () => {
    if (!activeArticle || !selectedTextDraft || !selectedCodeId) return;
    const newSegment: CodedSegment = {
      id: `seg-${Date.now()}`,
      articleId: activeArticle.id,
      codeId: selectedCodeId,
      reviewerId: activeCoderId,
      selectedText: selectedTextDraft,
      notes: notesDraft,
      status: 'PROPOSED',
      createdAt: new Date().toLocaleTimeString(),
    };
    setCodedSegments((prev) => [newSegment, ...prev]);
    setSelectedTextDraft('');
    setNotesDraft('');
  };

  const deleteSegment = (segmentId: string) => {
    setCodedSegments((prev) => prev.filter((s) => s.id !== segmentId));
  };

  const approveGroupInConsensus = (group: OverlapGroup, targetCategoryId: string) => {
    setCodedSegments((prev) =>
      prev.map((s) => {
        const belongsToGroup = group.segments.some((g) => g.id === s.id);
        if (belongsToGroup) {
          return {
            ...s,
            codeId: targetCategoryId,
            status: 'CONSENSUS_APPROVED',
          };
        }
        return s;
      })
    );
  };

  const rejectGroupInConsensus = (group: OverlapGroup) => {
    setCodedSegments((prev) =>
      prev.map((s) => {
        const belongsToGroup = group.segments.some((g) => g.id === s.id);
        if (belongsToGroup) {
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
      codingRule: newCatRule.trim() || 'Sem regra explícita.',
      anchorSample: newCatAnchor.trim() || 'Sem amostra-âncora.',
    };
    setCategories((prev) => [...prev, newCategory]);
    if (!selectedCodeId) setSelectedCodeId(newCategory.id);
    setNewCatName('');
    setNewCatDefinition('');
    setNewCatRule('');
    setNewCatAnchor('');
    setIsCategoryModalOpen(false);
  };

  // Filtros de Artigos Visíveis
  const visibleArticles = articles.filter((art) => {
    if (currentStep === 2) return pilotSampleIds.includes(art.id);
    if (currentStep === 3) return !pilotSampleIds.includes(art.id);
    if (currentStep === 4) {
      const votes = screeningReviewers
        .map((r) => art.screeningDecisions[r.id])
        .filter((v): v is 'INCLUDED' | 'EXCLUDED' | 'MAYBE' => v !== undefined);
      return new Set(votes).size > 1 && !art.screeningFinal;
    }
    if (currentStep === 5) {
      const votes = screeningReviewers.map((r) => art.screeningDecisions[r.id]);
      const allIncluded = votes.length > 0 && votes.every((v) => v === 'INCLUDED');
      return art.screeningFinal === 'INCLUDED' || allIncluded;
    }
    if (currentStep === 6) {
      const fullVotes = codingReviewers
        .map((r) => art.fullTextDecisions[r.id]?.status)
        .filter((v): v is 'INCLUDED' | 'EXCLUDED' | 'MAYBE' => v !== undefined);
      return new Set(fullVotes).size > 1 && !art.fullTextFinal;
    }
    if (currentStep === 7) {
      const fullVotes = codingReviewers.map((r) => art.fullTextDecisions[r.id]?.status);
      const allFullIncluded = fullVotes.length > 0 && fullVotes.every((v) => v === 'INCLUDED');
      return art.fullTextFinal === 'INCLUDED' || allFullIncluded;
    }
    return true;
  });

  const activeArticle = visibleArticles[selectedIndex] || visibleArticles[0] || null;

  // Estatísticas PRISMA
  const pilotArticles = articles.filter((a) => pilotSampleIds.includes(a.id));
  const screeningIds = screeningReviewers.map((r) => r.id);
  const calibrationResult = calculateMultiReviewerCalibration(
    pilotArticles.map((a) => ({ decisions: a.screeningDecisions })),
    screeningIds,
    calibrationConfig
  );

  const totalExcludedScreening = articles.filter((a) => {
    if (a.screeningFinal === 'EXCLUDED') return true;
    const votes = screeningReviewers.map((r) => a.screeningDecisions[r.id]);
    return votes.length > 0 && votes.every((v) => v === 'EXCLUDED');
  }).length;

  const totalAssessedFullText = articles.filter((a) => {
    if (a.screeningFinal === 'INCLUDED') return true;
    const votes = screeningReviewers.map((r) => a.screeningDecisions[r.id]);
    return votes.length > 0 && votes.every((v) => v === 'INCLUDED');
  }).length;

  const totalExcludedFullText = articles.filter((a) => {
    if (a.fullTextFinal === 'EXCLUDED') return true;
    const votes = codingReviewers.map((r) => a.fullTextDecisions[r.id]?.status);
    return votes.length > 0 && votes.every((v) => v === 'EXCLUDED');
  }).length;

  const totalIncludedFinal = articles.filter((a) => {
    if (a.fullTextFinal === 'INCLUDED') return true;
    const votes = codingReviewers.map((r) => a.fullTextDecisions[r.id]?.status);
    return votes.length > 0 && votes.every((v) => v === 'INCLUDED');
  }).length;

  const allArticleSegments = codedSegments.filter((s) => s.articleId === activeArticle?.id);
  const displayedSegments = isBlinded && codingSubTab === 'CODING'
    ? allArticleSegments.filter((s) => s.reviewerId === activeCoderId)
    : allArticleSegments;

  const approvedSegmentsCount = codedSegments.filter((s) => s.status === 'CONSENSUS_APPROVED').length;

  const overlapGroups = activeArticle
    ? groupSegmentsByOverlap(codedSegments, activeArticle.id, codingReviewers.length)
    : [];

  const handleExportMatrixCSV = () => {
    const csv = exportMatrixToCSV(codedSegments, categories, articles, codingReviewers);
    downloadCSV('matriz_evidencias_qualitativas.csv', csv);
  };

  // ==========================================
  // VISTA 1: DASHBOARD DE ESTUDOS (WORKSPACE)
  // ==========================================
  if (!activeStudy) {
    return (
      <main className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col font-sans">
        {/* Topbar do Dashboard */}
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

        {/* Conteúdo Central */}
        <div className="flex-1 max-w-6xl w-full mx-auto p-8 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Meus Estudos</h1>
              <p className="text-xs text-slate-400 mt-1">
                Gerencie seus projetos de revisão sistemática e colabore com outros pesquisadores em tempo real.
              </p>
            </div>

            <button
              onClick={() => setIsNewStudyModalOpen(true)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors shadow-lg shadow-indigo-600/20"
            >
              <Plus className="w-4 h-4" /> Novo Estudo
            </button>
          </div>

          {/* Tabela de Estudos */}
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
                      <td colSpan={5} className="py-12 text-center text-slate-500">
                        Carregando seus estudos no Supabase...
                      </td>
                    </tr>
                  ) : studies.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-16 text-center text-slate-500 space-y-2">
                        <Folder className="w-8 h-8 mx-auto text-slate-600 opacity-60 mb-2" />
                        <p className="font-semibold text-slate-400 text-sm">Nenhum estudo encontrado na sua conta.</p>
                        <p className="text-xs text-slate-600">Clique no botão "+ Novo Estudo" acima para começar.</p>
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
                          <div className="font-bold text-slate-100 group-hover:text-indigo-400 transition-colors text-sm">
                            {std.title}
                          </div>
                          {std.description && (
                            <div className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                              {std.description}
                            </div>
                          )}
                        </td>
                        <td className="py-4 px-6">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                              std.user_role === 'PROPRIETÁRIO'
                                ? 'bg-indigo-950 text-indigo-300 border-indigo-800'
                                : 'bg-purple-950 text-purple-300 border-purple-800'
                            }`}
                          >
                            {std.user_role}
                          </span>
                        </td>
                        <td className="py-4 px-6 font-mono text-slate-300">
                          {std.total_articles} referências
                        </td>
                        <td className="py-4 px-6 text-slate-400 font-mono text-[11px]">
                          {new Date(std.created_at).toLocaleDateString()}
                        </td>
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

        {/* Modal Novo Estudo */}
        {isNewStudyModalOpen && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <FolderPlus className="w-4 h-4 text-indigo-400" /> Criar Novo Estudo
                </h3>
                <button onClick={() => setIsNewStudyModalOpen(false)} className="text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateStudy} className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Título do Estudo / Revisão:</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Impacto da IA na Educação Médica: Scoping Review"
                    value={newStudyTitle}
                    onChange={(e) => setNewStudyTitle(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Descrição / Pergunta Norteadora (opcional):</label>
                  <textarea
                    rows={3}
                    placeholder="Ex: Mapear evidências empíricas com base no protocolo PRISMA-ScR..."
                    value={newStudyDesc}
                    onChange={(e) => setNewStudyDesc(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsNewStudyModalOpen(false)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                  >
                    Criar Estudo
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal Compartilhar */}
        {sharingStudy && (
          <ShareStudyModal
            isOpen={!!sharingStudy}
            onClose={() => setSharingStudy(null)}
            studyId={sharingStudy.id}
            studyTitle={sharingStudy.title}
            onSharedSuccess={() => loadStudies(currentUser.email)}
          />
        )}

        {/* Modal Login/Cadastro */}
        <AuthModal
          isOpen={isAuthModalOpen}
          onSuccess={(user) => {
            setCurrentUser(user);
            setIsAuthModalOpen(false);
            loadStudies(user.email);
          }}
        />
      </main>
    );
  }

  // ==========================================
  // VISTA 2: ESPAÇO DE TRABALHO DO ESTUDO ATIVO
  // ==========================================
  return (
    <main className="flex h-screen w-screen bg-slate-900 text-slate-100 font-sans overflow-hidden">
      {/* Barra Lateral Esquerda */}
      <aside className="w-80 border-r border-slate-800 flex flex-col bg-slate-950">
        <header className="p-4 border-b border-slate-800 space-y-3">
          <button
            onClick={() => setActiveStudy(null)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-indigo-400 transition-colors font-semibold"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Voltar aos Meus Estudos
          </button>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-sm font-bold text-white line-clamp-1">{activeStudy.title}</h1>
              <span className="text-[10px] text-indigo-400 font-mono">Papel: {activeStudy.user_role}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {isSyncing && (
                <span className="text-[10px] text-amber-400 animate-pulse font-mono">● Salvando...</span>
              )}
              <span className="text-xs bg-slate-800 px-2 py-0.5 rounded text-slate-400 font-mono">
                {articles.length} ref.
              </span>
            </div>
          </div>

          <label className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg cursor-pointer text-xs font-semibold transition-colors shadow-lg">
            <FileUp className="w-4 h-4" /> Importar Arquivo (.ris)
            <input type="file" accept=".ris,.txt,.nbib" className="hidden" onChange={handleFileUpload} />
          </label>

          {/* Stepper Metodológico */}
          <div className="flex flex-col gap-1 pt-1 text-[11px]">
            <button
              onClick={() => setCurrentStep(1)}
              className={`p-1.5 rounded text-left flex items-center justify-between ${
                currentStep === 1 ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:bg-slate-900'
              }`}
            >
              <span>1. Equipes, Piloto & Desduplicação</span>
              {pilotSampleIds.length > 0 && <span className="text-[10px] text-emerald-300">✓</span>}
            </button>

            <button
              onClick={() => setCurrentStep(2)}
              disabled={pilotSampleIds.length === 0}
              className={`p-1.5 rounded text-left flex items-center justify-between disabled:opacity-40 ${
                currentStep === 2 ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:bg-slate-900'
              }`}
            >
              <span>2. Piloto (Resumos)</span>
              <span className="text-[10px] font-mono text-slate-400">{pilotSampleIds.length}</span>
            </button>

            <button
              onClick={() => setCurrentStep(3)}
              disabled={pilotSampleIds.length === 0}
              className={`p-1.5 rounded text-left flex items-center justify-between disabled:opacity-40 ${
                currentStep === 3 ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:bg-slate-900'
              }`}
            >
              <span>3. Triagem Restante</span>
              <span className="text-[10px] font-mono text-slate-400">{Math.max(0, articles.length - pilotSampleIds.length)}</span>
            </button>

            <button
              onClick={() => setCurrentStep(4)}
              className={`p-1.5 rounded text-left flex items-center justify-between ${
                currentStep === 4 ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:bg-slate-900'
              }`}
            >
              <span>4. Consenso (Resumos)</span>
            </button>

            <button
              onClick={() => setCurrentStep(5)}
              className={`p-1.5 rounded text-left flex items-center justify-between ${
                currentStep === 5 ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:bg-slate-900'
              }`}
            >
              <span>5. Leitura Integral (PDFs)</span>
              <span className="text-[10px] font-mono text-indigo-300 font-bold">{totalAssessedFullText}</span>
            </button>

            <button
              onClick={() => setCurrentStep(6)}
              className={`p-1.5 rounded text-left flex items-center justify-between ${
                currentStep === 6 ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:bg-slate-900'
              }`}
            >
              <span>6. Consenso (Leitura Integral)</span>
            </button>

            <button
              onClick={() => setCurrentStep(7)}
              className={`p-1.5 rounded text-left flex items-center justify-between ${
                currentStep === 7 ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:bg-slate-900'
              }`}
            >
              <span>7. Análise & Ancoragem</span>
              <span className="text-[10px] font-mono text-emerald-400 font-bold">{totalIncludedFinal}</span>
            </button>

            <button
              onClick={() => setCurrentStep(8)}
              className={`p-1.5 rounded text-left flex items-center justify-between ${
                currentStep === 8 ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:bg-slate-900'
              }`}
            >
              <span>8. Diagrama PRISMA</span>
              <span className="text-[10px] font-mono text-emerald-400 font-bold">PNG</span>
            </button>
          </div>

          {(currentStep === 2 || currentStep === 3) && (
            <div className="pt-2 border-t border-slate-800 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-300 font-semibold flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-indigo-400" /> Triador Ativo:
                </span>
                <button
                  onClick={() => setIsBlinded(!isBlinded)}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${
                    isBlinded ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {isBlinded ? <Lock className="w-3 h-3 text-emerald-400" /> : <Unlock className="w-3 h-3 text-slate-400" />}
                  {isBlinded ? 'Oculto' : 'Aberto'}
                </button>
              </div>

              <select
                value={activeScreeningId}
                onChange={(e) => setActiveScreeningId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-indigo-300 font-semibold"
              >
                {screeningReviewers.map((rev) => (
                  <option key={rev.id} value={rev.id}>{rev.name}</option>
                ))}
              </select>
            </div>
          )}

          {(currentStep === 5 || currentStep === 7) && (
            <div className="pt-2 border-t border-slate-800 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-300 font-semibold flex items-center gap-1">
                  <UserCheck className="w-3.5 h-3.5 text-purple-400" /> Codificador Ativo:
                </span>
                <button
                  onClick={() => setIsBlinded(!isBlinded)}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${
                    isBlinded ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {isBlinded ? <Lock className="w-3 h-3 text-emerald-400" /> : <Unlock className="w-3 h-3 text-slate-400" />}
                  {isBlinded ? 'Oculto' : 'Aberto'}
                </button>
              </div>

              <select
                value={activeCoderId}
                onChange={(e) => setActiveCoderId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-purple-300 font-semibold"
              >
                {codingReviewers.map((rev) => (
                  <option key={rev.id} value={rev.id}>{rev.name}</option>
                ))}
              </select>
            </div>
          )}
        </header>

        {/* Lista de Artigos */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800">
          {currentStep === 1 || currentStep === 8 ? (
            <div className="p-4 text-xs text-slate-500 text-center">
              {currentStep === 1 ? 'Configure equipes e desduplicação ao lado.' : 'Diagrama gerado na tela ao lado.'}
            </div>
          ) : (
            visibleArticles.map((art, idx) => {
              const statusTag = currentStep <= 4
                ? art.screeningDecisions[activeScreeningId]
                : art.fullTextDecisions[activeCoderId]?.status;

              const isSelected = activeArticle?.id === art.id;
              return (
                <div
                  key={art.id}
                  onClick={() => setSelectedIndex(idx)}
                  className={`p-3 cursor-pointer transition-colors ${
                    isSelected ? 'bg-slate-800 border-l-4 border-indigo-500' : 'hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-mono text-slate-400">{art.year}</span>
                    <div className="flex items-center gap-1.5">
                      {art.hasPdf && <span className="text-[9px] bg-emerald-950 text-emerald-400 border border-emerald-800 px-1 rounded font-bold">PDF</span>}
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                          statusTag === 'INCLUDED'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : statusTag === 'EXCLUDED'
                            ? 'bg-rose-950 text-rose-400 border border-rose-800'
                            : 'bg-slate-800 text-slate-500'
                        }`}
                      >
                        {statusTag || 'PENDENTE'}
                      </span>
                    </div>
                  </div>
                  <h3 className="text-xs font-medium text-slate-200 line-clamp-2 leading-relaxed">
                    {art.title}
                  </h3>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Painel Central */}
      <section className="flex-1 flex flex-col h-full bg-slate-900 overflow-hidden">
        {/* ETAPA 1 */}
        {currentStep === 1 && (
          <div className="flex-1 p-8 overflow-y-auto max-w-3xl mx-auto flex flex-col justify-center">
            <div className="bg-slate-950 border border-slate-800 p-8 rounded-xl space-y-6 shadow-xl">
              <div>
                <h2 className="text-xl font-bold text-indigo-400 mb-1">{activeStudy.title}</h2>
                <p className="text-xs leading-relaxed text-slate-400">
                  Gerencie a remoção de duplicatas do arquivo importado, organize a equipe de revisores e calibre a amostra piloto.
                </p>
              </div>

              {/* Desduplicação Manual */}
              {rawImportedCount > 0 && (
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-indigo-400" />
                      <span className="text-xs font-bold text-slate-200">Painel de Desduplicação (DOI + Título)</span>
                    </div>
                    {isDeduplicated ? (
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Desduplicação Aplicada
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800">
                        Ação Pendente
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2 rounded bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">Total Importado</span>
                      <strong className="text-slate-100 font-mono text-sm">{rawImportedCount}</strong>
                    </div>
                    <div className="p-2 rounded bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-rose-400 block">Duplicatas Encontradas</span>
                      <strong className="text-rose-400 font-mono text-sm">
                        {isDeduplicated ? duplicatesRemovedCount : pendingDuplicatesCount}
                      </strong>
                    </div>
                    <div className="p-2 rounded bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-emerald-400 block">Registros Únicos</span>
                      <strong className="text-emerald-400 font-mono text-sm">{articles.length}</strong>
                    </div>
                  </div>

                  {!isDeduplicated && pendingDuplicatesCount > 0 && (
                    <button
                      onClick={handleExecuteDeduplication}
                      className="w-full flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white py-2 rounded-lg text-xs font-bold transition-colors shadow-lg"
                    >
                      <CopyX className="w-4 h-4" /> Remover {pendingDuplicatesCount} Duplicatas Agora
                    </button>
                  )}
                </div>
              )}

              {/* Equipe 1: Triagem de Resumos com Adição e Remoção */}
              <div className="space-y-3 bg-slate-900 p-4 rounded-lg border border-slate-800 text-xs">
                <span className="text-indigo-300 font-semibold flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-indigo-400" /> Equipe de Triagem de Resumos ({screeningReviewers.length}):
                </span>
                <div className="flex flex-wrap gap-2">
                  {screeningReviewers.map((rev) => (
                    <div key={rev.id} className="flex items-center gap-1.5 bg-slate-950 border border-slate-700 px-2.5 py-1 rounded-lg text-slate-200">
                      <span>{rev.name}</span>
                      {screeningReviewers.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveScreeningReviewer(rev.id)}
                          className="text-slate-500 hover:text-rose-400 ml-1 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <form onSubmit={handleAddScreeningReviewer} className="flex gap-2 pt-1">
                  <input
                    type="text"
                    placeholder="Novo avaliador de resumos..."
                    value={newScreeningDraft}
                    onChange={(e) => setNewScreeningDraft(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-slate-200 text-xs outline-none focus:border-indigo-500"
                  />
                  <button type="submit" className="bg-slate-800 hover:bg-slate-700 text-indigo-300 px-3 py-1 rounded text-xs font-semibold transition-colors">
                    Adicionar
                  </button>
                </form>
              </div>

              {/* Equipe 2: Codificação com Adição e Remoção */}
              <div className="space-y-3 bg-slate-900 p-4 rounded-lg border border-slate-800 text-xs">
                <span className="text-purple-300 font-semibold flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-purple-400" /> Equipe de Leitura Integral & Codificação ({codingReviewers.length}):
                </span>
                <div className="flex flex-wrap gap-2">
                  {codingReviewers.map((rev) => (
                    <div key={rev.id} className="flex items-center gap-1.5 bg-slate-950 border border-purple-900/40 px-2.5 py-1 rounded-lg text-slate-200">
                      <span>{rev.name}</span>
                      {codingReviewers.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveCodingReviewer(rev.id)}
                          className="text-slate-500 hover:text-rose-400 ml-1 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <form onSubmit={handleAddCodingReviewer} className="flex gap-2 pt-1">
                  <input
                    type="text"
                    placeholder="Novo codificador..."
                    value={newCoderDraft}
                    onChange={(e) => setNewCoderDraft(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-slate-200 text-xs outline-none focus:border-purple-500"
                  />
                  <button type="submit" className="bg-slate-800 hover:bg-slate-700 text-purple-300 px-3 py-1 rounded text-xs font-semibold transition-colors">
                    Adicionar
                  </button>
                </form>
              </div>

              {/* Piloto e Critério */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 bg-slate-900 p-4 rounded-lg border border-slate-800">
                  <div className="flex justify-between items-center text-xs font-semibold">
                    <span className="text-slate-300">Amostra Piloto:</span>
                    <span className="text-indigo-400 font-mono">{pilotPercentage}%</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={50}
                    step={5}
                    value={pilotPercentage}
                    onChange={(e) => setPilotPercentage(Number(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-500 block">
                    {Math.max(1, Math.round((articles.length * pilotPercentage) / 100))} estudos
                  </span>
                </div>

                <div className="space-y-2 bg-slate-900 p-4 rounded-lg border border-slate-800 text-xs">
                  <span className="text-slate-300 font-semibold block">Critério de Calibração:</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setCalibrationConfig({ ...calibrationConfig, method: 'PERCENTAGE' })}
                      className={`p-2 rounded border text-center ${
                        calibrationConfig.method === 'PERCENTAGE'
                          ? 'bg-indigo-600 text-white font-bold'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      Porcentagem
                    </button>
                    <button
                      type="button"
                      disabled={screeningReviewers.length > 2}
                      onClick={() => setCalibrationConfig({ ...calibrationConfig, method: 'KAPPA' })}
                      className={`p-2 rounded border text-center disabled:opacity-40 ${
                        calibrationConfig.method === 'KAPPA'
                          ? 'bg-indigo-600 text-white font-bold'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      Kappa (κ)
                    </button>
                  </div>
                </div>
              </div>

              <button
                onClick={handleSortearPiloto}
                disabled={articles.length === 0}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white p-3 rounded-lg text-sm font-bold transition-colors disabled:opacity-50 shadow-lg shadow-indigo-600/20"
              >
                <Shuffle className="w-4 h-4" /> Sortear Amostra e Iniciar Triagem de Resumos
              </button>
            </div>
          </div>
        )}

        {/* ETAPA 2 ou 3: Triagem de Resumos */}
        {(currentStep === 2 || currentStep === 3) && activeArticle && (
          <>
            <div className="flex-1 p-8 overflow-y-auto max-w-4xl mx-auto w-full">
              {currentStep === 2 && (
                <div className="mb-4 p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-semibold">Calibração Piloto:</span>
                  {calibrationResult && (
                    <span className="font-mono text-indigo-300">
                      Concordância: {calibrationResult.po}% {screeningReviewers.length === 2 && `| κ: ${calibrationResult.kappa}`}
                    </span>
                  )}
                </div>
              )}

              <header className="mb-6 border-b border-slate-800 pb-4">
                <span className="text-xs font-mono text-indigo-400">Ano: {activeArticle.year} | DOI: {activeArticle.doi || 'N/A'}</span>
                <h2 className="text-xl font-bold text-slate-100 mt-2">{activeArticle.title}</h2>
                <p className="text-xs text-slate-400 mt-2">{activeArticle.authors.join('; ')}</p>
              </header>

              <div>
                <h4 className="text-xs uppercase tracking-wider font-bold text-slate-400 mb-2">Resumo (Abstract)</h4>
                <p className="text-sm leading-relaxed text-slate-300 bg-slate-950/40 p-4 rounded-lg border border-slate-800">
                  {activeArticle.abstract}
                </p>
              </div>
            </div>

            <footer className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-end gap-3 px-8">
              <button
                onClick={() => recordScreeningDecision('EXCLUDED')}
                className="bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              >
                Excluir (Resumo)
              </button>
              <button
                onClick={() => recordScreeningDecision('INCLUDED')}
                className="bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              >
                Aprovar para Leitura Integral
              </button>
            </footer>
          </>
        )}

        {/* ETAPA 4: Consenso Resumos */}
        {currentStep === 4 && (
          <div className="flex-1 p-8 overflow-y-auto max-w-4xl mx-auto w-full">
            <h2 className="text-xl font-bold mb-2 text-indigo-400">Mesa de Consenso da Triagem de Resumos</h2>
            <p className="text-xs text-slate-400 mb-6">Resolva conflitos para decidir quais artigos seguem para leitura integral.</p>
            <div className="space-y-4">
              {visibleArticles.map((art) => (
                <div key={art.id} className="p-4 bg-slate-950 border border-slate-800 rounded-lg">
                  <h3 className="font-bold text-slate-200 text-sm mb-2">{art.title}</h3>
                  <div className="flex flex-wrap gap-2 mb-3 text-xs">
                    {screeningReviewers.map((rev) => (
                      <span key={rev.id} className="p-1.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                        {rev.name}: <strong className="text-indigo-400">{art.screeningDecisions[rev.id] || 'NÃO VOTOU'}</strong>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => resolveScreeningConsensus(art.id, 'INCLUDED')}
                      className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-xs font-bold"
                    >
                      Avançar para Leitura Integral
                    </button>
                    <button
                      onClick={() => resolveScreeningConsensus(art.id, 'EXCLUDED')}
                      className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-700 text-xs font-bold"
                    >
                      Excluir Definitivamente
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ETAPA 5: Leitura Integral (PDFs) */}
        {currentStep === 5 && activeArticle && (
          <>
            <div className="flex-1 p-6 overflow-y-auto max-w-5xl mx-auto w-full">
              <header className="mb-4 pb-3 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs font-mono text-purple-400">Avaliação de Texto Integral</span>
                  <h2 className="text-lg font-bold text-slate-100 mt-0.5">{activeArticle.title}</h2>
                  <p className="text-xs text-slate-400">{activeArticle.authors.join('; ')}</p>
                </div>
                <div>
                  <label className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded text-xs cursor-pointer border border-slate-700 font-medium transition-colors">
                    <FileUp className="w-3.5 h-3.5 text-indigo-400" /> {activeArticle.hasPdf ? 'Substituir PDF Local' : 'Anexar PDF Local'}
                    <input type="file" accept="application/pdf" className="hidden" onChange={(e) => handlePdfUpload(e, activeArticle.id)} />
                  </label>
                </div>
              </header>

              <div className="space-y-3">
                {activeArticle.hasPdf && activeArticle.pdfUrl ? (
                  <div className="w-full h-[520px] rounded-lg border border-slate-800 overflow-hidden bg-slate-950">
                    <iframe src={activeArticle.pdfUrl} className="w-full h-full border-none" title="Visualizador do PDF" />
                  </div>
                ) : (
                  <div className="p-6 bg-slate-950 rounded-lg border border-slate-800 text-slate-200 text-sm leading-relaxed whitespace-pre-line font-serif">
                    <div className="mb-3 p-2.5 bg-indigo-950/40 border border-indigo-800/60 rounded text-xs text-indigo-300 font-sans flex items-center gap-2">
                      <FileText className="w-4 h-4" /> Nenhum PDF anexado localmente. Exibindo texto disponível:
                    </div>
                    {activeArticle.fullTextContent}
                  </div>
                )}
              </div>
            </div>

            <footer className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between px-8">
              <div className="flex items-center gap-2 flex-1 mr-6">
                <span className="text-xs text-slate-400 whitespace-nowrap">Se excluir, informe o motivo PRISMA:</span>
                <input
                  type="text"
                  placeholder="Ex: População não elegível, tipo de desenho inadequado, sem dados primários..."
                  value={exclusionReasonDraft}
                  onChange={(e) => setExclusionReasonDraft(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-200 w-full outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => recordFullTextDecision('EXCLUDED')}
                  className="bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                >
                  Excluir no Texto Integral
                </button>
                <button
                  onClick={() => recordFullTextDecision('INCLUDED')}
                  className="bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                >
                  Incluir na Revisão Final
                </button>
              </div>
            </footer>
          </>
        )}

        {/* ETAPA 6: Consenso Leitura Integral */}
        {currentStep === 6 && (
          <div className="flex-1 p-8 overflow-y-auto max-w-4xl mx-auto w-full">
            <h2 className="text-xl font-bold mb-2 text-purple-400">Mesa de Consenso da Leitura Integral</h2>
            <p className="text-xs text-slate-400 mb-6">Compare os votos de texto completo e decida a inclusão ou exclusão com o motivo definitivo.</p>
            <div className="space-y-4">
              {visibleArticles.map((art) => (
                <div key={art.id} className="p-4 bg-slate-950 border border-slate-800 rounded-lg">
                  <h3 className="font-bold text-slate-200 text-sm mb-2">{art.title}</h3>
                  <div className="space-y-1 mb-4 text-xs">
                    {codingReviewers.map((rev) => {
                      const dec = art.fullTextDecisions[rev.id];
                      return (
                        <div key={rev.id} className="p-2 rounded bg-slate-900 border border-slate-800 flex justify-between">
                          <span>{rev.name}: <strong className="text-purple-300">{dec?.status || 'PENDENTE'}</strong></span>
                          {dec?.reason && <span className="text-slate-400 italic">Motivo: "{dec.reason}"</span>}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => resolveFullTextConsensus(art.id, 'INCLUDED')}
                      className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-xs font-bold"
                    >
                      Aprovar Inclusão Final
                    </button>
                    <button
                      onClick={() => resolveFullTextConsensus(art.id, 'EXCLUDED', 'Critério consensual na leitura integral')}
                      className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-700 text-xs font-bold"
                    >
                      Confirmar Exclusão
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ETAPA 7: Análise, Ancoragem e Pareamento */}
        {currentStep === 7 && (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <div className="bg-slate-950 border-b border-slate-800 px-6 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-300">Modo Qualitativo:</span>
                <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-xs">
                  <button
                    onClick={() => setCodingSubTab('CODING')}
                    className={`px-3 py-1 rounded transition-colors ${codingSubTab === 'CODING' ? 'bg-purple-600 text-white font-bold' : 'text-slate-400 hover:text-white'}`}
                  >
                    1. Codificação Individual às Cegas
                  </button>
                  <button
                    onClick={() => setCodingSubTab('ALIGNMENT')}
                    className={`px-3 py-1 rounded transition-colors flex items-center gap-1.5 ${codingSubTab === 'ALIGNMENT' ? 'bg-purple-600 text-white font-bold' : 'text-slate-400 hover:text-white'}`}
                  >
                    <Scale className="w-3.5 h-3.5" /> 2. Mesa de Alinhamento (Pareamento de Códigos)
                  </button>
                </div>
              </div>

              {codingSubTab === 'CODING' && activeArticle?.hasPdf && (
                <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 p-0.5 rounded-lg text-[11px]">
                  <button
                    onClick={() => setAnalysisViewType('SPLIT')}
                    className={`px-2 py-0.5 rounded ${analysisViewType === 'SPLIT' ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400'}`}
                  >
                    Lado a Lado (PDF + Texto)
                  </button>
                  <button
                    onClick={() => setAnalysisViewType('PDF_ONLY')}
                    className={`px-2 py-0.5 rounded ${analysisViewType === 'PDF_ONLY' ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400'}`}
                  >
                    Somente PDF
                  </button>
                  <button
                    onClick={() => setAnalysisViewType('TEXT_ONLY')}
                    className={`px-2 py-0.5 rounded ${analysisViewType === 'TEXT_ONLY' ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400'}`}
                  >
                    Somente Texto
                  </button>
                </div>
              )}
            </div>

            {activeArticle ? (
              <div className="flex-1 flex h-full overflow-hidden">
                {codingSubTab === 'CODING' && (
                  <>
                    <div className="flex-1 flex flex-col p-4 overflow-y-auto border-r border-slate-800 bg-slate-900/50">
                      <div className={`flex-1 grid gap-4 overflow-hidden ${analysisViewType === 'SPLIT' && activeArticle.hasPdf ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        {activeArticle.hasPdf && activeArticle.pdfUrl && (analysisViewType === 'SPLIT' || analysisViewType === 'PDF_ONLY') && (
                          <div className="flex flex-col h-full rounded-lg border border-slate-800 bg-slate-950 overflow-hidden">
                            <div className="p-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs text-slate-300">
                              <span className="font-semibold flex items-center gap-1.5">
                                <Eye className="w-3.5 h-3.5 text-indigo-400" /> PDF Oficial (Local)
                              </span>
                              <a href={activeArticle.pdfUrl} target="_blank" rel="noreferrer" className="text-[10px] text-indigo-400 hover:underline">
                                Abrir em Nova Aba ↗
                              </a>
                            </div>
                            <iframe src={activeArticle.pdfUrl} className="w-full flex-1 border-none" title="PDF do Estudo" />
                          </div>
                        )}

                        {(analysisViewType === 'SPLIT' || analysisViewType === 'TEXT_ONLY' || !activeArticle.hasPdf) && (
                          <div className="flex flex-col h-full overflow-hidden">
                            <div className="p-2 bg-slate-900/80 rounded-t-lg border border-b-0 border-slate-800 text-xs text-slate-400">
                              Selecione o trecho empírico no texto abaixo para ancorar na categoria teórica:
                            </div>
                            <div 
                              onMouseUp={handleTextSelection}
                              className="flex-1 p-5 bg-slate-950 rounded-b-lg border border-slate-800 text-slate-200 text-sm leading-relaxed whitespace-pre-line select-text cursor-text font-serif overflow-y-auto"
                            >
                              {activeArticle.fullTextContent}
                            </div>
                          </div>
                        )}
                      </div>

                      {selectedTextDraft && (
                        <div className="mt-4 p-4 bg-slate-950 border border-purple-500/50 rounded-lg shadow-xl animate-in fade-in duration-150">
                          <p className="text-xs text-slate-300 italic mb-3 bg-slate-900 p-2.5 rounded border border-slate-800">
                            "{selectedTextDraft}"
                          </p>
                          <div className="mb-3">
                            <label className="text-[11px] text-slate-400 block mb-1">Ancorar na Categoria Teórica:</label>
                            <select
                              value={selectedCodeId}
                              onChange={(e) => setSelectedCodeId(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200"
                            >
                              {categories.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </div>
                          <input
                            type="text"
                            placeholder="Comentário ou nota analítica..."
                            value={notesDraft}
                            onChange={(e) => setNotesDraft(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 mb-3"
                          />
                          <div className="flex justify-end gap-2">
                            <button onClick={() => setSelectedTextDraft('')} className="px-3 py-1 rounded bg-slate-800 text-xs text-slate-400 hover:text-white">
                              Cancelar
                            </button>
                            <button onClick={saveCodedSegment} className="px-4 py-1.5 rounded bg-purple-600 text-white text-xs font-bold hover:bg-purple-700">
                              Salvar Ancoragem
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="w-80 p-4 bg-slate-950 flex flex-col gap-4 overflow-y-auto">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                        <h4 className="text-xs font-bold text-purple-400 flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5" /> Matriz Teórica
                        </h4>
                        <button
                          onClick={() => setIsCategoryModalOpen(true)}
                          className="flex items-center gap-1 bg-purple-600 hover:bg-purple-700 text-white px-2 py-1 rounded text-[11px] font-semibold"
                        >
                          <Plus className="w-3 h-3" /> Nova
                        </button>
                      </div>

                      <div className="space-y-2">
                        {categories.map((c) => (
                          <div key={c.id} onClick={() => setSelectedCodeId(c.id)} className={`p-2.5 rounded border text-xs cursor-pointer transition-colors ${selectedCodeId === c.id ? 'bg-slate-800 border-purple-500' : 'bg-slate-900 border-slate-800'}`}>
                            <div className="font-bold text-slate-200">{c.name}</div>
                            <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{c.definition}</p>
                          </div>
                        ))}
                      </div>

                      <div className="flex-1 pt-2 border-t border-slate-800">
                        <h4 className="text-xs font-bold text-slate-300 mb-2">Minhas Ancoragens ({displayedSegments.length})</h4>
                        {displayedSegments.map((seg) => (
                          <div key={seg.id} className="p-2.5 rounded border border-slate-800 bg-slate-900 text-xs mb-2">
                            <p className="italic text-[11px] text-slate-300">"{seg.selectedText}"</p>
                            <button onClick={() => deleteSegment(seg.id)} className="text-rose-400 hover:underline text-[10px] mt-1.5 block">
                              Excluir
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* 7.2 Mesa de Alinhamento */}
                {codingSubTab === 'ALIGNMENT' && (
                  <div className="flex-1 p-8 overflow-y-auto max-w-5xl mx-auto w-full space-y-6">
                    <div>
                      <h3 className="text-lg font-bold text-purple-400 flex items-center gap-2">
                        <Scale className="w-5 h-5" /> Mesa de Alinhamento Inter-Codificadores
                      </h3>
                      <p className="text-xs text-slate-400 leading-relaxed mt-1">
                        O sistema cruza as marcações textuais dos codificadores e destaca onde houve convergência total (acordo), divergência de enquadramento teórico ou marcação unilateral.
                      </p>
                    </div>

                    {overlapGroups.length === 0 ? (
                      <div className="p-8 bg-slate-950 border border-slate-800 rounded-xl text-center text-slate-500 text-xs">
                        Nenhum trecho foi codificado ainda por nenhum avaliador neste estudo.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {overlapGroups.map((group) => {
                          const isAgreed = group.status === 'AGREED';
                          const isDisputed = group.status === 'DISPUTED';
                          const isApprovedConsensus = group.segments.some((s) => s.status === 'CONSENSUS_APPROVED');

                          return (
                            <div
                              key={group.id}
                              className={`p-5 rounded-xl border transition-all ${
                                isApprovedConsensus
                                  ? 'bg-emerald-950/20 border-emerald-800'
                                  : isAgreed
                                  ? 'bg-indigo-950/20 border-indigo-700/80'
                                  : isDisputed
                                  ? 'bg-amber-950/25 border-amber-600/80'
                                  : 'bg-slate-950 border-slate-800'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  {isApprovedConsensus ? (
                                    <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-300 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-700">
                                      <Check className="w-3.5 h-3.5" /> Aprovado em Consenso Oficial
                                    </span>
                                  ) : isAgreed ? (
                                    <span className="flex items-center gap-1 text-[11px] font-bold text-indigo-300 bg-indigo-950 px-2 py-0.5 rounded border border-indigo-700">
                                      <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> Concordância Total (Bateu 100%)
                                    </span>
                                  ) : isDisputed ? (
                                    <span className="flex items-center gap-1 text-[11px] font-bold text-amber-300 bg-amber-950 px-2 py-0.5 rounded border border-amber-700">
                                      <AlertCircle className="w-3.5 h-3.5 text-amber-400" /> Divergência de Categoria Teórica
                                    </span>
                                  ) : (
                                    <span className="text-[11px] font-bold text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-700">
                                      Marcação Unilateral (Apenas 1 codificador)
                                    </span>
                                  )}
                                </div>

                                <span className="text-[11px] text-slate-400 font-mono">
                                  Codificadores envolvidos: {group.segments.length}
                                </span>
                              </div>

                              <blockquote className="text-sm italic text-slate-200 p-3.5 bg-slate-900/80 rounded-lg border border-slate-800 mb-4 font-serif">
                                "{group.representativeText}"
                              </blockquote>

                              <div className="space-y-2 mb-4">
                                <span className="text-[11px] font-bold text-slate-400 block uppercase tracking-wider">
                                  Enquadramento por Codificador:
                                </span>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  {group.segments.map((seg) => {
                                    const coder = codingReviewers.find((r) => r.id === seg.reviewerId);
                                    const cat = categories.find((c) => c.id === seg.codeId);
                                    return (
                                      <div key={seg.id} className="p-2 rounded bg-slate-900 border border-slate-800">
                                        <div className="flex justify-between items-center mb-1">
                                          <strong className="text-purple-300">{coder?.name || seg.reviewerId}</strong>
                                          <span className="font-mono text-[10px] text-slate-500">{seg.createdAt}</span>
                                        </div>
                                        <div className="text-slate-300 text-[11px]">
                                          Categoria: <strong className="text-indigo-400">{cat?.name || 'Sem Categoria'}</strong>
                                        </div>
                                        {seg.notes && <p className="text-[10px] text-slate-400 italic mt-1">"{seg.notes}"</p>}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                  <span className="text-slate-400">Fixar Categoria Consensual:</span>
                                  <select
                                    id={`select-cat-${group.id}`}
                                    defaultValue={group.assignedCategoryIds[0] || categories[0]?.id}
                                    className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-200 outline-none"
                                  >
                                    {categories.map((c) => (
                                      <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                  </select>
                                </div>

                                <div className="flex gap-2">
                                  <button
                                    onClick={() => rejectGroupInConsensus(group)}
                                    className="px-3 py-1.5 rounded bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white transition-colors"
                                  >
                                    Rejeitar Citação
                                  </button>
                                  <button
                                    onClick={() => {
                                      const selectEl = document.getElementById(`select-cat-${group.id}`) as HTMLSelectElement;
                                      const chosenCat = selectEl ? selectEl.value : group.assignedCategoryIds[0];
                                      approveGroupInConsensus(group, chosenCat);
                                    }}
                                    className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-colors flex items-center gap-1.5"
                                  >
                                    <Check className="w-3.5 h-3.5" /> Validar Acordo & Salvar na Matriz
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-slate-500">
                Nenhum artigo incluído após a leitura integral.
              </div>
            )}
          </div>
        )}

        {/* ETAPA 8: Diagrama PRISMA com Desduplicação */}
        {currentStep === 8 && (
          <div className="flex-1 p-8 overflow-y-auto max-w-5xl mx-auto w-full space-y-6">
            <header className="pb-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-indigo-400 flex items-center gap-2">
                  <GitPullRequest className="w-5 h-5" /> Fluxograma PRISMA-ScR Completo
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Métricas oficiais segregando identificação, desduplicação, triagem de resumos e avaliação de texto integral.
                </p>
              </div>

              <button
                onClick={handleExportMatrixCSV}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-400" /> Matriz Qualitativa (.csv)
              </button>
            </header>

            <PrismaDiagram
              metrics={{
                totalImported: rawImportedCount || articles.length,
                duplicatesRemoved: duplicatesRemovedCount,
                recordsScreened: articles.length,
                pilotCount: pilotSampleIds.length,
                pilotAgreements: calibrationResult?.agreements || 0,
                pilotPo: calibrationResult?.po || 0,
                pilotKappa: calibrationResult?.kappa || 0,
                excludedScreening: totalExcludedScreening,
                includedScreening: totalAssessedFullText,
                reportsSought: totalAssessedFullText,
                reportsNotRetrieved: 0,
                reportsAssessed: totalAssessedFullText,
                excludedFullText: totalExcludedFullText,
                includedFinal: totalIncludedFinal,
                codedSegments: codedSegments.length,
                consensusApprovedSegments: approvedSegmentsCount,
              }}
            />
          </div>
        )}
      </section>

      {/* Modal Categoria */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h3 className="text-md font-bold text-slate-100 flex items-center gap-2">
                <Tag className="w-4 h-4 text-indigo-400" /> Nova Categoria Teórica
              </h3>
              <button onClick={() => setIsCategoryModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddCategory} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Nome da Categoria:</label>
                <input
                  type="text"
                  required
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200 outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Definição Operacional:</label>
                <textarea
                  rows={2}
                  value={newCatDefinition}
                  onChange={(e) => setNewCatDefinition(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200 outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="px-3 py-1.5 rounded bg-slate-800 text-slate-300"
                >
                  Cancelar
                </button>
                <button type="submit" className="px-4 py-1.5 rounded bg-indigo-600 text-white font-bold">
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}