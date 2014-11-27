"use strict";

var autoload = require('auto-load');

var routes = autoload(__dirname + '/../lib/routes');

module.exports = function(app) {
  app.get('/', routes.index.get);
};
