import { logger } from '@utils/logger';

type State = 'closed' | 'open' | 'half-open';

interface CircuitBreakerOptions {
  name: string;
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
}

export class CircuitBreaker {
  private state: State = 'closed';
  private failures = 0;
  private successes = 0;
  private nextAttempt = 0;
  private readonly opts: CircuitBreakerOptions;

  constructor(opts: CircuitBreakerOptions) {
    this.opts = opts;
  }

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() < this.nextAttempt) {
        throw new Error(`[CircuitBreaker:${this.opts.name}] Circuit is OPEN — fast fail`);
      }
      this.state = 'half-open';
      logger.info(`[CircuitBreaker:${this.opts.name}] → half-open`);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    if (this.state === 'half-open') {
      this.successes++;
      if (this.successes >= this.opts.successThreshold) {
        this.state = 'closed';
        this.successes = 0;
        logger.info(`[CircuitBreaker:${this.opts.name}] → closed`);
      }
    }
  }

  private onFailure(): void {
    this.failures++;
    this.successes = 0;
    if (this.state === 'half-open' || this.failures >= this.opts.failureThreshold) {
      this.state = 'open';
      this.nextAttempt = Date.now() + this.opts.timeout;
      logger.warn(`[CircuitBreaker:${this.opts.name}] → open (next attempt in ${this.opts.timeout}ms)`);
    }
  }

  get isOpen(): boolean {
    return this.state === 'open';
  }
  get currentState(): State {
    return this.state;
  }
}
