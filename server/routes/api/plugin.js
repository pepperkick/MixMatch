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
                throw new Error('No queue name were given');
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
        const status = req.query.status;

        try {
            if (!status) {
                throw new Error('No Queue status were given');
            }

            log(`API Call for status_change: ${req.queue.name} ${status}`);
            
            if (req.queue.status === Queue.status.SETUP && status === Queue.status.WAITING) {
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
                throw new Error('No player steam id were given');
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

    return router;
}