// import modules
var      _ = require('lodash'),
      util = require('util'),
    moment = require('moment'),
         c = require('irc-colors'),
     Decks = require('../controllers/decks'),
      Game = require('./game'),
    Player = require('../models/player');

var Cmd = function Cmd(bot) {
    var   self = this,
     decksTool = new Decks(),
        client = bot.client,
        config = bot.config,
       channel = bot.channel,
             p = config.commandPrefixChars[0];

    /**
     * Test if no game is running
     * @param silent - don't warn in the channel
     */
    self.noGame = function(silent) {
        if (bot.game)
            return false;
        if (!silent)
            self.sayNoGame();
        return true;
    };

    /**
     * Get the command data associated with 'alias'
     * @param alias
     */
    self.findCommand = function(alias) {
        return _.find(bot.commands, function(cmd) { return (_.includes(cmd.commands, alias)); });
    };

    /**
     * Say something in the game channel
     */
    self.say = function(message) {
        client.say(channel, message);
    };

    /**
     * Send a NOTICE
     */
    self.notice = function(target, message) {
        client.notice(target, message);
    };

    /**
     * Say there's no game running
     */
    self.sayNoGame = function () {
        self.say(util.format('No game running. Start the game by typing %sstart', p));
    };

    /**
     * Warn or return valid user
     */
    self.mustBeUser = function(nick) {
        var user = bot.controller.users.updateUserFromNick(nick);
        if (!user) {
            self.say('Only known users can use this command.');
            return undefined;
        }
        return user;
    };

    /**
     * Start a game
     * @param message
     * @param cmdArgs
     */
    self.start = function (message, cmdArgs) {
        var loadDecks = [],
            failDecks = [],
               points = config.pointLimit;

        if (bot.game) {
            if (bot.game.getPlayer({nick: message.nick}))
                self.say('You are already in the current game.');
            else
                self.say(util.format('A game is already running. Type %sjoin to join the game.', p));
            return false;
        }

        // point limit
        if (cmdArgs[0] && !isNaN(cmdArgs[0])) {
            points = parseInt(cmdArgs[0]);
            cmdArgs = _.rest(cmdArgs);
        }

        bot.game = new Game(bot, {points: points, decks: cmdArgs, init: true});
        if (bot.game.loaded)
            self.join(message, cmdArgs);
        else
            bot.game = undefined;
    };

    /**
     * Stop a game
     * @param message
     * @param cmdArgs
     */
    self.stop = function (message, cmdArgs) {
        if (self.noGame()) return;
        bot.game.stop(bot.game.getPlayer({user: message.user, hostname: message.host}));
        bot.game = undefined;
    };

    /**
     * Pause a game
     * @param message
     * @param cmdArgs
     */
     self.pause = function(message, cmdArgs) {
        if (self.noGame()) return;
        bot.game.pause();
     };

    /**
     * Resume a game
     * @param message
     * @param cmdArgs
     */
     self.resume = function(message, cmdArgs) {
        if (self.noGame()) return;
        bot.game.resume();
     };

    /**
     * Add player to game
     * @param message
     * @param cmdArgs
     */
    self.join = function (message, cmdArgs) {
        var     nick = message.nick,
                user = message.user,
            hostname = message.host;

        if (self.noGame(config.startOnFirstJoin)) {
            if (config.startOnFirstJoin)
                self.start(message, cmdArgs);
            return;
        }
        var player = new Player(nick, user, hostname);
        bot.game.addPlayer(player);
    };

    /**
     * Remove player from game
     * @param message
     * @param cmdArgs
     */
    self.quit = function (message, cmdArgs) {
        if (self.noGame()) return;
        bot.game.removePlayer(bot.game.getPlayer({user: message.user, hostname: message.host}));
    };

    /**
     * Remove a player
     * @param message
     * @param cmdArgs
     */
    self.remove = function (message, cmdArgs) {
        var target = cmdArgs[0];
        if (self.noGame()) return;

        var player = bot.game.getPlayer({nick: target});
        if (typeof(player) === 'undefined')
            self.say(target + ' is not currently playing.');
        else {
            bot.game.removed.push(bot.game.getPlayerUhost(player));
            bot.game.removePlayer(player);
        }
    };

    /**
     * Get players cards
     * @param message
     * @param cmdArgs
     */
    self.cards = function (message, cmdArgs) {
        if (self.noGame()) return;
        var player = bot.game.getPlayer({user: message.user, hostname: message.host});
        bot.game.showCards(player);
    };

    /**
     * Play cards
     * @param message
     * @param cmdArgs
     */
    self.play = function (message, cmdArgs) {
        if (self.noGame()) return;
        var player = bot.game.getPlayer({user: message.user, hostname: message.host});
        if (player)
            bot.game.playCard(cmdArgs, player);
    };

    /**
     * List players in the game
     * @param message
     * @param cmdArgs
     */
    self.list = function (message, cmdArgs) {
        if (self.noGame()) return;
        bot.game.listPlayers();
    };

    /**
     * Select the winner
     * @param message
     * @param cmdArgs
     */
    self.winner = function (message, cmdArgs) {
        if (self.noGame()) return;
        var player = bot.game.getPlayer({user: message.user, hostname: message.host});
        if (player)
            bot.game.selectWinner(cmdArgs[0], player);
    };

    /**
     * Show top players in current game
     * @param message
     * @param cmdArgs
     */
    self.points = function (message, cmdArgs) {
        if (self.noGame()) return;
        bot.game.showPoints();
    };

    /**
     * Show top players in current game
     * @param message
     * @param cmdArgs
     */
    self.status = function(message, cmdArgs) {
        if (self.noGame()) return;
        bot.game.showStatus();
    };

    /**
     * Alias command for winner and play
     * @param message
     * @param cmdArgs
     */
    self.pick = function (message, cmdArgs) {
        var user = message.user,
            hostname = message.host,
            fastPick = false;
        if (config.enableFastPick) {
            fastPick = cmdArgs[1];
            if (fastPick === true)
                cmdArgs = cmdArgs[0];
        }
        if (self.noGame(fastPick))
            return;

        var player = bot.game.getPlayer({user: user, hostname: hostname});
        if (!player)
            return false;

        if (bot.game.state === Game.STATES.PLAYED)
            bot.game.selectWinner(cmdArgs[0], player, fastPick);
        else if (bot.game.state === Game.STATES.PLAYABLE)
            bot.game.playCard(cmdArgs, player, fastPick);
        else
            fastPick || self.say(util.format('%spick command not available in current state.', p));
    };

    /**
     * Randomly choose between two picks
     * @param message
     * @param cmdArgs
     */
    self.coin = function(message, cmdArgs) {
        if (self.noGame() || !bot.game.isRunning())
            return false;

        var player = bot.game.getPlayer({user: message.user, hostname: message.host});
        if (!player)
            return false;

        var max = config.maxCoinUsesPerGame;
        if (max === 0) {
            self.say(util.format('%scoin is disabled.', p));
            return false;
        }

        if (player.coinUsed && player.coinUsed == max) {
            self.say(util.format('%s: You can only use %scoin %s time%s per game.',
                message.nick, p, max, (max > 1) ? 's' : ''));
            return false;
        }

        if (!player.isCzar && bot.game.table.question.pick > 1) {
            self.say(util.format('%s: You can\'t use %scoin on multiple pick questions',
                message.nick, p));
            return false;
        }

        if ( cmdArgs.length !== 2 ||
             _.some(cmdArgs, isNaN) ||
             cmdArgs[0] === cmdArgs[1]
        ) {
            self.say(util.format('%s: You must specify two different numbers.', message.nick));
            return false;
        }

        player.coinUsed = (player.coinUsed) ? player.coinUsed + 1 : 1;

        var coin = _.sample([0, 1]);
        var pick = cmdArgs[coin];
        self.say(util.format('%s: Flipping a coin - heads: %s, tails: %s ...it\'s %s! You picked %s',
            message.nick,
            cmdArgs[0],
            cmdArgs[1],
            (coin === 0) ? 'heads' : 'tails',
            pick
        ));
        self.pick(message, [ pick ]);
    };

    /**
     * Show game help
     * @param message
     * @param cmdArgs
     */
    self.help = function(message, cmdArgs) {
        var help;
        if (cmdArgs[0] === undefined) {
            // list commands and aliases
            var commands = _.map(config.commands, function(cmd) {
                                if (cmd.hidden)
                                    return null;
                                var result = p + cmd.commands[0];
                                if (cmd.commands.length > 1) {
                                    var aliases =  _.chain(cmd.commands)
                                                    .rest()
                                                    .map(function(a) { return p + a; })
                                                    .join(', ');
                                    result += util.format(' (%s)', aliases);
                                }
                                return result;
                            });
            help = 'Commands: ' + commands.join('; ') + util.format(' [%shelp <command> for details]', p);
        } else {
            // single command details
            var alias = cmdArgs[0].toLowerCase();
            var cmd = self.findCommand(alias);
            if (!cmd || cmd.hidden) {
                self.say(util.format('No command "%s%s"', p, alias));
                return;
            }
            help = p + cmd.commands[0];
            _.each(cmd.params, function(param) {
                var paramHelp = param.name;
                if (param.type === 'number')
                    paramHelp += 'Number';
                if (param.multiple)
                    paramHelp += ', ...';
                paramHelp = (param.required) ? util.format('<%s>', paramHelp)
                                             : util.format('[%s]', paramHelp);
                help += ' ' + paramHelp;
            });
            help += ' - ';
            if (cmd.flag && cmd.flag === 'o')
                help += '(op) ';
            help += cmd.info.split('%%').join(p);
            if (cmd.commands.length > 1)
                help += util.format(' (aliases: %s)', _.chain(cmd.commands)
                                                        .rest()
                                                        .map(function(a) { return p + a; })
                                                        .join(', '));
        }
        self.say(help);
    };

    /**
     * Send someone a NOTICE to help them test their client
     * @param message
     * @param cmdArgs
     */
    self.test = function(message, cmdArgs) {
        client.notice(message.nick, 'Can you hear me now?');
    };

    /**
     * Send beer
     * @param message
     * @param cmdArgs
     */
    self.beer = function (message, cmdArgs)
    {
        var nicks     = [ message.nick ],
            beer = [], action = '', beerToBot = false, reply = '',
            maxNicks  = _.min([config.beers.length, 7]);
        var actions = [
            'pours a tall, cold glass of <%= beer %> and slides it down the bar to <%= nick %>',
            'cracks open a bottle of <%= beer %> for <%= nick %>',
            'pours a refreshing pint of <%= beer %> for <%= nick %>',
            'slams a foamy stein of <%= beer %> down on the table for <%= nick %>'
        ];
        var plurals = {
            'tall, cold glasses': 'a tall, cold glass',
            'bottles':            'a bottle',
            'refreshing pints':   'a refreshing pint',
            'foamy steins':       'a foamy stein',
            'them':               'it'
        };
        var listToString = function(list) {
            var last = list.pop();
            return (list.length) ? list.join(', ') + ' and ' + last : last;
        };

        if (cmdArgs[0] == 'all' && bot.game)
            nicks = bot.game.getPlayerNicks();
        else if (cmdArgs.length)
            nicks = cmdArgs;

        if (_.isEqual(nicks, [ client.nick ])) {
            reply = _.template('pours itself a tall, cold glass of <%= beer %>. cheers, <%= from %>!');
            client.action(channel, reply({
                beer: _.sample(config.beers, 1)[0],
                from: message.nick,
                nick: client.nick
            }));
            return true;
        }
        nicks = _(nicks).uniq().map(function (nick) {
            if (client.nick == nick)
                beerToBot = true;
            else if (client.nickIsInChannel(nick, channel))
                return nick;
        }).compact().value();
        if (nicks.length > maxNicks) {
            self.say("There's not enough beer!");
            return false;
        }
        if (!nicks.length)
            return false;
        action = _.sample(actions, 1)[0];
        if (nicks.length > 1) {
            _.each(plurals, function(one, many) { // value, key
                action = action.split(one).join(many);
            });
        }
        reply = _.template(action);
        client.action(channel, reply({
            beer: listToString(_.sample(config.beers, nicks.length)),
            nick: listToString(nicks)
        }));
        if (beerToBot) // pour for self last
            self.beer(reply, [ client.nick ]);
    };

    /**
     * List the card decks available
     * @param message
     * @param cmdArgs
     */
    self.decks = function(message, cmdArgs) {
        if (bot.game)
            return self.say(util.format('Current game decks (%sdeckinfo <code>): %s',
                                    p, bot.game.deckCodes.join(', ')));
        var defaultDecks = decksTool.getDecksFromGroup('~DEFAULT');
        var decks = _.map(config.decks, function(deck) {
            return (_.includes(defaultDecks, deck)) ? c.bold(deck) : deck;
        });
        var reply = util.format('Card decks available/%s (%sdeckinfo <code>): %s',
                                    c.bold('default'), p, decks.join(', '));
        var groups = _.keys(config.deckGroups);
        reply += util.format(' :: Groups (%sgroupinfo <tag>): %s', p, groups.join(', '));
        self.say(reply);
    };

    /**
     * Get information about a deck
     * @param message
     * @param cmdArgs
     */
    self.deckinfo = function(message, cmdArgs) {
        var data, deckCode = cmdArgs[0];

        if (!deckCode || !deckCode.match(/^\w{5}$/)) {
            self.say('Invalid deck code format: ' + cmdArgs[0]);
            return false;
        }
        else {
            deckCode = deckCode.toUpperCase();
            if (!_.includes(config.decks, deckCode)) {
                self.say('Deck ' + deckCode + ' is not enabled. If you really want it, yell about it.');
                return false;
            }
        }

        bot.controller.decks.fetchDeck(deckCode).then(function(data) {
            data.q = data.calls.length;
            data.a = data.responses.length;
            data = _.pick(data, 'name', 'description', 'created', 'author', 'q', 'a');
            data.url = 'https://www.cardcastgame.com/browse/deck/' + deckCode;
            if (typeof data.created === 'object')
                data.created = moment(data.created).format('YYYY-MM-DD');
            else if (typeof data.created == 'string')
                data.created = data.created.match(/^(\d{4}-\d{2}-\d{2})/)[1];
            var reply = util.format('%s: "%s" [%s/%s] by %s on %s (%s) - %s',
                            deckCode,
                            data.name,
                            c.bold(data.q),
                            data.a,
                            data.author,
                            data.created,
                            data.url,
                            data.description.split('\n')[0]
                        ).substring(0, 400);
            self.say(reply);
            return true;
        }, function(error) {
            if (error.name === 'NotFoundError')
                error.message = error.message.split('/').reverse()[0];
            util.log(error.name + ': ' + error.message);
            self.say('Error ' + error.name + ': ' + error.message);
            return false;
        });
    };

    self.compileGroupTags = function(tags, decks, reply) {
        var data = [], doTags = true;
        reply = reply || tags.join(', ');
        decks = decks || [];

        var getTagData = function(data, tag) {
            return data.concat(decksTool.getDecksFromGroup(tag, false));
        };
        var tagsFilter = function(d) { return (d[0] === '~'); };
        var decksFilter = _.negate(tagsFilter);

        data = _.reduce(tags, getTagData, data).concat(decks);

        if (!data.length)
            return reply;
        reply += util.format(' -> [%s]', data.join(', '));
        var newTags = _.filter(data, tagsFilter);
        var newDecks = _.filter(data, decksFilter);
        if (newTags.length)
            reply = self.compileGroupTags(newTags, newDecks, reply);
        return reply;
    };

    /**
     * Get information about a deck group
     * @param message
     * @param cmdArgs
     */
    self.groupinfo = function(message, cmdArgs) {
        var tag = '~' + _.trimLeft(cmdArgs[0], '~').toUpperCase();
        var tagInfo = self.compileGroupTags([ tag ]);
        if (tagInfo === tag) {
            self.say(util.format('Group tag not found: %s', tag));
            return false;
        }
        self.say(tagInfo);
    };

    /**
     * Highlight users who might want to play
     * @param  message
     * @param  cmdArgs
     */
    self.ping = function(message, cmdArgs) {
        if (bot.game && bot.game.isRunning())
            return false;

        var needed = (bot.game) ? bot.game.needPlayers(true) : 2;
        if (!needed)
            return false;

        var nicks = bot.client.nicksInChannel(bot.channel);
        nicks = _.filter(nicks, function(nick) {
            if (nick == bot.client.nick || nick == message.nick)
                return false;
            if ( bot.game && _.includes(bot.game.getPlayerNicks(), nick) )
                    return false;

            var user = bot.controller.users.updateUserFromNick(nick);
            if (!user)
                return false;

            return (user.data.away !== true && !user.data.doNotPing);
        }, self);
        if (!nicks.length) {
            self.say('There is no-one else available to play right now.');
            return false;
        }

        if (bot.lastUseOfPing) {
            var ready = moment(bot.lastUseOfPing).add(config.pingInterval, 'minutes');
            var wait = ready.diff(moment());
            if (wait > 0) {
                self.say(util.format('You can use %sping again in %s minutes.',
                    p, Math.ceil(moment.duration(wait).asMinutes())));
                return false;
            }
        }
        bot.lastUseOfPing = moment();

        self.say(util.format('%s is looking for players - %s more needed. Pinging %s (\'%shelp away\' to turn this off)',
                                message.nick, needed, nicks.join(', '), p));
        return true;
    };

    /**
     * Remove yourself from the .ping list
     * @param  message
     * @param  cmdArgs
     */
    self.away = function(message, cmdArgs) {
        var setting = (cmdArgs[0] && cmdArgs[0].toLowerCase() == 'forever') ? 'forever' : true;
        var user = self.mustBeUser(message.nick);
        if (user)
            user.data.doNotPing = setting;
        self.notice(message.nick, util.format('You have now been marked as away%s and will not be pinged by the bot. %s',
                                                (setting === 'forever') ? ' forever' : '', p,
                                                (setting === 'forever') ? '' :'(\'%saway forever\' to make this permanent)'));
    };

    /**
     * Add yourself back to the .ping list
     * @param  message
     * @param  cmdArgs
     */
    self.back = function(message, cmdArgs) {
        var user = self.mustBeUser(message.nick);
        if (user)
            delete user.data.doNotPing;
        self.notice(message.nick, util.format('You have now been marked as back and will be included in pings by the bot. ' +
                                                '(\'%saway forever\' to be marked away permanently)', p));
    };

    /**
     * Interpret 'gg'
     * @param  message
     * @param  cmdArgs
     */
    self.gg = function(message, cmdArgs) {
        var expansion = util.format('%s %s', _.sample(config.gg.adjectives), _.sample(config.gg.nouns));
        self.say(expansion);
    };

};

exports = module.exports = Cmd;
