// @flow

import BluebirdPromise from 'bluebird';
import Immutable, { Map, OrderedSet } from 'immutable';
import commandLineArgs from 'command-line-args';
import fs from 'fs';
import csvParser from 'csv-parse';
import { ImmutableEx } from '@microbusiness/common-javascript';
import { ParseWrapperService } from '@microbusiness/parse-server-common';
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
];
const options = commandLineArgs(optionDefinitions);

const start = async () => {
  try {
    await Common.initializeParse(options);

    const choiceItemPriceService = new ChoiceItemPriceService();

    const parser = csvParser(
      { delimiter: options.delimiter ? options.delimiter : ',', trim: true, rowDelimiter: options.rowDelimiter ? options.rowDelimiter : '\r\n' },
      async (err, data) => {
        if (err) {
          console.log(err);

          return;
        }

        const splittedRows = ImmutableEx.splitIntoChunks(Immutable.fromJS(data).skip(1), 10); // Skipping the first item as it is the CSV header
        const columns = OrderedSet.of('username', 'choiceItemDescription', 'currentPrice', 'tags');

        await BluebirdPromise.each(splittedRows.toArray(), rowChunck =>
          Promise.all(
            rowChunck.map(async rawRow => {
              if (!rawRow || rawRow.isEmpty() || rawRow.every(row => row.trim().length === 0)) {
                return;
              }

              const values = Common.extractColumnsValuesFromRow(columns, Immutable.fromJS(rawRow));
              const user = await Common.getUser(values.get('username'));
              const choiceItemId = (await Common.loadAllChoiceItems(user, { description: values.get('choiceItemDescription') })).first().get('id');
              const choiceItemPrices = await Common.loadAllChoiceItemPrices(user, { choiceItemId });
              const tags = await Common.loadAllTags(user);
              const tagsToFind = Immutable.fromJS(values.get('tags').split('|'))
                .map(_ => _.trim())
                .filterNot(_ => _.length === 0);
              const info = Map({
                addedByUser: user,
                choiceItemId,
                currentPrice: parseFloat(values.get('currentPrice')),
                tagIds: tags.filter(tag => tagsToFind.find(_ => _.localeCompare(tag.getIn(['name', 'en_NZ'])) === 0)).map(tag => tag.get('id')),
              });

              if (!choiceItemPrices.isEmpty()) {
                await Promise.all(choiceItemPrices.map(async _ => choiceItemPriceService.update(_.set('removedByUser', user), null, true)).toArray());
              }

              const acl = ParseWrapperService.createACL(user);

              acl.setPublicReadAccess(true);
              acl.setRoleReadAccess('administrators', true);
              acl.setRoleWriteAccess('administrators', true);

              await choiceItemPriceService.create(info, acl, null, true);
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
