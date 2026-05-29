export class PerIdMutex {
  private readonly tails = new Map<string, Promise<void>>();

  async run<T>(id: string, task: () => Promise<T> | T): Promise<T> {
    const previous = this.tails.get(id) ?? Promise.resolve();

    let release: () => void = () => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.tails.set(id, released);

    try {
      await previous;
      return await task();
    } finally {
      release();
      if (this.tails.get(id) === released) {
        this.tails.delete(id);
      }
    }
  }
}
