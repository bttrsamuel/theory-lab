import { CodedSegment, CodeCategory } from './codebook';

export function exportMatrixToCSV(
  segments: CodedSegment[],
  categories: CodeCategory[],
  articles?: any[],
  reviewers?: any[]
): string {
  const articleMap = new Map();
  if (articles) {
    articles.forEach((art) => {
      articleMap.set(art.id, art);
    });
  }

  // Cabeçalho analítico limpo no padrão de matriz qualitativa (MAXQDA)
  const headers = ['Categoria Teórica', 'Trecho Ancorado (Verbatim)', 'Autor(es)', 'Ano', 'Título do Artigo', 'DOI'];
  const rows: string[] = [];

  // Agrupa e ordena os registros por Categoria Teórica
  categories.forEach((cat) => {
    const catSegments = segments.filter((s) => s.codeId === cat.id);

    catSegments.forEach((s) => {
      const article = articleMap.get(s.articleId) || {};
      
      // Limpeza robusta contra qualquer texto de interface ou botões capturados acidentalmente
      let cleanText = s.selectedText || '';
      cleanText = cleanText
        .replace(/Ancorar na Categoria:[\s\S]*/gi, '')
        .replace(/Cancelar\s*Salvar Ancoragem[\s\S]*/gi, '')
        .replace(/"/g, '""')
        .trim();

      const rowData = [
        `"${cat.name.replace(/"/g, '""')}"`,
        `"${cleanText}"`,
        `"${(article.authors || article.author || 'Desconhecido').replace(/"/g, '""')}"`,
        `"${article.year || article.pubYear || ''}"`,
        `"${(article.title || article.titleText || 'Estudo sem título').replace(/"/g, '""')}"`,
        `"${article.doi || ''}"`,
      ];

      rows.push(rowData.join(','));
    });
  });

  return [headers.join(','), ...rows].join('\n');
}

export function downloadCSV(filename: string, csvContent: string) {
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' }); // \uFEFF preserva acentuação no Excel
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}