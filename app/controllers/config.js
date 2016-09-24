var     _ = require('lodash'),
       fs = require('fs'),
     json = require('comment-json'),
     util = require('util'),
     path = require('path');

var Config = function(bot) {
    var self = this;

    /**
     * Read configuration file into JSON object (preserving comments)
     * @param  {string} filePath
     * @return {Object}
     */
    self.read = function(filePath) {
        return json.parse(fs.readFileSync(filePath).toString());
    };

    /**
     * Write configuration object to file as JSON (preserving comments)
     * @param  {string} filePath
     * @param  {Object} config
     * @return {undefined}
     */
    self.write = function(filePath, config) {
        try { fs.writeFileSync(filePath, json.stringify(config, null, 4)); }
        catch(e) { throw new Error('Unable to write configuration file.'); }
    };

    /**
     * Load configuration from files
     * @param  {string} [root] - set explicit app root (for testing)
     * @return {Object}        - configuration settings
     */
    self.load = function(root) {
        var config = {
            rootPath:  root || path.dirname(require.main.filename)
        };
        config = _.extend(config,             self.read(config.rootPath + '/config.json'));
        config = _.extend(config, {commands:  self.read(config.rootPath + '/commands.json')});
        return config;
    };

    /**
     * Remove extraneous properties prior to saving
     * @param  {Object} config - configuration settings
     * @return {Object}        - configuration settings
     */
    self.clean = function(config) {
        delete config.commands;
        delete config.rootPath;
        return config;
    };

    /**
     * Save configuration to file
     * @param  {string} [root] - set explicit app root (for testing)
     * @param  {string} [file] - set explicit filename (for testing)
     * @return {undefined}
     */
    self.save = function(root, file) {
        var rootPath = root || bot.config.rootPath;
        file = file || 'config.json';
        var filePath = rootPath + '/' + file;
        var config = self.clean(_.cloneDeep(bot.config));
        self.write(filePath, config);
    };

};

module.exports = Config;
