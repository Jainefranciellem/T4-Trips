import { defineConfig } from 'vitest/config';

export default defineConfig({
  // O vite procuraria o postcss.config.js do frontend (pasta acima).
  css: { postcss: {} },
  test: {
    include: ['tests/**/*.itest.ts'],
    // Um arquivo por vez: todos compartilham o mesmo banco de teste.
    fileParallelism: false,
    testTimeout: 20000,
  },
});
