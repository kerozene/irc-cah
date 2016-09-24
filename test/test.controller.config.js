var       chai = require('chai'),
        should = chai.should(),
             _ = require('lodash'),
            fs = require('fs');

chai.use(require('chai-subset'));

var fixtures  = require('./fixtures/config');

var Config = require('../app/controllers/config');

describe('ConfigController', function() {

	describe('#load()', function() {

		it('should load config settings', function() {
			var configObj = new Config();

			var config = configObj.load(fs.realpathSync('.'));

			config.should.include.keys(fixtures.config);
		});

		it('should load commands', function() {
			var configObj = new Config();

			var config = configObj.load(fs.realpathSync('.'));

			config.commands.should.containSubset(fixtures.config.commands);
// this fails (why?):
//			config.commands.should.include.members(fixtures.config.commands);
		});

	});

	describe('#clean()', function() {
		it('should delete extraneous properties from config object', function() {
			var configObj = new Config();
			var config = _.cloneDeep(fixtures.config);
			config.rootPath = 'test';
			should.exist(config.commands);

			config = configObj.clean(config);

			should.not.exist(config.rootPath);
			should.not.exist(config.commands);
		});
	});

	describe('#save()', function() {

		var tmpFile,
			tmpRootPath = './test',
			tmpFileName = 'tmpConfig.json';
		var tmpFilePath = tmpRootPath + '/' + tmpFileName;

		function removeTmpFile() {
			try { tmpFile = fs.statSync(tmpFilePath); }
			catch(e) {}
			if (typeof tmpFile != 'undefined') {
				fs.unlinkSync(tmpFilePath);
				tmpFile = undefined;
			}
		}

		before(removeTmpFile);
		 after(removeTmpFile);

		it('should save the config object to a file', function() {
			var bot = { config: _.cloneDeep(fixtures.config) };
			var configObj = new Config(bot);

			configObj.save(fs.realpathSync('./test'), tmpFileName);

			try { tmpFile = fs.statSync(tmpFilePath); }
			catch(e) {}

			should.exist(tmpFile);
		});
	});

});
