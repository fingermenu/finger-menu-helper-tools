// @flow

import BluebirdPromise from 'bluebird';
import Immutable, { Map, OrderedSet } from 'immutable';
import commandLineArgs from 'command-line-args';
import fs from 'fs';
import csvParser from 'csv-parse';
import { ImmutableEx } from '@microbusiness/common-javascript';
import { ParseWrapperService } from '@microbusiness/parse-server-common';
import { MenuItemPriceService } from '@fingermenu/parse-server-common';
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

    const menuItemPriceService = new MenuItemPriceService();

    const parser = csvParser(
      { delimiter: options.delimiter ? options.delimiter : ',', trim: true, rowDelimiter: options.rowDelimiter ? options.rowDelimiter : '\r\n' },
      async (err, data) => {
        if (err) {
          console.log(err);

          return;
        }

        const splittedRows = ImmutableEx.splitIntoChunks(Immutable.fromJS(data).skip(1), 10); // Skipping the first item as it is the CSV header
        const columns = OrderedSet.of('username', 'menuItemName', 'choiceItemNames', 'size', 'currentPrice');

        await BluebirdPromise.each(splittedRows.toArray(), rowChunck =>
          Promise.all(rowChunck.map(async (rawRow) => {
            const values = Common.extractColumnsValuesFromRow(columns, Immutable.fromJS(rawRow));
            const user = await Common.getUser(values.get('username'));
            const menuItemId = (await Common.loadAllMenuItems(user, { name: values.get('menuItemName') })).first().get('id');
            const menuItemPrices = await Common.loadAllMenuItemPrices(user, { menuItemId });
            const sizes = await Common.loadAllSizes(user);
            const sizeToFind = values.get('size') && values.get('size').length > 0 ? values.get('size').trim() : null;
            const choiceItems = await Common.loadAllChoiceItems(user);
            const choiceItemsToFind = Immutable.fromJS(values.get('choiceItemNames').split('|'))
              .map(_ => _.trim())
              .filterNot(_ => _.length === 0);
            const choiceItemIdsToFind = choiceItems
              .filter(choiceItem => choiceItemsToFind.find(_ => _.localeCompare(choiceItem.getIn(['name', 'en_NZ'])) === 0))
              .map(choiceItem => choiceItem.get('id'));
            const choiceItemPrices = await Common.loadAllChoiceItemPrices(user);
            const choiceItemPriceIds = choiceItemPrices.filter(choiceItemPrice =>
              choiceItemIdsToFind.find(_ => _.localeCompare(choiceItemPrice.get('choiceItemId')) === 0));

            const info = Map({
              addedByUser: user,
              menuItemId,
              choiceItemPriceIds,
              sizeId: sizeToFind ? sizes.find(size => size.getIn(['name', 'en_NZ']).localeCompare(sizeToFind) === 0).get('id') : undefined,
              currentPrice: parseFloat(values.get('currentPrice')),
            });

            if (!menuItemPrices.isEmpty()) {
              await Promise.all(menuItemPrices.map(async _ => menuItemPriceService.update(_.set('removedByUser', user), global.parseServerSessionToken)).toArray());
            }

            const acl = ParseWrapperService.createACL(user);

            acl.setPublicReadAccess(true);
            acl.setRoleWriteAccess('administrators', true);

            await menuItemPriceService.create(info, acl, global.parseServerSessionToken);
          })));
      },
    );

    fs.createReadStream(options.csvFilePath).pipe(parser);
  } catch (ex) {
    console.error(ex);
  }
};

start();
