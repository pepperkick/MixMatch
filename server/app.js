const express = require('express');
const servgen = require('@abskmj/servgen');
const debug = require('debug');
const bodyParser = require('body-parser');

const bot  = require('./bot');

const router = require('./routes/index');
const events = require('./events/index');

const log = debug("app:main");

module.exports.init = async() => {
    // initialize services
    let app = new express();
    
    await servgen.init(app, __dirname + '/services');

    const Queue = app.connection.model("Queue");
    
    // attach bot
    bot(app);

    // attach events
    events(app);
    
    // attach routes
    app.use(router(app));
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({
        extended: true
    })); 
    
    app.listen(app.config.port);
    
    log('application listening on port', app.config.port);

    
    process.on('uncaughtException',  async (error) => {
        log('Caught exception: ', error, error.stack);

        if (error.code === "ECONNREFUSED" && error.address && error.port) {
            const queue = await Queue.findByIp(error.address, error.port);

            if (queue) {
                setTimeout(() => queue.setStatus(Queue.status.UNKNOWN), 30000);
                
                return;
            }
        }
        
        if (error.code === "ETIMEDOUT" && error.address && error.port) {
            const queue = await Queue.findByIp(error.address, error.port);

            if (queue) {
                setTimeout(() => queue.setStatus(Queue.status.UNKNOWN), 30000);
                
                return;
            }
        }
        
        if (error.code === "ECONNRESET") {
            return app.rcon.disconnectAll();
        }
        
        await generateErrorReport({
            type: "Uncaught Exception",
            error
        });

        process.exit(9);
    });

    process.on('unhandledRejection', async (reason, promise) => {
        log('Caught Rejection: ', promise, "Reason: ", reason.message);

        if (reason.message.includes("Response timeout for packet id")) {
            log("RCON Error", reason.message);

            app.rcon.disconnectAll();
        }

        // await generateErrorReport({
        //     type: "Uncaught Rejection",
        //     promise: JSON.stringify(promise),
        //     reason
        // });
    });

    async function generateErrorReport(parameters) {
        const ReferenceNumber = Math.floor(Math.random() * (10000 - 0) + 0);
        
        try {
            const config = app.config.discord;
            const errorChannel = config.channels.error;
            const channel = await app.discord.bot.channels.get(errorChannel);
            const fields = [];
            
            if (!channel) {
                throw new Error(`Unable to find error log channel with id ${errorChannel}`);
            }
            
            for (let name in parameters) {
                fields.push({
                    name,
                    value: parameters[name],
                    inline: true
                })
            }
            
            await channel.send('', {
                embed: {
                    color: 0xf44336,
                    title: `Error Report`,
                    description: `Reference Number: #${ReferenceNumber}`,
                    fields,
                    timestamp: new Date()
                }
            });
        } catch (error) {
            log(`${error}`);
            log(`============== ERROR REPORT #${ReferenceNumber} ================`);
            for (let name in parameters) {
                log(`${name}:\t${parameters[name]}`);
            }
            log("Date:\t", new Date());
            log(`============== REPORT END #${ReferenceNumber}  =================`);
        }
        
        return ReferenceNumber;
    };

    return app;
}
