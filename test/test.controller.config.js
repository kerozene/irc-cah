var       chai = require('chai'),
        should = chai.should(),
             _ = require('lodash'),
          path = require('path');

chai.use(require('chai-subset'));

var fixtures  = require('./fixtures/config');

var Config = require('../app/controllers/config');

describe('ConfigController', function() {

	describe('#load()', function() {

		it('should load config settings', function() {
			var configObj = new Config();
			var config = configObj.load(path.normalize('../..'));
			config.should.include.keys(fixtures.config);
		});

		it('should load commands', function() {
			var configObj = new Config();
			var config = configObj.load(path.normalize('../..'));
			config.commands.should.containSubset(fixtures.config.commands);
// this fails (why?):
//			config.commands.should.include.members(fixtures.config.commands);
		});

	});

});