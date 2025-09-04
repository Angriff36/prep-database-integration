import { defineConfig } from 'vite';

export default defineConfig({
  root: 'demo', 
  envDir: '../', // Look for .env in the parent directory
  // Environment variables starting with VITE_ are automatically available
  server: {
    port: 3007,
    host: true
  },
  preview: {
    port: 3007,
    host: true
  }
});