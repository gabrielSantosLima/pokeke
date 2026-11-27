import { PokerGame, GameAborted } from './game.js';
import { pickBotProfiles } from './ai.js';
import { PokerUI } from './ui.js';
import { initAudio, isMuted, setMuted } from './audio.js';
import { formatChips } from './cards.js';
import { SPEEDS, SPEED_ORDER } from './speed.js';
import { RemoteGame } from './remote-game.js';
import { TUTORIAL_STEPS } from './tutorial.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const desktop = window.pokekeDesktop || null;

const ui = new PokerUI(document);

const settings = {
  bots: 3,
  stack: 2000,
  blinds: '10:20',
  difficulty: 'normal',
  speed: 'calm',
  seats: 4,
  mpStack: 2000,
  mpBlinds: '10:20',
  mpDifficulty: 'normal',
  mpSpeed: 'calm',
};

let currentGame = null;
let currentSpeed = 'calm';
let runToken = 0;
let handsPlayed = 0;
let startingStack = settings.stack;
let net = null;
let gameMode = 'solo';

const els = {
  start: document.getElementById('start-overlay'),
  end: document.getElementById('end-overlay'),
  lobby: document.getElementById('lobby-overlay'),
  reconnect: document.getElementById('reconnect-overlay'),
  reconnectText: document.getElementById('reconnect-text'),
  reconnectCancel: document.getElementById('reconnect-cancel'),
  tutorial: document.getElementById('tutorial-overlay'),
  tutorialTitle: document.getElementById('tutorial-title'),
  tutorialText: document.getElementById('tutorial-text'),
  tutorialVisual: document.getElementById('tutorial-visual'),
  tutorialDots: document.getElementById('tutorial-dots'),
  tutorialBack: document.getElementById('tutorial-back'),
  tutorialNext: document.getElementById('tutorial-next'),
  endTitle: document.getElementById('end-title'),
  endText: document.getElementById('end-text'),
  endStats: document.getElementById('end-stats'),
  endNote: document.getElementById('end-note'),
  again: document.getElementById('again-btn'),
  endMenu: document.getElementById('end-menu-btn'),
  sound: document.getElementById('sound-btn'),
  speed: document.getElementById('speed-btn'),
  roomList: document.getElementById('room-list'),
  joinNote: document.getElementById('join-note'),
  startClose: document.getElementById('start-close'),
  lobbyClose: document.getElementById('lobby-close'),
  reconnectClose: document.getElementById('reconnect-close'),
  tutorialClose: document.getElementById('tutorial-close'),
  endClose: document.getElementById('end-close'),
  error: document.getElementById('error-overlay'),
  errorTitle: document.getElementById('error-title'),
  errorText: document.getElementById('error-text'),
  errorRetry: document.getElementById('error-retry'),
  errorDismiss: document.getElementById('error-dismiss'),
  errorClose: document.getElementById('error-close'),
  updateBtn: document.getElementById('update-btn'),
  updateOverlay: document.getElementById('update-overlay'),
  updateTitle: document.getElementById('update-title'),
  updateText: document.getElementById('update-text'),
  updateProgress: document.getElementById('update-progress'),
  updateProgressBar: document.getElementById('update-progress-bar'),
  updatePrimary: document.getElementById('update-primary'),
  updateRelease: document.getElementById('update-release'),
  updateNote: document.getElementById('update-note'),
  updateClose: document.getElementById('update-close'),
};

let toastTimer = null;
let reconnectRun = 0;
let reconnectTimer = null;
let reconnectSocket = null;
let tutorialStep = 0;
let errorRetryHandler = null;
let appInfo = null;
let updateStatus = {
  state: 'idle',
  version: null,
  percent: 0,
  error: null,
  canInstall: false,
  manual: false,
  channel: 'production',
};

// ---------------------------------------------------------------- helpers

function hideOverlays() {
  els.start.classList.add('hidden');
  els.end.classList.add('hidden');
  els.lobby.classList.add('hidden');
  els.reconnect.classList.add('hidden');
  els.error.classList.add('hidden');
  els.updateOverlay.classList.add('hidden');
}

function showError({ title = 'Algo deu errado', text, retry = null }) {
  els.errorTitle.textContent = title;
  els.errorText.textContent =
    text || 'Não foi possível concluir a operação. Verifique sua conexão e tente novamente.';
  errorRetryHandler = retry;
  els.errorRetry.hidden = !retry;
  els.errorDismiss.textContent = retry ? 'Fechar' : 'Voltar';
  els.error.classList.remove('hidden');
}

function closeError() {
  els.error.classList.add('hidden');
  errorRetryHandler = null;
}

async function retryLastError() {
  const handler = errorRetryHandler;
  closeError();
  if (!handler) return;
  try {
    await handler();
  } catch (error) {
    console.error(error);
    showError({
      title: 'A operação falhou novamente',
      text: 'Verifique sua conexão e tente outra vez.',
      retry: handler,
    });
  }
}

function showReconnectOverlay(text) {
  els.reconnectText.textContent = text;
  els.reconnect.classList.remove('hidden');
}

function hideReconnectOverlay() {
  els.reconnect.classList.add('hidden');
}

function saveReconnect(session) {
  if (!session || !session.reconnect) return;
  try {
    sessionStorage.setItem('pokeke:reconnect', JSON.stringify(session.reconnect));
  } catch {
    /* ignore */
  }
}

function clearSavedReconnect() {
  try {
    sessionStorage.removeItem('pokeke:reconnect');
  } catch {
    /* ignore */
  }
}

function cancelReconnectAttempts() {
  reconnectRun += 1;
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
  if (reconnectSocket) {
    try {
      reconnectSocket.close();
    } catch {
      /* ignore */
    }
    reconnectSocket = null;
  }
}

