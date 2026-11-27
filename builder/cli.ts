// Course builder command line. Run with: npm run course -- <command> <course>
//   new <id>        start course-src/<id>/ with a brief template and a sources/ folder
//   plan <id>       read the material and design the outline (Opus), saved in work/outline.json for you to edit
//   build <id>      write lessons, checkpoints and exam questions (Sonnet), check them, save in out/
//   install <id>    put the built course on the site (public/courses/<id>/ and the course list)
// The Anthropic key is read from ANTHROPIC_API_KEY (or a profile from `ant auth login`).
import path from 'node:path';
import { ClaudeModel, ModelError, totalCost } from './model';
import { build, install, plan, scaffold } from './pipeline';

const ROOT = path.resolve(process.env.COURSE_SRC || 'course-src');
const [cmd, id, ...rest] = process.argv.slice(2);
const log = (s: string) => console.log(s);
const usage = 'Usage: npm run course -- <new|plan|build|install> <course id>';

async function main() {
  if (!cmd || !id) { console.error(usage); process.exitCode = 2; return; }
  const dir = path.join(ROOT, id);
  const model = new ClaudeModel();
  try {
    if (cmd === 'new') scaffold(ROOT, id, log);
    else if (cmd === 'plan') { await plan(dir, model, log); log(`Review ${path.join(dir, 'work', 'outline.md')}; edit work/outline.json if needed, then run build.`); }
    else if (cmd === 'build') await build(dir, model, log, { concurrency: Number(rest.find(a => a.startsWith('--parallel='))?.split('=')[1] ?? 4) });
    else if (cmd === 'install') install(dir, process.cwd(), log);
    else { console.error(usage); process.exitCode = 2; }
  } catch (e) {
    console.error(`\n${e instanceof ModelError || e instanceof Error ? e.message : e}`);
    if (model.log.length) console.error(`Spent before stopping: $${totalCost(model.log).toFixed(2)}. Finished steps are saved; run the command again to continue.`);
    process.exitCode = 1;
  }
}
await main();
