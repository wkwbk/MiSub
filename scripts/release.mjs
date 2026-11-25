import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const PACKAGE_JSON_PATH = path.join(ROOT_DIR, 'package.json');
const CORE_PACKAGE_JSON_PATH = path.join(ROOT_DIR, 'packages', 'core', 'package.json');
const BACKEND_CONFIG_PATH = path.join(ROOT_DIR, 'functions', 'modules', 'config.ts');
const VERSION_STORE_PATH = path.join(ROOT_DIR, 'src', 'stores', 'useVersionStore.ts');

function printUsage() {
  console.log('Usage: pnpm release <version> [--no-push] [--dry-run]');
  console.log('Example: pnpm release 2.8.6');
  console.log('         pnpm release v2.8.6 --no-push');
}

function runGit(args, options = {}) {
  return execFileSync('git', args, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  });
}

function parseArgs(argv) {
  const flags = new Set();
  const positional = [];
  for (const arg of argv) {
    if (arg === '--') continue;
    if (arg.startsWith('--')) {
      flags.add(arg);
    } else {
      positional.push(arg);
    }
  }
  return {
    rawVersion: positional[0] || '',
    dryRun: flags.has('--dry-run'),
    noPush: flags.has('--no-push'),
    help: flags.has('--help') || flags.has('-h'),
  };
}

function main() {
  const { rawVersion, dryRun, noPush, help } = parseArgs(process.argv.slice(2));
  if (help || !rawVersion) {
    printUsage();
    process.exit(help ? 0 : 1);
  }

  const version = rawVersion.trim().replace(/^v/i, '');
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    console.error(`Error: Invalid version format "${rawVersion}". Expected X.Y.Z or vX.Y.Z.`);
    process.exit(1);
  }

  const tag = `v${version}`;

  const statusOutput = runGit(['status', '--porcelain']).trim();
  if (statusOutput && !dryRun) {
    console.error('Error: Working tree has uncommitted changes. Please commit or stash them first.');
    console.error(statusOutput);
    process.exit(1);
  }

  try {
    runGit(['rev-parse', '-q', '--verify', `refs/tags/${tag}`]);
    console.error(`Error: Git tag "${tag}" already exists.`);
    process.exit(1);
  } catch {
    // Tag does not exist yet
  }

  const pkgRaw = fs.readFileSync(PACKAGE_JSON_PATH, 'utf8');
  const pkgUpdated = pkgRaw.replace(/("version"\s*:\s*)"[^"]+"/, `$1"${version}"`);
  if (pkgUpdated === pkgRaw) {
    console.error('Error: Failed to locate "version" field in package.json.');
    process.exit(1);
  }

  let corePkgUpdated = '';
  if (fs.existsSync(CORE_PACKAGE_JSON_PATH)) {
    const corePkgRaw = fs.readFileSync(CORE_PACKAGE_JSON_PATH, 'utf8');
    corePkgUpdated = corePkgRaw.replace(/("version"\s*:\s*)"[^"]+"/, `$1"${version}"`);
  }

  const configRaw = fs.readFileSync(BACKEND_CONFIG_PATH, 'utf8');
  const configUpdated = configRaw.replace(/(VERSION\s*:\s*')[^']+(')/, `$1${version}$2`);
  if (configUpdated === configRaw) {
    console.error('Error: Failed to locate VERSION field in functions/modules/config.ts.');
    process.exit(1);
  }

  const versionStoreRaw = fs.readFileSync(VERSION_STORE_PATH, 'utf8');
  if (!versionStoreRaw.includes(`(${tag})`)) {
    console.warn(
      `Warning: src/stores/useVersionStore.js localChangelog comment does not mention (${tag}). Remember to update localChangelog before releasing.`,
    );
  }

  const branch = runGit(['branch', '--show-current']).trim();
  if (!branch) {
    console.error('Error: Detached HEAD state. Please checkout a branch before releasing.');
    process.exit(1);
  }

  if (dryRun) {
    console.log(`[dry-run] Would update package.json, packages/core/package.json, and functions/modules/config.ts to ${version}`);
    console.log(`[dry-run] Would commit "chore: release ${tag}" and create annotated tag ${tag}`);
    if (!noPush) {
      console.log(`[dry-run] Would push branch "${branch}" and tag "${tag}" to origin (triggering GitHub Release workflow)`);
    }
    return;
  }

  fs.writeFileSync(PACKAGE_JSON_PATH, pkgUpdated, 'utf8');
  if (corePkgUpdated) {
    fs.writeFileSync(CORE_PACKAGE_JSON_PATH, corePkgUpdated, 'utf8');
  }
  fs.writeFileSync(BACKEND_CONFIG_PATH, configUpdated, 'utf8');
  console.log(`Updated package.json, packages/core/package.json, and functions/modules/config.ts to ${version}`);

  const filesToStage = ['package.json', 'functions/modules/config.ts'];
  if (corePkgUpdated) filesToStage.push('packages/core/package.json');
  runGit(['add', ...filesToStage], { inherit: true });
  runGit(['commit', '-m', `chore: release ${tag}`], { inherit: true });
  runGit(['tag', '-a', tag, '-m', `Release ${tag}`], { inherit: true });

  if (noPush) {
    console.log(`Release ${tag} committed and tagged locally (--no-push).`);
    console.log(`Run "git push origin ${branch} && git push origin ${tag}" when ready.`);
    return;
  }

  runGit(['push', 'origin', branch], { inherit: true });
  runGit(['push', 'origin', tag], { inherit: true });
  console.log(`Pushed ${branch} and ${tag}. GitHub Actions will automatically publish the Release.`);
}

main();
