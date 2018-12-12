const debug = require('debug');
const query = require("json-query");

const log = debug("app:services:command");
const Commands = [];

module.exports = class {
    constructor (command, callback) {
        this.command = command;
        this.callback = callback;
    }

    execute () {

    }

    static Search(parameters) {
        return query(`name=${parameters.command}`, {
            data: Commands
        });
    }

    static Register(parameters, callback) {
        const prevCommand = this.Search(parameters);

        if (prevCommand) {
            throw new Error(`Command "${parameters.command}" is already registered`);
        }
  
        const command = new this(parameters.command, callback);

        log(`Registered Command: ${parameters.command}`);
        
        Commands.push(command);
    }
}