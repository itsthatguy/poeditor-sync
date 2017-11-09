import * as cmdr from 'commander';
import { resolve } from 'path';
import poesync from '../';

cmdr
  .version('0.1.0')
  .option('-t, --token <API_TOKEN>', 'API Token')
  .option('-i, --id <PROJECT_ID>', 'Project ID')
  .option('-o, --out-dir <PATH>', 'Path to find translation files')
  .parse(process.argv);

poesync(cmdr.token, cmdr.id, resolve(__dirname, '../..', cmdr.outDir));
