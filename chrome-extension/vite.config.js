import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Custom Vite plugin to copy static extension manifest, CSS, scripts, and icons to dist/
function copyExtensionAssets() {
  return {
    name: 'copy-extension-assets',
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist');
      
      // Ensure dist exists
      if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir, { recursive: true });
      }

      // Files to copy directly to dist root
      const filesToCopy = [
        'manifest.json',
        'content.css',
        'video-utils-script.js',
        'consent.js',
        'claim-navigator.js',
        'timeline-utils-script.js',
        'content-markers-script.js'
      ];

      for (const file of filesToCopy) {
        const srcPath = path.resolve(__dirname, file);
        const distPath = path.resolve(distDir, file);
        if (fs.existsSync(srcPath)) {
          fs.copyFileSync(srcPath, distPath);
        }
      }

      // Copy icons folder
      const iconsSrc = path.resolve(__dirname, 'icons');
      const iconsDist = path.resolve(distDir, 'icons');
      if (fs.existsSync(iconsSrc)) {
        fs.cpSync(iconsSrc, iconsDist, { recursive: true });
      }
    }
  };
}

export default defineConfig({
  root: __dirname,
  plugins: [copyExtensionAssets()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: 'terser',
    terserOptions: {
      compress: {
        pure_funcs: ['console.log']
      }
    },
    rollupOptions: {
      input: {
        background: path.resolve(__dirname, 'background.js'),
        content: path.resolve(__dirname, 'content.js'),
        popup: path.resolve(__dirname, 'popup.html'),
        options: path.resolve(__dirname, 'options.html'),
        sidepanel: path.resolve(__dirname, 'sidepanel.html'),
        privacy: path.resolve(__dirname, 'privacy.html'),
        welcome: path.resolve(__dirname, 'welcome.html')
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (['background', 'content'].includes(chunkInfo.name)) {
            return '[name].js';
          }
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  }
});
