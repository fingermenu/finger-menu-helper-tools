// @flow

import { ImmutableEx } from '@microbusiness/common-javascript';
import { ParseWrapperService } from '@microbusiness/parse-server-common';
import BluebirdPromise from 'bluebird';
import Immutable, { Map } from 'immutable';
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
];
const options = commandLineArgs(optionDefinitions);

const start = async () => {
  try {
    await Common.initializeParse(options);

    const files = fs.readdirSync(options.directory);
    const splittedFiles = ImmutableEx.splitIntoChunks(Immutable.fromJS(files), 1);
    let filesAndUrls = Map();

    await BluebirdPromise.each(splittedFiles.toArray(), fileChunck =>
      Promise.all(
        fileChunck.map(async file => {
          const filePath = options.directory + file;

          try {
            console.log(`Started uploading: ${filePath}...`);

            filesAndUrls = filesAndUrls.set(filePath, (await ParseWrapperService.createFile(file, [...fs.readFileSync(filePath)]).save()).url());

            console.log(`Uploading ${filePath} finished successfully.`);
          } catch (err) {
            console.error(`Failed to upload ${filePath}. Error ${err.message}`);

            throw err;
          }
        }),
      ),
    );

    fs.writeFileSync(options.outputFile, JSON.stringify(filesAndUrls.toJS(), null, 2));
  } catch (ex) {
    console.error(ex);
  }
};

start();
