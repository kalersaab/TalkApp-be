import { hostname } from 'os';
import { PORT } from '@config';

/**
 * Unique identifier for this process instance.
 * Used in Redis presence keys so we know which WS node owns a socket.
 * Format: hostname:port  e.g. "api-pod-3:8000"
 */
export const WS_NODE_ID = `${hostname()}:${PORT ?? '8000'}`;
