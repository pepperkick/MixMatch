const Rcon = require('rcon-client').Rcon;

const log = require("debug")("app:service:rcon");

module.exports = (app) => {
    async function createRconConnection(host, port, password) {
        try {
            log("Creating connection", host, port);
    
            const rcon = new Rcon({packetResponseTimeout: 1000});
            await rcon.connect({ host, port, password });
    
            log("Connected to", host, port);
            
            return rcon;
        } catch (error) {
            throw (error);
        }
    }

    return { createRconConnection }; 
}