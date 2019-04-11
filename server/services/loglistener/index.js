const Event = require('events');
const logReceiver = require("srcds-log-receiver");
const debug = require("debug");

const events = require("../events.json");

const log = debug('app:service:log-listener');
const em = new Event.EventEmitter();

module.exports = app => {
    const Server = app.connection.model("Server");
    const options = {
        port: app.config.udpListener,
        address: app.config.host,
        requirePassword: false
    };
    
    const receiver = new logReceiver.LogReceiver(options);

    receiver.on('data', function (data) {
        const ip = `${data.receivedFrom.address}:${data.receivedFrom.port}`;
        let line = data.message;       

        line = `${ip} - ${line}`;

        processLine(line);
    });

    receiver.on("invalid", function(invalidMessage) {
        log(`Got some completely unparseable gargbase: ${invalidMessage}`);
    })
    
    async function processLine(raw) {
        const line = {};

        try {
            line.date = raw.match(/[0-3][0-9].[0-3][0-9].[2][0][0-9][0-9]/)[0];
            line.time = raw.match(/[0-2][0-9]:[0-9][0-9]:[0-9][0-9]/)[0];
            line.event = raw.split(' - ')[2];
            line.ip = raw.split(" - ")[0];
            line.raw = raw;

            line.event = line.event.substring(line.time.length + 2, line.event.length);
        
            if (!line.date || !line.time || !line.raw) {
                throw new Error('Unknown line');
            }
        
            em.emit("rawLine", line);
        
            await checkEvents(line);
        } catch (error) {
            log("Error processing line", error);
        }
    }

    async function checkEvents(line) {
        const server = await Server.findByIp(line.ip);

        events.forEach((event) => {
            const regex = new RegExp(event.line, 'i');
            const match = line.event.match(regex);
            const data = {};

            if (match !== null) {
                if (event.arguments) {
                    for (let index = 0; index < event.arguments.length; index += 1) {
                        data[event.arguments[index]] = match[index + 1];
                    }
                }

                log(`Log Event fired: (${server.name}) ${event.name}`);
                line.data = data;
        
                if (server) {
                    if (server[`Log_${event.name}`])
                        server[`Log_${event.name}`](line);
                }

                em.emit(event.name, line);
            }
        }, this);
    }
}