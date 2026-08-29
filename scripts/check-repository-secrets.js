const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
  .filter((file) => file !== '.env.example');

const patterns = [
  ['JWT', /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
  ['provider API key', /sk-(?:ant-)?[A-Za-z0-9_-]{20,}/g],
  ['live Stripe key', /sk_live_[A-Za-z0-9]{16,}/g],
  ['Stripe webhook secret', /whsec_[A-Za-z0-9]{16,}/g],
  ['credentialed database URL', /postgres(?:ql)?:\/\/[^\s:@]+:[^\s@]+@[^\s"']+/g],
];

const findings = [];
const knownTestValues = new Set([
  'postgresql://oiano:integration-only@localhost:5432/oiano_test',
]);
for (const file of files) {
  let content;
  try { content = fs.readFileSync(file, 'utf8'); } catch { continue; }
  for (const [label, pattern] of patterns) {
    pattern.lastIndex = 0;
    const matches = content.match(pattern) ?? [];
    if (matches.some((value) => !knownTestValues.has(value))) findings.push(`${file}: ${label}`);
  }
}

if (findings.length) {
  console.error('Potential repository secrets found:\n' + findings.map((item) => `- ${item}`).join('\n'));
  process.exit(1);
}

console.log(`Secret scan passed across ${files.length} tracked files.`);