function showToast(text) {
  const toast = document.getElementById('toast');
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3400);
}

const CHANNEL_LABELS = {
  production: 'estável',
  beta: 'beta',
  development: 'desenvolvimento',
};

function versionLine() {
  if (!appInfo) return '';
  return `Versão ${appInfo.version} · canal ${CHANNEL_LABELS[appInfo.channel] || appInfo.channel}`;
}

function refreshUpdateBadge() {
  if (!desktop || !els.updateBtn) return;
  els.updateBtn.hidden = false;
  els.updateBtn.classList.toggle(
    'has-update',
    ['available', 'downloading', 'downloaded'].includes(updateStatus.state),
  );
  els.updateBtn.classList.toggle('has-error', updateStatus.state === 'error');
  if (updateStatus.state === 'downloading') {
    els.updateBtn.title = `Baixando atualização — ${updateStatus.percent}%`;
  } else if (updateStatus.state === 'available') {
    els.updateBtn.title = `Atualização ${updateStatus.version} disponível`;
  } else if (updateStatus.state === 'downloaded') {
    els.updateBtn.title = 'Atualização pronta para instalar';
  } else if (updateStatus.state === 'error') {
    els.updateBtn.title = 'Falha ao verificar atualizações';
  } else {
    els.updateBtn.title = 'Atualizações';
  }
}

function renderUpdate() {
  const state = updateStatus.state;
  const version = updateStatus.version;
  const percent = updateStatus.percent || 0;
  const versionLabel = versionLine();
  let title = 'Atualizações';
  let text = versionLabel || 'Verifique se há uma versão nova do Pokeke.';
  let primary = 'Verificar atualizações';
  let primaryDisabled = false;
  let note = 'A verificação automática acontece a cada 6 horas.';
  let showProgress = false;

  if (state === 'checking') {
    title = 'Verificando atualizações…';
    text = 'Aguarde um instante enquanto procuramos uma versão nova.';
    primary = 'Verificando…';
    primaryDisabled = true;
    note = versionLabel;
  } else if (state === 'available') {
    title = 'Atualização disponível';
    text = updateStatus.manual
      ? `A versão ${version} está disponível. Abra a página de releases para baixar o instalador.`
      : `A versão ${version} está disponível. O download começa automaticamente.`;
    primary = updateStatus.manual ? 'Abrir página de download' : 'Baixar agora';
    note = versionLabel;
  } else if (state === 'downloading') {
    title = 'Baixando atualização';
    text = `Baixando a versão ${version || 'nova'} — ${percent}%.`;
    primary = `Baixando… ${percent}%`;
    primaryDisabled = true;
    note = 'Você pode continuar jogando enquanto o download termina.';
    showProgress = true;
  } else if (state === 'downloaded') {
    title = 'Atualização pronta';
    text = `A versão ${version} foi baixada. Reinicie o aplicativo para concluir a instalação.`;
    primary = 'Reiniciar e instalar';
    note = 'A partida atual será encerrada para aplicar a atualização.';
    showProgress = true;
  } else if (state === 'error') {
    title = 'Não foi possível atualizar';
    text = updateStatus.error || 'A verificação falhou. Confira sua conexão e tente novamente.';
    primary = 'Tentar novamente';
    note = versionLabel;
  } else if (!desktop) {
    text = 'As atualizações automáticas estão disponíveis no aplicativo desktop.';
    primary = 'Ver página de releases';
    note = '';
  } else if (appInfo && appInfo.channel === 'development') {
    text = `${versionLabel} — este é um build de desenvolvimento.`;
    primary = 'Ver página de releases';
    note = 'Atualizações automáticas ficam desativadas no canal de desenvolvimento.';
  }

  els.updateTitle.textContent = title;
  els.updateText.textContent = text;
  els.updatePrimary.textContent = primary;
  els.updatePrimary.disabled = primaryDisabled;
  els.updateNote.textContent = note;
  els.updateProgress.hidden = !showProgress;
  els.updateProgressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  refreshUpdateBadge();
}

function openUpdateOverlay() {
  renderUpdate();
  els.updateOverlay.classList.remove('hidden');
}

function closeUpdateOverlay() {
  els.updateOverlay.classList.add('hidden');
}

async function runUpdateAction() {
  if (!desktop) return;
  try {
    if (appInfo && appInfo.channel === 'development' && updateStatus.state === 'idle') {
      if (desktop.openRelease) desktop.openRelease();
      return;
    }
    if (updateStatus.state === 'downloaded' && desktop.installUpdate) {
      desktop.installUpdate();
      return;
    }
    if (updateStatus.state === 'available' && updateStatus.manual && desktop.openRelease) {
      desktop.openRelease();
      return;
    }
    updateStatus = { ...updateStatus, state: 'checking', error: null };
    renderUpdate();
    const next = await desktop.checkForUpdates();
    if (next) updateStatus = next;
    renderUpdate();
  } catch (error) {
    console.error(error);
    updateStatus = {
      ...updateStatus,
      state: 'error',
      error: error.message || 'Falha ao verificar atualizações.',
    };
    renderUpdate();
  }
}

