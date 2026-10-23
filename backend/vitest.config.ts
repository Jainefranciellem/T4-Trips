import { defineConfig } from 'vitest/config';

export default defineConfig({
  // O vite procuraria o postcss.config.js do frontend (pasta acima).
  css: { postcss: {} },
  test: {
    include: ['tests/**/*.test.ts'],
    // Os testes de integração (*.itest.ts) ficam fora do `npm test` — rodam
    // contra um banco próprio via `npm run test:integration`.
  },
});
