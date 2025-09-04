import { defineConfig } from 'vite';

export default defineConfig({
  root: 'demo', 
  envDir: '../', // Look for .env in the parent directory
  // Environment variables starting with VITE_ are automatically available
  esbuild: {
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    loader: 'tsx'
  },
  build: {
    target: 'es2022' // Support top-level await
  },
  server: {
    port: 3007,
    host: true
  },
  preview: {
    port: 3007,
    host: true
  }
});