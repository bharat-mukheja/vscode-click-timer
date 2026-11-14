import * as vscode from 'vscode';
import { Countdown, formatTime, MAX_DURATION_MS, parseDuration, TimerSnapshot } from './timer';

const STORAGE_KEY = 'clickTimer.state.v1';
const DURATION_ERROR = 'Enter 1 second to 24 hours: 25 (minutes), 01:30, 1:15:00, or 1h 30m.';

export interface ClickTimerApi {
  getState(): TimerSnapshot & { display: string };
}

class TimerController implements vscode.Disposable {
  private readonly timer: Countdown;
  private readonly status: vscode.StatusBarItem;
  private readonly menu: vscode.StatusBarItem;
  private readonly interval: ReturnType<typeof setInterval>;
  private readonly disposables: vscode.Disposable[] = [];
  private saveQueue: Promise<void> = Promise.resolve();
  private disposed = false;

  constructor(private readonly context: vscode.ExtensionContext) {
    const configured = vscode.workspace.getConfiguration('clickTimer').get<number>('defaultMinutes', 25);
    const duration = Math.min(MAX_DURATION_MS, Math.max(1000, Math.round(configured * 60_000)));
    this.timer = new Countdown(Number.isFinite(duration) ? duration : 25 * 60_000,
      context.workspaceState.get(STORAGE_KEY));
    this.status = vscode.window.createStatusBarItem('clickTimer.timer', vscode.StatusBarAlignment.Left, 10);
    this.status.name = 'Click Timer';
    this.status.command = 'clickTimer.toggle';
    this.menu = vscode.window.createStatusBarItem('clickTimer.menu', vscode.StatusBarAlignment.Left, 9.9);
    this.menu.name = 'Click Timer Menu';
    this.menu.text = '$(chevron-down)';
    this.menu.command = 'clickTimer.showMenu';
    this.menu.tooltip = 'Click Timer: Start, Pause / Resume, Stop, Reset, Set Time';
    this.menu.accessibilityInformation = { label: 'Click Timer menu', role: 'button' };
    this.disposables.push(this.status, this.menu);

    const actions: Record<string, () => void> = {
      toggle: () => this.timer.toggle(),
      start: () => this.timer.start(),
      pause: () => this.timer.pause(),
      stop: () => this.timer.stop(),
      reset: () => this.timer.reset(),
    };
    for (const [name, action] of Object.entries(actions)) {
      this.disposables.push(vscode.commands.registerCommand(`clickTimer.${name}`, async () => {
        this.checkCompletion();
        action();
        this.render();
        await this.persist();
      }));
    }
    this.disposables.push(
      vscode.commands.registerCommand('clickTimer.showMenu', () => this.showMenu()),
      vscode.commands.registerCommand('clickTimer.setTime', (value?: unknown) => this.setTime(value)),
    );
    this.checkCompletion();
    this.render();
    this.status.show();
    this.menu.show();
    this.interval = setInterval(() => {
      this.checkCompletion();
      this.render();
    }, 200);
  }

  getState(): TimerSnapshot & { display: string } {
    return { ...this.timer.snapshot(), remainingMs: this.timer.remainingMs, display: this.status.text };
  }

  private persist(): Promise<void> {
    const snapshot = this.timer.snapshot();
    this.saveQueue = this.saveQueue
      .then(() => this.context.workspaceState.update(STORAGE_KEY, snapshot))
      .catch((error: unknown) => {
        console.error('Click Timer: could not save timer state.', error);
      });
    return this.saveQueue;
  }

  private checkCompletion(): void {
    if (!this.timer.tick()) return;
    void this.persist();
    if (vscode.workspace.getConfiguration('clickTimer').get<boolean>('showCompletionNotification', true)) {
      void vscode.window.showInformationMessage('Click Timer: Time is up!', 'Restart', 'Set Time')
        .then(choice => {
          if (this.disposed) return;
          if (choice === 'Restart') void vscode.commands.executeCommand('clickTimer.start');
          if (choice === 'Set Time') void vscode.commands.executeCommand('clickTimer.setTime');
        });
    }
  }

