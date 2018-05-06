// @flow

import { ImmutableEx } from '@microbusiness/common-javascript';
import { ParseWrapperService } from '@microbusiness/parse-server-common';
import { PackageBundleService } from '@fingermenu/parse-server-common';
import commandLineArgs from 'command-line-args';
import { Map } from 'immutable';
import BluebirdPromise from 'bluebird';
import fs from 'fs';
import fse from 'fs-extra';
import os from 'os';
import uniqueFilename from 'unique-filename';
import AdmZip from 'adm-zip';
import md5File from 'md5-file';
import Common from './Common';

const optionDefinitions = [
  { name: 'applicationId', type: String },
  { name: 'javaScriptKey', type: String },
  { name: 'masterKey', type: String },
  { name: 'parseServerUrl', type: String },
];
const options = commandLineArgs(optionDefinitions);

const removeNotRequiredDataFromAnEntry = entry =>
  entry
    .delete('ownedByUserId')
    .delete('ownedByUser')
    .delete('maintainedByUsers')
    .delete('maintainedByUserIds')
    .delete('tableState')
    .delete('tableStateId')
    .delete('lastOrderCorrelationId')
    .delete('notes');

const mapDates = entry => entry.merge(Map({ createdAt: entry.get('createdAt').toISOString(), updatedAt: entry.get('updatedAt').toISOString() }));

const removeNotRequiredDataAndSort = list =>
  list
    .sort((item1, item2) => {
      const createdAt1 = item1.get('createdAt');
      const createdAt2 = item2.get('createdAt');

      if (createdAt1 > createdAt2) {
        return 1;
      }

      if (createdAt1 < createdAt2) {
        return -1;
      }

      return 0;
    })
    .map(removeNotRequiredDataFromAnEntry)
    .map(mapDates);

const start = async () => {
  try {
    await Common.initializeParse(options);

    const packageBundleService = new PackageBundleService();

    const splittedRestaurants = ImmutableEx.splitIntoChunks(await Common.loadAllRestaurants(), 1);

    await BluebirdPromise.each(splittedRestaurants.toArray(), restaurants =>
      Promise.all(
        restaurants
          .map(async restaurant => {
            const user = restaurant.get('ownedByUser');
            const languages = await Common.loadAllLanguages();
            const tableStates = await Common.loadAllTableStates();
            const tags = await Common.loadAllTags(user);
            const servingTimes = await Common.loadAllServingTimes(user);
            const dietaryOptions = await Common.loadAllDietaryOptions(user);
            const dishTypes = await Common.loadAllDishTypes(user);
            const sizes = await Common.loadAllSizes(user);
            const choiceItems = await Common.loadAllChoiceItems(user);
            const choiceItemPrices = await Common.loadAllChoiceItemPrices(user, {}, false);
            const menuItems = await Common.loadAllMenuItems(user);
            const menuItemPrices = await Common.loadAllMenuItemPrices(user, {}, false);
            const menus = await Common.loadAllMenus(user);
            const tables = await Common.loadAllTables(user);
            const packageBundle = await Common.loadRestaurantPackageBundle(restaurant.get('id'));
            const packageFile = Map({
              languages: removeNotRequiredDataAndSort(languages),
              tableStates: removeNotRequiredDataAndSort(tableStates),
              tags: removeNotRequiredDataAndSort(tags),
              servingTimes: removeNotRequiredDataAndSort(servingTimes),
              dietaryOptions: removeNotRequiredDataAndSort(dietaryOptions),
              dishTypes: removeNotRequiredDataAndSort(dishTypes),
              sizes: removeNotRequiredDataAndSort(sizes),
              choiceItems: removeNotRequiredDataAndSort(choiceItems),
              choiceItemPrices: removeNotRequiredDataAndSort(choiceItemPrices),
              menuItems: removeNotRequiredDataAndSort(menuItems),
              menuItemPrices: removeNotRequiredDataAndSort(menuItemPrices),
              menus: removeNotRequiredDataAndSort(menus),
              tables: removeNotRequiredDataAndSort(tables),
              restaurant: removeNotRequiredDataFromAnEntry(restaurant),
            });
            const tempDirectory = uniqueFilename(os.tmpdir());
            const jsonFilename = tempDirectory + '/data.json';
            const zipFilename = tempDirectory + '/data.zip';

            await fse.ensureDir(tempDirectory);

            console.log('Writing restaurant: ' + restaurant.getIn(['name', 'en_NZ']) + ' to file: ' + jsonFilename);
            await fse.writeJson(jsonFilename, packageFile.toJS());
            console.log('Finished writing restaurant: ' + restaurant.getIn(['name', 'en_NZ']) + ' to file: ' + jsonFilename);

            const checksum = md5File.sync(jsonFilename);

            if (packageBundle && packageBundle.get('checksum').localeCompare(checksum) === 0) {
              console.log('No change in restaurant: ' + restaurant.getIn(['name', 'en_NZ']) + '. No need to create a new package bundle.');

              return;
            }

            console.log(
              'Compressing restaurant: ' + restaurant.getIn(['name', 'en_NZ']) + ' file: ' + jsonFilename + ' . Zip file name: ' + zipFilename,
            );

            const zip = new AdmZip();

            zip.addLocalFile(jsonFilename);
            zip.writeZip(zipFilename);

            console.log(
              'Finished compressing restaurant: ' +
                restaurant.getIn(['name', 'en_NZ']) +
                ' file: ' +
                jsonFilename +
                ' . Zip file name: ' +
                zipFilename +
                ' . Checksum: ' +
                checksum,
            );

            const url = (await ParseWrapperService.createFile('data.zip', [...fs.readFileSync(zipFilename)]).save()).url();
            const acl = ParseWrapperService.createACL(user);

            acl.setPublicReadAccess(true);
            acl.setRoleReadAccess('administrators', true);
            acl.setRoleWriteAccess('administrators', true);

            await packageBundleService.create(Map({ url, checksum, restaurantId: restaurant.get('id') }), acl, null, true);

            console.log('New package bundle created for restaurant: ' + restaurant.getIn(['name', 'en_NZ']) + '.');
          })
          .toArray(),
      ),
    );
  } catch (ex) {
    console.error(ex);
  }
};

start();
