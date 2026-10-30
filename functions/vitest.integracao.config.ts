import { defineConfig } from 'vitest/config'

// Roda contra os emuladores: npm run test:integracao (na raiz do repositório).
export default defineConfig({
  test: {
    include: ['teste-integracao/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
})
