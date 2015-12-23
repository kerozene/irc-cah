// import modules
var _ = require('underscore'),
    util = require('util'),
    Game = require('./game'),
    Player = require('../models/player'),
    config = require('../../config/config'),
    p = config.commandPrefixChars[0];

var Games = function Games() {
    var self = this;
    self.games = [];

    /**
     * Find a game by channel it is running on
     * @param channel
     * @returns {*}
     */
    self.findGame = function (channel) {
        return _.findWhere(self.games, {channel: channel});
    };

    /**
     * Say there's no game running
     * @param client
     * @param channel
     */
    self.sayNoGame = function (client, channel) {
        client.say(channel, util.format('No game running. Start the game by typing %sstart.', p));
    };

    /**
     * Start a game
     * @param client
     * @param message
     * @param cmdArgs
     */
    self.start = function (client, message, cmdArgs) {
        // check if game running on the channel
        var channel = message.args[0],
            nick = message.nick,
            user = message.user,
            hostname = message.host,
            game;

        game = self.findGame(channel);
        if (typeof game !== 'undefined') {
            // game exists
            if (game.getPlayer({nick: nick})) {
                client.say(channel, 'You are already in the current game.');
            } else {
                client.say(channel, util.format('A game is already running. Type %sjoin to join the game.', p));
            }
        } else {
            // init game
            game = new Game(channel, client, config, cmdArgs);
            self.games.push(game);
            self.join(client, message, cmdArgs)
        }

    };

    /**
     * Stop a game
     * @param client
     * @param message
     * @param cmdArgs
     */
    self.stop = function (client, message, cmdArgs) {
        var channel = message.args[0],
            user = message.user,
            hostname = message.host,
            game = self.findGame(channel);
        if (typeof game === 'undefined') {
            self.sayNoGame(client, channel);
        } else {
            game.stop(game.getPlayer({user: user, hostname: hostname}));
            self.games = _.without(self.games, game);
        }
    };

    /**
     * Pause a game
     * @param client
     * @param message
     * @param cmdArgs
     */
     self.pause = function(client, message, cmdArgs) {
         var channel = message.args[0],
            nick = message.nick,
            user = message.user,
            hostname = message.host,
            game = self.findGame(channel);
        if (typeof game === 'undefined') {
            self.sayNoGame(client, channel);
        } else {
            game.pause();
        }
     };

    /**
     * Resume a game
     * @param client
     * @param message
     * @param cmdArgs
     */
     self.resume = function(client, message, cmdArgs) {
         var channel = message.args[0],
            nick = message.nick,
            user = message.user,
            hostname = message.host,
            game = self.findGame(channel);
        if (typeof game === 'undefined') {
            self.sayNoGame(client, channel);
        } else {
            game.resume();
        }
     };

    /**
     * Add player to game
     * @param client
     * @param message
     * @param cmdArgs
     */
    self.join = function (client, message, cmdArgs) {
        var channel = message.args[0],
            nick = message.nick,
            user = message.user,
            hostname = message.host,
            game = self.findGame(channel);

        if (typeof game === 'undefined') {
            if (config.startOnFirstJoin === false) {
                self.sayNoGame(client, channel);
            } else {
                self.start(client, message, cmdArgs);
            }
        } else {
            var player = new Player(nick, user, hostname);
            game.addPlayer(player);
        }
    };

    /**
     * Remove player from game
     * @param client
     * @param message
     * @param cmdArgs
     */
    self.quit = function (client, message, cmdArgs) {
        var channel = message.args[0],
            user = message.user,
            hostname = message.host,
            game = self.findGame(channel);
        if (typeof game === 'undefined') {
            self.sayNoGame(client, channel);
        } else {
            game.removePlayer(game.getPlayer({user: user, hostname: hostname}));
        }
    };

    /**
     * Remove a player
     * @param client
     * @param message
     * @param cmdArgs
     */
    self.remove = function (client, message, cmdArgs) {
        var channel = message.args[0],
            game = self.findGame(channel),
            target = cmdArgs[0];
        if (typeof game === 'undefined') {
            self.sayNoGame(client, channel);
        } else {
            var player = game.getPlayer({nick: target});
            if (typeof(player) === 'undefined') {
                client.say(channel, target + ' is not currently playing.');
            } else {
                game.removePlayer(player);
            }
        }
    };

    /**
     * Get players cards
     * @param client
     * @param message
     * @param cmdArgs
     */
    self.cards = function (client, message, cmdArgs) {
        var channel = message.args[0],
            user = message.user,
            hostname = message.host,
            game = self.findGame(channel);
        if (typeof game === 'undefined') {
            self.sayNoGame(client, channel);
        } else {
            var player = game.getPlayer({user: user, hostname: hostname});
            game.showCards(player);
        }
    };

    /**
     * Play cards
     * @param client
     * @param message
     * @param cmdArgs
     */
    self.play = function (client, message, cmdArgs) {
        // check if everyone has played and end the round
        var channel = message.args[0],
            user = message.user,
            hostname = message.host,
            game = self.findGame(channel);
        if (typeof game === 'undefined') {
            self.sayNoGame(client, channel);
        } else {
            var player = game.getPlayer({user: user, hostname: hostname});
            if (typeof(player) !== 'undefined') {
                game.playCard(cmdArgs, player);
            }
        }
    };

    /**
     * Lisst players in the game
     * @param client
     * @param message
     * @param cmdArgs
     */
    self.list = function (client, message, cmdArgs) {
        var channel = message.args[0],
            game = self.findGame(channel);
        if (typeof game === 'undefined') {
            self.sayNoGame(client, channel);
        } else {
            game.listPlayers();
        }
    };

    /**
     * Select the winner
     * @param client
     * @param message
     * @param cmdArgs
     */
    self.winner = function (client, message, cmdArgs) {
        var channel = message.args[0],
            user = message.user,
            hostname = message.host,
            game = self.findGame(channel);
        if (typeof game === 'undefined') {
            self.sayNoGame(client, channel);
        } else {
            var player = game.getPlayer({user: user, hostname: hostname});
            if (typeof(player) !== 'undefined') {
                game.selectWinner(cmdArgs[0], player);
            }
        }
    };

    /**
     * Show top players in current game
     * @param client
     * @param message
     * @param cmdArgs
     */
    self.points = function (client, message, cmdArgs) {
        var channel = message.args[0],
            hostname = message.host,
            game = self.findGame(channel);
        if (typeof game === 'undefined') {
            self.sayNoGame(client, channel);
        } else {
            game.showPoints();
        }
    };

    /**
     * Show top players in current game
     * @param client
     * @param message
     * @param cmdArgs
     */
    self.status = function(client, message, cmdArgs) {
        var channel = message.args[0],
            game = self.findGame(channel);
        if (typeof game === 'undefined') {
            self.sayNoGame(client, channel);
        } else {
            game.showStatus();
        }
    };

    /**
     * Alias command for winner and play
     * @param client
     * @param message
     * @param cmdArgs
     */
    self.pick = function (client, message, cmdArgs)
    {
        // check if everyone has played and end the round
        var channel = message.args[0],
            user = message.user,
            hostname = message.host,
            game = self.findGame(channel),
            fastPick = false;
        if (config.enableFastPick) {
            fastPick = cmdArgs[1];
            if (fastPick === true) { cmdArgs = cmdArgs[0]; }
        }
        if (typeof game === 'undefined') {
            fastPick || self.sayNoGame(client, channel);
        } else {
            var player = game.getPlayer({user: user, hostname: hostname});

            if (typeof(player) !== 'undefined') {
                if (game.state === Game.STATES.PLAYED) {
                    game.selectWinner(cmdArgs[0], player, fastPick);
                } else if (game.state === Game.STATES.PLAYABLE) {
                    game.playCard(cmdArgs, player, fastPick);
                } else {
                    fastPick || client.say(channel, util.format('%spick command not available in current state.', p));
                }
            }
        }
    };

    /**
     * Show game help
     * @param client
     * @param message
     * @param cmdArgs
     */
    self.help = function(client, message, cmdArgs) {
        var channel = message.args[0],
            help = [
            "Commands: %%start [#] - start a game of # rounds",
            "%%join, %%j - join/start a game",
            "%%quit, %%q - leave the game",
            "# [#...] - pick number # (card or winning entry)",
            "%%test - get a test NOTICE from the bot",
            "other commands: %%cards, %%pick %p, %%play, %%winner %%w, %%beer [nick ...]|all, %%pause, %%resume, %%stop, %%remove <nick>"
        ];
        help = help.join('; ').split('%%').join(p);
        client.say(channel, help);
    };

    /**
     * Send someone a NOTICE to help them test their client
     * @param client
     * @param message
     * @param cmdArgs
     */
    self.test = function(client, message, cmdArgs) {
        var nick = message.nick;
        client.notice(nick, 'Can you hear me now?');
    };

    /**
     * Send beer
     * @param client
     * @param message
     * @param cmdArgs
     */
    self.beer = function (client, message, cmdArgs)
    {
        var channel  = message.args[0],
            user     = message.user,
            hostname = message.host,
            game     = self.findGame(channel),
            nicks    = [ message.nick ];

        var beerNicks = [], beer = [], action = '', message = '', beerToBot = false,
            maxNicks  = _.min([config.beers.length, 7]);
        var actions = [
            'pours a tall, cold glass of <%= beer %> and slides it down the bar to <%= nick %>.',
            'cracks open a bottle of <%= beer %> for <%= nick %>.',
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

        if (cmdArgs[0] == 'all' && game)
            nicks = game.getPlayerNicks();
        else if (cmdArgs.length)
            nicks = cmdArgs;

        if (_.isEqual(nicks, [ client.nick ])) {
            message = _.template('pours itself a tall, cold glass of <%= beer %>. cheers, <%= from %>!');
            client.action(channel, message({
                beer: _.sample(config.beers, 1)[0],
                from: message.nick,
                nick: client.nick
            }));
            return true;            
        }
        _.chain(nicks).uniq().each(function (nick) {
            if (client.nick == nick)
                beerToBot = true;
            else if (client.nickIsInChannel(nick, channel))
                beerNicks.push(nick);
        });
        if (beerNicks.length > maxNicks) {
            client.say(channel, "There's not enough beer!");
            return false;
        }
        if (beerNicks.length) {
            action = _.sample(actions, 1)[0];
            if (beerNicks.length > 1) {
                _.each(plurals, function(from, to) { // value, key
                    action = action.split(from).join(to);
                });
            }
            message = _.template(action);
            client.action(channel, message({
                beer: listToString(_.sample(config.beers, beerNicks.length)),
                nick: listToString(beerNicks)
            }));
        }
        if (beerToBot) // pour for self last
            self.beer(client, message, [ client.nick ]);
    };

};

exports = module.exports = Games;
