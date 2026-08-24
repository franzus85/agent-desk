import { describe, expect, it } from "vitest";
import { createChannel } from "./channel.js";

describe("createChannel", () => {
  it("drains values pushed before iteration starts", async () => {
    const channel = createChannel<number>();
    channel.push(1);
    channel.push(2);
    channel.close();

    const received: number[] = [];
    for await (const value of channel) {
      received.push(value);
    }
    expect(received).toEqual([1, 2]);
  });

  it("delivers values pushed after iteration has started waiting", async () => {
    const channel = createChannel<number>();
    const received: number[] = [];

    const drain = (async () => {
      for await (const value of channel) {
        received.push(value);
      }
    })();

    await new Promise((resolve) => setTimeout(resolve, 0));
    channel.push(42);
    channel.close();
    await drain;

    expect(received).toEqual([42]);
  });
});
