// @flow

import BluebirdPromise from 'bluebird';
import Immutable, { Map, OrderedSet } from 'immutable';
import commandLineArgs from 'command-line-args';
import fs from 'fs';
import csvParser from 'csv-parse';
import { ImmutableEx } from '@microbusiness/common-javascript';
import { ParseWrapperService } from '@microbusiness/parse-server-common';
import { ChoiceItem, MenuItemPriceService } from '@fingermenu/parse-server-common';
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

    const menuItemPriceService = new MenuItemPriceService();

    const parser = csvParser(
      { delimiter: options.delimiter ? options.delimiter : ',', trim: true, rowDelimiter: options.rowDelimiter ? options.rowDelimiter : '\r\n' },
      async (err, data) => {
        if (err) {
          console.log(err);

          return;
        }

        const splittedRows = ImmutableEx.splitIntoChunks(Immutable.fromJS(data).skip(1), 10); // Skipping the first item as it is the CSV header
        const columns = OrderedSet.of(
          'username',
          'menuItemName',
          'choiceItemDescriptions',
          'currentPrice',
          'tags',
          'defaultChoiceItemDescriptions',
          'mustChooseSize',
          'mustChooseDietaryOption',
          'minNumberOfSideDishes',
          'maxNumberOfSideDishes',
        );

        await BluebirdPromise.each(splittedRows.toArray(), rowChunck =>
          Promise.all(
            rowChunck.map(async rawRow => {
              if (!rawRow || rawRow.isEmpty() || (rawRow.count() === 1 && rawRow.first().trim().length === 0)) {
                return;
              }

              const values = Common.extractColumnsValuesFromRow(columns, Immutable.fromJS(rawRow));
              const user = await Common.getUser(values.get('username'));
              const menuItemId = (await Common.loadAllMenuItems(user, { name: values.get('menuItemName') })).first().get('id');
              const menuItemPrices = await Common.loadAllMenuItemPrices(user, { menuItemId });
              const choiceItems = await Common.loadAllChoiceItems(user);
              const allChoiceItemPrices = await Common.loadAllChoiceItemPrices(user);

              const choiceItemsToFind = Immutable.fromJS(values.get('choiceItemDescriptions').split('|'))
                .map(_ => _.trim())
                .filterNot(_ => _.length === 0);
              const choiceItemIdsToFind = choiceItems
                .filter(choiceItem => choiceItemsToFind.find(_ => _.localeCompare(choiceItem.getIn(['description', 'en_NZ'])) === 0))
                .map(choiceItem => choiceItem.get('id'));
              const choiceItemPrices = choiceItemPrices.map(_ => _.set('choiceItem', new ChoiceItem(_.get('choiceItem')).getInfo()));
              const choiceItemPriceIds = choiceItemPrices
                .filter(choiceItemPrice => choiceItemIdsToFind.find(_ => _.localeCompare(choiceItemPrice.get('choiceItemId')) === 0))
                .map(_ => _.get('id'));

              const defaultChoiceItemsToFind = Immutable.fromJS(values.get('defaultChoiceItemDescriptions').split('|'))
                .map(_ => _.trim())
                .filterNot(_ => _.length === 0);
              const defaultChoiceItemIdsToFind = choiceItems
                .filter(choiceItem => defaultChoiceItemsToFind.find(_ => _.localeCompare(choiceItem.getIn(['description', 'en_NZ'])) === 0))
                .map(choiceItem => choiceItem.get('id'));
              const defaultChoiceItemPrices = allChoiceItemPrices.map(_ => _.set('choiceItem', new ChoiceItem(_.get('choiceItem')).getInfo()));
              const defaultChoiceItemPriceIds = defaultChoiceItemPrices
                .filter(choiceItemPrice => defaultChoiceItemIdsToFind.find(_ => _.localeCompare(choiceItemPrice.get('choiceItemId')) === 0))
                .map(_ => _.get('id'));

              const choiceItemPriceSortOrderIndices = choiceItemPriceIds
                .map(choiceItemPriceId =>
                  Map({
                    choiceItemPriceId,
                    index: choiceItemsToFind.indexOf(
                      choiceItemPrices
                        .find(choiceItem => choiceItem.get('id').localeCompare(choiceItemPriceId) === 0)
                        .getIn(['choiceItem', 'description', 'en_NZ']),
                    ),
                  }),
                )
                .reduce((reduction, value) => reduction.set(value.get('choiceItemPriceId'), value.get('index')), Map());
              const tags = await Common.loadAllTags(user);
              const tagsToFind = Immutable.fromJS(values.get('tags').split('|'))
                .map(_ => _.trim())
                .filterNot(_ => _.length === 0);

              const info = Map({
                addedByUser: user,
                menuItemId,
                choiceItemPriceIds,
                defaultChoiceItemPriceIds,
                currentPrice: parseFloat(values.get('currentPrice')),
                rules: Map({
                  mustChooseSize: 'T'.localeCompare(values.get('mustChooseSize')) === 0,
                  mustChooseDietaryOption: 'T'.localeCompare(values.get('mustChooseDietaryOption')) === 0,
                  minNumberOfSideDishes: parseInt(values.get('minNumberOfSideDishes'), 10),
                  maxNumberOfSideDishes: parseInt(values.get('maxNumberOfSideDishes'), 10),
                }),
                choiceItemPriceSortOrderIndices,
                tagIds: tags.filter(tag => tagsToFind.find(_ => _.localeCompare(tag.getIn(['name', 'en_NZ'])) === 0)).map(tag => tag.get('id')),
              });

              if (!menuItemPrices.isEmpty()) {
                await Promise.all(menuItemPrices.map(async _ => menuItemPriceService.update(_.set('removedByUser', user), null, true)).toArray());
              }

              const acl = ParseWrapperService.createACL(user);

              acl.setPublicReadAccess(true);
              acl.setRoleReadAccess('administrators', true);
              acl.setRoleWriteAccess('administrators', true);

              await menuItemPriceService.create(info, acl, null, true);
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
