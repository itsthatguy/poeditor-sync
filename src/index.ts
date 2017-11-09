import { join, resolve } from 'path';
import * as fs from 'fs-extra';

import * as poconnect from 'node-poeditor';
import { flatten, uniqBy, xorBy } from 'lodash';
import axios from 'axios';
import 'colors';

import { log, error } from './logger';

let token;
let projectId;
let rootDir;
let translationsDir;

const prefix = 'poesync';

const getLanguageCodes = () => {
  return poconnect.languages.list(token, projectId)
  .then(response => response.languages.map(lang => lang.code))
  .catch(error);
};

const getPoTermsForLanguage = (code) => {
  return poconnect.terms.list(token, projectId, code)
    .then(t => {
      return t.terms;
    })
    .catch(error);
};

const mergeTerms = (local, remote) => {
  const finds = [];
  const newTerms = local.reduce((result, value, i) => {
    const found = remote.find(trans => trans.term === value.term);
    if (found) result[i] = found;
    else result[i] = value;

    return result;
  }, []);

  return newTerms;
};

const updateTerms = (terms) => {
  return poconnect.terms.update(token, projectId, terms)
    .catch(error);
};

const getTermsForLanguage = async (language) => {
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
    fs.outputFileSync(filePath, '');
    return false;
  }
};

const writeTranslationFile = (language: string, data: any) => {
  const path = join(translationsDir, language, 'common.json');
  log(`Writing '${language}' translations to file: ${path}...`);

  const jsonData = JSON.stringify(data, null, 2);
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

const addTerms = (terms: any[]) => {
  log(`Adding new terms to POEditor...`);
  if (terms.length === 0) return log(`No new terms to add`);

  const termsList = [...terms].map(term => `  > ${term.term}`).join('\n');
  log(termsList);

  return poconnect.terms.add(token, projectId, terms)
  .catch(error);
};

const sync = async () => {
  log(`Beginning sync...`);
  try {
    const languages = await getLanguageCodes();
    const termsToAdd = [...languages].map(async (language) => {
      const remote = await getTermsForLanguage(language);
      const local = loadTranslationFile(language) || remote;

      const terms = await mergeTerms(local, remote);

      const filePath = writeTranslationFile(language, terms);

      return uniqueTerms(local, remote);
    });

    return Promise.all(termsToAdd)
    .then((t) => {
      const terms = uniqBy(flatten(t), 'term');
      addTerms(terms);
      log(`Sync complete`);
    }).catch(error);

  } catch (err) {
    return error(err);
  }

};
const init = (_token, _id, _translationsDir) => {
  token = _token;
  projectId = _id;
  rootDir = resolve(__dirname, '..');
  translationsDir = _translationsDir || resolve(rootDir, 'lib/locales');

  sync();
};

export default init;
