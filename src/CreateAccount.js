// @flow

import commandLineArgs from 'command-line-args';
import { ParseWrapperService } from '@microbusiness/parse-server-common';
import { initializeParse } from './Common';

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
    initializeParse(options, false);

    await ParseWrapperService.createNewUser({
      username: options.username,
      password: options.password,
      emailAddress: options.email,
      userType: options.type,
    }).signUp();
  } catch (ex) {
    console.error(ex);
  }
};

start();
