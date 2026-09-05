import { CodedSegment, CodeCategory } from './codebook';

export function downloadCSV(filename: string, csvContent: string) {
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportMatrixToCSV(
  segments: CodedSegment[],
  categories: CodeCategory[],
  articles: Array<{ id: string; title: string; authors: string[]; year?: string; doi?: string }>
) {
  const headers = [
    'ID Estudo',
    'Título',
    'Ano',
    'Autores',
    'DOI',
    'Categoria Teórica',
    'Trecho Ancorado (Verbatim)',
    'Notas do Revisor',
    'Data/Hora',
  ];

  const rows = segments.map((seg) => {
    const art = articles.find((a) => a.id === seg.articleId);
    const cat = categories.find((c) => c.id === seg.codeId);

    const escape = (val?: string) => `"${(val || '').replace(/"/g, '""')}"`;

    return [
      escape(seg.articleId),
      escape(art?.title),
      escape(art?.year),
      escape(art?.authors.join('; ')),
      escape(art?.doi),
      escape(cat?.name || 'Sem Categoria'),
      escape(seg.selectedText),
      escape(seg.notes),
      escape(seg.createdAt),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

export function exportPRISMASummaryToCSV(data: {
  totalImported: number;
  pilotCount: number;
  pilotAgreements: number;
  pilotPo: number;
  pilotKappa: number;
  excludedScreening: number;
  includedFullText: number;
  totalAnchoredSegments: number;
}) {
  const rows = [
    ['Métrica PRISMA-ScR / Rigor', 'Valor'],
    ['Registros Brutos Identificados', data.totalImported],
    ['Tamanho da Amostra Piloto de Calibração', data.pilotCount],
    ['Concordância Observada no Piloto (%)', `${data.pilotPo}%`],
    ['Kappa de Cohen no Piloto (κ)', data.pilotKappa],
    ['Estudos Excluídos na Triagem de Título/Resumo', data.excludedScreening],
    ['Estudos Incluídos para Análise Textual Integral', data.includedFullText],
    ['Total de Segmentos Empíricos Ancorados', data.totalAnchoredSegments],
  ];

  return rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
}