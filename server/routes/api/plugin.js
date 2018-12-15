const express = require('express');

module.exports = (app) => {
    const Server = app.connection.model("Server");
    const Player = app.connection.model("Player");
    const router = express.Router();

    router.get('/status_change', async (req, res, next) => {
        log(req.query);

        const name = req.query.name;
        const status = req.query.status;

        try {
            if (!name) {
                throw new Error('No server name were given');
            }
    
            if (!status) {
                throw new Error('No server status were given');
            }
    
            const server = await Server.findByName(name);
    
            if (!name) {
                throw new Error(`No server were found with name ${name}`);
            }
            
            log(`API Call for status_change: ${name} ${status}`);
    
            await server.setStatus(status);
    
            res.status(200);
        } catch (error) {
            log(`Failed to change server status due to ${error}`);

            res.status(404);
        }
    });

    return router;
}