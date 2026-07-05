import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('firebase')) return 'vendor-firebase';
          if (id.includes('pdfjs-dist') || id.includes('pdf-lib') || id.includes('jspdf')) return 'vendor-pdf';
          if (id.includes('@react-google-maps') || id.includes('@googlemaps')) return 'vendor-maps';
          if (id.includes('lucide-react')) return 'vendor-icons';
          if (id.includes('zustand')) return 'vendor-state';
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) return 'vendor-react';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
  },
});
