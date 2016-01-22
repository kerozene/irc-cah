var    _ = require('lodash'),
    util = require('util');

var Card = function Card(card, type) {
    var self = this;

    if (!_.includes(['q', 'a'], type))
        throw new Error("Missing or bad argument: type");

    _.each(['id', 'text'], function(field) {
        if (typeof card[field] === 'undefined')
            throw new Error("Missing data: " + field);
    });

    if (type === 'q' && typeof card.numResponses === 'undefined')
        throw new Error("Missing data: numResponses");

    if (type === 'a' && typeof card.displayText === 'undefined')
        throw new Error("Missing data: displayText");

    self.id = card.id;
    self.type = (type === 'q') ? 'Question' : 'Answer';
    self.pick = card.numResponses || 1;
    self.draw = self.pick - 1;
    self.text = card.text;
    if (_.isArray(card.text)) { // question
        var lastIndex = card.text.length - 1;
        card.text = _.map(card.text, function(str, index) {
            str = str.replace(/ {2,}/g, ' '); // double-spacing is the devil
            str = _.trimRight(str, '('); // some deck authors put parentheses around the blanks
            str =  _.trimLeft(str, ')');
            str = str.trim();
            if ( index !== 0 && !str.match(/^[,.!?"':]/) ) // no space leading or before punctuation
                str = ' ' + str;
            if ( index !== lastIndex &&   // no space trailing,
                 !str.match(/["'#]$/) &&  // after quote or hash(tag) mark
                 str !== ''               // or after empty string
            )
                str += ' ';
            return str;
        });
        self.displayText = card.text.join('___');
    }
    else { // answer
        _.each([ 'text', 'displayText' ], function(field) {
            self[field] = card[field].trim()
                                     .replace(/\.$/, '') // no trailing dot
                                     .replace(/ {2,}/g, ' '); // double-spacing is the devil
        });

        // sometimes the 'lowercase' version isn't set up right
        var forceToLower = /^(A|An|The|Your|My|\w+ing|\w+es|\w+ly)$/;
        text = self.text.split(' ');
        var first = text.shift().replace(forceToLower, function(match) {
            return match.toLowerCase();
        });
        text.unshift(first);
        self.text = text.join(' ');
    }
};

exports = module.exports = Card;
