const log = require('debug')('app:events:discord');

module.exports = app => {    
    const Queue = app.connection.model("Queue");
    const Player = app.connection.model("Player");
    const Command = app.object.command;
    const Discord = app.discord;
    const QueueThrottle = [];

    if (Discord.bot.status == 0) {
        BotReady();
    }

    Discord.on("ready", () => {
        BotReady();
    });

    Discord.on("message", async message => {  
        if (message.content[0] !== app.config.discord.prefix) return;
    
        log(`Message from ${message.author.id} (${message.author.username}) at ${message.channel.id}: ${message.content}`);

        const parameters = message.content.split(' ');
        parameters[0] = parameters[0].split(app.config.discord.prefix)[1];
        
        const args = {
            command: parameters[0],
            channel: message.channel.id,
            guild: message.guild ? message.guild.id : null,
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

    Discord.on("memberJoined", async member => {
        try {
            const channel = await member.user.createDM();  
            const player = await Player.findByDiscord(member.user);

            if (player) {
                const message = {
                    text: `Welcome back to our discord, we will put you right back where you left.`
                }

                await Discord.assignRole(app.config.discord.guild, player.discord, app.config.discord.roles.player);
                await Discord.sendToChannel(channel, message);
            } else {
                const message = {
                    text: `Thank you for joining our discord, please visit the following link to register with us so you can enjoy the matches.\n${app.config.registerLink}/auth/discord`
                }

                await Discord.sendToChannel(channel, message);
            }
        } catch (error) {
            log(error);
        }
    });

    Discord.on("memberLeft", async member => {
        if (app.config.discord.channels.log) {
            const message = {
                text: `${member.user.tag} left the server.`
            }

            await Discord.sendToChannel(app.config.discord.channels.log, message);
        }
    });

    Discord.on("voiceStateUpdate", async (oldMember, newMember) => {
        QueueThrottle.push(newMember);
    });

    Discord.on("error", async (error) => {
        if (error.code === "ECONNRESET") {
            log("Discord socket disconnected");

            await Discord.login();
        }
    });

    async function BotReady() {
        setInterval(CheckQueueThrottle, 2500);
        CheckMembers();
    }

    async function CheckMembers() {
        log("Checking Members...")
        const guild = await Discord.getGuild(app.config.discord.guild);
        const members = guild.members;

        for await ([ id, member ] of members) {
            const player = await Player.findByDiscord(member.user);

            if (player) {
                await Discord.assignRole(app.config.discord.guild, player.discord, app.config.discord.roles.player);                
            }
        }        
    }

    async function CheckQueueThrottle() {
        const newMember = QueueThrottle.pop();

        if (!newMember) {
            return;
        }

        let player = await Player.findByDiscord(newMember.id);
        
        if (!player) {
            return;
        }

        player = await player.populate("queue").execPopulate();

        const voiceChannel = player.discordMember.voiceChannelID;

        if (voiceChannel) {
            let flag = false;
            
            for (const name in app.config.queues) {
                if (voiceChannel === app.config.queues[name].channel) {
                    if (!player.discordMember.roles.get(app.config.discord.roles.player)) {            
                        await player.discordMember.send(`You do not have the proper role to join the queue, please contact admins for further info.`);
                        await player.discordMember.setVoiceChannel(app.config.discord.channels.generalvc); 
            
                        return;
                    }

                    const queue = await Queue.findByName(name);

                    if (queue.status === Queue.status.BLOCKED) {            
                        await player.discordMember.send(`The queue is currently not active.`);                 
                        await player.discordMember.setVoiceChannel(app.config.discord.channels.generalvc); 

                        return;
                    };

                    await queue.addPlayer(player);

                    flag = true;
                }
            }

            if (!flag) {
                if (player.status === Player.status.JOINED) {
                    await player.queue.removePlayer(player);
                }
            }
        } else {
            if (player.status === Player.status.JOINED) {
                await player.queue.removePlayer(player);
            }
        }
    }
}