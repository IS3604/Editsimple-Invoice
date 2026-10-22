// GitHub Pages serves 404.html for unknown paths. Copying index.html there
// lets the React router handle deep links such as /invoices/123 on refresh.
import { copyFileSync, writeFileSync, existsSync } from 'node:fs';

if (!existsSync('dist/index.html')) {
  console.error('dist/index.html not found; run vite build first.');
  process.exit(1);
}
copyFileSync('dist/index.html', 'dist/404.html');
// Disable Jekyll processing so files/folders starting with "_" are served.
writeFileSync('dist/.nojekyll', '');
console.log('SPA fallback: dist/404.html and dist/.nojekyll written.');
