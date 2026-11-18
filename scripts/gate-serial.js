#!/usr/bin/env node
/**
 * gate-serial.js — run gate2.js through a global render lock.
 *
 * Chromium is memory-hungry and Railway containers have a small /dev/shm plus a
 * hard memory ceiling. Two concurrent gate runs were enough to get the process
 * group SIGTERMed, which looked like "the gate stopped working" but was really
 * the OOM killer taking the render.
 *
 * This wrapper guarantees ONE gate/Chromium at a time across the whole box, no
 * matter how many builders or cron jobs are running:
 *   - takes an exclusive flock on /tmp/gate2.lock
 *   - reaps any orphan Chromium before starting
 *   - runs gate2.js, then always reaps again
 *   - times out (default 240s) so a wedged render can never block the queue
 *
 * Usage: node scripts/gate-serial.js <page.html> [liveUrl]
 * Exit codes are gate2's own (0 pass, 1 fail, 2 cannot run) plus:
 *   3 = lock/render timeout or kill, 4 = could not acquire lock
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const LOCK_PATH = '/tmp/gate2.lock';
const TIMEOUT_MS = Number(process.env.GATE_TIMEOUT_MS || 240000);

function reapChromium() {
  for (const pat of ['chrome', 'chromium']) {
    try {
      execFileSync('pkill', ['-9', '-f', pat], { stdio: 'ignore', timeout: 10000 });
    } catch (e) { /* nothing matched, which is the normal case */ }
  }
}

function sleepMs(ms) {
  spawnSync('sleep', [String(Math.max(1, Math.round(ms / 1000)))]);
}

function run() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('usage: gate-serial.js <page.html> [liveUrl]');
    return 2;
  }

  const gate = path.join(__dirname, 'gate2.js');

  reapChromium();

  const deadline = Date.now() + TIMEOUT_MS;
  let attempt = 0;
  for (;;) {
    attempt++;
    // flock -n gives us the exclusive render slot or fails instantly.
    // The command run under the lock is just gate2; reaping happens here in JS
    // so we never depend on a particular /bin/sh flavour ($? expansions differ
    // between dash and bash, which broke an earlier version of this wrapper).
    const remaining = Math.max(5000, deadline - Date.now());
    const res = spawnSync('flock', ['-n', LOCK_PATH, process.execPath, gate, ...args], {
      stdio: 'inherit',
      timeout: remaining,
    });

    if (res.error && res.error.code === 'ETIMEDOUT') {
      reapChromium();
      console.error('GATE_ERROR: render timed out — Chromium reaped');
      return 3;
    }
    if (res.error) {
      reapChromium();
      console.error('GATE_ERROR: could not run gate — ' + res.error.message);
      return 2;
    }
    reapChromium();

    if (res.signal) {
      console.error(`GATE_ERROR: render killed by ${res.signal} — Chromium reaped`);
      return 3;
    }
    // gate2's own codes
    if (res.status === 0 || res.status === 1 || res.status === 2) return res.status;

    // flock -n returns 1 when the lock is busy; back off and retry to deadline.
    // A stuck peer must never stall the whole queue forever.
    if (Date.now() > deadline) {
      console.error('GATE_ERROR: could not acquire render lock before deadline');
      return 4;
    }
    sleepMs(Math.min(1500 * attempt, 8000));
  }
}

process.exit(run());
