var _ = require('lodash');

var Card = function Card(card, type) {
    var self = this;
    self.id = card.id;
    self.type = (type === 'q') ? 'Question' : 'Answer';
    self.pick = card.numResponses || 1;
    self.draw = self.pick - 1;
    self.text = card.text;
    self.displayText = (_.isArray(card.text)) ? card.text.join('___') : card.displayText.replace(/\.$/, '');
};

/**
 * Expose `Card()`
 */
exports = module.exports = Card;
