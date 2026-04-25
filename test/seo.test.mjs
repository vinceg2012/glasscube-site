import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fixHtml,
  generateSitemap,
  generateRobots,
  listHtmlFiles,
  SITE_URL,
} from '../scripts/seo-fix.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const REQUIRED_PATTERNS = [
  /<html\s[^>]*lang=/i,
  /<meta\s+charset=/i,
  /<meta\s+[^>]*name=["']viewport["']/i,
  /<title>[^<]+<\/title>/i,
  /<meta\s+[^>]*name=["']description["']/i,
  /<meta\s+[^>]*name=["']theme-color["']/i,
  /<meta\s+[^>]*name=["']robots["']/i,
  /<link\s+[^>]*rel=["']canonical["']/i,
  /<meta\s+[^>]*property=["']og:title["']/i,
  /<meta\s+[^>]*property=["']og:description["']/i,
  /<meta\s+[^>]*property=["']og:url["']/i,
  /<meta\s+[^>]*property=["']og:type["']/i,
  /<meta\s+[^>]*property=["']og:image["']/i,
  /<meta\s+[^>]*name=["']twitter:card["']/i,
  /<meta\s+[^>]*name=["']twitter:title["']/i,
  /<meta\s+[^>]*name=["']twitter:description["']/i,
  /<link\s+[^>]*rel=["']icon["']/i,
  /<link\s+[^>]*rel=["']apple-touch-icon["']/i,
];

const REQUIRED_ICON_FILES = [
  'favicon.png',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
  'og-image.png',
];

const htmlFiles = listHtmlFiles(ROOT);

test('there is at least one HTML file', () => {
  assert.ok(htmlFiles.length > 0);
});

for (const file of htmlFiles) {
  test(`${file} satisfies all SEO requirements after fixHtml`, () => {
    const original = readFileSync(join(ROOT, file), 'utf8');
    const { html } = fixHtml(original, file);
    for (const re of REQUIRED_PATTERNS) {
      assert.match(html, re, `${file} missing pattern ${re}`);
    }
  });

  test(`${file} on disk is already SEO-compliant (run npm run seo:fix)`, () => {
    const onDisk = readFileSync(join(ROOT, file), 'utf8');
    for (const re of REQUIRED_PATTERNS) {
      assert.match(onDisk, re, `${file} missing pattern ${re} — run "npm run seo:fix"`);
    }
  });
}

test('fixHtml is idempotent', () => {
  const sample = `<!doctype html><html><head></head><body></body></html>`;
  const a = fixHtml(sample, 'index.html').html;
  const b = fixHtml(a, 'index.html').html;
  assert.equal(a, b);
});

test('fixHtml fills in missing tags from a bare document', () => {
  const sample = `<!doctype html><html><head></head><body></body></html>`;
  const { html, fixes } = fixHtml(sample, 'index.html');
  assert.ok(fixes.length >= 10);
  for (const re of REQUIRED_PATTERNS) {
    assert.match(html, re);
  }
});

test('generateSitemap includes every page and uses canonical site URL', () => {
  const xml = generateSitemap(['index.html', 'privacy.html', 'support.html']);
  assert.match(xml, /<\?xml version="1.0"/);
  assert.match(xml, new RegExp(`<loc>${SITE_URL}/</loc>`));
  assert.match(xml, new RegExp(`<loc>${SITE_URL}/privacy.html</loc>`));
  assert.match(xml, new RegExp(`<loc>${SITE_URL}/support.html</loc>`));
});

test('generateRobots references the sitemap', () => {
  const txt = generateRobots();
  assert.match(txt, /User-agent: \*/);
  assert.match(txt, new RegExp(`Sitemap: ${SITE_URL}/sitemap.xml`));
});

test('canonical URLs are absolute https URLs', () => {
  for (const file of htmlFiles) {
    const html = readFileSync(join(ROOT, file), 'utf8');
    const m = html.match(/<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
    if (m) assert.match(m[1], /^https:\/\//, `${file} canonical not https`);
  }
});

test('all required icon/social-image files exist on disk', () => {
  for (const f of REQUIRED_ICON_FILES) {
    assert.ok(
      readdirSync(ROOT).includes(f),
      `${f} missing — generate from glasscude-ar.png with sips`
    );
  }
});

test('index.html references the hero mark image', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  assert.match(html, /class=["'][^"']*\bhero-mark\b/);
  assert.match(html, /glasscude-ar\.png/);
});
