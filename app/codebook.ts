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
  notes: string;
  status: 'PROPOSED' | 'CONSENSUS_APPROVED' | 'REJECTED';
  createdAt: string;
}

export const defaultCategories: CodeCategory[] = [
  {
    id: 'cat-1',
    name: 'Impacto Tecnológico',
    color: '#6366f1',
    definition: 'Mecanismos de transformação digital e adoção de ferramentas.',
    codingRule: 'Identificar menções diretas a ganhos de eficiência operacional.',
    anchorSample: 'A introdução da ferramenta reduziu o tempo de triagem em 40%.',
  },
  {
    id: 'cat-2',
    name: 'Barreiras Metodológicas',
    color: '#ec4899',
    definition: 'Dificuldades estruturais, viés de seleção ou limitações de amostra.',
    codingRule: 'Anotar trechos que descrevam obstáculos na execução teórica.',
    anchorSample: 'A heterogeneidade das bases de dados impediu uma meta-análise unificada.',
  },
];