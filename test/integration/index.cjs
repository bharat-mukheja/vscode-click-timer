const assert = require('node:assert/strict');
const vscode = require('vscode');

exports.run = async function () {
  const extension = vscode.extensions.getExtension('bmukheja.vscode-click-timer');
  assert.ok(extension, 'Extension is discoverable by VS Code');
  const api = await extension.activate();
  const commands = await vscode.commands.getCommands(true);
  for (const command of ['toggle', 'showMenu', 'start', 'pause', 'stop', 'reset', 'setTime']) {
    assert.ok(commands.includes(`clickTimer.${command}`));
  }
  await vscode.commands.executeCommand('clickTimer.setTime', '2s');
  assert.equal(api.getState().durationMs, 2000);
  assert.equal(api.getState().display, '$(clock) 00:02');
  await vscode.commands.executeCommand('clickTimer.toggle');
  assert.equal(api.getState().state, 'running');
  await vscode.commands.executeCommand('clickTimer.toggle');
  assert.equal(api.getState().state, 'paused');
  await vscode.commands.executeCommand('clickTimer.start');
  await new Promise(resolve => setTimeout(resolve, 2500));
  assert.equal(api.getState().state, 'finished');
  assert.equal(api.getState().display, '$(bell) 00:00');
  await vscode.commands.executeCommand('clickTimer.stop');
  assert.equal(api.getState().remainingMs, 2000);
  await vscode.commands.executeCommand('clickTimer.setTime', '25');
  console.log('Click Timer: VS Code extension host smoke test passed.');
};
