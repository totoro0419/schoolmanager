import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],base:process.env.APP_BASE || './',build:{target:'es2022',chunkSizeWarningLimit:1400},server:{host:'0.0.0.0',allowedHosts:true},test:{environment:'node',include:['tests/**/*.test.ts']}} as any);
