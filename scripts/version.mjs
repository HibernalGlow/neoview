import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pkgPath = resolve(process.cwd(), 'package.json');
const tauriPath = resolve(process.cwd(), 'src-tauri', 'tauri.conf.json');
const cargoPath = resolve(process.cwd(), 'src-tauri', 'Cargo.toml');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, data) {
  const json = JSON.stringify(data, null, 2) + '\n';
  writeFileSync(path, json, 'utf8');
}

function readCargo() {
  const text = readFileSync(cargoPath, 'utf8');
  const match = text.match(/^version\s*=\s*"([^"]+)"/m);
  const version = match ? match[1] : null;
  return { text, version };
}

function writeCargoVersion(newVersion) {
  const { text, version } = readCargo();
  if (!version) {
    throw new Error('Could not find version in Cargo.toml');
  }
  const updated = text.replace(/^version\s*=\s*"([^"]+)"/m, `version = "${newVersion}"`);
  writeFileSync(cargoPath, updated, 'utf8');
}

function getVersions() {
  const pkg = readJson(pkgPath);
  const tauri = readJson(tauriPath);
  const { version: cargoVersion } = readCargo();

  return {
    packageJson: pkg.version,
    tauriConfig: tauri.version,
    cargoToml: cargoVersion,
  };
}

function validateVersion(v) {
  // basic semver check: 1.2.3 or 1.2.3-suffix
  const re = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
  if (!re.test(v)) {
    throw new Error(`Invalid version: ${v}`);
  }
}

function setVersion(newVersion) {
  validateVersion(newVersion);

  const pkg = readJson(pkgPath);
  pkg.version = newVersion;
  writeJson(pkgPath, pkg);

  const tauri = readJson(tauriPath);
  tauri.version = newVersion;
  writeJson(tauriPath, tauri);

  writeCargoVersion(newVersion);

  const v = getVersions();
  console.log('Updated versions:');
  console.log(`  package.json:      ${v.packageJson}`);
  console.log(`  tauri.conf.json:   ${v.tauriConfig}`);
  console.log(`  Cargo.toml:        ${v.cargoToml}`);
}

function showVersions() {
  const v = getVersions();
  console.log('Current versions:');
  console.log(`  package.json:      ${v.packageJson}`);
  console.log(`  tauri.conf.json:   ${v.tauriConfig}`);
  console.log(`  Cargo.toml:        ${v.cargoToml}`);
}

function main() {
  const cmd = process.argv[2];

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    console.log('Usage: node scripts/version.mjs <show|set> [version]');
    process.exit(0);
  }

  if (cmd === 'show') {
    try {
      showVersions();
      process.exit(0);
    } catch (err) {
      console.error(String(err?.message ?? err));
      process.exit(1);
    }
  }

  if (cmd === 'set') {
    const newVersion = process.argv[3];
    if (!newVersion) {
      console.error('Missing version argument.');
      console.error('Usage: node scripts/version.mjs set <new-version>');
      process.exit(1);
    }
    try {
      setVersion(newVersion);
      process.exit(0);
    } catch (err) {
      console.error(String(err?.message ?? err));
      process.exit(1);
    }
  }

  console.error(`Unknown command: ${cmd}`);
  console.error('Usage: node scripts/version.mjs <show|set> [version]');
  process.exit(1);
}

main();
