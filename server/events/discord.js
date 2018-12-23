const log = require('debug')('app:events:discord');

module.exports = app => {    
    const Queue = app.connection.model("Queue");
    const Player = app.connection.model("Player");
    const Command = app.object.command;
    const Discord = app.discord;

    Discord.on("newMember", async member => {
        try {
            const channel = await member.user.createDM();  
            const message = {
                text: `Thank you for joining our discord, please visit the following link to register with us so you can enjoy the matches.\n${app.config.registerLink}/auth/discord`
            }

            await Discord.sendToChannel(channel, message);
        } catch (error) {
            log(error);
        }
    });

    Discord.on("message", async message => {  
        if (message.content[0] !== app.config.discord.prefix) return;
        if (message.guild.id !== app.config.discord.guild) return;

        log(`Message from ${message.author.id} (${message.author.username}) at ${message.channel.id}: ${message.content}`);

        const parameters = message.content.split(' ');
        parameters[0] = parameters[0].split(app.config.discord.prefix)[1];
        
        const args = {
            command: parameters[0],
            channel: message.channel.id,
            parameters,
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

    Discord.on("voiceStateUpdate", async (oldMember, newMember) => {
        const player = await Player.findByDiscord(newMember.id);

        if (player.status === Player.status.CONNECTED);
        else return;
        
        if (player.queue.status === Queue.status.WAITING);
        else return;

        const playerTeam = await player.server.team;
        const playerClient = await player.server.client;
        const voiceChannel = player.discordMember.voiceChannelID;
        
        if (playerTeam === "A" && voiceChannel !== app.config.queues[player.queue.name].voiceChannelA) {
            await player.queue.rconConn.send(`mx_unready_player ${playerClient}`);
            await player.queue.rconConn.send(`mx_send_player_chat ${playerClient} "You have left the team voice channel, you have been marked as unready. Please join the proper voice channel and use !ready command."`);
        } else if (playerTeam === "B" && voiceChannel !== app.config.queues[player.queue.name].voiceChannelB) {
            await player.queue.rconConn.send(`mx_unready_player ${playerClient}`);
            await player.queue.rconConn.send(`mx_send_player_chat ${playerClient} "You have left the team voice channel, you have been marked as unready. Please join the proper voice channel and use !ready command."`);
        } 
    });

    Discord.on("error", async (error) => {
        if (error.code === "ECONNRESET") {
            log("Discord socket disconnected");

            await Discord.login();
        }
    });
}