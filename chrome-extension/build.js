import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { minify } from 'terser';
import CleanCSS from 'clean-css';
import archiver from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcDir = __dirname;
const distDir = path.join(__dirname, 'dist');
const zipFile = path.join(__dirname, 'perspective-prism-extension.zip');

// Files to copy directly without processing
const filesToCopy = [
  'manifest.json',
  'options.html',
  'popup.html',
  'welcome.html',
  'privacy.html'
];

// Folders to copy directly
const foldersToCopy = [
  'icons'
];

// JS Files to minify and strip console.log
const jsFiles = [
  'background.js',
  'claim-navigator.js',
  'client.js',
  'config-script.js',
  'config.js',
  'consent.js',
  'content.js',
  'logging-utils-script.js',
  'logging-utils.js',
  'memory-monitor.js',
  'metrics-tracker.js',
  'options.js',
  'panel-styles.js',
  'popup.js',
  'quota-manager.js',
  'welcome.js'
];

// CSS Files to minify
const cssFiles = [
  'content.css',
  'options.css',
  'popup.css',
  'welcome.css'
];

async function runBuild() {
  console.info('Starting build process...');

  // Clean old dist and zip
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
  if (fs.existsSync(zipFile)) {
    fs.unlinkSync(zipFile);
  }

  fs.mkdirSync(distDir, { recursive: true });

  // 1. Copy direct files
  for (const file of filesToCopy) {
    const srcPath = path.join(srcDir, file);
    const destPath = path.join(distDir, file);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
      console.info(`Copied: ${file}`);
    } else {
      console.warn(`File not found, skipped: ${file}`);
    }
  }

  // 2. Copy folders
  for (const folder of foldersToCopy) {
    const srcPath = path.join(srcDir, folder);
    const destPath = path.join(distDir, folder);
    if (fs.existsSync(srcPath)) {
      fs.cpSync(srcPath, destPath, { recursive: true });
      console.info(`Copied folder: ${folder}`);
    } else {
      console.warn(`Folder not found, skipped: ${folder}`);
    }
  }

  // 3. Minify CSS
  const cleanCSS = new CleanCSS({});
  for (const file of cssFiles) {
    const srcPath = path.join(srcDir, file);
    const destPath = path.join(distDir, file);
    if (fs.existsSync(srcPath)) {
      const input = fs.readFileSync(srcPath, 'utf8');
      const minified = cleanCSS.minify(input);
      if (minified.errors.length) {
        throw new Error(`CSS Minification error in ${file}: ${minified.errors.join(', ')}`);
      }
      fs.writeFileSync(destPath, minified.styles);
      console.info(`Minified CSS: ${file}`);
    } else {
      console.warn(`CSS file not found: ${file}`);
    }
  }

  // 4. Minify JS and strip console.log
  for (const file of jsFiles) {
    const srcPath = path.join(srcDir, file);
    const destPath = path.join(distDir, file);
    if (fs.existsSync(srcPath)) {
      const input = fs.readFileSync(srcPath, 'utf8');
      
      // Terser minification options
      const options = {
        ecma: 2022,
        module: true,
        compress: {
          // Remove console.log but keep console.error, console.warn, and console.info
          pure_funcs: ['console.log']
        },
        mangle: true
      };

      const result = await minify(input, options);
      if (result.error) {
        throw new Error(`JS Minification error in ${file}: ${result.error}`);
      }
      
      fs.writeFileSync(destPath, result.code);
      console.info(`Minified JS (stripped console.log): ${file}`);
    } else {
      console.warn(`JS file not found: ${file}`);
    }
  }

  // 5. Create ZIP archive
  console.info('Creating zip archive...');
  await zipDirectory(distDir, zipFile);
  console.info(`Successfully created build archive: ${zipFile}`);
  console.info('Build completed successfully.');
}

function zipDirectory(source, out) {
  const archive = archiver('zip', { zlib: { level: 9 } });
  const stream = fs.createWriteStream(out);

  return new Promise((resolve, reject) => {
    archive
      .directory(source, false)
      .on('error', err => reject(err))
      .pipe(stream);

    stream.on('close', () => resolve());
    archive.finalize();
  });
}

runBuild().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
