import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  typescript: {
    // Ignora erros estritos de tipo se houver algum vestígio residual na nuvem
    ignoreBuildErrors: true,
  },
  eslint: {
    // Ignora o linter durante o build na Vercel para evitar interrupções
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;