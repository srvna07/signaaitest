const fs = require("fs");
const oldContent = fs.readFileSync("old_browserStreamWS_utf8.ts", "utf8");
let currentContent = fs.readFileSync("src/browser/browserStreamWS.ts", "utf8");

currentContent = currentContent.replace(
  "useAutoLogin?: boolean;",
  "useAutoLogin?: boolean;\n  strategy?: \"single-shot\" | \"agentic\";"
);

const importsToAdd = `
import { LiveBrowserStream } from "../browser/LiveBrowserStream";
import { GeminiProvider } from "../ai/providers/GeminiProvider";
import { decryptSecret } from "../utils/crypto";
`;
currentContent = currentContent.replace(
  "import { hasSession",
  importsToAdd.trim() + "\nimport { hasSession"
);

currentContent = currentContent.replace(
  "async function handleSession(ws: WebSocket, msg: StartMessage, userId: string): Promise<void> {",
  "async function handleSessionAgentic(ws: WebSocket, msg: StartMessage, userId: string): Promise<void> {"
);

const performLoginMatch = oldContent.match(/async function performLogin[\s\S]*?\n}/);
const oldHandleSessionMatch = oldContent.match(/async function handleSession[\s\S]*?}\n\n\/\/ ─── WebSocket server bootstrap/);

let oldPerformLogin = performLoginMatch[0].replace("performLogin", "performSingleShotLogin");
let oldHandleSessionStr = oldHandleSessionMatch[0].replace("handleSession", "handleSessionSingleShot").replace("performLogin", "performSingleShotLogin");
oldHandleSessionStr = oldHandleSessionStr.replace("// ─── WebSocket server bootstrap", "");

const dispatcher = `
async function handleSession(ws: WebSocket, msg: StartMessage, userId: string): Promise<void> {
  if (msg.strategy === "single-shot") {
    return handleSessionSingleShot(ws, msg, userId);
  }
  return handleSessionAgentic(ws, msg, userId);
}
`;

const finalContent = currentContent.replace(
  "// ─── WebSocket server bootstrap",
  oldPerformLogin + "\n\n" + oldHandleSessionStr + "\n\n" + dispatcher + "\n\n// ─── WebSocket server bootstrap"
);

fs.writeFileSync("src/browser/browserStreamWS.ts", finalContent);
