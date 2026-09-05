import { CodedSegment } from './codebook';

export interface OverlapGroup {
  id: string;
  articleId: string;
  representativeText: string;
  segments: CodedSegment[];
  assignedCategoryIds: string[];
  status: 'AGREED' | 'DISPUTED' | 'UNILATERAL';
}

export function groupSegmentsByOverlap(
  segments: CodedSegment[],
  articleId: string,
  totalReviewers: number
): OverlapGroup[] {
  const articleSegments = segments.filter((s) => s.articleId === articleId && s.status !== 'REJECTED');
  const groups: OverlapGroup[] = [];

  articleSegments.forEach((seg) => {
    // Procura se já existe um grupo com trecho similar
    let existingGroup = groups.find((g) =>
      g.segments.some(
        (s) =>
          s.selectedText.toLowerCase().includes(seg.selectedText.toLowerCase().slice(0, 20)) ||
          seg.selectedText.toLowerCase().includes(s.selectedText.toLowerCase().slice(0, 20))
      )
    );

    if (existingGroup) {
      // Evita duplicar o mesmo revisor no mesmo grupo
      if (!existingGroup.segments.some((s) => s.reviewerId === seg.reviewerId)) {
        existingGroup.segments.push(seg);
        if (!existingGroup.assignedCategoryIds.includes(seg.codeId)) {
          existingGroup.assignedCategoryIds.push(seg.codeId);
        }
      }
    } else {
      groups.push({
        id: `group-${Math.random().toString(36).substring(2, 9)}`,
        articleId,
        representativeText: seg.selectedText,
        segments: [seg],
        assignedCategoryIds: [seg.codeId],
        status: 'UNILATERAL',
      });
    }
  });

  // Atualiza o status de cada grupo baseado nos acordos
  return groups.map((g) => {
    const uniqueReviewers = new Set(g.segments.map((s) => s.reviewerId));
    const uniqueCategories = new Set(g.segments.map((s) => s.codeId));

    let status: 'AGREED' | 'DISPUTED' | 'UNILATERAL' = 'UNILATERAL';

    if (uniqueReviewers.size > 1) {
      status = uniqueCategories.size === 1 ? 'AGREED' : 'DISPUTED';
    }

    return { ...g, status };
  });
}