const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const tc = await prisma.testCase.findUnique({ where: { id: '648ef8a0-ee87-4ced-b36a-166fdc659800' } });
  if (tc) {
    let script = tc.scriptContent;
    script = script.replace('expect(page).to_have_url(re.compile(r".*" + base_url + "/login.*"))', 'expect(page).to_have_url(base_url)');
    await prisma.testCase.update({
      where: { id: tc.id },
      data: { scriptContent: script }
    });
    console.log("Fixed login URL assertion in script successfully!");
  } else {
    console.log("Not found");
  }
}
run();
