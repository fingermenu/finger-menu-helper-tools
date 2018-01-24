// @flow

import commandLineArgs from 'command-line-args';
import Common from './Common';

const optionDefinitions = [
  { name: 'username', type: String },
  { name: 'email', type: String },
  { name: 'password', type: String },
  { name: 'type', type: String },
  { name: 'applicationId', type: String },
  { name: 'javaScriptKey', type: String },
  { name: 'masterKey', type: String },
  { name: 'parseServerUrl', type: String },
];
const options = commandLineArgs(optionDefinitions);

const start = async () => {
  try {
    Common.initializeParse(options, false);

    await Common.createAccount(options.username, options.password, options.email, options.type);
  } catch (ex) {
    console.error(ex);
  }
};

start();
