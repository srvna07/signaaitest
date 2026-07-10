const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const tc = await prisma.testCase.findUnique({ where: { id: '22d20de9-39f5-46ca-93b2-7dfc211e3f7d' } });
  if (tc) {
    let script = tc.scriptContent;
    script = script.replace('page.get_by_placeholder("Username")', 'page.locator(`input[type="text"]`)');
    script = script.replace('page.get_by_placeholder("Password")', 'page.locator(`input[type="password"]`)');
    await prisma.testCase.update({
      where: { id: tc.id },
      data: { scriptContent: script }
    });
    console.log("Updated script successfully");
  } else {
    console.log("Not found");
  }
}
run();
