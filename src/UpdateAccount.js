// @flow

import commandLineArgs from 'command-line-args';
import Common from './Common';

const optionDefinitions = [
  { name: 'username', type: String },
  { name: 'password', type: String },
  { name: 'newUsername', type: String },
  { name: 'newPassword', type: String },
  { name: 'newEmail', type: String },
  { name: 'newType', type: String },
  { name: 'applicationId', type: String },
  { name: 'javaScriptKey', type: String },
  { name: 'masterKey', type: String },
  { name: 'parseServerUrl', type: String },
];
const options = commandLineArgs(optionDefinitions);

const start = async () => {
  try {
    const user = await Common.initializeParse(options, true);

    await Common.updateAccount(user, {
      username: options.newUsername,
      password: options.newPassword,
      email: options.newEmail,
      type: options.newType,
    });
  } catch (ex) {
    console.error(ex);
  }
};

start();
