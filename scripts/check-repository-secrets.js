const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

const patterns = [
  ['JWT', /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
  ['provider API key', /sk-(?:ant-)?[A-Za-z0-9_-]{20,}/g],
  ['live Stripe key', /sk_live_[A-Za-z0-9]{16,}/g],
  ['Stripe webhook secret', /whsec_[A-Za-z0-9]{16,}/g],
  ['credentialed database URL', /postgres(?:ql)?:\/\/[^\s:@]+:[^\s@]+@[^\s"']+/g],
  // A bcrypt hash of a password that is also in this public repository is a
  // working login wherever it lands (scripts/seed-demo-users.sql did exactly that).
  ['bcrypt password hash', /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g],
];

// The built-in demo passwords are published by being in this repository. They
// may appear only where prisma/seed.ts takes them for a local test database, and
// in tests; anywhere else they read as usable credentials.
const demoPassword = ['demo password', /\b(?:admin|artist|engineer|producer|maintenance|ecosystem)123\b/g];
const demoPasswordHomes = new Set(['prisma/local-demo-passwords.ts']);
const isTestFile = (file) => /\.test\.[cm]?[jt]sx?$/.test(file);

const knownTestValues = new Set([
  'postgresql://oiano:integration-only@localhost:5432/oiano_test',
]);

/** Returns the labels of every credential-shaped value in one file's content. */
function scanContent(file, content) {
  const found = [];
  const checks = demoPasswordHomes.has(file) || isTestFile(file) ? patterns : [...patterns, demoPassword];
  for (const [label, pattern] of checks) {
    pattern.lastIndex = 0;
    const matches = content.match(pattern) ?? [];
    if (matches.some((value) => !knownTestValues.has(value))) found.push(label);
  }
  return found;
}

function main() {
  const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .filter((file) => file !== '.env.example');

  const findings = [];
  for (const file of files) {
    let content;
    try { content = fs.readFileSync(file, 'utf8'); } catch { continue; }
    for (const label of scanContent(file, content)) findings.push(`${file}: ${label}`);
  }

  if (findings.length) {
    console.error('Potential repository secrets found:\n' + findings.map((item) => `- ${item}`).join('\n'));
    process.exit(1);
  }

  console.log(`Secret scan passed across ${files.length} tracked files.`);
}

module.exports = { scanContent };

if (require.main === module) main();
