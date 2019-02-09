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
    Queue.on("update", onQueueUpdate);
    Server.on("update", onServerUpdate);
    Server.on("rcon_connected", onServerRconConnected);
    Server.on("rcon_disconnected", onServerRconDisconnected);
    Server.on("rcon_error", onServerRconError);
    Match.on("update", onMatchUpdate);
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

    async function checkServers() {
        const servers = app.config.servers;
        for (let name in servers) {
            const server_config = servers[name];
            const server_in_db = await Server.findOne({ name });

            if (server_in_db);
            else {
                await createNewServer(name, server_config);
            }

            log(`Connecting to RCON for server ${server_in_db.name}`);
            
            await server_in_db.createRconConnection();
        }
    }

    function onQueueInit(queue) {  
        if (!prefs[queue.id]) prefs[queue.id] = {}; 
        registerCommands(queue);
    }

    async function onQueueUpdate(queue) {
        const format = app.config.formats[queue.format];
        
        if (queue.status === Queue.status.UNKNOWN) {
            try {
                const server = await Server.findFreeServer();

                if (server) {
                    await queue.setStatus(Queue.status.FREE);
                } else {               
                    await queue.setStatus(Queue.status.BLOCKED);
                }
            } catch (error) {
                log(error);
            }
        } else if (queue.status === Queue.status.FREE) {
            if (queue.players.length >= format.size * 2) {        
                log(`Enough players have joined ${queue.name}, finding a free server.`);
                
                const server = await Server.findFreeServer();
                const players = await divideTeams(queue, server, format); 
                const map = format.maps[Math.floor(Math.random() * format.maps.length)];
                const match = new Match({
                    status: Match.status.SETUP,
                    server,
                    players,
                    map,
                    format: queue.format
                });

                try {    
                    await match.save();
                    await server.execConfig(format.config);     
                    await queue.setStatus(Queue.status.FREE);
                } catch (error) {
                    log(`Failed to setup match for queue ${queue.name} due to error`, error);
                }
            }

            try {
                if (queue.players.length === 0) {
                    await queue.discordRole.setName(`${queue.name}: Empty`);
                } else {
                    await queue.discordRole.setName(`${queue.name}: Queuing (${queue.players.length}/${format.size * 2})`);
                }
            } catch (error) {
                log(`Failed to set role name for Queue ${queue.name}`, error);
            }
        } else if (queue.status === Queue.status.BLOCKED) {
            try {
                await queue.discordRole.setName(`${queue.name}: Blocked`);
                
                setTimeout(() => queue.setStatus(Queue.status.UNKNOWN), 30000);
            } catch (error) {
                log(`Failed to set role name for Queue ${queue.name}`, error);
            }
        }
    }

    async function onMatchUpdate(match) {
        const format = app.config.formats[match.format];
        match = match.populate("server").execPopulate();

        if (match.status === Match.status.SETUP) {
            const server = match.server;

            await server.setStatus(Server.status.RESERVED);
            await server.commands.changeLevel(match.map);
            await server.execConfig(format.config);
            await server.createDiscordChannel();
            await server.discordRole.setName(`${server.name}: Setting Up`);
            await server.save();
        } else if (match.status === Match.status.WAITING) {
            await server.discordRole.setName(`${server.name}: Waiting (0/${format.size * 2})`);
        } else if (match.status === Match.status.LIVE) {
            await server.discordRole.setName(`${server.name}: Live`);
        } else if (match.status === Match.status.ENDED) {
            await server.discordRole.setName(`${server.name}: Ended`);      
            await server.setStatus(Server.status.FREE);  

            for await (let player of match.players) {
                await player.discordMember.removeRole(app.config.teams.A.role);
                await player.discordMember.removeRole(app.config.teams.B.role);
                await player.discordMember.removeRole(server.role);
            }
        }
    }

    async function onServerUpdate(server) {        
        // TODO: Update this

        if (server.status === Server.status.UNKNOWN) {
            const match = await server.findCurrentMatch();

            if (server.isRconConnected);
            else return setTimeout(() => server.setStatus(Server.status.UNKNOWN), 10000);

            if (match) server.setStatus(Server.status.RESERVED);
            else server.setStatus(Server.status.FREE);
        } else if (server.status === Server.status.FREE) {
            await server.discordRole.setName(`${server.name}: Free`);
        }
    }

    async function onServerRconConnected(server) {         
        server = await Server.findById(server.id);

        log(`${server.name} RCON Connected Event`);
        
        try {
            // TODO: Update this

            await server.commands.console.addHttpLogListener(`http://${app.config.host}:${app.config.port}/log_listener`);
            await server.attachLogEvents();

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
            role: server.role
        });

        try {
            await server_new.save();
        } catch (error) {
            log(`Failed to save Server ${name} due to error`);
            log(error);
        }
    }

    function registerCommands(queue) {
        if (prefs[queue.id]["cmd_flag"]) return;

        prefs[queue.id]["cmd_flag"] = true;

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
    }

    async function changeQueueFormat(args, queue) {
        queue = await Queue.findById(queue.id);
        
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

    async function resetQueue(args, queue) {
        try {
            queue = await Queue.findById(queue.id);

            await queue.reset();

            await args.message.reply(`Successfully cleared the queue.`);
        } catch (error) {
            log(`Failed to reset the Queue ${queue.name}`);
            log(error);
        }
    }

    async function divideTeams(queue, server, format) {      
        const players = {};

        for (let i = 0; i < format.size * 2; i++) {
            const player = await Player.findById(queue.players.pop());
            await player.discordMember.addRole(server.role);

            if (i % 2 === 0) {
                players[player.id] = {
                    team: "A"
                }

                await player.discordMember.addRole(app.config.teams.A.role);
            } else {
                players[player.id] = {
                    team: "B"
                }

                await player.discordMember.addRole(app.config.teams.B.role);
            }
            
            await queue.removePlayer(player);
            await server.commands.plugin.addPlayer(player.steam, i%2, player.getDiscordUser().username);

            return players;
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