function initUpdates() {
  if (!desktop || typeof desktop.getUpdateState !== 'function') {
    els.updateBtn.hidden = true;
    return;
  }
  els.updateBtn.hidden = false;
  els.updateBtn.addEventListener('click', openUpdateOverlay);
  els.updateClose.addEventListener('click', closeUpdateOverlay);
  els.updatePrimary.addEventListener('click', runUpdateAction);
  els.updateRelease.addEventListener('click', () => {
    if (desktop.openRelease) desktop.openRelease();
  });

  desktop
    .getInfo()
    .then((info) => {
      appInfo = info;
      renderUpdate();
    })
    .catch((error) => console.error(error));
  desktop
    .getUpdateState()
    .then((state) => {
      if (state) updateStatus = state;
      renderUpdate();
    })
    .catch((error) => console.error(error));
  if (desktop.onUpdateStatus) {
    desktop.onUpdateStatus((state) => {
      if (!state) return;
      updateStatus = state;
      renderUpdate();
    });
  }
}

function money(value) {
  return formatChips(value);
}

function parseBlinds(value) {
  const [small, big] = String(value).split(':').map(Number);
  return [Number.isFinite(small) ? small : 10, Number.isFinite(big) ? big : 20];
}

function soloConfig(extra = {}) {
  const [smallBlind, bigBlind] = parseBlinds(settings.blinds);
  return {
    bots: settings.bots,
    stack: settings.stack,
    smallBlind,
    bigBlind,
    difficulty: settings.difficulty,
    speed: settings.speed,
    ...extra,
  };
}

// ------------------------------------------------------------- settings UI

document.querySelectorAll('.segmented').forEach((group) => {
  group.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-value]');
    if (!button) return;
    group.querySelectorAll('button').forEach((item) => {
      item.classList.toggle('selected', item === button);
    });
    const key = group.dataset.setting;
    const raw = button.dataset.value;
    if (key === 'bots') settings.bots = Number(raw);
    else if (key === 'stack') settings.stack = Number(raw);
    else if (key === 'blinds') settings.blinds = raw;
    else if (key === 'difficulty') settings.difficulty = raw;
    else if (key === 'speed') setSpeed(raw);
    else if (key === 'seats') settings.seats = Number(raw);
    else if (key === 'mpStack') settings.mpStack = Number(raw);
    else if (key === 'mpBlinds') settings.mpBlinds = raw;
    else if (key === 'mpDifficulty') settings.mpDifficulty = raw;
    else if (key === 'mpSpeed') settings.mpSpeed = raw;
  });
});

function setMode(mode) {
  gameMode = mode;
  document.querySelectorAll('#mode-tabs button').forEach((button) => {
    button.classList.toggle('selected', button.dataset.mode === mode);
  });
  document.querySelectorAll('.mode-panel').forEach((panel) => {
    panel.classList.toggle('hidden', panel.dataset.panel !== mode);
  });
  if (mode === 'join') scanRooms();
}

document.querySelectorAll('#mode-tabs button').forEach((button) => {
  button.addEventListener('click', () => setMode(button.dataset.mode));
});

// ---------------------------------------------------------------- speed UI

function refreshSpeedButton() {
  const preset = SPEEDS[currentSpeed] || SPEEDS.calm;
  els.speed.innerHTML = `<span class="speed-icon">${preset.icon}</span><span class="speed-text">${preset.label}</span>`;
  els.speed.title = `Ritmo: ${preset.label} — clique para alternar`;
}

function syncSpeedGroup() {
  document
    .querySelectorAll('.segmented[data-setting="speed"] button')
    .forEach((button) => button.classList.toggle('selected', button.dataset.value === currentSpeed));
}

function setSpeed(key) {
  if (!SPEEDS[key]) return;
  currentSpeed = key;
  settings.speed = key;
  if (currentGame) currentGame.setSpeed(SPEEDS[key]);
  syncSpeedGroup();
  refreshSpeedButton();
}

els.speed.addEventListener('click', () => {
  if (net) {
    showToast('O ritmo da sala é definido pelo anfitrião.');
    return;
  }
  const index = SPEED_ORDER.indexOf(currentSpeed);
  setSpeed(SPEED_ORDER[(index + 1) % SPEED_ORDER.length]);
});

refreshSpeedButton();

// ----------------------------------------------------------------- sound UI

function refreshSoundButton() {
  const muted = isMuted();
  els.sound.textContent = muted ? '🔇' : '🔊';
  els.sound.classList.toggle('muted', muted);
  els.sound.title = muted ? 'Ativar som' : 'Desativar som';
}

els.sound.addEventListener('click', () => {
  initAudio();
  setMuted(!isMuted());
  refreshSoundButton();
});

refreshSoundButton();

// ----------------------------------------------------------- start / leave

function showStartMenu() {
  runToken += 1;
  if (currentGame) {
    currentGame.abort();
    currentGame = null;
  }
  disconnectNet(true);
  hideOverlays();
  els.start.classList.remove('hidden');
  els.speed.style.display = '';
  ui.reset();
  setMode('solo');
  refreshSpeedButton();
}

document.getElementById('restart-btn').addEventListener('click', showStartMenu);

// Every overlay has an explicit exit: close button, Escape and (where it
// makes sense) a back/skip action. These handlers keep those paths in sync.
els.startClose.addEventListener('click', () => els.start.classList.add('hidden'));
els.lobbyClose.addEventListener('click', () => document.getElementById('lobby-leave').click());
els.reconnectClose.addEventListener('click', () => els.reconnectCancel.click());
els.tutorialClose.addEventListener('click', () => closeTutorial());
els.endClose.addEventListener('click', () => els.endMenu.click());
els.errorClose.addEventListener('click', closeError);
els.errorDismiss.addEventListener('click', closeError);
els.errorRetry.addEventListener('click', retryLastError);

document.getElementById('start-btn').addEventListener('click', () => {
  initAudio();
  startGame(soloConfig());
});

document.getElementById('end-menu-btn').addEventListener('click', () => {
  showStartMenu();
});

