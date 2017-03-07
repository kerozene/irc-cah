var      util = require('util'),
            c = require('irc-colors'),
            _ = require('lodash'),
       moment = require('moment'),
    utilities = require('../utilities'),
        Decks = require('../controllers/decks'),
        Cards = require('../controllers/cards'),
         Card = require('../models/card');

                require('moment-duration-format');

var p; // default prefix char from config

/**
 * Available states for game
 * @type {{STOPPED: string, STARTED: string, PLAYABLE: string, PLAYED: string, ROUND_END: string, WAITING: string}}
 */
var STATES = {
    STOPPED:   'Stopped',
    PLAYABLE:  'Playable',
    PLAYED:    'Played',
    ROUND_END: 'RoundEnd',
    WAITING:   'Waiting',
    PAUSED:    'Paused'
};

// TODO: Implement the ceremonial haiku round that ends the game
var HAIKU = new Card({
    "id": 1234567,
    "numResponses": 3,
    "text": "(Draw 2, Pick 3) Make a haiku.",
    "displayText": "(Draw 2, Pick 3) Make a haiku."
}, 'q');

/**
 * A single game object that handles all operations in a game
 * @param {Object}    bot                - The main Bot object
 * @param {Object}   [options]           - Game initialisation options: points, decks, init
 * @param {number}   [options.points]    - The number of points needed to win
 * @param {string[]} [options.decks]     - The codes of card decks to load: ['CODE1', 'CODE2', ...]
 * @param {boolean}  [options.init=true] - Whether to initialise the game immediately
 * @constructor
 */
