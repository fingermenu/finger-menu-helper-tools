// @flow

import { ImmutableEx } from '@microbusiness/common-javascript';
import BluebirdPromise from 'bluebird';
import Immutable, { OrderedSet } from 'immutable';
import commandLineArgs from 'command-line-args';
import fs from 'fs';
import csvParser from 'csv-parse';
import Common from './Common';

const optionDefinitions = [
  { name: 'csvFilePath', type: String },
  { name: 'delimiter', type: String },
  { name: 'rowDelimiter', type: String },
  { name: 'applicationId', type: String },
  { name: 'javaScriptKey', type: String },
  { name: 'masterKey', type: String },
  { name: 'parseServerUrl', type: String },
];
const options = commandLineArgs(optionDefinitions);

const start = async () => {
  try {
    await Common.initializeParse(options);

    const parser = csvParser(
      { delimiter: options.delimiter ? options.delimiter : ',', trim: true, rowDelimiter: options.rowDelimiter ? options.rowDelimiter : '\n' },
      async (err, data) => {
        if (err) {
          console.log(err);

          return;
        }

        const splittedRows = ImmutableEx.splitIntoChunks(Immutable.fromJS(data).skip(1), 1); // Skipping the first item as it is the CSV header
        const columns = OrderedSet.of('username', 'password', 'email', 'type');

        await BluebirdPromise.each(splittedRows.toArray(), rowChunck =>
          Promise.all(
            rowChunck.map(async rawRow => {
              if (!rawRow || rawRow.isEmpty() || rawRow.every(row => row.trim().length === 0)) {
                return;
              }

              const values = Common.extractColumnsValuesFromRow(columns, Immutable.fromJS(rawRow));

              let user;

              try {
                user = await Common.getUser(values.get('username'));
              } catch (ex) {
                user = null;
              }

              if (user) {
                /* The user exists, update user details... */
                console.log(`Updating existing accout. Username: ${values.get('username')}`);

                await Common.updateAccount(user, {
                  username: values.get('username'),
                  password: values.get('password'),
                  email: values.get('email'),
                  type: values.get('type'),
                });
              } else {
                /* The user does not exist, create a new one... */
                console.log(`Creating new accout. Username: ${values.get('username')}`);

                await Common.createAccount(values.get('username'), values.get('password'), values.get('email'), values.get('type'));
              }
            }),
          ),
        );
      },
    );

    fs.createReadStream(options.csvFilePath).pipe(parser);
  } catch (ex) {
    console.error(ex);
  }
};

start();
