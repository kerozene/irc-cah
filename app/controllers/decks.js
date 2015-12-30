var           _ = require('underscore'),
        Promise = require('bluebird'),
        storage = require('node-persist'),
    CardcastAPI = require("cardcast-api").CardcastAPI;

Promise.config({warnings: false});

var Decks = function(bot) {
    var self = this;
    self.storage = storage;

    self.init = function() {
        return new Promise(function(resolve, reject) {
            self.storage.init({
                dir: '../../../cards',
                ttl: 7 * 24 * 60 * 60 * 1000
            }).then(function() {
                setTimeout(function() { // promise is fulfilled even though data isn't loaded yet
                    self.api = new CardcastAPI();
                    resolve("Storage: " + self.storage.length() + ' keys loaded.');
                }, 1000);
            }).catch(function(error) {
                reject(error);
            });
        });
    };

    self.fetchDeck = function(deckCode) {
        var deckData, key = 'deck-' + deckCode;
        return new Promise(function(resolve, reject) {
            deckData = self.storage.getItemSync(key);
            if (deckData)
                resolve(deckData);
            self.api.deck(deckCode).then(function(deck) {
                deck.populatedPromise.then(function() {
                    var fields = ['name', 'code', 'description', 'category', 'created', 'updated',
                                  'rating', 'author', 'baseURL', 'calls', 'responses'];
                    deckData = _.pick(deck, fields);
                    self.storage.setItemSync(key, deckData);
                    resolve(deckData);
                });
            }, function(error) {
                reject(error);
            });
        });
    };

};

module.exports = Decks;