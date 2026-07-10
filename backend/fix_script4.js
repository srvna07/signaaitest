const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const tc = await prisma.testCase.findUnique({ where: { id: '22d20de9-39f5-46ca-93b2-7dfc211e3f7d' } });
  if (tc) {
    let script = tc.scriptContent;
    script = script.replace('page.locator("text=Dashboard")', 'page.locator("text=Dashboard").first');
    await prisma.testCase.update({
      where: { id: tc.id },
      data: { scriptContent: script }
    });
    console.log("Fixed strict mode violation successfully!");
  } else {
    console.log("Not found");
  }
}
run();
