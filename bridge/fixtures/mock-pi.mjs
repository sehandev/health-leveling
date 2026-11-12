const mode = process.env.PI_MOCK_MODE ?? "success";
let input = "";

function write(record) {
  process.stdout.write(`${JSON.stringify(record)}\n`);
}

function finish({ text = '{"ok":true,"purpose":"pi-bridge-smoke"}', stopReason = "stop", delayMs = 0 } = {}) {
  const send = () => {
    write({ id: "pi-bridge-smoke", type: "response", command: "prompt", success: true, data: { disposition: "started" } });
    write({
      type: "message_end",
      message: {
        role: "assistant",
        stopReason,
        content: [{ type: "text", text }],
      },
    });
    write({ type: "agent_settled", aborted: false });
  };
  if (delayMs) setTimeout(send, delayMs);
  else send();
}

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
  const newline = input.indexOf("\n");
  if (newline === -1) return;
  let command;
  try {
    command = JSON.parse(input.slice(0, newline));
  } catch {
    process.exit(3);
  }
  if (command.type !== "prompt" || command.message !== 'Return exactly this JSON object and no other text: {"ok":true,"purpose":"pi-bridge-smoke"}') {
    process.exit(4);
  }

  switch (mode) {
    case "malformed-rpc":
      process.stdout.write("not-json\n");
      break;
    case "malformed-output":
      finish({ text: "not json" });
      break;
    case "wrong-output":
      finish({ text: '{"ok":true,"purpose":"other"}' });
      break;
    case "provider-error":
      finish({ text: "provider detail must not escape", stopReason: "error" });
      break;
    case "timeout":
    case "stubborn":
      setInterval(() => {}, 1000);
      break;
    case "slow":
      finish({ delayMs: 350 });
      break;
    case "large-output":
      process.stdout.write(`${"x".repeat(300 * 1024)}\n`);
      break;
    default:
      finish();
  }
});

process.on("SIGTERM", () => {
  if (mode !== "stubborn") process.exit(0);
});
process.on("SIGINT", () => process.exit(0));