document.getElementById('again-btn').addEventListener('click', () => {
  if (net && net.joined) {
    if (!net.isHost) return;
    net.awaitingRematch = true;
    net.ws.send(JSON.stringify({ t: 'start' }));
    els.endTitle.textContent = 'Preparando a próxima partida…';
    els.endText.textContent = '';
    return;
  }
  els.end.classList.add('hidden');
  startGame(soloConfig());
});

// ------------------------------------------------------------- solo game

function buildPlayers(config) {
  const profiles = pickBotProfiles(config.bots);
  const players = [
    { id: 'human', name: 'Você', avatar: '🧑', isHuman: true, stack: config.stack },
  ];
  profiles.forEach((profile, index) => {
    players.push({
      id: `bot-${index}`,
      name: profile.name,
      avatar: profile.avatar,
      stack: config.stack,
      strategy: profile,
    });
  });
  return players;
}

async function startGame(config) {
  runToken += 1;
  const token = runToken;

  if (currentGame) currentGame.abort();
  disconnectNet(true);

  const [smallBlind, bigBlind] = parseBlinds(config.blinds || settings.blinds);
  const players = buildPlayers(config);
  const speed = SPEEDS[config.speed] || SPEEDS.calm;
  setSpeed(config.speed || 'calm');

  const game = new PokerGame({
    players,
    smallBlind,
    bigBlind,
    difficulty: config.difficulty,
    botDelayMin: speed.botDelayMin,
    botDelayMax: speed.botDelayMax,
    pauseScale: speed.pauseScale,
    viewerId: 'human',
    onEvent: (event) => {
      if (event.type === 'hand-end') handsPlayed += 1;
      ui.handleEvent(event);
    },
  });

  currentGame = game;
  handsPlayed = 0;
  startingStack = config.stack;

  ui.bindGame(game, 'human');
  hideOverlays();
  initAudio();

  try {
    while (token === runToken) {
      const result = await game.playHand();
      if (token !== runToken) return;
      if (result.gameOver) {
        await sleep(850 * speed.pauseScale);
        if (token !== runToken) return;
        showEnd(game);
        return;
      }
      await sleep(420 * speed.pauseScale);
      if (token !== runToken) return;
    }
  } catch (error) {
    if (error instanceof GameAborted) return;
    console.error(error);
    showError({
      title: 'A partida foi interrompida',
      text: 'Um erro inesperado aconteceu. Você pode começar outra partida.',
      retry: () => startGame(config),
    });
  }
}

function showEnd(game) {
  const human = game.players.find((p) => p.isHuman);
  const alive = game.players.filter((p) => p.stack > 0);
  const dominated = human && human.stack > 0 && alive.length === 1;
  const finalStack = human ? human.stack : 0;
  const balance = finalStack - startingStack;
  const balanceText = `${balance >= 0 ? '+' : '−'}${formatChips(Math.abs(balance))}`;

  els.endTitle.textContent = dominated
    ? 'Você dominou a mesa!'
    : human && human.stack <= 0
      ? 'Suas fichas acabaram'
      : 'Fim de jogo';
  els.endText.textContent = dominated
    ? 'Todos os bots ficaram sem fichas. A mesa é sua.'
    : human && human.stack <= 0
      ? 'Os bots levaram a melhor desta vez. Ajuste a estratégia e tente de novo.'
      : 'A partida foi encerrada.';

  els.endStats.innerHTML = `
    <div class="end-stat"><small>Mãos</small><strong>${handsPlayed}</strong></div>
    <div class="end-stat"><small>Fichas finais</small><strong>${formatChips(finalStack)}</strong></div>
    <div class="end-stat"><small>Saldo</small><strong>${balanceText}</strong></div>
  `;

  els.again.hidden = false;
  els.again.textContent = 'Jogar novamente';
  els.endMenu.textContent = 'Mudar configurações';
  els.endNote.textContent = '';
  els.end.classList.remove('hidden');
}

// -------------------------------------------------------------- LAN rooms

async function createHostRoom() {
  if (!desktop) {
    showToast('Criar sala está disponível no app desktop.');
    return;
  }
  initAudio();
  const button = document.getElementById('host-btn');
  button.disabled = true;
  try {
    const [smallBlind, bigBlind] = parseBlinds(settings.mpBlinds);
    const hostName = document.getElementById('host-name').value.trim() || 'Anfitrião';
    const info = await desktop.createRoom({
      hostName,
      capacity: settings.seats,
      smallBlind,
      bigBlind,
      stack: settings.mpStack,
      difficulty: settings.mpDifficulty,
      speed: settings.mpSpeed,
    });
    connectToRoom({
      url: `ws://127.0.0.1:${info.port}/ws`,
      name: hostName,
      adminToken: info.adminToken,
      host: true,
    });
  } catch (error) {
    console.error(error);
    showError({
      title: 'Não foi possível criar a sala',
      text: 'Confira se a rede local está disponível e tente novamente.',
      retry: createHostRoom,
    });
  } finally {
    button.disabled = false;
  }
}

document.getElementById('host-btn').addEventListener('click', createHostRoom);

async function scanRooms() {
  const button = document.getElementById('scan-btn');
  if (!desktop) {
    els.roomList.innerHTML = '<div class="room-empty">No navegador, use o endereço IP da sala abaixo.</div>';
    els.joinNote.textContent = 'A descoberta automática está disponível no app desktop.';
    return;
  }
  button.disabled = true;
  button.textContent = 'Procurando…';
  try {
    const rooms = await desktop.discoverRooms();
    renderRooms(rooms);
  } catch (error) {
    console.error(error);
    els.roomList.innerHTML = '<div class="room-empty">Não foi possível procurar salas.</div>';
    showError({
      title: 'Não foi possível procurar salas',
      text: 'Verifique se o app tem acesso à rede local e tente novamente.',
      retry: scanRooms,
    });
  } finally {
    button.disabled = false;
    button.textContent = 'Procurar salas';
  }
}

