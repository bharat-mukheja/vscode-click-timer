# Click Timer

A small countdown timer that lives in the VS Code status bar.

```text
  ◷ 25:00  ⌄
```

- **Click the time** to start, pause, or resume. A completed timer starts again on click.
- **Click ⌄** to open Start / Resume, Pause, Stop, Reset, and Set Time.
- **Hover over the timer** for clickable controls.
- Open the Command Palette and search **Click Timer** for the same commands.
- When time runs out, the timer shows a bell and an optional notification.

**Right-click limitation:** VS Code reserves the status bar's right-click menu for showing and hiding items. Its public extension API does not expose custom right-click menus for status bar items, so Click Timer provides the adjacent ⌄ menu button and hover controls instead. See the [StatusBarItem API](https://code.visualstudio.com/api/references/vscode-api#StatusBarItem).

## Install

Find **Click Timer** by **bmukheja** in the VS Code Extensions view, or install it from the command line:

```sh
code --install-extension bmukheja.vscode-click-timer
```

[Marketplace listing](https://marketplace.visualstudio.com/items?itemName=bmukheja.vscode-click-timer) · [Download a VSIX from GitHub Releases](https://github.com/bharat-mukheja/vscode-click-timer/releases)

### Install a local package

Build the extension with `npm install` and `npm run package`, then install `click-timer.vsix` using **Extensions → … → Install from VSIX…**, or:

```sh
code --install-extension ./click-timer.vsix
```

Requires VS Code 1.96 or newer. The extension activates automatically after startup. If the item was hidden using VS Code's status bar menu, right-click the status bar and enable **Click Timer** and **Click Timer Menu**.

## Set a duration

Choose **Set Time** and enter one of:

| Input | Duration |
| --- | --- |
| `25` | 25 minutes |
| `1.5` | 1 minute, 30 seconds |
| `01:30` | 1 minute, 30 seconds |
| `1:15:00` | 1 hour, 15 minutes |
| `1h 30m` | 1 hour, 30 minutes |
| `45s` | 45 seconds |

Durations range from 1 second to 24 hours. Colon forms are **MM:SS** or **H:MM:SS**; the seconds and middle minutes fields must be two digits from 00 to 59.

**Set Time** stops the current countdown and loads the new duration. Click the timer to start it. **Stop** stops and restores the full duration. **Reset** restores the full duration while preserving running or paused state.

Timer state is saved per workspace, including the last duration. A running timer uses an absolute deadline: it continues through computer sleep and VS Code reloads or closure. Reopening after the deadline shows completion. Paused timers stay paused. Separate workspaces have separate timers; two windows on the same workspace should be treated as independent sessions, not synchronized timers.

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `clickTimer.defaultMinutes` | `25` | Initial duration for a workspace without saved state |
| `clickTimer.showCompletionNotification` | `true` | Show a notification at completion |

Changing the default does not replace a workspace's saved timer. Use **Set Time** to change that timer. No keyboard shortcuts are claimed; assign any Click Timer command through **Preferences: Open Keyboard Shortcuts**.

## Development

```sh
git clone https://github.com/bharat-mukheja/vscode-click-timer.git
cd vscode-click-timer
npm ci
npm test
npm run package
```

Press **F5** to launch an Extension Development Host with the timer. `npm run test:integration` runs a smoke test in a separate VS Code instance. Set `VSCODE_EXECUTABLE_PATH` to test an installed VS Code executable; otherwise the runner downloads a test instance.

The runtime has no third-party dependencies, network requests, or telemetry. `src/timer.ts` contains the clock and duration parser; `src/extension.ts` connects it to VS Code's status bar, commands, input, and workspace storage.
