export interface Channel<T> extends AsyncIterable<T> {
  push(value: T): void;
  close(): void;
}

export function createChannel<T>(): Channel<T> {
  const buffered: T[] = [];
  let waiting: ((result: IteratorResult<T>) => void) | undefined;
  let closed = false;

  return {
    push(value: T): void {
      if (waiting) {
        const resolve = waiting;
        waiting = undefined;
        resolve({ value, done: false });
      } else {
        buffered.push(value);
      }
    },
    close(): void {
      closed = true;
      if (waiting) {
        const resolve = waiting;
        waiting = undefined;
        resolve({ value: undefined as unknown as T, done: true });
      }
    },
    [Symbol.asyncIterator](): AsyncIterator<T> {
      return {
        next(): Promise<IteratorResult<T>> {
          const value = buffered.shift();
          if (value !== undefined) {
            return Promise.resolve({ value, done: false });
          }
          if (closed) {
            return Promise.resolve({ value: undefined as unknown as T, done: true });
          }
          return new Promise((resolve) => {
            waiting = resolve;
          });
        },
      };
    },
  };
}
