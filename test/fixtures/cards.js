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
        }),
        CardCreate({
            id: '0064b920-a058-4a48-a16c-4396ef867101',
            type: 'Answer',
            pick: 1,
            draw: 0,
            text: 'switching to Geico®',
            displayText: 'Switching to Geico®'
        }),
        CardCreate({
            id: '0130dbe6-2517-430b-a8c8-1ef0d5d06921',
            type: 'Answer',
            pick: 1,
            draw: 0,
            text: 'bling',
            displayText: 'Bling'
        }),
        CardCreate({
            id: '0064b920-a058-4a48-a16c-4396ef867103',
            type: 'Answer',
            pick: 1,
            draw: 0,
            text: 'switching to Geico®',
            displayText: 'Switching to Geico®'
        }),
        CardCreate({
            id: '0130dbe6-2517-430b-a8c8-1ef0d5d06923',
            type: 'Answer',
            pick: 1,
            draw: 0,
            text: 'bling',
            displayText: 'Bling'
        }),
        CardCreate({
            id: '0064b920-a058-4a48-a16c-4396ef867104',
            type: 'Answer',
            pick: 1,
            draw: 0,
            text: 'switching to Geico®',
            displayText: 'Switching to Geico®'
        }),
        CardCreate({
            id: '0130dbe6-2517-430b-a8c8-1ef0d5d06924',
            type: 'Answer',
            pick: 1,
            draw: 0,
            text: 'bling',
            displayText: 'Bling'
        }),
        CardCreate({
            id: '0064b920-a058-4a48-a16c-4396ef867105',
            type: 'Answer',
            pick: 1,
            draw: 0,
            text: 'switching to Geico®',
            displayText: 'Switching to Geico®'
        }),
        CardCreate({
            id: '0130dbe6-2517-430b-a8c8-1ef0d5d06925',
            type: 'Answer',
            pick: 1,
            draw: 0,
            text: 'bling',
            displayText: 'Bling'
        }),
        CardCreate({
            id: '0064b920-a058-4a48-a16c-4396ef867106',
            type: 'Answer',
            pick: 1,
            draw: 0,
            text: 'switching to Geico®',
            displayText: 'Switching to Geico®'
        }),
        CardCreate({
            id: '0130dbe6-2517-430b-a8c8-1ef0d5d06926',
            type: 'Answer',
            pick: 1,
            draw: 0,
            text: 'bling',
            displayText: 'Bling'
        }),
    ],
    repick: [
        CardCreate({
            id: "0064b920-a058-4a48-a16c-4396ef867170",
            type: 'Answer',
            pick: 1,
            draw: 0,
            text: "one",
            displayText: "one"
        }),
        CardCreate({
            id: "0064b920-a058-4a48-a16c-4396ef867171",
            type: 'Answer',
            pick: 1,
            draw: 0,
            text: "two",
            displayText: "two"
        }),
        CardCreate({
            id: "0064b920-a058-4a48-a16c-4396ef867172",
            type: 'Answer',
            pick: 1,
            draw: 0,
            text: "three",
            displayText: "three"
        }),
        CardCreate({
            id: "0064b920-a058-4a48-a16c-4396ef867173",
            type: 'Answer',
            pick: 1,
            draw: 0,
            text: "four",
            displayText: "four"
        }),
        CardCreate({
            id: "0064b920-a058-4a48-a16c-4396ef867174",
            type: 'Answer',
            pick: 1,
            draw: 0,
            text: "five",
            displayText: "five"
        }),
        CardCreate({
            id: "0064b920-a058-4a48-a16c-4396ef867175",
            type: 'Answer',
            pick: 1,
            draw: 0,
            text: "six",
            displayText: "six"
        }),
        CardCreate({
            id: "0064b920-a058-4a48-a16c-4396ef867176",
            type: 'Answer',
            pick: 1,
            draw: 0,
            text: "seven",
            displayText: "seven"
        }),
        CardCreate({
            id: "0064b920-a058-4a48-a16c-4396ef867177",
            type: 'Answer',
            pick: 1,
            draw: 0,
            text: "eight",
            displayText: "eight"
        }),
        CardCreate({
            id: "0064b920-a058-4a48-a16c-4396ef867178",
            type: 'Answer',
            pick: 1,
            draw: 0,
            text: "nine",
            displayText: "nine"
        }),
        CardCreate({
            id: "0064b920-a058-4a48-a16c-4396ef867179",
            type: 'Answer',
            pick: 1,
            draw: 0,
            text: "ten",
            displayText: "ten"
        })
    ]
};

module.exports = fixtures;
