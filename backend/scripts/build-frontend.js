const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const backendDir = path.join(__dirname, '..');
const frontendDir = path.join(backendDir, '..', 'frontend');
const frontendDist = path.join(frontendDir, 'dist');
const backendPublic = path.join(backendDir, 'public');

function run(command, args, cwd) {
  const executable = process.platform === 'win32' ? `${command}.cmd` : command;
  const res = spawnSync(executable, args, { cwd, stdio: 'inherit' });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

async function main() {
  if (!fs.existsSync(frontendDir)) {
    throw new Error(`Frontend directory not found: ${frontendDir}`);
  }

  if (!fs.existsSync(path.join(frontendDir, 'node_modules'))) {
    console.log('Installing frontend dependencies...');
    run('npm', ['install'], frontendDir);
  }

  console.log('Building frontend...');
  run('npm', ['run', 'build'], frontendDir);

  if (!fs.existsSync(path.join(frontendDist, 'index.html'))) {
    throw new Error(`Frontend build not found after build: ${frontendDist}`);
  }

  console.log('Copying frontend/dist -> backend/public ...');
  await fs.promises.rm(backendPublic, { recursive: true, force: true });
  await fs.promises.cp(frontendDist, backendPublic, { recursive: true });
  console.log('Done. Start the backend and open it in the browser.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
