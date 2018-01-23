// @flow

import { List, Map } from 'immutable';
import Parse from 'parse/node';
import { ParseWrapperService } from '@microbusiness/parse-server-common';
import { LanguageService, RestaurantService } from '@fingermenu/parse-server-common';

export const initializeParse = async (options, login = true) => {
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

export const loadAllLanguages = async () => {
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

export const loadAllRestaurants = async () => {
  let restaurants = List();
  const result = await new RestaurantService().searchAll(Map({}), global.parseServerSessionToken);

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

export const getRestaurant = async (name, language) => {
  const criteria = Map({
    language,
    conditions: Map({
      name,
    }),
  });
  const restaurantService = new RestaurantService();
  const restaurants = await restaurantService.search(criteria, global.parseServerSessionToken);

  if (restaurants.isEmpty()) {
    throw new Error(`No restaurant found with name: ${name}.`);
  }

  if (restaurants.count() > 1) {
    throw new Error(`Multiple restaurant found with name: ${name}.`);
  }

  return restaurants.first();
};
