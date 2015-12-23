var util = require('util'),
    c = require('irc-colors'),
    _ = require('underscore'),
    Cards = require('../controllers/cards'),
    Card = require('../models/card'),
    p; // default prefix char from config

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
    "draw": 2,
    "pick": 3,
    "value": "(Draw 2, Pick 3) Make a haiku."
});

/**
 * A single game object that handles all operations in a game
 * @param channel The channel the game is running on
 * @param client The IRC client object
 * @param config Configuration variables
 * @param cmdArgs !start command arguments
 * @constructor
 */
var Game = function Game(channel, client, config, cmdArgs) {
    var self = this;

    // properties
    self.round = 0; // round number
    self.players = []; // list of players
    self.removed = [];    // people who are not allowed to join
    self.waitToJoin = []; // people who are not allowed to join until the next round
    self.channel = channel; // the channel this game is running on
    self.client = client; // reference to the irc client
    self.config = config; // configuration data
    self.STATES = STATES;
    self.state = STATES.WAITING; // game state storage
    self.timers = {} // game timers
    self.pauseState = []; // pause state storage
    self.points = [];
    self.pointLimit = 0; // point limit for the game, defaults to 0 (== no limit)
    self.lastWinner = {}; // store the streak count of the last winner
    p = config.commandPrefixChars[0]; // default prefix char

    var questions = _.filter(config.cards, function(card) {
        return card.type.toLowerCase() === 'question';
    });
    var answers = _.filter(config.cards, function(card) {
        return card.type.toLowerCase() === 'answer';
    });
    console.log('Loaded', config.cards.length, 'cards:' + questions.length, 'questions,', answers.length, 'answers');

    // init decks
    self.decks = {
        question: new Cards(questions),
        answer:   new Cards(answers)
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

    // parse point limit from configuration file
    if(typeof config.pointLimit !== 'undefined' && !isNaN(config.pointLimit))
        self.pointLimit = parseInt(config.pointLimit);

    // parse point limit from command arguments
    if(typeof cmdArgs[0] !==  'undefined' && !isNaN(cmdArgs[0]))
        self.pointLimit = parseInt(cmdArgs[0]);

    /**
     * Stop game
     */
    self.stop = function (player, pointLimitReached) {
        self.state = STATES.STOPPED;

        if (typeof player !== 'undefined' && player !== null) {
            self.say(player.nick + ' stopped the game.');
        } else if (pointLimitReached !== true) {
            self.say('Game has been stopped.');
            // set topic
            self.setTopic(config.topic.messages.off);
        }
        if(self.round > 1) {
            // show points if played more than one round
            self.showPoints();
        }

        if (self.config.voicePlayers === true) {
            client.setChanMode(channel, '-v', self.getPlayerNicks());
        }
        // clear all timers
        _.each(self.timers, function(timer) {
            clearTimeout(timer);
        });

        client.removeListener('part', self.playerPartHandler);
        client.removeListener('quit', self.playerQuitHandler);
        client.removeListener('kick', self.playerKickHandler);
        client.removeListener('nick', self.playerNickChangeHandler);

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
     * Is the game paused?
     */
    self.isPaused = function() {
        return ( self.STATES.PAUSED === self.state );
    };

    /**
     * Can the game be paused?
     */
    self.isRunning = function() {
        return _.contains([self.STATES.PLAYABLE, self.STATES.PLAYED], self.state);
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
        if (!self.isRunning) {
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
            if(self.players.indexOf(self.czar) < 0) {
                // no czar
                self.say('The czar quit the game during pause. I will pick the winner on this round.');
                // select winner
                self.selectWinner(Math.round(Math.random() * (self.table.answer.length - 1)));
            } else {
                self.timers.winner = setInterval(self.winnerTimerCheck, 10 * 1000);
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
        if (!self.endGame() && !self.needPlayers()) {
            if (self.round === 0) {
                self.say('Starting in ' + config.timeBetweenRounds + ' seconds. ' + self.getPlayerNicks().join(', ') + ' get ready!');
            }
            self.showPoints((self.round === 0) ? 'start' : 'round');
            self.state = STATES.PAUSED;
            self.timers.next = setTimeout(self.startNextRound, config.timeBetweenRounds * 1000);
        }
    };

    /**
     * Start next round
     */
    self.startNextRound = function () {
        if (!self.isPaused()) { return false; }
        self.round++;
        self.setCzar();
        self.deal();
        self.waitToJoin = [];
        self.say('Round ' + self.round + '! ' + self.czar.nick + ' is the card czar.');
        self.playQuestion();
        self.state = STATES.PLAYABLE;
        // show cards for all players (except czar)
        _.each(self.players, function (player) {
            if (player.isCzar !== true) {
                self.showCards(player);
            }
        });
    };

    /**
     * End game
     */
    self.endGame = function() {
        // check if any player reached the point limit
        if (self.pointLimit > 0) {
            var winner = _.findWhere(self.players, {points: self.pointLimit});
            if(winner) {
                self.say(c.bold(winner.nick) + ' has reached ' + c.bold(self.pointLimit) + ' awesome points and is the winner of the game! ' + c.bold('Congratulations!'));
                self.stop(null, true);

                // Add the winner to the channel topic if message is set
                self.setTopic(config.topic.messages.winner, {nick: winner.nick});
                return true;
            }
        }
        return false;
    };

    /**
     * Wait for more players
     */
    self.needPlayers = function() {
        // check that there's enough players in the game
        if (self.players.length < 3) {
            var needed = 3 - self.players.length;
            if (self.round > 0) {
                self.say('Need ' + needed + ' more player' + (needed == 1 ? '' : 's') + '.');
                self.showPoints('round');
                self.state = STATES.WAITING;
            }
            // stop game if not enough players
            self.timers.stop = setTimeout(self.stop, config.timeWaitForPlayers * 1000);
            return true;
        }
        return false;
    };

    /**
     * Set a new czar
     * @returns Player The player object who is the new czar
     */
    self.setCzar = function () {
        self.czar = self.players[self.players.indexOf(self.czar) + 1] || self.players[0];
        self.czar.isCzar = true;
        return self.czar;
    };

    /**
     * Deal cards to fill players' hands
     */
    self.deal = function () {
        _.each(self.players, function (player) {
            for (var i = player.cards.numCards(); i < 10; i++) {
                self.checkDecks();
                var card = self.decks.answer.pickCards();
                player.cards.addCard(card);
                card.owner = player;
            }
        }, this);
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
            _.each(cards.getCards(), function (card) {
                card.owner = null;
                self.discards.answer.addCard(card);
                cards.removeCard(card);
            }, this);
        }, this);
        self.table.answer = [];

        // reset players
        var removedNicks = [];
        _.each(self.players, function (player) {
            player.hasPlayed = false;
            player.isCzar = false;
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
     * Play new question card on the table
     */
    self.playQuestion = function () {
        self.checkDecks();
        var card = self.decks.question.pickCards();
        // replace all instance of %s with underscores for prettier output
        var value = card.value.replace(/\%s/g, '___');
        // check if special pick & draw rules
        if (card.pick > 1) {
            value += c.bold(' [PICK ' + card.pick + ']');
        }
        if (card.draw > 0) {
            value += c.bold(' [DRAW ' + card.draw + ']');
        }
        self.say(c.bold('CARD: ') + value);
        self.table.question = card;
        // draw cards
        if (self.table.question.draw > 0) {
            _.each(_.where(self.players, {isCzar: false}), function (player) {
                for (var i = 0; i < self.table.question.draw; i++) {
                    self.checkDecks();
                    var c = self.decks.answer.pickCards();
                    player.cards.addCard(c);
                    c.owner = player;
                }
            });
        }
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
        if (self.isPaused()) {
            fastPick || self.say('Game is currently paused.');
            return false;
        }

        // make sure different cards are played
        cards = _.uniq(cards);
        if (self.state !== STATES.PLAYABLE || player.cards.numCards() === 0) {
            fastPick || self.say(player.nick + ': Can\'t play at the moment.');
        } else if (typeof player !== 'undefined') {
            if (player.isCzar === true) {
                fastPick || self.say(player.nick + ': You are the card czar. The czar does not play. The czar makes other people do their dirty work.');
            } else {
                if (player.hasPlayed === true) {
                    fastPick || self.say(player.nick + ': You have already played on this round.');
                } else if (cards.length != self.table.question.pick) {
                    // invalid card count
                    self.say(player.nick + ': You must pick ' + self.table.question.pick + ' different cards.');
                } else {
                    // get played cards
                    var playerCards;
                    try {
                        playerCards = player.cards.pickCards(cards);
                    } catch (error) {
                        self.notice(player.nick, 'Invalid card index');
                        return false;
                    }
                    self.table.answer.push(playerCards);
                    player.hasPlayed = true;
                    player.inactiveRounds = 0;
                    self.notice(player.nick, 'You played: ' + self.getFullEntry(self.table.question, playerCards.getCards()));
                    // show entries if all players have played
                    if (self.checkAllPlayed()) {
                        self.showEntries();
                    }
                }
            }
        } else {
            console.warn('Invalid player tried to play a card');
        }
    };

    /**
     * Check the time that has elapsed since the beinning of the turn.
     * End the turn is time limit is up
     */
    self.turnTimerCheck = function () {
        // check the time
        var now = new Date();
        var timeLimit = config.timeLimit * 1000;
        var roundElapsed = (now.getTime() - self.roundStarted.getTime());
        if (roundElapsed >= timeLimit) {
            console.log('The round timed out: ' + (roundElapsed/1000) + 's since ' + self.roundStarted.getTime());
            self.say('Time is up!');
            self.markInactivePlayers();
            // show end of turn
            self.showEntries();
        } else if (roundElapsed >= timeLimit - (10 * 1000) && roundElapsed < timeLimit) {
            // 10s ... 0s left
            self.say('10 seconds left!');
        } else if (roundElapsed >= timeLimit - (30 * 1000) && roundElapsed < timeLimit - (20 * 1000)) {
            // 30s ... 20s left
            self.say('30 seconds left!');
        } else if (roundElapsed >= timeLimit - (60 * 1000) && roundElapsed < timeLimit - (50 * 1000)) {
            // 60s ... 50s left
            self.say('Hurry up, 1 minute left!');
            self.showStatus();
        }
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
        } else if (self.table.answer.length === 1) {
            self.say('Only one player played and is the winner by default.');
            self.selectWinner(0);
        } else {
            self.say('Everyone has played. Here are the entries:');
            // shuffle the entries
            self.table.answer = _.shuffle(self.table.answer);
            _.each(self.table.answer, function (cards, i) {
                self.say(i + ": " + self.getFullEntry(self.table.question, cards.getCards()));
            }, this);
            // check that czar still exists
            var currentCzar = _.findWhere(this.players, {isCzar: true});
            if (typeof currentCzar === 'undefined') {
                // no czar, random winner (TODO: Voting?)
                self.say('The czar has fled the scene. So I will pick the winner on this round.');
                self.selectWinner(Math.round(Math.random() * (self.table.answer.length - 1)));
            } else {
                self.say(util.format(self.czar.nick + ': Select the winner (%swinner <entry number>)', p));
                // start turn timer, check every 10 secs
                clearInterval(self.timers.winner);
                self.roundStarted = new Date();
                self.timers.winner = setInterval(self.winnerTimerCheck, 10 * 1000);
            }

        }
    };

    /**
     * Check the time that has elapsed since the beinning of the winner select.
     * End the turn is time limit is up
     */
    self.winnerTimerCheck = function () {
        // check the time
        var now = new Date();
        var timeLimit = config.timeLimit * 1000;
        var roundElapsed = (now.getTime() - self.roundStarted.getTime());
        console.log('Winner selection elapsed:', roundElapsed, now.getTime(), self.roundStarted.getTime());
        if (roundElapsed >= timeLimit) {
            self.say('Time is up. I will pick the winner on this round.');
            // Check czar & remove player after config.maxIdleRounds timeouts
            self.czar.inactiveRounds++;
            // select winner
            self.selectWinner(Math.round(Math.random() * (self.table.answer.length - 1)));
        } else if (roundElapsed >= timeLimit - (10 * 1000) && roundElapsed < timeLimit) {
            // 10s ... 0s left
            self.say(self.czar.nick + ': 10 seconds left!');
        } else if (roundElapsed >= timeLimit - (30 * 1000) && roundElapsed < timeLimit - (20 * 1000)) {
            // 30s ... 20s left
            self.say(self.czar.nick + ': 30 seconds left!');
        } else if (roundElapsed >= timeLimit - (60 * 1000) && roundElapsed < timeLimit - (50 * 1000)) {
            // 60s ... 50s left
            self.say(self.czar.nick + ': Hurry up, 1 minute left!');
        }
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

        // clear winner timer
        clearInterval(self.timers.winner);

        var winner = self.table.answer[index];
        if (self.state === STATES.PLAYED) {
            if (typeof player !== 'undefined' && player !== self.czar) {
                fastPick || client.say(player.nick + ': You are not the card czar. Only the card czar can select the winner');
            } else if (typeof winner === 'undefined') {
                self.say('Invalid winner');
            } else {
                self.state = STATES.ROUND_END;
                var owner = winner.cards[0].owner;
                owner.points++;
                // update points object
                var playerPoints = _.findWhere(self.points, {player: owner});
                if (playerPoints) { playerPoints.points = owner.points; } // player may have quit
                // announce winner
                self.say(c.bold('The winner is: "' + self.getFullEntry(self.table.question, winner.getCards()) + '"'));
                var message = _.template('<%= nick %> gets one awesome point! <%= nick %> has <%= points %> awesome point<%= s %>.');
                self.say(message({
                    nick: c.bold(owner.nick),
                    points: c.bold(owner.points),
                    s: (owner.points > 1) ? 's' : ''
                }));
                self.updateLastWinner(owner);
                self.clean();
                self.nextRound();
            }
        }
    };

    /**
     * Store streak info for last round winner.
     * @param player
     */
    self.updateLastWinner = function(player) {
        var message, uhost = self.getPlayerUhost(player);
        if ( _.isEmpty(self.lastWinner) || self.lastWinner.uhost !== uhost ) {
            self.lastWinner = {uhost: uhost, count: 1};
            return;
        }
        self.lastWinner.count++;
        switch (self.lastWinner.count) {
            case 2:
                message = _.template('Two in a row!');
                break;
            case 3:
                message = _.template('That\'s three! <%= nick %>\'s on a roll.');
                break;
            case 4:
                message = _.template('Four??? Who can stop this mad person?');
                break;
            case 5:
                message = _.template('<%= nick %>, I\'m speaking as a friend. It\'s not healthy to be this good at CAH.');
                break;
        }
        if (message)
            self.say(c.bold(message({nick: player.nick})));
    }

    /**
     * Get formatted entry
     * @param question
     * @param answers
     * @returns {*|Object|ServerResponse}
     */
    self.getFullEntry = function (question, answers) {
        var args = [question.value];
        _.each(answers, function (card) {
            args.push(c.bold(card.value));
        }, this);
        return util.format.apply(this, args);
    };

    /**
     * Check if all active players played on the current round
     * @returns Boolean true if all players have played
     */
    self.checkAllPlayed = function () {
        var allPlayed = false;
        if (self.getNotPlayed().length === 0) {
            allPlayed = true;
        }
        return allPlayed;
    };

    /**
     * Check if decks are empty & reset with discards
     */
    self.checkDecks = function () {
        // check answer deck
        if (self.decks.answer.numCards() === 0) {
            console.log('answer deck is empty. reset from discard.');
            self.decks.answer.reset(self.discards.answer.reset());
            self.decks.answer.shuffle();
        }
        // check question deck
        if (self.decks.question.numCards() === 0) {
            console.log('question deck is empty. reset from discard.');
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
        if (_.contains(self.removed, self.getPlayerUhost(player)))
            return false;
        if (_.contains( self.waitToJoin, self.getPlayerUhost(player))) {
            self.say(player.nick + ': you can\'t rejoin until the next round :(')
            return false;
        }
        if (typeof self.getPlayer({user: player.user, hostname: player.hostname}) === 'undefined') {
            self.players.push(player);
            self.say(player.nick + ' has joined the game');
            // check if player is returning to game
            var pointsPlayer = _.findWhere(self.points, {user: player.user, hostname: player.hostname});
            if (typeof pointsPlayer === 'undefined') {
                // new player
                self.points.push({
                    user:     player.user, // user and hostname are used for matching returning players
                    hostname: player.hostname,
                    player:   player, // reference to player object saved to points object as well
                    points:   0
                });
            } else {
                // returning player
                pointsPlayer.player = player;
                player.points = pointsPlayer.points;
            }
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
        } else {
            console.log('Player tried to join again', player.nick, player.user, player.hostname);
        }
        return false;
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
     * Format player user,hostname identifier
     * @param player
     * @returns user@hostname
     */
    self.getPlayerUhost = function(player) {
        return [player.user, player.hostname].join('@')
    };

    /**
     * Remove player from game
     * @param player
     * @param options Extra options
     * @returns The removed player or false if invalid player
     */
    self.removePlayer = function (player, options) {
        options = _.extend({}, options);
        if (typeof player !== 'undefined') {
            // get cards in hand
            var cards = player.cards.reset();
            // remove player
            self.players = _.without(self.players, player);
            if ( !_.contains(self.removed, self.getPlayerUhost(player)) && self.round > 0 )
                self.waitToJoin.push(self.getPlayerUhost(player));
            // put player's cards to discard
            _.each(cards, function (card) {
                self.discards.answer.addCard(card);
            });
            if (options.silent !== true) {
                self.say(player.nick + ' has left the game');
            }
            if (self.config.voicePlayers === true)
                self.client.setChanMode(channel, '-v', player.nick);

            // check if remaining players have all player
            if (self.state === STATES.PLAYABLE && self.checkAllPlayed()) {
                self.showEntries();
            }

            // check czar
            if (self.state === STATES.PLAYED && self.czar === player) {
                self.say('The czar has fled the scene. So I will pick the winner on this round.');
                self.selectWinner(Math.round(Math.random() * (self.table.answer.length - 1)));
            }

            if (self.players.length === 0 && config.stopOnLastPlayerLeave === true) {
                self.stop();
            }
            return player;
        }
        return false;
    };

    /**
     * Get all player who have not played
     * @returns Array list of Players that have not played
     */
    self.getNotPlayed = function () {
        return _.where(_.filter(self.players, function (player) {
            // check only players with cards (so players who joined in the middle of a round are ignored)
            return player.cards.numCards() > 0;
        }), {hasPlayed: false, isCzar: false});
    };

    /**
     * Check for inactive players
     * @param options
     */
    self.markInactivePlayers = function (options) {
        _.each(self.getNotPlayed(), function (player) {
            player.inactiveRounds++;
        }, this);
    };

    /**
     * Show players cards to player
     * @param player
     */
    self.showCards = function (player) {
        if (typeof player !== 'undefined') {
            var cards = player.cards.getCards(),
                remainingCards = [],
                currentCard,
                message = 'Your cards are:',
                newMessage;
            _.each(cards, function (card, index) {
                 remainingCards.push(c.bold(' [' + index + '] ') + card.value);
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
        }
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
        if (stage === 'round') {
            self.say('Current scores: ' + output.slice(0, -2));
            self.say('Needed to win: ' + c.bold(self.pointLimit));
        } else if (stage === 'start')
            self.say('Needed to win: ' + c.bold(self.pointLimit));
        else if (self.players.length)
            self.say('The most horrible people: ' + output.slice(0, -2));
    };

    /**
     * Show status
     */
    self.showStatus = function () {
        var playersNeeded = Math.max(0, 3 - self.players.length), // amount of player needed to start the game
            activePlayers = _.filter(self.players, function (player) {
                // only players with cards in hand are active
                return player.cards.numCards() > 0;
            }),
            played = _.where(activePlayers, {isCzar: false, hasPlayed: true}), // players who have already played
            notPlayed = _.where(activePlayers, {isCzar: false, hasPlayed: false}); // players who have not played yet
        switch (self.state) {
            case STATES.PLAYABLE:
                self.say(c.bold('Status: ') + self.czar.nick + ' is the czar. Waiting for players to play: ' + _.pluck(notPlayed, 'nick').join(', '));
                break;
            case STATES.PLAYED:
                self.say(c.bold('Status: ') + 'Waiting for ' + self.czar.nick + ' to select the winner.');
                break;
            case STATES.ROUND_END:
                self.say(c.bold('Status: ') + 'Round has ended and next one is starting.');
                break;
            case STATES.STOPPED:
                self.say(c.bold('Status: ') + 'Game has been stopped.');
                break;
            case STATES.WAITING:
                self.say(c.bold('Status: ') + 'Waiting for ' + playersNeeded + ' players to join.');
                break;
            case STATES.PAUSED:
                self.say(c.bold('Status: ') + 'Game is paused.');
                break;
        }
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
     * Handle player parts
     * @param channel
     * @param nick
     * @param reason
     * @param message
     */
    self.playerPartHandler = function (channel, nick, reason, message) {
        self.playerLeaveHandler(nick);
    };

    /**
     * Handle player quits
     * @param nick
     * @param reason
     * @param channels
     * @param message
     */
    self.playerQuitHandler = function (nick, reason, channels, message) {
        self.playerLeaveHandler(nick);
    };

    /**
     * Handle player kicks
     * @param channel
     * @param nick
     * @param by
     * @param reason
     * @param message
     */
    self.playerKickHandler = function (channel, nick, by, reason, message) {
        self.playerLeaveHandler(nick);
    };

    /**
     * Handle player quits and parts
     * @param channel
     * @param nick
     * @param reason
     * @param message
     */
    self.playerLeaveHandler = function (nick) {
        var player = self.getPlayer({nick: nick});
        if (typeof player !== 'undefined')
            self.removePlayer(player);
    };

    /**
     * Handle player nick changes
     * @param oldnick
     * @param newnick
     * @param channels
     * @param message
     */
    self.playerNickChangeHandler = function (oldnick, newnick, channels, message) {
        var player = self.getPlayer({nick: oldnick});
        if (typeof player !== 'undefined')
            player.nick = newnick;
    };

    /**
     * Notify users in channel that game has started
     */
    self.notifyUsers = function() {
        var withoutModes = ['o', 'v'];
        _.chain(client.nicksInChannel(channel, withoutModes))
            .without(self.getPlayerNicks())
            .without(client.nick)
            .each(function(nick) {
                self.notice(nick, util.format(
                    nick + ': A new game of Cards Against Humanity just began in ' + channel + 
                    '. Head over and %sjoin if you\'d like to get in on the fun!', p
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
        var format, i, newTopic, keep;

        if (typeof addTopic !== "string") {
            format = addTopic[1];
            addTopic = addTopic[0];
        }
        if (addTopic == "")
            return false;
        if (data)
            addTopic = _.template(addTopic)(data); // render template
        addTopic = addTopic.split('%%').join(p); // replace command prefix
        if (format) {
            try {
                // apply string formatting to addTopic
                addTopic = eval("c." + format)(addTopic);
            } catch (error) {
                self.log("format: " + error);
                return false;
            }
        }
        var sep = config.topic.separator;
        if (sep) {
            var topic = client.chanData(channel).topic,
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

    // set topic
    self.setTopic(config.topic.messages.on);

    // announce the game on the channel
    self.announce = function() {
        var title = 'Cards Against Humanity';
        title = (self.isChristmas()) ? c.christmas(title)
                                     : c.rainbow(title);
        self.say(util.format(title + ' is starting! Type %sjoin to join the game any time. (3 players needed)', p));
    };

    self.isChristmas = function() {
        var now = new Date();
        return (now.getMonth() == 11 && now.getDate() > 19);        
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

    self.announce();

    // notify users
    if (typeof config.notifyUsers !== 'undefined' && config.notifyUsers) {
        self.notifyUsers();
    }

    // wait for players to join
    self.startTime = new Date();
    self.nextRound();

    // client listeners
    client.addListener('part', self.playerPartHandler);
    client.addListener('quit', self.playerQuitHandler);
    client.addListener('kill', self.playerQuitHandler);
    client.addListener('kick', self.playerKickHandler);
    client.addListener('nick', self.playerNickChangeHandler);
};

// export static state constant
Game.STATES = STATES;

exports = module.exports = Game;
