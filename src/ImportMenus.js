// @flow

import BluebirdPromise from 'bluebird';
import Immutable, { List, Map, OrderedSet } from 'immutable';
import commandLineArgs from 'command-line-args';
import fs from 'fs';
import csvParser from 'csv-parse';
import { ImmutableEx } from '@microbusiness/common-javascript';
import { ParseWrapperService } from '@microbusiness/parse-server-common';
import { MenuService, MenuItem } from '@fingermenu/parse-server-common';
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

    const menuService = new MenuService();

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
          'en_NZ_name',
          'zh_name',
          'jp_name',
          'en_NZ_description',
          'zh_description',
          'jp_description',
          'menuPageUrl',
          'imageUrl',
          'tags',
          'menuItemNames',
        );

        await BluebirdPromise.each(splittedRows.toArray(), rowChunck =>
          Promise.all(
            rowChunck.map(async rawRow => {
              const values = Common.extractColumnsValuesFromRow(columns, Immutable.fromJS(rawRow));
              const user = await Common.getUser(values.get('username'));
              const menus = await Common.loadAllMenus(user, { name: values.get('en_NZ_name') });
              const tags = await Common.loadAllTags(user);
              const tagsToFind = Immutable.fromJS(values.get('tags').split('|'))
                .map(_ => _.trim())
                .filterNot(_ => _.length === 0);
              const menuItemPrices = (await Common.loadAllMenuItemPrices(user)).map(_ =>
                _.set('menuItem', new MenuItem(_.get('menuItem')).getInfo()),
              );
              const menuItemsToFind = Immutable.fromJS(values.get('menuItemNames').split('|'))
                .map(_ => _.trim())
                .filterNot(_ => _.length === 0);
              const menuItemPriceIds = menuItemPrices
                .filter(tag => menuItemsToFind.find(_ => _.localeCompare(tag.getIn(['menuItem', 'name', 'en_NZ'])) === 0))
                .map(tag => tag.get('id'));
              const menuItemPriceSortOrderIndices = menuItemPriceIds
                .map(menuItemPriceId =>
                  Map({
                    menuItemPriceId,
                    index: menuItemsToFind.indexOf(
                      menuItemPrices.find(menu => menu.get('id').localeCompare(menuItemPriceId) === 0).getIn(['menuItem', 'name', 'en_NZ']),
                    ),
                  }),
                )
                .reduce((reduction, value) => reduction.set(value.get('menuItemPriceId'), value.get('index')), Map());

              const info = Map({
                ownedByUser: user,
                maintainedByUsers: List.of(user),
                name: Map({ en_NZ: values.get('en_NZ_name'), zh: values.get('zh_name'), jp: values.get('jp_name') }),
                description: Map({ en_NZ: values.get('en_NZ_description'), zh: values.get('zh_description'), jp: values.get('jp_description') }),
                menuPageUrl: values.get('menuPageUrl'),
                imageUrl: values.get('imageUrl'),
                tagIds: tags.filter(tag => tagsToFind.find(_ => _.localeCompare(tag.getIn(['name', 'en_NZ'])) === 0)).map(tag => tag.get('id')),
                menuItemPriceIds,
                menuItemPriceSortOrderIndices,
              });

              if (menus.isEmpty()) {
                const acl = ParseWrapperService.createACL(user);

                acl.setPublicReadAccess(true);
                acl.setRoleWriteAccess('administrators', true);

                await menuService.create(info, acl, null, true);
              } else if (menus.count() === 1) {
                await menuService.update(menus.first().merge(info), null, true);
              } else {
                console.error(`Multiple menus found with username ${values.get('username')} and menu name: ${values.get('en_NZ_name')}`);
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
