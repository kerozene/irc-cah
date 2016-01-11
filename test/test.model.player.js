var should = require('chai').should(),
         _ = require('lodash');

var Cards  = require('../app/controllers/cards');

var Player = require('../app/models/player');

var fixtures = {
    player1: {
        nick: "Frederick",
        user: "~freddy",
        hostname: "unaffiliated/fredd"
    }
};

describe('PlayerModel', function() {

    it('should create a valid Player object', function() {
        var player1 = new Player(
                        fixtures.player1.nick,
                        fixtures.player1.user,
                        fixtures.player1.hostname
                     );

                    player1.id.should.equal("card1");
                  player1.nick.should.equal("Frederick");
                  player1.user.should.equal("~freddy");
              player1.hostname.should.equal("unaffiliated/fredd");
                 player1.cards.should.be.an.instanceof(Cards);
             player1.hasPlayed.should.be.false;
                player1.isCzar.should.be.false;
                player1.points.should.equal(0);
        player1.inactiveRounds.should.equal(0);
    });

});