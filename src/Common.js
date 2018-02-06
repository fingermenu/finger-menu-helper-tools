// @flow

import { List, Map, Range } from 'immutable';
import Parse from 'parse/node';
import { ParseWrapperService, UserService } from '@microbusiness/parse-server-common';
import {
  ChoiceItemService,
  ChoiceItemPriceService,
  MenuItemService,
  MenuItemPriceService,
  MenuService,
  LanguageService,
  RestaurantService,
  TableService,
  TableStateService,
  OrderStateService,
  TagService,
  SizeService,
} from '@fingermenu/parse-server-common';

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

      return user;
    }

    return null;
  };

  static logIn = async (username, password) => ParseWrapperService.logIn(username, password);

  static extractColumnsValuesFromRow = (columns, row) =>
    columns.zip(Range(0, columns.count())).reduce((reduction, value) => reduction.set(value[0], row.skip(value[1]).first()), Map());

  static getUser = username => UserService.getUser(username, global.parseServerSessionToken);

  static createAccount = async (username, password, email, type) =>
    ParseWrapperService.createNewUser({
      username,
      password,
      emailAddress: email,
      userType: type,
    }).signUp();

  static updateAccount = async (user, {
    username, password, email, type,
  } = {}) =>
    UserService.updateUserDetails(
      {
        username,
        password,
        emailAddress: email,
        userType: type,
      },
      user,
      user.getSessionToken(),
    );

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

  static loadAllTableStates = async () => {
    let tableStates = List();
    const result = await new TableStateService().searchAll(Map({}), global.parseServerSessionToken);

    try {
      result.event.subscribe((info) => {
        tableStates = tableStates.push(info);
      });

      await result.promise;
    } finally {
      result.event.unsubscribeAll();
    }

    return tableStates;
  };

  static loadAllOrderStates = async () => {
    let orderStates = List();
    const result = await new OrderStateService().searchAll(Map({}), global.parseServerSessionToken);

    try {
      result.event.subscribe((info) => {
        orderStates = orderStates.push(info);
      });

      await result.promise;
    } finally {
      result.event.unsubscribeAll();
    }

    return orderStates;
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

  static loadAllTags = async (user, { name } = {}) => {
    let tags = List();
    const result = await new TagService().searchAll(
      Map({ language: 'en_NZ', conditions: Map({ ownedByUser: user, name }) }),
      global.parseServerSessionToken,
    );

    try {
      result.event.subscribe((info) => {
        tags = tags.push(info);
      });

      await result.promise;
    } finally {
      result.event.unsubscribeAll();
    }

    return tags;
  };

  static loadAllSizes = async (user, { name } = {}) => {
    let sizes = List();
    const result = await new SizeService().searchAll(
      Map({ language: 'en_NZ', conditions: Map({ ownedByUser: user, name }) }),
      global.parseServerSessionToken,
    );

    try {
      result.event.subscribe((info) => {
        sizes = sizes.push(info);
      });

      await result.promise;
    } finally {
      result.event.unsubscribeAll();
    }

    return sizes;
  };

  static loadAllChoiceItems = async (user, { name } = {}) => {
    let choiceItems = List();
    const result = await new ChoiceItemService().searchAll(
      Map({ language: 'en_NZ', conditions: Map({ ownedByUser: user, name }) }),
      global.parseServerSessionToken,
    );

    try {
      result.event.subscribe((info) => {
        choiceItems = choiceItems.push(info);
      });

      await result.promise;
    } finally {
      result.event.unsubscribeAll();
    }

    return choiceItems;
  };

  static loadAllChoiceItemPrices = async (user, { choiceItemId } = {}) => {
    let choiceItemPrices = List();
    const result = await new ChoiceItemPriceService().searchAll(
      Map({ conditions: Map({ addedByUser: user, choiceItemId, doesNotExist_removedByUser: true }) }),
      global.parseServerSessionToken,
    );

    try {
      result.event.subscribe((info) => {
        choiceItemPrices = choiceItemPrices.push(info);
      });

      await result.promise;
    } finally {
      result.event.unsubscribeAll();
    }

    return choiceItemPrices;
  };

  static loadAllMenuItems = async (user, { name } = {}) => {
    let menuItems = List();
    const result = await new MenuItemService().searchAll(
      Map({ language: 'en_NZ', conditions: Map({ ownedByUser: user, name }) }),
      global.parseServerSessionToken,
    );

    try {
      result.event.subscribe((info) => {
        menuItems = menuItems.push(info);
      });

      await result.promise;
    } finally {
      result.event.unsubscribeAll();
    }

    return menuItems;
  };

  static loadAllMenuItemPrices = async (user, { menuItemId } = {}) => {
    let menuItemPrices = List();
    const result = await new MenuItemPriceService().searchAll(
      Map({ include_menuItem: true, conditions: Map({ addedByUser: user, menuItemId, doesNotExist_removedByUser: true }) }),
      global.parseServerSessionToken,
    );

    try {
      result.event.subscribe((info) => {
        menuItemPrices = menuItemPrices.push(info);
      });

      await result.promise;
    } finally {
      result.event.unsubscribeAll();
    }

    return menuItemPrices;
  };

  static loadAllMenus = async (user, { name } = {}) => {
    let menus = List();
    const result = await new MenuService().searchAll(
      Map({ language: 'en_NZ', conditions: Map({ ownedByUser: user, name }) }),
      global.parseServerSessionToken,
    );

    try {
      result.event.subscribe((info) => {
        menus = menus.push(info);
      });

      await result.promise;
    } finally {
      result.event.unsubscribeAll();
    }

    return menus;
  };
}
