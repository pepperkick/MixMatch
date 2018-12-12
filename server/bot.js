const debug = require('debug');

const log = debug("app:bot");

module.exports = (app) => {
    const Command = app.object.command;

    app.discord.on("newMember", async member => {
        try {
            const channel = await member.user.createDM();  
            const message = {
                text: `Thank you for joining our discord, please visit the following link to register with us so you can enjoy the matches.\nhttp://${app.config.host}:${app.config.port}/auth/discord`
            }

            await app.discord.sendToChannel(channel, message);
        } catch (error) {
            log(error);
        }
    });

    app.discord.on("message", async message => {  
        if (message.content[0] !== app.config.discord.prefix) return;
        if (message.guild.id !== app.config.discord.guild) return;

        log(`Message from ${message.author.id} (${message.author.username}) at ${message.channel.id}: ${message.content}`);

        const parameters = message.content.split(' ');
        parameters[0] = parameters[0].split(app.config.discord.prefix)[1];
        
        const args = {
            command: parameters[0],
            channel: message.channel.id,
            message
        }
        const command = await Command.Search(args);

        if (command) {
            log(`Executing ${command.command}...`);
    
            try {
                await command.execute(args);
            } catch (error) {
                log(error);

                await message.reply(error.message);
            }
        }
    });

    Command.Register({ 
        command: 'ping'
    }, (args) => {
        args.message.reply("Pong!");
    });
};