const debug = require('debug');

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
        const server_in_db = await Server.findOne({ name: server_config.name });

        if (server_in_db);
        else {
            const server_new = new Server({
                name: server_config.name,
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
};