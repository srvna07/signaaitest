const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const tc = await prisma.testCase.findUnique({ where: { id: '648ef8a0-ee87-4ced-b36a-166fdc659800' } });
  if (tc) {
    let script = tc.scriptContent;
    script = script.replace('invalid_username = os.environ["SECRET_INVALID_USERNAME"]', 'invalid_username = "baduser@example.com"');
    script = script.replace('invalid_password = os.environ["SECRET_INVALID_PASSWORD"]', 'invalid_password = "wrongpassword"');
    await prisma.testCase.update({
      where: { id: tc.id },
      data: { scriptContent: script }
    });
    console.log("Fixed invalid credentials in script successfully!");
  } else {
    console.log("Not found");
  }
}
run();
