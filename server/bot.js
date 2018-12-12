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
        if (message.guild.id !== config.guild) return;
        
        const parameters = message.content.split(' ');
        parameters[0] = parameters[0].split(config.prefix)[1];
        
        const parameters = {
            command: parameters[0],
            message
        }
        const command = await Command.Search(parameters);

        if (command) {
            log(`Executing ${command.command}...`);
    
            command.execute(parameters);
        }
    });

    Command.Register('ping', (args) => {
        args.message.reply("Pong!");
    });
};