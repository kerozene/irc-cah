var      chai = require('chai'),
       should = chai.should(),
        sinon = require('sinon'),
    sinonChai = require('sinon-chai'),
            _ = require('lodash'),
         util = require('util'),
       moment = require('moment');

chai.use(sinonChai);

var fixtures = require('./fixtures/game'),
         bot = require('./fixtures/bot'),
       cards = require('./fixtures/cards');

var Cards = require('../app/controllers/cards');
var Game = require('../app/controllers/game');
var game;

var getGame = function() {
    return new Game(bot, {init: false});
};
var initGame = function() {
    game = getGame();
    game.players = _.cloneDeep(fixtures.players);
    game.czar = game.players[1];
};
initGame();

describe('GameController', function() {

    it('should have STATES', function(){
        game.STATES.should.deep.equal(fixtures.STATES);
    });

    describe('#init()', function() {

        it('should set the game start time');

        it('should turn on client listeners');

        it('should update the topic if configured to');

        it('should announce the game');

        it('should call #nextRound()');

    });

    describe('#initCards()', function() {

        var stubXmas;

        before(function() {
            stubXmas = sinon.stub(game, 'isChristmas').returns(false);
            bot.config.defaultDecks = ['ABCDE', 'FGHIJ'];
            game.options = { decks: ['KLMNO', 'PQRST'] };
        });

        after(function() {
            stubXmas.restore();
        });

        it('should collate the list of decks to load from defaults, isChristmas and .start options');

        it('should filter the collection to include allowed decks');

        it('should initialise the game decks');

        it('should initialise the discards pile');

        it('should initialise the table');

        it('should log some info');

        it('should announce the info if .start decks were loaded');

    });

    describe('#stop()', function() {

        var stubDestroy;

        before(function() {
            bot.config.topic = {
                messages: {
                    off: ''
                }
            };
        });

        it('should set the game state to STOPPED', function() {
            game.state = game.STATES.PAUSED;

            game.stop();

            game.state.should.equal(game.STATES.STOPPED);
        });

        it('should say the game has been stopped and who stopped it if manual', function() {
            var stubSay = sinon.stub(bot.client, 'say');

            game.stop();

            stubSay.should.have.been.calledWithExactly(
                '#test',
                'Game has been stopped.');

            game.stop(game.players[0]);

            stubSay.should.have.been.calledWithExactly(
                '#test',
                'Frederick stopped the game.');

            stubSay.restore();
        });

        it('should update the topic', function() {
            var stubTopic = sinon.stub(game, 'setTopic');

            game.stop();

            stubTopic.should.have.been.called;

            stubTopic.restore();
        });

        it('should show the scores if more than one round was played', function() {
            var stubPoints = sinon.stub(game, 'showPoints');
            game.round = 1;

            game.stop();

            stubPoints.should.not.have.been.called;

            game.round = 2;

            game.stop();

            stubPoints.should.have.been.called;

            stubPoints.restore();
        });

        it('should devoice the players if configured to', function() {
            var stubMode = sinon.stub(bot.client, 'setChanMode');
            bot.config.voicePlayers = false;

            game.stop();

            stubMode.should.not.have.been.called;

            bot.config.voicePlayers = true;

            game.stop();

            stubMode.should.have.been.called;

            stubMode.restore();
        });

        it('should clear all game timers', function() {
            var clock = sinon.useFakeTimers();
            var stubClear = sinon.stub(clock, 'clearTimeout');
            game.timers= [ 'foo', 'bar' ];

            game.stop();

            stubClear.should.have.been.calledTwice;

            game.timers = [];
            stubClear.restore();
            clock.restore();
        });

        it('should turn off all client listeners', function() {
            var stubToggle = sinon.stub(game, 'toggleListeners');

            game.stop();

            stubToggle.should.have.been.called;

            stubToggle.restore();
        });

        it('should delete properties', function() {
            var clock = sinon.useFakeTimers();
            sinon.spy(clock, 'setTimeout');

            game.stop();

            clock.setTimeout.should.have.been.calledWith(game.destroy, 2000);

            clock.setTimeout.restore();
            clock.restore();
        });

        it('should unset the bot.game property', function() {
            bot.game = game;

            game.stop();

            should.not.exist(bot.game);

            initGame();
        });

    });

    describe('#pause()', function() {

        beforeEach(function() {
            game.roundStarted = new Date();
            game.state = game.STATES.PLAYED;
        });

        it('should say if the game was already paused', function() {
            game.state = game.STATES.PAUSED;

            var response = game.pause();

            response.should.equal('Game is already paused. Type .resume to begin playing again.');
        });

        it('should say if the game is not in a pausable state', function() {
            game.state = game.STATES.WAITING;

            var response = game.pause();

            response.should.equal('The game cannot be paused right now.');
        });

        it('should store the current game state and replace it with PAUSED', function() {
            game.pause();

            game.state.should.equal(game.STATES.PAUSED);
            game.pauseState.state.should.equal(game.STATES.PLAYED);
        });

        it('should say that the game is paused', function() {
            var stubSay = sinon.stub(bot.client, 'say');

            game.pause();

            stubSay.should.have.been.calledWithExactly(
                '#test',
                'Game is now paused. Type .resume to begin playing again.');

            stubSay.restore();
        });

        it('should stop the round timers', function() {
            var stubStopRoundTimers = sinon.stub(game, 'stopRoundTimers');

            game.pause();

            stubStopRoundTimers.should.have.been.called;

            stubStopRoundTimers.restore();
        });

    });

    describe('#resume()', function() {

        var stubs = {};

        before(function() {
            stubs.say = sinon.stub(bot.client, 'say');
        });

        after(function() {
            stubs.say.restore();
        });

        beforeEach(function() {
            stubs.say.reset();
            game.state = game.STATES.PAUSED;
        });

        it('should say if the game was not paused', function() {
            game.state = game.STATES.WAITING;

            var response = game.resume();

            response.should.equal('The game is not paused.');
        });

        it('should announce that the game has been resumed', function() {
            game.resume();

            stubs.say.should.have.been.calledWithExactly('#test', 'Game has been resumed.');
        });

        it('should update the roundStarted time', function() {
            game.roundStarted = 'test';

            game.resume();

            game.roundStarted.should.be.a.Date;
        });

        it('should reset the game state to what it was before pause', function() {
            game.pauseState.state = game.STATES.WAITING;

            game.resume();

            game.state.should.equal(game.STATES.WAITING);
        });

        it('should select the winner if all played and the czar is gone', function() {
            stubs.select = sinon.stub(game, 'selectWinner');
            game.pauseState.state = game.STATES.PLAYED;
            game.players = _.without(game.players, game.players[1]);
            game.table = { answer: [1, 2] };

            game.resume();

            stubs.say.should.have.been.calledWithExactly(
                '#test',
                'The Card Czar quit the game during pause. I will pick the winner on this round.');
            stubs.select.should.have.been.called;

            game.players = _.cloneDeep(fixtures.players);
            game.czar = game.players[1];
            stubs.select.restore();
        });

        it('should start the round timers', function() {
            var stubStartRoundTimers = sinon.stub(game, 'startRoundTimers');

            game.resume();

            stubStartRoundTimers.should.have.been.called;

            stubStartRoundTimers.restore();
        });

    });

    describe('#nextRound()', function() {

        var clock, stubs;

        before(function() {
            clock = sinon.useFakeTimers();
            sinon.spy(clock, 'setTimeout');
            stubs = {
                end:    sinon.stub(game, 'endGame'),
                need:   sinon.stub(game, 'needPlayers'),
                points: sinon.stub(game, 'showPoints'),
                say:    sinon.stub(bot.client, 'say')
            };
        });

        beforeEach(function() {
            clock.setTimeout.reset();
            _.each(stubs, function(stub) {
                stub.reset();
            });
        });

        after(function() {
            clock.setTimeout.restore();
            clock.restore();
            _.each(stubs, function(stub) {
                stub.restore();
            });
        });

        it('should clear the game stop timer', function() {

            game.nextRound();

            clock.setTimeout.should.have.been.called;

        });

        it('should do nothing if game just ended or not enough players', function() {
            stubs.end.restore();
            stubs.end = sinon.stub(game, 'endGame').returns(true);
            sinon.spy(game, 'nextRound');

            game.nextRound();

            game.nextRound.returned(false).should.be.true;

            game.nextRound.reset();
            stubs.end.returns(false);
            stubs.need.restore();
            stubs.need = sinon.stub(game, 'needPlayers').returns(true);

            game.nextRound();

            game.nextRound.returned(false).should.be.true;

            game.nextRound.restore();
            stubs.need.returns(false);
        });

        it('should call #showPoints()', function() {
            game.nextRound();

            stubs.points.should.have.been.called;
        });

        it('should set the game state to PAUSED', function() {
            game.state = game.STATES.WAITING;

            game.nextRound();

            game.state.should.equal(game.STATES.PAUSED);
        });

        it('should start the next round', function() {
            game.timers = { next: 'test' };

            game.nextRound();

            clock.setTimeout.should.have.been.called;
            game.timers.next.should.not.equal('test');
        });

        it('should ping the players and say a game is starting if no rounds have been played', function() {
            bot.config.timeBetweenRounds = 10;

            game.nextRound();

            stubs.say.should.have.been.calledWithMatch(
                /^#test$/,
                /^Starting in 10 seconds\. (\w+, ){3}\w+ get ready!$/);
        });

    });

    describe('#startNextRound()', function() {

        var stubs = {};

        before(function() {
            stubs = {
                need:   sinon.stub(game, 'needPlayers'),
                czar:   sinon.stub(game, 'setCzar'),
                deal:   sinon.stub(game, 'deal'),
                play:   sinon.stub(game, 'playQuestion'),
                cards:  sinon.stub(game, 'showCards'),
                say:    sinon.stub(bot.client, 'say')
            };
        });

        after(function() {
            _.each(stubs, function(stub) {
                stub.restore();
            });
        });

        beforeEach(function() {
            game.state = game.STATES.PAUSED;
            _.each(stubs, function(stub) {
                stub.reset();
            });
        });

        it('should do nothing unless the game is paused', function() {
            sinon.spy(game, 'startNextRound');
            game.state = game.STATES.WAITING;

            game.startNextRound();

            game.startNextRound.returned(false).should.be.true;

            game.startNextRound.restore();
        });

        it('should increment the round counter', function() {
            game.round = 0;

            game.startNextRound();

            game.round.should.equal(1);
        });

        it('should abort if not enough players', function() {
            sinon.spy(game, 'startNextRound');

            game.startNextRound();

            game.startNextRound.returned(false).should.not.be.true;

            game.startNextRound.reset();
            stubs.need.restore();
            stubs.need = sinon.stub(game, 'needPlayers').returns(true);

            game.startNextRound();

            game.startNextRound.returned(false).should.be.true;

            game.startNextRound.restore();
            stubs.need.returns(false);
        });

        it('should set the czar for this round', function() {
            game.startNextRound();

            stubs.czar.should.have.been.called;
        });

        it('should deal the cards', function() {
            game.startNextRound();

            stubs.deal.should.have.been.called;
        });

        it('should announce the round start and czar', function() {
            game.round = 1;

            game.startNextRound();

            stubs.say.should.have.been.calledWithExactly(
                '#test',
                'Round \u00022\u0002! Napoleon is the Card Czar.');
        });

        it('should call #playQuestion()', function() {
            game.startNextRound();

            stubs.play.should.have.been.called;
        });

        it('should show everyone their cards', function() {
            game.startNextRound();

            stubs.cards.callCount.should.equal(3);
        });

    });

    describe('#endGame()', function() {

        var stubStop, stubTopic;

        before(function() {
            game.players = fixtures.players.slice(0, 3);

            bot.config.topic = {
                messages: {
                    winner: 'foo'
                }
            };
        });

        beforeEach(function() {
            stubStop = sinon.stub(game, 'stop');
            stubTopic = sinon.stub(game, 'setTopic');
            game.pointLimit = 3;
            game.points = [];
            game.players = _.map(game.players, function(player) {
                var points = _.sample([0, 1, 2]);
                player.points = points;
                game.points.push({
                    user:     player.user,
                    hostname: player.hostname,
                    player:   player,
                    points:   points
                });
                return player;
            });
            game.points[0].points = 3;
            game.points[0].player.points = 3;
        });

        afterEach(function() {
            stubStop.restore();
            stubTopic.restore();
        });

        it('should not end the game if pointLimit is set below 1', function() {
            game.pointLimit = 0;

            game.endGame();

            stubStop.should.not.have.been.called;
        });

        it('should not end the game if pointLimit has not been reached', function() {
            game.points[0].points = 2;
            game.points[0].player.points = 2;

            game.endGame();

            stubStop.should.not.have.been.called;
        });

        it('should announce the winner', function() {
            var stubSay = sinon.stub(bot.client, 'say');

            game.endGame();

            stubSay.should.have.been.calledWithExactly(
                '#test',
                '\u0002Frederick\u0002 has reached \u00023\u0002 awesome points and is the winner of the game! ' +
                '\u0002Congratulations!\u0002');
            stubSay.restore();
        });

        it('should stop the game', function() {
            game.endGame();

            stubStop.should.have.been.called;
        });

        it('should add the winner to the topic if a winner message is set', function() {
            game.endGame();

            stubTopic.should.have.been.calledWithExactly('foo', { nick: 'Frederick' });
        });

    });

    describe('#needPlayers()', function() {

        beforeEach(function() {
            bot.config.minPlayers = 3;
            game.round = 0;
            game.players = _.cloneDeep(fixtures.players).slice(0, 2);
        });

        it('should return true if there are not enough players', function() {
            sinon.spy(game, 'needPlayers');

            game.needPlayers();

            game.needPlayers.returned(1).should.be.true;

            game.needPlayers.restore();
        });

        it('should return false if there are enough players', function() {
            sinon.spy(game, 'needPlayers');
            game.players= _.cloneDeep(fixtures.players);

            game.needPlayers();

            game.needPlayers.returned(0).should.be.true;

            game.needPlayers.restore();
        });

        it('should start a timer to stop the game after waiting', function() {
            var clock = sinon.useFakeTimers();
            var stubTimer = sinon.stub(clock, 'setTimeout');
            game.timers = { stop: 'test' };

            game.needPlayers();

            stubTimer.should.have.been.called;
            should.not.exist(game.timers.stop);

            clock.setTimeout.restore();
            clock.restore();
        });

        it('should set the game state to WAITING if rounds have been played', function() {
            game.state = game.STATES.PAUSED;

            game.needPlayers();

            game.state.should.equal(game.STATES.PAUSED);

            game.round = 1;

            game.needPlayers();

            game.state.should.equal(game.STATES.WAITING);
        });

        it('should call #showPoints() if rounds have been played', function() {
            var stubPoints = sinon.stub(game, 'showPoints');

            game.needPlayers();

            stubPoints.should.not.have.been.called;

            game.round = 1;

            game.needPlayers();

            stubPoints.should.have.been.calledWithExactly('round');

            stubPoints.restore();
        });

        it('should use config.minPlayers for the first round only', function() {
            sinon.spy(game, 'needPlayers');

            bot.config.minPlayers = 5;
            game.players= _.cloneDeep(fixtures.players);

            game.round = 0;
            game.needPlayers();

            game.needPlayers.returned(1).should.be.true;

            game.needPlayers.reset();

            game.round = 1;
            game.needPlayers();

            game.needPlayers.returned(0).should.be.true;

            game.needPlayers.restore();
        });

        it('should announce how many extra players are needed', function() {
            var stubSay = sinon.stub(bot.client, 'say');

            game.needPlayers();

            stubSay.should.not.have.been.called;

            game.round = 1;

            game.needPlayers();

            stubSay.should.have.been.calledWithExactly(
                '#test',
                'Need 1 more player');

            stubSay.restore();
        });

    });

    describe('#setCzar()', function() {

        beforeEach(function() {
            game.players = _.cloneDeep(fixtures.players);
            game.czar = game.players[1];
            game.players = _.map(game.players, function(player) {
                player.isCzar = (game.czar == player);
                return player;
            });
        });

        after(function() {
            game.players = _.cloneDeep(fixtures.players);
            game.czar = game.players[1];
        });

        it('should set the game czar to the next player', function() {
            game.setCzar();

            game.czar.should.deep.equal(game.players[2]);
        });

        it('should cycle back to the first player when at the end', function() {
            game.czar = game.players[3];

            game.setCzar();

            game.czar.should.deep.equal(game.players[0]);
        });

        it('should set the czar\'s Player object\'s isCzar', function() {
            game.setCzar();

            game.players[2].isCzar.should.be.true;
        });

    });

    describe('#deal()', function() {

        var answerCards = [];

        beforeEach(function() {
            var len = game.players.length * 10;
            while(answerCards.length < len) {
                answerCards = answerCards.concat(_.cloneDeep(cards.cards.responses));
            }
            game.decks = {
                answer: new Cards(answerCards, 'a'),
                question: new Cards(cards.cards.calls, 'q')
            };
            game.discards = {
                answer: new Cards(),
                question: new Cards()
            };
            game.players = _.map(game.players, function(player) {
                player.cards = new Cards();
                return player;
            });
        });

        it('should deal each player up to 10 cards', function() {
            game.players[0].cards.cards.length.should.equal(0);

            game.deal();

            game.players[0].cards.cards.length.should.equal(10);
            game.players[1].cards.cards.length.should.equal(10);
        });

        it('should set each card\'s owner to the player', function() {
            game.deal();

            game.players[0].cards.cards[0].owner.should.equal(game.players[0]);
        });

        it('should stop the game if there aren\'t enough cards', function() {
            var stubLog = sinon.stub(bot, 'log');
            var stubStop = sinon.stub(game, 'stop');

            game.decks.answer.cards = game.decks.answer.cards.slice(0, 20);

            game.deal();

            stubStop.should.have.been.called;

            stubStop.restore();
            stubLog.restore();
        });

    });

    describe('#clean()', function() {

        var stubCheck;
        var stubNextRound;

        before(function() {
            stubCheck = sinon.stub(game, 'checkDecks');
            stubNextRound = sinon.stub(game, 'nextRound');
        });

        after(function() {
            stubCheck.restore();
            stubNextRound.restore();
        });

        beforeEach(function() {
            game.table = {
                question: cards.cards.calls[1],
                answer:   [
                    new Cards(cards.cards.responses),
                    new Cards(cards.cards.responses)
                ]
            };
            game.discards = {
                question: new Cards(),
                answer: new Cards()
            };
            game.table.answer[0].cards = _.map(game.table.answer[0].cards, function(card) {
                card.owner = _.sample(game.players);
                return card;
            });
            game.table.answer[1].cards = _.map(game.table.answer[1].cards, function(card) {
                card.owner = _.sample(game.players);
                return card;
            });
            game.players = _.cloneDeep(fixtures.players);
        });

        it('should discard the table question', function() {
            var question = _.cloneDeep(game.table.question);

            game.clean();

            should.not.exist(game.table.question);
            game.discards.question.cards.length.should.equal(1);
            game.discards.question.cards[0].should.deep.equal(question);
        });

        it('should discard the table answers', function() {
            var spyClean = sinon.spy(game, 'cleanCards');

            game.discards.answer.cards.length.should.equal(0);

            game.clean();

            game.discards.answer.cards.length.should.equal(24);

            game.cleanCards.restore();
        });

        it('should reset each player\'s hasPlayed', function() {
            game.players[0].hasPlayed.should.be.true;

            game.clean();

            game.players[0].hasPlayed.should.be.false;
        });

        it('should reset the czar\'s isCzar', function() {
            game.players[1].isCzar.should.be.true;

            game.clean();

            game.players[1].isCzar.should.be.false;
        });

        it('should remove any inactive players and list them', function() {
            bot.config.maxIdleRounds = 1;
            game.players[2].nick.should.equal('Vladimir');
            game.players[2].inactiveRounds.should.equal(1);

            game.clean();

            game.players[2].nick.should.not.equal('Vladimir');
        });

        it('should set the game state to WAITING if there are still players', function() {
            game.state = game.STATES.ROUND_END;

            game.clean();

            game.state.should.equal(game.STATES.WAITING);
        });

    });

    describe('#drawCards()', function() {

        var stubCheck, answerCards;

        before(function() {
            game.table = {
                question: cards.cards.calls[1]
            };
            stubCheck = sinon.stub(game, 'checkDecks');
        });

        after(function() {
            stubCheck.restore();
        });

        beforeEach(function() {
            answerCards = _.cloneDeep(cards.cards.responses);
            game.decks = {
                answer: new Cards(answerCards.concat(answerCards), 'a')
            };
            game.players = _.map(game.players, function(player) {
                player.cards = new Cards([ cards.cards.responses[0] ], 'a');
                return player;
            });
        });

        it('should top up all the players\' cards by the required number', function() {
            game.players[0].cards.cards.length.should.equal(1);

            game.drawCards(2);

            game.players[0].cards.cards.length.should.equal(3);
        });

        it('should draw the number specified by the table question card', function() {
            game.players[0].cards.cards.length.should.equal(1);
            game.table.question.draw.should.equal(1);

            game.drawCards();

            game.players[0].cards.cards.length.should.equal(2);
        });

        it('should set the owner field of the card to the player', function() {
            game.drawCards();

            var player = game.players[0];
            player.cards.cards[1].owner.should.equal(player);
        });

    });

    describe('#playQuestion()', function() {

        var stubCheck, stubDraw;

        before(function() {
            stubCheck = sinon.stub(game, 'checkDecks');
            stubDraw = sinon.stub(game, 'drawCards');
            game.table = {};
        });

        after(function() {
            stubCheck.restore();
            stubDraw.restore();
        });

        beforeEach(function() {
            game.decks = { question: new Cards([ cards.cards.calls[1] ], 'q') };
        });

        it('should call #checkDecks()', function() {

            game.playQuestion();

            stubCheck.should.have.been.called;
        });

        it('should announce the question card', function() {
            var stubSay = sinon.stub(bot.client, 'say');

            game.playQuestion();

            stubSay.should.have.been.calledWithExactly(
                '#test',
                '\u0002CARD:\u0002 I never truly understood ___ until I encountered ___.' +
                '\u0002 [PICK 2]\u0002');

            stubSay.restore();
        });

        it('should set the table question', function() {
            game.table.question = {};

            game.playQuestion();

            game.table.question.should.deep.equal(cards.cards.calls[1]);
        });

        it('should draw new cards for the players', function() {
            game.playQuestion();

            stubDraw.should.have.been.called;
        });

        it('should start the round timers', function() {
            var stubStartRoundTimers = sinon.stub(game, 'startRoundTimers');

            game.playQuestion();

            stubStartRoundTimers.should.have.been.called;

            stubStartRoundTimers.restore();
        });

        it('should set the game state to PLAYABLE', function() {
            game.state = game.STATES.PAUSED;

            game.playQuestion();

            game.state.should.equal(game.STATES.PLAYABLE);
        });

    });

    describe('#playCard()', function() {

        var stubNotice, player;

        before(function() {
            game.table = {
                question: new Cards(cards.cards.calls).cards[1],
                answer:   []
            };
            game.players = _.cloneDeep(fixtures.players);
            stubNotice = sinon.stub(bot.client, 'notice');
        });

        after(function() {
            stubNotice.restore();
        });

        beforeEach(function() {
            game.state = game.STATES.PLAYABLE;
            game.table.answer = [];
            player = _.cloneDeep(game.players[2]);
            player.cards = new Cards(cards.cards.responses);
            stubNotice.reset();
        });

        it('should say if the game is paused', function() {
            game.state = game.STATES.PAUSED;

            var response = game.playCard([ 0 ], player);

            response.should.equal('Game is currently paused.');
        });

        it('should fail if player is not set', function() {
            var stubWarn = sinon.stub(bot, 'warn');
            player = undefined;

            game.playCard([ 0 ], player);

            stubWarn.should.have.been.calledWithExactly('Invalid player tried to play a card');

            stubWarn.restore();
        });

        it('should tell the player if the game isn\'t in playable state', function() {
            game.state = game.STATES.PLAYED;

            var response = game.playCard([ 0 ], player);

            response.should.equal('Can\'t play at the moment.');
        });

        it('should tell the player if they don\'t have cards to play', function() {
            player = _.cloneDeep(game.players[3]);

            var response = game.playCard([ 0 ], player);

            response.should.equal('Can\'t play at the moment.');
        });

        it('should tell the player if they can\'t play because czar', function() {
            player = _.cloneDeep(game.players[1]);

            var response = game.playCard([ 0 ], player);

            response.should.match(/^You are the Card Czar/);
        });

        it('should update the player\'s pick if they\'ve already played', function() {
            game.table = {
                question: new Cards(cards.cards.calls).cards[0],
                answer:   []
            };
            player.cards = new Cards(cards.cards.repick);
            game.playCard([ 0 ], player);

            game.table.answer.length.should.equal(1);
            game.table.answer[0].cards[0].text.should.equal('one');
            stubNotice.should.have.been.called;

            game.playCard([ 1 ], player);

            game.table.answer.length.should.equal(1);
            game.table.answer[0].cards[0].text.should.equal('two');
            stubNotice.should.have.been.calledWith('Vladimir', 'Changing your pick...');
        });

        it('should correctly handle repicks with multiple cards', function() {
            game.table.question = new Cards(cards.cards.calls).cards[1];
            player.cards = new Cards(cards.cards.repick);
            game.playCard([ 5, 1 ], player);

            game.table.answer.length.should.equal(1);
            game.table.answer[0].cards[0].text.should.equal('six');
            game.table.answer[0].cards[1].text.should.equal('two');
            stubNotice.should.have.been.called;

            game.playCard([ 1, 5 ], player);

            game.table.answer.length.should.equal(1);
            game.table.answer[0].cards[0].text.should.equal('two');
            game.table.answer[0].cards[1].text.should.equal('six');
            stubNotice.should.have.been.calledWith('Vladimir', 'Changing your pick...');

            game.playCard([ 1, 2 ], player);

            game.table.answer[0].cards[0].text.should.equal('two');
            game.table.answer[0].cards[1].text.should.equal('three');
        });

        it('should tell the player if they\'ve played the wrong number of cards', function() {
            var response = game.playCard([ 0 ], player);

            response.should.equal('You must pick 2 different cards.');
        });

        it('should send a notice to the player if the card number picked does not exist', function() {
            game.playCard([ 0, 99 ], player);

            stubNotice.should.have.been.calledWithExactly('Vladimir', 'Invalid card index');
        });

        it('should add the played card to the table answers list', function() {
            game.table.answer.length.should.equal(0);

            game.playCard([0, 1], player);

            game.table.answer.length.should.equal(1);
        });

        it('should update the Player object', function() {
            game.playCard([0, 1], player);

            player.hasPlayed.should.be.true;
            player.inactiveRounds.should.equal(0);
        });

        it('should show the player their entry', function() {
            game.playCard([ 0, 1 ], player);

            stubNotice.should.have.been.calledWithExactly('Vladimir',
                'You played: I never truly understood \u0002switching to Geico®\u0002 until I encountered \u0002bling\u0002.');
        });

        it('should call #coolOffPeriod() if everyone has played', function() {
            var stubCoolOffPeriod = sinon.stub(game, 'coolOffPeriod');
            game.players = _.map(game.players, function(player) {
                player.hasPlayed = true;
                return player;
            });

            game.playCard([ 0, 1], player);

            stubCoolOffPeriod.should.have.been.called;

            stubCoolOffPeriod.restore();
        });

    });

    describe.skip('#coolOffPeriod()', function() {

        before(function() {
            bot.config.coolOffPeriod = 0;
        });

        it('should call #announceWinner()', function() {
            sinon.spy(game, 'announceWinner');

            game.coolOffPeriod(game.announceWinner);

            game.announceWinner.should.have.been.called;

            game.announceWinner.restore();
        });

        it('should call #updateLastWinner()', function() {
            sinon.spy(game, 'updateLastWinner');

            game.coolOffPeriod(game.updateLastWinner);

            game.updateLastWinner.should.have.been.called;

            game.updateLastWinner.restore();
        });

        it('should call #clean()', function() {
            sinon.spy(game, 'clean');

            game.coolOffPeriod(game.clean);

            game.clean.should.have.been.called;

            game.clean.restore();
        });

    });

    describe('#showEntries()', function() {

        var stubSelect, stubClean, stubNextRound, stubEntry;

        before(function() {
            stubSelect    = sinon.stub(game, 'selectWinner');
            stubClean     = sinon.stub(game, 'clean');
            stubNextRound = sinon.stub(game, 'nextRound');
            stubEntry     = sinon.stub(game, 'getFullEntry', function() { return "foo"; });
        });

        after(function() {
            stubSelect.restore();
            stubClean.restore();
            stubNextRound.restore();
            stubEntry.restore();
        });

        beforeEach(function() {
            game.table = {
                question: new Cards(cards.cards.calls),
                answer:   [
                    new Cards(cards.cards.responses),
                    new Cards(cards.cards.responses)
                ]
            };
        });

        it('should stop the round timers', function() {
            var stubStopRoundTimers = sinon.stub(game, 'stopRoundTimers');

            game.showEntries();

            stubStopRoundTimers.should.have.been.called;

            stubStopRoundTimers.restore();
        });

        it('should set the game state to PLAYED', function() {
            game.state = game.STATES.PLAYABLE;

            game.showEntries();

            game.state.should.equal(game.STATES.PLAYED);
        });

        it('should say if nobody has played and call #clean()', function() {
            var stub = sinon.stub(bot.client, 'say');
            game.table.answer = [];

            game.showEntries();

            stub.should.have.been.calledWith('#test', 'No one played on this round.');
            stubClean.should.have.been.called;

            stub.restore();
        });

        it('should pick the default winner if only one person played', function() {
            var stub = sinon.stub(bot.client, 'say');
            game.table = {answer: [ 0 ]};

            game.showEntries();

            stubSelect.should.have.been.calledWithExactly(0, null);
            bot.client.say.should.have.been.calledWithExactly(
                '#test', 'Only one player played and is the winner by default.');

            stub.restore();
        });

        it('should announce and show the filled entries', function() {
            var stub = sinon.stub(bot.client, 'say');

            game.showEntries();

            stub.getCall(0).should.have.been.calledWithExactly(
                '#test', 'OK! Here are the entries:');
            stub.getCall(1).should.have.been.calledWithExactly(
                '#test', '0: foo');
            stub.getCall(2).should.have.been.calledWithExactly(
                '#test', '1: foo');

            stub.restore();
        });

        it('should prompt the czar to pick a winner and start the round timer', function() {
            var stubSay = sinon.stub(bot.client, 'say');
            var stubStartRoundTimers = sinon.stub(game, 'startRoundTimers');

            game.showEntries();

            stubStartRoundTimers.should.have.been.called;
            stubSay.should.have.been.calledWithExactly(
                '#test', 'Napoleon: Select the winner (.winner <entry number>)');

            stubStartRoundTimers.restore();
            stubSay.restore();
        });

    });

    describe.skip('#roundTimerCheck()', function() {
        // This test was written for the old funky round timer system

        var now, timeLeft, stubSelect, stubLog;
        bot.config.timeLimit = 120;

        before(function() {
            now = moment().toDate();
            timeLeft = function(seconds) {
                var start = moment(now)
                            .subtract(bot.config.timeLimit, 'seconds')
                            .add(seconds, 'seconds')
                            .toDate();
                return start;
            };
        });

        beforeEach(function() {
            stubMark   = sinon.stub(game, 'markInactivePlayers');
            stubShow   = sinon.stub(game, 'showEntries');
            stubStatus = sinon.stub(game, 'showStatus');
            stubLog    = sinon.stub(bot, 'log');
        });

        afterEach(function() {
            stubMark.restore();
            stubShow.restore();
            stubStatus.restore();
            stubLog.restore();
        });

        it('should show the entries played if some players run out of time to pick', function() {
            game.roundStarted = timeLeft(-1);

            game.turnTimerCheck(now);

            stubShow.should.have.been.called;
        });

        it('should also tell the channel and increment the czar\'s idle counter', function() {
            var stubSay = sinon.stub(bot.client, 'say');
            game.roundStarted = timeLeft(-1);

            game.turnTimerCheck(now);

            stubSay.should.have.been.calledWith('#test', 'Time is up!');
            stubMark.should.have.been.called;

            stubSay.restore();
        });

        it('should say how much time is left if less than a minute', function() {
            var stubSay = sinon.stub(bot.client, 'say');

            game.roundStarted = timeLeft(90);
            game.turnTimerCheck(now);

            stubSay.should.not.have.been.called;

            game.roundStarted = timeLeft(55);
            game.turnTimerCheck(now);

            stubSay.should.have.been.calledWith('#test', 'Hurry up, 1 minute left!');
            stubStatus.should.have.been.called;

            game.roundStarted = timeLeft(25);
            game.turnTimerCheck(now);

            stubSay.should.have.been.calledWith('#test', '30 seconds left!');

            game.roundStarted = timeLeft(9);
            game.turnTimerCheck(now);

            stubSay.should.have.been.calledWith('#test', '10 seconds left!');

            stubSay.restore();
        });

    });

    describe.skip('#winnerTimerCheck()', function() {
        // This test was written for the old funky round timer system

        var now, timeLeft, stubSelect, stubLog;
        bot.config.timeLimit = 120;

        before(function() {
            now = moment().toDate();
            timeLeft = function(seconds) {
                var start = moment(now)
                            .subtract(bot.config.timeLimit, 'seconds')
                            .add(seconds, 'seconds')
                            .toDate();
                return start;
            };
        });

        beforeEach(function() {
            stubSelect = sinon.stub(game, 'selectWinner');
            stubLog    = sinon.stub(bot, 'log');
            game.table = { answer: [ 0 ] };
        });

        afterEach(function() {
            stubSelect.restore();
            stubLog.restore();
        });

        it('should select the winner if the czar runs out of time to pick', function() {
            game.roundStarted = timeLeft(-1);

            game.winnerTimerCheck(now);

            stubSelect.should.have.been.calledWith(0);
        });

        it('should also tell the channel and increment the czar\'s idle counter', function() {
            var stubSay = sinon.stub(bot.client, 'say');
            game.roundStarted = timeLeft(-1);
            game.czar.inactiveRounds = 0;

            game.winnerTimerCheck(now);

            stubSay.should.have.been.calledWith('#test', 'Time is up! I will pick the winner this round.');
            game.czar.inactiveRounds.should.equal(1);

            stubSay.restore();
        });

        it('should say how much time is left if less than a minute', function() {
            var stubSay = sinon.stub(bot.client, 'say');

            game.roundStarted = timeLeft(90);
            game.winnerTimerCheck(now);

            stubSay.should.not.have.been.called;

            game.roundStarted = timeLeft(55);
            game.winnerTimerCheck(now);

            stubSay.should.have.been.calledWith('#test', 'Napoleon: Hurry up, 1 minute left!');

            game.roundStarted = timeLeft(25);
            game.winnerTimerCheck(now);

            stubSay.should.have.been.calledWith('#test', 'Napoleon: 30 seconds left!');

            game.roundStarted = timeLeft(9);
            game.winnerTimerCheck(now);

            stubSay.should.have.been.calledWith('#test', 'Napoleon: 10 seconds left!');

            stubSay.restore();
        });

    });

    describe('#announceWinner()', function() {
        beforeEach(function() {
            game.state = game.STATES.PLAYED;
            game.table = {
                question: cards.cards.calls[0],
                answer:   [
                    new Cards([ cards.cards.responses[0] ])
                ]
            };
            game.decks = {
                answer:   new Cards(cards.cards.responses),
                question: new Cards(cards.cards.calls)
            };
            game.discards = {
                answer: new Cards(),
                question: new Cards()
            };
            winner = _.cloneDeep(_.head(fixtures.players));
            game.points = [
                {
                    user:     winner.user,
                    hostname: winner.hostname,
                    player:   winner,
                    points:   winner.points
                }
            ];
            game.table.answer[0].cards[0].owner = winner;
        });

        it('should change the game state to ROUND_END', function() {
            var stubClean     = sinon.stub(game, 'clean');

            game.announceWinner(game.table.answer[0]);

            game.state.should.equal(game.STATES.ROUND_END);

            stubClean.restore();
        });

        it('should announce the winning entry', function() {
            var saySpy = sinon.spy(bot.client, 'say');

            game.announceWinner(game.table.answer[0]);

            bot.client.say.should.have.been.calledWithMatch('#test', /^Winner: /);

            bot.client.say.restore();
        });

    });

    describe('#selectWinner()', function() {

        var winner, czar, stubNextRound;

        before(function() {
            stubNextRound = sinon.stub(game, 'nextRound');
        });

        after(function() {
            stubNextRound.restore();
        });

        beforeEach(function() {
            stubNextRound.reset();
            game.state = game.STATES.PLAYED;
            game.table = {
                question: cards.cards.calls[0],
                answer:   [
                    new Cards([ cards.cards.responses[0] ])
                ]
            };
            game.decks = {
                answer:   new Cards(cards.cards.responses),
                question: new Cards(cards.cards.calls)
            };
            game.discards = {
                answer: new Cards(),
                question: new Cards()
            };
            winner = _.cloneDeep(_.head(fixtures.players));
            czar = _.cloneDeep(fixtures.players[1]);
            game.czar = czar;
            game.points = [
                {
                    user:     winner.user,
                    hostname: winner.hostname,
                    player:   winner,
                    points:   winner.points
                }
            ];
            game.table.answer[0].cards[0].owner = winner;
        });

        it('should update game.winner', function() {
            game.selectWinner(0, czar);

            game.winner.should.equal(game.table.answer[0]);
        });

        it('should call #coolOffPeriod()', function() {
            sinon.spy(game, 'coolOffPeriod');

            game.selectWinner(0, czar);

            game.coolOffPeriod.should.have.been.called;

            game.coolOffPeriod.restore();
        });

        it('should stop the round timers', function() {
            var stubStopRoundTimers = sinon.stub(game, 'stopRoundTimers');

            game.selectWinner(0, czar);

            stubStopRoundTimers.should.have.been.called;

            stubStopRoundTimers.restore();
        });

        it('should fail and warn if the card number picked is not in the list', function() {
            var response = game.selectWinner(99, czar);

            game.points[0].points.should.equal(3);
            response.should.equal('Invalid winner.');
        });

        it('should fail if the player picking is not czar and, if fastPick was *not* used, warn', function() {
            var response = game.selectWinner(0, winner);

            game.points[0].points.should.equal(3);
            response.should.match(/^You are not the Card Czar/);

            response = game.selectWinner(0, winner, true); // fastPick

            game.points[0].points.should.equal(3);
            response.should.be.false;
        });

        it('should fail and warn if the game is paused', function() {
            game.state = game.STATES.PAUSED;

            var response = game.selectWinner(0, czar);

            game.points[0].points.should.equal(3);
            response.should.equal('Game is currently paused.');
        });

    });

    describe('#updateLastWinner()', function() {

        var player;

        before(function() {
            player = _.head(fixtures.players);
            game.lastWinner = {uhost:'~freddy@unaffiliated/fredd', count:1};
        });

        it('should set the lastWinner to the uhost of the player', function() {
            game.lastWinner = {};

            game.updateLastWinner(player);

            game.lastWinner.uhost.should.exist;
            game.lastWinner.uhost.should.equal('~freddy@unaffiliated/fredd');
            game.lastWinner.count.should.equal(1);
        });

        it('should increment the counter if player is already lastWinner', function() {
            game.updateLastWinner(player);

            game.lastWinner.count.should.equal(2);
        });

        it('should say something if multiple wins in a row', function() {
            sinon.spy(bot.client, 'say');

            game.updateLastWinner(player);

            bot.client.say.should.have.been.called;

            bot.client.say.restore();
        });

    });

    describe('#getFullEntry()', function() {

        it('should return an entry with the question blanks filled in', function() {
            var question = _.head(cards.cards.calls);
            var answers = [ _.head(cards.cards.responses) ];

            var entry = game.getFullEntry(question, answers);

            entry.should.equal('What ended my last relationship? \u0002Switching to Geico®\u0002.');
        });

        it('should fill multiple blanks', function() {
            var question = cards.cards.calls[1];
            var answers = cards.cards.responses.slice(0, 2);

            var entry = game.getFullEntry(question, answers);

            entry.should.equal('I never truly understood \u0002switching to Geico®\u0002 until I encountered \u0002bling\u0002.');
        });

        it('should use capitalized answers after certain punctuation', function() {
            var question = _.head(cards.cards.calls);
            var answers = [ _.head(cards.cards.responses) ];

            var entry = game.getFullEntry(question, answers);

            entry.should.equal('What ended my last relationship? \u0002Switching to Geico®\u0002.');

            question.text[0] = 'What ended my last relationship ';

            entry = game.getFullEntry(question, answers);

            entry.should.equal('What ended my last relationship \u0002switching to Geico®\u0002.');

            question.text[0] = 'What ended my last relationship. ';

            entry = game.getFullEntry(question, answers);

            entry.should.equal('What ended my last relationship. \u0002Switching to Geico®\u0002.');

            question.text[0] = 'What ended my last relationship... ';

            entry = game.getFullEntry(question, answers);

            entry.should.equal('What ended my last relationship... \u0002switching to Geico®\u0002.');
        });

    });

    describe('#checkDecks()', function() {

        beforeEach(function() {
            game.decks = {
                answer:   new Cards(cards.cards.responses),
                question: new Cards(cards.cards.calls)
            };
            game.discards = {
                answer: new Cards(),
                question: new Cards()
            };
        });

        it('should swap the game decks for the discards when empty', function() {
            var stub = sinon.stub(bot, 'log');
            var empty = game.discards;
            game.discards = game.decks;
            game.decks = empty;

            game.checkDecks();

            game.decks.answer.cards.should.not.be.empty;
            game.decks.question.cards.should.not.be.empty;
            game.discards.answer.cards.should.be.empty;
            game.discards.question.cards.should.be.empty;

            stub.restore();
        });

    });

    describe('#addPlayer()', function() {

        var player;

        before(function() {
            initGame();
            bot.config.minPlayers = 3;
        });

        beforeEach(function() {
            game.players = _.cloneDeep(fixtures.players);
            player = game.players.shift();
        });

        it('should add a player to the game', function() {
            game.addPlayer(player);

            should.exist(_.find(game.players, {nick: 'Frederick'}));
        });

        it('should say the player was added', function() {
            var stubSay = sinon.stub(bot.client, 'say');

            game.addPlayer(player);

            stubSay.should.have.been.calledWithExactly(
                '#test',
                'Frederick has joined the game.');

            stubSay.restore();
        });

        it('should say how many more players needed if waiting more than 30 seconds', function() {
            var stubSay = sinon.stub(bot.client, 'say');
            game.startTime = moment().toDate();

            game.addPlayer(player);

            stubSay.should.not.have.been.calledWith('#test', sinon.match(/more players/));

            stubSay.reset();
            initGame();
            game.players = [];
            game.startTime = moment().subtract(40, 'seconds').toDate();

            game.addPlayer(player);

            stubSay.should.have.been.calledWith('#test', sinon.match(/more players/));

            stubSay.restore();
        });

        it('should add the player to the points list', function() {
            game.points = [];

            game.addPlayer(player);

            game.points[0].user.should.equal('~freddy');

            game.points = [];
        });

        it('should use existing points.player', function() {
            game.points.push({
                user:     player.user,
                hostname: player.hostname,
                player:   player,
                points:   12
            });

            game.addPlayer(player);

            game.points[0].points.should.equal(12);

            game.points = [];
        });

        it('should start the next round if waiting and there are enough players', function() {
            // minPlayers is 3
            var stub = sinon.stub(game, 'nextRound');

            game.players = [];
            game.addPlayer(player);

            stub.should.not.have.been.called;

            game.players = fixtures.players.slice(1, 2); // get one
            game.addPlayer(player);

            stub.should.not.have.been.called;

            game.state = game.STATES.WAITING;
            game.players = fixtures.players.slice(1, 3); // get two
            game.addPlayer(player);

            stub.should.have.been.called;

            stub.restore();
        });

        it('should voice the new player if voicePlayers is set', function() {
            var mock = sinon.mock(bot.client);
            mock.expects('setChanMode').once().withExactArgs('#test', '+v', 'Frederick');
            bot.config.voicePlayers = true;

            game.addPlayer(player);

            mock.verify();

            mock.restore();
        });

        it('should fail silently if user was previously removed manually', function() {
            game.removed = [ '~freddy@unaffiliated/fredd' ];
            game.players = [];

            game.addPlayer(player);

            game.players.should.be.empty;

            game.removed = [];
        });

        it('should do something about rejoining players');

        it('should fail if player is already in the game', function() {
            var stub = sinon.stub(bot, 'log');
            game.players = [ player ];

            game.addPlayer(player);

            stub.should.have.been.calledWith('Player tried to join again');

            stub.restore();
        });

        it('should restart the wait timer if waitFromLastJoin is set', function() {
            var clock = sinon.useFakeTimers();
            sinon.spy(clock, 'clearTimeout');
            sinon.spy(clock, 'setTimeout');
            game.players = [];
            bot.config.waitFromLastJoin = false;

            game.addPlayer(player);

            clock.clearTimeout.should.not.have.been.called;

            bot.config.waitFromLastJoin = true;
            game.players = [];

            game.addPlayer(player);

            clock.clearTimeout.should.have.been.called;
            clock.setTimeout.should.have.been.called;

            clock.restore;
        });

    });

    describe('#removePlayers()', function() {

        var player;

        beforeEach(function() {
            game.discards = {
                question: new Cards(),
                answer:   new Cards()
            };
            game.players = _.cloneDeep(fixtures.players);
            player = _.head(game.players);
            player.cards.getCards = function() {
                return _.cloneDeep(cards.cards.responses);
            };
            player.cards.reset = function() {
                return player.cards.getCards();
            };
        });

        afterEach(function() {
            game.waitToJoin = [];
        });

        it('should remove the player from the game', function() {
            game.removePlayers(player);

            game.players.should.deep.equal(_.without(game.players, player));
        });

        it('should store players that leave the game');

        it('should not store players if the game hasn\'t started');

        it('should not store players if they were manually removed');

        it('should add the player\'s cards to the discard pile if manually removed');
/*
        , function() {
            game.removePlayers(player);

            game.discards.answer.cards.should.deep.equal(_.cloneDeep(cards.cards.responses));
        });
*/

        it('should say nothing if silent option is passed', function() {
            sinon.spy(bot.client, 'say');

            game.removePlayers(player, {silent: true});

            bot.client.say.should.not.have.been.called;

            bot.client.say.restore();
        });

        it('should say the player left the game if not silent', function() {
            sinon.spy(bot.client, 'say');

            game.removePlayers(player);

            bot.client.say.should.have.been.calledWithExactly(
                '#test',
                'Frederick has left the game');

            bot.client.say.restore();
        });

        it('should devoice the nick if voicePlayers is set', function() {
            sinon.spy(bot.client, 'setChanMode');
            bot.config.voicePlayers = true;

            game.removePlayers(player);

            bot.client.setChanMode.should.have.been.calledWithExactly(
                '#test', '-v', ['Frederick']);

            bot.client.setChanMode.restore();
        });

        it('should not devoice the nick if they left the channel', function() {
            sinon.spy(bot.client, 'setChanMode');
            bot.config.voicePlayers = true;

            game.removePlayers(player, {left: true});

            bot.client.setChanMode.should.not.have.been.called;

            bot.client.setChanMode.restore();
        });

        it('should call #coolOffPeriod() if everyone else has played', function() {
            var stub = sinon.stub(game, 'coolOffPeriod');
            game.state = game.STATES.PLAYABLE;
            game.players = _.map(game.players, function(player) {
                player.hasPlayed = true;
                return player;
            });

            game.removePlayers(player);

            stub.should.have.been.called;

            stub.restore();
        });

        it('should notify if the player was czar and call #selectWinner()', function() {
            var stub = sinon.stub(game, 'selectWinner');
            sinon.spy(bot.client, 'say');
            game.state = game.STATES.PLAYED;
            game.czar = player;
            game.table = { answer: 3 };

            game.removePlayers(player);

            stub.should.have.been.called;
            bot.client.say.should.have.been.calledWithExactly(
                '#test',
                'The Card Czar has fled the scene.');

            stub.restore();
            bot.client.say.restore();
        });

        it('should stop the game if there are no players', function() {
            var stub = sinon.stub(game, 'stop');
            bot.config.stopOnLastPlayerLeave = true;
            game.players = [ player ];

            game.removePlayers(player);

            stub.should.have.been.called;

            stub.restore();
        });

    });

    describe('#getNotPlayed()', function() {

        var notPlayed;

        before(function() {
            initGame();
            notPlayed = game.getNotPlayed();
        });

        it('should return a list of players who have not played a card', function() {
            notPlayed.should.not.be.empty;
        });

        it('should ignore the czar', function() {
            should.not.exist(_.find(notPlayed, {nick: 'Napoleon'}));
        });

        it('should ignore players without cards', function() {
            notPlayed = game.getNotPlayed();

            should.not.exist(_.find(notPlayed, {nick: 'Julius'}));
        });

    });

    describe('#markInactivePlayers()', function() {
        before(function() {
            game.players = _.cloneDeep(fixtures.players);
        });

        after(function() {
            game.players = _.cloneDeep(fixtures.players);
        });

        it('should increment the inactiveRounds field of Player objects from getNotPlayed()', function() {
            game.markInactivePlayers();

            _.each(game.players, function(player) {
                if (player.nick === 'Vladimir')
                    player.inactiveRounds.should.equal(2);
                else
                    player.inactiveRounds.should.equal(0);
            });
        });

    });

    describe('#showCards()', function() {

        var player, noticeSpy;

        before(function() {
            player = _.cloneDeep(_.head(fixtures.players));
            player.cards.getCards = function() {
                return _.cloneDeep(cards.cards.responses.slice(0,2));
            };
            bot.client.opt = { messageSplit: 400};
        });

        beforeEach(function() {
            noticeSpy = sinon.spy(bot.client, 'notice');
        });

        afterEach(function() {
            bot.client.notice.restore();
        });

        it('should send the player a notice with their cards numbered', function() {
            game.showCards(player);

            bot.client.notice.should.have.been.calledOnce;
            bot.client.notice.should.have.been.calledWithExactly(
                'Frederick',
                'Your cards are:\u0002 [0] \u0002Switching to Geico®\u0002 [1] \u0002Bling');
        });

        it('should split the notice according to the supported message length', function() {
            bot.client.opt.messageSplit = 50;

            game.showCards(player);

            bot.client.notice.should.have.been.calledTwice;
            bot.client.notice.should.have.been.calledWithExactly(
                'Frederick',
                'Your cards are:\u0002 [0] \u0002Switching to Geico® ...');
            bot.client.notice.should.have.been.calledWithExactly(
                'Frederick',
                '\u0002 [1] \u0002Bling');
        });

    });

    describe('#playerNickChangeHandler()', function() {

        it('should update the Player object associated with the nick', function() {
            var oldNick = 'Vladimir',
                newNick = 'Boris';

            game.playerNickChangeHandler(oldNick, newNick);

            game.players[2].nick.should.equal('Boris');
        });

    });

    describe('#playerLeaveHandler()', function() {

        it('should call #removePlayers() with Player object', function() {
            initGame();
            sinon.spy(game, 'removePlayers');
            var removed = _.head(game.players);

            game.playerLeaveHandler('Frederick');

            game.removePlayers.should.have.been.calledOnce;
            game.removePlayers.should.have.been.calledWithExactly(removed, {left: true});

            game.removePlayers.restore();
        });

    });

    describe('#showPoints()', function() {

        var saySpy;

        before(function() {
            initGame();
            game.points = [];
            game.pointLimit = 1;
            _.each(game.players, function(player) {
                game.points.push({
                    user:     player.user,
                    hostname: player.hostname,
                    player:   player,
                    points:   player.points
                });
            });
        });

        beforeEach(function() {
            saySpy = sinon.spy(bot.client, 'say');
        });

        afterEach(function() {
            bot.client.say.restore();
        });

        it('should announce the final scores', function() {
            game.showPoints();

            bot.client.say.should.have.been.calledWithMatch(
                /^#test$/,
                new RegExp('^The most horrible people: ' +
                    '(\u0002\\w+\u0002: \u0002\\d\u0002, ){3}' +
                     '\u0002\\w+\u0002: \u0002\\d\u0002$')
            );
        });

        it('should show just the pointLimit before the first round', function() {
            game.showPoints('start');

            bot.client.say.should.have.been.calledOnce;
            bot.client.say.should.have.been.calledWithExactly(
                '#test',
                'Needed to win: \u00021\u0002'
            );
        });

        it('should not show the point limit in infinity games');

        it('should show the current scores and pointLimit after a round', function() {
            game.showPoints('round');

            bot.client.say.should.have.been.calledTwice;
            bot.client.say.should.have.been.calledWithMatch(
                /^#test$/,
                new RegExp('^Current scores: ' +
                    '(\u0002\\w+\u0002: \u0002\\d\u0002, ){3}' +
                     '\u0002\\w+\u0002: \u0002\\d\u0002$')
            );
            bot.client.say.should.have.been.calledWithExactly(
                '#test',
                'Needed to win: \u00021\u0002'
            );
        });

    });

    describe('#showStatus()', function() {

        var saySpy;

        before(function() {
            initGame();
        });

        beforeEach(function() {
            saySpy = sinon.spy(bot.client, 'say');
        });

        afterEach(function() {
            bot.client.say.restore();
        });

        it('should say if the game is stopped', function() {
            game.state = game.STATES.STOPPED;

            game.showStatus();

            bot.client.say.should.have.been.calledOnce;
            bot.client.say.should.have.been.calledWithExactly(
                '#test',
                '\u0002Status:\u0002 Game has been stopped.');
        });

        it('should say if the game is paused', function() {
            game.state = game.STATES.PAUSED;

            game.showStatus();

            bot.client.say.should.have.been.calledOnce;
            bot.client.say.should.have.been.calledWithExactly(
                '#test',
                '\u0002Status:\u0002 Game is paused.');
        });

        it('should say if the game is between rounds', function() {
            game.state = game.STATES.ROUND_END;

            game.showStatus();

            bot.client.say.should.have.been.calledOnce;
            bot.client.say.should.have.been.calledWithExactly(
                '#test',
                '\u0002Status:\u0002 Round has ended and next one is starting.');
        });

        it('should say how many players are needed to continue', function() {
            game.state = game.STATES.WAITING;
            game.players = _.cloneDeep(fixtures.players).slice(0, 2);

            game.showStatus();

            bot.client.say.should.have.been.calledOnce;
            bot.client.say.should.have.been.calledWithExactly(
                '#test',
                '\u0002Status:\u0002 Waiting for 1 players to join.');

            game.players = _.cloneDeep(fixtures.players);
        });

        it('should say if waiting for czar to pick', function() {
            game.state = game.STATES.PLAYED;

            game.showStatus();

            bot.client.say.should.have.been.calledOnce;
            bot.client.say.should.have.been.calledWithExactly(
                '#test',
                '\u0002Status:\u0002 Waiting for Napoleon to select the winner.');
        });

        it('should say if waiting for players to play', function() {
            game.state = game.STATES.PLAYABLE;

            game.showStatus();

            bot.client.say.should.have.been.calledOnce;
            bot.client.say.should.have.been.calledWithExactly(
                '#test',
                '\u0002Status:\u0002 Napoleon is the Card Czar. Waiting for players to play: Vladimir');
        });

    });

    describe('#channelLeaveHandler()', function() {

        it('should pause a running game when leaving', function() {
            var stub = sinon.stub(bot, 'warn');
            game.state = game.STATES.PLAYABLE;
            game.roundStarted = new Date();

            game.channelLeaveHandler();

            game.state.should.equal(game.STATES.PAUSED);

            stub.restore();
        });

    });

    describe('#channelRejoinHandler()', function() {

        var mock;

        beforeEach(function() {
            mock = sinon.mock(bot.client);
        });

        afterEach(function() {
            mock.restore();
        });

        it('should warn if joining while a game is running and pause the game', function() {
            var stub = sinon.stub(bot, 'warn');
            mock.expects('say').once().withArgs(
                '#test',
                'Error: Joined while game in progress. Pausing...');
            mock.expects('say').once().withArgs(
                '#test',
                'Game is now paused. Type .resume to begin playing again.');
            game.state = game.STATES.PLAYABLE;
            game.roundStarted = new Date();

            game.channelRejoinHandler();

            game.state.should.be.equal(game.STATES.PAUSED);
            mock.verify();
            stub.restore();
        });

        it('should announce if joining while a game is paused', function() {
            var stub = sinon.stub(bot, 'log');
            mock.expects('say').once().withExactArgs(
                '#test',
                'Card bot is back! Type .resume to continue the current game.');
            game.state = game.STATES.PAUSED;

            game.channelRejoinHandler();

            mock.verify();
            stub.restore();
        });

    });

    describe('#toggleListeners()', function() {

        it('should add listeners passed and update internal list', function() {
            var addListenerSpy = sinon.spy(bot.client, 'addListener');
            var listeners = [ ['joinsync' + game.channel, game.channelRejoinHandler   ] ];

            game.toggleListeners(listeners);

            game.listeners.should.deep.equal(listeners);
            bot.client.addListener.should.have.been.calledWithExactly(
                'joinsync#test',
                game.channelRejoinHandler);

            bot.client.addListener.restore();
        });

        it('should remove listeners if nothing passed and update internal list', function() {
            var removeListenerSpy = sinon.spy(bot.client, 'removeListener');

            game.toggleListeners();

            game.listeners.should.be.empty;
            bot.client.removeListener.should.have.been.calledWithExactly(
                'joinsync#test',
                game.channelRejoinHandler);

            bot.client.removeListener.restore();
        });

    });

    describe('#notifyUsers()', function() {

        it('should notify present nicks excluding players and bot', function() {
            var noticeSpy = sinon.spy(bot.client, 'notice');
            var stub = sinon.stub(game, 'getPlayerNicks',
                            function() { return ['jim', 'sarah']; } );

            game.notifyUsers();

            bot.client.notice.should.have.been.calledOnce;
            bot.client.notice.should.have.always.been.calledWith(
                'bob',
                'bob: A new game of Cards Against Humanity just began in #test' +
                    '. Head over and .join if you\'d like to get in on the fun!');

            bot.client.notice.restore();
            stub.restore();
        });

    });

    describe('#setTopic()', function() {

        var addTopic, stub;

        before(function() {
            bot.client.chanData = function() {};
        });

        after(function() {
            delete bot.config.topic;
            delete bot.client.chanData;
        });

        beforeEach(function() {
            addTopic = 'reigning champion: testNick';
            bot.config.topic = {
                position: "right",
                separator: "::",
            };
            stub = sinon.stub(bot.client, 'chanData',
                    function(channel) { return {topic: "Test topic"}; } );

            sinon.spy(bot.client, 'send');
        });

        afterEach(function() {
            bot.client.send.restore();
            stub.restore();
        });

        it('should append a string to the topic (right)', function() {
            game.setTopic(addTopic);

            bot.client.send.should.have.been.calledWith(
                'TOPIC', '#test', 'Test topic :: reigning champion: testNick');
        });

        it('should prepend a string to the topic (left)', function() {
            bot.config.topic.position = "left";

            game.setTopic(addTopic);

            bot.client.send.should.have.been.calledWith(
                'TOPIC', '#test', 'reigning champion: testNick :: Test topic');
        });

        it('should set the topic if empty', function() {
            stub.restore();
            stub = sinon.stub(bot.client, 'chanData',
                        function(channel) { return {}; } );

            game.setTopic(addTopic);

            bot.client.send.should.have.been.calledWith(
                'TOPIC', '#test', ' :: reigning champion: testNick');
        });

        it('should do nothing if the topic would be unchanged', function() {
            stub.restore();
            stub = sinon.stub(bot.client, 'chanData',
                        function(channel) { return {topic: 'Test topic :: reigning champion: testNick'}; } );

            game.setTopic(addTopic);

            bot.client.send.should.not.have.been.called;
        });

        it('should replace topic if separator is blank', function() {
            bot.config.topic.separator = "";

            game.setTopic(addTopic);

            bot.client.send.should.have.been.calledWith(
                'TOPIC', '#test', 'reigning champion: testNick');
        });

        it('should populate a template if passed a data argument', function() {
            addTopic = 'reigning champion: <%= nick %>';
            data = {nick: 'testNick'};

            game.setTopic(addTopic, data);

            bot.client.send.should.have.been.calledWith(
                'TOPIC', '#test', 'Test topic :: reigning champion: testNick');
        });

        it('should use formatting if addTopic is an array', function() {
            addTopic = ['reigning champion: testNick', 'bold.yellow'];

            game.setTopic(addTopic);

            bot.client.send.should.have.been.calledWith(
                'TOPIC', '#test', 'Test topic :: \u000308\u0002reigning champion: testNick\u0002\u0003');
        });

        it('shoud abandon formatting gracefully if formatting string is invalid', function() {
            var stub = sinon.stub(bot, 'log');
            addTopic = ['reigning champion: testNick', 'bold.someUnknownColor'];

            game.setTopic(addTopic);

            stub.should.have.been.calledWithExactly('Invalid format: bold.someUnknownColor');
            bot.client.send.should.have.been.calledWith(
                'TOPIC', '#test', 'Test topic :: reigning champion: testNick');
        });

    });

    describe('#say()', function() {

        it('should call client.say()', function() {
            sinon.spy(bot.client, 'say');

            game.say('foo');

            bot.client.say.should.have.been.calledWith('#test', 'foo');

            bot.client.say.restore();
        });

    });

    describe('#notice()', function() {

        it('should call client.notice()', function() {
            sinon.spy(bot.client, 'notice');

            game.notice('testNick', 'foo');

            bot.client.notice.should.have.been.calledWith('testNick', 'foo');

            bot.client.notice.restore();
        });

    });

    describe('#announce()', function() {

        beforeEach(function() {
            var saySpy = sinon.spy(bot.client, 'say');
        });

        afterEach(function() {
            bot.client.say.restore();
        });

        it('should say a game is starting', function() {
            var stub = sinon.stub(game, 'isChristmas',
                            function() { return false; } );
            game.announce();

            bot.client.say.should.have.been.calledTwice;
            bot.client.say.should.have.been.calledWithExactly(
                '#test',
                '\u000304C\u0003\u000307a\u0003\u000308r\u0003\u000303d\u0003\u000312s\u0003 ' +
                '\u000302A\u0003\u000306g\u0003\u000304a\u0003\u000307i\u0003\u000308n\u0003\u000303s\u0003\u000312t\u0003 ' +
                '\u000302H\u0003\u000306u\u0003\u000304m\u0003\u000307a\u0003\u000308n\u0003' +
                '\u000303i\u0003\u000312t\u0003\u000302y\u0003 ' +
                'is starting! Type .join to join the game any time. (3 players needed)');

            stub.restore();
        });

        it('should change the formatting during Christmas', function() {
            var stub = sinon.stub(game, 'isChristmas',
                            function() { return true; } );
            game.announce();

            bot.client.say.should.have.been.calledTwice;
            bot.client.say.should.have.been.calledWithExactly(
                '#test',
                '\u000308*\u0003\u000304C\u0003\u000303a\u0003\u000304r\u0003\u000303d\u0003\u000304s\u0003 ' +
                '\u000303A\u0003\u000304g\u0003\u000303a\u0003\u000304i\u0003\u000303n\u0003\u000304s\u0003\u000303t\u0003 ' +
                '\u000304H\u0003\u000303u\u0003\u000304m\u0003\u000303a\u0003\u000304n\u0003\u000303i\u0003' +
                '\u000304t\u0003\u000303y\u0003\u000308*\u0003 ' +
                'is starting! Type .join to join the game any time. (3 players needed)');
        });

        it('should notify non-players in the channel', function() {
            var notifySpy = sinon.spy(game, 'notifyUsers');
            bot.config.notifyUsers = true;

            game.announce();

            game.notifyUsers.should.have.been.calledOnce;

            game.notifyUsers.restore();
            bot.config.notifyUsers = false;
        });

    });

    describe('#isChristmas()', function() {

        it('should return true between 10th and 31st December only', function() {
            var dates = {
                nov01: ['2015-11-01', false],
                dec09: ['2015-12-09', false],
                dec10: ['2015-12-10', true],
                dec31: ['2015-12-31', true]
            };
            _.each(dates, function(date) {
                it('recognises ' + date[0] + ' as ' + (!date[0])?'not':'' + ' during Christmas', function() {

                    game.isChristmas(moment(date[0])).should.equal(date[1]);

                });
            });
        });

    });

});
