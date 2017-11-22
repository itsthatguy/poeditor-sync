import { join, resolve } from 'path';
import * as fs from 'fs-extra';

import * as poconnect from 'node-poeditor';
import { assignWith, differenceBy, uniqBy, xorBy } from 'lodash';
import axios from 'axios';
import 'colors';
import { realpathSync } from 'fs';

import { log, error } from './logger';

const APP_ROOT = realpathSync(process.cwd());
let translationsDir = resolve(APP_ROOT, 'lib/locales');

let token;
let projectId;
let dryRun = false;

const prefix = 'poesync';

const getLanguageCodes = () => {
  return poconnect.languages
    .list(token, projectId)
    .then(response => response.languages.map(lang => ({ language: lang.code })))
    .catch(error);
};

const getPoTermsForLanguage = code => {
  return poconnect.terms
    .list(token, projectId, code)
    .then(t => {
      return t.terms;
    })
    .catch(error);
};

const getTermsForLanguage = async language => {
  const options = { language, type: 'json' };

  try {
    const file = await poconnect.projects.export(token, projectId, options);

    const response = await axios.get(file.url);

    return response.data;
  } catch (err) {
    return error(err);
  }
};

const loadTranslationFile = (language: string) => {
  const filePath = join(translationsDir, language, 'common.json');

  try {
    if (require.resolve(filePath)) delete require.cache[filePath];
    return require(filePath);
  } catch (err) {
    if (dryRun) fs.outputFileSync(filePath, '');
    return false;
  }
};

const createJSON = data => {
  const jsonData = JSON.stringify(data, null, 2);
  return jsonData.replace(/[\u007f-\uffff]/g, chr => {
    return '\\u' + ('0000' + chr.charCodeAt(0).toString(16)).substr(-4);
  });
};

const writeTranslationFile = (language: string, data: any) => {
  const path = join(translationsDir, language, 'common.json');
  log(`Writing '${language}' translations to file: ${path}...`);

  const jsonData = createJSON(data);

  try {
    fs.writeFileSync(path, jsonData);
  } catch (err) {
    error(err);
  }

  return path;
};

const uniqueTerms = (local, remote) => {
  return xorBy(local, remote, 'term');
};

const addTermsToRemote = (terms: any[]) => {
  log(`Adding new terms to POEditor...`);
  if (terms.length === 0) return log(`No new terms to add`);

  const termsForLog = [...terms].map(term => `  > ${term.term}`).join('\n');
  log(termsForLog);

  return poconnect.terms.add(token, projectId, terms).catch(error);
};

export const getAllData = async () => {
  try {
    const languages = await getLanguageCodes();
    const withTerms = await languages.map(async value => {
      const remoteTerms = await getTermsForLanguage(value.language);
      const localTerms = loadTranslationFile(value.language) || remoteTerms;
      return {
        ...value,
        localTerms,
        remoteTerms
      };
    });

    return Promise.all(withTerms).then(data => {
      return data.map((value: any) => {
        return {
          ...value,
          uniqueTerms: uniqueTerms(value.localTerms, value.remoteTerms)
        };
      });
    });
  } catch (err) {
    error(err);
  }
};

const TERMS_TEMPLATE = {
  term: null,
  definition: null,
  context: '',
  term_plural: '',
  reference: '',
  comment: ''
};

interface Term {
  term?: string;
  definition?: string | {};
};

const mergeTerms = (data, newTerms?) => {
  return data.reduce((result, value) => {
    const terms = assignWith(
      value.localTerms,
      value.remoteTerms,
      (arrValue: Term = {}, othValue: Term = {}) => {
        const matchesTerm = arrValue.term === othValue.term;
        return othValue;
      }
    );
    const termsWithNewTerms = uniqBy([...terms, ...newTerms], 'term');

    const newValue = {
      ...value,
      mergedTerms: termsWithNewTerms
    };

    return [...result, newValue];
  }, []);
};

const sync = async () => {
  log(`Syncing translations...`);
  const data = await getAllData();

  const newTerms = uniqBy(
    data.reduce((result, value) => [...result, ...value.uniqueTerms], []),
    'term'
  );

  const dataWithMergedTerms = mergeTerms(data, newTerms);

  dataWithMergedTerms.forEach(value => {
    writeTranslationFile(value.language, value.mergedTerms);
  });

  addTermsToRemote(newTerms);
  log(`Syncing complete`);
};

export const checkForChanges = async () => {
  log(`Checking for changes...`);
  const data = await getAllData();
  const differentTerms =
    data.reduce(
      (result, value) =>
        differenceBy(value.localTerms, value.remoteTerms, 'term').length + result,
      0
    ) > 0;
  const newTerms =
    data.reduce((result, value) => value.uniqueTerms.length + result, 0) > 0;

  const hasChanges: boolean = differentTerms || newTerms;
  if (hasChanges) {
    error(
      'Found changes in translation files, please run `poesync --token=[API_TOKEN] --id=[PROJECT_ID]` and re-commit'
    );
  } else {
    log('No changes found');
  }

  return +hasChanges;
};

const init = (write, _token, _id, _translationsDir?) => {
  token = _token;
  projectId = _id;
  translationsDir = _translationsDir || translationsDir;
  dryRun = write;

  if (write) sync();
  else checkForChanges().then(process.exit);
};

export default init;
