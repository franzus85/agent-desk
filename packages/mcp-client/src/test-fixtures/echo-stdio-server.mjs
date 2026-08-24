import { createInterface } from "node:readline";

const rl = createInterface({ input: process.stdin });

rl.on("line", (line) => {
  if (!line.trim()) return;
  const message = JSON.parse(line);
  const response = {
    jsonrpc: "2.0",
    id: message.id,
    result: { resultType: "complete", echoedMethod: message.method },
  };
  process.stdout.write(JSON.stringify(response) + "\n");
});
