import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  return {
    plugins: [react()],
    build: {
      outDir: 'dist',
      sourcemap: true
    },
    define: {
      // Define process.env.API_KEY to allow the Gemini SDK to work in the browser
      // This replaces the string 'process.env.API_KEY' with the actual value from build environment
      'process.env.API_KEY': JSON.stringify(env.API_KEY || ''),
      // Prevent "process is not defined" error if other parts of code access it
      'process.env': JSON.stringify({})
    }
  };
});