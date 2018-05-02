// @flow

import { ImmutableEx } from '@microbusiness/common-javascript';
import commandLineArgs from 'command-line-args';
import BluebirdPromise from 'bluebird';
import Common from './Common';

const optionDefinitions = [
  { name: 'applicationId', type: String },
  { name: 'javaScriptKey', type: String },
  { name: 'masterKey', type: String },
  { name: 'parseServerUrl', type: String },
];
const options = commandLineArgs(optionDefinitions);

const start = async () => {
  try {
    await Common.initializeParse(options);

    const splittedRestaurants = ImmutableEx.splitIntoChunks(await Common.loadAllRestaurants(), 1);

    await BluebirdPromise.each(splittedRestaurants.toArray(), restaurants =>
      Promise.all(
        restaurants
          .map(async restaurant => {
            console.log(restaurant.toJS());
          })
          .toArray(),
      ),
    );
  } catch (ex) {
    console.error(ex);
  }
};

start();
