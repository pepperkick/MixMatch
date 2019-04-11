const debug = require('debug');

const Exception = require("./objects/exception");

const log = debug("app:bot");
const prefs = {};

module.exports = async (app) => {
    const Queue = app.connection.model("Queue");
    const Server = app.connection.model("Server");
    const Player = app.connection.model("Player");
    const Match = app.connection.model("Match");
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
            await args.message.reply(`It seems like you have not registered with us, please visit the following link to register with us so you can enjoy the matches.\n${app.config.registerLink}/auth/discord`)
        }
    });


    registerCommand({ 
        command: 'queue-format',
        role: [ app.config.discord.roles.admin ]
    }, async (args) => {
        await changeQueueFormat(args)
    });

    registerCommand({ 
        command: 'queue-reset',
        role: [ app.config.discord.roles.admin ]
    }, async (args) => {
        await resetQueue(args)
    });

    registerCommand({ command: 'reset_queues', role: [ app.config.discord.roles.admin ] }, 
    async (args) => {
        const queues_db = await Queue.find();
        for (let Queue of queues_db) {
            await Queue.remove();
        }

        checkQueues();

        args.message.reply('Success');
    });

    registerCommand({ command: 'reset_servers', role: [ app.config.discord.roles.admin ] }, 
    async (args) => {
        const servers_db = await Server.find();
        for (let Server of servers_db) {
            await Server.remove();
        }

        checkServers();

        args.message.reply('Success');
    });

    checkQueues();
    checkServers();

    Player.on("new", onNewPlayer);
    Player.on("player_left_queue", onPlayerLeftQueue);
    Queue.on("init", onQueueInit);
    Server.on("rcon_connected", onServerRconConnected);
    Server.on("rcon_disconnected", onServerRconDisconnected);
    Server.on("rcon_error", onServerRconError);
    app.on("server_player_connected", onPlayerConnectedToServer);

    setInterval(handleServerStatus, 30000);

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

    async function checkServers() {
        const servers = app.config.servers;
        for (let name in servers) {
            const server_config = servers[name];
            let server_in_db = await Server.findOne({ name });

            if (server_in_db);
            else {
                server_in_db = await createNewServer(name, server_config);
            }

            log(`Connecting to RCON for server ${server_in_db.name}`);
            
            await server_in_db.createRconConnection();
        }
    }

    async function handleServerStatus () {
        const servers = await Server.find({ status: { $in: [ Server.status.FREE, Server.status.RESERVED ] } });

        for (let server of servers) {
            const players = await server.getGameStatusPlayers();
            const match = await server.getCurrentMatch();
            
            if (!players) continue;
    
            for (let i = 0; i < players.length; i++) {
                const info = await Player.breakdownPlayerStatusLine(players[i]);
                const client = info[2];

                let steamId;
                if (server.game === "tf2") {
                    steamId = `[${info[5]}]`;
                } else {
                    steamId = info[5];
                }

                const player = await Player.findBySteam(steamId);

                if (server.status === Server.status.FREE) {
                    return server.commands.kick(client, "Server is not accepting connections anymore");
                }
    
                if (player) {                    
                    if (match) {
                        if (match.isPlayerPlaying(steamId));
                        else return server.commands.kick(client, "You are not assigned to this match");
                    } else return server.commands.kick(client, "Something went wrong, please try again later");
                } else return server.commands.kick(client, "Unable to verify your registration");
            }
        }
    }

    function onQueueInit(queue) {  
        if (!prefs[queue.id]) prefs[queue.id] = {}; 
        registerCommands(queue);
    }

    async function onServerRconConnected(server) {         
        server = await Server.findById(server.id);

        log(`${server.name} RCON Connected Event`);
        
        try {
            if (server.game === "tf2") {
                await server.commands.console.addLogListener(`${app.config.host}:${app.config.udpListener}`);
            } else if (server.game === "csgo") {
                await server.commands.console.addHttpLogListener(`http://${app.config.host}:${app.config.port}/log_listener`);
            }

            log(`Log listener added to server ${server.name}`);
        } catch (error) {
            log(`Failed to add log listener to server ${server.name}`, error);

            setTimeout(() => onServerRconConnected(server), 10000);
        }
    }
    
    async function onServerRconDisconnected(server) {
        log(`${server.name} RCON Disconnected Event`);
        setTimeout(async () => await server.retryRconConnection(), 10000);
    }

    async function onServerRconError(server) {
        log(`${server.name} RCON Error Event`);
        setTimeout(async () => await server.retryRconConnection(), 10000);
    }

    async function onPlayerLeftQueue(player) {
    }

    async function onNewPlayer(user) {
    }

    async function onPlayerConnectedToServer(data) {
        const { queue, player } = data;
        const format = app.config.formats[queue.format];
        const query = await queue.queryGameServer();
        const count = query.players.length;

        await player.setStatus(Player.status.CONNECTED);        
        await queue.discordRole.setName(`${queue.name}: Waiting (${count}/${format.size * 2})`);
    }

    async function createNewQueue(name, queue) {
        const queue_new = new Queue({
            name,
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

    async function createNewServer(name, server) {
        const server_new = new Server({
            name,
            ip: server.ip,
            port: server.port,
            rcon: server.rcon,
            channel: server.channel,
            role: server.role,
            game: server.game
        });

        try {
            await server_new.save();

            return server_new;
        } catch (error) {
            log(`Failed to save Server ${name} due to error`);
            log(error);
        }
    }

    function registerCommands(queue) {
        if (prefs[queue.id]["cmd_flag"]) return;

        prefs[queue.id]["cmd_flag"] = true;
    }

    async function changeQueueFormat(args) {
        queue = await Queue.findByName(args.parameters[1]);
        
        const queue_config = app.config.queues[queue.name];
        const format = args.parameters[2];

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
                await args.message.reply('Failed due to internal error, please try again later.');
            }

            log(error);
        }
    }

    async function getQueueStatus(args, queue) {
        try {
            queue = await Queue.findById(queue.id);

            const fields = [];
            const format = queue.format;
            
            log(`Current Status of ${queue.name} ${queue.status}`);

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
            } else if (queue.status === Queue.status.OUTDATED) {
                fields.push({
                    name: 'Status',
                    value: 'Currently Unavailable!'
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
                    inline: false
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

            await queue.sendDiscordMessage({ embed });
        } catch (error) {
            log(`Failed to send status message for Queue ${queue.name}`);
            log(error);
        }
    }

    async function resetQueue(args) {
        try {
            queue = await Queue.findByName(args.parameters[1]);

            await queue.reset();

            await args.message.reply(`Successfully cleared the queue.`);
        } catch (error) {
            log(`Failed to reset the Queue ${queue.name}`);
            log(error);
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
};