var should = require('chai').should(),
         _ = require('lodash');

var fixtures      = require('./fixtures/cards'),
    data          = fixtures.cardData,
    dataCalls     = _.omit(data.calls, [ 'missingId', 'missingNumResponses' ]),
    dataResponses = _.omit(data.responses, [ 'missingDisplayText' ]);

var Cards = require('../app/controllers/cards');

describe('CardsController', function() {

    it('should create a Cards object with valid cards from Card objects', function() {
        var qCards = new Cards(fixtures.cards.calls, 'q'),
            aCards = new Cards(fixtures.cards.responses, 'a');

        qCards.cards.should.deep.equal(fixtures.cards.calls);
        aCards.cards.should.deep.equal(fixtures.cards.responses);
    });

    it('should create a Cards object with valid cards from data', function() {
        var qCards = new Cards(dataCalls, 'q'),
            aCards = new Cards(dataResponses, 'a');

        qCards.cards.slice(0, 2).should.deep.equal(fixtures.cards.calls.slice(0, 2));
        aCards.cards.slice(0, 2).should.deep.equal(fixtures.cards.responses.slice(0, 2));
    });

    it('should create an empty Cards object if called without args', function() {
        var cards = new Cards();

        cards.addCard.should.be.a.function;
    });

    describe('#reset()', function() {

        it('should reset to empty and return old cards', function() {
            var cards = new Cards(fixtures.cards.calls, 'q'),
                removedCards = cards.reset();

            cards.cards.should.be.empty;
            removedCards.should.deep.equal(_.values(fixtures.cards.calls));
        });

        it('should reset to specified cards list and return old cards', function() {
            var cards = new Cards(fixtures.cards.calls, 'q'),
                oldCardsObj = _.clone(cards),
                newCards = _.head(fixtures.cards.calls),
                oldCards = cards.reset(newCards);

            cards.cards.should.deep.equal(newCards);
            oldCards.should.deep.equal(oldCardsObj.cards);
        });

    });

    describe('#addCard()', function() {

        it('should add a card and return it', function() {
            var cards = new Cards(_.initial(fixtures.cards.calls), 'q'),
                addCard = _.last(fixtures.cards.calls),
                newCard = cards.addCard(addCard, 'q');

            cards.cards.should.deep.equal(fixtures.cards.calls);
            newCard.should.deep.equal(addCard);
        });

    });

    describe('#removeCard()', function() {

        it('should remove a card and return it', function() {
            var cards = new Cards(fixtures.cards.calls, 'q'),
                removeCard = _.last(fixtures.cards.calls),
                oldCard = cards.removeCard(removeCard, 'q');

            cards.cards.should.deep.equal(_.initial(fixtures.cards.calls));
            oldCard.should.deep.equal(removeCard);
        });

    });

    describe('#pickCards()', function() {

        it('should remove a single card by index and return it', function() {
            var cards = new Cards(fixtures.cards.responses, 'a'),
                pickCard = _.head(fixtures.cards.responses),
                picked = cards.pickCards(0);

            picked.should.deep.equal(pickCard);
            cards.cards.should.deep.equal(_.tail(fixtures.cards.responses));
        });

        it('should remove multiple cards by index and return a Cards object containing them', function() {
            var cards = new Cards(fixtures.cards.responses, 'a'),
                pickCards = fixtures.cards.responses.slice(0, 2),
                picked = cards.pickCards([ 0, 1 ]);

            picked.cards.should.deep.equal(pickCards);
            cards.cards.length.should.equal(10);
        });

        it('should pick the first card in the list if none specified', function() {
            var cards = new Cards(fixtures.cards.responses, 'a'),
                pickCard = _.head(fixtures.cards.responses),
                picked = cards.pickCards();

            picked.should.deep.equal(pickCard);
            cards.cards.should.deep.equal(_.tail(fixtures.cards.responses));
        });

    });

});
