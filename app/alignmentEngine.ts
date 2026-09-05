import { CodedSegment, CodeCategory } from './codebook';

export interface OverlapGroup {
  id: string;
  articleId: string;
  representativeText: string;
  segments: CodedSegment[];
  isUnanimous: boolean; // Bateu 100% em categoria e trecho
  assignedCategoryIds: string[];
  status: 'AGREED' | 'DISPUTED' | 'UNILATERAL';
}

function cleanForComparison(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Verifica se dois trechos têm sobreposição significativa (> 40% de palavras em comum ou um contido no outro)
function isTextOverlapping(textA: string, textB: string): boolean {
  const cleanA = cleanForComparison(textA);
  const cleanB = cleanForComparison(textB);

  if (cleanA.includes(cleanB) || cleanB.includes(cleanA)) return true;

  const wordsA = new Set(cleanA.split(' '));
  const wordsB = new Set(cleanB.split(' '));

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }

  const union = new Set([...wordsA, ...wordsB]).size;
  if (union === 0) return false;

  return intersection / union >= 0.35;
}

export function groupSegmentsByOverlap(
  segments: CodedSegment[],
  articleId: string,
  totalCoders: number
): OverlapGroup[] {
  const articleSegs = segments.filter((s) => s.articleId === articleId);
  const groups: OverlapGroup[] = [];
  const visited = new Set<string>();

  for (let i = 0; i < articleSegs.length; i++) {
    const current = articleSegs[i];
    if (visited.has(current.id)) continue;

    const currentGroup: CodedSegment[] = [current];
    visited.add(current.id);

    for (let j = i + 1; j < articleSegs.length; j++) {
      const candidate = articleSegs[j];
      if (visited.has(candidate.id)) continue;

      if (isTextOverlapping(current.selectedText, candidate.selectedText)) {
        currentGroup.push(candidate);
        visited.add(candidate.id);
      }
    }

    const assignedCategoryIds = Array.from(new Set(currentGroup.map((s) => s.codeId)));
    const uniqueCoders = new Set(currentGroup.map((s) => s.reviewerId));

    // Bateu se: mais de um codificador marcou E todos escolheram a mesma categoria
    const isUnanimous = uniqueCoders.size >= Math.min(2, totalCoders) && assignedCategoryIds.length === 1;
    const isDisputed = uniqueCoders.size >= 2 && assignedCategoryIds.length > 1;

    let status: 'AGREED' | 'DISPUTED' | 'UNILATERAL' = 'UNILATERAL';
    if (isUnanimous) status = 'AGREED';
    else if (isDisputed) status = 'DISPUTED';

    // Escolhe o texto mais completo do grupo para representação
    const representative = currentGroup.reduce((a, b) =>
      a.selectedText.length >= b.selectedText.length ? a : b
    ).selectedText;

    groups.push({
      id: `group-${current.id}`,
      articleId,
      representativeText: representative,
      segments: currentGroup,
      isUnanimous,
      assignedCategoryIds,
      status,
    });
  }

  return groups;
}