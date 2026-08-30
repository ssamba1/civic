import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const csp = [];
p.on('console', (m) => {
  const t = m.text();
  if (/content security policy|refused to|csp/i.test(t)) csp.push(t.slice(0, 300));
});
p.on('pageerror', (e) => csp.push('PAGEERROR ' + e.message.slice(0, 200)));
await p.goto('http://localhost:3000/city/cumming', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(12000);
console.log('CSP-related messages:', csp.length);
for (const c of [...new Set(csp)]) console.log('  ' + c);
const hdr = await p.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || null);
console.log('meta CSP:', hdr ? hdr.slice(0, 120) : 'none (header only)');
await b.close();
