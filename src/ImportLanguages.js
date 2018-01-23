// @flow

import BluebirdPromise from 'bluebird';
import Immutable, { Map } from 'immutable';
import commandLineArgs from 'command-line-args';
import fs from 'fs';
import csvParser from 'csv-parse';
import { ImmutableEx } from '@microbusiness/common-javascript';
import { LanguageService } from '@fingermenu/parse-server-common';
import { initializeParse, loadAllLanguages } from './Common';

const optionDefinitions = [
  { name: 'csvFilePath', type: String },
  { name: 'delimiter', type: String },
  { name: 'rowDelimiter', type: String },
  { name: 'applicationId', type: String },
  { name: 'javaScriptKey', type: String },
  { name: 'masterKey', type: String },
  { name: 'parseServerUrl', type: String },
  { name: 'username', type: String },
  { name: 'password', type: String },
];
const options = commandLineArgs(optionDefinitions);

const start = async () => {
  try {
    initializeParse(options);

    const languages = await loadAllLanguages();
    const languageService = new LanguageService();

    const parser = csvParser(
      { delimiter: options.delimiter ? options.delimiter : ',', trim: true, rowDelimiter: options.rowDelimiter ? options.rowDelimiter : '\n' },
      async (err, data) => {
        if (err) {
          console.log(err);

          return;
        }

        const splittedRows = ImmutableEx.splitIntoChunks(Immutable.fromJS(data).skip(1), 100); // Skipping the first item as it is the CSV header

        await BluebirdPromise.each(splittedRows.toArray(), rowChunck =>
          Promise.all(rowChunck.map(async (rawRow) => {
            const row = Immutable.fromJS(rawRow);
            const key = row.first();
            const name = row.skip(1).first();
            const imageUrl = row.skip(2).first();
            const language = languages.find(_ => _.get('key').localeCompare(key) === 0);
            const info = Map({ key, name, imageUrl });

            if (language) {
              await languageService.update(language.merge(info), global.parseServerSessionToken);
            } else {
              await languageService.create(info, null, global.parseServerSessionToken);
            }
          })));
      },
    );

    fs.createReadStream(options.csvFilePath).pipe(parser);
  } catch (ex) {
    console.error(ex);
  }
};

start();
