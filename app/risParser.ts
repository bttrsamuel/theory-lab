export interface Article {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  year?: string;
  doi?: string;
  pmid?: string;
  status: 'PENDING' | 'INCLUDED' | 'EXCLUDED' | 'MAYBE';
  exclusionReason?: string;
  hasPdf: boolean;
}

export function parseBibliographicData(rawText: string): Article[] {
  const isPubMed = rawText.includes('PMID-') || rawText.includes('FAU -');
  return isPubMed ? parsePubMed(rawText) : parseRIS(rawText);
}

function parseRIS(rawText: string): Article[] {
  const records = rawText.split(/ER\s+-/g);
  const articles: Article[] = [];

  records.forEach((record, index) => {
    const lines = record.split('\n');
    let title = '';
    let abstract = '';
    let year = '';
    let doi = '';
    const authors: string[] = [];

    lines.forEach((line) => {
      const trimmed = line.trim();
      const tag = trimmed.substring(0, 2);
      const value = trimmed.substring(6).trim();

      if (tag === 'TI' || tag === 'T1') title = value;
      else if (tag === 'AB' || tag === 'N2') abstract = value;
      else if (tag === 'AU' || tag === 'A1') { if (value) authors.push(value); }
      else if (tag === 'PY' || tag === 'Y1') year = value.substring(0, 4);
      else if (tag === 'DO') doi = value;
    });

    if (title || abstract) {
      articles.push({
        id: `art-ris-${index + 1}-${Date.now()}`,
        title: title || 'Sem título identificado',
        authors: authors.length > 0 ? authors : ['Autor desconhecido'],
        abstract: abstract || 'Resumo não disponível neste registro.',
        year: year || 'N/D',
        doi: doi || '',
        status: 'PENDING',
        hasPdf: false,
      });
    }
  });

  return articles;
}

function parsePubMed(rawText: string): Article[] {
  const rawRecords = rawText.split(/(?=PMID-\s*\d+)/g);
  const articles: Article[] = [];

  rawRecords.forEach((record, index) => {
    if (!record.trim()) return;

    const lines = record.split('\n');
    let title = '';
    let abstract = '';
    let year = '';
    let doi = '';
    let pmid = '';
    const authors: string[] = [];
    let currentTag = '';

    lines.forEach((line) => {
      const match = line.match(/^([A-Z]{2,4})\s*-(.*)$/);

      if (match) {
        currentTag = match[1].trim();
        const value = match[2].trim();

        if (currentTag === 'TI') title = value;
        else if (currentTag === 'AB') abstract = value;
        else if (currentTag === 'FAU' || currentTag === 'AU') { if (value) authors.push(value); }
        else if (currentTag === 'DP') {
          const yearMatch = value.match(/\b(19|20)\d{2}\b/);
          if (yearMatch) year = yearMatch[0];
        } else if (currentTag === 'LID' || currentTag === 'AID') {
          if (value.includes('[doi]')) doi = value.replace('[doi]', '').trim();
        } else if (currentTag === 'PMID') {
          pmid = value;
        }
      } else if (currentTag && line.startsWith('      ')) {
        const continuation = line.trim();
        if (currentTag === 'TI') title += ' ' + continuation;
        else if (currentTag === 'AB') abstract += ' ' + continuation;
      }
    });

    if (title || abstract) {
      articles.push({
        id: `art-pmid-${pmid || index + 1}-${Date.now()}`,
        title: title || 'Sem título identificado',
        authors: authors.length > 0 ? authors : ['Autor desconhecido'],
        abstract: abstract || 'Resumo não disponível neste registro.',
        year: year || 'N/D',
        doi: doi || '',
        pmid: pmid || '',
        status: 'PENDING',
        hasPdf: false,
      });
    }
  });

  return articles;
}