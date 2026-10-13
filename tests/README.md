# Headless Tests

These scripts run executables in Node.js without a browser, using mock Canvas/OffscreenCanvas objects. They verify that the emulator can load a binary and reach the Windows message loop (= the program initialized successfully).

## Running a test

```bash
timeout 2 npx tsx tests/test-<name>.mjs
```

A successful run prints `[TEST] SUCCESS: Reached message loop`.

## Creating a new test

1. Copy an existing `test-*.mjs` file
2. Change the exe path and any companion DLLs
3. Adjust `MAX_TICKS` if needed (some programs need more ticks to initialize)

## How it works

Each test file:
- Creates mock Canvas/OffscreenCanvas/DOM objects
- Loads the target executable with `parsePE()` + `emu.load()`
- Calls `emu.tick()` in a loop until `emu.waitingForMessage` is true
- Optionally inspects window hierarchy, child positions, and control state

## Windows XP game tests (assets supplied externally)

`test-xp-*.mjs` run original XP games headlessly via `tests/lib/headless-harness.mjs`.
The binaries are not part of the repository; point `BLISS_ASSETS` (or the first CLI
argument) at a directory containing them (`sol.exe`, `winmine.exe`, `freecell.exe`,
`spider.exe`, `mshearts.exe`, `cards.dll`, `mfc42u.dll`, `nddeapi.dll`):

```bash
BLISS_ASSETS=/path/to/xp-files npx tsx tests/test-xp-sol.mjs
```

Without assets the tests print `[TEST] SKIP` and exit with code 2.
`HARNESS_VERBOSE=1` shows emulator logs, `HARNESS_TRACE=1` enables API tracing.
`test-mouse-buttons.mjs` and `test-locale-ru.mjs` need no binaries.

## Runner checks (browser, Playwright for Python)

`tests/runner/check_runner.py` mounts each XP game through `runner-demo.html` (Luna frame,
Cyrillic menus, menu opens, caption close → `onExit`); `tests/runner/check_scaled.py` runs
Minesweeper under `transform: scale(0.45)` and verifies click mapping and overlay placement.
Start the dev server first (`npx vite --host 127.0.0.1 --port 5291`), then:

```bash
python tests/runner/check_runner.py --assets /path/to/xp-files --out /tmp/shots [--browser firefox]
python tests/runner/check_scaled.py --assets /path/to/xp-files --out /tmp/shots
```

Audio is always muted (Chromium `--mute-audio`, Firefox `media.volume_scale=0.0`).
