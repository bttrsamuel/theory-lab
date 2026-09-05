'use client';

import React, { useRef } from 'react';
import { Download, Image as ImageIcon } from 'lucide-react';

interface PrismaMetrics {
  totalImported: number;
  duplicatesRemoved: number;
  recordsScreened: number;
  pilotCount: number;
  pilotAgreements: number;
  pilotPo: number;
  pilotKappa: number;
  excludedScreening: number;
  includedScreening: number;
  reportsSought: number;
  reportsNotRetrieved: number;
  reportsAssessed: number;
  excludedFullText: number;
  includedFinal: number;
  codedSegments: number;
  consensusApprovedSegments: number;
}

export default function PrismaDiagram({ metrics }: { metrics: PrismaMetrics }) {
  const svgRef = useRef<SVGSVGElement>(null);

  const downloadPNG = () => {
    if (!svgRef.current) return;
    const svgElement = svgRef.current;
    const svgString = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const URLObject = window.URL || window.webkitURL || window;
    const blobURL = URLObject.createObjectURL(svgBlob);

    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = 2;
      canvas.width = 1000 * scale;
      canvas.height = 850 * scale;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(scale, scale);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 1000, 850);
        ctx.drawImage(image, 0, 0, 1000, 850);

        const pngURL = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        downloadLink.download = 'fluxograma_prisma_scoping_review.png';
        downloadLink.href = pngURL;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
      }
    };
    image.src = blobURL;
  };

  const downloadSVG = () => {
    if (!svgRef.current) return;
    const svgString = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'fluxograma_prisma.svg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col gap-4 items-center">
      <div className="flex gap-3 justify-end w-full max-w-4xl">
        <button
          onClick={downloadSVG}
          className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
        >
          <Download className="w-3.5 h-3.5 text-indigo-400" /> Exportar Vetor (.SVG)
        </button>
        <button
          onClick={downloadPNG}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-lg"
        >
          <ImageIcon className="w-3.5 h-3.5" /> Baixar Imagem (.PNG Alta Resolução)
        </button>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-2xl border border-slate-300 overflow-x-auto w-full max-w-4xl flex justify-center">
        <svg
          ref={svgRef}
          width="900"
          height="800"
          viewBox="0 0 900 800"
          xmlns="http://www.w3.org/2000/svg"
          className="font-sans"
        >
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 8 5 L 0 9 z" fill="#334155" />
            </marker>
          </defs>

          <rect width="100%" height="100%" fill="#ffffff" />

          <text x="450" y="30" textAnchor="middle" fontSize="15" fontWeight="bold" fill="#0f172a">
            Fluxograma de Seleção de Estudos (PRISMA-ScR 2020)
          </text>

          {/* Fases à esquerda */}
          <rect x="20" y="60" width="130" height="150" rx="6" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1.5" />
          <text x="85" y="140" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#475569">
            IDENTIFICAÇÃO
          </text>

          <rect x="20" y="240" width="130" height="160" rx="6" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1.5" />
          <text x="85" y="325" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#475569">
            TRIAGEM
          </text>

          <rect x="20" y="430" width="130" height="170" rx="6" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1.5" />
          <text x="85" y="520" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#475569">
            ELEGIBILIDADE
          </text>

          <rect x="20" y="630" width="130" height="130" rx="6" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1.5" />
          <text x="85" y="700" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#475569">
            INCLUSÃO
          </text>

          {/* 1. Registros Brutos Identificados */}
          <rect x="200" y="60" width="280" height="70" rx="6" fill="#eff6ff" stroke="#93c5fd" strokeWidth="1.5" />
          <text x="340" y="85" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#1e3a8a">
            Registros importados das bases:
          </text>
          <text x="340" y="110" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#1d4ed8">
            (n = {metrics.totalImported})
          </text>

          {/* Seta Lateral 1 -> Registros Duplicados Removidos */}
          <line x1="480" y1="95" x2="560" y2="95" stroke="#334155" strokeWidth="1.5" markerEnd="url(#arrow)" />
          <rect x="560" y="60" width="280" height="70" rx="6" fill="#fff1f2" stroke="#fecdd3" strokeWidth="1.5" />
          <text x="700" y="85" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#881337">
            Registros duplicados removidos:
          </text>
          <text x="700" y="110" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#be123c">
            (n = {metrics.duplicatesRemoved})
          </text>

          {/* Seta 1 -> 2 */}
          <line x1="340" y1="130" x2="340" y2="160" stroke="#334155" strokeWidth="1.5" markerEnd="url(#arrow)" />

          {/* 2. Registros Únicos após Desduplicação */}
          <rect x="200" y="160" width="280" height="50" rx="6" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.5" />
          <text x="340" y="180" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#334155">
            Registros únicos para triagem:
          </text>
          <text x="340" y="198" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#0f172a">
            (n = {metrics.recordsScreened})
          </text>

          {/* Seta 2 -> 3 */}
          <line x1="340" y1="210" x2="340" y2="240" stroke="#334155" strokeWidth="1.5" markerEnd="url(#arrow)" />

          {/* 3. Amostra Piloto */}
          <rect x="200" y="240" width="280" height="55" rx="6" fill="#faf5ff" stroke="#d8b4fe" strokeWidth="1.5" />
          <text x="340" y="260" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#581c87">
            Amostra piloto avaliada às cegas:
          </text>
          <text x="340" y="280" textAnchor="middle" fontSize="11" fill="#6b21a8">
            n = {metrics.pilotCount} (Concordância: {metrics.pilotPo}%)
          </text>

          {/* Seta 3 -> 4 */}
          <line x1="340" y1="295" x2="340" y2="330" stroke="#334155" strokeWidth="1.5" markerEnd="url(#arrow)" />

          {/* 4. Triagem de Título e Resumo */}
          <rect x="200" y="330" width="280" height="65" rx="6" fill="#eff6ff" stroke="#93c5fd" strokeWidth="1.5" />
          <text x="340" y="352" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#1e3a8a">
            Registros rastreados (Título/Resumo):
          </text>
          <text x="340" y="375" textAnchor="middle" fontSize="13" fontWeight="bold" fill="#1d4ed8">
            (n = {metrics.recordsScreened})
          </text>

          {/* Seta Lateral 4 -> Excluídos na Triagem */}
          <line x1="480" y1="362" x2="560" y2="362" stroke="#334155" strokeWidth="1.5" markerEnd="url(#arrow)" />
          <rect x="560" y="330" width="280" height="65" rx="6" fill="#fff1f2" stroke="#fecdd3" strokeWidth="1.5" />
          <text x="700" y="352" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#881337">
            Registros excluídos na triagem:
          </text>
          <text x="700" y="375" textAnchor="middle" fontSize="13" fontWeight="bold" fill="#be123c">
            (n = {metrics.excludedScreening})
          </text>

          {/* Seta 4 -> 5 */}
          <line x1="340" y1="395" x2="340" y2="440" stroke="#334155" strokeWidth="1.5" markerEnd="url(#arrow)" />

          {/* 5. Relatórios buscados para recuperação */}
          <rect x="200" y="440" width="280" height="60" rx="6" fill="#eff6ff" stroke="#93c5fd" strokeWidth="1.5" />
          <text x="340" y="462" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#1e3a8a">
            Relatórios buscados para recuperação:
          </text>
          <text x="340" y="485" textAnchor="middle" fontSize="13" fontWeight="bold" fill="#1d4ed8">
            (n = {metrics.reportsSought})
          </text>

          {/* Seta 5 -> 6 */}
          <line x1="340" y1="500" x2="340" y2="535" stroke="#334155" strokeWidth="1.5" markerEnd="url(#arrow)" />

          {/* 6. Avaliados na Íntegra */}
          <rect x="200" y="535" width="280" height="65" rx="6" fill="#eff6ff" stroke="#93c5fd" strokeWidth="1.5" />
          <text x="340" y="557" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#1e3a8a">
            Textos avaliados na íntegra:
          </text>
          <text x="340" y="580" textAnchor="middle" fontSize="13" fontWeight="bold" fill="#1d4ed8">
            (n = {metrics.reportsAssessed})
          </text>

          {/* Seta Lateral 6 -> Excluídos no Texto Integral */}
          <line x1="480" y1="567" x2="560" y2="567" stroke="#334155" strokeWidth="1.5" markerEnd="url(#arrow)" />
          <rect x="560" y="535" width="280" height="65" rx="6" fill="#fff1f2" stroke="#fecdd3" strokeWidth="1.5" />
          <text x="700" y="557" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#881337">
            Excluídos na leitura integral:
          </text>
          <text x="700" y="580" textAnchor="middle" fontSize="13" fontWeight="bold" fill="#be123c">
            (n = {metrics.excludedFullText})
          </text>

          {/* Seta 6 -> 7 */}
          <line x1="340" y1="600" x2="340" y2="645" stroke="#334155" strokeWidth="1.5" markerEnd="url(#arrow)" />

          {/* 7. Estudos Incluídos na Síntese */}
          <rect x="200" y="645" width="280" height="85" rx="6" fill="#f0fdf4" stroke="#86efac" strokeWidth="2" />
          <text x="340" y="670" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#14532d">
            Estudos incluídos na revisão:
          </text>
          <text x="340" y="695" textAnchor="middle" fontSize="16" fontWeight="bold" fill="#15803d">
            (n = {metrics.includedFinal})
          </text>
          <text x="340" y="715" textAnchor="middle" fontSize="10" fill="#166534">
            {metrics.consensusApprovedSegments} citações validadas em consenso
          </text>
        </svg>
      </div>
    </div>
  );
}