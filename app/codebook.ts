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
  reviewerId: string;
  selectedText: string;
  notes?: string;
  status: 'PROPOSED' | 'CONSENSUS_APPROVED' | 'REJECTED';
  createdAt: string;
}

export const defaultCategories: CodeCategory[] = [
  {
    id: 'cat-1',
    name: 'Fundamentação Teórica',
    color: '#6366f1',
    definition: 'Conceitos centrais e arcabouço teórico que sustentam o estudo.',
    codingRule: 'Marcar trechos conceituais.',
    anchorSample: 'Exemplo de âncora teórica.',
  },
];