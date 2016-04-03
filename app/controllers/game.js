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
      decksTool = new Decks(),
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
    self.lastWinner = {}; // store the streak count of the last winner
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
                    arg = _.trimLeft(arg, '+');
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
                    arg = _.trimLeft(arg, '-');
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
        var questions = Array.prototype.concat.apply([], _.pluck(loadDecks, 'calls'));
        var answers   = Array.prototype.concat.apply([], _.pluck(loadDecks, 'responses'));
        self.deckCodes = Array.prototype.concat.apply([], _.pluck(loadDecks, 'code'));

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
            _.pluck(loadDecks, 'code').join(', '),
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
        _.each(self.timers, function(timer) {
            clearTimeout(timer);
        });
        self.toggleListeners();
        self.state = STATES.STOPPED;

        if (player)
            self.say(player.nick + ' stopped the game.');
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
            self.say(util.format('Game is already paused. Type %sresume to begin playing again.', p));
            return false;
        }

        // only allow pause if game is in PLAYABLE or PLAYED state
        if (!self.isRunning()) {
            self.say('The game cannot be paused right now.');
            return false;
        }

        // store state and pause game
        var now = new Date();
        self.pauseState.state = self.state;
        self.pauseState.elapsed = now.getTime() - self.roundStarted.getTime();
        self.state = STATES.PAUSED;

        self.say(util.format('Game is now paused. Type %sresume to begin playing again.', p));

        // clear turn timers
        clearTimeout(self.timers.turn);
        clearTimeout(self.timers.winner);
    };

    /**
     * Resume game
     */
    self.resume = function () {
        if (!self.isPaused()) {
            self.say('The game is not paused.');
            return false;
        }

        // resume game
        var now = new Date();
        var newTime = new Date();
        newTime.setTime(now.getTime() - self.pauseState.elapsed);
        self.roundStarted = newTime;
        self.state = self.pauseState.state;

        self.say('Game has been resumed.');

        // resume timers
        if (self.state === STATES.PLAYED) {
            // check if czar quit during pause
            if (_.includes(self.players, self.czar))
                self.timers.winner = setInterval(self.winnerTimerCheck, 10 * 1000);
            else if (!self.noCzar) {
                // no czar
                self.say('The Card Czar quit the game during pause. I will pick the winner on this round.');
                // select winner
                self.selectWinner(Math.round(Math.random() * (self.table.answer.length - 1)));
            }
        } else if (self.state === STATES.PLAYABLE) {
            self.timers.turn = setInterval(self.turnTimerCheck, 10 * 1000);
        }
    };

    /**
     * Start next round
     */
    self.nextRound = function () {
        clearTimeout(self.timers.stop);

        if ( self.endGame() || self.needPlayers() )
            return false;

        if (self.round === 0) {
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
        var roundNotice = util.format('Round %s!', c.bold(self.round));
        if (!self.noCzar) {
            self.setCzar();
            roundNotice += util.format (' %s is the Card Czar.', self.czar.nick);
        }
        self.say(roundNotice);
        self.deal();
        self.playQuestion();
        self.state = STATES.PLAYABLE;
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

        var winner = _.findWhere(self.players, {points: self.pointLimit});
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
        if (self.players.length >= 3)
            return 0;
        var needed = 3 - self.players.length;
        // stop game if not enough players
        if (silent)
            return needed;

        self.timers.stop = setTimeout(self.stop, config.timeWaitForPlayers * 1000);
        if (self.round !== 0) {
            self.say('Need ' + needed + ' more player' + (needed == 1 ? '' : 's'));
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
        _.each(self.players, function (player) {
            for (var i = player.cards.numCards(); i < 10; i++) {
                self.dealCard(player);
            }
        }, this);
    };

    /**
     * Discard cards and unset owner
     */
    self.cleanCards = function (cards) {
        _.each(cards.getCards(), function (card) {
            delete card.owner;
            delete card.votes;
            self.discards.answer.addCard(card);
            cards.removeCard(card);
        }, this);
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
        _.each(self.table.answer, function (cards) {
            self.cleanCards(cards);
        }, this);
        self.table.answer = [];

        // reset players
        var removedNicks = [];
        _.each(self.players, function (player) {
            player.hasPlayed = false;
            player.voted = false;
            player.isCzar = false;
            delete player.picked;
            // check inactive count & remove after threshold
            if (player.inactiveRounds >= config.maxIdleRounds) {
                self.removePlayer(player, {silent: true});
                removedNicks.push(player.nick);
            }
        });
        if (removedNicks.length > 0) {
            self.say('Removed inactive players: ' + removedNicks.join(', '));
        }
        // reset state
        self.state = STATES.WAITING;
    };

    /**
     * Draw cards for players
     */
    self.drawCards = function(draw) {
        draw = draw || self.table.question.draw;
        _.each(_.where(self.players, {isCzar: false}), function (player) {
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
        var card = self.decks.question.pickCards();
        // replace all instance of %s with underscores for prettier output
        var value = card.displayText;
        // check if special pick & draw rules
        if (card.pick > 1)
            value += c.bold(' [PICK ' + card.pick + ']');
/*
        if (card.draw > 0)
            value += c.bold(' [DRAW ' + card.draw + ']');
*/

        self.say(c.bold('CARD: ') + value);
        self.table.question = card;
        self.drawCards();

        // start turn timer, check every 10 secs
        clearInterval(self.timers.turn);
        self.roundStarted = new Date();
        self.timers.turn = setInterval(self.turnTimerCheck, 10 * 1000);
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
            return fastPick || self.say('Game is currently paused.');

        if (typeof player === 'undefined')
            return bot.warn('Invalid player tried to play a card');

        if (self.state !== STATES.PLAYABLE || player.cards.numCards() === 0)
            return fastPick || self.say(player.nick + ': Can\'t play at the moment.');

        if (player.isCzar)
            return fastPick || self.say(player.nick +
                        ': You are the Card Czar. The Czar does not play. The Czar makes other people do their dirty work.');

        if (cards.length != self.table.question.pick) {
            // invalid card count
            var multi = (self.table.question.pick > 1) ? 'different cards' : 'card';
            return self.say(util.format('%s: You must pick %s %s.', player.nick, self.table.question.pick, multi));
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
        self.notice(player.nick, 'You played: ' + self.getFullEntry(self.table.question, picked.cards.getCards()));
        // show entries if all players have played
        if (self.checkAllPlayed())
            self.showEntries();

        return true;
    };

    /**
     * Show the entries
     */
    self.showEntries = function () {
        // clear round timer
        clearInterval(self.timers.turn);

        self.state = STATES.PLAYED;
        // Check if 2 or more entries...
        if (self.table.answer.length === 0) {
            self.say('No one played on this round.');
            // skip directly to next round
            self.clean();
            self.nextRound();
            return;
        }
        if (self.table.answer.length === 1) {
            self.say('Only one player played and is the winner by default.');
            self.selectWinner(0);
            return;
        }
        self.say('Everyone has played. Here are the entries:');
        // shuffle the entries
        self.table.answer = _.shuffle(self.table.answer);
        _.each(self.table.answer, function (cards, i) {
            self.say(i + ": " + self.getFullEntry(self.table.question, cards.getCards()));
        }, this);

        var command = (config.enableFastPick) ? '' : util.format('%swinner ');

        if (self.noCzar) {
            self.say(util.format('Vote for the winner (%s<entry number>)', command));
        } else {
            // check that czar still exists
            var currentCzar = _.findWhere(this.players, {isCzar: true});
            if (typeof currentCzar === 'undefined') {
                // no czar, random winner (TODO: Voting?)
                self.say('The Card Czar has fled the scene. So I will pick the winner on this round.');
                self.selectWinner(Math.round(Math.random() * (self.table.answer.length - 1)));
                return;
            }
            self.say(util.format('%s: Select the winner (%s<entry number>)', self.czar.nick, command));
        }
        // start turn timer, check every 10 secs
        clearInterval(self.timers.winner);
        self.roundStarted = new Date();
        if (self.noCzar)
            self.timers.voting = setInterval(self.votingTimerCheck, 10 * 1000);
        else
            self.timers.winner = setInterval(self.winnerTimerCheck, 10 * 1000);
    };

    self.timerCheck = function(callback, warnCallback, prefixNick, now) { // pass now for testing
        now = now || new Date();
        prefix = (prefixNick) ? prefixNick + ': ' : '';
        var timeLimit = config.timeLimit * 1000;
        var started = self.roundStarted.getTime();
        var elapsed = (now.getTime() - started);
        if (elapsed >= timeLimit) {
            bot.log('Timeout: ' + (elapsed/1000) + 's since ' + started);
            callback();
        } else if (elapsed >= timeLimit - (10 * 1000) && elapsed < timeLimit) {
            // 10s ... 0s left
            self.say(prefix + '10 seconds left!');
        } else if (elapsed >= timeLimit - (30 * 1000) && elapsed < timeLimit - (20 * 1000)) {
            // 30s ... 20s left
            self.say(prefix + '30 seconds left!');
        } else if (elapsed >= timeLimit - (60 * 1000) && elapsed < timeLimit - (50 * 1000)) {
            // 60s ... 50s left
            self.say(prefix + 'Hurry up, 1 minute left!');
            warnCallback();
        }
    };

    /**
     * Check the time that has elapsed since the beinning of the turn.
     * End the turn is time limit is up
     */
    self.turnTimerCheck = function (now) { // pass now for testing
        // check the time
        now = now || new Date();
        self.timerCheck(
            function() {
                self.say('Time is up!');
                self.markInactivePlayers();
                self.showEntries();
            },
            function() { self.showStatus(); },
            '', now
        );
    };

    /**
     * Check the time that has elapsed since the beginning of voting.
     * End the turn if the time limit is up
     */
    self.votingTimerCheck = function(now) {
        now = now || new Date();
        self.timerCheck(
            function() {
                self.say('Time is up!');
                self.tallyVotes();
            },
            function() { self.showStatus(); },
            null, now
        );
    };

    /**
     * Check the time that has elapsed since the beinning of the winner select.
     * End the turn is time limit is up
     */
     self.winnerTimerCheck = function (now) { // pass now for testing
        now = now || new Date();
        self.timerCheck(
            self.pickRandomWinner,
            function() {},
            (self.noCzar) ? null : self.czar.nick,
            now
        );
     };

     /**
      * Pick a random winner
      */
    self.pickRandomWinner = function() {
        var message = 'I will pick the winner this round.';
        if (!self.noCzar)
            message = 'Time is up! ' + message;
        self.say(message);

        if (!self.noCzar)
            self.czar.inactiveRounds++;

        var index = Math.round(Math.random() * (self.table.answer.length - 1));
        self.selectWinner(index);
    };

     /**
      * Announce a winner of a round.
      * Called once if by czar, possibly repeated if by tied vote.
      * Also update the winner's owner's score.
      * @param  {object} winner - Card object from table.answer, with a vote property and an owner
      */
     self.announceWinner = function(winner) {
        var owner = winner.cards[0].owner;
        owner.points++;
        // update points object
        var playerPoints = _.findWhere(self.points, {player: owner});
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
     };

    /**
     * Pick an entry that wins the round
     * @param index Index of the winning card in table list
     * @param player Player who said the command (use null for internal calls, to ignore checking)
     */
    self.selectWinner = function (index, player, fastPick) {
        if (self.isPaused()) {
            self.say('Game is currently paused.');
            return false;
        }

        if (self.state !== STATES.PLAYED)
            return false;

        var winner = self.table.answer[index];

        if (!winner)
            return self.say('Invalid winner');

        if (self.noCzar && player) { // continue if voting timer ended without a vote (and called this without player arg)
            self.voteWinner(index, winner, player, fastPick);
            return;
        }

        if (player && player !== self.czar)
            return fastPick || self.say(player.nick + ': You are not the Card Czar. Only the Card Czar can select the winner');

        if (!self.noCzar)
            clearInterval(self.timers.winner);

        self.state = STATES.ROUND_END;

        self.announceWinner(winner);
        self.updateLastWinner(winner.cards[0].owner);
        self.clean();
        self.nextRound();
    };

    /**
     * Select winners from voting
     */
    self.tallyVotes = function() {
        clearInterval(self.timers.voting);

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

        self.state = STATES.ROUND_END;

        self.clean();
        self.nextRound();
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

        if (self.checkAllVoted())
            self.tallyVotes();
    };

    /**
     * Store streak info for last round winner.
     * @param player
     */
    self.updateLastWinner = function(player) {
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
        _.each(answers, function (card, index) {
            var text = card.text;
            if (
                ( index === 0 && question.text[index] === '' ) || // if at the start
                question.text[index].match(/[!?"':] $/) ||        // or after certain punctuation
                question.text[index].match(/((?![\.]).)\. $/)     // after '. ' but not '.. '
            )
                text = card.displayText; // get capitalized version

            args.push(c.bold(text));

        }, this);
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

        var returningPlayer = _.findWhere(self.left, {user: player.user, hostname: player.hostname});
        var pointsPlayer =    _.findWhere(self.points, {user: player.user, hostname: player.hostname});

        if (returningPlayer) {
            player = returningPlayer;
            player.isCzar = (
                player === self.czar &&
                player.roundLeft === self.round &&
                _.contains([ self.STATES.PLAYABLE, self.STATES.PLAYED ], self.state)
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

        var needed = (3 - self.players.length);
        if ( needed > 0 &&
             ( self.round > 0 ||  _.now() > self.startTime.getTime() + 30 * 1000 )
        )
            self.say('Need ' + needed + ' more player' + (needed == 1 ? '' : 's'));
        // check if waiting for players
        if (self.state === STATES.WAITING && self.players.length >= 3) {
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
        return _.findWhere(self.players, search);
    };

    /**
     * Remove player from game
     * @param player
     * @param options Extra options
     * @returns The removed player or false if invalid player
     */
    self.removePlayer = function (player, options) {
        options = _.extend({}, options);
        if (!player)
            return false;

        // remove player
        self.players = _.without(self.players, player);

        if ( _.includes(self.removed, utilities.getUhost(player)) && self.round > 0 ) {
            // put player's cards to discard
            var cards = player.cards.reset();
            _.each(cards, function (card) {
                self.discards.answer.addCard(card);
            });
        }
        else { // store the player's cards in case they rejoin
            player.roundLeft = self.round;
            self.left.push(player);
        }

        if (!options.silent)
            self.say(player.nick + ' has left the game');

        if (self.config.voicePlayers === true && !options.left)
            self.client.setChanMode(channel, '-v', player.nick);

        // check if remaining players have all played
        if (self.state === STATES.PLAYABLE && self.checkAllPlayed())
            self.showEntries();

        // check czar
        if (self.state === STATES.PLAYED && self.czar === player) {
            self.say('The Card Czar has fled the scene. So I will pick the winner on this round.');
            self.selectWinner(Math.round(Math.random() * (self.table.answer.length - 1)));
        }

        if (self.players.length === 0 && config.stopOnLastPlayerLeave === true)
            self.stop();

        return player;
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
        _.each(self.getNotPlayed(), function (player) {
            if (player.roundJoined !== self.round)
                player.inactiveRounds++;
        }, this);
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
        _.each(cards, function (card, index) {
             remainingCards.push(c.bold(' [' + index + '] ') + card.displayText);
        }, this);
        // split output if longer than allowed message length
        while (remainingCards.length) {
            currentCard = remainingCards.shift();
            newMessage = message + currentCard;
            if (newMessage.length > (self.client.opt.messageSplit - 4)) {
                self.notice(player.nick, message + ' ...');
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
                output += c.bold(point.player.nick) + ": " + c.bold(point.points) + ", ";
        });

        switch (stage) {

            case 'round':
                if (self.players.length)
                    self.say('Current scores: ' + output.slice(0, -2));

                if (self.pointLimit > 0)
                    self.say('Needed to win: ' + c.bold(self.pointLimit));
                break;

            case 'start':
                if (self.pointLimit > 0)
                    self.say('Needed to win: ' + c.bold(self.pointLimit));
                break;

            default:
                if (self.players.length)
                    self.say('The most horrible people: ' + output.slice(0, -2));
        }
    };

    /**
     * Show status
     */
    self.showStatus = function () {
        var message,
            playersNeeded = Math.max(0, 3 - self.players.length), // amount of player needed to start the game
            notPlayed = self.getNotPlayed(),
            notVoted  = self.getNotVoted();

        switch (self.state) {
            case STATES.PLAYABLE:
                message = util.format('Waiting for players to play: %s', _.pluck(notPlayed, 'nick').join(', '));
                if (!self.noCzar)
                    message = util.format('%s is the Card Czar. ', self.czar.nick) + message;
                break;
            case STATES.PLAYED:
                message = (self.noCzar) ? util.format('Waiting for players to vote: %s', _.pluck(notVoted, 'nick').join(', '))
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
        self.say(c.bold('Status: ') + message);
    };

    /**
     * Get all player nicks in the current game
     */
    self.getPlayerNicks = function () {
        return _.pluck(self.players, 'nick');
    };

    /**
     * List all players in the current game
     */
    self.listPlayers = function () {
        self.say('Players currently in the game: ' + self.getPlayerNicks().join(', '));
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
            self.removePlayer(player, {left: true});
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
            bot.warn('Left channel ' + channel + ' while game in progress. Pausing...');
            self.pause();
        }
    };

    /**
     * On rejoining a channel with an active game
     */
    self.channelRejoinHandler = function() {
        if (self.isPaused()) {
            bot.log('Rejoined ' + channel + ' where game is paused.');
            self.say(util.format('Card bot is back! Type %sresume to continue the current game.', p));
            return true;
        }
        if (self.isRunning()) {
            bot.warn('Error: Joined ' + channel + ' while game in progress');
            self.say('Error: Joined while game in progress. Pausing...');
            self.pause();
            return false;
        }
        bot.warn('Error: Joined ' + channel + ' while game in state: ' + self.state);
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
                    bot.log("Invalid format: " + format);
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
        self.say(util.format('%s is starting! Type %sjoin to join the game any time. (3 players needed)', title, p));
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
        str = (c.yellow('*') + str.join('') + c.yellow('*'));
        return str;
    };

    if (options.init)
        self.init();

};

// export static state constant
Game.STATES = STATES;

exports = module.exports = Game;
