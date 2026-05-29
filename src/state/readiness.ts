export type ReadinessStatus = 'ready' | 'not_ready';

export class ReadinessState {
  private status: ReadinessStatus;

  constructor(initial: ReadinessStatus = 'ready') {
    this.status = initial;
  }

  isReady(): boolean {
    return this.status === 'ready';
  }

  set(status: ReadinessStatus): void {
    this.status = status;
  }
}
