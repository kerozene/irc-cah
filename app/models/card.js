var _ = require('lodash');

var Card = function Card(card, type) {
    var self = this;

    if (!_.contains(['q', 'a'], type))
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
    self.displayText = (_.isArray(card.text)) ? card.text.join('___').trim()
    										  : card.displayText.trim().replace(/\.$/, '');
};

/**
 * Expose `Card()`
 */
exports = module.exports = Card;
