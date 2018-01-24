// @flow

import { List, Map, Range } from 'immutable';
import Parse from 'parse/node';
import { ParseWrapperService, UserService } from '@microbusiness/parse-server-common';
import { LanguageService, RestaurantService, TableService } from '@fingermenu/parse-server-common';

export default class Common {
  static initializeParse = async (options, login = true) => {
    Parse.initialize(
      options.applicationId ? options.applicationId : 'app_id',
      options.javaScriptKey ? options.javaScriptKey : 'javascript_key',
      options.masterKey ? options.masterKey : 'master_key',
    );

    Parse.serverURL = options.parseServerUrl ? options.parseServerUrl : 'http://localhost:1337/parse';

    if (login) {
      const user = await ParseWrapperService.logIn(options.username, options.password);

      global.parseServerSessionToken = user.getSessionToken();
    }
  };

  static extractColumnsValuesFromRow = (columns, row) =>
    columns.zip(Range(0, columns.count())).reduce((reduction, value) => reduction.set(value[0], row.skip(value[1]).first()), Map());

  static getUser = username => UserService.getUser(username, global.parseServerSessionToken);

  static createAccount = async (username, password, emailAddress, userType) =>
    ParseWrapperService.createNewUser({
      username,
      password,
      emailAddress,
      userType,
    }).signUp();

  static loadAllLanguages = async () => {
    let languages = List();
    const result = await new LanguageService().searchAll(Map({}), global.parseServerSessionToken);

    try {
      result.event.subscribe((info) => {
        languages = languages.push(info);
      });

      await result.promise;
    } finally {
      result.event.unsubscribeAll();
    }

    return languages;
  };

  static loadAllRestaurants = async (user, { name } = {}) => {
    let restaurants = List();
    const result = await new RestaurantService().searchAll(
      Map({ language: 'en_NZ', conditions: Map({ ownedByUser: user, name }) }),
      global.parseServerSessionToken,
    );

    try {
      result.event.subscribe((info) => {
        restaurants = restaurants.push(info);
      });

      await result.promise;
    } finally {
      result.event.unsubscribeAll();
    }

    return restaurants;
  };

  static loadAllTables = async (user, restaurantId, { name } = {}) => {
    let tables = List();
    const result = await new TableService().searchAll(
      Map({ language: 'en_NZ', conditions: Map({ ownedByUser: user, restaurantId, name }) }),
      global.parseServerSessionToken,
    );

    try {
      result.event.subscribe((info) => {
        tables = tables.push(info);
      });

      await result.promise;
    } finally {
      result.event.unsubscribeAll();
    }

    return tables;
  };
}
