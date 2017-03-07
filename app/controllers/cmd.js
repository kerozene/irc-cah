// import modules
var      _ = require('lodash'),
      util = require('util'),
    moment = require('moment'),
         c = require('irc-colors'),
 utilities = require('../utilities'),
     Decks = require('../controllers/decks'),
      Game = require('./game'),
    Player = require('../models/player');

var Cmd = function Cmd(bot) {
    var   self = this,
     decksTool = new Decks(bot),
        client = bot.client,
        config = bot.config,
       channel = bot.channel,
             p = config.commandPrefixChars[0];

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
     * Allowed values for withprefix option
     * @readonly
     * @enum {string}
     */
    Withprefix = {
        yes:    'yes',
        no:     'no',
        /** only when the response is in public */
        public: 'public'
    };

    /**
     * Get a responder function that replies publicly or privately depending on origin
     * @param  {Object}     inbound - the incoming message object with nick and private flag
     * @param  {Object}     [options]
     * @param  {boolean}    [options.byNotice=false] - private response is via NOTICE (defaults to msg)
     * @param  {Withprefix} [options.withPrefix]  - response is prefixed with the incoming message's nick
     * @return {function}
     */
    self.getResponder = function(inbound, options) {
        var responder, prefix = false;
        options = options || {};

        if (!inbound)
            // sent from REPL
            return function(message) { bot.log(util.format('RESPONSE: %s', message)); };

        if (!options.withPrefix)
            options.withPrefix = 'public';

        if (options.withPrefix == 'yes' || (options.withPrefix == 'public' && !inbound.private))
            prefix = true;

        var getMessage = prefix ? function(message) { return util.format('%s: %s', inbound.nick, message); }
                                : function(message) { return message; };

        if (inbound.private) {
            if (options.byNotice)
                responder = function(message) { self.notice(inbound.nick, getMessage(message)); };
            else
                responder = function(message) { client.say(inbound.nick, getMessage(message)); };
        } else
            responder = function(message) { self.say(getMessage(message)); };

        return responder;
    };

    /**
     * Send a reply by NOTICE, msg or game channel depending on origin
     * @param  {Object}     inbound   - the incoming message object with nick and private flag
     * @param  {Object}     [options]
     * @param  {boolean}    [options.byNotice=false] - private response is via NOTICE (defaults to msg)
     * @param  {Withprefix} [options.withprefix]  - response is prefixed with the incoming message's nick
     * @param  {string}     outbound  - the message to send
     */
    self.reply = function(inbound, outbound, options) {
        self.getResponder(inbound, options)(outbound);
    };

    /**
     * Get the command data associated with 'alias'
     * @param alias
     */
    self.findCommand = function(alias) {
        return _.find(bot.commands, function(cmd) { return (_.includes(cmd.commands, alias)); });
    };

    /**
     * Test if no game is running
     * @param silent - don't warn in the channel
     */
    self.noGame = function(responder, silent) {
        if (bot.game)
            return false;
        if (!silent)
            self.sayNoGame(responder);
        return true;
    };

    /**
     * Say there's no game running
     * @param {function} [responder] - from self.getResponder()
     */
    self.sayNoGame = function (responder) {
        if (!responder)
            responder = function(message) { self.say(message); };

        responder(util.format('No game running. Start the game by typing %sstart', p));
    };

    /**
     * Warn or return valid user
     */
    self.mustBeUser = function(responder, nick) {
        var user = bot.controller.users.updateUserFromNick(nick);
        if (!user) {
            responder('Only known users can use this command.');
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
               points = config.pointLimit,
               noCzar;

        if (bot.game) {
            if (bot.game.getPlayer({nick: message.nick}))
                self.reply(message, 'You are already in the current game.');
            else
                self.reply(message, util.format('A game is already running. Type %sjoin to join the game.', p));
            return false;
        }

        switch (config.defaultWinMode) {
            case 'czar':
                noCzar = false;
                break;
            case 'vote':
                noCzar = true;
                break;
            default:
                throw new Error(util.format('Invalid option for config.defaultWinMode: %s', config.defaultWinMode));
        }

        if (cmdArgs[0] == '--noczar') {
            noCzar = true;
            cmdArgs = _.tail(cmdArgs);
        }

        if (cmdArgs[0] == '--withczar') {
            noCzar = false;
            cmdArgs = _.tail(cmdArgs);
        }

        // point limit
        if (cmdArgs[0] && !isNaN(cmdArgs[0])) {
            points = parseInt(cmdArgs[0]);
            cmdArgs = _.tail(cmdArgs);
        }

        bot.game = new Game(bot, {points: points, decks: cmdArgs, init: true, noCzar: noCzar});
        if (bot.game.loaded)
            self.join(message, cmdArgs);
        else
            bot.game = undefined;
    };

    /**
     * Start a game with voting (no czar)
     * @param message
     * @param cmdArgs
     */
    self.vstart = function (message, cmdArgs) {
        cmdArgs.unshift('--noczar');
        self.start(message, cmdArgs);
    };

    /**
     * Start a game with voting (no czar)
     * @param message
     * @param cmdArgs
     */
    self.cstart = function (message, cmdArgs) {
        cmdArgs.unshift('--withczar');
        self.start(message, cmdArgs);
    };

    /**
     * Stop a game
     * @param message
     * @param cmdArgs
     */
    self.stop = function (message, cmdArgs) {
        if (self.noGame(self.getResponder(message))) return;
        bot.game.stop(bot.game.getPlayer({user: message.user, hostname: message.host}));
        bot.game = undefined;
    };

    /**
     * Pause a game
     * @param message
     * @param cmdArgs
     */
     self.pause = function(message, cmdArgs) {
        var responder = self.getResponder(message);

        if (self.noGame(responder)) return;

        var response = bot.game.pause();
        if (response)
            responder(response);
     };

    /**
     * Resume a game
     * @param message
     * @param cmdArgs
     */
     self.resume = function(message, cmdArgs) {
        var responder = self.getResponder(message);

        if (self.noGame(responder)) return;

        var response = bot.game.resume();
        if (response)
            responder(response);
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

        if (self.noGame(self.getResponder(message), config.startOnFirstJoin)) {
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
        if (self.noGame(self.getResponder(message))) return;
        bot.game.removePlayers(bot.game.getPlayer({user: message.user, hostname: message.host}));
    };

    /**
     * Remove a player
     * @param message
     * @param cmdArgs
     */
    self.remove = function (message, cmdArgs) {
        var target = cmdArgs[0];
        if (self.noGame(self.getResponder(message))) return;

        var player = bot.game.getPlayer({nick: target});
        if (typeof(player) === 'undefined')
            self.reply(message, util.format('%s is not currently playing.', target));
        else {
            bot.game.removed.push(utilities.getUhost(player));
            bot.game.removePlayers(player);
        }
    };

    /**
     * Get players cards
     * @param message
     * @param cmdArgs
     */
    self.cards = function (message, cmdArgs) {
        if (self.noGame(self.getResponder(message))) return;
        var player = bot.game.getPlayer({user: message.user, hostname: message.host});
        bot.game.showCards(player);
    };

    /**
     * Play cards
     * @param message
     * @param cmdArgs
     */
    self.play = function (message, cmdArgs) {
        var responder = self.getResponder(message);

        if (self.noGame(responder)) return;

        var player = bot.game.getPlayer({user: message.user, hostname: message.host});
        if (player) {
            var response = bot.game.playCard(cmdArgs, player);
            if (response)
                responder(response);
        }
    };

    /**
     * List players in the game
     * @param message
     * @param cmdArgs
     */
    self.list = function (message, cmdArgs) {
        if (self.noGame()) return;

        self.reply(message, bot.game.listPlayers());
    };

    /**
     * Select the winner
     * @param message
     * @param cmdArgs
     */
    self.winner = function (message, cmdArgs) {
        var responder = self.getResponder(message);

        if (self.noGame(responder)) return;

        var player = bot.game.getPlayer({user: message.user, hostname: message.host});
        if (!player) return;

        if (bot.game.noCzar && !message.private) {
            responder(util.format('You must vote privately: /msg %s %s', bot.client.nick, cmdArgs[0]));
            return;
        }

        var response = bot.game.selectWinner(cmdArgs[0], player);
        if (response)
            responder(response);
    };

    /**
     * Show top players in current game
     * @param message
     * @param cmdArgs
     */
    self.points = function (message, cmdArgs) {
        if (self.noGame(self.getResponder(message))) return;
        bot.game.showPoints();
    };

    /**
     * Show top players in current game
     * @param message
     * @param cmdArgs
     */
    self.status = function(message, cmdArgs) {
        if (self.noGame(self.getResponder(message))) return;
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
        if (self.noGame(self.getResponder(message), fastPick))
            return;

        var player = bot.game.getPlayer({user: user, hostname: hostname});
        if (!player)
            return false;

        if (bot.game.state === Game.STATES.PLAYED)
            bot.game.selectWinner(cmdArgs[0], player, fastPick);
        else if (bot.game.state === Game.STATES.PLAYABLE)
            bot.game.playCard(cmdArgs, player, self.getResponder(message), fastPick);
        else
            fastPick || self.reply(message, util.format('%spick command not available in current state.', p));
    };

    /**
     * Randomly choose between two picks
     * @param message
     * @param cmdArgs
     */
    self.coin = function(message, cmdArgs) {
        if (self.noGame(self.getResponder(message)) || !bot.game.isRunning())
            return false;

        var player = bot.game.getPlayer({user: message.user, hostname: message.host});
        if (!player)
            return false;

        var max = config.maxCoinUsesPerGame;
        if (max === 0) {
            self.reply(message, util.format('%scoin is disabled.', p));
            return false;
        }

        if (player.coinUsed && player.coinUsed == max) {
            self.reply(message, util.format('%s: You can only use %scoin %s time%s per game.',
                message.nick, p, max, (max > 1) ? 's' : ''));
            return false;
        }

        if (bot.game.state != bot.game.STATES.PLAYED && bot.game.table.question.pick > 1) {
            self.reply(message, util.format('%s: You can\'t use %scoin on multiple pick questions',
                message.nick, p));
            return false;
        }

        if ( cmdArgs.length !== 2 ||
             _.some(cmdArgs, isNaN) ||
             cmdArgs[0] === cmdArgs[1]
        ) {
            self.reply(message, util.format('%s: You must specify two different numbers.', message.nick));
            return false;
        }

        player.coinUsed = (player.coinUsed) ? player.coinUsed + 1 : 1;

        var coin = _.sample([0, 1]);
        var pick = cmdArgs[coin];
        self.reply(message, util.format('%s: Flipping a coin - heads: %s, tails: %s ...it\'s %s! You picked %s',
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
                                                    .tail()
                                                    .map(function(a) { return p + a; })
                                                    .join(', ');
                                    result += util.format(' (%s)', aliases);
                                }
                                return result;
                            });
            help = util.format('Commands: %s [%shelp <command> for details]', commands.join('; '), p);
        } else {
            // single command details
            var alias = cmdArgs[0].toLowerCase();
            var cmd = self.findCommand(alias);
            if (!cmd || cmd.hidden) {
                self.reply(message, util.format('No command "%s%s"', p, alias));
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
                                                        .tail()
                                                        .map(function(a) { return p + a; })
                                                        .join(', '));
        }
        self.reply(message, help);
    };

    /**
     * Send someone a NOTICE to help them test their client
     * @param message
     * @param cmdArgs
     */
    self.test = function(message, cmdArgs) {
        self.reply(message, 'Sending you a test NOTICE...');
        self.notice(message.nick, 'Can you hear me now?');
    };

    /**
     * Send beer
     * @param message
     * @param cmdArgs
     */
    self.beer = function (message, cmdArgs)
    {
        var     nicks = [ message.nick ],
                 beer = [],
               action = '',
            beerToBot = false,
                reply = '',
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

        if (cmdArgs[0] == 'all' && bot.game)
            nicks = bot.game.getPlayerNicks();
        else if (cmdArgs.length)
            nicks = cmdArgs;

        if (_.isEqual(nicks, [ client.nick ])) {
            reply = _.template('pours itself a tall, cold glass of <%= beer %>. cheers, <%= from %>!');
            client.action(channel, reply({
                beer: _.sampleSize(config.beers, 1)[0],
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
            self.reply(message, "There's not enough beer!");
            return false;
        }
        if (!nicks.length)
            return false;
        action = _.sampleSize(actions, 1)[0];
        if (nicks.length > 1) {
            _.each(plurals, function(one, many) { // value, key
                action = action.split(one).join(many);
            });
        }
        reply = _.template(action);
        client.action(channel, reply({
            beer: utilities.arrayToSentence(_.sampleSize(config.beers, nicks.length)),
            nick: utilities.arrayToSentence(nicks)
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
            return self.reply(message, util.format('Current game decks (%sdeckinfo <code>): %s',
                                    p, bot.game.deckCodes.join(', ')
                   ));
        var defaultDecks = decksTool.getDecksFromGroup('~DEFAULT');
        var decks = _.map(config.decks, function(deck) {
            return (_.includes(defaultDecks, deck)) ? c.bold(deck) : deck;
        });
        var groups = _.keys(config.deckGroups);
        var reply = util.format('Card decks available/%s (%sdeckinfo <code>): %s :: Groups (%sgroupinfo <tag>): %s',
                                    c.bold('default'), p, decks.join(', '), p, groups.join(', '));
        self.reply(message, reply);
    };

    /**
     * Get information about a deck
     * @param message
     * @param cmdArgs
     */
    self.deckinfo = function(message, cmdArgs) {
        var data, deckCode = cmdArgs[0];

        if (!deckCode || !deckCode.match(/^\w{5}$/)) {
            self.reply(message, util.format('Invalid deck code format: %s', cmdArgs[0]));
            return false;
        }
        else {
            deckCode = deckCode.toUpperCase();
            if (!_.includes(config.decks, deckCode)) {
                self.reply(message, util.format('Deck %s is not enabled. If you really want it, yell about it.', deckCode));
                return false;
            }
        }

        bot.controller.decks.fetchDeck(deckCode).then(function(data) {
            data.q = data.calls.length;
            data.a = data.responses.length;
            data = _.pick(data, 'name', 'description', 'created', 'author', 'q', 'a');
            data.url = util.format('https://www.cardcastgame.com/browse/deck/%s', deckCode);
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
            self.reply(message, reply);
            return true;
        }, function(error) {
            if (error.name === 'NotFoundError')
                error.message = error.message.split('/').reverse()[0];
            util.log(util.format('%s: %s', error.name, error.message));
            self.reply(message, util.format('Error %s: %s', error.name, error.message));
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
        var tag = '~' + _.trimStart(cmdArgs[0], '~').toUpperCase();
        var tagInfo = self.compileGroupTags([ tag ]);
        if (tagInfo === tag) {
            self.reply(message, util.format('Group tag not found: %s', tag));
            return false;
        }
        self.reply(message, tagInfo);
    };

    /**
     * Highlight users who might want to play
     * @param  message
     * @param  cmdArgs
     */
    self.ping = function(message, cmdArgs) {
        if (bot.game && bot.game.isRunning())
            return false;

        var needed = (bot.game) ? bot.game.needPlayers(true) : (config.minPlayers - 1);
        if (!needed)
            return false;

        if (bot.lastUseOfPing) {
            var ready = moment(bot.lastUseOfPing).add(config.pingInterval, 'minutes');
            var wait = ready.diff(moment());
            if (wait > 0) {
                var waitRounded = Math.ceil(moment.duration(wait).asMinutes());
                var lastPingAgo = config.pingInterval - waitRounded;
                self.reply(message, util.format('Last %sping was about %s minute%s ago. Wait %s more minute%s to use it again.',
                    p, lastPingAgo, (lastPingAgo == '1') ? '' : 's', waitRounded, (waitRounded == 1) ? '': 's'));
                return false;
            }
        }
        bot.lastUseOfPing = moment();

        var nicks = bot.client.nicksInChannel(bot.channel);
        nicks = _.filter(nicks, _.bind(function(nick) {
            if (nick == bot.client.nick || nick == message.nick)
                return false;
            if ( bot.game && _.includes(bot.game.getPlayerNicks(), nick) )
                return false;

            if (nick.match(/(away|afk)[^\w]*$/i))
                return false;

            var user = bot.controller.users.updateUserFromNick(nick);
            if (!user)
                return false;

            return (user.data.away !== true && !user.data.doNotPing);
        }, self));
        if (!nicks.length) {
            self.reply(message, 'There is no-one else available to play right now.');
            return false;
        }

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
        var user = self.mustBeUser(self.getResponder(message), message.nick);
        if (user)
            user.data.doNotPing = setting;

        var reply = util.format('You have now been marked as away%s and will not be pinged by the bot.',
                                    (setting === 'forever') ? ' forever' : '');
        if (setting !== 'forever')
            reply += util.format(' (This will turn off when you rejoin the channel. Use \'%saway forever\' to make it permanent)', p);

        self.notice(message.nick, reply);
    };

    /**
     * Add yourself back to the .ping list
     * @param  message
     * @param  cmdArgs
     */
    self.back = function(message, cmdArgs) {
        var user = self.mustBeUser(self.getResponder(message), message.nick);
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
