import { fileURLToPath } from 'node:url';
import { createStaticServer } from './http.mjs';
import { RoomManager } from './room-server.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT) || 3400;

const server = await createStaticServer({ root, port });
const manager = new RoomManager();
manager.attach(server);

const info = manager.create({
  hostName: 'HostDev',
  capacity: 4,
  smallBlind: 10,
  bigBlind: 20,
  stack: 1000,
  difficulty: 'normal',
  speed: 'normal',
});

console.log(
  JSON.stringify({
    appUrl: `http://127.0.0.1:${server.address().port}/?debug=1`,
    wsUrl: `ws://127.0.0.1:${server.address().port}/ws`,
    ...info,
  }),
);

setInterval(() => {}, 1 << 30);
