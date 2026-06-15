import type { Command } from "commander";
import { formatDocsLink } from "../../terminal/links.js";
import { theme } from "../../terminal/theme.js";
import { formatHelpExamples } from "../help-format.js";
import { registerNodesCameraCommands } from "./register.camera.js";
import { registerNodesInvokeCommands } from "./register.invoke.js";
import { registerNodesLocationCommands } from "./register.location.js";
import { registerNodesNotifyCommand } from "./register.notify.js";
import { registerNodesPairingCommands } from "./register.pairing.js";
import { registerNodesPushCommand } from "./register.push.js";
import { registerNodesScreenCommands } from "./register.screen.js";
import { registerNodesStatusCommands } from "./register.status.js";

export async function registerNodesCli(program: Command) {
  const nodes = program
    .command("nodes")
    .description("Manage gateway-owned nodes (pairing, status, invoke, and media)")
    .addHelpText(
      "after",
      () =>
        `\n${theme.heading("Examples:")}\n${formatHelpExamples([
          ["GreenchClaw nodes status", "List known nodes with live status."],
          ["GreenchClaw nodes pairing pending", "Show pending node pairing requests."],
          ["GreenchClaw nodes remove --node <id|name|ip>", "Remove a stale paired node entry."],
          [
            'GreenchClaw nodes invoke --node <id> --command system.which --params \'{"name":"uname"}\'',
            "Invoke a node command directly.",
          ],
          ["GreenchClaw nodes camera snap --node <id>", "Capture a photo from a node camera."],
        ])}\n\n${theme.muted("Docs:")} ${formatDocsLink("/cli/nodes", "docs.GreenchClaw.ai/cli/nodes")}\n`,
    );

  registerNodesStatusCommands(nodes);
  registerNodesPairingCommands(nodes);
  registerNodesInvokeCommands(nodes);
  registerNodesNotifyCommand(nodes);
  registerNodesPushCommand(nodes);
  registerNodesCameraCommands(nodes);
  registerNodesScreenCommands(nodes);
  registerNodesLocationCommands(nodes);

  const { registerPluginCliCommandsFromValidatedConfig } = await import("../../plugins/cli.js");
  await registerPluginCliCommandsFromValidatedConfig(program, undefined, undefined, {
    mode: "lazy",
    primary: "nodes",
  });
}
