// @flow

import BluebirdPromise from 'bluebird';
import Immutable, { Map } from 'immutable';
import { ParseWrapperService } from '@microbusiness/parse-server-common';
import { ImmutableEx } from '@microbusiness/common-javascript';
import fs from 'fs';
import commandLineArgs from 'command-line-args';
import Common from './Common';

const optionDefinitions = [
  { name: 'directory', type: String },
  { name: 'outputFile', type: String },
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
    await Common.initializeParse(options, false);

    const files = fs.readdirSync(options.directory);
    const splittedFiles = ImmutableEx.splitIntoChunks(Immutable.fromJS(files), 10);
    let filesAndUrls = Map();

    await BluebirdPromise.each(splittedFiles.toArray(), fileChunck =>
      Promise.all(fileChunck.map(async (file) => {
        const filePath = options.directory + file;

        filesAndUrls = filesAndUrls.set(filePath, (await ParseWrapperService.createFile(file, [...fs.readFileSync(filePath)]).save()).url());
      })));

    fs.writeFileSync(options.outputFile, JSON.stringify(filesAndUrls.toJS(), null, 2));
  } catch (ex) {
    console.error(ex);
  }
};

start();
