const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const tc = await prisma.testCase.findUnique({ where: { id: '22d20de9-39f5-46ca-93b2-7dfc211e3f7d' } });
  if (tc) {
    let script = tc.scriptContent;
    // Replace the problematic password assertion with a standard one
    script = script.replace('expect(password_input).to_have_value(re.compile(r"\\*{8,}"))', 'expect(password_input).to_have_value(password)');
    await prisma.testCase.update({
      where: { id: tc.id },
      data: { scriptContent: script }
    });
    console.log("Fixed the password assertion successfully!");
  } else {
    console.log("Not found");
  }
}
run();
