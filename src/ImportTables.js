// @flow

import BluebirdPromise from 'bluebird';
import Immutable, { List, Map, OrderedSet } from 'immutable';
import commandLineArgs from 'command-line-args';
import fs from 'fs';
import csvParser from 'csv-parse';
import { ImmutableEx } from '@microbusiness/common-javascript';
import { ParseWrapperService } from '@microbusiness/parse-server-common';
import { TableService } from '@fingermenu/parse-server-common';
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

    const tableStates = await Common.loadAllTableStates();
    const tableService = new TableService();

    const parser = csvParser(
      { delimiter: options.delimiter ? options.delimiter : ',', trim: true, rowDelimiter: options.rowDelimiter ? options.rowDelimiter : '\r\n' },
      async (err, data) => {
        if (err) {
          console.log(err);

          return;
        }

        const dataWithoutHeader = Immutable.fromJS(data).skip(1);
        const splittedRows = ImmutableEx.splitIntoChunks(dataWithoutHeader, 10); // Skipping the first item as it is the CSV header
        const columns = OrderedSet.of('username', 'restaurantName', 'en_NZ_name', 'zh_name', 'jp_name', 'tableState', 'sortOrderIndex');
        const oneOffData = await Common.loadOneOffData(dataWithoutHeader, columns);

        await BluebirdPromise.each(splittedRows.toArray(), rowChunck =>
          Promise.all(
            rowChunck.map(async rawRow => {
              if (!rawRow || rawRow.isEmpty() || rawRow.every(row => row.trim().length === 0)) {
                return;
              }

              const values = Common.extractColumnsValuesFromRow(columns, Immutable.fromJS(rawRow));
              const user = oneOffData.getIn([values.get('username'), 'user']);
              const restaurantId = (await Common.loadAllRestaurants(user, { name: values.get('restaurantName') })).first().get('id');
              const tables = await Common.loadAllTables(user, restaurantId, { name: values.get('en_NZ_name') });
              const info = Map({
                ownedByUser: user,
                maintainedByUsers: List.of(user),
                restaurantId,
                name: Map({ en_NZ: values.get('en_NZ_name'), zh: values.get('zh_name'), jp: values.get('jp_name') }),
                tableStateId: tableStates.find(tableState => tableState.get('key').localeCompare(values.get('tableState')) === 0).get('id'),
                sortOrderIndex: parseInt(values.get('sortOrderIndex'), 10),
              });

              if (tables.isEmpty()) {
                const acl = ParseWrapperService.createACL(user);

                acl.setPublicReadAccess(true);
                acl.setRoleReadAccess('administrators', true);
                acl.setRoleWriteAccess('administrators', true);

                await tableService.create(info, acl, null, true);
              } else if (tables.count() === 1) {
                await tableService.update(tables.first().merge(info), null, true);
              } else {
                console.error(`Multiple tables found with username ${values.get('username')} and table name: ${values.get('en_NZ_name')}`);
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
