// @flow

import { ImmutableEx } from '@microbusiness/common-javascript';
import { ParseWrapperService } from '@microbusiness/parse-server-common';
import { ChoiceItemService } from '@fingermenu/parse-server-common';
import BluebirdPromise from 'bluebird';
import Immutable, { List, Map, OrderedSet } from 'immutable';
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

    const choiceItemService = new ChoiceItemService();

    const parser = csvParser(
      { delimiter: options.delimiter ? options.delimiter : ',', trim: true, rowDelimiter: options.rowDelimiter ? options.rowDelimiter : '\r\n' },
      async (err, data) => {
        if (err) {
          console.log(err);

          return;
        }

        const dataWithoutHeader = Immutable.fromJS(data).skip(1);
        const splittedRows = ImmutableEx.splitIntoChunks(dataWithoutHeader, 10); // Skipping the first item as it is the CSV header
        const columns = OrderedSet.of(
          'username',
          'en_NZ_name',
          'zh_name',
          'jp_name',
          'en_NZ_description',
          'zh_description',
          'jp_description',
          'choiceItemPageUrl',
          'imageUrl',
          'tags',
        );
        const oneOffData = await Common.loadOneOffData(dataWithoutHeader, columns, async user => {
          const tags = await Common.loadAllTags(user);

          return Map({ tags });
        });

        await BluebirdPromise.each(splittedRows.toArray(), rowChunck =>
          Promise.all(
            rowChunck.map(async rawRow => {
              if (!rawRow || rawRow.isEmpty() || rawRow.every(row => row.trim().length === 0)) {
                return;
              }

              const values = Common.extractColumnsValuesFromRow(columns, Immutable.fromJS(rawRow));
              const user = oneOffData.getIn([values.get('username'), 'user']);
              const choiceItems = await Common.loadAllChoiceItems(user, { description: values.get('en_NZ_description') });
              const tags = oneOffData.getIn([values.get('username'), 'tags']);
              const tagsToFind = Immutable.fromJS(values.get('tags').split('|'))
                .map(_ => _.trim())
                .filterNot(_ => _.length === 0);
              const info = Map({
                ownedByUser: user,
                maintainedByUsers: List.of(user),
                name: Common.getMultiLanguagesFieldValue('name', values),
                description: Common.getMultiLanguagesFieldValue('description', values),
                choiceItemPageUrl: values.get('choiceItemPageUrl'),
                imageUrl: values.get('imageUrl'),
                tagIds: tags.filter(tag => tagsToFind.find(_ => _.localeCompare(tag.getIn(['name', 'en_NZ'])) === 0)).map(tag => tag.get('id')),
              });

              if (choiceItems.isEmpty()) {
                const acl = ParseWrapperService.createACL(user);

                acl.setPublicReadAccess(true);
                acl.setRoleReadAccess('administrators', true);
                acl.setRoleWriteAccess('administrators', true);

                await choiceItemService.create(info, acl, null, true);
              } else if (choiceItems.count() === 1) {
                await choiceItemService.update(choiceItems.first().merge(info), null, true);
              } else {
                console.error(
                  `Multiple choice items found with username ${values.get('username')} and choice item description: ${values.get(
                    'en_NZ_description',
                  )}`,
                );
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
