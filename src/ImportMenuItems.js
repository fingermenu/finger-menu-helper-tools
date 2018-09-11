// @flow

import { ImmutableEx } from '@microbusiness/common-javascript';
import { ParseWrapperService } from '@microbusiness/parse-server-common';
import { MenuItemService } from '@fingermenu/parse-server-common';
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

    const menuItemService = new MenuItemService();

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
          'ja_name',
          'en_NZ_description',
          'zh_description',
          'ja_description',
          'menuItemPageUrl',
          'imageUrl',
          'tags',
          'linkedPrinters',
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
              const menuItems = await Common.loadAllMenuItems(user, { name: values.get('en_NZ_name') });
              const tags = oneOffData.getIn([values.get('username'), 'tags']);
              const tagsToFind = Immutable.fromJS(values.get('tags').split('|'))
                .map(_ => _.trim())
                .filterNot(_ => _.length === 0);
              const info = Map({
                ownedByUser: user,
                maintainedByUsers: List.of(user),
                name: Common.getMultiLanguagesFieldValue('name', values),
                description: Common.getMultiLanguagesFieldValue('description', values),
                menuItemPageUrl: values.get('menuItemPageUrl'),
                imageUrl: values.get('imageUrl'),
                tagIds: tags.filter(tag => tagsToFind.find(_ => _.localeCompare(tag.getIn(['name', 'en_NZ'])) === 0)).map(tag => tag.get('id')),
                linkedPrinters: values.get('linkedPrinters') ? Immutable.fromJS(JSON.parse(values.get('linkedPrinters'))) : List(),
              });

              if (menuItems.isEmpty()) {
                const acl = ParseWrapperService.createACL(user);

                acl.setPublicReadAccess(true);
                acl.setRoleReadAccess('administrators', true);
                acl.setRoleWriteAccess('administrators', true);

                await menuItemService.create(info, acl, null, true);
              } else if (menuItems.count() === 1) {
                await menuItemService.update(menuItems.first().merge(info), null, true);
              } else {
                console.error(`Multiple menu items found with username ${values.get('username')} and menu item name: ${values.get('en_NZ_name')}`);
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
