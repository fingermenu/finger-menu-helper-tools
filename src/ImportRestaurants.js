// @flow

import { ImmutableEx } from '@microbusiness/common-javascript';
import { ParseWrapperService } from '@microbusiness/parse-server-common';
import { RestaurantService } from '@fingermenu/parse-server-common';
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

    const restaurantService = new RestaurantService();

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
          'websiteUrl',
          'pin',
          'menuNames',
          'primaryLandingPageBackgroundImageUrl',
          'secondaryLandingPageBackgroundImageUrl',
          'primaryTopBannerImageUrl',
          'secondaryTopBannerImageUrl',
          'printers',
          'kitchenOrderTemplate',
          'kitchenOrderTemplateMaximumLineWidthDivisionFactor',
          'kitchenOrderTemplateLinkedPrinters',
          'customerReceiptTemplate',
          'customerReceiptTemplateMaximumLineWidthDivisionFactor',
          'customerReceiptTemplateLinkedPrinters',
          'departmentCategoryDailyReportTemplate',
          'departmentCategoryDailyReportTemplateMaximumLineWidthDivisionFactor',
          'departmentCategoryDailyReportTemplateLinkedPrinters',
          'numberOfPrintCopiesForKitchen',
          'logoImageUrl',
          'gstPercentage',
          'defaultLanguageForDisplay',
          'languageToPrintOnCustomerReceipt',
          'languageToPrintOnKitchenReceipt',
        );
        const oneOffData = await Common.loadOneOffData(dataWithoutHeader, columns, async user => {
          const tags = await Common.loadAllTags(user);
          const menus = await Common.loadAllMenus(user);

          return Map({ tags, menus });
        });

        await BluebirdPromise.each(splittedRows.toArray(), rowChunck =>
          Promise.all(
            rowChunck.map(async rawRow => {
              if (!rawRow || rawRow.isEmpty() || rawRow.every(row => row.trim().length === 0)) {
                return;
              }

              const values = Common.extractColumnsValuesFromRow(columns, Immutable.fromJS(rawRow));
              const user = oneOffData.getIn([values.get('username'), 'user']);
              const restaurants = await Common.loadAllRestaurants(user, { name: values.get('en_NZ_name') });
              const menus = oneOffData.getIn([values.get('username'), 'menus']);
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
                name: Common.getMultiLanguagesFieldValue('name', values),
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
                  logoImageUrl: values.get('logoImageUrl') ? values.get('logoImageUrl') : undefined,
                }),
              );
              const languages = ImmutableEx.removeUndefinedProps(
                Map({
                  defaultDisplay: values.get('defaultLanguageForDisplay') ? values.get('defaultLanguageForDisplay') : undefined,
                  printOnCustomerReceipt: values.get('languageToPrintOnCustomerReceipt') ? values.get('languageToPrintOnCustomerReceipt') : undefined,
                  printOnKitchenReceipt: values.get('languageToPrintOnKitchenReceipt') ? values.get('languageToPrintOnKitchenReceipt') : undefined,
                }),
              );

              const numberOfPrintCopiesForKitchen = values.get('numberOfPrintCopiesForKitchen')
                ? parseInt(values.get('numberOfPrintCopiesForKitchen'), 10)
                : 1;
              const gstPercentage = values.get('gstPercentage') ? parseFloat(values.get('gstPercentage')) : null;
              const printers = values.get('printers') ? Immutable.fromJS(JSON.parse(values.get('printers'))) : List();

              let documentTemplates = List();

              if (values.get('kitchenOrderTemplate')) {
                documentTemplates = documentTemplates.push(
                  Map({
                    name: 'KitchenOrder',
                    template: values.get('kitchenOrderTemplate').replace(/\r?\n|\r/g, ''),
                    maxLineWidthDivisionFactor: parseFloat(values.get('kitchenOrderTemplateMaximumLineWidthDivisionFactor')),
                    linkedPrinters: values.get('kitchenOrderTemplateLinkedPrinters')
                      ? Immutable.fromJS(JSON.parse(values.get('kitchenOrderTemplateLinkedPrinters')))
                      : List(),
                  }),
                );
              }

              if (values.get('customerReceiptTemplate')) {
                documentTemplates = documentTemplates.push(
                  Map({
                    name: 'CustomerReceipt',
                    template: values.get('customerReceiptTemplate').replace(/\r?\n|\r/g, ''),
                    maxLineWidthDivisionFactor: parseFloat(values.get('customerReceiptTemplateMaximumLineWidthDivisionFactor')),
                    linkedPrinters: values.get('customerReceiptTemplateLinkedPrinters')
                      ? Immutable.fromJS(JSON.parse(values.get('customerReceiptTemplateLinkedPrinters')))
                      : List(),
                  }),
                );
              }

              if (values.get('departmentCategoryDailyReportTemplate')) {
                documentTemplates = documentTemplates.push(
                  Map({
                    name: 'DepartmentCategoryDailyReport',
                    template: values.get('departmentCategoryDailyReportTemplate').replace(/\r?\n|\r/g, ''),
                    maxLineWidthDivisionFactor: parseFloat(values.get('departmentCategoryDailyReportTemplateMaximumLineWidthDivisionFactor')),
                    linkedPrinters: values.get('departmentCategoryDailyReportTemplateLinkedPrinters')
                      ? Immutable.fromJS(JSON.parse(values.get('departmentCategoryDailyReportTemplateLinkedPrinters')))
                      : List(),
                  }),
                );
              }

              if (restaurants.isEmpty()) {
                const acl = ParseWrapperService.createACL(user);

                acl.setPublicReadAccess(true);
                acl.setRoleReadAccess('administrators', true);
                acl.setRoleWriteAccess('administrators', true);

                await restaurantService.create(
                  info.set('configurations', Map({ images, languages, printers, documentTemplates, numberOfPrintCopiesForKitchen, gstPercentage })),
                  acl,
                  null,
                  true,
                );
              } else if (restaurants.count() === 1) {
                await restaurantService.update(
                  restaurants
                    .first()
                    .merge(info)
                    .setIn(['configurations', 'images'], images)
                    .setIn(['configurations', 'languages'], languages)
                    .setIn(['configurations', 'printers'], printers)
                    .setIn(['configurations', 'documentTemplates'], documentTemplates)
                    .setIn(['configurations', 'numberOfPrintCopiesForKitchen'], numberOfPrintCopiesForKitchen)
                    .setIn(['configurations', 'gstPercentage'], gstPercentage),
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
