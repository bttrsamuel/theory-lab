export interface CalibrationConfig {
  method: 'PERCENTAGE' | 'KAPPA' | 'BOTH';
  minPercentage: number;
  minKappa: number;
}

export interface CalibrationResult {
  totalEvaluated: number;
  sampleSize: number;
  agreements: number;
  po: number; // Concordância percentual média
  pe: number;
  kappa: number;
  interpretation: string;
  isCalibrated: boolean;
}

export function drawRandomSample<T>(items: T[], percentage: number): T[] {
  if (items.length === 0 || percentage <= 0) return [];
  const targetCount = Math.max(1, Math.round((items.length * percentage) / 100));
  
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, targetCount);
}

export function calculateMultiReviewerCalibration(
  articles: Array<{
    decisions: Record<string, 'INCLUDED' | 'EXCLUDED' | 'MAYBE' | undefined>;
  }>,
  reviewerIds: string[],
  config: CalibrationConfig
): CalibrationResult | null {
  if (reviewerIds.length < 2) return null;

  // Filtra artigos onde todos os revisores cadastrados emitiram voto conclusivo (INCLUDED ou EXCLUDED)
  const paired = articles.filter((a) =>
    reviewerIds.every(
      (id) => a.decisions[id] === 'INCLUDED' || a.decisions[id] === 'EXCLUDED'
    )
  );

  const n = paired.length;
  if (n === 0) return null;

  // Se forem exatamente 2 revisores, calculamos Cohen's Kappa tradicional
  if (reviewerIds.length === 2) {
    const [r1, r2] = reviewerIds;
    let bothIncluded = 0;
    let bothExcluded = 0;
    let r1IncR2Exc = 0;
    let r1ExcR2Inc = 0;

    paired.forEach((a) => {
      const d1 = a.decisions[r1];
      const d2 = a.decisions[r2];
      if (d1 === 'INCLUDED' && d2 === 'INCLUDED') bothIncluded++;
      else if (d1 === 'EXCLUDED' && d2 === 'EXCLUDED') bothExcluded++;
      else if (d1 === 'INCLUDED' && d2 === 'EXCLUDED') r1IncR2Exc++;
      else if (d1 === 'EXCLUDED' && d2 === 'INCLUDED') r1ExcR2Inc++;
    });

    const agreements = bothIncluded + bothExcluded;
    const po = (agreements / n) * 100;

    const r1Inc = (bothIncluded + r1IncR2Exc) / n;
    const r1Exc = (bothExcluded + r1ExcR2Inc) / n;
    const r2Inc = (bothIncluded + r1ExcR2Inc) / n;
    const r2Exc = (bothExcluded + r1IncR2Exc) / n;

    const pe = (r1Inc * r2Inc) + (r1Exc * r2Exc);
    const kappa = pe === 1 ? 1 : ((po / 100) - pe) / (1 - pe);

    let interpretation = 'Sem concordância';
    if (kappa > 0.8) interpretation = 'Quase Perfeita';
    else if (kappa > 0.6) interpretation = 'Substancial';
    else if (kappa > 0.4) interpretation = 'Moderada';
    else if (kappa > 0.2) interpretation = 'Razoável';
    else if (kappa > 0) interpretation = 'Leve';

    let isCalibrated = false;
    if (config.method === 'KAPPA') isCalibrated = kappa >= config.minKappa;
    else if (config.method === 'PERCENTAGE') isCalibrated = po >= config.minPercentage;
    else if (config.method === 'BOTH') isCalibrated = kappa >= config.minKappa && po >= config.minPercentage;

    return {
      totalEvaluated: n,
      sampleSize: n,
      agreements,
      po: parseFloat(po.toFixed(1)),
      pe: parseFloat((pe * 100).toFixed(1)),
      kappa: parseFloat(kappa.toFixed(3)),
      interpretation,
      isCalibrated,
    };
  }

  // Se forem mais de 2 revisores: calcula a proporção média de pares em pleno acordo
  let totalPairsAgreement = 0;
  let totalPairsEvaluated = 0;

  paired.forEach((a) => {
    let unanimous = true;
    const firstVote = a.decisions[reviewerIds[0]];
    for (let i = 1; i < reviewerIds.length; i++) {
      if (a.decisions[reviewerIds[i]] !== firstVote) {
        unanimous = false;
        break;
      }
    }
    if (unanimous) totalPairsAgreement++;
    totalPairsEvaluated++;
  });

  const po = (totalPairsAgreement / totalPairsEvaluated) * 100;
  const isCalibrated = po >= config.minPercentage;

  return {
    totalEvaluated: n,
    sampleSize: n,
    agreements: totalPairsAgreement,
    po: parseFloat(po.toFixed(1)),
    pe: 0,
    kappa: 0,
    interpretation: 'Concordância Multirevisores',
    isCalibrated,
  };
}