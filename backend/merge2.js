const fs = require('fs');
const oldContent = fs.readFileSync('old_browserStreamWS_utf8.ts', 'utf8');

const performLoginStart = oldContent.indexOf('async function performLogin');
const performLoginEnd = oldContent.indexOf('// ΓöÇΓöÇΓöÇ Main orchestration');
const performLoginStr = oldContent.substring(performLoginStart, performLoginEnd).trim();

const handleSessionStart = oldContent.indexOf('async function handleSession');
const handleSessionEnd = oldContent.indexOf('// ΓöÇΓöÇΓöÇ WebSocket server bootstrap');
const handleSessionStr = oldContent.substring(handleSessionStart, handleSessionEnd).trim();

let currentContent = fs.readFileSync('src/browser/browserStreamWS.ts', 'utf8');

currentContent = currentContent.replace(
  'useAutoLogin?: boolean;',
  'useAutoLogin?: boolean;\n  strategy?: \'single-shot\' | \'agentic\';'
);

const importsToAdd = `
import { LiveBrowserStream } from '../browser/LiveBrowserStream';
import { GeminiProvider } from '../ai/providers/GeminiProvider';
import { decryptSecret } from '../utils/crypto';
`;
currentContent = currentContent.replace(
  'import { hasSession',
  importsToAdd.trim() + '\nimport { hasSession'
);

currentContent = currentContent.replace(
  'async function handleSession(ws: WebSocket, msg: StartMessage, userId: string): Promise<void> {',
  'async function handleSessionAgentic(ws: WebSocket, msg: StartMessage, userId: string): Promise<void> {'
);

let oldPerformLogin = performLoginStr.replace('performLogin', 'performSingleShotLogin');
let oldHandleSessionStr = handleSessionStr.replace('handleSession', 'handleSessionSingleShot').replace('performLogin', 'performSingleShotLogin');

const dispatcher = `
async function handleSession(ws: WebSocket, msg: StartMessage, userId: string): Promise<void> {
  if (msg.strategy === 'single-shot') {
    return handleSessionSingleShot(ws, msg, userId);
  }
  return handleSessionAgentic(ws, msg, userId);
}
`;

const finalContent = currentContent.replace(
  /\n\/\/ ─── WebSocket server bootstrap/,
  '\n' + oldPerformLogin + '\n\n' + oldHandleSessionStr + '\n\n' + dispatcher + '\n\n// ─── WebSocket server bootstrap'
);

fs.writeFileSync('src/browser/browserStreamWS.ts', finalContent);
