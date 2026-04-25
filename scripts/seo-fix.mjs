#!/usr/bin/env node
// SEO auto-fixer for the GlassCube static site.
// Usage:
//   node scripts/seo-fix.mjs           -> apply fixes in-place
//   node scripts/seo-fix.mjs --check   -> exit 1 if any file would change
//
// Idempotent: running twice is a no-op.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(__dirname, '..');
export const SITE_URL = 'https://glasscube.app';

// Per-page SEO defaults. Anything not listed here gets sensible fallbacks.
const PAGE_META = {
  'index.html': {
    title: 'GlassCube AR – Interactive 3D Cube in Your World',
    description:
      'Place and interact with a real 3D cube in your world using AR. Learn, explore, and solve with precision and clarity.',
    ogType: 'website',
    canonical: `${SITE_URL}/`,
  },
  'privacy.html': {
    title: 'Privacy Policy – GlassCube AR',
    description: 'Privacy Policy for GlassCube AR.',
    ogType: 'article',
    canonical: `${SITE_URL}/privacy.html`,
  },
  'support.html': {
    title: 'GlassCube Support',
    description: 'Get help with GlassCube AR.',
    ogType: 'article',
    canonical: `${SITE_URL}/support.html`,
  },
};

const REQUIRED_META = [
  { name: 'description', source: (m) => m.description },
  { name: 'theme-color', source: () => '#000000' },
  { name: 'robots', source: () => 'index, follow' },
];

const REQUIRED_OG = [
  { property: 'og:title', source: (m) => m.title },
  { property: 'og:description', source: (m) => m.description },
  { property: 'og:url', source: (m) => m.canonical },
  { property: 'og:type', source: (m) => m.ogType },
];

const REQUIRED_TWITTER = [
  { name: 'twitter:card', source: () => 'summary_large_image' },
  { name: 'twitter:title', source: (m) => m.title },
  { name: 'twitter:description', source: (m) => m.description },
];

function htmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ---- Individual fixers (each returns the new html + a list of applied fixes) ----

function ensureLangAttr(html) {
  const fixes = [];
  let out = html;
  if (/<html(\s[^>]*)?>/i.test(out)) {
    out = out.replace(/<html(\s[^>]*)?>/i, (m, attrs = '') => {
      if (/\blang\s*=/.test(attrs)) return m;
      fixes.push('added <html lang="en">');
      return `<html lang="en"${attrs || ''}>`;
    });
  }
  return { html: out, fixes };
}

function ensureCharset(html) {
  if (/<meta\s+charset=/i.test(html)) return { html, fixes: [] };
  return injectIntoHead(html, '  <meta charset="UTF-8">', 'added <meta charset>');
}

