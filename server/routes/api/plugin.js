const express = require('express');

const log = require('debug')('app:routes:api:plugin');

module.exports = (app) => {
    const Server = app.connection.model("Server");
    const Player = app.connection.model("Player");
    const router = express.Router();

    async function checkServerName(req, res, next) {
        const name = req.query.name;

        try {
            if (!name) {
                throw new Error('No server name were given');
            }
    
            const server = await Server.findByName(name);
    
            if (!server) {
                throw new Error(`No server were found with name '${name}'`);
            }

            req.server = server;

            next();
        } catch (error) {
            log(`Failed to process request due to error`, error);

            res.sendStatus(404);
        }
    }

    router.get('/status_change', checkServerName, async (req, res, next) => {
        const status = req.query.status;

        try {
            if (!status) {
                throw new Error('No server status were given');
            }

            log(`API Call for status_change: ${name} ${status}`);
            
            if (req.server.status === Server.status.SETUP && status === Server.status.WAITING) {
                log(`Setup for server ${req.server.name} is done!`);
        
                await req.server.setStatus(status);
            }
    
            res.sendStatus(200);
        } catch (error) {
            log(`Failed to change server status due to error`, error);

            res.sendStatus(404);
        }
    });

    router.get('/player_connected', checkServerName, async (req, res, next) => {
        const id = req.query.id;

        try {
            if (!id) {
                throw new Error('No player steam id were given');
            }

            const player = await Player.findBySteam(id);

            app.emit("server_player_connected", {
                server: req.server,
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