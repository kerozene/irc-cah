var         _ = require('lodash'),
             fs = require('fs'),
         util = require('util'),
      Promise = require('bluebird'),
      storage = require('node-persist'),
    utilities = require('../utilities'),
         User = require('../models/user');

var Users = function Users(bot) {
    self = this;
    self.storage = storage.create({
        dir: fs.realpathSync('.') + '/users',
    });

    /**
     * @return {Promise}
     */
    self.init = function() {
        self.storage.init().then(function() {
            setTimeout(function() {
                self.loadAll();
                self.deleteNonUsers();
                bot.log(util.format('User storage: %s keys loaded', self.storage.length()));
            }, 100);
        }).catch(function(error) { throw error; });
    };

    self.storeAll = function() {
        _.each(bot.users, function(user) {
            user.store(self.storage);
        });
        util.log(util.format('Stored %s users', _.keys(bot.users).length));
    };

    self.loadAll = function() {
        var loaded = [];
        self.storage.forEach(function(key, value) {
            key = key.split('%%%').join('/');
            loaded.push(new User(bot, { key: key, value: value }));
        });
        util.log(util.format('Loaded %s users', loaded.length));
    };

    self.deleteNonUsers = function() {
        _.each(bot.users, function(user) {
            var uhost = utilities.getUhost(user.data);
            if (self.isNonUser(uhost)) {
                user.delete(self.storage);
                util.log('Deleted user: %s', uhost);
            }
        });
    };

    self.getIrcUserFromNick = function(nick) {
        var ircUser = bot.client.nickToUser(nick, bot.channel);
        if (!ircUser)
            throw new Error(util.format('Nick %s not found in channel %s', nick, bot.channel));
        return ircUser;
    };

    self.getUserFromIrcUser = function(ircUser) {
        var key = utilities.getUserKey(ircUser);
        return bot.users[key];
    };

    self.getUserFromNick = function(nick) {
        return self.getUserFromIrcUser(
                    self.getIrcUserFromNick(nick)
               );
    };

    self.isNonUser = function(identifier) {
        if (identifier.search('@') < 0) {
            if (bot.client.nick == identifier)
                return true;
            var ircUser = self.getIrcUserFromNick(identifier);
            identifier = util.format('%s!%s@%s', identifier, ircUser.username, ircUser.host);
        }
        else if (identifier.search('!') < 0)
            identifier = '!' + identifier;
        return _.some(bot.nonUsers, function(mask) {
            return utilities.maskMatch(identifier, mask);
        });
    };

    self.updateUserFromNick = function(nick) {
        if (self.isNonUser(nick))
            return undefined;

        var ircUser = self.getIrcUserFromNick(nick);
        var user = self.getUserFromNick(nick);
        if (user) {
            user.data = _.extend(user.data, ircUser);
            bot.users[user.key] = user;
            user.store(self.storage);
            return user;
        }
        user = User.createFromIrcUser(bot, self.storage, nick, ircUser);
        return user;
    };

};

module.exports = Users;
