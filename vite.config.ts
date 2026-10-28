import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

/** Zet een unieke build-id in dist/sw.js: elke deployment krijgt zo een nieuwe service worker en een eigen cache. */
function swBuildId(): Plugin {
  let outDir = 'dist';
  return {
    name: 'bijdehand-sw-build-id',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir; },
    closeBundle() {
      const file = resolve(outDir, 'sw.js');
      const id = `${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 8)}`;
      writeFileSync(file, readFileSync(file, 'utf8').replace(/__BUILD_ID__/g, id));
    },
  };
}

export default defineConfig({
  // Relatieve paden: werkt op GitHub Pages onder /bijdehand/ (en lokaal op /).
  base: './',
  plugins: [react(), swBuildId()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
