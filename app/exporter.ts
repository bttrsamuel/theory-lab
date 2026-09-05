import { CodedSegment, CodeCategory } from './codebook';

export function exportMatrixToCSV(
  segments: CodedSegment[],
  categories: CodeCategory[],
  articles?: any[],
  reviewers?: any[]
): string {
  const headers = ['Segment ID', 'Article ID', 'Category Name', 'Reviewer ID', 'Selected Text', 'Status', 'Notes'];
  const rows = segments.map((s) => {
    const category = categories.find((c) => c.id === s.codeId);
    return [
      s.id,
      s.articleId,
      category ? `"${category.name}"` : '""',
      s.reviewerId,
      `"${s.selectedText.replace(/"/g, '""')}"`,
      s.status,
      `"${(s.notes || '').replace(/"/g, '""')}"`,
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

export function downloadCSV(filename: string, csvContent: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}