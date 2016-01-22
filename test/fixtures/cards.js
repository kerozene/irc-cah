var _ = require('lodash');

var Card = require('../../app/models/card');

var fixtures = {};

fixtures.cardData = {
    calls: {
        missingId: {
            text: [" I never truly understood "," until I encountered ",". "],
            numResponses: 2
        },
        missingNumResponses: {
            id: "1b29cdad-d4d6-4b9f-bb04-540b4aa5e763",
            text: [" I never truly understood "," until I encountered ",". "],
        },
        oneSpace: {
            id: "02f20bad-99cc-47c3-958c-fa11a8cf92ed",
            text: ["What ended my last relationship? ","."],
            numResponses: 1
        },
        twoBlank: {
            id: "1b29cdad-d4d6-4b9f-bb04-540b4aa5e763",
            text: ["I never truly understood "," until I encountered ","."],
            numResponses: 2
        },
        trim: {
            id: "1b29cdad-d4d6-4b9f-bb04-540b4aa5e763",
            text: [" I never truly understood "," until I encountered ",". "],
            numResponses: 2
        },
        doubleSpace: {
            id: "1b29cdad-d4d6-4b9f-bb04-540b4aa5e763",
            text: ["I never  truly understood "," until I encountered ","."],
            numResponses: 2
        },
        parentheses: {
            id: "1b29cdad-d4d6-4b9f-bb04-540b4aa5e763",
            text: ["I never truly understood (",") until I encountered (",")."],
            numResponses: 2
        }
    },
    responses: {
        missingDisplayText: {
            id: "0064b920-a058-4a48-a16c-4396ef867174",
            text: "switching to Geico®"
        },
        one: {
            id: "0064b920-a058-4a48-a16c-4396ef867174",
            text: "switching to Geico®",
            displayText: "Switching to Geico®"
        },
        strip: {
            id: "0130dbe6-2517-430b-a8c8-1ef0d5d06953",
            text: "bling",
            displayText: " Bling. "
        },
        doubleSpace: {
            id: "0064b920-a058-4a48-a16c-4396ef867174",
            text: "switching to Geico®",
            displayText: "Switching  to Geico®"
        }
    }
};

var createObject = function (o) {
    function F() {}
    F.prototype = o;
    return new F();
};
function CardCreate(data) {
    that = createObject(Card.prototype);
    _.each(data, function(value, key) {
        that[key] = value;
    });
    return that;
}

fixtures.cards = {
    calls: [
        CardCreate({
            id: '02f20bad-99cc-47c3-958c-fa11a8cf92ed',
            type: 'Question',
            pick: 1,
            draw: 0,
            text: [ 'What ended my last relationship? ', '.' ],
            displayText: 'What ended my last relationship? ___.'
        }),
        CardCreate({
            id: '1b29cdad-d4d6-4b9f-bb04-540b4aa5e763',
            type: 'Question',
            pick: 2,
            draw: 1,
            text: [ 'I never truly understood ', ' until I encountered ', '.' ],
            displayText: 'I never truly understood ___ until I encountered ___.'
        }),
        CardCreate({
            id: '1b29cdad-d4d6-4b9f-bb04-540b4aa5e763',
            type: 'Question',
            pick: 2,
            draw: 1,
            text: [ ' I never truly understood ', ' until I encountered ', '. ' ],
            displayText: 'I never truly understood ___ until I encountered ___.'
        }),
    ],
    responses: [
        CardCreate({
            id: '0064b920-a058-4a48-a16c-4396ef867174',
            type: 'Answer',
            pick: 1,
            draw: 0,
            text: 'switching to Geico®',
            displayText: 'Switching to Geico®'
        }),
        CardCreate({
            id: '0130dbe6-2517-430b-a8c8-1ef0d5d06953',
            type: 'Answer',
            pick: 1,
            draw: 0,
            text: 'bling',
            displayText: 'Bling'
        })
    ]
};

module.exports = fixtures;
