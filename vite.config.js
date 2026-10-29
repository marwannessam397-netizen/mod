import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Two pages: the public application form (index.html) and the private review page (admin.html).
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        admin: fileURLToPath(new URL('./admin.html', import.meta.url)),
      },
    },
  },
});
