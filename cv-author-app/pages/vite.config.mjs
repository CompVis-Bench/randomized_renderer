import { defineConfig } from 'vite';
import path from 'node:path';
export default defineConfig({ root: path.resolve('pages'), base: './', build: { outDir: path.resolve('pages-dist'), emptyOutDir: true, target: 'es2022' } });
