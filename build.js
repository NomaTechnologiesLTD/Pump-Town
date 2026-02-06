#!/usr/bin/env node
// ============================================================================
// build.js — Degens City Frontend Performance Build
// 
// Run: npm run build (or: node build.js)
//
// Splits monolithic index.html into optimized dist/:
//   dist/index.html    — Tiny HTML shell
//   dist/styles.css    — Cached CSS (separate file = browser caches it)
//   dist/app.js        — Pre-compiled JS (NO runtime Babel = 2-3s faster)
//
// Then deploy dist/ to Vercel
// ============================================================================

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'index.html');
const DIST = path.join(__dirname, 'dist');

console.log('🔨 Degens City Build Starting...\n');

// Create dist folder
if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true });
fs.mkdirSync(DIST, { recursive: true });

// Read source
const src = fs.readFileSync(SRC, 'utf8');
const srcLines = src.split('\n').length;
console.log(`📄 Source: ${(src.length / 1048576).toFixed(2)} MB, ${srcLines} lines`);

// ==================== 1. EXTRACT CSS ====================

const styleMatch = src.match(/<style>([\s\S]*?)<\/style>/);
if (!styleMatch) { console.error('❌ No <style> block found'); process.exit(1); }
const css = styleMatch[1].trim();

// Minify CSS
const minCss = css
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\n\s*\n/g, '\n')
  .replace(/^\s+/gm, '')
  .replace(/\s*{\s*/g, '{')
  .replace(/\s*}\s*/g, '}\n')
  .replace(/\s*:\s*/g, ':')
  .replace(/;\s*(?=\S)/g, ';');

fs.writeFileSync(path.join(DIST, 'styles.css'), minCss);
console.log(`🎨 CSS: ${(css.length / 1024).toFixed(0)}KB → ${(minCss.length / 1024).toFixed(0)}KB minified`);

// ==================== 2. EXTRACT & COMPILE JSX ====================

const scriptMatch = src.match(/<script type="text\/babel">([\s\S]*?)<\/script>/);
if (!scriptMatch) { console.error('❌ No <script type="text/babel"> block found'); process.exit(1); }
const jsx = scriptMatch[1].trim();

// Try to compile with Babel
let compiledJs = jsx;
let usedBabel = false;

try {
  const babel = require('@babel/core');
  const result = babel.transformSync(jsx, {
    presets: ['@babel/preset-react'],
    plugins: [['@babel/plugin-transform-classes', { loose: true }]],
    filename: 'app.jsx',
  });
  compiledJs = result.code;
  usedBabel = true;
  console.log(`⚛️  JSX compiled to pure JS — NO runtime Babel needed! 🚀`);
} catch (e) {
  console.log(`⚠️  Babel not installed. Run: npm install --save-dev @babel/core @babel/preset-react @babel/plugin-transform-classes`);
  console.log(`⚠️  Falling back to runtime Babel (still splitting CSS for cache benefit)`);
}

fs.writeFileSync(path.join(DIST, 'app.js'), compiledJs);
console.log(`📦 JS: ${(jsx.length / 1024).toFixed(0)}KB → ${(compiledJs.length / 1024).toFixed(0)}KB`);

// ==================== 3. EXTRACT HEAD META ====================

const headMatch = src.match(/<head>([\s\S]*?)<style>/);
const headContent = headMatch ? headMatch[1].trim() : '';

// Filter out Babel script from CDN imports
const cdnLines = [];
const srcRegex = /<script src="([^"]+)"><\/script>/g;
let m;
while ((m = srcRegex.exec(src)) !== null) {
  if (!usedBabel || !m[1].includes('babel')) {
    cdnLines.push(`    <script src="${m[1]}"></script>`);
  }
}

// Cloudflare analytics
const cfMatch = src.match(/(<!-- Cloudflare[\s\S]*?End Cloudflare Web Analytics -->)/);
const cfTag = cfMatch ? `\n    ${cfMatch[1]}` : '';

// ==================== 4. GENERATE HTML SHELL ====================

const scriptTag = usedBabel
  ? '    <script src="app.js"></script>'
  : '    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>\n    <script type="text/babel" src="app.js"></script>';

const html = `<!DOCTYPE html>
<html lang="en">
<head>
    ${headContent}
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <div id="root"></div>

${cdnLines.join('\n')}
${scriptTag}
${cfTag}
</body>
</html>
`;

fs.writeFileSync(path.join(DIST, 'index.html'), html);

// ==================== 5. SUMMARY ====================

const files = fs.readdirSync(DIST);
let total = 0;
console.log('\n' + '='.repeat(50));
console.log('📊 BUILD OUTPUT (./dist/)');
console.log('='.repeat(50));
for (const f of files) {
  const sz = fs.statSync(path.join(DIST, f)).size;
  total += sz;
  console.log(`  ${f.padEnd(20)} ${(sz / 1024).toFixed(0).padStart(6)} KB`);
}
console.log(`  ${'─'.repeat(28)}`);
console.log(`  ${'TOTAL'.padEnd(20)} ${(total / 1024).toFixed(0).padStart(6)} KB`);
console.log(`\n📉 ${(src.length / 1024).toFixed(0)} KB → ${(total / 1024).toFixed(0)} KB (uncompressed)`);
console.log(`🗜️  With gzip: ~${Math.round(total * 0.22 / 1024)} KB estimated transfer`);

if (usedBabel) {
  console.log('\n🚀 PERFORMANCE GAINS:');
  console.log('  ✅ No runtime Babel compilation (saves ~2-3s on load)');
  console.log('  ✅ CSS in separate file (browser caches independently)');
  console.log('  ✅ Gzip compression (Vercel auto-compresses)');
  console.log('  ✅ Babel standalone (~1MB) no longer downloaded');
}

console.log('\n📁 Deploy: push to git, Vercel deploys dist/ automatically');
console.log('');
