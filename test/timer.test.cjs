const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Countdown, parseDuration, formatTime, MAX_DURATION_MS } = require('../dist/timer');

function setup(duration = 60_000, saved) {
  let time = 1_000_000;
  const timer = new Countdown(duration, saved, () => time);
  return { timer, advance: ms => { time += ms; } };
}

test('click starts, pauses, and resumes without losing remaining time', () => {
  const { timer, advance } = setup();
  assert.equal(timer.state, 'idle');
  timer.toggle();
  advance(12_345);
  timer.toggle();
  assert.equal(timer.state, 'paused');
  assert.equal(timer.remainingMs, 47_655);
  advance(100_000);
  assert.equal(timer.remainingMs, 47_655);
  timer.toggle();
  advance(7655);
  assert.equal(timer.remainingMs, 40_000);
  timer.start(); // Starting a running timer does not reset it.
  assert.equal(timer.remainingMs, 40_000);
});

test('delayed ticks and sleep reach completion exactly once', () => {
  const { timer, advance } = setup();
  timer.start();
  advance(3_600_000);
  assert.equal(timer.remainingMs, 0);
  assert.equal(timer.tick(), true);
  assert.equal(timer.state, 'finished');
  assert.equal(timer.tick(), false);
  timer.toggle();
  assert.equal(timer.state, 'running');
  assert.equal(timer.remainingMs, 60_000);
});

test('pausing at the deadline finishes instead of creating a paused zero timer', () => {
  const { timer, advance } = setup();
  timer.start();
  advance(60_000);
  timer.pause();
  assert.equal(timer.state, 'finished');
  assert.equal(timer.remainingMs, 0);
});

test('stop rewinds; reset preserves running and paused modes; set duration stops', () => {
  const { timer, advance } = setup();
  timer.start();
  advance(10_000);
  timer.reset();
  assert.equal(timer.remainingMs, 60_000);
  assert.equal(timer.state, 'running');
  timer.pause();
  timer.reset();
  assert.equal(timer.state, 'paused');
  timer.stop();
  assert.equal(timer.state, 'idle');
  assert.equal(timer.remainingMs, 60_000);
  timer.start();
  timer.setDuration(90_000);
  assert.equal(timer.state, 'idle');
  assert.equal(timer.remainingMs, 90_000);
  assert.throws(() => timer.setDuration(0), RangeError);
});

test('saved running deadlines survive reload and completion is not repeated', () => {
  const { timer, advance } = setup();
  timer.start();
  advance(20_000);
  const restored = new Countdown(25 * 60_000, timer.snapshot(), () => 1_040_000);
  assert.equal(restored.durationMs, 60_000);
  assert.equal(restored.remainingMs, 20_000);
  const expired = new Countdown(60_000, timer.snapshot(), () => 2_000_000);
  assert.equal(expired.tick(), true);
  const finished = new Countdown(60_000, expired.snapshot(), () => 3_000_000);
  assert.equal(finished.state, 'finished');
  assert.equal(finished.tick(), false);
});

test('paused state survives reload without consuming closed time', () => {
  const { timer, advance } = setup();
  timer.start();
  advance(10_000);
  timer.pause();
  const restored = new Countdown(60_000, timer.snapshot(), () => 9_000_000);
  assert.equal(restored.state, 'paused');
  assert.equal(restored.remainingMs, 50_000);
});

test('invalid persisted state falls back safely', () => {
  const base = setup().timer.snapshot();
  for (const saved of [null, {}, { ...base, version: 2 }, { ...base, durationMs: NaN },
    { ...base, remainingMs: -1 }, { ...base, state: 'bogus' },
    { ...base, state: 'running', deadline: Infinity },
    { ...base, state: 'paused', remainingMs: 0 }, { ...base, state: 'finished' }]) {
    const { timer } = setup(60_000, saved);
    assert.equal(timer.state, 'idle');
    assert.equal(timer.remainingMs, 60_000);
  }
  for (const duration of [0, NaN, Infinity, 999, MAX_DURATION_MS + 1]) {
    assert.throws(() => setup(duration), RangeError);
  }
});

test('parses supported durations and rejects invalid or out-of-range inputs', () => {
  const valid = {
    '25': 1_500_000, '1.5': 90_000, '01:30': 90_000, '1:15:00': 4_500_000,
    '1h 30m': 5_400_000, '45s': 45_000, ' 1M 5S ': 65_000,
    '24h': MAX_DURATION_MS, '1440': MAX_DURATION_MS, '00:01': 1000,
  };
  for (const [input, expected] of Object.entries(valid)) {
    assert.equal(parseDuration(input), expected, input);
  }
  for (const input of ['', ' ', '0', '-5', 'NaN', 'Infinity', '1:60', '1:1', '1:60:00',
    '24:00:01', '25h', '0.001', '2m junk', '1m 2h', '1e3', '1::30', '10 seconds']) {
    assert.equal(parseDuration(input), undefined, input);
  }
});

test('display rounds up and supports hours', () => {
  for (const [ms, expected] of [[0, '00:00'], [1, '00:01'], [1001, '00:02'],
    [60_000, '01:00'], [3_599_999, '1:00:00'], [3_661_000, '1:01:01'],
    [MAX_DURATION_MS, '24:00:00']]) {
    assert.equal(formatTime(ms), expected);
  }
});
