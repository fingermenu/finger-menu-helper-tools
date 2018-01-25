// @flow

import BluebirdPromise from 'bluebird';
import Immutable, { List, Map, OrderedSet } from 'immutable';
import commandLineArgs from 'command-line-args';
import fs from 'fs';
import csvParser from 'csv-parse';
import { ImmutableEx } from '@microbusiness/common-javascript';
import { ChoiceItemPriceService } from '@fingermenu/parse-server-common';
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

    const choiceItemPriceService = new ChoiceItemPriceService();

    const parser = csvParser(
      { delimiter: options.delimiter ? options.delimiter : ',', trim: true, rowDelimiter: options.rowDelimiter ? options.rowDelimiter : '\r\n' },
      async (err, data) => {
        if (err) {
          console.log(err);

          return;
        }

        const splittedRows = ImmutableEx.splitIntoChunks(Immutable.fromJS(data).skip(1), 10); // Skipping the first item as it is the CSV header
        const columns = OrderedSet.of('username', 'choiceItemName', 'size', 'currentPrice');

        await BluebirdPromise.each(splittedRows.toArray(), rowChunck =>
          Promise.all(rowChunck.map(async (rawRow) => {
            const values = Common.extractColumnsValuesFromRow(columns, Immutable.fromJS(rawRow));
            const user = await Common.getUser(values.get('username'));
            const choiceItemId = (await Common.loadAllChoiceItems(user, { name: values.get('choiceItemName') })).first().get('id');
            const choiceItemPrices = await Common.loadAllChoiceItemPrices(user, { choiceItemId });
            const sizes = await Common.loadAllSizes(user);
            const sizeToFind = values.get('size') && values.get('size').length > 0 ? values.get('size').trim() : null;
            const info = Map({
              ownedByUser: user,
              maintainedByUsers: List.of(user),
              choiceItemId,
              sizeId: sizeToFind ? sizes.find(size => size.getIn(['name', 'en_NZ']).localeCompare(sizeToFind) === 0).get('id') : undefined,
              currentPrice: parseFloat(values.get('currentPrice')),
            });

            if (choiceItemPrices.isEmpty()) {
              await choiceItemPriceService.create(info, null, global.parseServerSessionToken);
            } else if (choiceItemPrices.count() === 1) {
              await choiceItemPriceService.update(choiceItemPrices.first().merge(info), global.parseServerSessionToken);
            } else {
              console.error(`Multiple choice items found with username ${values.get('username')} and choice item name: ${values.get('en_NZ_name')}`);
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
