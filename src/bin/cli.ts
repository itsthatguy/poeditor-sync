import * as cmdr from 'commander';
import { resolve } from 'path';
import poesync, { checkForChanges } from '../';

cmdr
  .version('0.1.0')
  .option('-c, --compare', 'Check to see if there are changes')
  .option('-t, --token <API_TOKEN>', 'API Token')
  .option('-i, --id <PROJECT_ID>', 'Project ID')
  .option('-o, --out-dir <PATH>', 'Path to find translation files')
  .parse(process.argv);

if (!process.argv.slice(2).length) {
  cmdr.outputHelp();
  process.exit();
}

if (cmdr.token && cmdr.id && !cmdr.compare) {
  poesync(true, cmdr.token, cmdr.id, resolve(__dirname, '../..', cmdr.outDir));
}

if (cmdr.compare) {
  poesync(false, cmdr.token, cmdr.id);
}
