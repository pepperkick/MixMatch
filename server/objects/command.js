const debug = require('debug');

const log = debug("app:services:command");
const Commands = [];

module.exports = class {
    constructor (command, callback) {
        this.command = command;
        this.callback = callback;
        this.role = new Set();
        this.channel = 0;
    }

    async execute (args) {        
        if (this.channel !== 0 && this.channel !== args.message.channel.id) {
            throw new Error('You cannot use this command in this channel');
        }

        if (this.role.size !== 0 && args.message.member) {
            let flag = false;
      
            for (const role of args.message.member.roles) {
              if (this.role.has(role[0])) {
                flag = true;
      
                break;
              }
            }
      
            if (!flag)
                throw new Error("You don't have permission to use this command");
          }

        await this.callback(args);
    }

    setChannel(id) {
        this.channel = id;
    }

    addRole(role) {
        this.role.add(role);
    }

    static Search(parameters) {
        log(parameters);

        for (const command of Commands) {
            if (command.command === parameters.command);
            else continue;

            if (command.channel === 0 || command.channel == parameters.channel);
            else continue;

            return command;
        }
    }

    static Register(parameters, callback) {
        const prevCommand = this.Search(parameters);

        if (prevCommand) {
            throw new Error(`Command "${parameters.command}" is already registered`);
        }
  
        const command = new this(parameters.command, callback);

        log(`Registered Command: ${parameters.command}`);

        if (parameters.channel) {
            command.setChannel(parameters.channel);
        }
      
        if (parameters.role) {
            for (let i in parameters.role) {
                command.addRole(parameters.role[i]);
            }
        }

        Commands.push(command);
    }
}