function ensureViewport(html) {
  if (/<meta\s+[^>]*name=["']viewport["']/i.test(html)) return { html, fixes: [] };
  return injectIntoHead(
    html,
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    'added <meta viewport>'
  );
}

function ensureTitle(html, meta) {
  if (/<title>[^<]*<\/title>/i.test(html)) return { html, fixes: [] };
  return injectIntoHead(html, `  <title>${htmlEscape(meta.title)}</title>`, 'added <title>');
}

function ensureMetaName(html, name, content) {
  const re = new RegExp(`<meta\\s+[^>]*name=["']${name}["']`, 'i');
  if (re.test(html)) return { html, fixes: [] };
  return injectIntoHead(
    html,
    `  <meta name="${name}" content="${htmlEscape(content)}">`,
    `added <meta name="${name}">`
  );
}

function ensureMetaProperty(html, property, content) {
  const re = new RegExp(`<meta\\s+[^>]*property=["']${property}["']`, 'i');
  if (re.test(html)) return { html, fixes: [] };
  return injectIntoHead(
    html,
    `  <meta property="${property}" content="${htmlEscape(content)}">`,
    `added <meta property="${property}">`
  );
}

function ensureCanonical(html, url) {
  if (/<link\s+[^>]*rel=["']canonical["']/i.test(html)) return { html, fixes: [] };
  return injectIntoHead(
    html,
    `  <link rel="canonical" href="${htmlEscape(url)}">`,
    'added <link rel="canonical">'
  );
}

function ensureFavicons(html, root) {
  // Map of optional icon files → link tag to inject when present.
  const candidates = [
    {
      file: 'favicon.ico',
      tag: '  <link rel="icon" href="/favicon.ico" sizes="any">',
      probe: /<link\s+[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["'][^"']*favicon\.ico/i,
      label: 'added <link rel="icon"> (favicon.ico)',
    },
    {
      file: 'icon.svg',
      tag: '  <link rel="icon" href="/icon.svg" type="image/svg+xml">',
      probe: /<link\s+[^>]*rel=["']icon["'][^>]*href=["'][^"']*icon\.svg/i,
      label: 'added <link rel="icon"> (icon.svg)',
    },
    {
      file: 'favicon.png',
      tag: '  <link rel="icon" type="image/png" sizes="32x32" href="/favicon.png">',
      probe: /<link\s+[^>]*rel=["']icon["'][^>]*href=["'][^"']*favicon\.png/i,
      label: 'added <link rel="icon"> (favicon.png)',
    },
    {
      file: 'icon-192.png',
      tag: '  <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">',
      probe: /<link\s+[^>]*rel=["']icon["'][^>]*sizes=["']192x192["']/i,
      label: 'added <link rel="icon"> (icon-192.png)',
    },
    {
      file: 'icon-512.png',
      tag: '  <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png">',
      probe: /<link\s+[^>]*rel=["']icon["'][^>]*sizes=["']512x512["']/i,
      label: 'added <link rel="icon"> (icon-512.png)',
    },
    {
      file: 'apple-touch-icon.png',
      tag: '  <link rel="apple-touch-icon" href="/apple-touch-icon.png">',
      probe: /<link\s+[^>]*rel=["']apple-touch-icon["']/i,
      label: 'added <link rel="apple-touch-icon">',
    },
  ];
  let current = html;
  const fixes = [];
  for (const c of candidates) {
    if (!existsSync(join(root, c.file))) continue;
    if (c.probe.test(current)) continue;
    const r = injectIntoHead(current, c.tag, c.label);
    current = r.html;
    fixes.push(...r.fixes);
  }
  return { html: current, fixes };
}

function ensureOgImage(html, root) {
  if (/<meta\s+[^>]*property=["']og:image["']/i.test(html)) return { html, fixes: [] };
  // Prefer a dedicated social image, fall back to apple-touch-icon.
  const candidates = ['og-image.png', 'og-image.jpg', 'apple-touch-icon.png'];
  const found = candidates.find((f) => existsSync(join(root, f)));
  if (!found) return { html, fixes: [] };
  return injectIntoHead(
    html,
    `  <meta property="og:image" content="${SITE_URL}/${found}">`,
    `added <meta property="og:image"> (${found})`
  );
}

function injectIntoHead(html, line, fixLabel) {
  if (/<\/head>/i.test(html)) {
    return {
      html: html.replace(/<\/head>/i, `${line}\n</head>`),
      fixes: [fixLabel],
    };
  }
  return { html, fixes: [] };
}

// ---- Top-level orchestration ----

export function fixHtml(html, fileName) {
  const meta = PAGE_META[fileName] || {
    title: 'GlassCube AR',
    description: 'GlassCube AR.',
    ogType: 'website',
    canonical: `${SITE_URL}/${fileName}`,
  };

  const allFixes = [];
  let current = html;

  const steps = [
    (h) => ensureLangAttr(h),
    (h) => ensureCharset(h),
    (h) => ensureViewport(h),
    (h) => ensureTitle(h, meta),
    (h) => ensureCanonical(h, meta.canonical),
    (h) => ensureFavicons(h, ROOT),
    (h) => ensureOgImage(h, ROOT),
    ...REQUIRED_META.map((r) => (h) => ensureMetaName(h, r.name, r.source(meta))),
    ...REQUIRED_OG.map((r) => (h) => ensureMetaProperty(h, r.property, r.source(meta))),
    ...REQUIRED_TWITTER.map((r) => (h) => ensureMetaName(h, r.name, r.source(meta))),
  ];

  for (const step of steps) {
    const { html: next, fixes } = step(current);
    current = next;
    allFixes.push(...fixes);
  }

  return { html: current, fixes: allFixes };
}

export function listHtmlFiles(root = ROOT) {
  return readdirSync(root)
    .filter((f) => f.endsWith('.html'))
    .sort();
}

export function generateSitemap(files) {
  const urls = files
    .filter((f) => f !== '404.html')
    .map((f) => {
      const loc = f === 'index.html' ? `${SITE_URL}/` : `${SITE_URL}/${f}`;
      return `  <url><loc>${loc}</loc></url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

export function generateRobots() {
  return `User-agent: *
Allow: /
Sitemap: ${SITE_URL}/sitemap.xml
`;
}

function diffWrite(path, nextContent, check) {
  const prev = existsSync(path) ? readFileSync(path, 'utf8') : '';
  if (prev === nextContent) return { changed: false };
  if (!check) writeFileSync(path, nextContent);
  return { changed: true, prev };
}

export function run({ check = false, root = ROOT } = {}) {
  const files = listHtmlFiles(root);
  const report = [];

  for (const f of files) {
    const path = join(root, f);
    const original = readFileSync(path, 'utf8');
    const { html, fixes } = fixHtml(original, f);
    const { changed } = diffWrite(path, html, check);
    if (changed) report.push({ file: f, fixes });
  }

  // Sitemap + robots
  const sitemapPath = join(root, 'sitemap.xml');
  const robotsPath = join(root, 'robots.txt');
  const sm = diffWrite(sitemapPath, generateSitemap(files), check);
  if (sm.changed) report.push({ file: 'sitemap.xml', fixes: ['regenerated'] });
  const rb = diffWrite(robotsPath, generateRobots(), check);
  if (rb.changed) report.push({ file: 'robots.txt', fixes: ['regenerated'] });

  return report;
}

// CLI
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const check = process.argv.includes('--check');
  const report = run({ check });
  if (report.length === 0) {
    console.log('SEO: ok (no changes needed)');
    process.exit(0);
  }
  for (const r of report) {
    console.log(`SEO: ${check ? 'would fix' : 'fixed'} ${r.file}`);
    for (const f of r.fixes) console.log(`  - ${f}`);
  }
  process.exit(check ? 1 : 0);
}
