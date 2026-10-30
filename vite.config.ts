import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The sibling website contains VITE-prefixed private credentials. NEVER load it in Vite.
  envDir: false,
  envPrefix: 'ADMIN_PUBLIC_',
  build: { outDir: 'dist', sourcemap: false },
  server: { host: '127.0.0.1', allowedHosts: ['localhost', '127.0.0.1'], watch: { ignored: ['**/artifacts/**'] } }
});
