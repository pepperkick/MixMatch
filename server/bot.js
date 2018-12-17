const debug = require('debug');

const Exception = require("./objects/exception");

const log = debug("app:bot");
const prefs = {};

module.exports = async (app) => {
    const Queue = app.connection.model("Queue");
    const Player = app.connection.model("Player");
    const Command = app.object.command;
    const Discord = app.discord;

    registerCommand({ command: 'ping' }, 
    (args) => {
        args.message.reply("Pong!");
    });

    registerCommand({ command: 'register' }, 
    async (args) => {
        const player = await Player.findByDiscord(args.message.author.id);

        if (player) {
            await args.message.reply("You have already registered with us!");
        } else {
            await args.message.reply(`It seems like you have not registered with us, please visit the following link to register with us so you can enjoy the matches.\nhttp://${app.config.host}:${app.config.port}/auth/discor`)
        }
    });

    registerCommand({ command: 'reset_queues', role: [ app.config.discord.roles.admin ] }, 
    async (args) => {
        const servers_db = await Queue.find();
        for (let Queue of servers_db) {
            await Queue.remove();
        }

        checkServers();

        args.message.reply('Success');
    });

    checkQueues();

    Player.on("new", onNewPlayer);
    Player.on("player_left_queue", onPlayerLeftQueue);
    Queue.on("init", onQueueInit);
    Queue.on("update", onQueueUpdate);
    Queue.on("rcon_connected", onQueueRconConnected);
    Queue.on("rcon_disconnected", onQueueRconDisconnected);
    Queue.on("rcon_error", onQueueRconError);
    app.on("server_player_connected", onPlayerConnectedToServer);

    async function checkQueues() {
        const queues = app.config.queues;
        for (let name in queues) {
            const queue_config = queues[name];
            const queue_in_db = await Queue.findOne({ name });
    
            if (queue_in_db);
            else {
                await createNewQueue(name, queue_config);
            }
        }
    }

    function onQueueInit(queue) {  
        if (!prefs[queue.id]) prefs[queue.id] = {}; 
        registerCommands(queue);
    }

    async function onQueueUpdate(queue) {
        const format = app.config.formats[queue.format];
        
        if (queue.status === Queue.status.UNKNOWN) {
            await queue.setStatus(Queue.status.FREE);
        } else if (queue.status === Queue.status.FREE) {
            if (queue.players.length >= format.size * 2) {        
                log(`Enough players have joined ${queue.name}, switching status to SETUP`);

                await queue.sendRconCommand('mx_reset');
                await divideTeams(queue, format);          
                await queue.setStatus(Queue.status.SETUP);
            }

            try {
                if (queue.players.length === 0) {
                    await queue.setDiscordRoleName(`${queue.name}: Empty`);
                } else {
                    await queue.setDiscordRoleName(`${queue.name}: Queuing (${queue.players.length}/${format.size * 2})`);
                }
            } catch (error) {
                log(`Failed to set role name for Queue ${queue.name}`, error);
            }
        } else if (queue.status === Queue.status.SETUP) {
            queue.map = format.maps[Math.floor(Math.random() * format.maps.length)];

            const pluginStatus = await getPluginStatus(queue);

            if (pluginStatus.includes(Queue.status.SETUP)) {

            } else {            
                log(`Setting up ${queue.name} for ${queue.format} with map ${queue.map}`);
                await queue.sendRconCommand(`mx_set_map ${queue.map}`);
                await queue.setDiscordRoleName(`${queue.name}: Setting Up`);
                await queue.save();
            }
        } else if (queue.status === Queue.status.WAITING) {
            log(`Server ${queue.name} status is now waiting.`);

            await queue.setDiscordRoleName(`${queue.name}: Waiting (0/${format.size * 2})`);
            await queue.sendDiscordMessage({ embed: {
                color: 0x00BCD4,                            
                title: 'Server is Ready',
                description: `Join the server!`,
                fields: [
                    {
                        name: "Connect",
                        value: `steam://connect/${queue.ip}:${queue.port}`,
                        inline: false
                    },
                    {
                        name: "Map",
                        value: queue.map,
                        inline: false
                    }
                ],
                timestamp: new Date()
            }});
        } else if (queue.status === Queue.status.LIVE) {
            await queue.setDiscordRoleName(`${queue.name}: Live`);
        } else if (queue.status === Queue.status.ENDED) {
            await queue.setDiscordRoleName(`${queue.name}: End Game`);    
            await queue.sendDiscordMessage({ embed: {
                color: 0x00BCD4,                            
                title: 'Match Complete',
                timestamp: new Date()
            }});
        }
    }

    async function onQueueRconConnected(queue) {         
        log(`${queue.name} RCON Connected Event`);

        if (await checkPluginVersion(queue)) {       
            log(`${queue.name} plugin is up to date`);

            const format = app.config.formats[queue.format]; 
            const queue_status = await queue.sendRconCommand("mx_get_status");

            await queue.sendRconCommand(`mx_init ${app.config.host} ${app.config.port} ${queue.name}`);

            if (queue_status.includes(Queue.status.SETUP)) {
                await queue.setStatus(Queue.status.SETUP);       
                log(`${queue.name} status set to SETUP`);      
            } else if (queue_status.includes(Queue.status.WAITING)) { 
                await queue.setStatus(Queue.status.WAITING);          
                log(`${queue.name} status set to WAITING`);                        
            } else if (queue_status.includes(Queue.status.LIVE)) { 
                await queue.setStatus(Queue.status.LIVE);       
                log(`${queue.name} status set to LIVE`);                                    
            } else if (queue_status.includes(Queue.status.ENDED)) { 
                await queue.setStatus(Queue.status.ENDED);      
                log(`${queue.name} status set to ENDED`);                           
            } else {
                await queue.setStatus(Queue.status.FREE);

                log(`${queue.name} status set to FREE`);

                await queue.sendRconCommand(`mx_reset`);
                await queue.sendRconCommand(`mx_set_format ${queue.format}`);
                await queue.sendRconCommand(`mx_set_size ${format.size}`);
                await queue.sendRconCommand(`mx_restrict_players 1`);
            }
        } else {
            log(`Queue plugin version does not match with ${app.config.plugin.version}`);

            await queue.setStatus(Queue.status.OUTDATED);

            setTimeout(() => onQueueRconConnected(queue), 10000);
        }
    }
    
    async function onQueueRconDisconnected(queue) {
        log(`${queue.name} RCON Disconnected Event`);
        setTimeout(async () => await queue.retryRconConnection(), 10000);
    }

    async function onQueueRconError(queue) {
        log(`${queue.name} RCON Error Event`);
        setTimeout(async () => await queue.retryRconConnection(), 10000);
    }

    async function onPlayerLeftQueue(player) {
        await player.discordMember.removeRole(app.config.teams.A.role);
        await player.discordMember.removeRole(app.config.teams.B.role);
    }

    async function onNewPlayer(user) {
    }

    async function onPlayerConnectedToServer(data) {
        const { queue, player } = data;
        const format = app.config.formats[queue.format];
        const query = await queue.queryGameServer();
        const count = query.players.length;

        await player.setStatus(Player.status.CONNECTED);        
        await queue.setDiscordRoleName(`${queue.name}: Waiting (${count}/${format.size * 2})`);
    }

    async function createNewQueue(name, queue) {
        const queue_new = new Queue({
            name,
            ip: queue.ip,
            port: queue.port,
            rcon: queue.rcon,
            channel: queue.channel,
            format: queue.formats[0],
            role: queue.role
        });

        try {
            await queue_new.save();
        } catch (error) {
            log(`Failed to save Queue ${name} due to error`);
            log(error);
        }
    }

    function registerCommands(queue) {
        if (prefs[queue.id]["cmd_flag"]) return;

        prefs[queue.id]["cmd_flag"] = true;

        registerCommand({ 
            command: 'join',
            channel: queue.channel,
            role: [ app.config.discord.roles.player ]
        }, async (args) => {
            await addPlayerQueue(args, queue, args.message.author.id)
        });

        registerCommand({ 
            command: 'leave',
            channel: queue.channel,
            role: [ app.config.discord.roles.player ]
        }, async (args) => {
            await removePlayerQueue(args, queue, args.message.author.id)
        });

        registerCommand({ 
            command: 'format',
            channel: queue.channel,
            role: [ app.config.discord.roles.admin ]
        }, async (args) => {
            await changeQueueFormat(args, queue)
        });
    
        registerCommand({ 
            command: 'reset',
            channel: queue.channel,
            role: [ app.config.discord.roles.admin ]
        }, async (args) => {
            await resetQueue(args, queue)
        });

        registerCommand({ 
            command: 'status',
            channel: queue.channel,
            role: [ app.config.discord.roles.player ]
        }, async (args) => {
            await getQueueStatus(args, queue)
        });

        registerCommand({ 
            command: 'add',
            channel: queue.channel,
            role: [ app.config.discord.roles.admin ]
        }, async (args) => {
            if (args.parameters.length === 1) return await args.message.reply(`\nUsage: \`!add <user id>\``);    

            for (let i in args.parameters) {
                if (i == 0) continue;

                const id = args.parameters[i];
    
                await addPlayerQueue(args, queue, id, true)
            }            
        });

        registerCommand({ 
            command: 'remove',
            channel: queue.channel,
            role: [ app.config.discord.roles.admin ]
        }, async (args) => {
            if (args.parameters.length === 1) return await args.message.reply(`\nUsage: \`!remove <user id>\``);    

            for (let i in args.parameters) {
                if (i == 0) continue;

                const id = args.parameters[i];
    
                await removePlayerQueue(args, queue, id, true)
            }            
        });
    }

    async function addPlayerQueue(args, queue, player_id, admin=false) {
        let player;

        try {
            player = await Player.findByDiscord(player_id);
            
            await queue.addPlayer(player);         

            if(admin) await args.message.reply(`Successfully added ${player.discordUser.username} to the queue.`);
            else await args.message.reply('You have successfully joined the queue.');
        } catch (error) {
            log(`Failed to add player ${player_id} to Queue ${queue.name}`);

            if (error.code === "QUEUE_NOT_FREE") {
                if (admin) await args.message.reply("Cannot add player at the moment.");
                else await args.message.reply("Cannot join the queue at the moment.");
            } else if (error.code === "PLAYER_ALREADY_IN_CURRENT_QUEUE") {      
                if (admin) await args.message.reply(`"${player.discordUser.username}" is already in current queue.`);          
                else await args.message.reply("You have already joined this queue.");
            } else if (error.code === "PLAYER_ALREADY_IN_QUEUE") {
                if (admin) await args.message.reply(`"${player.discordUser.username}" is already in another queue.`);        
                else await args.message.reply("You have already joined a queue.");
            } else if (error.code === "PLAYER_NOT_FOUND") {
                if (admin) await args.message.reply(`"${player.discordUser.username}" not found.`);        
                else await args.message.reply('Unable to process your request, please make sure that you have registered with the bot');
            } else {
                log(error);

                if (admin) await args.message.reply(`Failed to add ${player.discordUser.username} to queue.`);   
                else await args.message.reply('Failed due to internal error, please try again later.');
            }
        }
    }

    async function removePlayerQueue(args, queue, player_id, admin=false) {
        let player;


        try {
            player = await Player.findByDiscord(player_id);

            await queue.removePlayer(player);            

            if(admin) await args.message.reply(`Successfully removed ${player.discordUser.username} from the queue.`);
            else await args.message.reply('You have successfully left the queue');
        } catch (error) {
            log(`Failed to remove player ${player_id} from Queue ${queue.name}`);

            if (error.code === "QUEUE_NOT_FREE") {
                if (admin) await args.message.reply(`Cannot remove player at the moment.`);    
                else await args.message.reply("Cannot leave the queue at the moment.");
            }else if (error.code === "PLAYER_NOT_IN_CURRENT_QUEUE") {                
                if (admin) await args.message.reply(`"${player.discordUser.username}" is not in current queue.`);    
                else await args.message.reply("You have not joined this queue.");
            } else if (error.code === "PLAYER_NOT_IN_QUEUE") {
                if (admin) await args.message.reply(`"${player.discordUser.username}" is not in any queue.`);    
                else await args.message.reply("You have not joined any queue.");
            } else if (error.code === "PLAYER_NOT_FOUND") {
                if (admin) await args.message.reply(`"${player.discordUser.username}" not found.`);        
                else await args.message.reply('Unable to process your request, please make sure that you have registered with the bot');
            } else {
                log(error);

                if (admin) await args.message.reply(`Failed to remove "${player.discordUser.username}" to queue.`);   
                else await args.message.reply('Failed due to internal error, please try again later.');
            }
        }
    }

    async function changeQueueFormat(args, queue) {
        const queue_config = app.config.queues[queue.name];
        const format = args.parameters[1];

        if (!format) {
            let format_list = "";
            let format_show;
            let count = 1;

            for (let i in queue_config.formats) {
                if (!app.config.formats[queue_config.formats[i]].hide) {
                    format_list += `${count}: ${queue_config.formats[i]}\n`;

                    if (!format_show) format_show = queue_config.formats[i];

                    count++;
                }
            }

            return await args.message.reply(`\nCurrently supported formats are\n${format_list}\nYou can use the command like \`!format ${format_show}\``);    
        }

        try {
            if (!queue_config.formats.includes(format)) {
                throw new Exception("FORMAT_NOT_SUPPORTED", `The format ${format} is not supported by queue ${queue.name}`);
            }

            await queue.changeFormat(format);
            await args.message.reply(`Successfully changed the queue format to ${format}`);
        } catch (error) {
            log(`Failed to change format of Queue ${queue.name} to ${format}`);

            if (error.code === "FORMAT_NOT_SUPPORTED") {
                await args.message.reply(`That format is currently not supported by the queue.`);
            } else if (error.code === "FORMAT_SAME") {
                await args.message.reply(`Queue is already in that format`);                
            } else if (error.code === "QUEUE_STATUS_NOT_FREE") {
                await args.message.reply("Cannot change the format at the moment.");                
            } else if (error.code === "QUEUE_NOT_FREE") {
                await args.message.reply("Cannot change the format as players are in queue.");                
            } else {
                log(error);

                await args.message.reply('Failed due to internal error, please try again later.');
            }
        }
    }

    async function getQueueStatus(args, queue) {
        try {
            const fields = [];
            const format = queue.format;
            
            const embed = {
                color: 0x00BCD4,
                title: `Server ${queue.name}`,
                fields,
                timestamp: new Date()
            }

            if (queue.status === Queue.status.FREE) {
                fields.push({
                    name: 'Status',
                    value: 'Waiting for enough players to join'
                });
            } else if (queue.status === Queue.status.SETUP) {
                fields.push({
                    name: 'Status',
                    value: 'Setting up the server'
                });
            } else if (queue.status === Queue.status.WAITING) {
                fields.push({
                    name: 'Status',
                    value: 'Waiting for players to join'
                });

                fields.push({
                    name: "Connect",
                    value: `steam://connect/${queue.ip}:${queue.port}`,
                    inline: false
                });
            } else if (queue.status === Queue.status.LIVE) {
                fields.push({
                    name: 'Status',
                    value: 'Match is currently live'
                });
            }

            if (queue.status === Queue.status.FREE) {
                fields.push({
                    name: 'Format',
                    value: format,
                    inline: true
                });        

                fields.push({
                    name: 'Number of Players',
                    value: `${queue.players.length} / ${app.config.formats[format].size * 2}`,
                    inline: true
                });
            } else if (queue.status === Queue.status.SETUP) {
                fields.push({
                    name: 'Format',
                    value: format
                });        
            } else if (queue.status === Queue.status.WAITING || queue.status === Queue.status.LIVE) {
                fields.push({
                    name: 'Format',
                    value: format,
                    inline: true
                });     

                fields.push({
                    name: 'Map',
                    value: queue.map,
                    inline: true
                });   
            }

            if (queue.status === Queue.status.FREE) {
                if (queue.players.length === 0) {
                    fields.push({
                        name: 'Players',
                        value: 'No players have currently joined'
                    });
                } else {
                    let players = '';

                    for (const player_id of queue.players) {
                        const player = await Player.findById(player_id);
                        const user = await Discord.getUser(player.discord);

                        players += `${user.username}\n`;
                    }

                    fields.push({
                        name: 'Players',
                        value: players
                    });
                }
            } else if (queue.status === Queue.status.SETUP || queue.status === Queue.status.WAITING || queue.status === Queue.status.LIVE) {
                let players_teamA = '';
                let players_teamB = '';

                for (const player_id of queue.teamA) {
                    const player = await Player.findById(player_id);
                    const user = await Discord.getUser(player.discord);

                    players_teamA += `${user.username}\n`;
                }

                for (const player_id of queue.teamB) {
                    const player = await Player.findById(player_id);
                    const user = await Discord.getUser(player.discord);

                    players_teamB += `${user.username}\n`;
                }

                fields.push({
                    name: app.config.teams.A.name,
                    value: players_teamA,
                    inline: true
                });

                fields.push({
                    name: app.config.teams.B.name,
                    value: players_teamB,
                    inline: true
                });
            }

            await Discord.sendToChannel(queue.channel, { embed });
        } catch (error) {
            log(`Failed to send status message for Queue ${queue.name}`);
            log(error);
        }
    }

    async function resetQueue(args, queue) {
        try {
            await queue.reset();

            await args.message.reply(`Successfully cleared the queue.`);
        } catch (error) {
            log(`Failed to reset the Queue ${queue.name}`);
            log(error);
        }
    }

    async function divideTeams(queue, format) {      
        for (let i = 0; i < format.size * 2; i++) {
            const player = await Player.findById(queue.players.pop());

            if (i % 2 === 0) {
                await player.discordMember.addRole(app.config.teams.A.role);
                queue.teamA.push(player.id);
            } else {
                await player.discordMember.addRole(app.config.teams.B.role);
                queue.teamB.push(player.id);
            }
            
            await queue.sendRconCommand(`mx_add_player ${player.steam} ${i%2} ${player.getDiscordUser().username}`);
        }
    }

    async function registerCommand(options, handler) {
        try {
            await Command.Register(options, handler);
        } catch (error) {
            if (error.code === "CMD_ALREADY_EXISTS") {
                log(`The command ${options.command} already exists for channel ${options.channel}`);
            } else {
                throw error;
            }
        }
    }

    async function checkPluginVersion(queue) {
        try {
            const version = await queue.sendRconCommand('mx_version');
            return version.includes(app.config.plugin.version);
        } catch(error) {
            log(`Failed to check version for server ${queue.name} due to error`, error);
        }
    }

    async function getPluginStatus(queue) {
        try {
            const status = await queue.sendRconCommand('mx_get_status');
            return status;
        } catch(error) {
            log(`Failed to check status for server ${queue.name} due to error`, error);
        }
    }
};