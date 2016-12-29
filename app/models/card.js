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
    var fixed = (_.isArray(card.text)) ? Card.fixQuestion(card)
                                       : Card.fixAnswer(card);
    self = _.extend(self, fixed);

};

Card.fixQuestion = function(card) {
    var data = {}, lastIndex = card.text.length - 1;
    data.text = _.map(card.text, function(str, index) {
        str = str.replace(/ {2,}/g, ' '); // double-spacing is the devil
        str =   _.trimEnd(str, '('); // some deck authors put parentheses around the blanks
        str = _.trimStart(str, ')');
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
    data.displayText = data.text.join('___');
    return data;
};

Card.fixAnswer = function(card) {
    var data = {};
    _.each([ 'text', 'displayText' ], function(field) {
        data[field] = card[field].trim()
                                 .replace(/\.$/, '') // no trailing dot
                                 .replace(/ {2,}/g, ' '); // double-spacing is the devil
    });

    // sometimes the 'lowercase' version isn't set up right
    var forceToLower = /^(A|An|The|Your|My|\w+ing|\w+es|\w+ly)$/;
    var text = data.text.split(' ');
    var first = text.shift().replace(forceToLower, function(match) {
        return match.toLowerCase();
    });
    text.unshift(first);
    data.text = text.join(' ');
    data.displayText = data.displayText.replace(/^./, function(m) { return m.toUpperCase(); }); // force capitalize first word
    return data;
};

exports = module.exports = Card;
