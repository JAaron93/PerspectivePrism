import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const manifestPath = path.join(__dirname, '..', 'manifest.json');

try {
  const manifestData = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestData);

  console.info('Validating manifest.json...');

  // 1. Check version
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const expectedVersion = packageJson.version;

  if (manifest.version !== expectedVersion) {
    throw new Error(`Manifest version should be ${expectedVersion}, but found ${manifest.version}`);
  }
  if (manifest.manifest_version !== 3) {
    throw new Error(`Manifest version must be 3, found ${manifest.manifest_version}`);
  }

  // 2. Check essential permissions
  const requiredPermissions = ['storage', 'activeTab', 'alarms', 'notifications'];
  for (const perm of requiredPermissions) {
    if (!manifest.permissions || !manifest.permissions.includes(perm)) {
      throw new Error(`Missing required permission: ${perm}`);
    }
  }

  // 3. Check host permissions
  const requiredHostPermissions = [
    'https://*.youtube.com/*',
    'https://youtu.be/*',
    'https://*.youtube-nocookie.com/*',
    'https://m.youtube.com/*'
  ];
  for (const host of requiredHostPermissions) {
    if (!manifest.host_permissions || !manifest.host_permissions.includes(host)) {
      throw new Error(`Missing required host permission: ${host}`);
    }
  }

  // 4. Validate content scripts order
  if (manifest.content_scripts && manifest.content_scripts.length > 0) {
    const expectedOrder = [
      'consent.js',
      'claim-navigator.js',
      'content.js'
    ];
    const jsFiles = manifest.content_scripts[0].js || [];
    const actualOrder = jsFiles.filter(f => expectedOrder.includes(f));
    
    if (JSON.stringify(actualOrder) !== JSON.stringify(expectedOrder)) {
      throw new Error(`Content scripts are not in the exact required sequence.\nExpected: ${expectedOrder.join(', ')}\nFound: ${actualOrder.join(', ')}`);
    }
  }

  // 5. Validate file existence for all script files in manifest (both root and dist if built)
  const extRoot = path.join(__dirname, '..');
  const targetDirs = [extRoot];
  const distDir = path.join(__dirname, '..', 'dist');
  if (fs.existsSync(distDir)) {
    targetDirs.push(distDir);
  }

  for (const checkDir of targetDirs) {
    const dirLabel = checkDir === distDir ? 'dist' : 'root';
    if (manifest.background && manifest.background.service_worker) {
      const bgPath = path.join(checkDir, manifest.background.service_worker);
      if (!fs.existsSync(bgPath)) {
        throw new Error(`Background service worker file does not exist in ${dirLabel}: ${manifest.background.service_worker}`);
      }
    }

    if (manifest.content_scripts) {
      for (const script of manifest.content_scripts) {
        if (script.js) {
          for (const jsFile of script.js) {
            const jsPath = path.join(checkDir, jsFile);
            if (!fs.existsSync(jsPath)) {
              throw new Error(`Content script JS file does not exist in ${dirLabel}: ${jsFile}`);
            }
          }
        }
        if (script.css) {
          for (const cssFile of script.css) {
            const cssPath = path.join(checkDir, cssFile);
            if (!fs.existsSync(cssPath)) {
              throw new Error(`Content script CSS file does not exist in ${dirLabel}: ${cssFile}`);
            }
          }
        }
      }
    }
  }

  console.info('manifest.json validation PASSED.');
  process.exit(0);
} catch (error) {
  console.error('manifest.json validation FAILED:', error.message);
  process.exit(1);
}
