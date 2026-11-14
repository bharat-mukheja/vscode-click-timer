const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function host(saved) {
  const commands = new Map();
  const items = [];
  const store = new Map(saved ? [['clickTimer.state.v1', saved]] : []);
  const messages = [];
  let pick;
  let input;
  let inputOptions;
  let menuItems;
  let tick;
  let intervalCleared = false;
  class MarkdownString { constructor(value) { this.value = value; } }
  const vscode = {
    MarkdownString,
    StatusBarAlignment: { Left: 1 },
    commands: {
      registerCommand(id, fn) {
        commands.set(id, fn);
        return { dispose: () => commands.delete(id) };
      },
      executeCommand: async (id, ...args) => {
        assert.ok(commands.has(id), `Command exists: ${id}`);
        return commands.get(id)(...args);
      },
    },
    workspace: { getConfiguration: () => ({ get: (_, fallback) => fallback }) },
    window: {
      createStatusBarItem(id) {
        const item = { id, show() { this.visible = true; }, dispose() { this.disposed = true; } };
        items.push(item);
        return item;
      },
      showQuickPick: async values => { menuItems = values; return values.find(i => i.command === pick); },
      showInputBox: async options => { inputOptions = options; return input; },
      showInformationMessage: async message => { messages.push(message); },
      showErrorMessage: async message => { messages.push(message); },
    },
  };
  const context = {
    subscriptions: [],
    workspaceState: {
      get: key => store.get(key),
      update: async (key, value) => store.set(key, value),
    },
  };
  const originalLoad = Module._load;
  const originalInterval = global.setInterval;
  const originalClear = global.clearInterval;
  const extensionPath = require.resolve('../dist/extension');
  delete require.cache[extensionPath];
  let api;
  try {
    Module._load = function (name, ...rest) {
      return name === 'vscode' ? vscode : originalLoad.call(this, name, ...rest);
    };
    global.setInterval = fn => { tick = fn; return 42; };
    api = require(extensionPath).activate(context);
  } finally {
    Module._load = originalLoad;
    global.setInterval = originalInterval;
  }
  return {
    api, items, store, messages, commands,
    execute: vscode.commands.executeCommand,
    setInput: value => { input = value; },
    setPick: value => { pick = value; },
    getInputOptions: () => inputOptions,
    getMenuItems: () => menuItems,
    tick: () => tick(),
    dispose() {
      global.clearInterval = id => { assert.equal(id, 42); intervalCleared = true; };
      try { context.subscriptions.forEach(s => s.dispose()); }
      finally { global.clearInterval = originalClear; }
      assert.equal(intervalCleared, true);
    },
  };
}

test('activates visible status items and click commands persist timer state', async () => {
  const h = host();
  try {
    assert.equal(h.items.length, 2);
    assert.ok(h.items.every(i => i.visible));
    assert.equal(h.items[0].text, '$(clock) 25:00');
    assert.equal(h.items[0].command, 'clickTimer.toggle');
    assert.equal(h.items[1].command, 'clickTimer.showMenu');
    await h.execute(h.items[0].command);
    assert.equal(h.api.getState().state, 'running');
    await h.execute('clickTimer.toggle');
    assert.equal(h.api.getState().state, 'paused');
    assert.equal(h.store.get('clickTimer.state.v1').state, 'paused');
    await h.execute('clickTimer.start');
    await h.execute('clickTimer.stop');
    assert.equal(h.api.getState().state, 'idle');
  } finally { h.dispose(); }
  assert.ok(h.items.every(i => i.disposed));
  assert.equal(h.commands.size, 0);
});

test('menu actions, time validation, cancellation, and reset', async () => {
  const h = host();
  try {
    h.setPick('setTime');
    h.setInput('01:30');
    await h.execute('clickTimer.showMenu');
    assert.equal(h.api.getState().durationMs, 90_000);
    assert.equal(h.api.getState().state, 'idle');
    assert.ok(h.getInputOptions().validateInput('0'));
    assert.equal(h.getInputOptions().validateInput('45s'), undefined);
    await h.execute('clickTimer.start');
    h.setPick(undefined);
    await h.execute('clickTimer.showMenu');
    assert.ok(h.getMenuItems().some(item => item.command === 'pause'));
    assert.equal(h.api.getState().state, 'running');
    h.setInput(undefined);
    await h.execute('clickTimer.setTime');
    assert.equal(h.api.getState().state, 'running');
    await h.execute('clickTimer.setTime', 'invalid');
    assert.equal(h.api.getState().durationMs, 90_000);
    assert.equal(h.messages.length, 1);
    await h.execute('clickTimer.pause');
    await h.execute('clickTimer.reset');
    assert.equal(h.api.getState().remainingMs, 90_000);
    assert.equal(h.api.getState().state, 'paused');
  } finally { h.dispose(); }
});

test('an expired saved timer completes, notifies once, and saves finished state', async () => {
  const h = host({ version: 1, durationMs: 1000, remainingMs: 1000, state: 'running', deadline: 1 });
  try {
    assert.equal(h.api.getState().state, 'finished');
    assert.equal(h.items[0].text, '$(bell) 00:00');
    h.tick();
    h.tick();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.messages.length, 1);
    assert.equal(h.store.get('clickTimer.state.v1').state, 'finished');
  } finally { h.dispose(); }
});
