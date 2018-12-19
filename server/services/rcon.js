const Rcon = require('rcon-client').Rcon;

const log = require("debug")("app:service:rcon");

let cache = {};

module.exports = (app) => {
    async function createRconConnection(host, port, password) {
        try {
            log("Creating connection", host, port);
    
            if (cache[`${host}:${port}`]) return cache[`${host}:${port}`];

            const rcon = new Rcon({packetResponseTimeout: 1000});
            await rcon.connect({ host, port, password });
            cache[`${host}:${port}`] = rcon;
    
            log("Connected to", host, port);
            
            return rcon;
        } catch (error) {
            throw (error);
        }
    }

    function get(ip, port) {
        return cache[`${ip}:${port}`];
    }

    async function disconnect(ip, port) {
        await cache[`${this.ip}:${this.port}`].disconnect();
    }

    async function disconnectAll() {        
        for (const key in cache) {
            await cache[key].disconnect();
        }

        cache = {};
    }

    return { createRconConnection, get, disconnect, disconnectAll }; 
}