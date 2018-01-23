// @flow

import BluebirdPromise from 'bluebird';
import Immutable, { Map } from 'immutable';
import commandLineArgs from 'command-line-args';
import fs from 'fs';
import csvParser from 'csv-parse';
import { ImmutableEx } from '@microbusiness/common-javascript';
import { RestaurantService } from '@fingermenu/parse-server-common';
import { initializeParse, loadAllLanguages, loadAllRestaurants } from './Common';

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
    const restaurants = await loadAllRestaurants();
    const restaurantService = new RestaurantService();

    const parser = csvParser(
      { delimiter: options.delimiter ? options.delimiter : ',', trim: true, rowDelimiter: options.rowDelimiter ? options.rowDelimiter : '\r\n' },
      async (err, data) => {
        if (err) {
          console.log(err);

          return;
        }

        const splittedRows = ImmutableEx.splitIntoChunks(Immutable.fromJS(data).skip(1), 100); // Skipping the first item as it is the CSV header

        await BluebirdPromise.each(splittedRows.toArray(), rowChunck =>
          Promise.all(rowChunck.map(async (rawRow) => {
            const row = Immutable.fromJS(rawRow);
            const enNZName = row.first();
            const zhName = row.skip(1).first();
            const jpName = row.skip(2).first();
            const websiteUrl = row.skip(3).first();
            const imageUrl = row.skip(4).first();
            const pin = row.skip(5).first();
            const supportLanguages = Immutable.fromJS(row
              .skip(6)
              .first()
              .split(','))
              .map(_ => _.trim())
              .filterNot(_ => _.length === 0);
            const restaurant = restaurants.find(_ => _.getIn(['name', 'en_NZ']).localeCompare(enNZName) === 0);

            const info = Map({
              name: Map({ en_NZ: enNZName, zh: zhName, jp: jpName }),
              websiteUrl,
              imageUrl,
              pin,
              languageIds: languages
                .filter(language => supportLanguages.find(_ => _.localeCompare(language.get('key'))))
                .map(language => language.get('id')),
            });

            if (restaurant) {
              await restaurantService.update(restaurant.merge(info), global.parseServerSessionToken);
            } else {
              await restaurantService.create(info, null, global.parseServerSessionToken);
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