document.getElementById('scan-btn').addEventListener('click', scanRooms);

function renderRooms(rooms) {
  els.roomList.innerHTML = '';
  if (!rooms || rooms.length === 0) {
    els.roomList.innerHTML = '<div class="room-empty">Nenhuma sala encontrada. Peça o IP ao anfitrião.</div>';
    return;
  }
  for (const room of rooms) {
    const row = document.createElement('div');
    row.className = 'room-row';
    const main = document.createElement('div');
    main.className = 'room-main';
    const name = document.createElement('div');
    name.className = 'room-name';
    name.textContent = room.name || 'Mesa';
    const meta = document.createElement('div');
    meta.className = 'room-meta';
    const statusText = room.status === 'playing' ? 'em andamento' : 'aguardando';
    meta.textContent = `${room.host || 'Anfitrião'} · ${room.players || 1}/${room.capacity || '?'} jogadores · ${statusText}`;
    main.append(name, meta);

    const join = document.createElement('button');
    join.type = 'button';
    join.className = 'btn btn-call room-join';
    join.textContent = 'Entrar';
    join.disabled = room.status === 'playing' || (room.players || 0) >= (room.capacity || 6);
    join.addEventListener('click', () => {
      const playerName = document.getElementById('join-name').value.trim() || 'Jogador';
      connectToRoom({
        url: `ws://${room.address}:${room.port}/ws`,
        name: playerName,
        host: false,
      });
    });

    row.append(main, join);
    els.roomList.appendChild(row);
  }
}

document.getElementById('manual-join-btn').addEventListener('click', () => {
  const raw = document.getElementById('manual-address').value.trim();
  if (!raw) {
    showToast('Informe o endereço da sala.');
    return;
  }
  let url;
  try {
    const normalized = /^ws:\/\//i.test(raw) ? raw : `ws://${raw}`;
    const parsed = new URL(normalized);
    if (!parsed.port) throw new Error('missing port');
    url = `ws://${parsed.hostname}:${parsed.port}/ws`;
  } catch {
    showToast('Endereço inválido. Use IP:porta.');
    return;
  }
  const playerName = document.getElementById('join-name').value.trim() || 'Jogador';
  connectToRoom({ url, name: playerName, host: false });
});

// ------------------------------------------------------------ net session

function setNetUi(active) {
  els.speed.style.display = active ? 'none' : '';
}

function reportConnectionFailure(session, title, text) {
  if (session.failed) return;
  session.failed = true;
  session.intentional = true;
  try {
    if (session.ws) session.ws.close();
  } catch {
    /* ignore */
  }
  if (net === session) net = null;
  setNetUi(false);
  setMode('join');
  showError({
    title,
    text,
    retry: () =>
      connectToRoom({
        url: session.url,
        name: session.name,
        adminToken: session.adminToken,
        host: session.host,
      }),
  });
}

function connectToRoom({ url, name, adminToken = null, host = false }) {
  disconnectNet(false);
  let socket;
  try {
    socket = new WebSocket(url);
  } catch {
    showError({
      title: 'Endereço inválido',
      text: 'Confira o endereço da sala. O formato esperado é IP:porta.',
    });
    return;
  }

  const session = {
    ws: socket,
    url,
    name,
    adminToken,
    host,
    isHost: host,
    viewerId: null,
    joined: false,
    inGame: false,
    awaitingRematch: false,
    intentional: false,
    failed: false,
    reconnecting: false,
    remoteGame: null,
    lobby: null,
    reconnect: null,
  };
  net = session;

  const timeout = setTimeout(() => {
    if (net === session && !session.viewerId && !session.failed) {
      reportConnectionFailure(
        session,
        'A sala não respondeu',
        'Confira o endereço e se o anfitrião ainda está com a sala aberta.',
      );
    }
  }, 8000);

  socket.addEventListener('open', () => {
    socket.send(JSON.stringify({ t: 'join', name, adminToken }));
  });

  socket.addEventListener('message', (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (net !== session) return;
    clearTimeout(timeout);
    handleNetMessage(session, message);
  });

  socket.addEventListener('close', () => {
    clearTimeout(timeout);
    if (net !== session) return;
    if (session.intentional) {
      net = null;
      setNetUi(false);
      return;
    }
    if (session.inGame && session.reconnect && !session.reconnecting) {
      startReconnect(session);
      return;
    }
    if (!session.joined) {
      reportConnectionFailure(
        session,
        'A conexão com a sala foi encerrada',
        'A sala pode ter fechado antes de você entrar. Tente novamente.',
      );
      return;
    }
    net = null;
    setNetUi(false);
    showToast('A conexão com a sala foi encerrada.');
    els.lobby.classList.add('hidden');
    els.end.classList.add('hidden');
    els.start.classList.remove('hidden');
    ui.reset();
    setMode('join');
  });

  socket.addEventListener('error', () => {
    if (session.failed || session.joined) return;
    reportConnectionFailure(
      session,
      'Não foi possível conectar à sala',
      'Confira o endereço, a rede local e se o anfitrião está com a sala aberta.',
    );
  });
}

function disconnectNet(notify = true) {
  const session = net;
  net = null;
  setNetUi(false);
  cancelReconnectAttempts();
  hideReconnectOverlay();
  clearSavedReconnect();
  if (!session) return;
  session.intentional = true;
  try {
    if (session.ws && session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify({ t: 'leave' }));
    }
    if (session.ws) session.ws.close();
  } catch {
    /* ignore */
  }
  if (session.host && desktop) {
    desktop.closeRoom().catch(() => {});
  }
}

