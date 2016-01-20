var         _ = require('lodash'),
    utilities = require('../utilities');

var User = function User(bot, data) {
	var self = this;

	self.key = '';
	self.data = {};

	bot.users = bot.users || {};

	self.load = function() {
		self.key  = data.key;
		self.data = data.value;
		bot.users[self.key] = self;
	};

	self.store = function(storage) {
		var key = self.key.split('/').join('%%%');
		storage.setItem(key, self.data);
	};

	self.delete = function(storage) {
		delete bot.users[self.key];
		storage.removeItem(self.key);
	};

	self.load();
};

User.createFromIrcUser = function(bot, storage, nick, ircUser) {
    var key = utilities.getUserKey(ircUser);
    var data = _.cloneDeep(ircUser);
    var user = new User(bot, {key: key, value: data });
    user.store(storage);
    return user;
};

module.exports = User;
