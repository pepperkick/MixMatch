const Event = require('events');
const debug = require('debug');

const events = require("./events.json");

const log = debug('app:service:log-listener');
const em = new Event.EventEmitter();

let Server;

module.exports = app => {
    Server = app.connection.model("Server");

    app.post("/log_listener", (req, res) => {
        const ip = req.connection.remoteAddress.split(`:`).pop();

        req.on("data", async chunk => {
            let line = chunk.toString();            
            const lines = line.split("\n");

            for (let i in lines) {
                if (lines[i] === "") continue;

                lines[i] = `${ip} - ${lines[i]}`;

                await processLine(lines[i]);
            }
        });

        req.on("end", () => {
        });

        return res.sendStatus(200);
    });

    return em;
}

async function processLine(raw) {
    const line = {};

    try {
        line.date = raw.match(/[0-3][0-9].[0-1][0-9].[2][0][0-9][0-9]/)[0];
        line.time = raw.match(/[0-2][0-9]:[0-9][0-9]:[0-9][0-9]/)[0];
        line.event = raw.split(' - ')[3];
        line.server = raw.split(" - ")[0];
        line.raw = raw;
    
        if (!line.date || !line.time || !line.raw) {
            throw new Error('Unknown line');
        }
    
        em.emit("rawLine", line);
    
        await checkEvents(line);
    } catch (error) {
        log(error);
    }
}

async function checkEvents(line) {
    const server = await Server.findByIp(line.server);

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

            log(`Log Event fired: ${event.name}`);
            line.data = data;
    
            if (server) {
                server.events.emit(`Log_${event.name}`, line);
            }

            em.emit(event.name, line);
        }
    }, this);
}