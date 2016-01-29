var should = require('chai').should(),
         _ = require('lodash');

var fixtures = require('./fixtures/cards').cardData;

var Card = require('../app/models/card');


describe('CardModel', function() {

    it('should throw an exception on bad type arg', function() {
        var noType = function(){ new Card(fixtures.calls.oneSpace); };
        noType.should.throw("Missing or bad argument: type");

        var badType = function(){ new Card(fixtures.calls.oneSpace, 'x'); };
        badType.should.throw("Missing or bad argument: type");
    });

    it('should throw an exception on missing data', function() {
        var missingId = function() { new Card(fixtures.calls.missingId, 'q'); };
        missingId.should.throw("Missing data: id");

        var missingNumResponses = function() { new Card(fixtures.calls.missingNumResponses, 'q'); };
        missingNumResponses.should.throw("Missing data: numResponses");

        var missingDisplayText = function() { new Card(fixtures.responses.missingDisplayText, 'a'); };
        missingDisplayText.should.throw("Missing data: displayText");
    });

    it('should create a valid Card object', function() {
        var oneSpace = new Card(fixtures.calls.oneSpace, 'q');

        oneSpace.id.should.equal("02f20bad-99cc-47c3-958c-fa11a8cf92ed");
        oneSpace.type.should.equal('Question');
        oneSpace.draw.should.equal(0);
        oneSpace.displayText.should.equal("What ended my last relationship? ___.");

        var one = new Card(fixtures.responses.one, 'a');

        one.id.should.equal("0064b920-a058-4a48-a16c-4396ef867174");
        one.type.should.equal('Answer');
        one.draw.should.equal(0);
        one.displayText.should.equal("Switching to Geico®");
    });

    it('should handle multiple blanks in question cards', function() {
        var twoBlank = new Card(fixtures.calls.twoBlank, 'q');

        twoBlank.pick.should.equal(2);
        twoBlank.draw.should.equal(1);
        twoBlank.displayText.should.equal("I never truly understood ___ until I encountered ___.");
    });

    it('should strip trailing dots in answers and trim whitespace', function() {
        var trim = new Card(fixtures.calls.trim, 'q');
        var strip = new Card(fixtures.responses.strip, 'a');

        trim.displayText.should.equal("I never truly understood ___ until I encountered ___.");
        strip.displayText.should.equal('Bling');
    });

    it('should strip double-spacing', function() {
        var doubleSpace = [
            [ new Card(fixtures.calls.doubleSpace, 'q'), "I never truly understood ___ until I encountered ___." ],
            [ new Card(fixtures.responses.doubleSpace, 'a'), "Switching to Geico®" ]
        ];

        _.each(doubleSpace, function(card) {
            card[0].displayText.should.equal(card[1]);
        });
    });

    it('should remove parentheses around answers', function() {
        var parentheses = new Card(fixtures.calls.parentheses, 'q');

        parentheses.displayText.should.equal("I never truly understood ___ until I encountered ___.");
    });

    it('should force certain leading words to lowercase in answer.text', function() {
        var card, data, template = fixtures.responses.one;
        //var forceToLower = /^(A|An|The|Your|My|\w+ing|\w+es|\w+ly)$/;
        var words = ['A', 'An', 'The', 'Your', 'My', 'Doing', 'Dishes', 'Happily'];
        _.each(words, function(word) {
            data = _.cloneDeep(template);
            data.text = word + ' ' + data.text;
            card = new Card(data, 'a');
            card.text.should.match(/^[a-z]/);
        });
    });

    it('should force capitalize leading words in answer.displayText', function() {
        var data = fixtures.responses.one;
        data.displayText = "switching to Geico®";
        card = new Card(data, 'a');

        card.displayText.should.equal('Switching to Geico®');
    });

});
