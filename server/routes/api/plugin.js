const express = require('express');

const log = require('debug')('app:routes:api:plugin');

module.exports = (app) => {
    const Queue = app.connection.model("Queue");
    const Player = app.connection.model("Player");
    const router = express.Router();

    async function checkQueueName(req, res, next) {
        const name = req.query.name;

        try {
            if (!name) {
                throw new Error('No queue name was given');
            }
    
            const queue = await Queue.findByName(name);
    
            if (!queue) {
                throw new Error(`No queues were found with name '${name}'`);
            }

            req.queue = queue;

            next();
        } catch (error) {
            log(`Failed to process request due to error`, error);

            res.sendStatus(404);
        }
    }

    router.get('/status_change', checkQueueName, async (req, res, next) => {
        const status = req.query.status.toUpperCase();

        try {
            if (!status) {
                throw new Error('No queue status was given');
            }

            log(`API Call for status_change: ${req.queue.name} (${req.queue.status}) ${status}`);
            
            if (req.queue.status === Queue.status.COOLDOWN && status === Queue.status.FREE) {
                log(`Server ${req.queue.name} is cleared.`);
        
                await req.queue.setStatus(status);
            } else if (req.queue.status === Queue.status.SETUP && status === Queue.status.WAITING) {
                log(`Setup for server ${req.queue.name} is done.`);
        
                await req.queue.setStatus(status);
            } else if (req.queue.status === Queue.status.WAITING && status === Queue.status.LIVE) {
                log(`Server ${req.queue.name} is now live.`);
        
                await req.queue.setStatus(status);
            } else if (req.queue.status === Queue.status.LIVE && status === Queue.status.ENDED) {
                log(`Match in server ${req.queue.name} has ended.`);
        
                await req.queue.setStatus(status);
            } else if (req.queue.status === Queue.status.ENDED && status === Queue.status.FREE) {
                log(`Server ${req.queue.name} is now free.`);
        
                await req.queue.reset();
            }
    
            res.sendStatus(200);
        } catch (error) {
            log(`Failed to change Queue status due to error`, error);

            res.sendStatus(404);
        }
    });

    router.get('/player_connected', checkQueueName, async (req, res, next) => {
        const id = req.query.id;

        try {
            if (!id) {
                throw new Error('No player steam id was given');
            }

            const player = await Player.findBySteam(id);

            if (!player) {
                throw new Error(`No player found with it ${id}`);
            }

            log(`API Call for player_connected: ${req.queue.name} ${id}`);

            app.emit("server_player_connected", {
                queue: req.queue,
                player
            });

            res.sendStatus(200);
        } catch (error) {
            log(`Failed to process player connected call due to error`, error);

            res.sendStatus(404);
        }
    });

    router.get('/player_ready', checkQueueName, async (req, res, next) => {
        const id = req.query.steam;
        const client = req.query.client;

        try {
            if (!id) {
                throw new Error('No player steam id was given');
            }

            if (!client) {
                throw new Error('No player client id was given');
            }

            const player = await Player.findBySteam(id);

            if (!player) {
                throw new Error(`No player found with it ${id}`);
            }

            const voiceChannel = player.discordMember.voiceChannelID;
            const playerTeam = await player.server.team;

            log(`API Call for player_ready: ${req.queue.name} ${id}`);

            if (player.queue.status === Queue.status.WAITING);
            else return log(`Ignored as server status is not WAITING`);
    
            if (playerTeam === "A" && voiceChannel === app.config.queues[req.queue.name].voiceChannelA) {
                await req.queue.rconConn.send(`mx_ready_player ${client}`);
                await req.queue.rconConn.send(`mx_send_player_chat ${client} "Marked as ready!"`);
 
                res.sendStatus(200);
            } else if (playerTeam === "B" && voiceChannel === app.config.queues[req.queue.name].voiceChannelB) {
                await req.queue.rconConn.send(`mx_ready_player ${client}`);
                await req.queue.rconConn.send(`mx_send_player_chat ${client} "Marked as ready!"`);
 
                res.sendStatus(200);
            } else {
                await req.queue.rconConn.send(`mx_send_player_chat ${client} "Please join your team's voice channel in discord and then use the !ready command."`);
 
                res.sendStatus(200);
            }
        } catch (error) {
            log(`Failed to process player ready call due to error`, error);
            res.sendStatus(404);
        }
    });

    return router;
}