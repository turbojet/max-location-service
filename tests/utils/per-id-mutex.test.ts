import { describe, expect, it } from 'vitest';
import { PerIdMutex } from '../../src/utils/per-id-mutex.js';

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
} {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function tick(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

describe('PerIdMutex', () => {
  it('runs tasks for the same id sequentially', async () => {
    const mutex = new PerIdMutex();
    const order: string[] = [];
    const a = deferred<void>();
    const b = deferred<void>();

    const first = mutex.run('alpha', async () => {
      order.push('first-start');
      await a.promise;
      order.push('first-end');
    });
    const second = mutex.run('alpha', async () => {
      order.push('second-start');
      await b.promise;
      order.push('second-end');
    });

    await tick();
    expect(order).toEqual(['first-start']);

    a.resolve();
    await tick();
    expect(order).toEqual(['first-start', 'first-end', 'second-start']);

    b.resolve();
    await first;
    await second;
    expect(order).toEqual(['first-start', 'first-end', 'second-start', 'second-end']);
  });

  it('allows tasks for different ids to overlap', async () => {
    const mutex = new PerIdMutex();
    const order: string[] = [];
    const aStarted = deferred<void>();
    const bStarted = deferred<void>();
    const release = deferred<void>();

    const taskA = mutex.run('alpha', async () => {
      order.push('a-start');
      aStarted.resolve();
      await release.promise;
      order.push('a-end');
    });
    const taskB = mutex.run('beta', async () => {
      order.push('b-start');
      bStarted.resolve();
      await release.promise;
      order.push('b-end');
    });

    await aStarted.promise;
    await bStarted.promise;
    expect(order).toEqual(['a-start', 'b-start']);

    release.resolve();
    await taskA;
    await taskB;
    expect(order.sort()).toEqual(['a-end', 'a-start', 'b-end', 'b-start']);
  });

  it('continues to next task even when prior task rejects', async () => {
    const mutex = new PerIdMutex();
    const order: string[] = [];

    const failing = mutex.run('alpha', () => {
      order.push('failing');
      throw new Error('boom');
    });
    const next = mutex.run('alpha', () => {
      order.push('next');
    });

    await expect(failing).rejects.toThrow('boom');
    await next;
    expect(order).toEqual(['failing', 'next']);
  });

  it('returns the task result', async () => {
    const mutex = new PerIdMutex();
    const value = await mutex.run('x', () => Promise.resolve(42));
    expect(value).toBe(42);
  });
});
