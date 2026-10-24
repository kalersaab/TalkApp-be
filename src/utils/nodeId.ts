import { hostname } from 'os';
import { PORT } from '@config';

export const WS_NODE_ID = `${hostname()}:${PORT ?? '8000'}`;