function startReconnect(session) {
  if (!session || !session.reconnect) return;
  if (session.reconnecting) return;
  session.reconnecting = true;
  const run = ++reconnectRun;
  net = session;
  setNetUi(true);
  els.start.classList.add('hidden');
  els.lobby.classList.add('hidden');
  els.end.classList.add('hidden');
  showReconnectOverlay('Conexão perdida. Sua vaga está reservada.');

  const delays = [0, 700, 1600, 3000, 5000, 8000];
  let attempt = 0;

  const finishFailure = () => {
    if (run !== reconnectRun) return;
    session.reconnecting = false;
    hideReconnectOverlay();
    net = null;
    setNetUi(false);
    clearSavedReconnect();
    els.start.classList.remove('hidden');
    els.end.classList.add('hidden');
    els.lobby.classList.add('hidden');
    ui.reset();
    setMode('join');
    showError({
      title: 'Não foi possível reconectar à partida',
      text: 'A partida pode ter terminado ou a rede local caiu. Confira sua conexão e tente novamente.',
      retry: () => {
        session.reconnecting = false;
        startReconnect(session);
      },
    });
  };

  const scheduleNext = () => {
    if (run !== reconnectRun || net !== session) return;
    if (attempt >= delays.length) {
      finishFailure();
      return;
    }
    reconnectTimer = setTimeout(attemptOnce, delays[attempt]);
  };

  const attemptOnce = () => {
    if (run !== reconnectRun || net !== session || session.intentional) return;
    attempt += 1;
    els.reconnectText.textContent = `Conexão perdida. Tentativa ${attempt} de ${delays.length}…`;

    let settled = false;
    let socket;
    try {
      socket = new WebSocket(session.reconnect.url);
    } catch {
      scheduleNext();
      return;
    }
    reconnectSocket = socket;

    const fail = () => {
      if (settled) return;
      settled = true;
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      scheduleNext();
    };

    socket.addEventListener('open', () => {
      socket.send(
        JSON.stringify({
          t: 'rejoin',
          playerId: session.reconnect.playerId,
          token: session.reconnect.token,
          name: session.reconnect.name,
          adminToken: session.reconnect.adminToken || undefined,
        }),
      );
    });

    socket.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (settled) return;
      if (message.t === 'rejoined') {
        settled = true;
        adoptRejoined(session, socket, message);
      } else if (message.t === 'error') {
        if (message.code === 'rejoin-failed') {
          settled = true;
          finishFailure();
        } else {
          fail();
        }
      }
    });

    socket.addEventListener('error', fail);
    socket.addEventListener('close', () => {
      if (!settled) fail();
    });
    setTimeout(() => {
      if (!settled) fail();
    }, 4000);
  };

  attemptOnce();
}

function adoptRejoined(session, socket, message) {
  session.reconnecting = false;
  session.intentional = false;
  session.failed = false;
  session.ws = socket;
  session.viewerId = message.playerId;
  session.isHost = !!message.admin;
  session.joined = true;
  session.lobby = message.lobby || session.lobby;
  net = session;

  socket.addEventListener('message', (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    if (net === session) handleNetMessage(session, msg);
  });

  socket.addEventListener('close', () => {
    if (net !== session) return;
    if (session.intentional) return;
    if (session.inGame && session.reconnect) {
      startReconnect(session);
      return;
    }
    net = null;
    setNetUi(false);
    showToast('A conexão com a sala foi encerrada.');
    els.lobby.classList.add('hidden');
    els.end.classList.add('hidden');
    els.start.classList.remove('hidden');
    ui.reset();
    setMode('join');
  });

  hideReconnectOverlay();
  setNetUi(true);

  if (message.status === 'playing' && message.state) {
    const config = message.config || {};
    const remote = new RemoteGame({
      viewerId: session.viewerId,
      send: (payload) => {
        if (session.ws && session.ws.readyState === WebSocket.OPEN) {
          session.ws.send(JSON.stringify(payload));
        }
      },
    });
    remote.smallBlind = config.smallBlind || 10;
    remote.bigBlind = config.bigBlind || 20;
    session.remoteGame = remote;
    session.inGame = true;
    session.awaitingRematch = false;
    hideOverlays();
    initAudio();
    ui.bindGame(remote, session.viewerId);
    ui.handleEvent({ type: 'rejoined', state: message.state });
    showToast('Reconectado à partida.');
  } else {
    session.inGame = false;
    hideOverlays();
    showLobby(session, message.lobby || session.lobby);
    showToast('Reconectado à sala.');
  }
  saveReconnect(session);
}

function trySavedReconnect() {
  let saved = null;
  try {
    saved = JSON.parse(sessionStorage.getItem('pokeke:reconnect') || 'null');
  } catch {
    saved = null;
  }
  if (!saved || !saved.url || !saved.playerId || !saved.token) return false;

  const session = {
    ws: null,
    url: saved.url,
    name: saved.name,
    adminToken: saved.adminToken,
    host: !!saved.isHost,
    isHost: !!saved.isHost,
    viewerId: saved.playerId,
    joined: true,
    inGame: true,
    awaitingRematch: false,
    intentional: false,
    failed: false,
    reconnecting: false,
    remoteGame: null,
    lobby: null,
    reconnect: saved,
  };
  net = session;
  startReconnect(session);
  return true;
}

els.reconnectCancel.addEventListener('click', () => {
  cancelReconnectAttempts();
  const session = net;
  if (session) session.intentional = true;
  net = null;
  setNetUi(false);
  clearSavedReconnect();
  hideReconnectOverlay();
  els.start.classList.remove('hidden');
  els.lobby.classList.add('hidden');
  els.end.classList.add('hidden');
  ui.reset();
  setMode('join');
});

