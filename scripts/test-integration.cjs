const path = require('node:path');
const { runTests } = require('@vscode/test-electron');

// Terminals hosted by Electron apps can inherit this flag; VS Code needs GUI mode.
delete process.env.ELECTRON_RUN_AS_NODE;

const root = path.resolve(__dirname, '..');
runTests({
  extensionDevelopmentPath: root,
  extensionTestsPath: path.join(root, 'test', 'integration', 'index.cjs'),
  vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH,
  launchArgs: [
    '--disable-extensions', '--skip-welcome', '--skip-release-notes',
    '--user-data-dir', path.join(root, '.vscode-test', 'user-data'),
    '--extensions-dir', path.join(root, '.vscode-test', 'extensions'),
  ],
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
