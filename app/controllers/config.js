var shush = require('shush'),
        _ = require('lodash'),
     util = require('util'),
	 path = require('path');

var Config = function(bot) {
	var self = this;

	self.load = function() {
		var config = {
			rootPath:  path.normalize(__dirname + '/../..')
		};
		config = _.extend(config,             shush(config.rootPath + '/config.json'));
		config = _.extend(config, {commands:  shush(config.rootPath + '/commands.json')});
		return config;
	};

};

module.exports = Config;
