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
  if (manifest.version !== '0.2.0') {
    throw new Error(`Manifest version should be 0.2.0, but found ${manifest.version}`);
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

  // 4. Validate file existence for all script files in manifest
  const extRoot = path.join(__dirname, '..');
  
  if (manifest.background && manifest.background.service_worker) {
    const bgPath = path.join(extRoot, manifest.background.service_worker);
    if (!fs.existsSync(bgPath)) {
      throw new Error(`Background service worker file does not exist: ${manifest.background.service_worker}`);
    }
  }

  if (manifest.content_scripts) {
    for (const script of manifest.content_scripts) {
      if (script.js) {
        for (const jsFile of script.js) {
          const jsPath = path.join(extRoot, jsFile);
          if (!fs.existsSync(jsPath)) {
            throw new Error(`Content script JS file does not exist: ${jsFile}`);
          }
        }
      }
      if (script.css) {
        for (const cssFile of script.css) {
          const cssPath = path.join(extRoot, cssFile);
          if (!fs.existsSync(cssPath)) {
            throw new Error(`Content script CSS file does not exist: ${cssFile}`);
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
