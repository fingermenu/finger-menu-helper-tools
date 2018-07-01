// @flow

import { ImmutableEx } from '@microbusiness/common-javascript';
import { ParseWrapperService } from '@microbusiness/parse-server-common';
import { TagService } from '@fingermenu/parse-server-common';
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

    const tagService = new TagService();

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
          'key',
          'en_NZ_name',
          'zh_name',
          'ja_name',
          'en_NZ_description',
          'zh_description',
          'ja_description',
          'parentTagName',
        );
        const usernames = dataWithoutHeader
          .filterNot(rawRow => rawRow.every(row => row.trim().length === 0))
          .map(rawRow => Common.extractColumnsValuesFromRow(columns, Immutable.fromJS(rawRow)).get('username'))
          .toSet();
        const results = await Promise.all(
          usernames
            .map(async username => {
              const user = await Common.getUser(username);

              return Map({ username, user });
            })
            .toArray(),
        );
        const oneOffData = results.reduce((reduction, result) => reduction.set(result.get('username'), result.delete('username')), Map());

        // Importing level one tags
        await BluebirdPromise.each(splittedRows.toArray(), rowChunck =>
          Promise.all(
            rowChunck.map(async rawRow => {
              if (!rawRow || rawRow.isEmpty() || rawRow.every(row => row.trim().length === 0)) {
                return;
              }

              const values = Common.extractColumnsValuesFromRow(columns, Immutable.fromJS(rawRow));

              if (values.get('parentTagName')) {
                return;
              }

              const user = oneOffData.getIn([values.get('username'), 'user']);
              const tags = await Common.loadAllTags(user, { name: values.get('en_NZ_name') });
              const info = Map({
                ownedByUser: user,
                maintainedByUsers: List.of(user),
                key: values.get('key'),
                name: Common.getMultiLanguagesFieldValue('name', values),
                description: Common.getMultiLanguagesFieldValue('description', values),
                level: 1,
              });

              if (tags.isEmpty()) {
                const acl = ParseWrapperService.createACL(user);

                acl.setPublicReadAccess(true);
                acl.setRoleReadAccess('administrators', true);
                acl.setRoleWriteAccess('administrators', true);

                await tagService.create(info, acl, null, true);
              } else if (tags.count() === 1) {
                await tagService.update(tags.first().merge(info), null, true);
              } else {
                console.error(`Multiple tags found with username ${values.get('username')} and tag name: ${values.get('en_NZ_name')}`);
              }
            }),
          ),
        );

        // Importing level two tags
        await BluebirdPromise.each(splittedRows.toArray(), rowChunck =>
          Promise.all(
            rowChunck.map(async rawRow => {
              if (!rawRow || rawRow.isEmpty() || rawRow.every(row => row.trim().length === 0)) {
                return;
              }

              const values = Common.extractColumnsValuesFromRow(columns, Immutable.fromJS(rawRow));
              const parentTagName = values.get('parentTagName');

              if (!parentTagName) {
                return;
              }

              const user = oneOffData.getIn([values.get('username'), 'user']);
              const parentTags = await Common.loadAllTags(user, { name: parentTagName });

              if (parentTags.isEmpty()) {
                console.error(`Failed to find parent tag with username ${values.get('username')} and parent tag name: ${parentTagName}`);

                return;
              } else if (parentTags.count() > 1) {
                console.error(`Multiple parent tags found with username ${values.get('username')} and parent tag name: ${parentTagName}`);

                return;
              }

              const tags = await Common.loadAllTags(user, { name: values.get('en_NZ_name') });
              const info = Map({
                ownedByUser: user,
                maintainedByUsers: List.of(user),
                key: values.get('key'),
                name: Common.getMultiLanguagesFieldValue('name', values),
                description: Common.getMultiLanguagesFieldValue('description', values),
                parentTagId: parentTags.first().get('id'),
                level: 2,
              });

              if (tags.isEmpty()) {
                const acl = ParseWrapperService.createACL(user);

                acl.setPublicReadAccess(true);
                acl.setRoleReadAccess('administrators', true);
                acl.setRoleWriteAccess('administrators', true);

                await tagService.create(info, acl, null, true);
              } else if (tags.count() === 1) {
                await tagService.update(tags.first().merge(info), null, true);
              } else {
                console.error(`Multiple tags found with username ${values.get('username')} and tag name: ${values.get('en_NZ_name')}`);
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
