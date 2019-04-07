const Exception = require("../objects/exception");

const log = require('debug')('app:models:queue');

module.exports = (schema) => {
    const statuses = Object.freeze({
        FREE: 'FREE',
        ASSIGNING: 'ASSIGNING',
        BLOCKED: 'BLOCKED'
    });

    schema.add({
        status: {
            type: String,
            enum: Object.values(statuses),
            default: statuses.FREE
        }
    });

    schema.statics.status = statuses;

    schema.statics.findByName = async function (name) {
        return await this.findOne({ name });
    }

    schema.methods.setStatus = async function (status) {
        this.status = status;
        
        await this.save();
        
        log(`Queue ${this.name}'s status changed to ${this.status}`);
    }

    schema.methods.setFormat = async function (format) {
        this.format = format;

        await this.save();

        log(`Queue ${this.name}'s format changed to ${this.format}`);
    }

    schema.methods.isFree = function () {
        return this.status === statuses.FREE;
    }

    schema.methods.addPlayer = async function (player) {
        player = await this.model('Player').checkOrGet(player);
        player = await player.populate("queue").execPopulate();

        if (!player)
            throw new Exception("PLAYER_NOT_FOUND", `Player ${player.id} not found!`);

        if (player.queue && player.queue.id == this.id) 
            throw new Exception("PLAYER_ALREADY_IN_CURRENT_QUEUE", `Player ${player.id} is already in current queue`);

        if (player.queue !== null) 
            throw new Exception("PLAYER_ALREADY_IN_QUEUE", `Player ${player.id} is already in queue ${player.queue.id}`);

        if (!this.isFree())
            throw new Exception("QUEUE_NOT_FREE", `Queue status is currently ${this.status} which needs to be ${statuses.FREE} for player to join.`);

        this.players.push(player.id);

        log(`${this.name}: Added Player ${player.id} (${player.discord})`);

        await player.joinQueue(this);
        await this.save();

        return true;
    }

    schema.methods.removePlayer = async function (player, force = false) {
        player = await this.model('Player').checkOrGet(player);
        player = await player.populate("queue").execPopulate();

        if (!force) {
            if (player.queue === null) 
                throw new Exception("PLAYER_NOT_IN_QUEUE", `Player ${player.id} is not in any queue`);

            if (player.queue && player.queue.id != this.id) 
                throw new Exception("PLAYER_NOT_IN_CURRENT_QUEUE", `Player ${player.id} is not in current queue`);

            if (!this.isFree())
                throw new Exception("QUEUE_NOT_FREE", `Queue status is currently ${this.status} which needs to be ${statuses.FREE} for player to join.`);
        }

        for (const i in this.players) {
            if (this.players[i].toString() === player.id.toString()) {
                this.players.splice(i, 1);

                break;
            }
        }

        await player.leaveQueue();
        await this.save();

        log(`${this.name}: Removed Player ${player.id} (${player.discord})`);

        return true;
    }
    
    schema.methods.reset = async function () {
        await this.setStatus(statuses.BLOCKED);

        for (const player of this.players) {
            await this.removePlayer(player, true);
        }

        await this.save();
    }

    schema.methods.changeFormat = async function (format) {
        if (this.format === format)
            throw new Exception("FORMAT_SAME", `Queue format is already ${format}`);

        if (!this.isFree())
            throw new Exception("QUEUE_STATUS_NOT_FREE", `Queue status is currently ${this.status} which needs to be ${statuses.FREE} for player to join.`);

        if (this.players.length !== 0)
            throw new Exception("QUEUE_NOT_FREE", `Queue's queue currently has players, the Queue format cannot change while players still in queue. `);

        this.format = format;

        await this.save();
    }

    schema.methods.sendDiscordMessage = async function (options) {        
        const message = await this.getDiscordTextChannel().send(options.text ? options.text : '', options.embed ? { embed: options.embed } : null);

        if (!message) {
            throw new Error(`Failed to send message to queue channel ${this.name}`);
        }

        return message;
    }

    schema.methods.divideTeams = async function (server, format) {      
        const Player = await this.model('Player');
        const config = this.getConfig();
        const players = {};

        for (let i = 0; i < format.size * 2; i++) {
            const player = await Player.findById(this.players.pop());

            if (i % 2 === 0) {
                players[player.id] = {
                    team: "A"
                }

                await player.discordMember.addRole(config.teams.A.role);
            } else {
                players[player.id] = {
                    team: "B"
                }

                await player.discordMember.addRole(config.teams.B.role);
            }
            
            await this.removePlayer(player);
            await player.discordMember.addRole(server.role);
            await server.commands.plugin.addPlayer(player.steam, i%2, player.getDiscordUser().username);
        }
        
        return players;
    }

    schema.post('save', async function (queue) {
        const Queue = queue.model("Queue");
        const Server = queue.model("Server");
        const Match = queue.model("Match");

        const config = queue.getConfig();
        const format = config.formats[queue.format];
        
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
            try {
                if (queue.players.length === 0) {
                    await queue.discordRole.setName(`${queue.name}: Empty`);
                } else {
                    await queue.discordRole.setName(`${queue.name}: Queuing (${queue.players.length}/${format.size * 2})`);
                }
            } catch (error) {
                log(`Failed to set role name for Queue ${queue.name}`, error);
            }

            if (queue.players.length >= format.size * 2) {        
                log(`Enough players have joined ${queue.name}, finding a free server.`);
                
                const server = await Server.findFreeServer();

                if (!server) throw new Error("No free server found!");

                const players = await queue.divideTeams(server, format); 
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
        } else if (queue.status === Queue.status.BLOCKED) {
            try {
                await queue.discordRole.setName(`${queue.name}: Blocked`);
                
                setTimeout(() => queue.setStatus(Queue.status.UNKNOWN), 30000);
            } catch (error) {
                log(`Failed to set role name for Queue ${queue.name}`, error);
            }
        }
    });
}