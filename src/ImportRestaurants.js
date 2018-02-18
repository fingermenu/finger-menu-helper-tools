// @flow

import BluebirdPromise from 'bluebird';
import Immutable, { List, Map, OrderedSet } from 'immutable';
import commandLineArgs from 'command-line-args';
import fs from 'fs';
import csvParser from 'csv-parse';
import { ImmutableEx } from '@microbusiness/common-javascript';
import { ParseWrapperService } from '@microbusiness/parse-server-common';
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
];
const options = commandLineArgs(optionDefinitions);

const start = async () => {
  try {
    await Common.initializeParse(options);

    const restaurantService = new RestaurantService();

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
          'websiteUrl',
          'pin',
          'menuNames',
          'primaryLandingPageBackgroundImageUrl',
          'secondaryLandingPageBackgroundImageUrl',
          'primaryTopBannerImageUrl',
          'secondaryTopBannerImageUrl',
          'printerAddress',
          'kitchenOrderTemplate',
        );

        await BluebirdPromise.each(splittedRows.toArray(), rowChunck =>
          Promise.all(
            rowChunck.map(async rawRow => {
              const values = Common.extractColumnsValuesFromRow(columns, Immutable.fromJS(rawRow));
              const user = await Common.getUser(values.get('username'));
              const restaurants = await Common.loadAllRestaurants(user, { name: values.get('en_NZ_name') });
              const menus = await Common.loadAllMenus(user);
              const menusToFind = Immutable.fromJS(values.get('menuNames').split('|'))
                .map(_ => _.trim())
                .filterNot(_ => _.length === 0);
              const menuIds = menus
                .filter(menu => menusToFind.find(_ => _.localeCompare(menu.getIn(['name', 'en_NZ'])) === 0))
                .map(menu => menu.get('id'));
              const menuSortOrderIndices = menuIds
                .map(menuId =>
                  Map({
                    menuId,
                    index: menusToFind.indexOf(menus.find(menu => menu.get('id').localeCompare(menuId) === 0).getIn(['name', 'en_NZ'])),
                  }),
                )
                .reduce((reduction, value) => reduction.set(value.get('menuId'), value.get('index')), Map());

              const info = Map({
                ownedByUser: user,
                maintainedByUsers: List.of(user),
                name: Map({ en_NZ: values.get('en_NZ_name'), zh: values.get('zh_name'), jp: values.get('jp_name') }),
                websiteUrl: values.get('websiteUrl'),
                pin: values.get('pin'),
                menuIds,
                menuSortOrderIndices,
              });
              const images = ImmutableEx.removeUndefinedProps(
                Map({
                  primaryLandingPageBackgroundImageUrl: values.get('primaryLandingPageBackgroundImageUrl')
                    ? values.get('primaryLandingPageBackgroundImageUrl')
                    : undefined,
                  secondaryLandingPageBackgroundImageUrl: values.get('secondaryLandingPageBackgroundImageUrl')
                    ? values.get('secondaryLandingPageBackgroundImageUrl')
                    : undefined,
                  primaryTopBannerImageUrl: values.get('primaryTopBannerImageUrl') ? values.get('primaryTopBannerImageUrl') : undefined,
                  secondaryTopBannerImageUrl: values.get('secondaryTopBannerImageUrl') ? values.get('secondaryTopBannerImageUrl') : undefined,
                }),
              );

              const printers = ImmutableEx.removeUndefinedProps(
                values.get('printerAddress')
                  ? List.of(
                    Map({
                      hostname: values
                        .get('printerAddress')
                        .split(':')[0]
                        .trim(),
                      port: parseInt(
                        values
                          .get('printerAddress')
                          .split(':')[1]
                          .trim(),
                        10,
                      ),
                      type: 'Receipt',
                      name: 'Receipt Printer',
                    }),
                  )
                  : List(),
              );

              const documentTemplates = ImmutableEx.removeUndefinedProps(
                values.get('kitchenOrderTemplate')
                  ? List.of(
                    Map({
                      name: 'KitchenOrder',
                      template: values.get('kitchenOrderTemplate'),
                    }),
                  )
                  : List(),
              );

              if (restaurants.isEmpty()) {
                const acl = ParseWrapperService.createACL(user);

                acl.setPublicReadAccess(true);
                acl.setRoleWriteAccess('administrators', true);

                await restaurantService.create(info.set('configurations', Map({ images, printers, documentTemplates })), acl, null, true);
              } else if (restaurants.count() === 1) {
                await restaurantService.update(
                  restaurants
                    .first()
                    .merge(info)
                    .setIn(['configurations', 'images'], images)
                    .setIn(['configurations', 'printers'], printers)
                    .setIn(['configurations', 'documentTemplates'], documentTemplates),
                  null,
                  true,
                );
              } else {
                console.error(`Multiple restaurants found with username ${values.get('username')} and restaurant name: ${values.get('en_NZ_name')}`);
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
