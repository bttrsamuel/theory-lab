import { Article } from './risParser';

export interface DeduplicationResult<T extends Article> {
  uniqueArticles: T[];
  duplicatesCount: number;
  duplicateDetails: Array<{
    originalTitle: string;
    duplicateTitle: string;
    doi?: string;
  }>;
}

function cleanString(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^\w\s]/gi, '') // remove pontuação
    .replace(/\s+/g, ' ') // normaliza espaços
    .trim();
}

function normalizeDoi(doi?: string): string {
  if (!doi) return '';
  return doi
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, '')
    .replace(/^doi:\s*/, '');
}

export function deduplicateArticles<T extends Article>(articles: T[]): DeduplicationResult<T> {
  const seenDois = new Set<string>();
  const seenTitles = new Set<string>();

  const uniqueArticles: T[] = [];
  const duplicateDetails: Array<{ originalTitle: string; duplicateTitle: string; doi?: string }> = [];

  for (const article of articles) {
    const cleanDoi = normalizeDoi(article.doi);
    const cleanedTitle = cleanString(article.title);

    let isDuplicate = false;

    // 1. Verificação por DOI
    if (cleanDoi && seenDois.has(cleanDoi)) {
      isDuplicate = true;
      duplicateDetails.push({
        originalTitle: 'Identificado por DOI',
        duplicateTitle: article.title,
        doi: article.doi,
      });
    } 
    // 2. Verificação por Título normalizado (caso sem DOI ou DOI não casado)
    else if (cleanedTitle && seenTitles.has(cleanedTitle)) {
      isDuplicate = true;
      duplicateDetails.push({
        originalTitle: 'Identificado por Título',
        duplicateTitle: article.title,
        doi: article.doi,
      });
    }

    if (!isDuplicate) {
      if (cleanDoi) seenDois.add(cleanDoi);
      if (cleanedTitle) seenTitles.add(cleanedTitle);
      uniqueArticles.push(article);
    }
  }

  return {
    uniqueArticles,
    duplicatesCount: articles.length - uniqueArticles.length,
    duplicateDetails,
  };
}