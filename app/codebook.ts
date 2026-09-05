export interface CodeCategory {
  id: string;
  name: string;
  color: string;
  definition: string;
  codingRule: string;
  anchorSample: string;
}

export interface CodedSegment {
  id: string;
  articleId: string;
  codeId: string;
  selectedText: string;
  pageNumber?: number;
  notes?: string;
  createdAt: string;
}

export const defaultCategories: CodeCategory[] = [];