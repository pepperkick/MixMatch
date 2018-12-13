const debug = require('debug');

const Exception = require("./objects/exception");

const log = debug("app:bot");

module.exports = async (app) => {
    const Server = app.connection.model("Server");
    const Player = app.connection.model("Player");
    const Command = app.object.command;

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
            args.message.reply("You have already registered with us!");
        } else {
            args.message.reply(`It seems like you have not registered with us, please visit the following link to register with us so you can enjoy the matches.\nhttp://${app.config.host}:${app.config.port}/auth/discor`)
        }
    });


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

    const servers_status_unknown = await Server.find({ status: Server.status.UNKNOWN });
    for (let server of servers_status_unknown) {
        server.status = Server.status.FREE;

        await server.save();
    }    
    
    const servers_status_free = await Server.find({ status: Server.status.FREE });
    for (let server of servers_status_free) {
        registerCommands(server);
    }

    function registerCommands(server) {
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

    async function addPlayerServer(args, server, player_id) {
        try {
            await server.addPlayer(player_id);            
            await args.message.reply('You have successfully joined the queue');
        } catch (error) {
            log(`Failed to add player ${player_id} to server ${server.name}`);
            log(error);

            if (error.code === "SERVER_NOT_FREE") {
                await args.message.reply("Cannot join the queue at the moment.");
            } else if (error.code === "PLAYER_ALREADY_IN_CURRENT_QUEUE") {                
                await args.message.reply("You have already joined this queue.");
            } else if (error.code === "PLAYER_ALREADY_IN_QUEUE") {
                await args.message.reply("You have already joined a queue.");
            } else if (error.code === "PLAYER_NOT_FOUND") {
                await args.message.reply('Unable to process your request, please make sure that you have registered with the bot');
            } else {
                await args.message.reply('Failed due to internal error, please try again later.');
            }
        }
    }

    async function removePlayerServer(args, server, player_id) {
        try {
            await server.removePlayer(player_id);            
            await args.message.reply('You have successfully left the queue');
        } catch (error) {
            log(`Failed to remove player ${player_id} from server ${server.name}`);
            log(error);

            if (error.code === "SERVER_NOT_FREE") {
                await args.message.reply("Cannot join the queue at the moment.");
            }else if (error.code === "PLAYER_NOT_IN_CURRENT_QUEUE") {                
                await args.message.reply("You have not joined this queue.");
            } else if (error.code === "PLAYER_NOT_IN_QUEUE") {
                await args.message.reply("You have not joined any queue.");
            } else if (error.code === "PLAYER_NOT_FOUND") {
                await args.message.reply('Unable to process your request, please make sure that you have registered with the bot');
            } else {
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
                if (!server_config.formats[i].hidden) {
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
            await args.message.reply(`Successfully changed the server format to ${format}`);
        } catch (error) {
            log(`Failed to change format of server ${server.name} to ${format}`);
            log(error);

            if (error.code === "FORMAT_NOT_SUPPORTED") {
                await args.message.reply(`That format is currently not supported by the queue.`);
            } else if (error.code === "FORMAT_SAME") {
                await args.message.reply(`Queue is already in that format`);                
            } else if (error.code === "SERVER_NOT_FREE") {
                await args.message.reply("Cannot change the format at the moment.");                
            } else if (error.code === "QUEUE_NOT_FREE") {
                await args.message.reply("Cannot change the format as players are in queue.");                
            } else {
                await args.message.reply('Failed due to internal error, please try again later.');
            }
        }
    }
};