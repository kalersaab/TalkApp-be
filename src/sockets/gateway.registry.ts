import type { Server } from 'socket.io';

import type { ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData } from '@interfaces/socket.interface';

type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

let _io: AppServer | null = null;

export function registerGateway(io: AppServer): void {
  _io = io;
}

export function getIO(): AppServer | null {
  return _io;
}