var Game = function Game(bot, options) {
    var    self = this,
      decksTool = new Decks(bot),
        channel = bot.channel,
         client = bot.client,
         config = bot.config;

    options = options || {};
    if (options.init === undefined)
        options.init = true; // pass false for testing

    // properties
    self.loaded = false; // did init() complete successfully
    self.noCzar = options.noCzar || false; // is this a voting game (without czar)
    self.decks = {};
    self.deckCodes = [];
    self.round = 0; // round number
    self.players = []; // list of players
    self.removed = []; // people who are not allowed to join
    self.left = []; // people who left the game and might rejoin
    self.channel = channel; // the channel this game is running on
    self.client = client; // reference to the irc client
    self.config = config; // configuration data
    self.STATES = STATES;
    self.state = STATES.WAITING; // game state storage
    self.timers = {}; // game timers
    self.listeners = []; // irc client event listeners
    self.pauseState = []; // pause state storage
    self.points = [];
    self.pointLimit = options.points || 0; // point limit for the game, defaults to 0 (== no limit)
    self.winner = {}; // store the winner of the current round
    self.lastWinner = {}; // store the streak count of the last winner
    self.lastJoinRound = 0; // store the last round number in which a player joined
    self.coolOff = false;
    p = config.commandPrefixChars[0]; // default prefix char

    self.init = function() {
        self.startTime = new Date();
        if (!self.initCards())
            return false;
        self.toggleListeners([
            ['joinsync' + channel, self.channelRejoinHandler   ],
            ['selfpart' + channel, self.channelLeaveHandler    ],
            ['selfkick' + channel, self.channelLeaveHandler    ],
            [    'quit' + channel, self.playerQuitHandler      ],
            [    'kill' + channel, self.playerQuitHandler      ],
            [    'part' + channel, self.playerPartHandler      ],
            [    'kick' + channel, self.playerKickHandler      ],
            [    'nick' + channel, self.playerNickChangeHandler]
        ]);
        self.setTopic(config.topic.messages.on);
        self.announce();
        self.nextRound();
        self.loaded = true;
        return true;
    };

    self.compileDecksList = function(args) {
        var decks = [];
        var failDecks = [];
        var removeDecks = [];
        var origArgs = args.slice();
        args = utilities.arrayToUpperCase(args);
        _.every(args, function(arg) {
            if (arg[0] === '~') {
                var groupData = decksTool.getDecksFromGroup(arg);
                if (groupData.length)
                    decks = decks.concat(groupData);
                else
                    failDecks.push(arg);
                args = _.without(args, arg);
                return true;
            }
            return false;
        });
        if (args.length) {
            _.every(args, function(arg) {
                if (arg[0] === '+' || arg.match(/^\w{5}$/)) {
                    arg = _.trimStart(arg, '+');
                    if (_.includes(config.decks, arg)) {
                        decks.push(arg);
                    }
                    else
                        failDecks.push(arg);
                    args = _.without(args, '+' + arg);
                    return true;
                }
                return false;
            });
        }
        if (args.length) {
            _.every(args, function(arg) {
                if (arg[0] === '-') {
                    arg = _.trimStart(arg, '-');
                    if (_.includes(config.decks, arg)) {
                        removeDecks.push(arg);
                    }
                    else
                        failDecks.push(arg);
                    args = _.without(args, '-' + arg);
                    return true;
                }
                return false;
            });
            failDecks.push.apply(this, args);
        }
        if (failDecks.length)
            self.say(util.format('Could not recognise: %s', failDecks.join(', ')));
        decks = _.difference(decks, removeDecks);
        return decks;
    };

    self.initCards = function() {
        var defaultDecks = self.compileDecksList(['~default']);
        if (self.isChristmas())
            defaultDecks = defaultDecks.concat(self.compileDecksList(['~christmas']));

        decks = (options.decks && options.decks.length) ? self.compileDecksList(options.decks) : defaultDecks;

        var loadDecks = _.filter(bot.decks, function(loadDeck) {
            return _.includes(decks, loadDeck.code);
        });
        var questions = Array.prototype.concat.apply([], _.map(loadDecks, 'calls'));
        var answers   = Array.prototype.concat.apply([], _.map(loadDecks, 'responses'));
        self.deckCodes = Array.prototype.concat.apply([], _.map(loadDecks, 'code'));

        if (!questions.length || !answers.length) {
            self.say('No decks loaded. Stopping...');
            self.stop();
            return false;
        }

        // init decks
        self.decks = {
            question: new Cards(questions, 'q'),
            answer:   new Cards(answers, 'a')
        };

        // init discard piles
        self.discards = {
            question: new Cards(),
            answer:   new Cards()
        };
        // init table slots
        self.table = {
            question: null,
            answer: []
        };
        // shuffle decks
        self.decks.question.shuffle();
        self.decks.answer.shuffle();

        bot.log(util.format('Loaded %d decks (%s): %d questions, %d answers',
            loadDecks.length,
            _.map(loadDecks, 'code').join(', '),
            questions.length,
            answers.length
        ));
        self.say(util.format('Loaded %d decks: %d questions, %d answers', loadDecks.length, questions.length, answers.length));
        return true;
    };

    /**
     * Trash game object
     */
    self.destroy = function() {
        // Destroy game properties
        delete self.players;
        delete self.config;
        delete self.client;
        delete self.channel;
        delete self.round;
        delete self.decks;
        delete self.discards;
        delete self.table;
    };

    /**
     * Stop game
     */
    self.stop = function (player, pointLimitReached) {
        _.each(self.timers.round, function(timer) {
            clearTimeout(timer);
        });
        _.each(self.timers, function(timer) {
            clearTimeout(timer);
        });
        self.toggleListeners();
        self.state = STATES.STOPPED;

        if (player)
            self.say(util.format('%s stopped the game.', player.nick));
        else if (pointLimitReached !== true) {
            self.say('Game has been stopped.');
            self.setTopic(config.topic.messages.off);
        }
        if (self.round > 1) {
            var duration = moment.duration( moment().diff(moment(self.startTime)) )
                                 .format('d [days] h [hours] m [minutes]');
            self.say(util.format('Game lasted %s', duration));
            self.showPoints();
        }

        if (self.config.voicePlayers === true)
            client.setChanMode(channel, '-v', self.getPlayerNicks());

        bot.game = undefined;
        setTimeout(self.destroy, 2000);
    };

    /**
     * Is the game paused?
     */
    self.isPaused = function() {
        return ( self.STATES.PAUSED === self.state );
    };

    /**
     * Can the game be paused?
     */
    self.isRunning = function() {
        return _.includes([
                    self.STATES.PLAYABLE,
                    self.STATES.PLAYED,
                    self.STATES.ROUND_END
                ], self.state);
    };

    /**
     * Pause game
     */
    self.pause = function () {
        // check if game is already paused
        if (self.isPaused()) {
            return util.format('Game is already paused. Type %sresume to begin playing again.', p);
        }

        // only allow pause if game is in PLAYABLE or PLAYED state
        if (!self.isRunning()) {
            return 'The game cannot be paused right now.';
        }

        // store state and pause game
        var now = new Date();
        self.pauseState.state = self.state;
        self.pauseState.elapsed = now.getTime() - self.roundStarted.getTime();
        self.state = STATES.PAUSED;

        self.say(util.format('Game is now paused. Type %sresume to begin playing again.', p));

        self.stopRoundTimers();

        return '';
    };

    /**
     * Resume game
     */
    self.resume = function () {
        if (!self.isPaused()) {
            return 'The game is not paused.';
        }

        // resume game
        var now = new Date();
        var newTime = new Date();
        newTime.setTime(now.getTime() - self.pauseState.elapsed);
        self.roundStarted = newTime;
        self.state = self.pauseState.state;

        self.say('Game has been resumed.');

        if (self.state === STATES.PLAYED && !self.noCzar && !_.includes(self.players, self.czar)) {
            self.say('The Card Czar quit the game during pause. I will pick the winner on this round.');
            self.selectWinner(Math.round(Math.random() * (self.table.answer.length - 1)));
        }
        else
            self.startRoundTimers(self.pauseState.elapsed);
    };

    /**
     * Start next round
     */
    self.nextRound = function () {
        clearTimeout(self.timers.stop);

        if ( self.endGame() || self.needPlayers() )
            return false;

        if (self.round === 0) {
            self.players = _.shuffle(self.players);
            self.say(util.format('Starting in %s seconds. %s get ready!', config.timeBetweenRounds, self.getPlayerNicks().join(', ')));
            self.announceWinMode();
        }
        self.showPoints((self.round === 0) ? 'start' : 'round');
        self.state = STATES.PAUSED;
        self.timers.next = setTimeout(self.startNextRound, config.timeBetweenRounds * 1000);
    };

    /**
     * Start next round
     */
    self.startNextRound = function () {
        if (!self.isPaused())
            return false;

        if (self.round === 0)
            self.startTime = new Date();

        self.round++;

        if (self.needPlayers())
            return false;

        var roundNotice = util.format('Round %s!', c.bold(self.round));
        if (!self.noCzar) {
            self.setCzar();
            roundNotice += util.format (' %s is the Card Czar.', self.czar.nick);
        }

        self.winner = {};
        self.say(roundNotice);
        self.deal();
        self.playQuestion();
        // show cards for all players (except czar)
        _.each(self.players, function (player) {
            if (player.isCzar !== true)
                self.showCards(player);
        });
    };

    /**
     * End game
     */
    self.endGame = function() {
        // check if any player reached the point limit
        if (self.pointLimit <= 0)
            return false;

        var winner = _.find(self.players, {points: self.pointLimit});
        if (!winner)
            return false;

        self.say(util.format('%s has reached %s awesome points and is the winner of the game! %s',
            c.bold(winner.nick), c.bold(self.pointLimit), c.bold('Congratulations!')));

        self.stop(null, true);

        // Add the winner to the channel topic if message is set
        self.setTopic(config.topic.messages.winner, {nick: winner.nick});
        return true;
    };

    /**
     * Wait for more players
     */
    self.needPlayers = function(silent) {
        // check that there's enough players in the game

        minPlayers = (self.round === 0) ? config.minPlayers : 3;

        var needed = minPlayers - self.players.length;
        if (needed <= 0)
            return 0;

        if (silent)
            return needed;

        // stop game if not enough players
        clearTimeout(self.timers.stop);
        self.timers.stop = setTimeout(self.stop, config.timeWaitForPlayers * 1000);
        if (self.round !== 0) {
            self.say(util.format('Need %s more player%s', needed, (needed == 1 ? '' : 's')));
            self.showPoints('round');
            self.state = STATES.WAITING;
        }
        return needed;
    };

    /**
     * Set a new czar
     * @returns Player The player object who is the new czar
     */
    self.setCzar = function (newCzar) {
        if (newCzar)
            self.say(util.format('%s is the new Card Czar.', newCzar.nick));
        else
            newCzar = self.players[self.players.indexOf(self.czar) + 1] || self.players[0];

        self.czar = newCzar;
        self.czar.isCzar = true;
        return self.czar;
    };

    /**
     * Deal a card to a player
     */
    self.dealCard = function (player) {
        self.checkDecks();
        if (self.decks.answer.cards.length === 0) {
            self.say('Not enough cards to deal. Stopping...');
            self.stop();
            return false;
        }
        var card = self.decks.answer.pickCards();
        player.cards.addCard(card);
        card.owner = player;
    };

    /**
     * Deal cards to fill players' hands
     */
    self.deal = function () {
        _.each(self.players, _.bind(function (player) {
            for (var i = player.cards.numCards(); i < 10; i++) {
                self.dealCard(player);
            }
        }, this));
    };

    /**
     * Discard cards and unset owner
     */
    self.cleanCards = function (cards) {
        _.each(cards.getCards(), _.bind(function (card) {
            delete card.owner;
            delete card.votes;
            self.discards.answer.addCard(card);
            cards.removeCard(card);
        }, this));
        return cards;
    };

    /**
     * Clean up table after round is complete
     */
    self.clean = function () {
        // move cards from table to discard
        self.discards.question.addCard(self.table.question);
        self.table.question = null;
//        var count = self.table.answer.length;
        _.each(self.table.answer, _.bind(function (cards) {
            self.cleanCards(cards);
        }, this));
        self.table.answer = [];

        // reset players
        var removed = [];
        _.each(self.players, function (player) {
            player.hasPlayed = false;
            player.voted = false;
            player.isCzar = false;
            delete player.picked;
            // check inactive count & remove after threshold
            if (player.inactiveRounds >= config.maxIdleRounds) {
                removed.push(player);
            }
        });
        if (removed.length > 0) {
            self.say(util.format('Removed inactive players: %s', _.map(removed, 'nick').join(', ')));
            self.removePlayers(removed, {silent: true});
        }
        if (self.players.length) {
            self.state = STATES.WAITING;
            self.nextRound();
        }
    };

    /**
     * Draw cards for players
     */
    self.drawCards = function(draw) {
        draw = draw || self.table.question.draw;
        _.each(_.filter(self.players, {isCzar: false}), function (player) {
            for (var i = 0; i < draw; i++) {
                self.checkDecks();
                var card = self.decks.answer.pickCards();
                player.cards.addCard(card);
                card.owner = player;
            }
        });
    };

    /**
     * Play new question card on the table
     */
    self.playQuestion = function () {
        self.checkDecks();
        self.state = STATES.PLAYABLE;

        var card = self.decks.question.pickCards();
        // replace all instance of %s with underscores for prettier output
        var value = card.displayText;
        // check if special pick & draw rules
        if (card.pick > 1)
            value += c.bold(util.format(' [PICK %s]', card.pick));
/*
        if (card.draw > 0)
            value += c.bold(util.format(' [DRAW %s]', card.draw));
*/

        self.say(util.format('%s %s', c.bold('CARD:'), value));
        self.table.question = card;
        self.drawCards();

        self.roundStarted = new Date();
        self.startRoundTimers();
    };

    /**
     * Play a answer card from players hand
     * @param cards card indexes in players hand
     * @param player Player who played the cards
     * @param fastPick whether this was a fastpick play
     */
    self.playCard = function (cards, player, fastPick) {
        cards = _.uniq(cards);

        if (self.isPaused())
            return (fastPick) ? false : 'Game is currently paused.';

        if (typeof player === 'undefined') {
            bot.warn('Invalid player tried to play a card');
            return util.format('You are not in the game. Do %sjoin to play.', p);
        }

        if (self.state !== STATES.PLAYABLE || player.cards.numCards() === 0)
            return (fastPick) ? false : 'Can\'t play at the moment.';

        if (player.isCzar)
            return 'You are the Card Czar. The Czar does not play. The Czar makes other people do their dirty work.';

        if (cards.length != self.table.question.pick) {
            // invalid card count
            var multi = (self.table.question.pick > 1) ? 'different cards' : 'card';
            return util.format('You must pick %s %s.', self.table.question.pick, multi);
        }
        if (player.picked) {
            self.notice(player.nick, 'Changing your pick...');
            self.table.answer = _.without(self.table.answer, player.picked.cards);

            // we need to re-add the cards in sorted order or they will mess up the array length
            _.each(player.picked.cards.getCards(), function(card, index) {
                card.pickedIndex = player.picked.indexes[index]; // add the picked index for sorting
            });
            player.picked.cards.cards = _.sortBy(player.picked.cards.cards, 'pickedIndex'); // sort
            _.each(player.picked.cards.getCards(), function(card, index) {
                player.cards.cards.splice(card.pickedIndex, 0, card); // re-add cards in sorted order
                delete card.pickedIndex; // sorting done, clean up the card
            });
        }
        var picked;
        try {
            picked = {
                indexes: cards,
                cards: player.cards.pickCards(cards)
            };
        } catch (error) {
            self.notice(player.nick, 'Invalid card index');
            return false;
        }
        self.table.answer.push(picked.cards);
        player.hasPlayed = true;
        player.inactiveRounds = 0;
        player.picked = picked;
        self.notice(player.nick, util.format(
            'You played: %s',
            self.getFullEntry(self.table.question, picked.cards.getCards())
        ));
        // show entries if all players have played
        if (self.checkAllPlayed() && !self.coolOff)
            self.coolOffPeriod(self.showEntries);

        return true;
    };

    self.coolOffPeriod = function(callback) {
        self.stopRoundTimers();
        self.timers.cooloff = setTimeout(function() {
            self.coolOff = false;
            callback();
        }, config.coolOffPeriod * 1000);

        if (config.coolOffPeriod > 0) {
            self.coolOff = true;

            var message = '%sYou now have %s seconds to change your %s.',
                prefix  = (self.state === self.STATES.PLAYED) ? util.format('%s: ', self.czar.nick) : '',
                pick    = (self.noCzar) ? 'vote' : 'pick';

            var lastRound = (self.lastJoinRound === 0) ? 1 : self.lastJoinRound;
            if (self.round <= self.lastJoinRound + 1)
                self.say(util.format(message, prefix, config.coolOffPeriod, pick));
        }
    };

    /**
     * Show the entries
     */
    self.showEntries = function () {
        self.stopRoundTimers();
        self.state = STATES.PLAYED;

        if (self.table.answer.length === 0) {
            self.say('No one played on this round.');
            self.clean();
            return;
        }

        if (self.table.answer.length === 1) {
            self.say('Only one player played and is the winner by default.');
            self.selectWinner(0, null);
            return;
        }

        if (self.table.answer.length === 2 && self.noCzar) {
            self.say('There are only two entries. Both win by default.');
            _.each(self.table.answer, function(answer) { answer.votes = 1; });
            self.tallyVotes();
            return;
        }

        self.say('OK! Here are the entries:');
        // shuffle the entries
        self.table.answer = _.shuffle(self.table.answer);
        _.each(self.table.answer, _.bind(function (cards, i) {
            self.say(util.format('%s: %s',
                i, self.getFullEntry(self.table.question, cards.getCards())
            ));
        }, this));

        var command = (config.enableFastPick) ? '' : util.format('%swinner ', p);

        if (self.noCzar) {
            self.say(util.format('Vote for the winner (/msg %s %s<entry number>)', bot.client.nick, command));
        } else {
            // check that czar still exists
            var currentCzar = _.find(self.players, {isCzar: true});
            if (typeof currentCzar === 'undefined') {
                // no czar, random winner (TODO: Voting?)
                self.say('The Card Czar has fled the scene. So I will pick the winner on this round.');
                self.selectWinner(Math.round(Math.random() * (self.table.answer.length - 1)));
                return;
            }
            self.say(util.format('%s: Select the winner (%s<entry number>)', self.czar.nick, command));
        }
        self.roundStarted = new Date();
        self.startRoundTimers();
    };

    /**
     * Start countdown timers for end of round when PLAYABLE or PLAYED
     * @param {number} elapsed     - time to subtract due to pausing
     * @param {Object} [callbacks]
     */
    self.startRoundTimers = function(elapsed, callbacks) {
        elapsed = elapsed || 0;

        // callbacks can be specified for any of the four stages
        callbacks = callbacks || {
            Playable: {
                warn1: function() { self.showStatus(); },
                final: function() {
                    self.markInactivePlayers();
                    self.showEntries();
                }
            },
            Played: {
                warn1: function() { if (self.noCzar) self.showStatus(); },
                final: function() {
                    if (self.noCzar) self.tallyVotes();
                    else             self.pickRandomWinner();
                }
            }
        };

        var timeLimit = (config.timeLimit * 1000) - elapsed;
        var offsets = { warn1: 60, warn2: 30, warn3: 10, final: 0 };

        // prefix warning messages with czar's nick if waiting for winner
        var prefix = (self.state === self.STATES.PLAYED && !self.noCzar) ? util.format('%s: ', self.czar.nick) : '';

        self.stopRoundTimers();

        _.each(['warn1', 'warn2', 'warn3', 'final'], function(stage) {

            var warning = (stage === 'final') ? util.format('%sTime is up!', prefix)
                                              : util.format('%s%s seconds left!', prefix, offsets[stage]);

            // omit timer if it would trigger (almost) immediately
            if (3000 >= timeLimit - (offsets[stage] * 1000))
                return;

            self.timers.round[stage] = setTimeout(function() {
                self.say(warning);
                if (callbacks[self.state][stage])
                    callbacks[self.state][stage]();
            }, timeLimit - (offsets[stage] * 1000));

        });
    };

    /**
     * Stop countdown timers
     */
    self.stopRoundTimers = function() {
        _.each(self.timers.round, function(timer) {
            clearTimeout(timer);
        });
        self.timers.round = {};
    };

     /**
      * Pick a random winner
      */
    self.pickRandomWinner = function() {
        self.say('I will pick the winner this round.');

        if (!self.noCzar)
            self.czar.inactiveRounds++;

        var index = Math.round(Math.random() * (self.table.answer.length - 1));
        self.selectWinner(index, null);
    };

     /**
      * Announce a winner of a round.
      * Called once if by czar, possibly repeated if by tied vote.
      * Also update the winner's owner's score.
      * @param  {object} [winner] - Card object from table.answer, with a vote property and an owner
      */
     self.announceWinner = function(winner) {
        winner = winner || self.winner;

        self.state = STATES.ROUND_END;

        var owner = winner.cards[0].owner;
        owner.points++;
        // update points object
        var playerPoints = _.find(self.points, {player: owner});
        if (playerPoints)
            playerPoints.points = owner.points; // player may have quit

        var votes = '';
        if (self.noCzar && winner.votes) {
            votes = util.format(' (with %s vote%s)',
                        winner.votes,
                        (winner.votes === 1) ? '' : 's'
                    );
        }

        var message = util.format(
            'Winner: %s%s -- "%s"',
            c.bold(owner.nick),
            votes,
            self.getFullEntry( self.table.question, winner.getCards() )
        );
        self.say(message);

        if (config.revealEntryOwners) {
            var entryOwners = [],
                entryNick;

            _.each(self.table.answer, function(entry, index) {
                entryNick = entry.cards[0].owner.nick;
                if (entryNick !== owner.nick)
                    entryOwners.push(util.format('%s - %s', index, entryNick));
            });
            message = util.format('Who played what: %s', entryOwners.join(', '));
            self.say(message);
        }
    };

    self.finishRound = function() {
        self.announceWinner();
        self.updateLastWinner();
        self.clean();
    };

    /**
     * Pick an entry that wins the round
     * @param index Index of the winning card in table list
     * @param player Player who said the command (use null for internal calls, to ignore checking)
     */
    self.selectWinner = function (index, player, fastPick) {
        if (self.isPaused()) {
            return 'Game is currently paused.';
        }

        if (self.state !== STATES.PLAYED)
            return false;

        var winner = self.table.answer[index];

        if (!winner)
            return 'Invalid winner.';

        if (self.noCzar && player) { // continue if voting timer ended without a vote (and called this without player arg)
            self.voteWinner(index, winner, player, fastPick);
            return;
        }

        if (player && player !== self.czar) {
            if (fastPick)
                return false;
            return 'You are not the Card Czar. Only the Card Czar can select the winner.';
        }

        if (!self.noCzar)
            self.stopRoundTimers();

        self.winner = winner;

        if (!player)
            self.finishRound();
        else if (!self.coolOff)
            self.coolOffPeriod(self.finishRound);
    };

    /**
     * Select winners from voting
     */
    self.tallyVotes = function() {
        self.stopRoundTimers();

        var winners = utilities.multipleMax(self.table.answer, 'votes');
        if (winners.length > 1) {
            if (!winners[0].votes) {
                self.say('Nobody voted.');
                self.pickRandomWinner();
                return;
            }
            self.say('We have a tie!');
        }
        _.each(winners, self.announceWinner);

        self.clean();
    };

    /**
     * Vote for winner
     */
    self.voteWinner = function(index, winner, player, fastPick) {
        var owner = winner.cards[0].owner;
        if (owner == player) {
            self.notice(player.nick, 'You can\'t vote for your own entry!');
            return false;
        }
        if (player.voted !== false) {
            if (player.voted == index) {
                self.notice(player.nick, 'You have already voted for that entry.');
                return false;
            }
            var oldVote = self.table.answer[player.voted];
            oldVote.votes--;
            self.notice(player.nick, 'Changing your vote...');
        }
        winner.votes = winner.votes || 0;
        winner.votes++;
        player.voted = index;

        self.notice(player.nick, util.format('You voted for: "%s"',
            self.getFullEntry( self.table.question, winner.getCards() )
        ));

        if (self.checkAllVoted() && !self.coolOff)
            self.coolOffPeriod(self.tallyVotes);
    };

    /**
     * Store streak info for last round winner.
     * @param {Object} [player]
     */
    self.updateLastWinner = function(player) {
        if (!player && !_.isEmpty(self.winner))
            player = self.winner.cards[0].owner;

        var message, uhost = utilities.getUhost(player);
        if ( _.isEmpty(self.lastWinner) || self.lastWinner.uhost !== uhost ) {
            self.lastWinner = {uhost: uhost, count: 1};
            return;
        }
        self.lastWinner.count++;
        switch (self.lastWinner.count) {
            case 2:
                message = _.template('Two in a row! Go <%= nick %>');
                break;
            case 3:
                message = _.template('That\'s three! <%= nick %>\'s on a roll.');
                break;
            case 4:
                message = _.template('Four in a row??? Who can stop this mad person?');
                break;
            case 5:
                message = _.template('<%= nick %>, I\'m speaking as a friend. It\'s not healthy to be this good at CAH.');
                break;
        }
        if (message)
            self.say(c.bold(message({nick: player.nick})));
    };

    /**
     * Get formatted entry
     * @param question
     * @param answers
     * @returns {*|Object|ServerResponse}
     */
    self.getFullEntry = function (question, answers) {
        var args = [];
        _.each(answers, _.bind(function (card, index) {
            var text = card.text;
            if (
                ( index === 0 && question.text[index] === '' ) || // if at the start
                question.text[index].match(/[!?"':] $/) ||        // or after certain punctuation
                question.text[index].match(/((?![\.]).)\. $/)     // after '. ' but not '.. '
            )
                text = card.displayText; // get capitalized version

            args.push(c.bold(text));

        }, this));
        return util.format.apply(null, [ question.text.join('%s') ].concat(args));
    };

    /**
     * Check if all active players played on the current round
     * @returns Boolean true if all players have played
     */
    self.checkAllPlayed = function () {
        return (self.getNotPlayed().length === 0);
    };

    /**
     * Check if all active players voted on the current round
     * @returns Boolean true if all players have voted
     */
    self.checkAllVoted = function () {
        return (self.getNotVoted().length === 0);
    };

    /**
     * Check if decks are empty & reset with discards
     */
    self.checkDecks = function () {
        // check answer deck
        if (self.decks.answer.numCards() === 0) {
            bot.log('answer deck is empty. reset from discard.');
            self.decks.answer.reset(self.discards.answer.reset());
            self.decks.answer.shuffle();
        }
        // check question deck
        if (self.decks.question.numCards() === 0) {
            bot.log('question deck is empty. reset from discard.');
            self.decks.question.reset(self.discards.question.reset());
            self.decks.question.shuffle();
        }
    };

    /**
     * Add a player to the game
     * @param player Player object containing new player's data
     * @returns The new player or false if invalid player
     */
    self.addPlayer = function (player) {
        if (_.includes(self.removed, utilities.getUhost(player)))
            return false;

        if (typeof self.getPlayer({user: player.user, hostname: player.hostname}) !== 'undefined') {
            bot.log('Player tried to join again', player.nick, player.user, player.hostname);
            return false;
        }

        var returningPlayer = _.find(self.left, {user: player.user, hostname: player.hostname});
        var pointsPlayer =    _.find(self.points, {user: player.user, hostname: player.hostname});

        if (returningPlayer) {
            player = returningPlayer;
            player.isCzar = (
                player === self.czar &&
                player.roundLeft === self.round &&
                _.includes([ self.STATES.PLAYABLE, self.STATES.PLAYED ], self.state)
            );
            player.hasPlayed = (player.hasPlayed && player.roundLeft === self.round);
            player.inactiveRounds = 0;
            pointsPlayer.player = player;
            player.points = pointsPlayer.points;
            player.roundJoined = self.round;
            delete player.roundLeft;
            self.left = _.without(self.left, returningPlayer);
            if (!player.isCzar)
                self.showCards(player);
        } else {
            // new player
            self.lastJoinRound = self.round;
            player.roundJoined = self.round;
            self.points.push({
                user:     player.user, // user and hostname are used for matching returning players
                hostname: player.hostname,
                player:   player, // reference to player object saved to points object as well
                points:   0
            });
        }

        self.players.push(player);

        self.say(util.format('%s has %sjoined the game.', player.nick, (returningPlayer) ? 're' : ''));

        var minPlayers = (self.round === 0) ? config.minPlayers : 3;
        var needed = (minPlayers - self.players.length);
        if ( needed > 0 &&
             ( self.round > 0 ||  _.now() > self.startTime.getTime() + 30 * 1000 )
        ) {
            self.say(util.format('Need %s more player%s', needed, (needed == 1 ? '' : 's')));
        }
        // check if waiting for players
        if (self.state === STATES.WAITING && needed <= 0) {
            // enough players, start the game
            self.nextRound();
        } else if (config.waitFromLastJoin) {
            clearTimeout(self.timers.stop);
            self.timers.stop = setTimeout(self.stop, config.timeWaitForPlayers * 1000);
        }
        if (self.config.voicePlayers === true) {
            self.client.setChanMode(channel, '+v', player.nick);
        }
        return player;
    };

    /**
     * Find player
     * @param search
     * @returns {*}
     */
    self.getPlayer = function (search) {
        return _.find(self.players, search);
    };

    /**
     * Remove player from game
     * @param player
     * @param options Extra options
     * @returns The removed player or false if invalid player
     */
    self.removePlayers = function (players, options) {
        options = _.extend({}, options);
        if (!players)
            return false;
        if (!_.isArray(players))
            players = [ players ];

        // remove players
        _.pullAll(self.players, players);

        _.each(players, function(player) {
            if ( _.includes(self.removed, utilities.getUhost(player)) && self.round > 0 ) {
                // player was manually kicked and can't rejoin - put player's cards to discard
                var cards = player.cards.reset();
                _.each(cards, function (card) {
                    self.discards.answer.addCard(card);
                });
            } else { // store the player's cards in case they rejoin
                player.roundLeft = self.round;
                self.left.push(player);
            }

            if (!options.silent)
                self.say(util.format('%s has left the game', player.nick));
        });


        if (self.config.voicePlayers === true && !options.left)
            self.client.setChanMode(channel, '-v', _.map(players, 'nick'));

        // check if remaining players have all played
        if (self.state === STATES.PLAYABLE && self.checkAllPlayed() && !self.coolOff)
            self.coolOffPeriod(self.showEntries);

        // check czar
        if (self.state === STATES.PLAYED && _.includes(players, self.czar)) {
            if (self.timers.cooloff) {
                clearTimeout(self.timers.cooloff);
                self.finishRound();
            } else {
                self.say('The Card Czar has fled the scene.');
                self.pickRandomWinner();
            }
        }

        if (self.players.length === 0 && config.stopOnLastPlayerLeave === true) {
            clearTimeout(self.timers.stop);
            self.stop();
        }

        return players;
    };

    /**
     * Get all player who have not played
     * @returns {object[]} list of Players that have not played
     */
    self.getNotPlayed = function () {
        return _.filter(self.players, function (player) {
            // check only players with cards (so players who joined in the middle of a round are ignored)
            return player.cards.numCards() > 0 &&
                   !player.hasPlayed && !player.isCzar;
        });
    };

    /**
     * Get all player who have not played
     * @returns {object[]} list of Players that have not played
     */
    self.getNotVoted = function () {
        return _.filter(self.players, function (player) {
            // check only players with cards (so players who joined in the middle of a round are ignored)
            return player.cards.numCards() > 0 &&
                   player.voted === false;
        });
    };

    /**
     * Check for inactive players
     */
    self.markInactivePlayers = function () {
        _.each(self.getNotPlayed(), _.bind(function (player) {
            if (player.roundJoined !== self.round)
                player.inactiveRounds++;
        }, this));
    };

    /**
     * Show players cards to player
     * @param player
     */
    self.showCards = function (player) {
        if (typeof player === 'undefined')
            return false;
        var cards = player.cards.getCards(),
            remainingCards = [],
            currentCard,
            message = 'Your cards are:',
            newMessage;
        _.each(cards, _.bind(function (card, index) {
             remainingCards.push(c.bold(util.format(' [%s] ', index)) + card.displayText);
        }, this));
        // split output if longer than allowed message length
        while (remainingCards.length) {
            currentCard = remainingCards.shift();
            newMessage = message + currentCard;
            if (newMessage.length > (self.client.opt.messageSplit - 4)) {
                self.notice(player.nick, util.format('%s ...', message));
                message = currentCard;
            } else {
                message = newMessage;
            }
        }
        self.notice(player.nick, message);
    };

    /**
     * Show points for all players
     */
    self.showPoints = function (stage) {
        var sortedPlayers = _.sortBy(self.points, function (point) {
            return -point.player.points;
        });
        var output = "";
        _.each(sortedPlayers, function (point) {
            if (self.getPlayer({nick: point.player.nick}))
                output += util.format('%s: %s, ', c.bold(point.player.nick), c.bold(point.points));
        });
        output = output.slice(0, -2);

        switch (stage) {

            case 'round':
                if (self.players.length)
                    self.say(util.format('Current scores: %s', output));

                if (self.pointLimit > 0)
                    self.say(util.format('Needed to win: %s', c.bold(self.pointLimit)));
                break;

            case 'start':
                if (self.pointLimit > 0)
                    self.say(util.format('Needed to win: %s', c.bold(self.pointLimit)));
                break;

            default:
                if (self.players.length)
                    self.say(util.format('The most horrible people: %s', output));
        }
    };

    /**
     * Show status
     */
    self.showStatus = function () {
        var message,
            playersNeeded = Math.max(0, config.minPlayers - self.players.length),
            notPlayed = self.getNotPlayed(),
            notVoted  = self.getNotVoted();

        switch (self.state) {
            case STATES.PLAYABLE:
                message = util.format('Waiting for players to play: %s', _.map(notPlayed, 'nick').join(', '));
                if (!self.noCzar)
                    message = util.format('%s is the Card Czar. ', self.czar.nick) + message;
                break;
            case STATES.PLAYED:
                message = (self.noCzar) ? util.format('Waiting for players to vote: %s', _.map(notVoted, 'nick').join(', '))
                                        : util.format('Waiting for %s to select the winner.', self.czar.nick);
                break;
            case STATES.ROUND_END:
                message = 'Round has ended and next one is starting.';
                break;
            case STATES.STOPPED:
                message = 'Game has been stopped.';
                break;
            case STATES.WAITING:
                message = util.format('Waiting for %s players to join.', playersNeeded);
                break;
            case STATES.PAUSED:
                message = 'Game is paused.';
                break;
        }
        self.say(util.format('%s %s', c.bold('Status:'), message));
    };

    /**
     * Get all player nicks in the current game
     */
    self.getPlayerNicks = function () {
        return _.map(self.players, 'nick');
    };

    /**
     * List all players in the current game
     */
    self.listPlayers = function () {
        return util.format('Players currently in the game: %s', self.getPlayerNicks().join(', '));
    };

    /**
     * Handle player quits
     * @param nick
     */
    self.playerQuitHandler = function (nick) {
        self.playerLeaveHandler(nick);
    };

    /**
     * Handle player parts
     * @param nick
     */
    self.playerPartHandler = function (nick) {
        self.playerLeaveHandler(nick);
    };

    /**
     * Handle player kicks
     * @param nick
     */
    self.playerKickHandler = function (nick) {
        self.playerLeaveHandler(nick);
    };

    /**
     * Handle player quits and parts
     * @param nick
     */
    self.playerLeaveHandler = function (nick) {
        var player = self.getPlayer({nick: nick});
        if (typeof player !== 'undefined')
            self.removePlayers(player, {left: true});
    };

    /**
     * Handle player nick changes
     * @param oldnick
     * @param newnick
     */
    self.playerNickChangeHandler = function (oldnick, newnick) {
        var player = self.getPlayer({nick: oldnick});
        if (typeof player !== 'undefined')
            player.nick = newnick;
    };

    /**
     * Pause game if leaving a channel
     */
    self.channelLeaveHandler = function() {
        if (self.isRunning()) {
            bot.warn(util.format('Left channel %s while game in progress. Pausing...', channel));
            self.pause();
        }
    };

    /**
     * On rejoining a channel with an active game
     */
    self.channelRejoinHandler = function() {
        if (self.isPaused()) {
            bot.log(util.format('Rejoined %s where game is paused.', channel));
            self.say(util.format('Card bot is back! Type %sresume to continue the current game.', p));
            return true;
        }
        if (self.isRunning()) {
            bot.warn(util.format('Error: Joined %s while game in progress', channel));
            self.say('Error: Joined while game in progress. Pausing...');
            self.pause();
            return false;
        }
        bot.warn(util.format('Error: Joined %s while game in state: %s', channel, self.state));
        return false;
    };

    /**
     * Manage IRC client event listeners
     */
    self.toggleListeners = function(listeners) {
        var onoff    = (typeof listeners !== 'undefined');
        var func     = (onoff) ? client.addListener : client.removeListener;
        listeners    = (onoff) ? listeners : self.listeners;

        _.each(listeners, function(listener) {
            func.apply(bot.client, listener);
        });
        self.listeners = (onoff) ? listeners : [];
    };

    /**
     * Notify users in channel that game has started
     */
    self.notifyUsers = function() {
        var withoutModes = ['o', 'v'];
        _.each(_(client.nicksInChannel(channel, withoutModes))
            .difference(self.getPlayerNicks())
            .without(client.nick)
            .value(), function(nick) {
                self.notice(nick, util.format(
                    '%s: A new game of Cards Against Humanity just began in %s. ' +
                    'Head over and %sjoin if you\'d like to get in on the fun!',
                    nick, channel, p
                ));
            }
        );
    };

    /**
     * Set the channel topic
     * @param addTopic
     * @param data
     */
    self.setTopic = function (addTopic, data) {
        var format, i, newTopic;

        if (typeof addTopic !== "string") {
            format = addTopic[1];
            addTopic = addTopic[0];
        }
        if (addTopic === "")
            return false;
        if (data)
            addTopic = _.template(addTopic)(data); // render template
        addTopic = addTopic.split('%%').join(p); // replace command prefix
        if (format) {
            var cformat = c;
            var doFormat = _.every(format.split('.'), function(f) {
                if (typeof cformat[f] !== 'function') {
                    bot.log(util.format('Invalid format: %s', format));
                    return false;
                }
                cformat = cformat[f];
                return true;
            });
            if (doFormat)
                addTopic = cformat(addTopic);
        }
        var sep = config.topic.separator;
        var topic = client.chanData(channel).topic || '';
        if (sep) {
            keep  = topic;
            switch (config.topic.position) {
                case 'left': // prepend the new topic item
                    i = topic.indexOf(sep);
                    if (i > -1)
                        keep = topic.slice(i + 1);
                    else
                        sep += ' ';
                    newTopic = [addTopic, keep].join(' ' + sep);
                    break;
                case 'right': // append the new topic item
                    i = topic.lastIndexOf(sep);
                    if (i > -1)
                        keep = topic.slice(0, i);
                    else
                        sep = ' ' + sep;
                    newTopic = [keep, addTopic].join(sep + ' ');
                    break;
            }
        } else
            newTopic = addTopic;
        if (newTopic !== topic)
            client.send('TOPIC', channel, newTopic);
    };

    /**
     * Public message to the game channel
     * @param string
     */
    self.say = function (string) {
        self.client.say(self.channel, string);
    };

    self.pm = function (nick, string) {
        self.client.say(nick, string);
    };

    self.notice = function (nick, string) {
        self.client.notice(nick, string);
    };

    self.announceWinMode = function() {
        var message = (self.noCzar) ? 'There is no Card Czar in this game. Winners are by vote. (%scstart for a game with czar)'
                                    : 'There is a Card Czar in this game. (%svstart for a voting game without czar)';
        self.say(util.format(message, p));
    };

    // announce the game on the channel
    self.announce = function() {
        var title = 'Cards Against Humanity';
        title = (self.isChristmas()) ? c.christmas(title)
                                     : c.rainbow(title);
        self.say(util.format('%s is starting! Type %sjoin to join the game any time. (%s players needed)', title, p, config.minPlayers));
        self.announceWinMode();

        if (config.notifyUsers)
            self.notifyUsers();
    };

    self.isChristmas = function(now) { // pass now for testing
        now = now || new Date();
        return (now.getMonth() == 11 && now.getDate() > 9);
    };

    c.christmas = function(str) {
        var j, s = 0;
        str = _.map(str, function(char, i) {
            if (char == ' ') s++;
            else {
                j = (i + s);
                char = (j % 2) ? c.green(char)
                               : c.red(char);
            }
            return char;
        });
        str = util.format('%s%s%s', c.yellow('*'), str.join(''), c.yellow('*'));
        return str;
    };

    if (options.init)
        self.init();

};

// export static state constant
Game.STATES = STATES;

exports = module.exports = Game;
