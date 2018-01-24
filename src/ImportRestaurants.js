// @flow

import BluebirdPromise from 'bluebird';
import Immutable, { Map, OrderedSet } from 'immutable';
import commandLineArgs from 'command-line-args';
import fs from 'fs';
import csvParser from 'csv-parse';
import { ImmutableEx } from '@microbusiness/common-javascript';
import { RestaurantService } from '@fingermenu/parse-server-common';
import Common from './Common';

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
    Common.initializeParse(options);

    const languages = await Common.loadAllLanguages();
    const restaurantService = new RestaurantService();

    const parser = csvParser(
      { delimiter: options.delimiter ? options.delimiter : ',', trim: true, rowDelimiter: options.rowDelimiter ? options.rowDelimiter : '\r\n' },
      async (err, data) => {
        if (err) {
          console.log(err);

          return;
        }

        const splittedRows = ImmutableEx.splitIntoChunks(Immutable.fromJS(data).skip(1), 100); // Skipping the first item as it is the CSV header
        const columns = OrderedSet.of('username', 'en_NZ_name', 'zh_name', 'jp_name', 'websiteUrl', 'imageUrl', 'pin', 'supportedLanguages');

        await BluebirdPromise.each(splittedRows.toArray(), rowChunck =>
          Promise.all(rowChunck.map(async (rawRow) => {
            const values = Common.extractColumnsValuesFromRow(columns, Immutable.fromJS(rawRow));
            const user = await Common.getUser(values.get('username'));
            const restaurants = await Common.loadAllRestaurants(user, values.get('en_NZ_name'));
            const supportLanguages = Immutable.fromJS(values.get('supportedLanguages').split(','))
              .map(_ => _.trim())
              .filterNot(_ => _.length === 0);

            const info = Map({
              ownedByUser: user,
              name: Map({ en_NZ: values.get('en_NZ_name'), zh: values.get('zh_name'), jp: values.get('jp_name') }),
              websiteUrl: values.get('websiteUrl'),
              imageUrl: values.get('imageUrl'),
              pin: values.get('pin'),
              languageIds: languages
                .filter(language => supportLanguages.find(_ => _.localeCompare(language.get('key'))))
                .map(language => language.get('id')),
            });

            if (restaurants.isEmpty()) {
              await restaurantService.create(info, null, global.parseServerSessionToken);
            } else if (restaurants.count() === 1) {
              await restaurantService.update(restaurants.first().merge(info), global.parseServerSessionToken);
            } else {
              console.error(`Multiple restaurants found with username ${values.get('username')} and restaurant name: ${values.get('en_NZ_name')}`);
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
