<div align="center">

<img src="build/icon.png" alt="Pokeke" width="200" />

# Pokeke

Texas Hold'em poker with bots and local-network multiplayer for desktop.

[![CI](https://github.com/gabrielSantosLima/pokeke/actions/workflows/ci.yml/badge.svg)](https://github.com/gabrielSantosLima/pokeke/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/gabrielSantosLima/pokeke?label=release)](https://github.com/gabrielSantosLima/pokeke/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

</div>

Pokeke is a No Limit Texas Hold'em game for Windows and Linux, built with
Electron. Play against bots with distinct personalities, host a room on your
local network, or join a friend's table. Bots fill every empty seat, so a game
can start with one human or six.

## Key features

- **Complete No Limit Texas Hold'em** — blinds, dealer rotation, pre-flop
  through river, all-ins and side pots.
- **Bots with personality** — Monte Carlo equity estimates, aggression,
  tightness and bluff profiles.
- **Local-network multiplayer** — create a room, discover rooms over UDP, join
  over WebSocket; bots fill empty seats.
- **Reconnect support** — a dropped player keeps their seat for 90 seconds while
  the app reconnects automatically.
- **First-run tutorial** — six steps covering hands, streets, actions, blinds,
  all-ins and LAN play, reopenable from the `?` button.
- **Emoji reactions** — send reactions from the action bar; bots react to
  folds, raises, all-ins, wins and losses.
- **Adjustable pace and difficulty** — Calm, Normal and Fast table speeds plus
  three bot difficulty levels.
- **Portable Windows and Linux builds** — `npm run package` produces
  `release/Pokeke-win32-x64/Pokeke.exe` and `npm run package:linux` produces
  `release/Pokeke-linux-x64/Pokeke`; no installer required.
- **Native release builds** — the release workflow publishes a Windows zip and a
  Linux x64 zip built on Ubuntu.

## Requirements

- Node.js 22.12 or newer for development and packaging (Electron 45 requires
  it).
- Windows 10 or newer to run the Windows portable build.
- Linux x64 to run the Linux portable build.
- No external services, accounts or credentials.

## Getting started

```bash
npm install
npm run desktop
```

Build the portable Windows app:

```bash
npm run package
```

The executable is written to `release/Pokeke-win32-x64/Pokeke.exe`. Keep the
folder together; the `.exe` needs its adjacent files.

Build the portable Linux app:

```bash
npm run package:linux
```

The executable is written to `release/Pokeke-linux-x64/Pokeke`. Keep the folder
together and preserve the executable permissions when copying it. On Linux
distributions where Chromium's sandbox helper is restricted, run
`./Pokeke --no-sandbox` or configure the bundled `chrome-sandbox` for your
system.

The same interface can be served in a browser for development:

```bash
npm start
# http://localhost:3000
```

In the desktop app, choose **Criar sala** to host, then share the shown IP:port
or let others use **Entrar em sala → Procurar salas**. The host starts the
match; bots fill the remaining seats.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file
for details.