  private render(): void {
    const state = this.timer.state;
    const time = formatTime(this.timer.remainingMs);
    const icon = state === 'running' ? 'watch' : state === 'paused' ? 'debug-pause'
      : state === 'finished' ? 'bell' : 'clock';
    this.status.text = `$(${icon}) ${time}`;
    const action = state === 'running' ? 'Pause' : state === 'paused' ? 'Resume' : 'Start';
    this.status.accessibilityInformation = {
      label: `Click Timer, ${state}, ${time} remaining. Click to ${action.toLowerCase()}.`,
      role: 'button',
    };
    // Keep the tooltip stable while seconds change so its links remain clickable.
    const tooltip = new vscode.MarkdownString(
      `**Click Timer — ${state}**\n\nClick the timer to **${action.toLowerCase()}**. `
      + 'Use the **⌄** button for all controls.\n\n'
      + `[${action}](command:clickTimer.${state === 'running' ? 'pause' : 'start'})`
      + ' · [Stop](command:clickTimer.stop)'
      + ' · [Reset](command:clickTimer.reset)'
      + ' · [Set Time](command:clickTimer.setTime)'
      + '\n\n[Open Timer Menu](command:clickTimer.showMenu)',
    );
    tooltip.isTrusted = { enabledCommands: [
      'clickTimer.start', 'clickTimer.pause', 'clickTimer.stop',
      'clickTimer.reset', 'clickTimer.setTime', 'clickTimer.showMenu',
    ] };
    if (this.status.tooltip instanceof vscode.MarkdownString
      && this.status.tooltip.value === tooltip.value) return;
    this.status.tooltip = tooltip;
  }

  private async showMenu(): Promise<void> {
    this.checkCompletion();
    const state = this.timer.state;
    const items: (vscode.QuickPickItem & { command: string })[] = [
      state === 'running'
        ? { label: '$(debug-pause) Pause', description: 'Keep the remaining time', command: 'pause' }
        : { label: `$(play) ${state === 'paused' ? 'Resume' : 'Start'}`, command: 'start' },
      { label: '$(debug-stop) Stop', description: 'Stop and return to the full duration', command: 'stop' },
      { label: '$(debug-restart) Reset', description: 'Reset the time; keep running if already running', command: 'reset' },
      { label: '$(clock) Set Time…', description: 'Choose a duration and stop the current timer', command: 'setTime' },
    ];
    const choice = await vscode.window.showQuickPick(items, {
      title: `Click Timer · ${formatTime(this.timer.remainingMs)} · ${state}`,
      placeHolder: 'Timer controls',
    });
    if (choice && !this.disposed) await vscode.commands.executeCommand(`clickTimer.${choice.command}`);
  }

  private async setTime(value?: unknown): Promise<void> {
    let input: string | undefined;
    if (typeof value === 'string') input = value;
    else input = await vscode.window.showInputBox({
      title: 'Click Timer: Set Time',
      prompt: 'Set a new duration. This stops and resets the current countdown.',
      placeHolder: '25, 01:30, 1:15:00, or 1h 30m',
      value: formatTime(this.timer.durationMs),
      validateInput: text => parseDuration(text) === undefined ? DURATION_ERROR : undefined,
    });
    if (input === undefined || this.disposed) return;
    const ms = parseDuration(input);
    if (ms === undefined) {
      await vscode.window.showErrorMessage(DURATION_ERROR);
      return;
    }
    this.timer.setDuration(ms);
    this.render();
    await this.persist();
  }

  dispose(): void {
    this.disposed = true;
    clearInterval(this.interval);
    for (const disposable of this.disposables) disposable.dispose();
  }
}

export function activate(context: vscode.ExtensionContext): ClickTimerApi {
  const controller = new TimerController(context);
  context.subscriptions.push(controller);
  return { getState: () => controller.getState() };
}
