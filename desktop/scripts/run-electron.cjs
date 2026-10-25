const { spawn } = require('node:child_process');
const path = require('node:path');
const electronPath = require('electron');

const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, ['.'], {
  cwd: path.join(__dirname, '..'),
  env: environment,
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error('No fue posible iniciar Todo en Orden para Windows.', error);
  process.exitCode = 1;
});

child.on('exit', (code) => {
  process.exitCode = code ?? 0;
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