function handleNetMessage(session, message) {
  if (!message || typeof message.t !== 'string') return;

  if (message.t === 'joined') {
    session.viewerId = message.playerId;
    session.isHost = !!message.admin;
    session.joined = true;
    session.lobby = message.lobby;
    if (message.playerId && message.reconnectToken) {
      session.reconnect = {
        url: session.url,
        roomId: message.roomId,
        playerId: message.playerId,
        token: message.reconnectToken,
        name: session.name,
        adminToken: session.adminToken,
        isHost: !!message.admin,
      };
      saveReconnect(session);
    }
    setNetUi(true);
    els.start.classList.add('hidden');
    els.end.classList.add('hidden');
    showLobby(session, message.lobby);
    return;
  }

  if (message.t === 'lobby') {
    session.lobby = message.lobby;
    if (session.inGame || session.awaitingRematch) return;
    if (!session.joined) return;
    showLobby(session, message.lobby);
    return;
  }

  if (message.t === 'event') {
    handleNetEvent(session, message);
    return;
  }

  if (message.t === 'error') {
    if (!session.viewerId) {
      session.intentional = true;
      session.failed = true;
      clearSavedReconnect();
      try {
        session.ws.close();
      } catch {
        /* ignore */
      }
      if (net === session) net = null;
      setNetUi(false);
      setMode('join');
      showError({
        title: 'Não foi possível entrar na sala',
        text: message.message || 'A sala recusou a entrada. Confira os dados e tente novamente.',
        retry: () =>
          connectToRoom({
            url: session.url,
            name: session.name,
            adminToken: session.adminToken,
            host: session.host,
          }),
      });
    } else {
      showToast(message.message || 'Erro na sala.');
    }
    return;
  }

  if (message.t === 'room-closed') {
    session.intentional = true;
    if (net === session) net = null;
    cancelReconnectAttempts();
    clearSavedReconnect();
    setNetUi(false);
    showToast(message.message || 'A sala foi encerrada.');
    els.lobby.classList.add('hidden');
    els.end.classList.add('hidden');
    els.start.classList.remove('hidden');
    ui.reset();
    setMode('join');
  }
}

function handleNetEvent(session, message) {
  if (message.type === 'game-start') {
    const remote = new RemoteGame({
      viewerId: session.viewerId,
      send: (payload) => {
        if (session.ws && session.ws.readyState === WebSocket.OPEN) {
          session.ws.send(JSON.stringify(payload));
        }
      },
    });
    remote.smallBlind = (message.config && message.config.smallBlind) || 10;
    remote.bigBlind = (message.config && message.config.bigBlind) || 20;
    session.remoteGame = remote;
    session.inGame = true;
    session.awaitingRematch = false;
    hideOverlays();
    initAudio();
    ui.bindGame(remote, session.viewerId);
    if (message.state) ui.handleEvent(message);
    return;
  }

  if (message.state) ui.handleEvent(message);

  if (message.type === 'game-over') {
    session.inGame = false;
    showNetEnd(session, message);
  }
}

function showLobby(session, lobby) {
  if (!lobby) return;
  session.lobby = lobby;
  els.start.classList.add('hidden');
  els.end.classList.add('hidden');
  els.lobby.classList.remove('hidden');

  document.getElementById('lobby-title').textContent = lobby.name || 'Sala';
  const humanLabel = `${lobby.players.length}/${lobby.capacity} humanos`;
  document.getElementById('lobby-sub').textContent =
    lobby.status === 'playing' ? 'Partida em andamento…' : `Aguardando jogadores — ${humanLabel}.`;

  const address = document.getElementById('lobby-address');
  const ips = (lobby.addresses || []).map((entry) => entry.address);
  address.textContent = ips.length
    ? `Endereço: ${ips.slice(0, 2).join(' · ')}:${lobby.port}`
    : `Porta: ${lobby.port}`;

  const list = document.getElementById('lobby-players');
  list.innerHTML = '';
  for (const player of lobby.players) {
    const row = document.createElement('div');
    row.className = 'lobby-player';
    const avatar = document.createElement('span');
    avatar.className = 'lobby-avatar';
    avatar.textContent = player.avatar || '🧑';
    const name = document.createElement('span');
    name.className = 'lobby-player-name';
    name.textContent = player.name;
    row.append(avatar, name);
    if (player.isHost) {
      const badge = document.createElement('span');
      badge.className = 'lobby-badge';
      badge.textContent = 'anfitrião';
      row.appendChild(badge);
    }
    if (player.id === session.viewerId) {
      const badge = document.createElement('span');
      badge.className = 'lobby-badge lobby-badge--you';
      badge.textContent = 'você';
      row.appendChild(badge);
    }
    list.appendChild(row);
  }

  if (lobby.bots > 0) {
    const row = document.createElement('div');
    row.className = 'lobby-player lobby-player--bots';
    const avatar = document.createElement('span');
    avatar.className = 'lobby-avatar';
    avatar.textContent = '🤖';
    const name = document.createElement('span');
    name.className = 'lobby-player-name';
    name.textContent = `${lobby.bots} bot${lobby.bots > 1 ? 's' : ''} completam a mesa`;
    row.append(avatar, name);
    list.appendChild(row);
  }

  const start = document.getElementById('lobby-start');
  start.hidden = !session.isHost || lobby.status === 'playing';
  start.disabled = lobby.players.length === 0;

  document.getElementById('lobby-note').textContent = session.isHost
    ? 'Você é o anfitrião. Os bots completam os lugares vazios.'
    : 'Aguardando o anfitrião iniciar a partida.';
}

