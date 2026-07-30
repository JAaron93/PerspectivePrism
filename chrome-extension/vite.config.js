import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import archiver from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createZipArchive(distDir, zipPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      resolve();
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);
    archive.directory(distDir, false);
    archive.finalize();
  });
}

// Custom Vite plugin to copy static extension manifest, CSS, scripts, and icons to dist/, and generate ZIP bundle
function copyExtensionAssets() {
  return {
    name: 'copy-extension-assets',
    async closeBundle() {
      const distDir = path.resolve(__dirname, 'dist');
      
      // Ensure dist exists
      if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir, { recursive: true });
      }

      // Files to copy directly to dist root
      const filesToCopy = [
        'manifest.json',
        'content.css',
        'logging-utils-script.js',
        'config-script.js',
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

      // Generate perspective-prism-extension.zip bundle from dist/
      const zipPath = path.resolve(__dirname, 'perspective-prism-extension.zip');
      await createZipArchive(distDir, zipPath);
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
