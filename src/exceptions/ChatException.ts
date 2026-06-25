import { HttpException } from './HttpException';

// ─── Cassandra errors ─────────────────────────────────────────────────────────

export class CassandraWriteError extends Error {
  constructor(public readonly operation: string, public readonly cause: unknown) {
    super(`Cassandra write [${operation}] failed: ${(cause as Error)?.message ?? String(cause)}`);
    this.name = 'CassandraWriteError';
  }
}

export class CassandraReadError extends Error {
  constructor(public readonly operation: string, public readonly cause: unknown) {
    super(`Cassandra read [${operation}] failed: ${(cause as Error)?.message ?? String(cause)}`);
    this.name = 'CassandraReadError';
  }
}

// ─── Domain errors (extend HttpException so error middleware handles them) ────

export class ConversationNotFoundError extends HttpException {
  constructor(convId: string) {
    super(404, `Conversation ${convId} not found`);
    this.name = 'ConversationNotFoundError';
  }
}

export class UnauthorizedConversationError extends HttpException {
  constructor(userId: string, convId: string) {
    super(403, `User ${userId} is not a participant in conversation ${convId}`);
    this.name = 'UnauthorizedConversationError';
  }
}