document.getElementById('lobby-start').addEventListener('click', () => {
  if (!net || !net.isHost || !net.joined) return;
  net.ws.send(JSON.stringify({ t: 'start' }));
});

document.getElementById('lobby-leave').addEventListener('click', () => {
  showStartMenu();
});

function showNetEnd(session, message) {
  const state = message.state;
  const me = state.players.find((player) => player.isMe);
  const finalStack = me ? me.stack : 0;
  const startStack = (session.lobby && session.lobby.config && session.lobby.config.stack) || settings.mpStack;
  const balance = finalStack - startStack;
  const withChips = state.players.filter((player) => player.stack > 0);
  const dominated = me && me.stack > 0 && withChips.length === 1;
  const handNumber = (message.summary && message.summary.handNumber) || state.handNumber;
  const balanceText = `${balance >= 0 ? '+' : '−'}${formatChips(Math.abs(balance))}`;

  els.endTitle.textContent = dominated
    ? 'Você venceu a mesa!'
    : finalStack <= 0
      ? 'Suas fichas acabaram'
      : 'Fim de jogo';
  els.endText.textContent = dominated
    ? 'Todos os outros jogadores ficaram sem fichas.'
    : finalStack <= 0
      ? 'A partida terminou. Aguarde a próxima ou saia da sala.'
      : 'A partida terminou.';

  els.endStats.innerHTML = `
    <div class="end-stat"><small>Mãos</small><strong>${handNumber}</strong></div>
    <div class="end-stat"><small>Fichas finais</small><strong>${formatChips(finalStack)}</strong></div>
    <div class="end-stat"><small>Saldo</small><strong>${balanceText}</strong></div>
  `;

  els.again.hidden = !session.isHost;
  els.again.textContent = 'Jogar novamente';
  els.endMenu.textContent = 'Sair da sala';
  els.endNote.textContent = session.isHost
    ? 'Inicie uma nova partida quando quiser.'
    : 'Aguardando o anfitrião iniciar outra partida.';
  session.awaitingRematch = true;
  els.end.classList.remove('hidden');
}

// ---------------------------------------------------------------- tutorial

function tutorialSeen() {
  try {
    return localStorage.getItem('pokeke:tutorialSeen') === '1';
  } catch {
    return true;
  }
}

function renderTutorial() {
  const step = TUTORIAL_STEPS[tutorialStep];
  els.tutorialTitle.textContent = step.title;
  els.tutorialText.textContent = step.text;
  els.tutorialVisual.innerHTML = step.visual;
  els.tutorialDots.innerHTML = '';
  TUTORIAL_STEPS.forEach((_, index) => {
    const dot = document.createElement('span');
    dot.classList.toggle('active', index === tutorialStep);
    els.tutorialDots.appendChild(dot);
  });
  els.tutorialBack.disabled = tutorialStep === 0;
  els.tutorialNext.textContent =
    tutorialStep === TUTORIAL_STEPS.length - 1 ? 'Concluir' : 'Próximo';
}

function openTutorial(startAt = 0) {
  tutorialStep = Math.max(0, Math.min(TUTORIAL_STEPS.length - 1, startAt));
  renderTutorial();
  els.tutorial.classList.remove('hidden');
}

function closeTutorial() {
  els.tutorial.classList.add('hidden');
  try {
    localStorage.setItem('pokeke:tutorialSeen', '1');
  } catch {
    /* ignore */
  }
}

function nextTutorial() {
  if (tutorialStep >= TUTORIAL_STEPS.length - 1) closeTutorial();
  else {
    tutorialStep += 1;
    renderTutorial();
  }
}

function backTutorial() {
  if (tutorialStep > 0) {
    tutorialStep -= 1;
    renderTutorial();
  }
}

document.getElementById('tutorial-next').addEventListener('click', nextTutorial);
document.getElementById('tutorial-back').addEventListener('click', backTutorial);
document.getElementById('tutorial-skip').addEventListener('click', closeTutorial);
document.getElementById('tutorial-link').addEventListener('click', () => openTutorial(0));
document.getElementById('help-btn').addEventListener('click', () => openTutorial(0));

document.addEventListener('keydown', (event) => {
  const tutorialOpen =
    !els.tutorial.classList.contains('hidden') &&
    els.error.classList.contains('hidden') &&
    els.updateOverlay.classList.contains('hidden');
  if (tutorialOpen && event.key === 'ArrowRight') {
    event.preventDefault();
    nextTutorial();
    return;
  }
  if (tutorialOpen && event.key === 'ArrowLeft') {
    event.preventDefault();
    backTutorial();
    return;
  }
  if (event.key !== 'Escape') return;

  const layers = [
    [els.error, closeError],
    [els.updateOverlay, closeUpdateOverlay],
    [els.tutorial, closeTutorial],
    [els.end, () => els.endMenu.click()],
    [els.lobby, () => document.getElementById('lobby-leave').click()],
    [els.reconnect, () => els.reconnectCancel.click()],
    [els.start, () => els.start.classList.add('hidden')],
  ];
  const active = layers.find(([element]) => !element.classList.contains('hidden'));
  if (!active) return;
  event.preventDefault();
  active[1]();
});

// ---------------------------------------------------------------- startup

initUpdates();
setMode('solo');
const restoredSession = trySavedReconnect();
if (!restoredSession && !tutorialSeen()) openTutorial(0);

if (new URLSearchParams(window.location.search).has('debug')) {
  window.__pokeke = {
    get game() {
      return currentGame;
    },
    get net() {
      return net;
    },
    ui,
    showEnd,
    startGame,
    connectToRoom,
    showStartMenu,
  };
}
