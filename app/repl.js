var    _ = require('lodash'),
    Game = require('./controllers/game');

module.exports = function(repl, bot) {
    var cmd = {};

    repl.context = _.extend(repl.context, {
        repl: repl,
        bot:  bot,
        conf: bot.config,
        irc:  bot.client,
        chan: bot.channel,
        c:    bot.controller.cmd
    });

    repl.defineCommand('game', {
        help: "Assign game object to 'g'",
        action: function() { repl.context.g = bot.game; }
    });

    repl.defineCommand('start', {
        help: "Start a game. [points] [deck, ...]",
        action: function(cmdArgs) {
            var points = bot.config.pointLimit;
            if (cmdArgs.length) {
                cmdArgs = cmdArgs.split(' ');
                if (cmdArgs[0] && !isNaN(cmdArgs[0])) {
                    points = parseInt(cmdArgs[0]);
                    cmdArgs = _.tail(cmdArgs);
                }
            }
            bot.game = new Game(bot, {points: points, decks: cmdArgs, init: true});
        }
    });

    cmd.say = function(message) {
        var target;
        if (message[0] === '@') {
            message = message.split(' ');
            target = message.shift();
            message = message.join(' ');
        }
        target = target || bot.channel;
        bot.client.say(target, message);
    };
    repl.defineCommand('say', {
        help: "Say message to channel or @nick",
        action: cmd.say
    });
    repl.defineCommand('s', {
        action: cmd.say
    });

    repl.defineCommand('act', {
        help: "Perform action in channel",
        action: function(message) {
            bot.client.action(bot.channel, message);
        }
    });

    repl.defineCommand('stop', {
        help: "Stop the game",
        action: function() { bot.game.stop(); }
    });

    repl.defineCommand('pause', {
        help: "Pause the game",
        action: function() { bot.game.pause(); }
    });

    repl.defineCommand('resume', {
        help: "Resume the game",
        action: function() { bot.game.resume(); }
    });

    cmd.kick = function(nick) {
        var cmd = bot.controller.cmd;
        var say = cmd.say;
        cmd.say = console.log;
        cmd.remove(null, [ nick ]);
        cmd.say = say;
    };
    repl.defineCommand('kick', {
        help: "Remove <nick>",
        action: cmd.kick
    });
    repl.defineCommand('k', {
        action: cmd.kick
    });

    repl.defineCommand('nicks', {
        help: "Get a list of nicknames in the channel",
        action: function() {
            nicks = _.without(bot.client.nicksInChannel(bot.channel), bot.client.nick, 'ChanServ');
            console.log(nicks.join(' '));
        }
    });

    repl.defineCommand('ircusers', {
        help: "Get a list of users in the channel",
        action: function() {
            users = _.filter(bot.client.chanData(bot.channel).users, function(user, nick) {
                return ! _.includes([ bot.client.nick, 'ChanServ' ], nick);
            });
            console.log(users);
        }
    });

    repl.defineCommand('users', {
        help: "Get a list of internal permanent users",
        action: function() {
            users = bot.users;
            console.log(users);
        }
    });

    repl.defineCommand('quit', {
        help: "Shut down the bot with optional <message>",
        action: function(message) {
            bot.shutdown(message);
        }
    });

/*
    repl.defineCommand('', {
        help: "",
        action: function() {
        }
    });
*/

};
