// @flow

import { ImmutableEx } from '@microbusiness/common-javascript';
import { ParseWrapperService, UserService } from '@microbusiness/parse-server-common';
import {
  ChoiceItemService,
  ChoiceItemPriceService,
  DietaryOptionService,
  DishTypeService,
  MenuItemService,
  MenuItemPriceService,
  MenuService,
  LanguageService,
  RestaurantService,
  TableService,
  TableStateService,
  OrderStateService,
  TagService,
  ServingTimeService,
  SizeService,
} from '@fingermenu/parse-server-common';
import Immutable, { List, Map, Range } from 'immutable';
import Parse from 'parse/node';

export default class Common {
  static initializeParse = async options => {
    Parse.initialize(
      options.applicationId ? options.applicationId : 'app_id',
      options.javaScriptKey ? options.javaScriptKey : 'javascript_key',
      options.masterKey ? options.masterKey : 'master_key',
    );

    Parse.serverURL = options.parseServerUrl ? options.parseServerUrl : 'http://localhost:1337/parse';
  };

  static logIn = async (username, password) => ParseWrapperService.logIn(username, password);

  static extractColumnsValuesFromRow = (columns, row) =>
    columns.zip(Range(0, columns.count())).reduce((reduction, value) => reduction.set(value[0], row.skip(value[1]).first()), Map());

  static getUser = username => UserService.getUser(username, null, true);

  static createAccount = async (username, password, email, type) =>
    ParseWrapperService.createNewUser({
      username,
      password,
      emailAddress: email,
      userType: type,
    }).signUp();

  static updateAccount = async (user, { username, password, email, type } = {}) =>
    UserService.updateUserDetails(
      {
        username,
        password,
        emailAddress: email,
        userType: type,
      },
      user,
      null,
      true,
    );

  static loadAllLanguages = async () => {
    let languages = List();
    const result = await new LanguageService().searchAll(Map({}), null, true);

    try {
      result.event.subscribe(info => {
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
    const result = await new TableStateService().searchAll(Map({}), null, true);

    try {
      result.event.subscribe(info => {
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
    const result = await new OrderStateService().searchAll(Map({}), null, true);

    try {
      result.event.subscribe(info => {
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
    const result = await new RestaurantService().searchAll(Map({ language: 'en_NZ', conditions: Map({ ownedByUser: user, name }) }), null, true);

    try {
      result.event.subscribe(info => {
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
      null,
      true,
    );

    try {
      result.event.subscribe(info => {
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
    const result = await new TagService().searchAll(Map({ language: 'en_NZ', conditions: Map({ ownedByUser: user, name }) }), null, true);

    try {
      result.event.subscribe(info => {
        tags = tags.push(info);
      });

      await result.promise;
    } finally {
      result.event.unsubscribeAll();
    }

    return tags;
  };

  static loadAllDietaryOptions = async (user = {}, { tagId } = {}) => {
    let dietaryOptions = List();
    const result = await new DietaryOptionService().searchAll(Map({ conditions: Map({ ownedByUser: user, tagId }) }), null, true);

    try {
      result.event.subscribe(info => {
        dietaryOptions = dietaryOptions.push(info);
      });

      await result.promise;
    } finally {
      result.event.unsubscribeAll();
    }

    return dietaryOptions;
  };

  static loadAllSizes = async (user = {}, { tagId } = {}) => {
    let sizes = List();
    const result = await new SizeService().searchAll(Map({ conditions: Map({ ownedByUser: user, tagId }) }), null, true);

    try {
      result.event.subscribe(info => {
        sizes = sizes.push(info);
      });

      await result.promise;
    } finally {
      result.event.unsubscribeAll();
    }

    return sizes;
  };

  static loadAllServingTimes = async (user = {}, { tagId } = {}) => {
    let servingTimes = List();
    const result = await new ServingTimeService().searchAll(Map({ conditions: Map({ ownedByUser: user, tagId }) }), null, true);

    try {
      result.event.subscribe(info => {
        servingTimes = servingTimes.push(info);
      });

      await result.promise;
    } finally {
      result.event.unsubscribeAll();
    }

    return servingTimes;
  };

  static loadAllDishTypes = async (user = {}, { tagId } = {}) => {
    let dishTypes = List();
    const result = await new DishTypeService().searchAll(Map({ conditions: Map({ ownedByUser: user, tagId }) }), null, true);

    try {
      result.event.subscribe(info => {
        dishTypes = dishTypes.push(info);
      });

      await result.promise;
    } finally {
      result.event.unsubscribeAll();
    }

    return dishTypes;
  };

  static loadAllChoiceItems = async (user, { name, description } = {}) => {
    let choiceItems = List();
    const result = await new ChoiceItemService().searchAll(
      Map({ language: 'en_NZ', conditions: Map({ ownedByUser: user, name, description }) }),
      null,
      true,
    );

    try {
      result.event.subscribe(info => {
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
      Map({ include_choiceItem: true, conditions: Map({ addedByUser: user, choiceItemId, doesNotExist_removedByUser: true }) }),
      null,
      true,
    );

    try {
      result.event.subscribe(info => {
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
    const result = await new MenuItemService().searchAll(Map({ language: 'en_NZ', conditions: Map({ ownedByUser: user, name }) }), null, true);

    try {
      result.event.subscribe(info => {
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
      null,
      true,
    );

    try {
      result.event.subscribe(info => {
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
    const result = await new MenuService().searchAll(Map({ language: 'en_NZ', conditions: Map({ ownedByUser: user, name }) }), null, true);

    try {
      result.event.subscribe(info => {
        menus = menus.push(info);
      });

      await result.promise;
    } finally {
      result.event.unsubscribeAll();
    }

    return menus;
  };

  static loadOneOffData = async (data, columns, oneOffDataFunc) => {
    const usernames = data
      .filterNot(rawRow => rawRow.every(row => row.trim().length === 0))
      .map(rawRow => Common.extractColumnsValuesFromRow(columns, Immutable.fromJS(rawRow)).get('username'))
      .toSet();
    const results = await Promise.all(
      usernames
        .map(async username => {
          const user = await Common.getUser(username);

          return Map({ username, user }).merge(oneOffDataFunc ? await oneOffDataFunc() : Map());
        })
        .toArray(),
    );

    return results.reduce((reduction, result) => reduction.set(result.get('username'), result.delete('username')), Map());
  };

  static getMultiLanguagesFieldValue = (fieldName, values) => {
    const en_NZ_Value = values.get(`en_NZ_${fieldName}`);
    const zh_Value = values.get(`zh_${fieldName}`);
    const jp_Value = values.get(`jp_${fieldName}`);

    return ImmutableEx.removeNullAndUndefinedProps(
      Map({
        en_NZ: en_NZ_Value ? en_NZ_Value : undefined,
        zh: zh_Value ? zh_Value : undefined,
        jp: jp_Value ? jp_Value : undefined,
      }),
    );
  };
}
