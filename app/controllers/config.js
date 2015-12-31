var shush = require('shush'),
        _ = require('lodash'),
     util = require('util'),
	 path = require('path');

var Config = function(bot) {
	var self = this;

	self.load = function() {
		var config = {
			rootPath:  path.dirname(require.main.filename)
		};
		config = _.extend(config,             shush(config.rootPath + '/config'));
		config = _.extend(config, {commands:  shush(config.rootPath + '/commands')});
		return config;
	};

};

module.exports = Config;
