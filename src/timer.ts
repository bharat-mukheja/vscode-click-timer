export const MAX_DURATION_MS = 24 * 60 * 60 * 1000;
export type TimerState = 'idle' | 'running' | 'paused' | 'finished';

export interface TimerSnapshot {
  version: 1;
  durationMs: number;
  remainingMs: number;
  state: TimerState;
  deadline: number | null;
}

function validDuration(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
    && value >= 1000 && value <= MAX_DURATION_MS;
}

function validSnapshot(value: unknown): value is TimerSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Partial<TimerSnapshot>;
  if (s.version !== 1 || !validDuration(s.durationMs)
    || typeof s.remainingMs !== 'number' || !Number.isInteger(s.remainingMs)
    || s.remainingMs < 0 || s.remainingMs > s.durationMs) return false;
  switch (s.state) {
    case 'running':
      return typeof s.deadline === 'number' && Number.isSafeInteger(s.deadline)
        && s.deadline > 0 && s.remainingMs > 0;
    case 'paused': return s.deadline === null && s.remainingMs > 0;
    case 'idle': return s.deadline === null && s.remainingMs === s.durationMs;
    case 'finished': return s.deadline === null && s.remainingMs === 0;
    default: return false;
  }
}

/** Deadlines, rather than interval counts, keep the timer accurate after sleep. */
export class Countdown {
  private duration: number;
  private remaining: number;
  private phase: TimerState = 'idle';
  private deadline: number | null = null;

  constructor(durationMs: number, saved?: unknown, private readonly now = Date.now) {
    if (!validDuration(durationMs)) throw new RangeError('Duration must be 1 second to 24 hours.');
    this.duration = durationMs;
    this.remaining = durationMs;
    if (validSnapshot(saved)) {
      this.duration = saved.durationMs;
      this.remaining = saved.remainingMs;
      this.phase = saved.state;
      this.deadline = saved.deadline;
    }
  }

  get state(): TimerState { return this.phase; }
  get durationMs(): number { return this.duration; }
  get remainingMs(): number {
    return this.deadline === null ? this.remaining
      : Math.min(this.duration, Math.max(0, this.deadline - this.now()));
  }

  /** Returns true exactly once for each completed countdown. */
  tick(): boolean {
    if (this.phase !== 'running' || this.remainingMs > 0) return false;
    this.phase = 'finished';
    this.remaining = 0;
    this.deadline = null;
    return true;
  }

  start(): void {
    if (this.phase === 'running') return;
    if (this.phase === 'finished') this.remaining = this.duration;
    this.deadline = this.now() + this.remaining;
    this.phase = 'running';
  }

  pause(): void {
    if (this.phase !== 'running' || this.tick()) return;
    this.remaining = this.remainingMs;
    this.deadline = null;
    this.phase = 'paused';
  }

  toggle(): void {
    if (this.phase === 'running') this.pause();
    else this.start();
  }

  stop(): void {
    this.phase = 'idle';
    this.remaining = this.duration;
    this.deadline = null;
  }

  /** Reset to the full duration, retaining running/paused state. */
  reset(): void {
    this.remaining = this.duration;
    if (this.phase === 'running') this.deadline = this.now() + this.duration;
    else if (this.phase !== 'paused') this.stop();
  }

  setDuration(durationMs: number): void {
    if (!validDuration(durationMs)) throw new RangeError('Duration must be 1 second to 24 hours.');
    this.duration = durationMs;
    this.stop();
  }

  snapshot(): TimerSnapshot {
    return {
      version: 1,
      durationMs: this.duration,
      // A running snapshot keeps its original anchor; deadline is authoritative.
      remainingMs: this.remaining,
      state: this.phase,
      deadline: this.deadline,
    };
  }
}

/** Bare numbers are minutes; colon forms are MM:SS or H:MM:SS. */
export function parseDuration(input: string): number | undefined {
  const text = input.trim().toLowerCase();
  let seconds: number;
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    seconds = Number(text) * 60;
  } else if (/^\d+:\d{2}(?::\d{2})?$/.test(text)) {
    const parts = text.split(':').map(Number);
    if (parts.slice(1).some(part => part > 59)) return undefined;
    seconds = parts.reduce((total, part) => total * 60 + part, 0);
  } else {
    const match = /^(?:(\d+)\s*h\s*)?(?:(\d+)\s*m\s*)?(?:(\d+)\s*s\s*)?$/.exec(text);
    if (!match || !match.slice(1).some(Boolean)) return undefined;
    seconds = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  }
  const ms = Math.round(seconds * 1000);
  return validDuration(ms) ? ms : undefined;
}

export function formatTime(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const seconds = String(total % 60).padStart(2, '0');
  const minutes = Math.floor(total / 60);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${seconds}`
    : `${String(minutes).padStart(2, '0')}:${seconds}`;
}
