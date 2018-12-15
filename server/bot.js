const debug = require('debug');
const Rcon = require('rcon-client').Rcon;

const Exception = require("./objects/exception");

const log = debug("app:bot");
const conns = {};

module.exports = async (app) => {
    const Server = app.connection.model("Server");
    const Player = app.connection.model("Player");
    const Command = app.object.command;
    const Discord = app.discord;

    Command.Register({ 
        command: 'ping'
    }, (args) => {
        args.message.reply("Pong!");
    });

    Command.Register({ 
        command: 'register'
    }, async (args) => {
        const player = await Player.findByDiscord(args.message.author.id);

        if (player) {
            await args.message.reply("You have already registered with us!");
        } else {
            await args.message.reply(`It seems like you have not registered with us, please visit the following link to register with us so you can enjoy the matches.\nhttp://${app.config.host}:${app.config.port}/auth/discor`)
        }
    });

    checkServers();

    Server.events.on("update", onServerUpdate);

    async function checkServers() {
        const servers = app.config.servers;
        for (let name in servers) {
            const server_config = servers[name];
            const server_in_db = await Server.findOne({ name });
    
            if (server_in_db);
            else {
                const server_new = new Server({
                    name,
                    ip: server_config.ip,
                    port: server_config.port,
                    rcon: server_config.rcon,
                    channel: server_config.channel,
                    format: server_config.formats[0]
                });
    
                try {
                    await server_new.save();
                } catch (error) {
                    log(`Failed to save server ${name} due to error`);
                    log(error);
                }
            }
        }
    
        const servers_db = await Server.find();
        for (let server of servers_db) {
            await server.setStatus(Server.status.UNKNOWN);

            server.discord_channel = await Discord.getGuildChannel(app.config.discord.guild, server.channel);
        }

        const guild = await Discord.getGuild(app.config.discord.guild);
        const players_db = await Player.find();
        for (let player of players_db) {
            player.discord_user = await Discord.getMember(app.config.discord.guild, player.discord);

            if (player.discord === guild.ownerID) {
                player.owner = true;
            }
        }
    }

    async function onServerUpdate(server) {
        if (server.status === Server.status.UNKNOWN) {
            try {
                server.conn = await createRconConnection(server.ip, server.port, server.rcon);

                log(`${server.name} RCON connected`);
        
                if (await checkPluginVersion(server)) {        
                    const server_status = await server.sendRconCommand("cc_getstatus");

                    if (server_status.includes("setup")) {
                        await server.setStatus(Server.status.SETUP);
                    } else {
                        await server.setStatus(Server.status.FREE);
                    }
                } else {
                    log(`Server plugin version does not match with ${app.config.plugin.version}`);
    
                    await server.setStatus(Server.status.OUTDATED);
                }
            } catch (error) {
                log(error);
                log(`${server.name} RCON disconnected`);

                setInterval(async () => await server.setStatus(Server.status.UNKNOWN), 10000);
            }
        } else if (server.status === Server.status.FREE) {
            const format = app.config.formats[server.format];

            if (server.players.length >= format.size * 2) {        
                log(`Enough players have joined ${server.name}, switching status to SETUP`);

                await server.sendRconCommand('cc_reset');
                await server.sendRconCommand(`cc_setstatus ${Server.status.SETUP}`);         
                await divideTeams(server, format);       
                await server.setStatus(Server.status.SETUP);
            }
        } else if (server.status === Server.status.SETUP) {

        }

        registerCommands(server);
    }

    function registerCommands(server) {
        if (server.status === server.commands_status) return;
        else server.commands_status = server.status;

        if (server.status === Server.status.FREE) {
            Command.Register({ 
                command: 'join',
                channel: server.channel,
                role: [ app.config.discord.roles.player ]
            }, async (args) => {
                await addPlayerServer(args, server, args.message.author.id)
            });

            Command.Register({ 
                command: 'leave',
                channel: server.channel,
                role: [ app.config.discord.roles.player ]
            }, async (args) => {
                await removePlayerServer(args, server, args.message.author.id)
            });

            Command.Register({ 
                command: 'format',
                channel: server.channel,
                role: [ app.config.discord.roles.admin ]
            }, async (args) => {
                await changeServerFormat(args, server)
            });
        }
    
        Command.Register({ 
            command: 'reset',
            channel: server.channel,
            role: [ app.config.discord.roles.admin ]
        }, async (args) => {
            await resetServer(args, server)
        });

        Command.Register({ 
            command: 'status',
            channel: server.channel,
            role: [ app.config.discord.roles.player ]
        }, async (args) => {
            await getServerStatus(args, server)
        });
    }

    async function addPlayerServer(args, server, player_id) {
        try {
            const player = await Player.findByDiscord(player_id);
            
            await server.addPlayer(player);            
            await args.message.reply('You have successfully joined the queue');
        } catch (error) {
            log(`Failed to add player ${player_id} to server ${server.name}`);

            if (error.code === "SERVER_NOT_FREE") {
                await args.message.reply("Cannot join the queue at the moment.");
            } else if (error.code === "PLAYER_ALREADY_IN_CURRENT_QUEUE") {                
                await args.message.reply("You have already joined this queue.");
            } else if (error.code === "PLAYER_ALREADY_IN_QUEUE") {
                await args.message.reply("You have already joined a queue.");
            } else if (error.code === "PLAYER_NOT_FOUND") {
                await args.message.reply('Unable to process your request, please make sure that you have registered with the bot');
            } else {
                log(error);

                await args.message.reply('Failed due to internal error, please try again later.');
            }
        }
    }

    async function removePlayerServer(args, server, player_id) {
        try {
            const player = await Player.findByDiscord(player_id);

            await server.removePlayer(player);            
            await args.message.reply('You have successfully left the queue');
        } catch (error) {
            log(`Failed to remove player ${player_id} from server ${server.name}`);

            if (error.code === "SERVER_NOT_FREE") {
                await args.message.reply("Cannot join the queue at the moment.");
            }else if (error.code === "PLAYER_NOT_IN_CURRENT_QUEUE") {                
                await args.message.reply("You have not joined this queue.");
            } else if (error.code === "PLAYER_NOT_IN_QUEUE") {
                await args.message.reply("You have not joined any queue.");
            } else if (error.code === "PLAYER_NOT_FOUND") {
                await args.message.reply('Unable to process your request, please make sure that you have registered with the bot');
            } else {
                log(error);

                await args.message.reply('Failed due to internal error, please try again later.');
            }
        }
    }

    async function changeServerFormat(args, server) {
        const server_config = app.config.servers[server.name];
        const format = args.parameters[1];

        if (!format) {
            let format_list = "";
            let format_show;
            let count = 1;

            for (let i in server_config.formats) {
                if (!app.config.formats[server_config.formats[i]].hide) {
                    format_list += `${count}: ${server_config.formats[i]}\n`;

                    if (!format_show) format_show = server_config.formats[i];

                    count++;
                }
            }

            return await args.message.reply(`\nCurrently supported formats are\n${format_list}\nYou can use the command like \`!format ${format_show}\``);    
        }

        try {
            if (!server_config.formats.includes(format)) {
                throw new Exception("FORMAT_NOT_SUPPORTED", `The format ${format} is not supported by queue ${server.name}`);
            }

            await server.changeFormat(format);
            await args.message.reply(`Successfully changed the queue format to ${format}`);
        } catch (error) {
            log(`Failed to change format of server ${server.name} to ${format}`);

            if (error.code === "FORMAT_NOT_SUPPORTED") {
                await args.message.reply(`That format is currently not supported by the queue.`);
            } else if (error.code === "FORMAT_SAME") {
                await args.message.reply(`Queue is already in that format`);                
            } else if (error.code === "SERVER_NOT_FREE") {
                await args.message.reply("Cannot change the format at the moment.");                
            } else if (error.code === "QUEUE_NOT_FREE") {
                await args.message.reply("Cannot change the format as players are in queue.");                
            } else {
                log(error);

                await args.message.reply('Failed due to internal error, please try again later.');
            }
        }
    }

    async function getServerStatus(args, server) {
        try {
            const fields = [];
            const format = server.format;
            
            const embed = {
                color: 0x00BCD4,
                title: `Server ${server.name}`,
                fields,
                timestamp: new Date()
            }

            if (server.status === Server.status.FREE) {
                fields.push({
                    name: 'Status',
                    value: 'Waiting for enough players to join'
                });
            } else if (server.status === Server.status.SETUP) {
                fields.push({
                    name: 'Status',
                    value: 'Setting up the server'
                });
            }

            if (server.status === Server.status.FREE) {
                fields.push({
                    name: 'Format',
                    value: format,
                    inline: true
                });        

                fields.push({
                    name: 'Number of Players',
                    value: `${server.players.length} / ${app.config.formats[format].size * 2}`,
                    inline: true
                });
            } else if (server.status === Server.status.SETUP) {
                fields.push({
                    name: 'Format',
                    value: format
                });        
            }

            if (server.status === Server.status.FREE) {
                if (server.players.length === 0) {
                    fields.push({
                        name: 'Players',
                        value: 'No players have currently joined'
                    });
                } else {
                    let players = '';

                    for (const player_id of server.players) {
                        const player = await Player.findById(player_id);
                        const user = await Discord.getUser(player.discord);

                        players += `${user.username}\n`;
                    }

                    fields.push({
                        name: 'Players',
                        value: players
                    });
                }
            } else if (server.status === Server.status.SETUP) {
                let players_teamA = '';
                let players_teamB = '';

                for (const player_id of server.teamA) {
                    const player = await Player.findById(player_id);
                    const user = await Discord.getUser(player.discord);

                    players_teamA += `${user.username}\n`;
                }

                for (const player_id of server.teamB) {
                    const player = await Player.findById(player_id);
                    const user = await Discord.getUser(player.discord);

                    players_teamB += `${user.username}\n`;
                }

                fields.push({
                    name: 'Team A',
                    value: players_teamA,
                    inline: true
                });

                fields.push({
                    name: 'Team B',
                    value: players_teamB,
                    inline: true
                });
            }

            await Discord.sendToChannel(server.channel, { embed });
        } catch (error) {
            log(`Failed to send status message for server ${server.name}`);
            log(error);
        }
    }

    async function resetServer(args, server) {
        try {
            await server.removeAllPlayers();

            await args.message.reply(`Successfully cleared the queue.`);
        } catch (error) {
            log(`Failed to reset the server ${server.name}`);
            log(error);
        }
    }

    async function divideTeams(server, format) {      
        for (let i = 0; i < format.size * 2; i++) {
            const player = await Player.findById(server.players.pop());
            const member = await Discord.getMember(app.config.discord.guild, player.discord);

            if (i % 2 === 0) {
                server.teamA.push(player.id);
            } else {
                server.teamB.push(player.id);
            }
            
            await server.sendRconCommand(`cc_addplayer ${player.steam} ${i%2} ${member.user.username}`);
        }
    }

    async function createRconConnection(host, port, password) {
        const rcon = new Rcon({packetResponseTimeout: 1000});
        await rcon.connect({ host, port, password });
        return rcon;
    }

    async function checkPluginVersion(server) {
        let version = await server.sendRconCommand('cc_version');
    
        return version.includes(app.config.plugin.version);
    }
};